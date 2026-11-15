import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareRivers, scoreRiversForYear } from './water.js';
import { enrichAndSortFires } from './fires.js';
import { annualSeries, annualValue, annualMedian, monthlySeries, parseCsv, computeBeforeAfterStats } from '../data.js';

test('scoreRiversForYear keeps low-exposure rivers blue (0) and high-exposure rivers purple (near 1)', () => {
  const rivers = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { id: 1, name: 'Clean River', order: 5, nearFire: [2012, 2023] },
        geometry: { type: 'LineString', coordinates: [[-100, 60], [-99, 60]] },
      },
      {
        type: 'Feature',
        properties: { id: 2, name: 'Moderate River', order: 6, nearFire: [2012, 2023] },
        geometry: { type: 'LineString', coordinates: [[-120, 54], [-119, 54]] },
      },
      {
        type: 'Feature',
        properties: { id: 3, name: 'High Pollution River', order: 8, nearFire: [2012, 2023] },
        geometry: { type: 'LineString', coordinates: [[-125, 52], [-124, 52]] },
      },
    ],
  };

  const preparedRivers = prepareRivers(rivers);
  const fires = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-119.5, 54.05] }, properties: { count: 950, frp_sum: 18000 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-124.5, 52.0] }, properties: { count: 4800, frp_sum: 85000 } },
    ],
  };
  const air = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-99.5, 60.0] }, properties: { aod: 0.05, pm25: 3.1 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-119.5, 54.0] }, properties: { aod: 0.21, pm25: 16.0 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-124.5, 52.0] }, properties: { aod: 0.36, pm25: 32.0 } },
    ],
  };

  const scored = scoreRiversForYear({ preparedRivers, fires, air, isBasin: false });
  const [clean, moderate, high] = scored.features.map((f) => f.properties.pollution);

  assert.equal(clean, 0, 'clean river far from fire and with low AOD must stay 0 (blue)');
  assert.ok(moderate > 0.25 && moderate < 0.72, `moderate river should be mid-gradient, got ${moderate}`);
  assert.ok(high >= 0.75, `high-exposure river should reach purple (>= 0.75), got ${high}`);
  assert.ok(clean < moderate && moderate < high);
});

test('structural Canada rivers.geojson scores cleanly across low-fire vs megafire inputs and CSV header templates exist', async () => {
  const rivers = JSON.parse(fs.readFileSync('data/canada/rivers.geojson', 'utf8'));
  const preparedRivers = prepareRivers(rivers);
  const lowFires = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-116.5, 56.5] }, properties: { count: 40, frp_sum: 350 } }],
  };
  const highFires = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-116.5, 56.5] }, properties: { count: 4200, frp_sum: 95000 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-122.0, 54.0] }, properties: { count: 3800, frp_sum: 82000 } },
    ],
  };
  const sLow = scoreRiversForYear({ preparedRivers, fires: lowFires, air: null, isBasin: false });
  const sHigh = scoreRiversForYear({ preparedRivers, fires: highFires, air: null, isBasin: false });
  const avgLow = sLow.features.reduce((a, f) => a + f.properties.pollution, 0) / sLow.features.length;
  const avgHigh = sHigh.features.reduce((a, f) => a + f.properties.pollution, 0) / sHigh.features.length;
  assert.ok(avgHigh > avgLow);

  const csvRows = [];
  await parseCsv('latitude,longitude,acq_date,frp\n54.2,-122.5,2023-07-15,42.5\n', (cells, cols) => {
    csvRows.push({ lat: Number(cells[cols.lat]), lon: Number(cells[cols.lon]), frp: Number(cells[cols.frp]) });
  });
  assert.deepEqual(csvRows, [{ lat: 54.2, lon: -122.5, frp: 42.5 }]);
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
  const sorted = enrichAndSortFires(fc, { isBasin: false });
  const counts = sorted.features.map((f) => f.properties.count);
  const densities = sorted.features.map((f) => f.properties.density_5km2);
  assert.deepEqual(counts, [100, 600, 2000]);
  assert.ok(densities[0] < densities[1] && densities[1] < densities[2]);
  assert.ok(densities[0] > 0.2 && densities[0] < 0.5, `expected ~0.28 per 5 km^2, got ${densities[0]}`);
  assert.ok(densities[2] > 5.0, `expected >5 per 5 km^2, got ${densities[2]}`);
});

test('buildDataManifest discovers copy-pasted csv_by_year folders, classifies summary files, and excludes outage CSVs', async () => {
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
    fs.writeFileSync(path.join(dir, 'USA_MODIS_2005.csv'), 'latitude,longitude,acq_date,frp_mw\n'); // header-only -> skipped
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

test('buildScopeIndex indexes full USA 2002-2026 MODIS fire detections, all 193 forests, VIIRS outage days, and Yukon basin', async () => {
  const path = await import('node:path');
  const { buildScopeIndex } = await import('../../vite.config.js');
  const idx = buildScopeIndex(path.resolve('data'));

  assert.ok(idx.scopes.usa, 'usa scope must be indexed');
  const usa = idx.scopes.usa;
  assert.equal(usa.series.fire_count.annual.length, 25, 'USA must cover all 25 years 2002-2026');
  assert.equal(usa.series.fire_count.annual[0][0], 2002);
  assert.equal(usa.series.fire_count.annual[24][0], 2026);
  assert.equal(usa.series.fire_frp.annual.length, 25);
  assert.ok(usa.series.fire_frp.monthly.length > 200, 'monthly fire_frp series must span 2002-2026');

  assert.equal(usa.summaryByYear.length, 25);
  assert.equal(usa.allForests.length, 193, 'all 193 forest rows from us_summary_by_forest.csv must be preserved');
  assert.ok(usa.allForests.some((f) => f.name.startsWith('Other forest land')), 'Other forest land must not be omitted');
  assert.equal(usa.viirsOutageDates.length, 51, 'all 51 VIIRS outage dates must be indexed');
  assert.ok(usa.forestYearsByYear[2002] && usa.forestYearsByYear[2002].length > 0);
  assert.ok(usa.forestYearsByYear[2020] && usa.forestYearsByYear[2020].length > 0);

  // Confirm 2005, 2020, 2021 year totals match us_summary_by_year.csv MODIS_total exactly
  assert.equal(usa.years[2005].detections, 29806);
  assert.equal(usa.years[2020].detections, 40908);
  assert.equal(usa.years[2021].detections, 48801);
  assert.ok(usa.years[2020].totalFrpMw > 7000000);

  assert.ok(idx.scopes['usa/yukon'], 'usa/yukon basin scope must be indexed');
  const yukon = idx.scopes['usa/yukon'];
  assert.ok(yukon.years[2004] && yukon.years[2004].detections > 500, 'Yukon 2004 pre-2012 fires must be indexed');
  assert.ok(yukon.years[2005] && yukon.years[2005].detections > 500, 'Yukon 2005 pre-2012 fires must be indexed');
});

test('computeBeforeAfterStats computes before/after Welch t-test and Mann-Whitney U for USA fire series', () => {
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
  assert.ok(frpStat.p < 0.01, `expected significant p < 0.01, got ${frpStat.p}`);
  assert.ok(frpStat.mannwhitney_p < 0.01);
  assert.ok(frpStat.cohens_d > 2);
});

test('buildScopeIndex indexes 2003-2026 GFAS emissions across USA, Canada, Russia, and basins without misclassifying emissions CSVs into fires[]', async () => {
  const path = await import('node:path');
  const { buildDataManifest, buildScopeIndex } = await import('../../vite.config.js');
  const dataDir = path.resolve('data');
  const manifest = buildDataManifest(dataDir);
  const idx = buildScopeIndex(dataDir);

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
    assert.ok(em.years[2023].topRegions.length > 0);
    assert.ok(em.years[2023].topForests.length > 0);
  }

  assert.equal(idx.scopes.usa.emissions.ranksByYear[2021].co2, 1, 'USA #1 GFAS CO2 year should be 2021');
  assert.equal(idx.scopes.canada.emissions.ranksByYear[2023].co2, 1, 'Canada #1 GFAS CO2 year should be 2023');
  assert.equal(idx.scopes.russia.emissions.ranksByYear[2021].co2, 1, 'Russia #1 GFAS CO2 year should be 2021');

  for (const basinId of ['usa/yukon', 'canada/fraser', 'russia/amur']) {
    if (idx.scopes[basinId]) {
      assert.ok(idx.scopes[basinId].emissions && idx.scopes[basinId].emissions.yearCount > 0, `${basinId} should include emissions`);
    }
  }
});

test('getTimestampSummary returns unique factual summaries for every year 2002-2026 across all three countries and basins', async () => {
  const { getTimestampSummary } = await import('../summaries.js');
  const seenTexts = new Set();

  for (const cid of ['usa', 'canada', 'russia']) {
    for (let yr = 2002; yr <= 2026; yr += 1) {
      const s = getTimestampSummary(cid, yr, {
        meta: { path: cid, name: cid.toUpperCase() },
        emissions: { yearCount: 24, years: { [yr]: { co2: 100e6 } }, ranksByYear: { [yr]: { co2: 5 } } },
      });
      assert.ok(s.kicker.includes(String(yr)), `${cid} ${yr} kicker should include year`);
      assert.ok(s.text && s.text.length > 60, `${cid} ${yr} summary text must be substantive`);
      assert.equal(seenTexts.has(s.text), false, `${cid} ${yr} summary text must be unique`);
      seenTexts.add(s.text);
    }
  }
  assert.equal(seenTexts.size, 75, 'Must have 75 distinct summaries (25 years x 3 countries)');

  for (const bPath of ['usa/yukon', 'canada/fraser', 'russia/amur']) {
    const bs = getTimestampSummary(bPath, 2021, { meta: { path: bPath, name: bPath } });
    assert.ok(bs.basinLabel && bs.basinNote, `${bPath} should provide a basin focus note`);
  }
});


