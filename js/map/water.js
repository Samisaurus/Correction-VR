// js/map/water.js
// Purpose: rivers, river segments near fires, and basin water measurement box with optimized updates.

const EMPTY = { type: 'FeatureCollection', features: [] };
const WIDTH = ['interpolate', ['linear'], ['get', 'order'], 1, 0.6, 4, 1.15, 6, 1.8, 9, 3.2];

export function addLayer(map, ctx) {
  const { data, theme } = ctx;
  const { COLORS, fmt } = theme;
  map.addSource('water-rivers', { type: 'geojson', data: EMPTY, attribution: 'Rivers: Natural Earth, HydroSHEDS' });
  map.addSource('water-geo', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'water-box', type: 'fill', source: 'water-geo', filter: ['==', ['get', 'kind'], 'water'],
    paint: { 'fill-color': COLORS.water, 'fill-opacity': 0.3 } });
  map.addLayer({ id: 'water-box-line', type: 'line', source: 'water-geo', filter: ['==', ['get', 'kind'], 'water'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COLORS.water, 'line-width': 1.4 } });
  map.addLayer({ id: 'water-rivers', type: 'line', source: 'water-rivers',
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': COLORS.river, 'line-width': WIDTH } });
  map.addLayer({ id: 'water-polluted', type: 'line', source: 'water-rivers', filter: ['in', 2000, ['get', 'nearFire']],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': COLORS.polluted, 'line-width': ['+', WIDTH, 1.5] } });

  const popup = new window.maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 6 });
  let info = {};
  let lastScopeKey = null;

  map.on('click', 'water-box', (e) => {
    const f = e.features && e.features[0];
    if (!f) return;
    const i = info[f.properties.id] || { name: f.properties.name, kd: null, chl: null };
    popup.setLngLat(e.lngLat).setHTML(`<strong>${i.name}</strong><br>Kd490 ${fmt(i.kd, 'kd490')} m⁻¹ · Chl-a ${fmt(i.chl, 'chlor_a')} mg/m³<br>`
      + `<span style="opacity:.75">Satellite average over this box</span>`).addTo(map);
  });
  map.on('mouseenter', 'water-box', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'water-box', () => { map.getCanvas().style.cursor = ''; });
  map.on('mouseenter', 'water-polluted', (e) => {
    const f = e.features && e.features[0];
    if (f && f.properties.name) map.getCanvas().title = `${f.properties.name}: fire within reach in ${JSON.parse(f.properties.nearFire).join(', ')}`;
  });
  map.on('mouseleave', 'water-polluted', () => { map.getCanvas().title = ''; });

  return {
    update(state, payload) {
      const scope = payload && payload.scope;
      const scopeKey = scope && scope.meta ? scope.meta.path : null;
      const geo = scope && scope.geo && Array.isArray(scope.geo.features) ? scope.geo : EMPTY;
      const boxes = geo.features.filter((f) => f.properties && f.properties.kind === 'water');

      // Only upload static river and water-box geometry when scope actually changes
      if (scopeKey !== lastScopeKey) {
        lastScopeKey = scopeKey;
        const rivers = scope && scope.rivers && Array.isArray(scope.rivers.features) ? scope.rivers : EMPTY;
        map.getSource('water-rivers').setData(rivers);
        map.getSource('water-geo').setData({ type: 'FeatureCollection', features: boxes });
      }

      map.setFilter('water-polluted', ['in', Number(state.year), ['get', 'nearFire']]);
      info = {};
      const match = ['match', ['get', 'id']];
      for (const f of boxes) {
        const id = f.properties.id;
        const annual = data.annualSeries(scope.series, 'kd490', id).map((d) => d.value).filter((v) => v !== null);
        const kd = data.annualValue(scope.series, 'kd490', state.year, id);
        const chl = data.annualValue(scope.series, 'chlor_a', state.year, id);
        info[id] = { name: f.properties.name, kd, chl };
        const lo = Math.min(...annual);
        const hi = Math.max(...annual);
        const t = kd === null || !annual.length || hi === lo ? 0.5 : (kd - lo) / (hi - lo);
        match.push(id, 0.15 + 0.6 * t);
      }
      match.push(0.3);
      map.setPaintProperty('water-box', 'fill-opacity', boxes.length ? match : 0.3);
      popup.remove();
    },
  };
}
