#!/usr/bin/env python3
"""pipeline/fetch_firms.py — FIRMS VIIRS detections -> monthly fire series + yearly fire-cell GeoJSON (P1).

    python pipeline/fetch_firms.py --scope canada|fraser|usa|yukon|russia|amur|all

Input: every CSV in pipeline/raw/firms/<country>/ (FIRMS yearly country files, VIIRS S-NPP 375 m; columns
include latitude, longitude, acq_date, frp, confidence and maybe type). Files are read in chunks with usecols.
Each country file is processed once for the country scope AND its basin scope (inside the basin bbox):
  - filter 2012-01-01..2025-12-31, confidence != 'l' (low), type == 0 (vegetation fire) when the column
    exists, drop exact duplicates (latitude, longitude, acq_date, acq_time);
  - monthly: fire_count = detections, fire_frp = sum of frp, full 168-month index with 0 where none
    -> processed/<scope path>/fire_monthly.csv;
  - yearly cells: g = 0.5° (country) / 0.1° (basin); cell centre = floor(x/g)*g + g/2; count, frp_sum
    (1 decimal), first and last acq_date -> processed/<scope path>/fires/<year>.geojson (3 decimals).
    Budget: country < 250 KB (drop cells with count < 5, then fall back to g = 1.0), basin < 80 KB
    (drop cells with count == 1); a warning is printed whenever a fallback is used.
Prints rows kept per year and the top 3 years by annual fire_frp per scope.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline import common  # noqa: E402

USECOLS = ["latitude", "longitude", "acq_date", "acq_time", "frp", "confidence", "type"]
BUDGET = {"country": 250_000, "basin": 80_000}
CHUNK = 500_000


def read_country(country: str) -> pd.DataFrame:
    folder = common.RAW / "firms" / country
    files = sorted(folder.glob("*.csv"))
    if not files:
        print(f"WARNING no FIRMS files in {folder.relative_to(common.ROOT)}")
        return pd.DataFrame(columns=["latitude", "longitude", "acq_date", "acq_time", "frp"])
    parts = []
    for f in files:
        header = pd.read_csv(f, nrows=0).columns.tolist()
        cols = [c for c in USECOLS if c in header]
        for chunk in pd.read_csv(f, usecols=cols, chunksize=CHUNK, dtype={"confidence": "string", "acq_time": "string"}, low_memory=True):
            chunk["acq_date"] = pd.to_datetime(chunk["acq_date"], errors="coerce")
            chunk = chunk[(chunk["acq_date"] >= "2012-01-01") & (chunk["acq_date"] <= "2025-12-31")]
            if "confidence" in chunk:
                chunk = chunk[chunk["confidence"].str.lower().str[0].ne("l").fillna(True)]
            if "type" in chunk:
                chunk = chunk[pd.to_numeric(chunk["type"], errors="coerce").fillna(0) == 0]
            chunk = chunk.dropna(subset=["latitude", "longitude", "acq_date"])
            keep = ["latitude", "longitude", "acq_date", "frp"] + (["acq_time"] if "acq_time" in chunk else [])
            parts.append(chunk[keep])
        print(f"  read {f.name}")
    df = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(columns=["latitude", "longitude", "acq_date", "frp"])
    before = len(df)
    df = df.drop_duplicates(subset=[c for c in ["latitude", "longitude", "acq_date", "acq_time"] if c in df.columns])
    df["frp"] = pd.to_numeric(df["frp"], errors="coerce").fillna(0.0)
    print(f"  {country}: {before:,} rows, {len(df):,} after duplicates/filters")
    return df


def monthly_csv(df: pd.DataFrame, out: Path) -> None:
    key = df["acq_date"].dt.strftime("%Y-%m")
    counts = key.value_counts()
    frp = df.groupby(key)["frp"].sum()
    rows = [(m, int(counts.get(m, 0)), round(float(frp.get(m, 0.0)), 1)) for m in common.MONTHS]
    out.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows, columns=["month", "fire_count", "fire_frp"]).to_csv(out, index=False)


def cells(df: pd.DataFrame, g: float) -> pd.DataFrame:
    lon = np.floor(df["longitude"].to_numpy() / g) * g + g / 2
    lat = np.floor(df["latitude"].to_numpy() / g) * g + g / 2
    grp = df.assign(clon=np.round(lon, 3), clat=np.round(lat, 3)).groupby(["clon", "clat"])
    agg = grp.agg(count=("frp", "size"), frp_sum=("frp", "sum"), first=("acq_date", "min"), last=("acq_date", "max")).reset_index()
    return agg.sort_values("count", ascending=False)


def write_year(scope: dict, year: int, agg: pd.DataFrame, out: Path) -> int:
    feats = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [float(r.clon), float(r.clat)]},
              "properties": {"count": int(r.count), "frp_sum": round(float(r.frp_sum), 1),
                             "first": r.first.strftime("%Y-%m-%d"), "last": r.last.strftime("%Y-%m-%d")}} for r in agg.itertuples()]
    return common.write_json({"type": "FeatureCollection", "scope": scope["path"], "year": year, "features": feats}, out, sig=8)


def yearly_files(scope: dict, df: pd.DataFrame) -> None:
    kind = scope["kind"]
    g0 = 0.5 if kind == "country" else 0.1
    for year in common.YEARS:
        sub = df[df["acq_date"].dt.year == year]
        out = common.processed_dir(scope) / "fires" / f"{year}.geojson"
        agg = cells(sub, g0) if len(sub) else cells(df.iloc[0:0], g0)
        size = write_year(scope, year, agg, out)
        if size > BUDGET[kind]:
            agg = agg[agg["count"] >= (5 if kind == "country" else 2)]
            size = write_year(scope, year, agg, out)
            print(f"  WARNING {scope['name']} {year}: over budget, dropped small cells -> {size:,} B")
        if size > BUDGET[kind] and kind == "country":
            agg = cells(sub, 1.0)
            size = write_year(scope, year, agg, out)
            print(f"  WARNING {scope['name']} {year}: still over budget, fell back to 1.0° cells -> {size:,} B")
        if size > BUDGET[kind]:
            agg = agg.head(int(len(agg) * BUDGET[kind] / size * 0.95))
            size = write_year(scope, year, agg, out)
            print(f"  WARNING {scope['name']} {year}: kept the {len(agg)} largest cells -> {size:,} B")
        print(f"  {scope['name']} {year}: {len(sub):,} detections, {len(agg)} cells, {size / 1000:.0f} kB")


def main(argv=None) -> int:
    scopes = common.scope_args(argv, __doc__.splitlines()[0])
    by_country: dict[str, pd.DataFrame] = {}
    for scope in scopes:
        country = scope["country"]
        if country not in by_country:
            print(f"Reading FIRMS files for {country} ...")
            by_country[country] = read_country(country)
        df = by_country[country]
        if scope["kind"] == "basin":
            w, s, e, n = scope["meta"]["bbox"]
            df = df[(df["longitude"] >= w) & (df["longitude"] <= e) & (df["latitude"] >= s) & (df["latitude"] <= n)]
        pdir = common.processed_dir(scope)
        monthly_csv(df, pdir / "fire_monthly.csv")
        yearly_files(scope, df)
        annual = df.groupby(df["acq_date"].dt.year)["frp"].sum().sort_values(ascending=False)
        print(f"{scope['name']}: top 3 years by fire_frp: {[(int(y), round(float(v))) for y, v in annual.head(3).items()]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
