# Ember to Ocean

**NASA Space Apps 2026.** A single-page, white "lab report" site that follows one chain across three whole
countries, 2012–2025: **wildfire → air quality (AOD) → water condition → salmon fishery money**, for Canada,
the United States (incl. Alaska) and Russia, with one case-study basin each (Fraser, Yukon–Kuskokwim, Amur)
where satellite water measurements make the full chain testable.

Plain JavaScript ES modules, no build step, three CDN libraries (MapLibre GL 5, maplibre-contour 0.1.0,
Observable Plot 0.6). Runs from any static server and from **GitHub Pages** as is.

## Run it

- **GitHub Pages:** repo → Settings → Pages → *Deploy from a branch* → this branch, `/ (root)`. Done.
- **Locally:** `python3 -m http.server 8000` in this folder, then open http://localhost:8000.

## What is on the page

Header (country tabs, *Whole country / Case study* toggle) · year slider with play and fire-year markers ·
map (globe with 0.5° fire cells, smoke haze, rivers that turn purple near fires, clickable orange case-study
outline; basin view with 2.5D terrain, contours, 0.1° fires and the water measurement box) · infobox with
sparklines · Fig. 1 trend (Mann-Kendall + Sen slope) · Fig. 2 before/after a fire year (Welch, Mann-Whitney,
Cohen's d) · Fig. 3 the chain (Spearman lag links) · Methods / Data / Statistics / Caveats / Team / Credits.

## Modular by design: adding data later

Everything is driven by files under `data/`; no module knows a country or basin by name (contract rule R10).

- **Replace the mock data** with real numbers: put the raw downloads under `pipeline/raw/` (list in
  `pipeline/README.md`), run the seven pipeline steps, then `python pipeline/export_json.py --scope all` and
  `python pipeline/validate.py`. `regions.json` gets `"mock": false` and the red MOCK DATA badge disappears.
- **Add a country or basin:** add an entry to `data/regions.json` (bbox, camera, water bodies, fish metric)
  and a folder `data/<country>/` (and `data/<country>/<basin>/`) with the same eight file types. The header
  tabs, map cameras, infobox, figures and pipeline scope table all read `regions.json`.
- **Add a variable:** extend `VARS` in `js/theme.js` and `VARIABLES` in `pipeline/common.py`; series files
  accept extra variables (schema `additionalProperties`).
- **Contract:** every file name, DOM id, state field, data shape and colour is fixed in `CONTRACT.md`; the
  JSON shapes are enforced by `contract/schemas/*.schema.json` (`python tools/check_contract.py`).

## Layout

```
index.html  css/tokens.css  css/layout.css  js/main.js      app shell (slots, tokens, 5-row grid, safe module loader)
js/store.js  js/data.js  js/theme.js                        state store, cached data API, colours + variable table
js/ui/header.js  slider.js  infobox.js                      header tabs + toggle, year slider, infobox
js/charts/fig1-trend.js  fig2-before-after.js  fig3-chain.js figures (Plot, Plot, hand-built SVG)
js/map/map.js  fires.js  water.js  air.js  legend.js         MapLibre map and its layers
content/methods.html                                        Methods article (HTML fragment)
data/regions.json  data/<country>/[<basin>/]{geo,rivers}.geojson series.json stats.json fires/<y> air/<y>
contract/  CONTRACT.md                                      the primer + JSON schemas + examples
pipeline/                                                   Python pipeline P0–P7 (see pipeline/README.md)
tools/make_mock.py  check_stats.py  check_contract.py  mock_geo.json   mock data, independent stats cross-check, schema check
```

## Checks

```bash
python tools/make_mock.py          # regenerate mock data (validates at the end)
python pipeline/validate.py        # schemas, size budgets, 168 months / 14 years
python tools/check_stats.py        # recompute every stats.json value with scipy + pymannkendall
python tools/check_contract.py     # contract examples against the schemas
```

Mock data note: `data/` currently holds reproducible placeholder data (`tools/make_mock.py`, fixed seed,
Natural Earth outlines). Never submit while the MOCK DATA badge shows.
