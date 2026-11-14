#!/usr/bin/env python3
"""tools/make_mock.py — realistic, clearly flagged mock data for all six scopes (Claude · C3).

    python tools/make_mock.py              # writes data/** with regions.json "mock": true, then validates
    python tools/make_mock.py --no-validate

numpy + standard library only (plus pipeline/common.py and pipeline/stats.py, which are numpy only).
Fixed seed, so the output is reproducible. Geometry comes from tools/mock_geo.json (Natural Earth
outlines and rivers, simplified; hand-drawn basin polygons). Patterns: fires concentrate in real fire
regions and spike in the scope's eventYears, AOD tracks fire in the same month, Kd490 rises the year
after big fires, salmon value falls 2–4 years later. stats.json is computed by pipeline/stats.py from
the mock series, exactly as for real data. Never submit with this data (red MOCK DATA badge).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from pipeline import common  # noqa: E402
from pipeline.stats import compute_stats  # noqa: E402

SEED = 20260314
GEO = json.loads((ROOT / "tools" / "mock_geo.json").read_text(encoding="utf-8"))
REGIONS = json.loads((ROOT / "contract" / "examples" / "regions.json").read_text(encoding="utf-8"))
REGIONS["mock"] = True

# Fire-prone regions per scope: (lon, lat, sigma_deg, weight, frp_factor).
FIRE_REGIONS = {
    "canada": [(-121, 57, 3.5, 1.0, 1.4), (-114, 61.5, 3.0, 0.6, 1.3), (-104, 56, 3.5, 0.9, 1.2), (-93, 52, 3.0, 0.6, 1.1),
               (-75, 50.5, 3.0, 0.7, 1.1), (-122, 51.5, 1.5, 0.5, 1.5), (-67, 52.5, 2.5, 0.3, 1.0), (-110, 54, 3.0, 0.5, 1.0)],
    "usa": [(-121.5, 40, 2.0, 1.0, 1.6), (-120.5, 45, 2.0, 0.6, 1.4), (-114, 45.5, 2.5, 0.7, 1.3), (-111, 34, 2.0, 0.5, 1.1),
            (-106, 39, 2.0, 0.4, 1.1), (-150, 65, 4.0, 0.9, 1.3), (-91, 32.5, 4.0, 0.7, 0.4), (-97, 36, 3.0, 0.5, 0.5),
            (-85, 31, 3.0, 0.4, 0.4)],
    "russia": [(125, 63, 5.0, 1.0, 1.3), (93, 59, 4.0, 0.8, 1.3), (104, 54, 3.0, 0.6, 1.2), (113, 52, 3.0, 0.7, 1.1),
               (130, 51, 3.0, 0.8, 1.0), (136, 48, 2.5, 0.5, 0.9), (70, 56, 4.0, 0.4, 0.7), (40, 52, 4.0, 0.5, 0.4),
               (60, 52, 3.0, 0.3, 0.6), (160, 60, 4.0, 0.3, 1.0)],
    "fraser": [(-122.5, 52, 1.5, 1.0, 1.4), (-120.5, 50.5, 1.0, 0.6, 1.2), (-124.5, 54, 1.2, 0.5, 1.3), (-121.5, 53.5, 1.0, 0.5, 1.2)],
    "yukon": [(-150, 65, 2.5, 1.0, 1.3), (-156, 63.5, 2.0, 0.6, 1.2), (-146, 66, 2.0, 0.5, 1.2), (-158, 61.5, 1.5, 0.4, 1.0)],
    "amur": [(128, 52, 2.5, 1.0, 1.1), (134, 48.5, 2.0, 0.7, 1.0), (124, 49, 2.0, 0.6, 0.9), (136.5, 52, 2.0, 0.4, 1.0), (131, 47, 2.0, 0.5, 0.8)],
}
TARGET_DETECTIONS = {"canada": 300_000, "usa": 450_000, "russia": 700_000, "fraser": 12_000, "yukon": 15_000, "amur": 40_000}
MAX_CELLS = {"country": 1500, "basin": 450}
PM25_SCOPES = {"canada", "fraser", "usa", "yukon"}          # Russia and Amur: pm25 all null (tests that path)
AOD_BACKGROUND = {"canada": 0.10, "usa": 0.12, "russia": 0.14, "fraser": 0.09, "yukon": 0.08, "amur": 0.16}
# water bodies: (kd490 base 1/m, chlor_a base mg/m3, freshet peak month, bloom peak month, ice months)
WATER = {"fraser_plume": (0.55, 3.5, 6, 4, ()), "yukon_delta": (1.6, 2.5, 7, 6, (11, 12, 1, 2, 3, 4)),
         "amur_liman": (0.9, 4.0, 7, 6, (12, 1, 2, 3))}
# fish: (value base in millions, value trend per year, catch base in thousand tonnes, catch trend)
FISH = {"canada": (160.0, -0.012, 24.0, -0.02), "fraser": (38.0, -0.015, 6.0, -0.03), "usa": (520.0, 0.01, 380.0, 0.0),
        "yukon": (6.5, -0.02, 2.4, -0.03), "russia": (None, 0, 420.0, 0.01), "amur": (None, 0, 55.0, -0.01)}
SEASON = np.array([0.004, 0.006, 0.03, 0.08, 0.14, 0.19, 0.25, 0.19, 0.08, 0.025, 0.004, 0.001])
MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


# ----------------------------------------------------------------------------- geometry helpers
def rings_of(scope: dict) -> list[np.ndarray]:
    if scope["kind"] == "country":
        return [np.asarray(poly[0], float) for poly in GEO["countries"][scope["name"]]["coordinates"]]
    return [np.asarray(GEO["basins"][scope["name"]]["coordinates"][0], float)]


def points_in_rings(px: np.ndarray, py: np.ndarray, rings: list[np.ndarray]) -> np.ndarray:
    inside = np.zeros(len(px), bool)
    for ring in rings:
        x, y = ring[:, 0], ring[:, 1]
        x2, y2 = np.roll(x, -1), np.roll(y, -1)
        hit = np.zeros(len(px), bool)
        for xi, yi, xj, yj in zip(x, y, x2, y2):
            if yi == yj:
                continue
            cond = (yi > py) != (yj > py)
            xint = (xj - xi) * (py - yi) / (yj - yi) + xi
            hit ^= cond & (px < xint)
        inside |= hit
    return inside


def grid_centres(bbox, dx: float, dy: float, origin=(-180.0, -90.0)):
    """Cell centres of a grid aligned to `origin` with steps dx, dy, covering bbox."""
    w, s, e, n = bbox
    lon0 = origin[0] + math.floor((w - origin[0]) / dx) * dx + dx / 2
    lat0 = origin[1] + math.floor((s - origin[1]) / dy) * dy + dy / 2
    lons = np.arange(lon0, e + 1e-9, dx)
    lats = np.arange(lat0, n + 1e-9, dy)
    lon, lat = np.meshgrid(lons, lats)
    return lon.ravel(), lat.ravel()


def km_dist(lon1, lat1, lon2, lat2):
    """Equirectangular distance in km; inputs broadcast."""
    mlat = np.radians((lat1 + lat2) / 2)
    dx = (lon1 - lon2) * np.cos(mlat) * 111.32
    dy = (lat1 - lat2) * 110.57
    return np.sqrt(dx * dx + dy * dy)


def densify(coords: np.ndarray, step: float) -> np.ndarray:
    out = [coords[0]]
    for a, b in zip(coords[:-1], coords[1:]):
        n = max(1, int(math.ceil(max(abs(b[0] - a[0]), abs(b[1] - a[1])) / step)))
        for k in range(1, n + 1):
            out.append(a + (b - a) * k / n)
    return np.asarray(out)


def feature(geom_type, coords, props):
    return {"type": "Feature", "geometry": {"type": geom_type, "coordinates": coords}, "properties": props}


# ----------------------------------------------------------------------------- generators
def year_intensity(rng, scope: dict) -> np.ndarray:
    """Relative fire intensity per year; event years are the clear maxima."""
    events = scope["meta"]["eventYears"]
    base = rng.uniform(0.55, 1.5, len(common.YEARS))
    for i, y in enumerate(common.YEARS):
        if y in events:
            base[i] = rng.uniform(2.3, 2.6) if len(events) > 2 else 3.0 if y == max(events) else 2.6
    return base


def fire_cells(rng, scope: dict, intensity: np.ndarray):
    """Per-year dict year -> array [lon, lat, count, frp_sum, start_doy, end_doy] plus national totals."""
    rings = rings_of(scope)
    step = 0.5 if scope["kind"] == "country" else 0.1
    lon, lat = grid_centres(scope["meta"]["bbox"], step, step)
    keep = points_in_rings(lon, lat, rings)
    lon, lat = lon[keep], lat[keep]
    w = np.full(len(lon), 0.015)
    frp_factor = np.full(len(lon), 1.0)
    acc = np.zeros(len(lon))
    for clon, clat, sig, weight, ff in FIRE_REGIONS[scope["name"]]:
        d2 = ((lon - clon) * math.cos(math.radians(clat))) ** 2 + (lat - clat) ** 2
        g = weight * np.exp(-d2 / (2 * sig * sig))
        w += g
        acc += g
        frp_factor += (ff - 1.0) * g
    frp_factor = frp_factor / np.maximum(acc + 1.0, 1.0) * 1.0 + 0.0
    if scope["kind"] == "country":
        w *= 1.0 / (1.0 + np.exp((lat - 67.5) / 1.5))     # few fires in the far Arctic
    w /= w.sum()
    target = TARGET_DETECTIONS[scope["name"]]
    years = {}
    for i, year in enumerate(common.YEARS):
        lam = target * intensity[i] * w * rng.lognormal(0, 0.9, len(w))
        lam *= target * intensity[i] / lam.sum()
        count = rng.poisson(lam)
        hit = count > 0
        mean_frp = np.exp(rng.normal(2.0, 0.45, hit.sum())) * frp_factor[hit]
        frp = np.round(count[hit] * mean_frp, 1)
        start = rng.integers(95, 180, hit.sum())
        end = np.minimum(start + rng.integers(10, 130, hit.sum()), 304)
        years[year] = np.column_stack([lon[hit], lat[hit], count[hit], frp, start, end])
    return years


def split_months(rng, total: float, integer: bool) -> np.ndarray:
    p = SEASON * rng.lognormal(0, 0.3, 12)
    p /= p.sum()
    if not integer:
        return total * p
    raw = total * p
    base = np.floor(raw)
    rem = int(round(total - base.sum()))
    if rem > 0:
        base[np.argsort(-(raw - base))[:rem]] += 1
    return base.astype(int)


def doy_to_date(year: int, doy: int) -> str:
    return (dt.date(year, 1, 1) + dt.timedelta(days=int(doy))).isoformat()


def make_fire_series(rng, cells: dict) -> tuple[dict, dict]:
    count_m, frp_m = {}, {}
    for year, arr in cells.items():
        cm = split_months(rng, int(arr[:, 2].sum()), True)
        fm = split_months(rng, float(arr[:, 3].sum()), False)
        for mi in range(12):
            key = f"{year}-{mi + 1:02d}"
            count_m[key] = int(cm[mi])
            frp_m[key] = float(round(fm[mi], 1))
    return count_m, frp_m


def make_air_series(rng, scope: dict, frp_m: dict) -> tuple[dict, dict]:
    bg0 = AOD_BACKGROUND[scope["name"]]
    frp = np.array([frp_m[m] for m in common.MONTHS])
    ref = frp.max() if frp.max() > 0 else 1.0
    aod, pm = {}, {}
    for i, m in enumerate(common.MONTHS):
        month = int(m[5:])
        bg = bg0 + 0.03 * math.cos(2 * math.pi * (month - 4) / 12)
        val = bg + 0.38 * frp[i] / ref + rng.normal(0, 0.012)
        aod[m] = float(round(max(0.02, val), 4))
        pm[m] = float(round(max(1.0, 3.0 + 28.0 * aod[m] + rng.normal(0, 1.2)), 2)) if scope["name"] in PM25_SCOPES else None
    return aod, pm


def make_water_series(rng, wb: str, intensity: np.ndarray) -> dict:
    kd_base, chl_base, peak_kd, peak_chl, ice = WATER[wb]
    kd, chl = {}, {}
    for i, m in enumerate(common.MONTHS):
        year, month = int(m[:4]), int(m[5:])
        yi = common.YEARS.index(year)
        lag_effect = max(intensity[yi - 1] - 1.0, 0.0) if yi > 0 else 0.0       # the year after big fires
        season_kd = 1.0 + 0.45 * math.cos(2 * math.pi * (month - peak_kd) / 12)
        season_chl = 1.0 + 0.6 * math.cos(2 * math.pi * (month - peak_chl) / 12)
        kd_v = kd_base * season_kd * (1 + 0.28 * lag_effect) * rng.lognormal(0, 0.12)
        chl_v = chl_base * season_chl * (1 + 0.15 * lag_effect) * rng.lognormal(0, 0.2)
        missing = month in ice or rng.random() < (0.05 if month in common.OPEN_MONTHS else 0.15)
        kd[m] = None if missing else float(round(kd_v, 4))
        chl[m] = None if (missing or rng.random() < 0.04) else float(round(chl_v, 3))
    return {"kd490": kd, "chlor_a": chl}


def make_fish_series(rng, scope: dict, intensity: np.ndarray) -> dict:
    value_base, value_trend, catch_base, catch_trend = FISH[scope["name"]]
    value, catch = {}, {}
    for i, year in enumerate(common.YEARS):
        lagged = [max(intensity[i - lag] - 1.0, 0.0) for lag in (2, 3, 4) if i - lag >= 0]
        drop = 0.22 * (sum(lagged) / 3.0) if lagged else 0.0
        growth = 1 + value_trend * (year - 2012)
        value[year] = None if value_base is None else float(round(value_base * growth * (1 - drop) * rng.lognormal(0, 0.12), 2))
        catch[year] = float(round(catch_base * (1 + catch_trend * (year - 2012)) * (1 - 0.8 * drop) * rng.lognormal(0, 0.15), 2))
    if scope["meta"]["currency"] is None:
        value = {y: None for y in common.YEARS}
    return {"fish_value": value, "fish_catch": catch}


def air_cells(rng, scope: dict, year: int, fires: np.ndarray, annual_aod: float | None, pm: bool):
    """Air polygons for one year: smooth background + smoke near that year's fire cells, scaled so the
    cell mean equals the scope's May–Sep AOD."""
    rings = rings_of(scope)
    bbox = scope["meta"]["bbox"]
    if scope["kind"] == "country":
        lon, lat = grid_centres(bbox, 2.5, 2.0)
        keep = points_in_rings(lon, lat, rings)
        hw, hh, sig = 1.25, 1.0, 2.5
    else:
        lon, lat = grid_centres(bbox, 0.625, 0.5)
        keep = (lon >= bbox[0]) & (lon <= bbox[2]) & (lat >= bbox[1]) & (lat <= bbox[3])
        hw, hh, sig = 0.3125, 0.25, 0.8
    lon, lat = lon[keep], lat[keep]
    if len(lon) == 0:
        return []
    bg = AOD_BACKGROUND[scope["name"]] + 0.02 * np.sin(np.radians(lon * 3)) * np.cos(np.radians(lat * 5))
    smoke = np.zeros(len(lon))
    if len(fires):
        for start in range(0, len(fires), 400):
            f = fires[start:start + 400]
            d2 = ((lon[:, None] - f[None, :, 0]) * np.cos(np.radians(f[None, :, 1]))) ** 2 + (lat[:, None] - f[None, :, 1]) ** 2
            smoke += (np.exp(-d2 / (2 * sig * sig)) * f[None, :, 3]).sum(axis=1)
    target = (annual_aod if annual_aod is not None else AOD_BACKGROUND[scope["name"]]) - bg.mean()
    if smoke.sum() > 0 and target > 0:
        smoke *= target / smoke.mean()
    else:
        smoke[:] = 0.0
    aod = np.maximum(0.02, bg + smoke + rng.normal(0, 0.006, len(lon)))
    feats = []
    for i in range(len(lon)):
        x, y = float(lon[i]), float(lat[i])
        ring = [[x - hw, y - hh], [x + hw, y - hh], [x + hw, y + hh], [x - hw, y + hh], [x - hw, y - hh]]
        pm_v = round(3.0 + 28.0 * aod[i] + rng.normal(0, 0.8), 1) if pm else None
        feats.append(feature("Polygon", [ring], {"aod": round(float(aod[i]), 3), "pm25": pm_v}))
    return feats


def river_features(scope: dict, cells: dict) -> list[dict]:
    radius = 50.0 if scope["kind"] == "country" else 25.0
    step = 0.25 if scope["kind"] == "country" else 0.05
    feats = []
    for i, r in enumerate(GEO["rivers"][scope["name"]], start=1):
        coords = np.asarray(r["coordinates"], float)
        dense = densify(coords, step)
        near = []
        for year, arr in cells.items():
            if len(arr) == 0:
                continue
            # only fire cells within a loose box of the line
            box = (arr[:, 0] >= dense[:, 0].min() - 1.5) & (arr[:, 0] <= dense[:, 0].max() + 1.5) & \
                  (arr[:, 1] >= dense[:, 1].min() - 1.0) & (arr[:, 1] <= dense[:, 1].max() + 1.0)
            f = arr[box]
            if len(f) == 0:
                continue
            d = km_dist(dense[:, None, 0], dense[:, None, 1], f[None, :, 0], f[None, :, 1])
            if (d <= radius).any():
                near.append(int(year))
        feats.append(feature("LineString", coords.tolist(), {"id": i, "name": r["name"], "order": int(r["order"]), "nearFire": near}))
    return feats


def geo_features(scope: dict) -> list[dict]:
    meta = scope["meta"]
    if scope["kind"] == "country":
        basin = next(c for c in REGIONS["countries"] if c["id"] == scope["name"])["basin"]
        return [feature("MultiPolygon", GEO["countries"][scope["name"]]["coordinates"], {"kind": "country", "id": scope["name"], "name": meta["name"]}),
                feature("Polygon", GEO["basins"][basin["id"]]["coordinates"], {"kind": "basin", "id": basin["id"], "name": basin["name"]})]
    feats = [feature("Polygon", GEO["basins"][scope["name"]]["coordinates"], {"kind": "basin", "id": scope["name"], "name": meta["name"]})]
    for wb in meta["waterBodies"]:
        w, s, e, n = wb["bbox"]
        feats.append(feature("Polygon", [[[w, s], [e, s], [e, n], [w, n], [w, s]]], {"kind": "water", "id": wb["id"], "name": wb["name"]}))
    return feats


def write_fires(scope: dict, year: int, arr: np.ndarray, out: Path, budget: int) -> int:
    order = np.argsort(-arr[:, 2])
    arr = arr[order][: MAX_CELLS[scope["kind"]]]
    while True:
        feats = [feature("Point", [round(float(r[0]), 3), round(float(r[1]), 3)],
                         {"count": int(r[2]), "frp_sum": round(float(r[3]), 1), "first": doy_to_date(year, r[4]), "last": doy_to_date(year, r[5])})
                 for r in arr]
        size = common.write_json({"type": "FeatureCollection", "scope": scope["path"], "year": year, "features": feats}, out, sig=8)
        if size <= budget or len(arr) < 20:
            return size
        arr = arr[: int(len(arr) * 0.9)]


# ----------------------------------------------------------------------------- main
def build_scope(scope: dict, index: int) -> dict:
    rng = np.random.default_rng([SEED, index])
    meta = scope["meta"]
    out = common.data_dir(scope)
    intensity = year_intensity(rng, scope)
    cells = fire_cells(rng, scope, intensity)
    count_m, frp_m = make_fire_series(rng, cells)
    aod_m, pm_m = make_air_series(rng, scope, frp_m)
    water = {wb["id"]: make_water_series(rng, wb["id"], intensity) for wb in meta["waterBodies"]} if scope["kind"] == "basin" else {}
    fish = make_fish_series(rng, scope, intensity)
    series = common.build_series(scope, {"fire_count": count_m, "fire_frp": frp_m}, {"aod": aod_m, "pm25": pm_m}, fish, water)
    events = common.event_years(scope, series)
    if events != list(meta["eventYears"]):
        raise SystemExit(f"{scope['name']}: mock event years {events} differ from regions.json {meta['eventYears']}; adjust year_intensity()")
    stats = compute_stats(series, scope, events)

    sizes = {}
    sizes["series.json"] = common.write_json(series, out / "series.json")
    sizes["stats.json"] = common.write_json(stats, out / "stats.json")
    sizes["geo.geojson"] = common.write_json({"type": "FeatureCollection", "scope": scope["path"], "features": geo_features(scope)}, out / "geo.geojson", sig=8)
    sizes["rivers.geojson"] = common.write_json({"type": "FeatureCollection", "scope": scope["path"], "features": river_features(scope, cells)}, out / "rivers.geojson", sig=8)
    fire_budget = 250_000 if scope["kind"] == "country" else 80_000
    annual_aod = dict((y, v) for y, v in series["variables"]["aod"]["annual"])
    fmax = amax = 0
    for year in common.YEARS:
        fmax = max(fmax, write_fires(scope, year, cells[year], out / "fires" / f"{year}.geojson", fire_budget))
        feats = air_cells(rng, scope, year, cells[year], annual_aod.get(year), scope["name"] in PM25_SCOPES)
        amax = max(amax, common.write_json({"type": "FeatureCollection", "scope": scope["path"], "year": year, "features": feats}, out / "air" / f"{year}.geojson", sig=8))
    sizes["fires/<year> max"] = fmax
    sizes["air/<year> max"] = amax
    top = sorted(((v, y) for y, v in series["variables"]["fire_frp"]["annual"] if v is not None), reverse=True)[:3]
    print(f"{scope['name']:7s} events {events}  top fire years {[y for _, y in top]}  cells/yr {int(np.mean([len(a) for a in cells.values()]))}  "
          + "  ".join(f"{k} {v / 1000:.0f}kB" for k, v in sizes.items()))
    return sizes


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--no-validate", action="store_true", help="skip pipeline/validate.py at the end")
    args = parser.parse_args(argv)
    common.DATA.mkdir(parents=True, exist_ok=True)
    common.write_json(REGIONS, common.DATA / "regions.json")
    scopes = common.build_scopes(REGIONS)
    for i, scope in enumerate(scopes):
        build_scope(scope, i)
    print("regions.json written with \"mock\": true")
    if args.no_validate:
        return 0
    from pipeline import validate  # noqa: E402  (jsonschema optional)
    common.SCOPES[:] = scopes
    rows = validate.validate_all(scopes, verbose=True)
    return 1 if any(r["status"] != "PASS" for r in rows) else 0


if __name__ == "__main__":
    sys.exit(main())
