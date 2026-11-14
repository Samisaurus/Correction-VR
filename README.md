# Ember to Ocean

**NASA Space Apps Challenge 2026.** A lightweight, Wikipedia-style "laboratory" website that follows wildfire from the forest to the water: **forest fires → air pollution → water pollution** in **Canada**, the **United States** and **Russia**.

The site has **no data built in**. It reads whatever CSV files you put in `data/`, works out which columns are years, dates, measurements, categories and coordinates, and builds everything from them.

## What's on the page

The main page is one scroll: the live instrument on top, the article below.

1. **Country tabs**: Canada · United States · Russia.
2. **Year slider** with a play button. Triangles mark high-fire years (the top quarter).
3. **2.5D map**: an equal-area outline of the country, tilted. Drag to rotate or tilt, Shift-drag to pan, double-click or use +/− to zoom, and press "2D" to flatten it. It shows:
   - fire records for the selected year as **columns**, with **fire-density contour lines**
   - air measurements as a **haze**. If the air file has no coordinates, the whole country is tinted by the national level.
   - water sites, which turn **purple when a fire was recorded within 50 km** that year
4. **Infobox**: the headline value of each subject for the selected year, the change from the previous year, and a sparkline. Click a row to study it in Fig. 1 and Fig. 2.
5. **Fig. 1 Trend**: Mann–Kendall test plus Sen's slope.
6. **Fig. 2 Before / after** the slider year: Welch t-test plus Mann–Whitney U.
7. **Fig. 3 The chain**: Fire → Air → Water, Spearman correlation at lags of 0–3 years. Solid arrows are significant; dashed arrows are not.
8. **Methods · Data sources · Caveats · Team and AI use.**

The **Data archive** (sidebar) has a full article for every file: an adjustable chart, column statistics, key figures, a sortable table and the raw source. It also has country and subject comparison pages, plus **Preview a local file**, which tests a CSV in your browser without uploading it.

All statistics run in the browser (`assets/stats.js`). They have been checked against SciPy.

## Adding data

Save each file as `data/<country>/<subject>.csv`:

|               | Forest fires                     | Air pollution                     | Water pollution                     |
|---------------|----------------------------------|-----------------------------------|-------------------------------------|
| Canada        | `data/canada/forest-fires.csv`   | `data/canada/air-pollution.csv`   | `data/canada/water-pollution.csv`   |
| United States | `data/us/forest-fires.csv`       | `data/us/air-pollution.csv`       | `data/us/water-pollution.csv`       |
| Russia        | `data/russia/forest-fires.csv`   | `data/russia/air-pollution.csv`   | `data/russia/water-pollution.csv`   |

A file can have any columns. The site picks them up like this:

- **Time:** a column named like `year` or `date` (`2019`, `2019-07`, `2019-07-14` and `07/14/2019` all work).
- **Map position:** columns named like `latitude`/`longitude` or `lat`/`lon`. These are optional; without them the data still feeds every chart.
- **Headline measure:** chosen per subject by column name, e.g. PM2.5 or AOD for air, Kd490 or chlorophyll for water, a count or burned area for fires. For files with one row per fire detection (like NASA FIRMS exports), the measure is the number of detections per year.
- **Rows that share a year** are combined: totals for counts and areas, averages for concentrations.
- Commas, semicolons or tabs as separators; `1,234`, `12%`, `NA` and blanks are handled.
- A missing file shows as "awaiting data"; nothing breaks.

To force a specific column, use another file name, or credit a source, add an entry under `datasets` in `assets/config.js`:

```js
datasets: {
  "canada/air-pollution": { metric: "PM2.5", combine: "mean", source: "NASA MAIAC AOD via Giovanni", sourceUrl: "https://giovanni.gsfc.nasa.gov/" }
}
```

Team names go under `team` in the same file. To add a fourth link to the chain (for example fishing), there is a commented-out example under `topics`.

**Keep files reasonably small** (up to roughly 20 MB each); the browser reads them whole. For very large FIRMS exports, keep only the columns you need (`latitude,longitude,acq_date,frp`), or pre-filter by confidence.

## Running it

A static site with no build step and no libraries.

- **GitHub Pages:** Settings → Pages → Deploy from branch → choose the branch and `/ (root)`.
- **Locally:** run `python3 -m http.server 8000` in this folder, then open http://localhost:8000. Opening `index.html` directly from disk will not load data.

## Files

```
index.html             page shell
assets/config.js       countries, subjects, column hints, per-dataset settings, team
assets/csv.js          CSV reader and column detection
assets/stats.js        Mann–Kendall, Sen slope, Welch, Mann–Whitney, Spearman lag correlation
assets/chart.js        SVG line/bar charts
assets/map.js          2.5D canvas map
assets/app.js          pages and routing
assets/style.css       layout and theme (light and dark)
assets/geo/            country outlines (Natural Earth via world-atlas, ISC licence)
data/                  your CSV files
```
