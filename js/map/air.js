// js/map/air.js
// Purpose: smoke-coloured AOD cells of the selected year under everything else; opacity follows AOD on a
//          fixed 0–0.6 scale so years are comparable; hover popup. Own ids: air-*.
// Exports: addLayer(map, ctx) -> { update(state, payload) }
// Owner: Claude · Task C7

const EMPTY = { type: 'FeatureCollection', features: [] };

export function addLayer(map, ctx) {
  const { COLORS, fmt } = ctx.theme;
  map.addSource('air-src', { type: 'geojson', data: EMPTY, attribution: 'Air: MERRA-2 (NASA GES DISC)' });
  map.addLayer({ id: 'air-cells', type: 'fill', source: 'air-src',
    paint: { 'fill-color': COLORS.smoke, 'fill-antialias': false,
      'fill-opacity': ['interpolate', ['linear'], ['get', 'aod'], 0, 0, 0.6, 0.45] } });

  const popup = new window.maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 6 });
  map.on('mousemove', 'air-cells', (e) => {
    const f = e.features && e.features[0];
    if (!f) return;
    const p = f.properties;
    const pm = p.pm25 === null || p.pm25 === undefined || p.pm25 === 'null' ? '' : ` · PM2.5 ${fmt(p.pm25, 'pm25')} ug/m3`;
    popup.setLngLat(e.lngLat).setHTML(`AOD ${fmt(p.aod, 'aod')} (May–Sep mean)${pm}`).addTo(map);
  });
  map.on('mouseleave', 'air-cells', () => popup.remove());

  return {
    update(state, payload) {
      const air = payload && payload.air && Array.isArray(payload.air.features) ? payload.air : EMPTY;
      map.getSource('air-src').setData(air);
      popup.remove();
    },
  };
}
