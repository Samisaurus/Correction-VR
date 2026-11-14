// js/data-config.js
// Purpose: Flexible data-source configuration so you can swap in large CSV files (FIRMS, MERRA-2/AOD,
//          water, or custom multi-year CSVs) without touching any map or chart code.
//
// Quick switch guide:
//   1. Drop your CSV file(s) under ./data/ (for example ./data/canada/fires.csv or ./data/canada/fires/2023.csv).
//   2. Set `mode: 'csv'` (or `'auto'` to try CSV first and fall back to GeoJSON/JSON automatically).
//   3. Point `scopes['canada'].firesCsv` (or use `{scope}` / `{year}` patterns below) to your CSV path.
//   4. Adjust `columns` only if your CSV headers differ from the standard aliases listed below.

export const DATA_CONFIG = {
  // 'geojson' = read existing .geojson/.json files
  // 'csv'     = read CSV paths below
  // 'auto'    = try configured CSV first (if specified), otherwise fall back cleanly to .geojson/.json
  mode: 'auto',

  // Optional global URL patterns when using per-scope or per-year CSV files.
  // Leave null to only use explicit per-scope entries or default GeoJSON files.
  // Example: './data/{scope}/fires.csv' or './data/{scope}/fires/{year}.csv'
  patterns: {
    firesCsv: null,
    airCsv: null,
    seriesCsv: null,
  },

  // Per-scope overrides for quick swapping (key = 'canada', 'canada/fraser', 'usa', 'usa/yukon', 'russia', 'russia/amur')
  // Example:
  //   canada: {
  //     firesCsv: './data/canada/firms_all.csv',
  //     airCsv: './data/canada/merra2_aod.csv',
  //   }
  scopes: {},

  // Flexible column-name aliases (case-insensitive, first matching header wins)
  columns: {
    lat: ['lat', 'latitude', 'y', 'lat_deg'],
    lon: ['lon', 'lng', 'longitude', 'long', 'x', 'lon_deg'],
    year: ['year', 'yr', 'acq_year'],
    date: ['date', 'acq_date', 'time', 'month', 'timestamp'],
    count: ['count', 'detections', 'n', 'fire_count'],
    frp: ['frp_sum', 'frp', 'fire_frp', 'radiative_power', 'power'],
    aod: ['aod', 'totexttau', 'aod_550', 'aod550', 'value'],
    pm25: ['pm25', 'pm2_5', 'surface_pm25'],
    variable: ['variable', 'var', 'var_id', 'metric'],
    value: ['value', 'val', 'mean', 'v'],
    waterBody: ['water_body', 'waterbody', 'water_body_id', 'wb'],
  },

  // Grid cell size (degrees) used to aggregate huge point-level CSVs (like raw NASA FIRMS detections)
  // so the map stays fast at 60 fps. Set to 0 to keep raw points un-aggregated.
  gridDeg: {
    countryFires: 0.5,
    basinFires: 0.1,
    countryAir: 2.0,
    basinAir: 0.5,
  },

  // Rows parsed per event-loop slice so massive multi-megabyte CSVs never freeze the UI.
  chunkRows: 12000,
};
