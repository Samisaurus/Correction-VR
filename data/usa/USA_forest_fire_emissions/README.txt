USA - AIR EMISSIONS FROM FOREST FIRES, WITH LOCATIONS, 2003-01-01 to 2026-08-31
Each row = one MODIS fire detection that is a forest fire (same points as the forest-fire
detection dataset), with where/when it burned and the tonnes of each pollutant it emitted.

Columns: date, latitude, longitude, region, forest_name, then tonnes of BC (black carbon),
C (carbon), CH4, CO2, CO, NMHC, NOX, OC (organic carbon), PM25 (PM2.5), SO2, TC (total carbon).

Files: by_year/ (one CSV per year), totals by region+year, by forest+year, and by year.
Emission source: Copernicus CAMS GFAS via GWIS. GFAS reports emissions per country per week; each
fire's share is set by its fire radiative power x GFAS land-cover factor (Kaiser et al. 2012).
No data for 2002 (GFAS starts 2003); MODIS archive ends 2026-08-31.
