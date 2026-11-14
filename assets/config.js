/*
 * Ember to Ocean — site configuration
 * ------------------------------------------------------------------
 * This is the ONLY file you need to edit to add, rename or remove
 * countries and subjects. The site never assumes anything about the
 * columns inside your CSV files: it inspects each file when it loads
 * and builds the map, charts, statistics and tables from whatever it finds.
 *
 * Default file location for every dataset:
 *     data/<country id>/<topic id>.csv
 *   e.g. data/canada/air-pollution.csv
 *
 * To use a different file name, pick a specific column, or add a source
 * citation, add an entry to `datasets` below (key = "<country id>/<topic id>").
 */
window.VR_CONFIG = {
  siteName: "Ember to Ocean",
  tagline: "An environmental data laboratory",
  subtitle: "Wildfire, air and water across Canada, the United States and Russia",
  event: "NASA Space Apps Challenge 2026",
  dataRoot: "data",

  /* Countries. `iso` is the ISO 3166 numeric code used to draw the outline on the map;
     `center` is [longitude, latitude] for the map projection. */
  countries: [
    {
      id: "canada",
      name: "Canada",
      officialName: "Canada",
      code: "CA",
      iso: 124,
      center: [-96, 61],
      color: "#a8443a",
      summary:
        "Canada is the second-largest country in the world by area, stretching from the Pacific to the Atlantic and north into the Arctic. " +
        "Its boreal forest is one of the largest intact forests on Earth, and rivers such as the Fraser, Mackenzie and St. Lawrence drain to three oceans."
    },
    {
      id: "us",
      name: "United States",
      officialName: "United States of America",
      code: "US",
      iso: 840,
      center: [-112, 47],
      color: "#2b6c95",
      summary:
        "The United States is a federal republic in North America made up of fifty states, including Alaska and Hawaii. " +
        "Its territory includes the Mississippi river basin, the Great Lakes and the fire-prone forests of the western states and Alaska."
    },
    {
      id: "russia",
      name: "Russia",
      officialName: "Russian Federation",
      code: "RU",
      iso: 643,
      center: [100, 62],
      color: "#5d7a2e",
      summary:
        "Russia is the largest country in the world by land area, spanning Eastern Europe and Northern Asia. " +
        "It holds the greatest expanse of boreal forest (taiga) on Earth and major river systems such as the Volga, Ob, Yenisei and Amur."
    }
  ],

  /* Subjects, in the order of the causal chain shown in Fig. 3 (Fire → Air → Water).
     `prefer` lists column-name patterns, best first, used to choose the headline
     measure of each file. If none match, the first numeric column is used.
     `countFallback: true` means "if the file has one row per event (e.g. one row per
     fire detection) and no count/area column, count the rows per year".
     `color` is used for this subject on the map and in every chart (colour-blind safe). */
  topics: [
    {
      id: "forest-fires",
      name: "Forest fires",
      short: "Fire",
      code: "FIR",
      role: "fire",          // map layer: fire columns + density contours
      color: "#d55e00",
      prefer: [/fire.?count|number.?of.?fires|^fires?$|detections?|count/i, /burn|area|hectare|\bha\b|acre/i, /frp|fire.?radiative|fire.?power/i],
      countFallback: true,
      summary:
        "A forest fire (wildfire) is an unplanned fire burning in forest or other wooded vegetation. " +
        "Records usually describe the number of fires or satellite fire detections, the area burned, fire radiative power, and their location."
    },
    {
      id: "air-pollution",
      name: "Air pollution",
      short: "Air",
      code: "AIR",
      role: "air",           // map layer: haze
      color: "#cc79a7",
      prefer: [/pm\s*2\.?5/i, /aod|aerosol|optical.?depth/i, /aqi|air.?quality/i, /pm\s*10/i, /no2|no₂/i, /so2|so₂/i, /ozone|\bo3\b/i, /\bco\b|carbon.?monoxide/i],
      summary:
        "Air pollution is the presence in the atmosphere of substances harmful to the health of humans and other living beings. " +
        "Common indicators include fine particulate matter (PM2.5 and PM10), aerosol optical depth (AOD) measured by satellite, " +
        "nitrogen dioxide (NO₂), sulphur dioxide (SO₂), ozone (O₃) and carbon monoxide (CO)."
    },
    {
      id: "water-pollution",
      name: "Water pollution",
      short: "Water",
      code: "WAT",
      role: "water",         // map layer: sampling sites (purple when near a fire)
      color: "#0072b2",
      prefer: [/wqi|quality.?index/i, /kd.?490|turbid/i, /chlorophyll|chl.?a/i, /dissolved.?oxygen|\bdo\b/i, /\bbod\b/i, /\bcod\b/i, /nitr/i, /phosph/i, /impair|pollut/i],
      summary:
        "Water pollution is the contamination of rivers, lakes, groundwater and seas, usually as a result of human activity. " +
        "Typical measurements include dissolved oxygen, oxygen demand (BOD, COD), nitrogen and phosphorus compounds, heavy metals, " +
        "and satellite measures of water condition such as turbidity (Kd490) and chlorophyll-a."
    }
    /* To add a fourth link to the chain (for example fishing), add another topic here:
    , {
      id: "fishing", name: "Fishing", short: "Fish", code: "FSH", color: "#009e73",
      prefer: [/value|revenue|profit|landed/i, /catch|tonnes|landings/i],
      summary: "Commercial fishing landings and their value."
    } */
  ],

  /* Map settings */
  map: {
    nearFireKm: 50,          // water sites within this distance of a fire that year are drawn purple
    nearFireColor: "#7b3fa0"
  },

  /*
   * Optional per-dataset settings. Leave empty if you use the default paths.
   *
   * "canada/air-pollution": {
   *   file: "data/canada/my-other-filename.csv",   // custom path
   *   metric: "PM2.5 (µg/m³)",                     // column to use as the headline measure
   *   combine: "mean",                             // sum | mean | median | min | max
   *   source: "NASA MODIS/MAIAC via Giovanni",     // shown under Data sources
   *   sourceUrl: "https://giovanni.gsfc.nasa.gov/",
   *   notes: "Annual mean AOD over the country."
   * }
   */
  datasets: {},

  /* Shown in the "Team" section of the main page. */
  team: [
    // { name: "Your name", role: "Data" }
  ],
  aiUse:
    "This website was designed and built with the help of Claude, an AI model by Anthropic. " +
    "All figures are computed in the browser from the data files listed under Data sources."
};
