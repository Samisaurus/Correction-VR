# Variant R — the environmental data laboratory

A lightweight, Wikipedia-style website comparing **air pollution**, **water pollution** and **forest fires** in **Russia**, **China** and the **United States**.

The site has **no data built in**. It reads whatever CSV files are placed in `data/` and works out, file by file, which columns are years, dates, measurements or categories. It then writes each article for you: an overview chart, column statistics, key figures, the full sortable table and the raw source.

## Adding data

Save each file as `data/<country>/<subject>.csv`:

|               | Air pollution                     | Water pollution                     | Forest fires                     |
|---------------|-----------------------------------|-------------------------------------|----------------------------------|
| Russia        | `data/russia/air-pollution.csv`   | `data/russia/water-pollution.csv`   | `data/russia/forest-fires.csv`   |
| China         | `data/china/air-pollution.csv`    | `data/china/water-pollution.csv`    | `data/china/forest-fires.csv`    |
| United States | `data/us/air-pollution.csv`       | `data/us/water-pollution.csv`       | `data/us/forest-fires.csv`       |

- Any column names and any number of columns are fine. The first row must be the header.
- Commas, semicolons and tabs are all detected automatically.
- A `Year` or `Date` column becomes the time axis. If several rows share a year (one row per city, per fire…), they are combined automatically. You can switch between sum, mean, median, min and max on the page.
- Text columns such as region or cause become filters.
- Missing files show up as "Awaiting data". Nothing breaks.

To check a file before committing it, open **Preview a local file** in the sidebar. The file is read in your browser only.

Other file names, source citations, extra countries or extra subjects are all set in `assets/config.js`. No other code needs to change.

## Running it

It is a static site with no build step and no libraries.

- **GitHub Pages:** Settings → Pages → Deploy from branch → choose the branch and `/ (root)`.
- **Locally:** run `python3 -m http.server` in this folder, then open http://localhost:8000. Opening `index.html` directly from disk will not work, because browsers block reading files that way.

## Files

```
index.html          page shell
assets/config.js    countries, subjects, optional per-dataset settings
assets/csv.js       CSV reader and column detection
assets/chart.js     SVG line/bar charts
assets/app.js       pages and routing
assets/style.css    layout and theme (light and dark)
data/               your CSV files
```
