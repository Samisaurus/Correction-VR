#!/usr/bin/env python3
"""pipeline/common.py — shared constants, paths, scope table and loaders (GPT-Data P0, built here).

Scripts always run from the repo root:
    python pipeline/<script>.py --scope canada|fraser|usa|yukon|russia|amur|all

Only numpy and the standard library are imported here, so tools/make_mock.py can reuse it.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "pipeline" / "raw"
PROCESSED = ROOT / "pipeline" / "processed"
DATA = ROOT / "data"
SCHEMAS = ROOT / "contract" / "schemas"

YEARS = list(range(2012, 2026))
MONTHS = [f"{y}-{m:02d}" for y in YEARS for m in range(1, 13)]
OPEN_MONTHS = [5, 6, 7, 8, 9]  # May–Sep: the open-water / fire season used for every seasonal mean
MONTH_INDEX = {m: i for i, m in enumerate(MONTHS)}

# Variable table (ids, labels and units are fixed by the contract; mirrors js/theme.js VARS).
VARIABLES = {
    "fire_count": {"label": "Fire detections (VIIRS)", "unit": "detections", "group": "fire", "digits": 0},
    "fire_frp": {"label": "Fire radiative power", "unit": "MW (annual sum)", "group": "fire", "digits": 0},
    "aod": {"label": "Aerosol optical depth 550 nm", "unit": "unitless", "group": "air", "digits": 3},
    "pm25": {"label": "Surface PM2.5", "unit": "ug/m3", "group": "air", "digits": 1},
    "kd490": {"label": "Water turbidity (Kd490)", "unit": "1/m", "group": "water", "digits": 3},
    "chlor_a": {"label": "Chlorophyll-a", "unit": "mg/m3", "group": "water", "digits": 2},
    "fish_value": {"label": "Salmon landed value", "unit": "million (2024 prices, local currency)", "group": "fish", "digits": 1},
    "fish_catch": {"label": "Salmon catch", "unit": "thousand tonnes", "group": "fish", "digits": 1},
}
WATER_VARS = ("kd490", "chlor_a")
SOURCES = {
    "fire_count": "NASA FIRMS, VIIRS S-NPP 375 m active fire detections (confidence nominal/high)",
    "fire_frp": "NASA FIRMS, VIIRS S-NPP 375 m fire radiative power",
    "aod": "MERRA-2 M2TMNXAER total aerosol extinction AOD 550 nm (TOTEXTTAU), NASA GES DISC Giovanni",
    "pm25": "Optional surface PM2.5 monthly series (null unless pipeline/raw/air/<scope>_pm25_monthly.csv exists)",
    "kd490": "MODIS-Aqua Level-3 diffuse attenuation Kd490 (OB.DAAC) via Giovanni",
    "chlor_a": "MODIS-Aqua Level-3 chlorophyll-a (OB.DAAC) via Giovanni",
}
# Fish series differ by scope (data description, not module logic).
FISH_SOURCES = {
    "canada": "DFO, national salmon landed value (CAD millions) and catch",
    "fraser": "DFO, British Columbia salmon landed value and catch",
    "usa": "NOAA Fisheries, national Pacific salmon landed value (USD millions) and catch",
    "yukon": "ADF&G, Arctic-Yukon-Kuskokwim salmon ex-vessel value and catch",
    "russia": "FAO FishStat, Russian Federation Pacific salmon catch (tonnes; value not published)",
    "amur": "FAO area 61, Russian chum + pink salmon catch (tonnes; value not published)",
}


# ----------------------------------------------------------------------------- regions / scopes
def load_regions(path: Path | None = None) -> dict:
    """data/regions.json: source of truth for bboxes, cameras, water bodies and event years."""
    return json.loads((path or DATA / "regions.json").read_text(encoding="utf-8"))


def _country_meta(c: dict) -> dict:
    return {
        "kind": "country", "id": c["id"], "countryId": c["id"], "name": c["name"], "shortName": c["shortName"],
        "bbox": c["bbox"], "camera": c["camera"], "eventYears": list(c["eventYears"]), "fishMetric": c["fishMetric"],
        "currency": c["currency"], "primaryWaterBody": None, "waterBodies": [],
        "basin": {"id": c["basin"]["id"], "name": c["basin"]["name"], "shortName": c["basin"]["shortName"]},
    }


def _basin_meta(c: dict) -> dict:
    b = c["basin"]
    return {
        "kind": "basin", "id": b["id"], "countryId": c["id"], "name": b["name"], "shortName": b["shortName"],
        "bbox": b["bbox"], "camera": b["camera"], "eventYears": list(b["eventYears"]), "fishMetric": b["fishMetric"],
        "currency": b["currency"], "primaryWaterBody": b["primaryWaterBody"], "waterBodies": list(b["waterBodies"]),
        "basin": None,
    }


def build_scopes(regions: dict) -> list[dict]:
    """The six scope dicts { name, kind, country, path, meta } in regions.json order (country, then its basin)."""
    scopes = []
    for c in regions["countries"]:
        scopes.append({"name": c["id"], "kind": "country", "country": c["id"], "path": c["id"], "meta": _country_meta(c)})
        b = c["basin"]
        scopes.append({"name": b["id"], "kind": "basin", "country": c["id"], "path": f"{c['id']}/{b['id']}", "meta": _basin_meta(c)})
    return scopes


SCOPES: list[dict] = build_scopes(load_regions()) if (DATA / "regions.json").exists() else []
SCOPE_NAMES = [s["name"] for s in SCOPES]


def scope_by_name(name: str) -> dict:
    for s in SCOPES:
        if s["name"] == name:
            return s
    raise KeyError(f"unknown scope {name!r}; choose from {SCOPE_NAMES} or all")


def scope_args(argv=None, description: str = "") -> list[dict]:
    """argparse helper: --scope <name>|all (default all). Returns the list of scope dicts."""
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--scope", default="all", help="one of %s or all" % ", ".join(SCOPE_NAMES))
    args = parser.parse_args(argv)
    if args.scope == "all":
        return list(SCOPES)
    return [scope_by_name(s.strip()) for s in args.scope.split(",") if s.strip()]


def processed_dir(scope: dict) -> Path:
    return PROCESSED / scope["path"]


def data_dir(scope: dict) -> Path:
    return DATA / scope["path"]


# ----------------------------------------------------------------------------- small helpers
def is_null(v) -> bool:
    return v is None or (isinstance(v, float) and math.isnan(v))


def to_float(v):
    """'' / None / 'NA' / 'nan' -> None, else float."""
    if v is None:
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return None if (isinstance(v, float) and math.isnan(v)) else float(v)
    s = str(v).strip()
    if s == "" or s.lower() in ("na", "nan", "null", "none", "-"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def nanmean(values, need: int = 1):
    """Mean of the non-null values, or None if fewer than `need` are valid."""
    vals = [float(v) for v in values if not is_null(v)]
    if len(vals) < need:
        return None
    return float(sum(vals) / len(vals))


def read_csv_rows(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def month_key(value: str) -> str | None:
    """'2012-01-01 00:00:00', '2012-01-01', '2012-01', '20120101' or '2012/1' -> '2012-01'."""
    s = str(value).strip()
    if len(s) >= 8 and s[:8].isdigit():
        return f"{s[:4]}-{s[4:6]}"
    for sep in ("-", "/"):
        parts = s.replace("T", " ").split(" ")[0].split(sep)
        if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
            return f"{int(parts[0]):04d}-{int(parts[1]):02d}"
    return None


def read_giovanni_csv(path: Path) -> dict[str, float]:
    """Giovanni 'Time Series, Area-Averaged' CSV -> { 'YYYY-MM': value } (NaN for fill values).

    Metadata lines are skipped until the header row whose first cell starts with 'time';
    the value is the second column; fills <= -999 or >= 1e20 become NaN.
    """
    out: dict[str, float] = {}
    with open(path, newline="", encoding="utf-8-sig") as fh:
        rows = csv.reader(fh)
        in_data = False
        for row in rows:
            if not row:
                continue
            first = row[0].strip()
            if not in_data:
                if first.lower().startswith("time"):
                    in_data = True
                continue
            if len(row) < 2:
                continue
            key = month_key(first)
            val = to_float(row[1])
            if key is None:
                continue
            if val is None or val <= -999 or val >= 1e20:
                val = float("nan")
            out[key] = val
    return out


def _round_sig(x: float, sig: int) -> float:
    if x == 0 or not math.isfinite(x):
        return x
    return float(f"{x:.{sig}g}")


def _clean(obj, sig: int):
    """Convert numpy types, round floats to `sig` significant figures, NaN/inf -> None."""
    if isinstance(obj, dict):
        return {str(k): _clean(v, sig) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v, sig) for v in obj]
    if isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    if isinstance(obj, (int, np.integer)):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        f = float(obj)
        if not math.isfinite(f):
            return None
        return _round_sig(f, sig)
    if isinstance(obj, np.ndarray):
        return _clean(obj.tolist(), sig)
    return obj


def write_json(obj, path: Path, sig: int = 6) -> int:
    """Compact JSON, floats rounded to `sig` significant figures (6 by default), NaN -> null. Returns bytes written."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(_clean(obj, sig), separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


# ----------------------------------------------------------------------------- series
def _annual_from_monthly(monthly: dict[str, float | None], var_id: str) -> list[list]:
    """Annual rules: fire = sum of the 12 months (null if any month unknown);
    aod/pm25 = May–Sep mean, null if < 3 valid months; kd490/chlor_a = May–Sep mean, null if < 2 valid."""
    out = []
    for y in YEARS:
        if var_id.startswith("fire_"):
            vals = [monthly.get(f"{y}-{m:02d}") for m in range(1, 13)]
            total = None if any(is_null(v) for v in vals) else float(sum(vals))
            if total is not None and var_id == "fire_count":
                total = int(round(total))
            out.append([y, total])
        else:
            vals = [monthly.get(f"{y}-{m:02d}") for m in OPEN_MONTHS]
            need = 2 if var_id in WATER_VARS else 3
            out.append([y, nanmean(vals, need)])
    return out


def _variable(var_id: str, source: str, monthly: dict | None, annual: list | None = None) -> dict:
    v = VARIABLES[var_id]
    if monthly is not None:
        monthly_list = [[m, None if is_null(monthly.get(m)) else monthly.get(m)] for m in MONTHS]
        annual = _annual_from_monthly(monthly, var_id)
    else:
        monthly_list = None
        annual = annual or [[y, None] for y in YEARS]
    return {"label": v["label"], "unit": v["unit"], "source": source, "monthly": monthly_list, "annual": annual}


def _monthly_table(path: Path, columns: list[str]) -> dict[str, dict[str, float | None]]:
    """CSV with a 'month' column -> { column: { 'YYYY-MM': value|None } } (missing months -> None)."""
    table = {c: {m: None for m in MONTHS} for c in columns}
    if not path.exists():
        return table
    for row in read_csv_rows(path):
        key = month_key(row.get("month", ""))
        if key not in MONTH_INDEX:
            continue
        for c in columns:
            if c in row:
                table[c][key] = to_float(row[c])
    return table


def build_series(scope: dict, fire: dict, air: dict, fish: dict, water: dict) -> dict:
    """Assemble the primer's series.json dict from monthly / annual tables.

    fire  = { 'fire_count': {month: v}, 'fire_frp': {month: v} }      air = { 'aod': {...}, 'pm25': {...} }
    fish  = { 'fish_value': {year: v}, 'fish_catch': {year: v} }      water = { water_body: { 'kd490': {...}, 'chlor_a': {...} } }
    Missing months / years are null. Annual values follow _annual_from_monthly. Used by load_series and make_mock."""
    fish_source = FISH_SOURCES.get(scope["name"], "local salmon series")
    variables = {
        "fire_count": _variable("fire_count", SOURCES["fire_count"], fire.get("fire_count", {})),
        "fire_frp": _variable("fire_frp", SOURCES["fire_frp"], fire.get("fire_frp", {})),
        "aod": _variable("aod", SOURCES["aod"], air.get("aod", {})),
        "pm25": _variable("pm25", SOURCES["pm25"], air.get("pm25", {})),
        "fish_value": _variable("fish_value", fish_source, None, [[y, fish.get("fish_value", {}).get(y)] for y in YEARS]),
        "fish_catch": _variable("fish_catch", fish_source, None, [[y, fish.get("fish_catch", {}).get(y)] for y in YEARS]),
    }
    water_bodies: dict = {}
    if scope["kind"] == "basin":
        known = [w["id"] for w in scope["meta"]["waterBodies"]]
        for wb in known + sorted(k for k in water if k not in known):
            if wb in water:
                water_bodies[wb] = {v: _variable(v, SOURCES[v], water[wb].get(v, {})) for v in WATER_VARS}
    # Round exactly as write_json will, so stats computed from this dict match the published series.json.
    return _clean({"scope": scope["path"], "variables": variables, "waterBodies": water_bodies}, 6)


def load_series(scope: dict) -> dict:
    """Build series.json from processed/<scope path>/*.csv (missing files -> nulls)."""
    pdir = processed_dir(scope)
    fire = _monthly_table(pdir / "fire_monthly.csv", ["fire_count", "fire_frp"])
    air = _monthly_table(pdir / "air_monthly.csv", ["aod", "pm25"])
    fish = {"fish_value": {}, "fish_catch": {}}
    if (pdir / "fish_annual.csv").exists():
        for row in read_csv_rows(pdir / "fish_annual.csv"):
            try:
                y = int(float(row.get("year", "")))
            except ValueError:
                continue
            if y in YEARS:
                fish["fish_value"][y] = to_float(row.get("fish_value"))
                fish["fish_catch"][y] = to_float(row.get("fish_catch"))
    water: dict = {}
    wpath = pdir / "water_monthly.csv"
    if scope["kind"] == "basin" and wpath.exists():
        for row in read_csv_rows(wpath):
            wb = (row.get("water_body") or "").strip()
            key = month_key(row.get("month", ""))
            if not wb or key not in MONTH_INDEX:
                continue
            body = water.setdefault(wb, {v: {} for v in WATER_VARS})
            for v in WATER_VARS:
                body[v][key] = to_float(row.get(v))
    return build_series(scope, fire, air, fish, water)


def top_fire_years(series: dict, n: int = 2) -> list[int]:
    """The n years with the highest annual fire_frp (ascending year order); [] if fewer valid years."""
    annual = series["variables"]["fire_frp"]["annual"]
    valid = [(float(v), int(y)) for y, v in annual if not is_null(v)]
    if len(valid) < n:
        return []
    valid.sort(key=lambda t: (-t[0], t[1]))
    return sorted(y for _, y in valid[:n])


FIXED_EVENT_SCOPES = ("fraser", "yukon")


def event_years(scope: dict, series: dict | None = None) -> list[int]:
    """fraser and yukon -> their fixed eventYears from regions.json; every other scope -> the two years
    with the highest annual fire_frp (ascending). stats.py and export_json.py both use this function."""
    fixed = list(scope["meta"]["eventYears"])
    if scope["name"] in FIXED_EVENT_SCOPES:
        return fixed
    if series is None:
        series = load_series(scope)
    top = top_fire_years(series, 2)
    return top if top else fixed


if __name__ == "__main__":
    for s in SCOPES:
        print(f"{s['name']:7s} {s['kind']:7s} path={s['path']:15s} events={s['meta']['eventYears']} fish={s['meta']['fishMetric']}")
    print(len(MONTHS), "months;", len(YEARS), "years; raw =", RAW)
