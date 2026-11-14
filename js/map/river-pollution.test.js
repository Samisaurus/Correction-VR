import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareRivers, scoreRiversForYear } from './river-pollution.js';
import { annualSeries, annualValue, annualMedian, monthlySeries } from '../data.js';

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

test('real dataset separation: Canada 2023 megafire year has substantially higher river pollution than 2012', () => {
  const rivers = JSON.parse(fs.readFileSync('data/canada/rivers.geojson', 'utf8'));
  const fires2012 = JSON.parse(fs.readFileSync('data/canada/fires/2012.geojson', 'utf8'));
  const air2012 = JSON.parse(fs.readFileSync('data/canada/air/2012.geojson', 'utf8'));
  const fires2023 = JSON.parse(fs.readFileSync('data/canada/fires/2023.geojson', 'utf8'));
  const air2023 = JSON.parse(fs.readFileSync('data/canada/air/2023.geojson', 'utf8'));

  const preparedRivers = prepareRivers(rivers);
  const s12 = scoreRiversForYear({ preparedRivers, fires: fires2012, air: air2012, isBasin: false });
  const s23 = scoreRiversForYear({ preparedRivers, fires: fires2023, air: air2023, isBasin: false });

  const scores12 = s12.features.map((f) => f.properties.pollution);
  const scores23 = s23.features.map((f) => f.properties.pollution);
  const avg12 = scores12.reduce((a, b) => a + b, 0) / scores12.length;
  const avg23 = scores23.reduce((a, b) => a + b, 0) / scores23.length;
  const min23 = Math.min(...scores23);
  const max23 = Math.max(...scores23);

  assert.ok(avg23 > avg12, `expected 2023 avg (${avg23}) > 2012 avg (${avg12})`);
  assert.ok(min23 < 0.4, `expected low-exposure rivers in 2023 to stay blue/low (<0.4), got min=${min23}`);
  assert.ok(max23 > 0.65, `expected high-exposure rivers in 2023 to reach purple (>0.65), got max=${max23}`);
});

test('accurate 50m country borders GeoJSON has all 3 countries and zero antimeridian jumps', () => {
  const fc = JSON.parse(fs.readFileSync('public/country-borders.geojson', 'utf8'));
  assert.equal(fc.type, 'FeatureCollection');
  const ids = fc.features.map((f) => f.properties.id).sort();
  assert.deepEqual(ids, ['canada', 'russia', 'usa']);

  for (const f of fc.features) {
    const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
    for (const poly of polys) {
      for (const ring of poly) {
        for (let i = 1; i < ring.length; i += 1) {
          const jump = Math.abs(ring[i][0] - ring[i - 1][0]);
          assert.ok(jump < 10, `${f.properties.id} has unexpected lon jump ${jump}`);
        }
      }
    }
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
