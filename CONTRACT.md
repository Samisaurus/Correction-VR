# Ember to Ocean — CONTRACT

This file is the Session Primer v2, reproduced verbatim from *Ember to Ocean — Pipeline and Prompt Book* (NASA Space Apps 2026, version 2, whole countries). Every module, data file and pipeline script in this repository is built against it. Nothing here is renamed silently: a change needs a written **CONTRACT CHANGE REQUEST**, and when it is accepted it is recorded in the changelog at the end of this file.

Machine-readable versions of the data shapes live in `contract/schemas/*.schema.json` (JSON Schema draft 2020-12); `python pipeline/validate.py` checks every file under `data/` against them.

## Session Primer v2

```text
EMBER TO OCEAN - SESSION PRIMER v2
(Paste this ONCE at the start of every AI chat: Claude, GPT-UI and GPT-Data. Then paste one task prompt
at a time. v2 replaces v1: the main view is now the WHOLE of Canada, the USA and Russia.)

PROJECT
NASA Space Apps 2026. A lightweight single-page web app showing how wildfires -> air quality ->
water condition -> fishery money are linked across three whole countries, 2012-2025.
Two levels ("scopes"), same files and same modules at both levels:
  COUNTRY VIEW (the main show): all of Canada, the USA (incl. Alaska) and Russia, on a 3D globe.
     Fires, smoke (AOD), major rivers near fires, national salmon money / catch, national trends.
  BASIN VIEW (the proof): one case-study basin per country, zoomed in, pitched terrain + contours,
     where satellite WATER data is possible, so the full fire -> air -> water -> fish chain is shown:
     canada -> fraser (Fraser River, British Columbia)
     usa    -> yukon (Yukon-Kuskokwim, Alaska)
     russia -> amur   (Amur River, Russian Far East)
Look: Wikipedia-like "lab report". White page, thin grey rules, serif headings, monospace numbers.

HARD RULES
R1 Plain JavaScript ES modules. No framework, no bundler, no npm. Runs from any static server
    (python -m http.server 8000) and from GitHub Pages.
R2 Only these external libraries. index.html loads them; do not add others:
      maplibre-gl@5          <script> tag, global `maplibregl` (v5 has the globe projection)
      maplibre-contour@0.1.0 <script> tag, global `mlcontour`
      Observable Plot 0.6    import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm"
R3 Write ONLY the file(s) named in your task. Return each file complete, in its own code block,
    with its path as the first-line comment. No partial diffs, no "rest unchanged".
R4 Never rename anything defined in this primer. If the contract must change, reply
    "CONTRACT CHANGE REQUEST:" + reason, and stop.
R5 Survive missing data: if a loader returns null or a value is null, show the muted italic text
    "No data for this selection" (theme.placeholder) or an em dash, and never throw.
    Water variables in COUNTRY view are not missing: show "Measured in the case-study basin" as a
    link that calls store.set({ view: 'basin' }).
R6 No JavaScript errors in the console. No localStorage. No network requests except the CDNs above,
    the basemap and terrain tiles, and files under ./data/ and ./content/.
R7 Max 300 lines per JS file. Top comment in every file: purpose, exports, owner, task ID.
R8 Colours: JS uses theme.COLORS (hex strings, needed for SVG and MapLibre); CSS uses the
    --c-* variables from tokens.css. Never type a hex colour anywhere else.
R9 Module CSS: each module injects ONE <style data-module="<prefix>"> block (only once), with class
    names starting with its prefix: hdr- sld- ibx- f1- f2- f3- map- leg- mth-.
    Only css/layout.css positions the slots on the page.
R10 Every module must work identically in both scopes. Never branch on country or basin ids;
    read everything from the scope's meta and files.

FILE TREE (repo root = site root; owner and task ID in brackets)
index.html, css/tokens.css, css/layout.css, js/main.js        [Claude C1; main.js finalised in C10]
js/store.js, js/data.js, js/theme.js                          [Claude C2]
js/ui/header.js [GPT G1]   js/ui/slider.js [GPT G2]   js/ui/infobox.js [GPT G3]
js/charts/fig1-trend.js [GPT G4]   js/charts/fig2-before-after.js [GPT G5]
js/charts/fig3-chain.js [Claude C9]
js/map/map.js [C4] js/map/fires.js [C5] js/map/water.js [C6] js/map/air.js [C7] js/map/legend.js [C8]
data/** [mock: Claude C3, tools/make_mock.py; real: GPT P7]
contract/schemas/*.schema.json, CONTRACT.md [Claude C0]
pipeline/*.py, pipeline/README.md, pipeline/requirements.txt [GPT P0-P7]
pipeline/raw/** [humans, gitignored]   pipeline/processed/** [pipeline output, gitignored]

DOM IDS (index.html provides every slot except #region-tabs and #view-toggle)
#site-header #year-slider #map #map-legend #fig1 #fig2 #infobox #fig3
#region-tabs and #view-toggle are created by header.js inside #site-header.
#map-legend sits inside the map frame.

STATE (js/store.js)
  import { store } from '../store.js'          (path relative to the importing file)
  state = { countryId: 'canada'|'usa'|'russia', view: 'country'|'basin',
            year: 2012..2025, focus: <variable id>, playing: boolean }
  store.get()            -> current state object (do not mutate it)

    store.set(patch)       -> shallow merge; notifies subscribers only if a value changed
  store.subscribe(fn)    -> returns unsubscribe(); fn(state, prev) runs after every change
  Initial state: { countryId: 'canada', view: 'country', year: 2023, focus: 'fire_frp', playing: false }
  Who writes: header.js -> countryId (keeps view and year), view, playing:false
               map.js     -> view: 'basin' when the case-study outline is clicked
               slider.js -> year, playing
               fig1, fig2, infobox, fig3 -> focus (fig2 may set year; R5 links may set view)
               nobody else writes.

SCOPES
  A scope is one folder of data: data/<countryId>/ (country view) or data/<countryId>/<basinId>/
  (basin view). Both folders contain the SAME file names (below). Resolution differs:
                     country view                         basin view
  fires              0.5-degree cells                     0.1-degree cells
  air                2.0 lat x 2.5 lon cells              0.5 x 0.625 (native MERRA-2) cells
  rivers             Natural Earth major rivers           HydroRIVERS, order >= 4
  water variables    none (basin only)                    kd490, chlor_a at the water bodies
  fish               national salmon value / catch        most local public salmon series
  camera             globe, pitch 0-20                    mercator detail, pitch 55, contours on
  data.scopePath(state) returns 'canada' or 'canada/fraser'.

DATA API (js/data.js): async, cached, returns null for a missing file (never throws)
  getRegions()              -> parsed data/regions.json
  scopePath(state)          -> 'canada' | 'canada/fraser' (sync)
  getScope(state)           -> { meta, geo, rivers, series, stats }   for the current scope
  getFires(state, year)     -> GeoJSON FeatureCollection | null      for the current scope
  getAir(state, year)       -> GeoJSON FeatureCollection | null      for the current scope
  Sync helpers (exported from data.js):
  annualSeries(series, varId, waterBodyId?)   -> [{ year, value }]      value may be null
  monthlySeries(series, varId, waterBodyId?) -> [{ date: Date, month: 'YYYY-MM', value }]
  annualValue(series, varId, year, waterBodyId?) -> number | null
  isWaterVar(varId) -> true for kd490 and chlor_a.
  Water variables live in series.waterBodies[waterBodyId]. Callers MUST pass the waterBodyId
  (normally meta.primaryWaterBody); without it, or in country view, the helpers return [] or null.

SCOPE META (what getScope().meta returns; built from regions.json)
  { kind: 'country'|'basin', id, countryId, name, shortName, bbox, camera, eventYears,
    fishMetric: 'fish_value'|'fish_catch', currency: 'CAD'|'USD'|null,
    primaryWaterBody: string|null, waterBodies: [ {id, name, bbox} ],
    basin: { id, name, shortName } | null   (country scope: its case study; basin scope: null) }

THEME (js/theme.js)
  export const COLORS = {
    fire: '#D55E00', smoke: '#8A7F72', water: '#009E73', river: '#56B4E9', polluted: '#7B3294',
    fish: '#0072B2', year: '#E69F00', ink: '#202122', muted: '#54595D', rule: '#A2A9B1',
    panel: '#F8F9FA', link: '#3366CC', paper: '#FFFFFF', contour: '#8C7B6B', country: '#202122',
    basin: '#E69F00' }
  export const VARS = { <varId>: { label, short, unit, group, color, digits } }   (table below)
  export const GROUP_DEFAULT = { fire: 'fire_frp', air: 'aod', water: 'kd490', fish: null }
      (fish default = the scope's meta.fishMetric)
  export function fmt(value, varId) -> e.g. '0.31', '12,400', '—' for null
  export function fmtP(p)           -> 'p < 0.001' or 'p = 0.034'
  export function placeholder(el, text = 'No data for this selection') -> muted italic message
  tokens.css defines the same colours as --c-fire, --c-smoke, --c-water, --c-river, --c-polluted,
  --c-fish, --c-year, --c-ink, --c-muted, --c-rule, --c-panel, --c-link, --c-paper, --c-contour,
  --c-country, --c-basin, and fonts --f-serif ('Source Serif 4', Georgia, serif),
  --f-sans ('Inter', system-ui, sans-serif), --f-mono ('IBM Plex Mono', ui-monospace, monospace).

VARIABLES (ids are fixed)
  id          label                         short       unit            group color digits
  fire_count Fire detections (VIIRS)        Fires       detections      fire   fire   0
  fire_frp    Fire radiative power          Fire power MW (annual sum) fire    fire   0
  aod         Aerosol optical depth 550 nm AOD          unitless        air    smoke 3
  pm25        Surface PM2.5                 PM2.5       ug/m3           air    smoke 1    (optional, may be all null)
  kd490       Water turbidity (Kd490)       Kd490       1/m             water water 3     (basin only)
  chlor_a     Chlorophyll-a                 Chl-a       mg/m3           water water 2     (basin only)
  fish_value Salmon landed value            Value       million (2024 prices, local currency) fish fish 1
  fish_catch Salmon catch                   Catch       thousand tonnes fish   fish   1
  Annual meaning: fire_* = sum of the year; aod, pm25, kd490, chlor_a = mean of May-Sep;
  fish_* = calendar-year totals. A true zero (no fires that month) is 0; unknown is null.

MODULE SIGNATURES

    UI + chart files: export function mount(el, ctx)       ctx = { store, data, theme }
    Render only inside el. Load what you need with ctx.data. Subscribe to ctx.store.
    Rebuild when countryId or view changes; update on year / focus change.
  map.js:            export function mount(el, ctx)      owns the MapLibre map, globe/terrain,
                     contours, camera, outlines; loads the year's fires/air files; calls the layers.
  fires.js, water.js, air.js:
                     export function addLayer(map, ctx) -> { update(state, payload) }
                     payload = { scope, fires, air }   (scope = getScope() result)
                     Own sources/layers only, ids prefixed 'fires-', 'water-', 'air-'.
  legend.js:         export function mount(el, ctx)

DATA FILES
  data/regions.json
  { "years": [2012, 2025], "mock": true,
    "countries": [
     { "id": "canada", "name": "Canada", "shortName": "Canada",
       "bbox": [-141.1, 41.6, -52.6, 83.2],
       "camera": { "center": [-96.0, 60.0], "zoom": 2.4, "pitch": 15, "bearing": 0 },
       "eventYears": [2017, 2023], "fishMetric": "fish_value", "currency": "CAD",
       "basin": { "id": "fraser", "name": "Fraser River basin, British Columbia", "shortName": "Fraser",
         "bbox": [-127.5, 48.8, -118.5, 55.5],
         "camera": { "center": [-122.5, 52.0], "zoom": 5.4, "pitch": 55, "bearing": -15 },
         "eventYears": [2017, 2018, 2021, 2023], "fishMetric": "fish_value", "currency": "CAD",
         "primaryWaterBody": "fraser_plume",
         "waterBodies": [ { "id": "fraser_plume", "name": "Fraser River plume, Strait of Georgia",
                            "bbox": [-123.6, 48.9, -123.1, 49.3] } ] } },
     { "id": "usa", "name": "United States (incl. Alaska)", "shortName": "USA",
       "bbox": [-180.0, 18.5, -66.5, 71.5],
       "camera": { "center": [-115.0, 50.0], "zoom": 2.2, "pitch": 15, "bearing": 0 },
       "eventYears": [2015, 2020], "fishMetric": "fish_value", "currency": "USD",
       "basin": { "id": "yukon", "name": "Yukon-Kuskokwim, Alaska", "shortName": "Yukon",
         "bbox": [-166.5, 59.0, -141.0, 67.5],
         "camera": { "center": [-156.0, 63.0], "zoom": 4.6, "pitch": 55, "bearing": -15 },
         "eventYears": [2015, 2019, 2022], "fishMetric": "fish_value", "currency": "USD",
         "primaryWaterBody": "yukon_delta",
         "waterBodies": [ { "id": "yukon_delta", "name": "Yukon delta coast, Bering Sea",
                            "bbox": [-166.0, 62.0, -163.5, 63.5] } ] } },
     { "id": "russia", "name": "Russia", "shortName": "Russia",
       "bbox": [27.0, 41.0, 180.0, 82.0],
       "camera": { "center": [100.0, 62.0], "zoom": 1.9, "pitch": 15, "bearing": 0 },
       "eventYears": [2012, 2021], "fishMetric": "fish_catch", "currency": null,
       "basin": { "id": "amur", "name": "Amur River basin, Russian Far East", "shortName": "Amur",
         "bbox": [120.0, 45.0, 141.8, 55.5],
         "camera": { "center": [131.0, 50.5], "zoom": 4.4, "pitch": 55, "bearing": -15 },
         "eventYears": [2015, 2019], "fishMetric": "fish_catch", "currency": null,
         "primaryWaterBody": "amur_liman",
         "waterBodies": [ { "id": "amur_liman", "name": "Amur estuary (Amur Liman)",
                            "bbox": [140.3, 52.6, 141.6, 53.6] } ] } } ] }
  Country eventYears and amur eventYears are recomputed by the pipeline (common.event_years:
  the two years with the highest annual fire_frp);
  the values above are mock placeholders. Fraser and yukon eventYears are fixed.
  Russia's bbox stops at 180 E (the Chukotka tip east of 180 is left out).
  Country scopes have primaryWaterBody null and waterBodies [].

  Files inside EVERY scope folder (data/<country>/ and data/<country>/<basin>/):
  geo.geojson     Polygon / MultiPolygon features with properties.kind:
                  country scope: "country" (the national outline) and "basin" (the case-study outline,
                                 properties.id = basin id, properties.name) - map.js makes it clickable
                  basin scope:   "basin" (outline) and "water" (properties.id, properties.name; the
                                 rectangle of a waterBodies bbox = the box satellite data is averaged over)
  rivers.geojson LineString features; properties { id, name (string|null), order (int 1-9),
                  nearFire: [years] } nearFire = years when a fire cell lay within
                  50 km (country scope) or 25 km (basin scope).
  fires/<year>.geojson One Point per cell with fires that year (point = cell centre);
                  properties { count, frp_sum, first: "YYYY-MM-DD", last: "YYYY-MM-DD" }
  air/<year>.geojson    One Polygon per air cell inside the scope; properties { aod, pm25 (number|null) };
                  May-Sep mean of that year.
  series.json
  { "scope": "canada" | "canada/fraser",
    "variables": { "<varId>": { "label": "...", "unit": "...", "source": "...",
                   "monthly": [["2012-01", 0.08], ...] | null,     (all 168 months, null where unknown)
                   "annual": [[2012, 0.11], ...] } },                (all 14 years, null where unknown)
    "waterBodies": { "<waterBodyId>": { "kd490": {same shape}, "chlor_a": {same shape} } } }

    variables holds fire_count, fire_frp, aod, pm25, fish_value, fish_catch (fish monthly = null).
  waterBodies is {} in country scopes.
  stats.json
  { "scope": "canada",
    "trends": [ { "variable": "aod", "waterBody": null, "basis": "annual" | "monthly",
                  "test": "mann_kendall" | "seasonal_mann_kendall", "n": 14,
                  "tau": 0.21, "p": 0.003, "sen_slope": 0.0012, "sen_intercept": 0.09,
                  "slope_unit": "per year", "direction": "increasing" | "decreasing" | "no trend" } ],
    "beforeAfter": [ { "variable": "kd490", "waterBody": "fraser_plume", "event": 2017,
                  "months": [5, 6, 7, 8, 9], "before_years": [2014, 2015, 2016],
                  "after_years": [2018, 2019], "n_before": 15, "n_after": 10,
                  "mean_before": 0.19, "mean_after": 0.24, "welch_t": 3.2, "df": 21.4, "p": 0.004,
                  "cohens_d": 0.81, "mannwhitney_p": 0.006 } ],
    "links": [ { "from": "fire_frp", "to": "aod", "method": "spearman", "lag": 0,
                  "lag_unit": "month" | "year", "rho": 0.62, "p": 0.0001, "p_adj": 0.0003, "n": 168,
                  "all_lags": [ { "lag": 0, "rho": 0.62, "p": 0.0001, "p_adj": 0.0003, "n": 168 } ] } ] }
  Trend line for charts: y = sen_intercept + sen_slope * (year - 2012), using the basis "annual" entry.
  Entries with basis "monthly" have sen_intercept = null (they are reported as text only).
  direction is "no trend" whenever p >= 0.05.
  Links (rho/p may be null):
    country scope, exactly two: fire_frp -> aod (month), fire_frp -> <fishMetric> (year).
    basin scope, exactly four: fire_frp -> aod (month), aod -> kd490 (year),
                                kd490 -> <fishMetric> (year), fire_frp -> <fishMetric> (year).
    kd490 always means the scope's primaryWaterBody.
  beforeAfter: country scope has aod entries only; basin scope has aod, kd490 and chlor_a entries.
  Conventions: unknown = null (never 0, never omitted). Months "YYYY-MM". Years are integers.
  Size budget per file: country fires < 250 KB, basin fires < 80 KB, air < 150 KB, rivers < 400 KB,
  geo < 300 KB, series < 150 KB, stats < 30 KB. regions.json < 10 KB.

SCREEN LAYOUT (desktop >= 1100 px, from the team sketch)
  Row 1 #site-header    title left; country tabs + view toggle right
  Row 2 #year-slider    full-width bar (the blue bar in the sketch)
  Row 3 #map            left, 7/12 width, 560 px tall, #map-legend overlaid bottom-left
         right column: #fig1 trend chart on top, #fig2 before/after bars below (as in the sketch)
  Row 4 #infobox        left 5/12   |   #fig3 chain diagram right 7/12
  Nothing sits below row 4 (the Methods article was removed).
  Below 900 px: one column in the order header, slider, map, infobox, fig1, fig2, fig3.

MOCK DATA
  While regions.json has "mock": true, infobox.js shows a "MOCK DATA" badge. Never submit with mock data.
```

## Changelog

| Date | Change | Agreed by |
|------|--------|-----------|
|      |        |           |
