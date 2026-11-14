// js/map/fires.js
// Purpose: fire cells of the selected year as circles sized by sqrt(count), coloured fire, opacity by
//          fire radiative power, with a soft glow underneath and a hover popup. Own ids: fires-*.
// Exports: addLayer(map, ctx) -> { update(state, payload) }
// Owner: Claude · Task C5

const EMPTY = { type: 'FeatureCollection', features: [] };

function radius(k) {
  // sqrt(count) scaled by zoom so 0.5° country cells and 0.1° basin cells both read well
  const s = ['sqrt', ['max', 1, ['get', 'count']]];
  const at = (f) => ['+', 1, ['*', f * k, s]];
  return ['interpolate', ['linear'], ['zoom'], 1, at(0.22), 3, at(0.4), 6, at(0.75), 9, at(1.3)];
}

export function addLayer(map, ctx) {
  const { COLORS } = ctx.theme;
  const { fmt } = ctx.theme;
  map.addSource('fires-src', { type: 'geojson', data: EMPTY, attribution: 'Fires: NASA FIRMS VIIRS' });
  map.addLayer({ id: 'fires-glow', type: 'circle', source: 'fires-src',
    paint: { 'circle-color': COLORS.fire, 'circle-blur': 1, 'circle-opacity': 0.22, 'circle-radius': radius(2.4) } });
  map.addLayer({ id: 'fires-dot', type: 'circle', source: 'fires-src',
    paint: { 'circle-color': COLORS.fire, 'circle-radius': radius(1), 'circle-opacity': 0.75, 'circle-stroke-width': 0 } });

  const popup = new window.maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
  map.on('mouseenter', 'fires-dot', (e) => {
    const f = e.features && e.features[0];
    if (!f) return;
    const p = f.properties;
    map.getCanvas().style.cursor = 'pointer';
    popup.setLngLat(e.lngLat)
      .setHTML(`${fmt(p.count, 'fire_count')} detections · ${fmt(p.frp_sum, 'fire_frp')} MW · ${p.first}–${p.last}`)
      .addTo(map);
  });
  map.on('mousemove', 'fires-dot', (e) => popup.setLngLat(e.lngLat));
  map.on('mouseleave', 'fires-dot', () => {
    map.getCanvas().style.cursor = '';
    popup.remove();
  });

  const maxCache = new WeakMap();
  let lastFires = null;

  return {
    update(state, payload) {
      const fires = payload && payload.fires && Array.isArray(payload.fires.features) ? payload.fires : EMPTY;
      if (fires !== lastFires) {
        lastFires = fires;
        map.getSource('fires-src').setData(fires);
        let max = maxCache.get(fires);
        if (max === undefined) {
          max = 0;
          const features = fires.features;
          for (let i = 0; i < features.length; i += 1) {
            const v = Number(features[i].properties && features[i].properties.frp_sum) || 0;
            if (v > max) max = v;
          }
          maxCache.set(fires, max);
        }
        map.setPaintProperty('fires-dot', 'circle-opacity', max > 0
          ? ['interpolate', ['linear'], ['get', 'frp_sum'], 0, 0.3, max, 0.95]
          : 0.6);
      }
      popup.remove();
    },
  };
}
