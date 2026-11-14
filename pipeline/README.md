# Ember to Ocean — data pipeline

Turns public raw downloads into the `data/` tree the site reads. Python 3.11+; install with
`pip install -r pipeline/requirements.txt`. Every script runs from the repo root:

```bash
python pipeline/<script>.py --scope canada|fraser|usa|yukon|russia|amur|all
```

## Run order

1. `fetch_firms.py` — FIRMS detections → `fire_monthly.csv`, `fires/<year>.geojson`
2. `fetch_air.py` — Giovanni MERRA-2 AOD → `air_monthly.csv`, `air/<year>.geojson`
3. `fetch_water.py` — MODIS-Aqua Kd490 / chlorophyll-a (basins) → `water_monthly.csv`
4. `build_geo.py` (needs 1) — outlines, basins, water boxes, rivers with near-fire years → `geo.geojson`, `rivers.geojson`
5. `fetch_fish.py` — salmon value (2024 prices) and catch → `fish_annual.csv`
6. `stats.py` — Mann-Kendall, before/after, Spearman links → `stats.json`
7. `export_json.py --scope all` — writes `data/**` and `regions.json` with `"mock": false`, then `validate.py` must pass

Intermediate files live in `pipeline/processed/<scope path>/` (gitignored). `common.py` holds the scope table,
paths, loaders and `event_years()`; `stats_core.py` holds the statistics (numpy only).
`tools/check_stats.py` recomputes every `stats.json` value with scipy + pymannkendall.

## Raw files (put under `pipeline/raw/`, gitignored)

`<c>` = canada | usa | russia, `<b>` = fraser | yukon | amur, `<s>` = any of the six, `<wb>` = water body id
(fraser_plume, yukon_delta, amur_liman). Bounding boxes are in `data/regions.json`.

| Path | What | Used by |
|------|------|---------|
| `raw/firms/<c>/*.csv` | FIRMS yearly country files, VIIRS S-NPP 375 m, 2012–2025 (firms.modaps.eosdis.nasa.gov/country/) | P1 |
| `raw/air/<s>_aod_monthly.csv` | Giovanni "Time Series, Area-Averaged", MERRA-2 M2TMNXAER TOTEXTTAU, 2012-01..2025-12 | P2 |
| `raw/air/<s>_aod_<year>.nc` | Giovanni "Time Averaged Map", same variable, 1 May–30 Sep, scope bbox (14 per scope) | P2 |
| `raw/air/<s>_pm25_monthly.csv` | optional PM2.5 monthly series, same CSV layout | P2 |
| `raw/water/<wb>_kd490_monthly.csv`, `raw/water/<wb>_chlor_monthly.csv` | Giovanni area-averaged MODIS-Aqua series over the water body bbox (or L3m monthly NetCDF in `raw/water/l3m/`) | P3 |
| `raw/geo/<c>_outline.geojson`, `raw/geo/<c>_rivers.geojson` | Natural Earth admin-0 (1:50m) and rivers + lake centrelines (1:10m) clipped to the country (mapshaper.org) | P2, P4 |
| `raw/geo/<b>_basin.geojson`, `raw/geo/<b>_rivers.geojson` | HydroBASINS polygons and HydroRIVERS lines (keep ORD_STRA) | P4 |
| `raw/fish/<s>_fish.csv` | columns `year,value_nominal,catch_tonnes` (DFO, NOAA, ADF&G, FAO as in CONTRACT.md) | P5 |
| `raw/fish/cpi_CAD.csv`, `raw/fish/cpi_USD.csv` | columns `year,cpi`, 2012–2024 at least | P5 |

Note: `write_json` rounds floats to 6 significant figures; GeoJSON files are written with 8 so that the
3–4 decimal coordinate rounding survives. Files written by the pipeline carry a `"scope"` member that
`validate.py` checks against the folder.
