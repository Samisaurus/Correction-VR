#!/usr/bin/env python3
"""pipeline/fetch_air.py — MERRA-2 AOD from Giovanni -> monthly air series + yearly air-cell GeoJSON (P2).

    python pipeline/fetch_air.py --scope canada|fraser|usa|yukon|russia|amur|all

Inputs per scope <s>:
  pipeline/raw/air/<s>_aod_monthly.csv   Giovanni area-averaged monthly series, MERRA-2 TOTEXTTAU
  pipeline/raw/air/<s>_aod_<year>.nc     Giovanni time-averaged map, May 1 – Sep 30 of <year>
  pipeline/raw/air/<s>_pm25_monthly.csv  optional surface PM2.5 monthly series (same Giovanni CSV layout)
Outputs: processed/<scope path>/air_monthly.csv (month, aod, pm25; pm25 empty when no file) and
processed/<scope path>/air/<year>.geojson (< 150 KB):
  basin scope: one Polygon per native 0.5° x 0.625° cell inside the basin bbox;
  country scope: native cells aggregated into 2.0° lat x 2.5° lon blocks (4 x 4 cells, nan-mean, need >= 4
  valid), keeping blocks whose centre lies inside pipeline/raw/geo/<country>_outline.geojson.
Properties { aod (3 decimals), pm25: null }. NaN cells are skipped. A missing year file is a warning.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline import common  # noqa: E402

BUDGET = 150_000
NATIVE_LAT, NATIVE_LON = 0.5, 0.625
BLOCK_LAT, BLOCK_LON = 2.0, 2.5


def monthly(scope: dict) -> None:
    aod_path = common.RAW / "air" / f"{scope['name']}_aod_monthly.csv"
    pm_path = common.RAW / "air" / f"{scope['name']}_pm25_monthly.csv"
    aod = common.read_giovanni_csv(aod_path) if aod_path.exists() else {}
    if not aod_path.exists():
        print(f"  WARNING missing {aod_path.relative_to(common.ROOT)}")
    pm = common.read_giovanni_csv(pm_path) if pm_path.exists() else {}
    out = common.processed_dir(scope) / "air_monthly.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("month,aod,pm25\n")
        for m in common.MONTHS:
            a, p = aod.get(m, float("nan")), pm.get(m, float("nan"))
            fh.write(f"{m},{'' if common.is_null(a) else round(a, 4)},{'' if common.is_null(p) else round(p, 2)}\n")
    valid = sum(1 for m in common.MONTHS if not common.is_null(aod.get(m, float('nan'))))
    print(f"  {scope['name']}: air_monthly.csv written, {valid}/168 AOD months valid, pm25 {'present' if pm else 'absent'}")


def open_map(path: Path):
    """-> (lat 1-D, lon 1-D, values 2-D [lat, lon]) for the single 2-D variable of a Giovanni map."""
    import xarray as xr
    ds = xr.open_dataset(path, decode_times=False)
    lat_name = next(n for n in ds.coords if n.lower().startswith("lat"))
    lon_name = next(n for n in ds.coords if n.lower().startswith("lon"))
    var = next(v for v in ds.data_vars if {lat_name, lon_name} <= set(ds[v].dims))
    da = ds[var].squeeze().transpose(lat_name, lon_name)
    vals = da.values.astype(float)
    vals[(vals >= 1e14) | (vals <= -999)] = np.nan
    return ds[lat_name].values.astype(float), ds[lon_name].values.astype(float), vals


def load_outline(country: str):
    path = common.RAW / "geo" / f"{country}_outline.geojson"
    if not path.exists():
        print(f"  WARNING missing {path.relative_to(common.ROOT)}; keeping all blocks inside the bbox")
        return None
    from shapely.geometry import shape
    from shapely.ops import unary_union
    from shapely.prepared import prep
    gj = json.loads(path.read_text(encoding="utf-8"))
    geoms = [shape(f["geometry"]) for f in gj.get("features", [gj])]
    return prep(unary_union(geoms).buffer(0))


def rect(w, s, e, n):
    return [[[w, s], [e, s], [e, n], [w, n], [w, s]]]


def year_file(scope: dict, year: int, outline) -> None:
    path = common.RAW / "air" / f"{scope['name']}_aod_{year}.nc"
    if not path.exists():
        print(f"  WARNING missing {path.relative_to(common.ROOT)}")
        return
    lat, lon, vals = open_map(path)
    w, s, e, n = scope["meta"]["bbox"]
    feats = []
    if scope["kind"] == "basin":
        for i, la in enumerate(lat):
            for j, lo in enumerate(lon):
                v = vals[i, j]
                if np.isnan(v) or not (w <= lo <= e and s <= la <= n):
                    continue
                feats.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": rect(lo - NATIVE_LON / 2, la - NATIVE_LAT / 2, lo + NATIVE_LON / 2, la + NATIVE_LAT / 2)},
                              "properties": {"aod": round(float(v), 3), "pm25": None}})
    else:
        from shapely.geometry import Point
        bi = np.floor((lat + 90.0) / BLOCK_LAT).astype(int)
        bj = np.floor((lon + 180.0) / BLOCK_LON).astype(int)
        for i in np.unique(bi):
            for j in np.unique(bj):
                block = vals[np.ix_(bi == i, bj == j)]
                ok = ~np.isnan(block)
                if ok.sum() < 4:
                    continue
                x0, y0 = -180.0 + j * BLOCK_LON, -90.0 + i * BLOCK_LAT
                cx, cy = x0 + BLOCK_LON / 2, y0 + BLOCK_LAT / 2
                if not (w <= cx <= e and s <= cy <= n):
                    continue
                if outline is not None and not outline.contains(Point(cx, cy)):
                    continue
                feats.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": rect(x0, y0, x0 + BLOCK_LON, y0 + BLOCK_LAT)},
                              "properties": {"aod": round(float(block[ok].mean()), 3), "pm25": None}})
    out = common.processed_dir(scope) / "air" / f"{year}.geojson"
    size = common.write_json({"type": "FeatureCollection", "scope": scope["path"], "year": year, "features": feats}, out, sig=8)
    flag = "  WARNING over 150 KB" if size > BUDGET else ""
    print(f"  {scope['name']} {year}: {len(feats)} cells, {size / 1000:.0f} kB{flag}")


def main(argv=None) -> int:
    for scope in common.scope_args(argv, __doc__.splitlines()[0]):
        print(f"{scope['name']}:")
        monthly(scope)
        outline = load_outline(scope["country"]) if scope["kind"] == "country" else None
        for year in common.YEARS:
            year_file(scope, year, outline)
    return 0


if __name__ == "__main__":
    sys.exit(main())
