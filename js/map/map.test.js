import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { enrichAndSortFires } from './fires.js';
import { annualSeries, annualValue, annualMedian, monthlySeries, parseCsv, computeBeforeAfterStats } from '../data.js';
import { GROUPS, VARS, GROUP_DEFAULT } from '../theme.js';

test('theme only exposes wildfire and atmospheric smoke groups with zero water or fish variables', () => {
  assert.deepEqual(GROUPS, ['fire', 'air']);
  assert.deepEqual(Object.keys(GROUP_DEFAULT), ['fire', 'air']);
  const ids = Object.keys(VARS);
  for (const banned of ['kd490', 'chlor_a', 'fish_value', 'fish_catch']) {
    assert.equal(ids.includes(banned), false, `${banned} must not exist in VARS`);
  }
});

test('accurate 50m country borders exist in both public/country-borders.geojson and data/*/geo.geojson with zero antimeridian jumps', () => {
  const fc = JSON.parse(fs.readFileSync('public/country-borders.geojson', 'utf8'));
  assert.equal(fc.type, 'FeatureCollection');
  assert.deepEqual(fc.features.map((f) => f.properties.id).sort(), ['canada', 'russia', 'usa']);

  const checkNoJumps = (geom) => {
    const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
    let pts = 0;
    for (const poly of polys) {
      for (const ring of poly) {
        pts += ring.length;
        for (let i = 1; i < ring.length; i += 1) {
          assert.ok(Math.abs(ring[i][0] - ring[i - 1][0]) < 10);
        }
      }
    }
    return pts;
  };

  for (const f of fc.features) {
    assert.ok(checkNoJumps(f.geometry) > 4000);
  }
  for (const cid of ['canada', 'usa', 'russia']) {
    const g = JSON.parse(fs.readFileSync(`data/${cid}/geo.geojson`, 'utf8'));
    const cf = g.features.find((f) => f.properties && f.properties.kind === 'country');
    assert.ok(cf && checkNoJumps(cf.geometry) > 4000, `${cid}/geo.geojson should use 1:50m country geometry`);
  }
});

test('indexed series helpers return accurate O(1) values and median', () => {
  const series = {
    variables: {
      fire_frp: {
        annual: [[2012, 100], [2013, 200], [2014, 500], [2015, null]],
        monthly: [['2012-06', 40], ['2012-07', 60]],
      },
    },
  };
  assert.equal(annualValue(series, 'fire_frp', 2013), 200);
  assert.equal(annualValue(series, 'fire_frp', 2015), null);
  assert.equal(annualValue(series, 'fire_frp', 2099), null);
  assert.equal(annualMedian(series, 'fire_frp'), 200);
  assert.equal(annualSeries(series, 'fire_frp').length, 4);
  assert.equal(monthlySeries(series, 'fire_frp').length, 2);
});

test('enrichAndSortFires computes detections per 5 sq km and sorts ascending by density', () => {
  const fc = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-120, 55] }, properties: { count: 2000 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-100, 55] }, properties: { count: 100 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-110, 55] }, properties: { count: 600 } },
    ],
  };
  const sorted = enrichAndSortFires(fc);
  const counts = sorted.features.map((f) => f.properties.count);
  const densities = sorted.features.map((f) => f.properties.density_5km2);
  assert.deepEqual(counts, [100, 600, 2000]);
  assert.ok(densities[0] < densities[1] && densities[1] < densities[2]);
  assert.ok(densities[0] > 0.2 && densities[0] < 0.5, `expected ~0.28 per 5 km^2, got ${densities[0]}`);
  assert.ok(densities[2] > 5.0, `expected >5 per 5 km^2, got ${densities[2]}`);
});

test('buildDataManifest discovers csv_by_year folders, classifies summary files, and excludes outage CSVs', async () => {
  const os = await import('node:os');
  const path = await import('node:path');
  const { buildDataManifest } = await import('../../vite.config.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-manifest-'));
  try {
    const dir = path.join(tmp, 'USA_forest_fires_final', 'csv_by_year');
    const summaryDir = path.join(tmp, 'USA_forest_fires_final', 'data');
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(summaryDir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'USA_VIIRS_2021.csv'), 'latitude,longitude,acq_date,frp_mw\n63.1,-155.2,2021-07-04,18.4\n');
    fs.writeFileSync(path.join(dir, 'USA_MODIS_2021.csv'), 'latitude,longitude,acq_date,frp_mw\n63.1,-155.2,2021-07-04,22.0\n');
    fs.writeFileSync(path.join(dir, 'USA_MODIS_2005.csv'), 'latitude,longitude,acq_date,frp_mw\n');
    fs.writeFileSync(path.join(summaryDir, 'us_summary_by_year.csv'), 'year,MODIS_total,VIIRS_total,all_total\n2021,48801,312866,361667\n');
    fs.writeFileSync(path.join(summaryDir, 'us_summary_by_forest.csv'), 'forest_name,state,MODIS,VIIRS,total,max_frp_mw\nKlamath,California,10,20,30,500\n');
    fs.writeFileSync(path.join(summaryDir, 'us_viirs_outage_days.csv'), 'date\n2022-07-27\n');

    const manifest = buildDataManifest(tmp);
    assert.ok(manifest.scopes.usa, 'usa scope should be discovered from USA_forest_fires_final');
    assert.equal(manifest.scopes.usa.fires.length, 2, 'summary and outage CSVs must not enter fires[]');
    assert.ok(manifest.scopes.usa.summaryByYear.endsWith('us_summary_by_year.csv'));
    assert.ok(manifest.scopes.usa.summaryByForest.endsWith('us_summary_by_forest.csv'));
    assert.deepEqual(
      manifest.scopes.usa.fires.map((f) => [f.sensor, f.year]).sort(),
      [['modis', 2021], ['viirs', 2021]],
    );

    const parsed = [];
    await parseCsv('latitude,longitude,acq_date,frp_mw\n63.1,-155.2,2021-07-04,84.5\n', (cells, cols) => {
      parsed.push(Number(cells[cols.frp]));
    });
    assert.deepEqual(parsed, [84.5]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

let _cachedIdxPromise = null;
async function getFullScopeIndex() {
  if (!_cachedIdxPromise) {
    const path = await import('node:path');
    const { buildScopeIndex } = await import('../../vite.config.js');
    _cachedIdxPromise = Promise.resolve(buildScopeIndex(path.resolve('data')));
  }
  return _cachedIdxPromise;
}

test('buildScopeIndex indexes full USA 2002-2026 MODIS detections, 193 forests, and 51 outage days', async () => {
  const idx = await getFullScopeIndex();

  assert.ok(idx.scopes.usa, 'usa scope must be indexed');
  const usa = idx.scopes.usa;
  assert.equal(usa.series.fire_count.annual.length, 25, 'USA must cover all 25 years 2002-2026');
  assert.equal(usa.series.fire_count.annual[0][0], 2002);
  assert.equal(usa.series.fire_count.annual[24][0], 2026);
  assert.equal(usa.series.fire_frp.annual.length, 25);
  assert.ok(usa.series.fire_frp.monthly.length > 200, 'monthly fire_frp series must span 2002-2026');

  assert.equal(usa.summaryByYear.length, 25);
  assert.equal(usa.allForests.length, 193);
  assert.ok(usa.allForests.some((f) => f.name.startsWith('Other forest land')));
  assert.equal(usa.viirsOutageDates.length, 51);
  assert.equal(usa.years[2005].detections, 29806);
  assert.equal(usa.years[2020].detections, 40908);
  assert.equal(usa.years[2021].detections, 48801);
  assert.ok(usa.years[2020].totalFrpMw > 7000000);
});

test('computeBeforeAfterStats computes before/after Welch t-test and Mann-Whitney U', () => {
  const series = {
    variables: {
      fire_frp: {
        annual: [[2002, 100], [2003, 110], [2004, 105], [2005, 500]],
        monthly: [
          ['2002-05', 10], ['2002-06', 20], ['2002-07', 30], ['2002-08', 25], ['2002-09', 15],
          ['2003-05', 12], ['2003-06', 22], ['2003-07', 32], ['2003-08', 24], ['2003-09', 20],
          ['2004-05', 11], ['2004-06', 21], ['2004-07', 29], ['2004-08', 26], ['2004-09', 18],
          ['2005-05', 80], ['2005-06', 110], ['2005-07', 140], ['2005-08', 100], ['2005-09', 70],
        ],
      },
      fire_count: {
        annual: [[2002, 50], [2003, 55], [2004, 52], [2005, 220]],
        monthly: [
          ['2002-05', 5], ['2002-06', 10], ['2002-07', 15], ['2002-08', 12], ['2002-09', 8],
          ['2003-05', 6], ['2003-06', 11], ['2003-07', 16], ['2003-08', 13], ['2003-09', 9],
          ['2004-05', 5], ['2004-06', 10], ['2004-07', 15], ['2004-08', 12], ['2004-09', 10],
          ['2005-05', 35], ['2005-06', 45], ['2005-07', 65], ['2005-08', 45], ['2005-09', 30],
        ],
      },
    },
  };
  const stats = computeBeforeAfterStats(series, {
    years: [2002, 2026],
    eventYears: [2005],
  });
  assert.ok(stats && Array.isArray(stats.beforeAfter));
  assert.equal(stats.beforeAfter.length, 2);
  const frpStat = stats.beforeAfter.find((r) => r.variable === 'fire_frp' && r.event === 2005);
  assert.ok(frpStat);
  assert.deepEqual(frpStat.before_years, [2002, 2003, 2004]);
  assert.deepEqual(frpStat.after_years, [2005]);
  assert.ok(frpStat.mean_after > frpStat.mean_before);
  assert.ok(frpStat.p < 0.01);
  assert.ok(frpStat.mannwhitney_p < 0.01);
  assert.ok(frpStat.cohens_d > 2);
});

test('buildScopeIndex indexes 2003-2026 GFAS emissions across USA, Canada, and Russia cleanly', async () => {
  const path = await import('node:path');
  const { buildDataManifest } = await import('../../vite.config.js');
  const manifest = buildDataManifest(path.resolve('data'));
  const idx = await getFullScopeIndex();

  assert.deepEqual(Object.keys(manifest.scopes).sort(), ['canada', 'russia', 'usa']);

  for (const cid of ['usa', 'canada', 'russia']) {
    const mScope = manifest.scopes[cid];
    assert.ok(mScope, `manifest should contain ${cid}`);
    assert.ok(mScope.emissionsByYear, `${cid} should discover emissionsByYear`);
    assert.ok(mScope.emissionsByRegionYear, `${cid} should discover emissionsByRegionYear`);
    assert.ok(mScope.emissionsByForestYear, `${cid} should discover emissionsByForestYear`);
    assert.equal(
      mScope.fires.some((f) => f.url.toLowerCase().includes('emission') || f.url.toLowerCase().includes('small_fires')),
      false,
      `${cid} fires[] must never ingest emissions or pre2012_small_fires CSVs`,
    );

    const em = idx.scopes[cid].emissions;
    assert.ok(em, `${cid} scope must include emissions`);
    assert.equal(em.yearCount, 24, `${cid} emissions should span all 24 years 2003-2026`);
    assert.ok(em.medians.co2 > 0 && em.medians.pm25 > 0);
    assert.ok(em.monthlyCo2.length >= 90 && em.monthlyPm25.length >= 90, `${cid} should have >=90 monthly plume points, got ${em.monthlyCo2.length}`);
    assert.ok(em.years[2023].topRegions.length > 0);
    assert.ok(em.years[2023].topForests.length > 0);
  }

  assert.equal(idx.scopes.usa.emissions.ranksByYear[2021].co2, 1);
  assert.equal(idx.scopes.canada.emissions.ranksByYear[2023].co2, 1);
  assert.equal(idx.scopes.russia.emissions.ranksByYear[2021].co2, 1);
});

test('getTimestampSummary returns 75 unique summaries across 2002-2026 with zero water or fishing copy', async () => {
  const { getTimestampSummary } = await import('../summaries.js');
  const seenTexts = new Set();

  for (const cid of ['usa', 'canada', 'russia']) {
    for (let yr = 2002; yr <= 2026; yr += 1) {
      const s = getTimestampSummary(cid, yr, {
        meta: { path: cid, name: cid.toUpperCase() },
        emissions: { yearCount: 24, years: { [yr]: { co2: 100e6 } }, ranksByYear: { [yr]: { co2: 5 } } },
      });
      assert.ok(s.kicker.includes(String(yr)));
      assert.ok(s.text && s.text.length > 60);
      assert.equal(/salmon|fish|watershed|river|kd490/i.test(s.text), false, `${cid} ${yr} summary must not mention water/fishing`);
      assert.equal(seenTexts.has(s.text), false, `${cid} ${yr} summary text must be unique`);
      seenTexts.add(s.text);
    }
  }
  assert.equal(seenTexts.size, 75);
});

test('buildDataManifest discovers Russia 8 MODIS + 6 VIIRS + 9 air CSVs and Canada 15 spatial files + XLSX summary', async () => {
  const path = await import('node:path');
  const { buildDataManifest } = await import('../../vite.config.js');
  const manifest = buildDataManifest(path.resolve('data'));

  const ru = manifest.scopes.russia;
  assert.ok(ru, 'russia scope must be present');
  assert.equal(ru.fires.filter((f) => f.sensor === 'modis').length, 8);
  const ruViirs = ru.fires.filter((f) => f.sensor === 'viirs');
  assert.equal(ruViirs.length, 6);
  assert.deepEqual(ruViirs.map((f) => f.year).sort((a, b) => a - b), [2013, 2014, 2016, 2018, 2020, 2024]);
  for (const entry of ru.fires) {
    assert.ok(entry.gridUrl && entry.gridUrl.endsWith(`russia-${entry.year}.json`), `expected pre-grid URL for Russia ${entry.year}`);
  }
  assert.equal(ru.emissionsByYearFiles.length, 9);

  const ca = manifest.scopes.canada;
  assert.ok(ca, 'canada scope must be present');
  assert.ok(ca.summaryXlsx && ca.summaryXlsx.endsWith('Canada_forest_fires_summary.xlsx'));
  assert.deepEqual(
    ca.fires.filter((f) => f.sensor === 'modis').map((f) => f.year).sort((a, b) => a - b),
    [2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2026],
  );
  assert.deepEqual(ca.fires.filter((f) => f.sensor === 'viirs').map((f) => f.year), [2020]);
  assert.equal(ca.emissionsByYearFiles.length, 21);
});

test('buildScopeIndex indexes Russia MODIS+VIIRS and backfills Canada 2021-2025 counts from Canada_forest_fires_summary.xlsx', async () => {
  const idx = await getFullScopeIndex();

  const ru = idx.scopes.russia;
  assert.ok(ru);
  assert.equal(ru.series.fire_count.annual.length, 8);
  assert.equal(ru.series.viirs_count.annual.length, 6);
  assert.equal(ru.series.fire_frp.annual.length, 14);
  assert.ok(ru.years[2010] && ru.years[2010].modisTotal > 10000 && ru.years[2010].topStates.length > 0);
  assert.equal(ru.years[2020].viirsTotal, 765116);
  assert.equal(ru.years[2020].sensor, 'VIIRS');
  assert.ok(ru.years[2020].topStates.some((s) => /Sakha|Khabarovsk|Krasnoyarsk|Irkutsk|Amur/i.test(s.name)));

  const ca = idx.scopes.canada;
  assert.ok(ca);
  assert.equal(ca.series.fire_count.annual.length, 25, 'Canada MODIS fire_count must span all 25 years 2002-2026 via XLSX backfill');
  assert.equal(ca.series.viirs_count.annual.length, 15, 'Canada VIIRS viirs_count must span all 15 years 2012-2026 via XLSX backfill');
  assert.equal(ca.series.fire_frp.annual.length, 15, 'Canada fire_frp stays strictly anchored to raw point-level CSVs');
  assert.equal(ca.years[2020].sensor, 'VIIRS');
  assert.ok(ca.years[2020].viirsTotal > 20000);
  assert.equal(ca.years[2021].modisTotal, 51142);
  assert.equal(ca.years[2021].viirsTotal, 409688);
  assert.equal(ca.years[2023].modisTotal, 175737);
  assert.equal(ca.years[2023].viirsTotal, 1562074);
  assert.equal(ca.years[2023].summaryOnly, true);
  assert.ok(ca.allForests.length >= 40);
  assert.ok(ca.viirsOutageDates.length >= 60);
});

test('computeForecast scales monotonically across horizons (2027-2035) and warming stress (0-40%) with valid GeoJSON & smoke brief', async () => {
  const { computeForecast, buildDeterministicBrief } = await import('../forecast.js');
  const { store, INITIAL_STATE } = await import('../store.js');

  assert.equal(INITIAL_STATE.horizonYear, 2030);
  assert.equal(INITIAL_STATE.warmingPct, 15);
  assert.equal(INITIAL_STATE.showPredictedOverlay, false);
  store.reset();

  const mockScope = {
    meta: { path: 'canada', name: 'Canada', shortName: 'Canada', kind: 'country' },
    series: {
      variables: {
        fire_frp: {
          annual: [
            [2016, 1200000], [2017, 2100000], [2018, 2600000], [2019, 1400000],
            [2020, 1100000], [2021, 3200000], [2022, 1900000], [2023, 6400000],
            [2024, 3800000], [2025, 3400000],
          ],
        },
      },
    },
    emissions: {
      medians: { co2: 85_000_000 },
      years: {
        2021: { co2: 180_000_000, topRegions: [{ name: 'British Columbia', co2: 95_000_000 }, { name: 'Alberta', co2: 45_000_000 }] },
        2023: { co2: 410_000_000, topRegions: [{ name: 'Quebec', co2: 160_000_000 }, { name: 'British Columbia', co2: 120_000_000 }] },
      },
    },
  };
  const baseFires = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-122.4, 53.8] }, properties: { count: 950, frp_sum: 24000, state: 'British Columbia' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-74.5, 50.2] }, properties: { count: 1400, frp_sum: 38000, state: 'Quebec' } },
    ],
  };

  const f2027 = computeForecast({ scope: mockScope, baseFires, horizonYear: 2027, warmingPct: 10 });
  const f2035 = computeForecast({ scope: mockScope, baseFires, horizonYear: 2035, warmingPct: 10 });
  const fHot = computeForecast({ scope: mockScope, baseFires, horizonYear: 2035, warmingPct: 40 });

  assert.ok(f2035.projectedFrpMw > f2027.projectedFrpMw);
  assert.ok(fHot.projectedFrpMw > f2035.projectedFrpMw);
  assert.ok(fHot.plumeRiskScore >= f2027.plumeRiskScore);
  assert.ok(f2035.topZones.length >= 3);
  assert.equal(f2035.hotspotsGeoJson.type, 'FeatureCollection');
  assert.equal(f2035.hotspotsGeoJson.features.length, 2);
  assert.ok(f2035.hotspotsGeoJson.features[1].properties.risk_score >= f2035.hotspotsGeoJson.features[0].properties.risk_score);

  const brief = buildDeterministicBrief(f2035);
  assert.ok(brief.headline.includes('2035'));
  assert.ok(brief.riskOutlook.length > 40);
  assert.ok(brief.priorityZones.length >= 2);
  assert.ok(brief.smokeNote && brief.smokeNote.length > 20);
});
