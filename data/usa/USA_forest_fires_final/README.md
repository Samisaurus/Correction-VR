# USA Forest Fire Detections 2002–2026 — final

MODIS confidence ≥ 70 + VIIRS nominal + high, forest detections only.

## Contents

| Path | What it is |
|---|---|
| `data/us_forest_fire_detections.parquet` | **Main map layer**: 3,134,902 rows (MODIS 596,789 + VIIRS 2,538,113) |
| `csv_by_year/USA_<MODIS|VIIRS>_<year>.csv` | Same rows, one CSV per sensor per year (any year over 1M rows is split into `_part1`/`_part2`); each opens in Excel |
| `data/us_modis_pre2012_small_fires.parquet` / `.csv` | 114,534 small MODIS fires 2002–2011 (confidence ≥ 70, FRP < 20 MW, all land covers, `is_forest` flag) |
| `data/us_summary_by_year.csv`, `_by_forest.csv` (193), `_by_forest_year.csv` (3,247) | Counts by sensor, with totals |
| `data/us_viirs_outage_days.csv` | 51 days with no VIIRS data (MODIS covers them) |
| `USA_forest_fires_summary.xlsx` | Same summaries as tabs (MODIS and VIIRS side by side, totals included) |

## Columns

- **IDs and sensor:** `id`, `sensor` (MODIS / VIIRS), `satellite` (Terra / Aqua / Suomi NPP).
- **Time:** `acq_date`, `acq_time_utc`, `year`, `month`, `day_night`.
- **Location:** `latitude`, `longitude`.
- **Intensity:** `frp_mw`, `frp_class` (High = MODIS ≥ 100 MW, VIIRS ≥ 10 MW).
- **Confidence:** `confidence_raw`, `confidence_class`.
- **Forest:** `forest_name` (official USFS National Forest or "Other forest land - State"), `state`, `in_national_forest`, `landcover_igbp`, `forest_class`.
- **Cross-check:** `seen_by_other_sensor` (the other sensor detected fire within ~1 km the same UTC day).
- **Pixel and processing:** `scan_km`, `track_km`, `brightness_k`, `brightness_t31_k`, `version`.

## Rules

- **Fire:** NASA type 0 (vegetation fire), FRP > 0.
- **Confidence:** MODIS ≥ 70; VIIRS nominal + high.
- **Forest:** MODIS MCD12C1 land cover.
- **Coverage:** MODIS 2002-01-01 → 2026-08-31; VIIRS 2012-01-20 → 2026-07-31.

## Check

When VIIRS had data, it detected fire at 88% of MODIS forest detections (327,231 of 371,300). VIIRS adds 879,813 detections MODIS did not see, mostly small fires.

## Use

Map the two sensors as separate layers. Most VIIRS detections are the same fires MODIS saw, so don't add their counts together as one trend.
