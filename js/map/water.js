// js/map/water.js
// Purpose: rivers (sky blue, width by stream order), river segments near that year's fires (purple, on top),
//          and in basin scope the water measurement box shaded by that year's Kd490 with a popup.
//          Own ids: water-*.
// Exports: addLayer(map, ctx) -> { update(state, payload) }
// Owner: Claude · Task C6

const EMPTY = { type: 'FeatureCollection', features: [] };
const WIDTH = ['interpolate', ['linear'], ['get', 'order'], 1, 0.5, 4, 1, 6, 1.6, 9, 3];

export function addLayer(map, ctx) {
  const { data, theme } = ctx;
  const { COLORS, fmt } = theme;
  map.addSource('water-rivers', { type: 'geojson', data: EMPTY, attribution: 'Rivers: Natural Earth, HydroSHEDS' });
  map.addSource('water-geo', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'water-box', type: 'fill', source: 'water-geo', filter: ['==', ['get', 'kind'], 'water'],
    paint: { 'fill-color': COLORS.water, 'fill-opacity': 0.3 } });
  map.addLayer({ id: 'water-box-line', type: 'line', source: 'water-geo', filter: ['==', ['get', 'kind'], 'water'],
    paint: { 'line-color': COLORS.water, 'line-width': 1 } });
  map.addLayer({ id: 'water-rivers', type: 'line', source: 'water-rivers',
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': COLORS.river, 'line-width': WIDTH } });
  map.addLayer({ id: 'water-polluted', type: 'line', source: 'water-rivers', filter: ['in', 2000, ['get', 'nearFire']],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': COLORS.polluted, 'line-width': ['+', WIDTH, 1.5] } });

  const popup = new window.maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 6 });
  let info = {}; // water body id -> { name, kd, chl }
  map.on('click', 'water-box', (e) => {
    const f = e.features && e.features[0];
    if (!f) return;
    const i = info[f.properties.id] || { name: f.properties.name, kd: null, chl: null };
    popup.setLngLat(e.lngLat).setHTML(`<strong>${i.name}</strong><br>Kd490 ${fmt(i.kd, 'kd490')} 1/m · Chl-a ${fmt(i.chl, 'chlor_a')} mg/m3<br>`
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
      const rivers = scope && scope.rivers && Array.isArray(scope.rivers.features) ? scope.rivers : EMPTY;
      map.getSource('water-rivers').setData(rivers);
      map.setFilter('water-polluted', ['in', Number(state.year), ['get', 'nearFire']]);
      const geo = scope && scope.geo && Array.isArray(scope.geo.features) ? scope.geo : EMPTY;
      const boxes = geo.features.filter((f) => f.properties && f.properties.kind === 'water');
      map.getSource('water-geo').setData({ type: 'FeatureCollection', features: boxes });
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
