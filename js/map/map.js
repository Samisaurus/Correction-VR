// js/map/map.js
// Purpose: the one MapLibre map (#map) for all six scopes.

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const EMPTY = { type: 'FeatureCollection', features: [] };
const FONT = ['Noto Sans Regular'];
const LAYER_LOADERS = {
  './air.js': () => import('./air.js'),
  './water.js': () => import('./water.js'),
  './fires.js': () => import('./fires.js'),
};
const CSS = `
.map-canvas { position: absolute; inset: 0; }
.map-back {
  position: absolute; top: 10px; left: 10px; z-index: 3; font-size: 13px; font-weight: 600;
  padding: 5px 11px; background: var(--c-paper); border: 1px solid var(--c-edge);
  transition: background-color 160ms var(--ease-out), border-color 160ms var(--ease-out), transform 100ms var(--ease-spring);
}
.map-back:hover { background: var(--c-panel); border-color: var(--c-edge-hover); }
.map-back:active { transform: scale(0.95); transition-duration: 60ms; }
.map-back[hidden] { display: none; }
.map-note {
  position: absolute; top: 10px; right: 52px; z-index: 3; font-size: 12px; font-weight: 500;
  color: var(--c-muted); background: rgba(255, 255, 255, 0.94); border: 1px solid var(--c-edge);
  padding: 4px 10px; border-radius: 8px; backdrop-filter: blur(4px);
}
.map-note strong { color: var(--c-ink); font-weight: 600; }
.map-note[hidden] { display: none; }
#map .maplibregl-popup-content { font-family: var(--f-mono); font-size: 12px; color: var(--c-ink); padding: 7px 10px; border-radius: 8px; border: 1px solid var(--c-edge); box-shadow: 0 4px 12px rgba(15, 23, 42, 0.1); }
#map .maplibregl-ctrl-group { border-radius: 8px; box-shadow: none; border: 1px solid var(--c-edge); }
#map .maplibregl-ctrl-attrib { font-size: 10px; }
`;

function injectStyle() {
  if (document.querySelector('style[data-module="map"]')) return;
  const s = document.createElement('style');
  s.dataset.module = 'map';
  s.textContent = CSS;
  document.head.appendChild(s);
}

let dem = null;
function demSource() {
  if (dem || !window.mlcontour) return dem;
  dem = new window.mlcontour.DemSource({ url: DEM_URL, encoding: 'terrarium', maxzoom: 12, worker: true, cacheSize: 100, timeoutMs: 10000 });
  dem.setupMaplibre(window.maplibregl);
  return dem;
}

function addTerrain(map, COLORS) {
  const d = demSource();
  map.addSource('map-dem', { type: 'raster-dem', tiles: [d ? d.sharedDemProtocolUrl : DEM_URL], encoding: 'terrarium', tileSize: 256, maxzoom: 12,
    attribution: 'Terrain: AWS Terrain Tiles' });
  map.addLayer({ id: 'map-hillshade', type: 'hillshade', source: 'map-dem', paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': COLORS.contour } });
  if (!d) return;
  map.addSource('map-contours', { type: 'vector', maxzoom: 12, tiles: [d.contourProtocolUrl({ multiplier: 1, overzoom: 1,
    thresholds: { 5: [500, 2500], 7: [250, 1000], 9: [100, 500], 11: [50, 250] }, elevationKey: 'ele', levelKey: 'level', contourLayer: 'contours' })] });
  map.addLayer({ id: 'map-contour-minor', type: 'line', source: 'map-contours', 'source-layer': 'contours', filter: ['==', ['get', 'level'], 0],
    layout: { visibility: 'none' }, paint: { 'line-color': COLORS.contour, 'line-width': 0.6, 'line-opacity': 0.55 } });
  map.addLayer({ id: 'map-contour-major', type: 'line', source: 'map-contours', 'source-layer': 'contours', filter: ['>=', ['get', 'level'], 1],
    layout: { visibility: 'none' }, paint: { 'line-color': COLORS.contour, 'line-width': 1.2, 'line-opacity': 0.8 } });
}

function addOutlines(map, COLORS) {
  map.addSource('map-geo', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'map-country-line', type: 'line', source: 'map-geo', filter: ['==', ['get', 'kind'], 'country'],
    paint: { 'line-color': COLORS.country, 'line-width': 1.5 } });
  map.addLayer({ id: 'map-basin-fill', type: 'fill', source: 'map-geo', filter: ['==', ['get', 'kind'], 'basin'],
    paint: { 'fill-color': COLORS.basin, 'fill-opacity': 0.1 } });
  map.addLayer({ id: 'map-basin-line', type: 'line', source: 'map-geo', filter: ['==', ['get', 'kind'], 'basin'],
    paint: { 'line-color': COLORS.basin, 'line-width': 1.8, 'line-dasharray': [3, 2] } });
}

function addLabels(map, COLORS) {
  map.addLayer({ id: 'map-basin-label', type: 'symbol', source: 'map-geo', filter: ['==', ['get', 'kind'], 'basin'],
    layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 12, 'text-anchor': 'top', 'text-offset': [0, 0.4], 'symbol-placement': 'point' },
    paint: { 'text-color': COLORS.ink, 'text-halo-color': COLORS.paper, 'text-halo-width': 1.5 } });
  if (map.getSource('map-contours')) {
    map.addLayer({ id: 'map-contour-label', type: 'symbol', source: 'map-contours', 'source-layer': 'contours', filter: ['>=', ['get', 'level'], 1],
      layout: { visibility: 'none', 'symbol-placement': 'line', 'text-field': ['concat', ['to-string', ['get', 'ele']], ' m'], 'text-font': FONT, 'text-size': 10 },
      paint: { 'text-color': COLORS.contour, 'text-halo-color': COLORS.paper, 'text-halo-width': 1 } });
  }
}

export async function mount(el, ctx) {
  injectStyle();
  const { store, data, theme } = ctx;
  const { COLORS } = theme;
  if (!window.maplibregl) throw new Error('maplibre-gl is not loaded');
  for (const p of el.querySelectorAll(':scope > .placeholder')) p.remove();
  let container = el.querySelector('.map-canvas');
  if (!container) {
    container = document.createElement('div');
    container.className = 'map-canvas';
    el.insertBefore(container, el.firstChild);
  }
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'map-back';
  back.hidden = true;
  back.addEventListener('click', () => store.set({ view: 'country' }));
  const note = document.createElement('div');
  note.className = 'map-note';
  note.hidden = true;
  el.append(back, note);

  const regions = await data.getRegions();
  const first = regions && regions.countries ? regions.countries[0] : null;
  const cam = first ? first.camera : { center: [0, 40], zoom: 1.5, pitch: 0, bearing: 0 };
  const map = new window.maplibregl.Map({ container, style: STYLE_URL, center: cam.center, zoom: cam.zoom, pitch: cam.pitch, bearing: cam.bearing,
    maxPitch: 70, attributionControl: false });
  map.on('error', (e) => console.warn('map:', e && e.error ? e.error.message : e));
  map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new window.maplibregl.AttributionControl({ compact: true,
    customAttribution: 'Fires: NASA FIRMS · Air: MERRA-2 · Water: MODIS-Aqua · © OpenFreeMap © OpenMapTiles © OpenStreetMap contributors' }));
  ctx.map = map;
  const layers = [];
  let ready = false;
  let token = 0;

  async function loadLayer(path) {
    try {
      const mod = await LAYER_LOADERS[path]();
      const api = mod.addLayer(map, ctx);
      if (api && typeof api.update === 'function') layers.push(api);
    } catch (err) {
      console.info(`map: ${path} not ready (${err && err.message ? err.message : err})`);
    }
  }

  function applyView(state, meta, animate) {
    const basin = state.view === 'basin';
    if (!basin) map.setTerrain(null);
    map.setProjection({ type: basin ? 'mercator' : 'globe' });
    if (basin && map.getSource('map-dem')) map.setTerrain({ source: 'map-dem', exaggeration: 1.5 });
    for (const id of ['map-contour-minor', 'map-contour-major', 'map-contour-label']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', basin ? 'visible' : 'none');
    }
    map.setPaintProperty('map-basin-fill', 'fill-opacity', basin ? 0 : 0.1);
    map.setPaintProperty('map-basin-line', 'line-color', basin ? COLORS.ink : COLORS.basin);
    if (map.getLayer('map-basin-label')) map.setLayoutProperty('map-basin-label', 'visibility', basin ? 'none' : 'visible');
    const country = regions.countries.find((c) => c.id === state.countryId) || regions.countries[0];
    back.hidden = !basin;
    back.textContent = `← Back to ${country ? country.shortName : 'country'}`;
    note.hidden = basin || !meta || !meta.basin;
    if (meta && meta.basin) {
      note.innerHTML = `Click the orange outline to open the <strong>${meta.basin.shortName}</strong> case study`;
    } else {
      note.textContent = '';
    }
    const camera = meta ? meta.camera : cam;
    if (animate) map.flyTo({ ...camera, duration: 950, essential: true });
    else map.jumpTo(camera);
  }

  async function refresh(state, viewChanged) {
    const my = ++token;
    const [scope, fires, air] = await Promise.all([data.getScope(state), data.getFires(state, state.year), data.getAir(state, state.year)]);
    if (my !== token || !ready) return;
    const meta = scope ? scope.meta : null;
    if (viewChanged) applyView(state, meta, viewChanged !== 'first');
    const geo = scope && scope.geo ? scope.geo : EMPTY;
    const features = (geo.features || []).map((f) => (f.properties && f.properties.kind === 'basin' && meta && meta.basin
      ? { ...f, properties: { ...f.properties, label: `Case study: ${meta.basin.shortName} — click to zoom` } } : f));
    map.getSource('map-geo').setData({ type: 'FeatureCollection', features });
    for (const api of layers) {
      try { api.update(state, { scope, fires, air }); } catch (err) { console.info('map: layer update failed', err && err.message ? err.message : err); }
    }
  }

  map.on('load', async () => {
    addTerrain(map, COLORS);
    await loadLayer('./air.js');
    await loadLayer('./water.js');
    addOutlines(map, COLORS);
    await loadLayer('./fires.js');
    addLabels(map, COLORS);
    map.on('click', 'map-basin-fill', () => { if (store.get().view !== 'basin') store.set({ view: 'basin' }); });
    map.on('mouseenter', 'map-basin-fill', () => { if (store.get().view !== 'basin') map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'map-basin-fill', () => { map.getCanvas().style.cursor = ''; });
    ready = true;
    el.dataset.mapReady = 'true';
    refresh(store.get(), 'first');
  });

  store.subscribe((state, prev) => {
    const viewChanged = state.countryId !== prev.countryId || state.view !== prev.view;
    if (viewChanged || state.year !== prev.year) refresh(state, viewChanged);
  });
  if (typeof ResizeObserver !== 'undefined') {
    let t = null;
    new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => map.resize(), 100); }).observe(el);
  }
}
