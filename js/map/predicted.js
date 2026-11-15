// js/map/predicted.js
// Purpose: predicted wildfire risk zones overlay (2027-2035) rendered cleanly over the MapLibre map.

import { buildPredictedHotspotsGeoJson } from '../forecast.js';

const EMPTY = { type: 'FeatureCollection', features: [] };

export function addLayer(map, ctx) {
  const { fmt, escHtml } = ctx.theme;
  map.addSource('predicted-src', { type: 'geojson', data: EMPTY });

  map.addLayer({
    id: 'predicted-halo',
    type: 'circle',
    source: 'predicted-src',
    layout: { visibility: 'none', 'circle-sort-key': ['coalesce', ['get', 'risk_score'], 0] },
    paint: {
      'circle-color': [
        'interpolate', ['linear'], ['coalesce', ['get', 'risk_score'], 50],
        45, 'rgba(106, 48, 147, 0.14)',
        70, 'rgba(147, 51, 234, 0.20)',
        88, 'rgba(217, 119, 6, 0.24)',
      ],
      'circle-stroke-color': [
        'interpolate', ['linear'], ['coalesce', ['get', 'risk_score'], 50],
        45, '#6A3093',
        85, '#B45309',
      ],
      'circle-stroke-width': 1.5,
      'circle-stroke-opacity': 0.85,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 5.5, 4, 10, 7, 16],
    },
  });

  map.addLayer({
    id: 'predicted-core',
    type: 'circle',
    source: 'predicted-src',
    layout: { visibility: 'none', 'circle-sort-key': ['coalesce', ['get', 'risk_score'], 0] },
    paint: {
      'circle-color': [
        'interpolate', ['linear'], ['coalesce', ['get', 'risk_score'], 50],
        45, '#6A3093',
        72, '#9333EA',
        90, '#D97706',
      ],
      'circle-opacity': 0.88,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.2, 4, 3.8, 7, 6.2],
      'circle-stroke-color': '#FFFFFF',
      'circle-stroke-width': 0.9,
    },
  });

  const popup = new window.maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
  map.on('mouseenter', 'predicted-halo', (e) => {
    const f = e.features && e.features[0];
    if (!f) return;
    const p = f.properties || {};
    const loc = [p.forest, p.region].filter(Boolean).map(escHtml).join(' · ');
    map.getCanvas().style.cursor = 'pointer';
    popup.setLngLat(e.lngLat)
      .setHTML(`<strong>Projected Hotspot (${escHtml(p.horizon)} · +${escHtml(p.warming_pct)}%)</strong><br>`
        + `Risk ${escHtml(p.risk_score)}/100 (${escHtml(p.tier)}) · +${escHtml(p.delta_pct)}% · ${fmt(p.projected_frp, 'fire_frp')} MW`
        + (loc ? `<br>${loc}` : ''))
      .addTo(map);
  });
  map.on('mousemove', 'predicted-halo', (e) => popup.setLngLat(e.lngLat));
  map.on('mouseleave', 'predicted-halo', () => {
    map.getCanvas().style.cursor = '';
    popup.remove();
  });

  let lastKey = null;

  return {
    update(state, payload) {
      const show = !!state.showPredictedOverlay;
      const vis = show ? 'visible' : 'none';
      if (map.getLayer('predicted-halo')) map.setLayoutProperty('predicted-halo', 'visibility', vis);
      if (map.getLayer('predicted-core')) map.setLayoutProperty('predicted-core', 'visibility', vis);

      if (!show) {
        popup.remove();
        return;
      }

      const baseFires = payload?.refFires || payload?.fires;
      const scopePath = payload?.scope?.meta?.path || state.countryId;
      const hYear = Number(state.horizonYear) || 2030;
      const wPct = Number(state.warmingPct) || 0;
      const mult = Number(payload?.forecastMultiplier) || 1.25;
      const key = `${scopePath}:${hYear}:${wPct}:${baseFires ? (baseFires.year || '') : 'none'}:${baseFires?.features?.length || 0}`;

      if (key !== lastKey) {
        lastKey = key;
        const fc = buildPredictedHotspotsGeoJson(baseFires, {
          horizonYear: hYear,
          warmingPct: wPct,
          multiplier: mult,
        });
        map.getSource('predicted-src').setData(fc);
      }
      popup.remove();
    },
  };
}
