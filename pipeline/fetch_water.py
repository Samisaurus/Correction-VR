#!/usr/bin/env python3
"""pipeline/fetch_water.py — MODIS-Aqua Kd490 and chlorophyll-a at the water bodies of each basin (P3).

    python pipeline/fetch_water.py --scope fraser|yukon|amur|all     (country scopes are skipped)

For each water body <wb> of the basin (regions.json waterBodies):
  preferred: pipeline/raw/water/<wb>_kd490_monthly.csv and <wb>_chlor_monthly.csv (Giovanni area-averaged
             monthly series over the water body bbox);
  fallback:  OB.DAAC Level-3 mapped monthly NetCDF files in pipeline/raw/water/l3m/ whose names contain
             ".L3m.MO." and either Kd_490/KD490 or chlor_a/CHL, with the start date YYYYMMDD (or AYYYYDDD);
             subset to the bbox and take the nan-mean.
Writes processed/<basin path>/water_monthly.csv (month, water_body, kd490, chlor_a) for all 168 months,
blank where unknown (winter ice and cloud gaps are expected), and prints the share of missing May–Sep
months per variable (warning above 40 %).
"""
from __future__ import annotations

import datetime as dt
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline import common  # noqa: E402

L3M = common.RAW / "water" / "l3m"


def l3m_month(name: str) -> str | None:
    m = re.search(r"(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)", name)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    m = re.search(r"A(20\d{2})(\d{3})", name)
    if m:
        d = dt.date(int(m.group(1)), 1, 1) + dt.timedelta(days=int(m.group(2)) - 1)
        return f"{d.year}-{d.month:02d}"
    return None


def l3m_series(var: str, bbox) -> dict[str, float]:
    """Monthly nan-mean of an L3m variable over bbox from every matching file in raw/water/l3m/."""
    if not L3M.exists():
        return {}
    import xarray as xr
    pat = re.compile(r"kd_?490", re.I) if var == "kd490" else re.compile(r"chlor_a|\.CHL\.", re.I)
    out: dict[str, float] = {}
    w, s, e, n = bbox
    for f in sorted(L3M.glob("*.nc")):
        if ".L3m" not in f.name or ".MO" not in f.name or not pat.search(f.name):
            continue
        month = l3m_month(f.name)
        if month is None:
            continue
        ds = xr.open_dataset(f)
        name = next((v for v in ds.data_vars if re.search(r"kd_?490", v, re.I)), None) if var == "kd490" else next((v for v in ds.data_vars if "chlor" in v.lower()), None)
        if name is None:
            continue
        da = ds[name]
        lat = next(c for c in da.dims if c.lower().startswith("lat"))
        lon = next(c for c in da.dims if c.lower().startswith("lon"))
        sub = da.where((da[lat] >= s) & (da[lat] <= n) & (da[lon] >= w) & (da[lon] <= e), drop=True)
        vals = sub.values.astype(float)
        out[month] = float(np.nanmean(vals)) if np.isfinite(vals).any() else float("nan")
    return out


def body_series(wb: dict) -> dict[str, dict[str, float]]:
    series = {}
    for var, tag in (("kd490", "kd490"), ("chlor_a", "chlor")):
        csv = common.RAW / "water" / f"{wb['id']}_{tag}_monthly.csv"
        if csv.exists():
            series[var] = common.read_giovanni_csv(csv)
            print(f"    {wb['id']} {var}: Giovanni CSV")
        else:
            series[var] = l3m_series(var, wb["bbox"])
            print(f"    {wb['id']} {var}: {'L3m NetCDF fallback' if series[var] else 'NO DATA (missing CSV and no L3m files)'}")
    return series


def main(argv=None) -> int:
    for scope in common.scope_args(argv, __doc__.splitlines()[0]):
        if scope["kind"] != "basin":
            continue
        print(f"{scope['name']}:")
        out = common.processed_dir(scope) / "water_monthly.csv"
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w", encoding="utf-8") as fh:
            fh.write("month,water_body,kd490,chlor_a\n")
            for wb in scope["meta"]["waterBodies"]:
                series = body_series(wb)
                for m in common.MONTHS:
                    kd, ch = series["kd490"].get(m, float("nan")), series["chlor_a"].get(m, float("nan"))
                    fh.write(f"{m},{wb['id']},{'' if common.is_null(kd) else round(kd, 4)},{'' if common.is_null(ch) else round(ch, 3)}\n")
                for var in ("kd490", "chlor_a"):
                    open_months = [f"{y}-{mm:02d}" for y in common.YEARS for mm in common.OPEN_MONTHS]
                    missing = sum(1 for m in open_months if common.is_null(series[var].get(m, float("nan"))))
                    share = 100.0 * missing / len(open_months)
                    print(f"    {wb['id']} {var}: {share:.0f} % of May–Sep months missing{'  WARNING > 40 %' if share > 40 else ''}")
        print(f"  -> {out.relative_to(common.ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
