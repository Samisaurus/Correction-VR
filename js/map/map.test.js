import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareRivers, scoreRiversForYear } from './water.js';
import { enrichAndSortFires } from './fires.js';
import { annualSeries, annualValue, annualMedian, monthlySeries, parseCsv } from '../data.js';

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

test('buildDataManifest discovers copy-pasted csv_by_year folders and ignores header-only templates', async () => {
  const os = await import('node:os');
  const path = await import('node:path');
  const { buildDataManifest } = await import('../../vite.config.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-manifest-'));
  try {
    const dir = path.join(tmp, 'USA_forest_fires_final', 'csv_by_year');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'USA_VIIRS_2021.csv'), 'latitude,longitude,acq_date,frp\n63.1,-155.2,2021-07-04,18.4\n');
    fs.writeFileSync(path.join(dir, 'USA_MODIS_2021.csv'), 'latitude,longitude,acq_date,frp\n63.1,-155.2,2021-07-04,22.0\n');
    fs.writeFileSync(path.join(dir, 'USA_MODIS_2005.csv'), 'latitude,longitude,acq_date,frp\n'); // header-only -> skipped
    const manifest = buildDataManifest(tmp);
    assert.ok(manifest.scopes.usa, 'usa scope should be discovered from USA_forest_fires_final');
    assert.equal(manifest.scopes.usa.fires.length, 2);
    assert.deepEqual(
      manifest.scopes.usa.fires.map((f) => [f.sensor, f.year]).sort(),
      [['modis', 2021], ['viirs', 2021]],
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
