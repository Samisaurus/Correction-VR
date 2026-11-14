// js/map/fires.js
// Purpose: fire cells sorted ascending by detection density per 10 km^2, preserving dotted style
//          while shading from yellow (low density) -> orange -> deep red (high density).

import { enrichAndSortFires } from './fire-density.js';

const EMPTY = { type: 'FeatureCollection', features: [] };

const DENSITY_COLOR = [
  'interpolate', ['linear'], ['coalesce', ['get', 'density_10km2'], 0],
  0.5, '#FACC15',
  1.8, '#F59E0B',
  4.0, '#EA580C',
  8.5, '#DC2626',
  16.0, '#991B1B',
];

function radius(k) {
  // sqrt(count) scaled by zoom so 0.5° country cells and 0.1° basin cells both read cleanly
  const s = ['sqrt', ['max', 1, ['get', 'count']]];
  const at = (f) => ['+', 1, ['*', f * k, s]];
  return ['interpolate', ['linear'], ['zoom'], 1, at(0.22), 3, at(0.4), 6, at(0.75), 9, at(1.3)];
}

export function addLayer(map, ctx) {
  const { fmt } = ctx.theme;
  map.addSource('fires-src', { type: 'geojson', data: EMPTY, attribution: 'Fires: NASA FIRMS VIIRS' });
  map.addLayer({
    id: 'fires-glow',
    type: 'circle',
    source: 'fires-src',
    layout: {
      'circle-sort-key': ['coalesce', ['get', 'density_10km2'], 0],
    },
    paint: {
      'circle-color': DENSITY_COLOR,
      'circle-blur': 1,
      'circle-opacity': ['interpolate', ['linear'], ['coalesce', ['get', 'density_10km2'], 0], 0.4, 0.14, 10, 0.28],
      'circle-radius': radius(2.2),
    },
  });
  map.addLayer({
    id: 'fires-dot',
    type: 'circle',
    source: 'fires-src',
    layout: {
      'circle-sort-key': ['coalesce', ['get', 'density_10km2'], 0],
    },
    paint: {
      'circle-color': DENSITY_COLOR,
      'circle-radius': radius(1),
      'circle-opacity': ['interpolate', ['linear'], ['coalesce', ['get', 'density_10km2'], 0], 0.4, 0.52, 4, 0.78, 12, 0.94],
      'circle-stroke-width': 0,
    },
  });

  const popup = new window.maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
  map.on('mouseenter', 'fires-dot', (e) => {
    const f = e.features && e.features[0];
    if (!f) return;
    const p = f.properties;
    const dens = Number(p.density_10km2 || 0).toFixed(1);
    map.getCanvas().style.cursor = 'pointer';
    popup.setLngLat(e.lngLat)
      .setHTML(`<strong>${dens} / 10 km²</strong> · ${fmt(p.count, 'fire_count')} detections · ${fmt(p.frp_sum, 'fire_frp')} MW · ${p.first}–${p.last}`)
      .addTo(map);
  });
  map.on('mousemove', 'fires-dot', (e) => popup.setLngLat(e.lngLat));
  map.on('mouseleave', 'fires-dot', () => {
    map.getCanvas().style.cursor = '';
    popup.remove();
  });

  let lastKey = null;

  return {
    update(state, payload) {
      const fires = payload && payload.fires && Array.isArray(payload.fires.features) ? payload.fires : null;
      const isBasin = !!(payload && payload.scope && payload.scope.meta && payload.scope.meta.kind === 'basin');
      const key = fires ? `${fires.scope || ''}:${fires.year || state.year}:${isBasin ? 'b' : 'c'}` : 'empty';
      if (key !== lastKey) {
        lastKey = key;
        const sorted = fires ? enrichAndSortFires(fires, { isBasin }) : EMPTY;
        map.getSource('fires-src').setData(sorted);
      }
      popup.remove();
    },
  };
}
