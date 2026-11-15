// js/summaries.js
// Purpose: Factual & interpretive year-by-year seasonal dispatches (2002–2026) for USA, Canada, and Russia,
//          combining MODIS/VIIRS detections, CAMS GFAS air emissions, and regional fire dynamics.

const COUNTRY_YEAR_SUMMARIES = {
  usa: {
    2002: 'Pre-GFAS western flare-up: Oregon led the nation (4,258 of 16,013 MODIS detections; 1.40M MW FRP) during the landmark Biscuit Fire season, alongside early Alaska boreal burns and southeastern prescribed fire activity before CAMS emissions tracking began in 2003.',
    2003: 'Transition season dominated by Northern Rockies and Southern California autumn wind-driven fires. Montana (8.4 Mt CO₂) and Oregon (4.4 Mt) drove total forest emissions of 47.7 Mt CO₂ and 267.7 kt PM₂.₅—slightly calmer than the long-run US baseline.',
    2004: 'Sharp boreal pivot to interior Alaska: extreme summer lightning storms ignited vast spruce and permafrost terrain, lifting Alaska alone to 42.3 Mt CO₂ out of 75.5 Mt nationally and sending fine particulate output up to 511.9 kt PM₂.₅.',
    2005: 'Back-to-back Alaskan boreal surge marked the second consecutive high-smoke year. Alaska released 50.4 Mt CO₂ (59% of the 85.6 Mt US total; 29,806 MODIS detections), while Louisiana and Arkansas led lower-48 winter/spring burn plumes.',
    2006: 'Subdued national carbon load (46.4 Mt CO₂; 240.8 kt PM₂.₅), shifting away from Alaska toward Washington (5.3 Mt) and dense southeastern pine-belt burning across Alabama and Florida.',
    2007: 'Southeastern drought shock pushed Georgia (12.1 Mt CO₂) and Florida (6.0 Mt) ahead of every western state—the Okefenokee-era peat fires lifted national output to 60.8 Mt CO₂ despite moderate western totals.',
    2008: 'California’s June lightning siege inverted the typical late-summer fire calendar, driving 19.0 Mt CO₂ from northern California alone and keeping national smoke output at 51.4 Mt CO₂ and 279.9 kt PM₂.₅.',
    2009: 'Return of severe Alaskan boreal burning: interior valleys emitted 47.4 Mt CO₂ (nearly three-fifths of the 80.6 Mt national total), producing 533.5 kt of breathable PM₂.₅ and thick summer haze across interior Yukon-Kuskokwim forest corridors.',
    2010: 'Quietest US forest-fire emissions year of the entire 2003–2026 archive (37.0 Mt CO₂; 207.8 kt PM₂.₅; 15,064 MODIS detections), with wet spring conditions muting western crowns while Alaska and Florida led modest burn totals.',
    2011: 'Historic southern drought rebound: Georgia (17.3 Mt CO₂) and Arizona’s Wallow-era conifer burns (8.1 Mt) lifted national emissions to 65.1 Mt CO₂ while Texas and Florida recorded intense spring dryness.',
    2012: 'Opening year of paired VIIRS–MODIS monitoring showed moderate total emissions (48.1 Mt CO₂; 254.2 kt PM₂.₅) concentrated in California (9.4 Mt) and Idaho (5.3 Mt), establishing the modern multi-sensor baseline.',
    2013: 'Compact, high-intensity western mountain season anchored by California’s Rim Fire corridor (9.6 Mt CO₂) and Alaska (8.4 Mt), holding national totals close to median at 49.7 Mt CO₂ and 285.8 kt PM₂.₅.',
    2014: 'Split geography: Northern California (9.8 Mt CO₂) and Washington’s Carlton Complex contrasted with steady southeastern burning across Georgia and Alabama, keeping national output at 48.7 Mt CO₂.',
    2015: 'Broad western and boreal escalation: Alaska (29.8 Mt CO₂), Washington (12.1 Mt), and California (8.6 Mt) drove 83.1 Mt CO₂ and 562.1 kt PM₂.₅, overwhelming regional airsheds across the Pacific Northwest and Bering interior.',
    2016: 'Relatively contained season nationally (48.1 Mt CO₂; 249.1 kt PM₂.₅; 16,558 MODIS detections), led by California’s Soberanes-era coastal blazes (8.4 Mt) and routine southeastern forest management burns.',
    2017: 'Northern Rockies and wine-country inflection point: Montana (10.6 Mt CO₂), California (9.8 Mt), and Oregon (9.4 Mt) pushed emissions to 67.4 Mt CO₂ as autumn wind events signaled escalating WUI smoke risk.',
    2018: 'High-impact California year (16.9 Mt CO₂; Camp and Mendocino Complex era) coupled with Oregon (6.4 Mt). Despite moderate national tonnage (57.6 Mt CO₂), concentrated plume events created severe urban air-quality episodes.',
    2019: 'Another abrupt Alaskan spike: 47.7 Mt CO₂ from Alaska dominated the 79.4 Mt US carbon total while the conterminous West stayed comparatively cool, showing how strongly northern latitude summers govern national totals.',
    2020: 'Historic Pacific Coast megafire shock: synchronous September blowups across California (68.1 Mt CO₂), Oregon (19.4 Mt), and Colorado (12.6 Mt) surged emissions to 122.9 Mt CO₂ and 725.2 kt PM₂.₅ (+278% MODIS fire power vs median).',
    2021: 'Peak US emissions year of the 2003–2026 record: massive Sierra Nevada and Northern California fires (Dixie & Caldor era; 72.1 Mt CO₂) plus Oregon and Washington drove 128.1 Mt CO₂, 818.0 kt PM₂.₅, and 48,801 MODIS detections.',
    2022: 'High-latitude and Southwest dual stress: Alaska (34.7 Mt CO₂) paired with New Mexico’s record spring Calf Canyon/Hermits Peak burn (15.4 Mt) for 94.8 Mt CO₂; 15 VIIRS outage days left MODIS as the uninterrupted backbone.',
    2023: 'Notable US lull amid Canada’s historic crisis: domestic forest emissions fell to 45.2 Mt CO₂ (Alaska 6.7 Mt, Oregon 5.1 Mt), yet transboundary smoke from Canadian wildfires still dominated northeastern and Midwestern skies.',
    2024: 'Sharp summer resurgence led by California’s Park Fire corridor (16.5 Mt CO₂), Idaho (9.6 Mt), and Alaska (8.4 Mt), pulling total US forest emissions back above median to 67.1 Mt CO₂ and 368.7 kt PM₂.₅.',
    2025: 'Moderate overall carbon burn (53.6 Mt CO₂; Alaska 17.3 Mt, Washington 5.5 Mt) paired with an anomalous reactive NOx spike (283.6 kt, +198% above median) and intense early-year Southern California urban-interface firestorms.',
    2026: 'Partial-year record through August 31 captures heavy Pacific Northwest conifer burning: Washington (17.0 Mt CO₂) and Oregon (12.6 Mt) already account for over half of the 52.9 Mt CO₂ logged before autumn.',
  },

  canada: {
    2002: 'Pre-GFAS eastern flare-up: 11,640 MODIS detections (2.17M MW FRP) centered sharply in Quebec (3,446 detections), Saskatchewan, and Alberta, famously sending dense boreal smoke south across eastern North American cities.',
    2003: 'Dry western-boreal summer across Manitoba (48.7 Mt CO₂), British Columbia’s Okanagan corridor (42.0 Mt), and Ontario (25.3 Mt), generating 154.4 Mt CO₂ and 1.23 Mt of PM₂.₅.',
    2004: 'Far-north Yukon eruption: extreme summer heat across Yukon (89.7 Mt CO₂, nearly half the national total) alongside BC and Saskatchewan lifted Canada’s forest emissions to 182.7 Mt CO₂ and 1.46 Mt PM₂.₅.',
    2005: 'Relatively balanced, below-median season (97.8 Mt CO₂; 771.3 kt PM₂.₅), split evenly among Quebec (24.2 Mt), British Columbia (21.3 Mt), and Saskatchewan (15.3 Mt).',
    2006: 'Boreal prairie-shield resurgence: Saskatchewan surged to 56.3 Mt CO₂ alongside BC (28.7 Mt), lifting national emissions to 138.1 Mt CO₂ and over 1.05 Mt of breathable fine particulates.',
    2007: 'Mid-baseline northern burn season (137.1 Mt CO₂; 1.09 Mt PM₂.₅) distributed across Manitoba (34.6 Mt), Alberta (28.4 Mt), and British Columbia (27.0 Mt).',
    2008: 'Cooler national fire year (85.7 Mt CO₂; 658.9 kt PM₂.₅) anchored mostly by concentrated Saskatchewan crown fires (42.2 Mt CO₂) and modest interior BC activity.',
    2009: 'Second quietest season of the 2003–2026 record (61.9 Mt CO₂; 480.6 kt PM₂.₅), with localized British Columbia interior pressure (32.7 Mt) and Yukon (15.4 Mt) offsetting calm eastern forests.',
    2010: 'Renewed Saskatchewan (79.5 Mt CO₂) and British Columbia (58.4 Mt) drought burning elevated national output to 176.3 Mt CO₂ and 1.42 Mt PM₂.₅, with Quebec late-spring plumes reaching the St. Lawrence.',
    2011: 'Slave Lake-era Alberta spring surge (48.1 Mt CO₂) paired with Saskatchewan (27.0 Mt) and BC (22.5 Mt), producing a near-median 138.6 Mt CO₂ season marked by rapid May wind-driven spread.',
    2012: 'Steady mid-range boreal year (128.8 Mt CO₂; 991.5 kt PM₂.₅), concentrated in northern Alberta (45.2 Mt) and British Columbia (32.7 Mt).',
    2013: 'Major step-up across eastern and subarctic shields: Quebec (65.6 Mt CO₂), Manitoba (45.5 Mt), and Northwest Territories (43.9 Mt) combined to double the prior year’s emissions to 262.3 Mt CO₂ and 2.11 Mt PM₂.₅.',
    2014: 'Historic subarctic Northwest Territories crisis: prolonged dry summers burned vast permafrost-boreal terrain in NWT (160.5 Mt CO₂) and BC (96.2 Mt), reaching 300.3 Mt CO₂ and 2.40 Mt PM₂.₅.',
    2015: 'Prairie boreal siege: intense burning across Saskatchewan (109.6 Mt CO₂), Alberta (65.9 Mt), and BC (51.8 Mt) kept national emissions elevated at 271.7 Mt CO₂ and 2.18 Mt PM₂.₅.',
    2016: 'Paradoxical year: despite Fort McMurray’s devastating May urban catastrophe in Alberta (35.2 Mt CO₂), cool wet conditions elsewhere made 2016 Canada’s third-quietest emissions year overall (84.5 Mt CO₂).',
    2017: 'Record-setting British Columbia crown fires: interior BC alone emitted 130.4 Mt CO₂, paired with NWT (67.1 Mt), driving 250.1 Mt CO₂ and 1.99 Mt PM₂.₅ across western mountain corridors.',
    2018: 'Concentrated BC smoke year: British Columbia accounted for 73% of Canada’s entire national burn output (98.7 Mt of 134.8 Mt CO₂), blanketing western valleys in prolonged late-summer haze.',
    2019: 'Early-summer northern Alberta flare-up (73.5 Mt CO₂—Chuckegg Creek era) paired with Yukon (17.6 Mt), keeping total national output modest at 129.5 Mt CO₂.',
    2020: 'Remarkable pandemic-year anomaly: cool, wet boreal weather collapsed Canadian forest emissions to an all-time record low of 18.4 Mt CO₂ and 135.7 kt PM₂.₅ (−87% below median), standing in sharp contrast to the US West Coast emergency.',
    2021: 'Heat-dome rebound: extreme June–July western temperatures and Lytton-era drought propelled BC (106.1 Mt CO₂), Manitoba (47.7 Mt), and Saskatchewan (40.8 Mt) back up to 247.9 Mt CO₂.',
    2022: 'Brief return toward normal baseline (127.3 Mt CO₂; 993.4 kt PM₂.₅), led by Northwest Territories (36.0 Mt) and British Columbia (25.7 Mt) ahead of the unprecedented 2023 escalation.',
    2023: 'Unprecedented continental wildfire catastrophe (#1 on record): simultaneous coast-to-coast megafires across BC (344.9 Mt CO₂), Alberta (331.6 Mt), NWT (228.0 Mt), and Quebec released 1,179.8 Mt CO₂ and 9.58 Mt PM₂.₅ (~8× median).',
    2024: 'Severe multi-year persistence (#3 on record): overwintering holdover fires and ongoing drought pushed NWT (190.3 Mt CO₂), BC (148.4 Mt), and Alberta (105.1 Mt) to 561.7 Mt CO₂—nearly four times the historical median.',
    2025: 'Escalating central-boreal crisis (#2 on record): drought shifted strongly into Saskatchewan (250.0 Mt CO₂) and Manitoba (130.5 Mt) alongside BC (103.5 Mt), lifting national emissions back to 666.9 Mt CO₂ and 5.43 Mt PM₂.₅.',
    2026: 'Partial-year record through August 31 already exceeds the 2003–2026 full-year median: NWT (79.6 Mt CO₂) and BC (48.7 Mt) pushed cumulative emissions to 178.6 Mt CO₂ before September.',
  },

  russia: {
    2002: 'Pre-GFAS Eurasian baseline ahead of 2003 Copernicus atmospheric accounting; field chronicles note dry late-summer Siberian taiga and western peatland smoldering before standardized pixel-level emissions began.',
    2003: 'Massive Trans-Baikal and Far East forest crisis (#2 CO₂ year on record): Zabaykalsky Krai (163.2 Mt CO₂), Irkutsk (119.3 Mt), and Amur Oblast (93.0 Mt) emitted 623.5 Mt CO₂ and 4.78 Mt PM₂.₅ across eastern Asia.',
    2004: 'Sharp drop to the lowest Russian emissions year of the 2003–2026 archive (97.8 Mt CO₂; 595.5 kt PM₂.₅), with scattered central-Siberian activity across Krasnoyarsk and Tomsk.',
    2005: 'Quiet Far East season (137.7 Mt CO₂; 934.3 kt PM₂.₅) concentrated in Khabarovsk Krai (40.4 Mt), Sakha/Yakutia (20.9 Mt), and Amur Oblast (14.8 Mt).',
    2006: 'Mid-baseline Siberian season (215.8 Mt CO₂; 1.51 Mt PM₂.₅) led by Irkutsk (59.7 Mt), Amur (41.7 Mt), and Krasnoyarsk (38.0 Mt).',
    2007: 'Second-calmest year on record (99.3 Mt CO₂; 698.2 kt PM₂.₅), marked by limited spring/summer burns across Zabaykalsky, Irkutsk, and Khabarovsk.',
    2008: 'Major Amur–Baikal intensification: early spring steppe-forest complexes in Amur Oblast (84.2 Mt CO₂) and Zabaykalsky (71.4 Mt) surged national emissions to 353.5 Mt CO₂ and 2.60 Mt PM₂.₅.',
    2009: 'Return to subdued Siberian taiga conditions (132.4 Mt CO₂; 888.7 kt PM₂.₅), spread mildly across Sakha (28.1 Mt), Khabarovsk, and Amur.',
    2010: 'Historic European Russia heatwave & peat crisis: though total tonnage stayed moderate (127.7 Mt CO₂), unusual western hotspots in Ryazan (13.5 Mt) and Nizhny Novgorod (11.4 Mt) choked Moscow and the Volga plains in dense toxic haze.',
    2011: 'Shift back to northeastern permafrost taiga: Sakha Republic (Yakutia) jumped to 80.6 Mt CO₂, lifting national forest emissions to 253.0 Mt CO₂ and 1.85 Mt PM₂.₅.',
    2012: 'Severe Siberian taiga & duff-burning year (#3 CO₂ on record): Sakha (165.8 Mt CO₂), Krasnoyarsk (130.8 Mt), and Khabarovsk (81.5 Mt) drove 615.8 Mt CO₂ alongside extreme carbon monoxide (50.2 Mt CO) from smoldering boreal organic soils.',
    2013: 'More localized northeastern season (218.5 Mt CO₂; 1.66 Mt PM₂.₅), heavily concentrated in Sakha Republic (Yakutia) at 123.4 Mt CO₂ while western Siberia remained damp.',
    2014: 'Above-median eastern Siberian summer: Sakha (131.7 Mt CO₂) and Irkutsk (79.3 Mt) pushed total national emissions to 316.9 Mt CO₂ and 2.41 Mt PM₂.₅.',
    2015: 'Baikal forest drought crisis: Republic of Buryatia (58.8 Mt CO₂), Irkutsk (47.8 Mt), and Zabaykalsky (27.3 Mt) burned across eastern Siberian timberlands, driving 202.9 Mt CO₂ and severe regional airshed impacts.',
    2016: 'Broad central-to-eastern Siberian stress: Krasnoyarsk (95.2 Mt CO₂), Irkutsk (92.3 Mt), and Amur (51.0 Mt) lifted emissions to 320.6 Mt CO₂ and 2.46 Mt PM₂.₅.',
    2017: 'Near-baseline boreal season (218.3 Mt CO₂; 1.66 Mt PM₂.₅) divided primarily between Sakha (74.4 Mt) and Irkutsk Oblast (56.3 Mt).',
    2018: 'Strong dual-region surge (#4 on record): Sakha (150.0 Mt CO₂) and Amur Oblast (132.7 Mt) combined for 425.3 Mt CO₂ and 3.14 Mt PM₂.₅, sending heavy ash and smoke plumes across the Amur–Okhotsk corridor.',
    2019: 'Arctic-circle and Angara smoke emergency: massive fires across Krasnoyarsk (105.1 Mt CO₂), Sakha (95.7 Mt), and Irkutsk (84.4 Mt) released 337.3 Mt CO₂ and blanketed Siberian cities for weeks.',
    2020: 'Siberian Arctic heatwave pivot: record high-latitude warmth focused 70% of Russia’s total burn carbon into Sakha Republic alone (231.3 Mt of 333.0 Mt CO₂), priming permafrost landscapes for 2021.',
    2021: 'Peak Russian wildfire catastrophe (#1 on record): extreme drought across northeastern permafrost taiga drove Sakha Republic (Yakutia) alone to 618.1 Mt CO₂—85% of Russia’s 724.0 Mt CO₂ and 5.64 Mt PM₂.₅ total.',
    2022: 'Sharp post-2021 relief across Yakutia dropped national emissions back to 141.5 Mt CO₂ (1.04 Mt PM₂.₅), led modestly by Khabarovsk Krai (36.4 Mt) and Sakha (24.2 Mt).',
    2023: 'Rebound to median levels (243.3 Mt CO₂; 1.81 Mt PM₂.₅), centered along the Sakha (91.9 Mt), Khabarovsk (37.6 Mt), and Amur (24.2 Mt) forest belt.',
    2024: 'Renewed eastern-boreal escalation: Sakha (147.4 Mt CO₂), Zabaykalsky (60.9 Mt), and Amur (52.3 Mt) lifted emissions above median to 325.7 Mt CO₂ and 2.54 Mt PM₂.₅.',
    2025: 'Spring Trans-Baikal spike amid quiet northern taiga: Zabaykalsky Krai (81.3 Mt CO₂) generated 63% of Russia’s relatively low 129.3 Mt CO₂ national burn load.',
    2026: 'Partial-year record through August 31 shows renewed high-latitude intensification: Sakha (102.5 Mt CO₂), Krasnoyarsk (80.8 Mt), and Arctic Yamalo-Nenets (19.0 Mt) have already reached 250.2 Mt CO₂.',
  },
};

export function getTimestampSummary(scopePath, year, scope) {
  const yr = Number(year);
  const countryId = scopePath.split('/')[0];
  const table = COUNTRY_YEAR_SUMMARIES[countryId] || COUNTRY_YEAR_SUMMARIES.usa;
  const countryText = table[yr] || `Satellite monitoring for ${yr} captures regional forest-fire detections and atmospheric emissions across ${scope && scope.meta ? scope.meta.name : countryId}.`;

  const em = scope && scope.emissions && scope.emissions.years ? scope.emissions.years[yr] : null;
  const ranks = scope && scope.emissions && scope.emissions.ranksByYear ? scope.emissions.ranksByYear[yr] : null;
  const yearCount = scope && scope.emissions ? scope.emissions.yearCount : 24;

  let kicker = `Season Dispatch · ${yr} · ${scope && scope.meta ? scope.meta.name : countryId}`;
  if (yr === 2002) {
    kicker += ' · Pre-GFAS MODIS baseline';
  } else if (em && ranks && ranks.co2) {
    kicker += ` · #${ranks.co2} of ${yearCount} GFAS years (${(em.co2 / 1e6).toFixed(1)} Mt CO₂)`;
  }

  return {
    kicker,
    text: countryText,
  };
}
