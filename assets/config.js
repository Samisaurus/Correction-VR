/*
 * Variant R — site configuration
 * ------------------------------------------------------------------
 * This is the ONLY file you need to edit to add, rename or remove
 * countries and subjects. The site never assumes anything about the
 * columns inside your CSV files: it inspects each file when it loads
 * and builds charts, tables and statistics from whatever it finds.
 *
 * Default file location for every dataset:
 *     data/<country id>/<topic id>.csv
 *   e.g. data/russia/air-pollution.csv
 *
 * To use a different file name, or to add a source citation, add an
 * entry to `datasets` below (key = "<country id>/<topic id>").
 */
window.VR_CONFIG = {
  siteName: "Variant R",
  tagline: "The environmental data laboratory",
  dataRoot: "data",

  countries: [
    {
      id: "russia",
      name: "Russia",
      officialName: "Russian Federation",
      code: "RU",
      color: "#2b6c95",
      summary:
        "Russia is the largest country in the world by land area, spanning Eastern Europe and Northern Asia. " +
        "It holds the greatest expanse of boreal forest (taiga) on Earth and major river systems such as the Volga, Ob and Yenisei."
    },
    {
      id: "china",
      name: "China",
      officialName: "People's Republic of China",
      code: "CN",
      color: "#b0472d",
      summary:
        "China is a country in East Asia and one of the most populous nations in the world. " +
        "Its landscape ranges from the Tibetan Plateau to the densely settled basins of the Yangtze and Yellow rivers."
    },
    {
      id: "us",
      name: "United States",
      officialName: "United States of America",
      code: "US",
      color: "#5d7a2e",
      summary:
        "The United States is a federal republic in North America made up of fifty states. " +
        "Its territory includes the Mississippi river basin, the Great Lakes and the fire-prone forests of the western states."
    }
  ],

  topics: [
    {
      id: "air-pollution",
      name: "Air pollution",
      code: "AIR",
      summary:
        "Air pollution is the presence in the atmosphere of substances harmful to the health of humans and other living beings. " +
        "Common indicators include fine particulate matter (PM2.5 and PM10), nitrogen dioxide (NO₂), sulphur dioxide (SO₂), " +
        "ground-level ozone (O₃) and carbon monoxide (CO)."
    },
    {
      id: "water-pollution",
      name: "Water pollution",
      code: "WAT",
      summary:
        "Water pollution is the contamination of rivers, lakes, groundwater and seas, usually as a result of human activity. " +
        "Typical measurements include dissolved oxygen, biochemical and chemical oxygen demand (BOD, COD), nitrogen and phosphorus " +
        "compounds, heavy metals and the share of water bodies meeting quality standards."
    },
    {
      id: "forest-fires",
      name: "Forest fires",
      code: "FIR",
      summary:
        "A forest fire (wildfire) is an unplanned fire burning in forest or other wooded vegetation. " +
        "Records usually describe the number of fires, the area burned, their causes and location, and the emissions they release."
    }
  ],

  /*
   * Optional per-dataset settings. Leave empty if you use the default paths.
   *
   * "russia/air-pollution": {
   *   file: "data/russia/my-other-filename.csv",     // custom path
   *   source: "Federal Service for Hydrometeorology",  // shown under References
   *   sourceUrl: "https://example.org/",
   *   notes: "Annual averages for monitored cities."
   * }
   */
  datasets: {}
};
