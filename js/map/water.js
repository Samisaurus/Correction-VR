// js/map/water.js
// Purpose: rivers rendered with a continuous data-driven blue-to-purple pollution gradient
//          (low = blue, high = purple) plus basin water measurement box with hover tooltips.

import { prepareRivers, scoreRiversForYear } from './river-pollution.js';

const EMPTY = { type: 'FeatureCollection', features: [] };
const WIDTH = ['interpolate', ['linear'], ['get', 'order'], 1, 0.7, 4, 1.25, 6, 2.0, 9, 3.4];

export function addLayer(map, ctx) {
  const { data, theme } = ctx;
  const { COLORS, fmt } = theme;
  map.addSource('water-rivers', { type: 'geojson', data: EMPTY, attribution: 'Rivers: Natural Earth, HydroSHEDS' });
  map.addSource('water-geo', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'water-box',
    type: 'fill',
    source: 'water-geo',
    filter: ['==', ['get', 'kind'], 'water'],
    paint: { 'fill-color': COLORS.water, 'fill-opacity': 0.3 },
  });
  map.addLayer({
    id: 'water-box-line',
    type: 'line',
    source: 'water-geo',
    filter: ['==', ['get', 'kind'], 'water'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COLORS.water, 'line-width': 1.4 },
  });
  map.addLayer({
    id: 'water-rivers-casing',
    type: 'line',
    source: 'water-rivers',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': 'rgba(255, 255, 255, 0.72)',
      'line-width': ['+', WIDTH, ['*', ['coalesce', ['get', 'pollution'], 0], 1.5], 1.2],
    },
  });
  map.addLayer({
    id: 'water-rivers',
    type: 'line',
    source: 'water-rivers',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': [
        'interpolate', ['linear'], ['coalesce', ['get', 'pollution'], 0],
        0.0, COLORS.river,
        0.26, '#5B8FD9',
        0.52, '#6A58B7',
        0.78, COLORS.polluted,
      ],
      'line-width': ['+', WIDTH, ['*', ['coalesce', ['get', 'pollution'], 0], 1.5]],
      'line-opacity': ['interpolate', ['linear'], ['coalesce', ['get', 'pollution'], 0], 0, 0.88, 1, 1],
    },
  });

  const popup = new window.maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 6 });
  let info = {};
  let lastScopeKey = null;
  let lastBoxes = [];
  let preparedRivers = [];
  let scoredByYear = new Map();

  map.on('click', 'water-box', (e) => {
    const f = e.features && e.features[0];
    if (!f) return;
    const i = info[f.properties.id] || { name: f.properties.name, kd: null, chl: null };
    popup.setLngLat(e.lngLat).setHTML(`<strong>${i.name}</strong><br>Kd490 ${fmt(i.kd, 'kd490')} m⁻¹ · Chl-a ${fmt(i.chl, 'chlor_a')} mg/m³<br>`
      + `<span style="opacity:.75">Satellite average over this box</span>`).addTo(map);
  });
  map.on('mouseenter', 'water-box', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'water-box', () => { map.getCanvas().style.cursor = ''; });
  map.on('mousemove', 'water-rivers', (e) => {
    const f = e.features && e.features[0];
    if (!f || !f.properties || !f.properties.name) return;
    const pct = Math.round((Number(f.properties.pollution) || 0) * 100);
    const tier = pct >= 65 ? 'high' : pct >= 30 ? 'moderate' : 'low';
    map.getCanvas().title = `${f.properties.name} · ${pct}% wildfire/smoke exposure (${tier})`;
  });
  map.on('mouseleave', 'water-rivers', () => { map.getCanvas().title = ''; });

  return {
    update(state, payload) {
      const scope = payload && payload.scope;
      const scopeKey = scope && scope.meta ? scope.meta.path : null;
      const isBasin = !!(scope && scope.meta && scope.meta.kind === 'basin');

      if (scopeKey !== lastScopeKey) {
        lastScopeKey = scopeKey;
        const geo = scope && scope.geo && Array.isArray(scope.geo.features) ? scope.geo : EMPTY;
        lastBoxes = geo.features.filter((f) => f.properties && f.properties.kind === 'water');
        map.getSource('water-geo').setData({ type: 'FeatureCollection', features: lastBoxes });
        const rivers = scope && scope.rivers && Array.isArray(scope.rivers.features) ? scope.rivers : EMPTY;
        preparedRivers = prepareRivers(rivers);
        scoredByYear = new Map();
      }

      info = {};
      let kdNormAvg = null;
      if (lastBoxes.length && scope && scope.series) {
        const match = ['match', ['get', 'id']];
        let kdSum = 0;
        let kdCount = 0;
        for (const f of lastBoxes) {
          const id = f.properties.id;
          const annual = data.annualSeries(scope.series, 'kd490', id);
          let lo = Infinity;
          let hi = -Infinity;
          for (let i = 0; i < annual.length; i += 1) {
            const v = annual[i].value;
            if (v !== null) {
              if (v < lo) lo = v;
              if (v > hi) hi = v;
            }
          }
          const kd = data.annualValue(scope.series, 'kd490', state.year, id);
          const chl = data.annualValue(scope.series, 'chlor_a', state.year, id);
          info[id] = { name: f.properties.name, kd, chl };
          const t = kd === null || !Number.isFinite(lo) || hi === lo ? 0.5 : (kd - lo) / (hi - lo);
          kdSum += t;
          kdCount += 1;
          match.push(id, 0.15 + 0.6 * t);
        }
        if (kdCount > 0) kdNormAvg = kdSum / kdCount;
        match.push(0.3);
        map.setPaintProperty('water-box', 'fill-opacity', match);
      } else {
        map.setPaintProperty('water-box', 'fill-opacity', 0.3);
      }

      const yr = Number(state.year);
      let scored = scoredByYear.get(yr);
      if (!scored) {
        scored = scoreRiversForYear({
          preparedRivers,
          fires: payload && payload.fires,
          air: payload && payload.air,
          isBasin,
          kdNorm: kdNormAvg,
        });
        scoredByYear.set(yr, scored);
      }
      map.getSource('water-rivers').setData(scored);
      popup.remove();
    },
  };
}
