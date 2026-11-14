// js/map/map.js
// Purpose: optimized MapLibre map (#map) with smooth Chaikin-curved country/basin borders,
//          distinct colors for Canada/USA/Russia, refined topographic contours, and smooth terrain.

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

// ---- Smooth jagged/blocky polygon borders via Chaikin corner-cutting --------------------------

function smoothClosedRing(ring, iterations = 2) {
  if (!Array.isArray(ring) || ring.length < 4) return ring;
  let pts = ring.slice(0, -1);
  for (let it = 0; it < iterations; it += 1) {
    const next = [];
    const n = pts.length;
    for (let i = 0; i < n; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      // Preserve antimeridian jumps (-180 / +180) without cutting across the globe
      if (Math.abs(a[0] - b[0]) > 180) {
        next.push(a, b);
      } else {
        next.push(
          [a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25],
          [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75],
        );
      }
    }
    pts = next;
  }
  if (pts.length) pts.push(pts[0]);
  return pts;
}

function smoothGeometry(geom, iterations = 2) {
  if (!geom) return geom;
  if (geom.type === 'Polygon') {
    return { ...geom, coordinates: geom.coordinates.map((r) => smoothClosedRing(r, iterations)) };
  }
  if (geom.type === 'MultiPolygon') {
    return { ...geom, coordinates: geom.coordinates.map((poly) => poly.map((r) => smoothClosedRing(r, iterations))) };
  }
  return geom;
}

let dem = null;
function demSource() {
  if (dem || !window.mlcontour) return dem;
  dem = new window.mlcontour.DemSource({ url: DEM_URL, encoding: 'terrarium', maxzoom: 12, worker: true, cacheSize: 150, timeoutMs: 10000 });
  dem.setupMaplibre(window.maplibregl);
  return dem;
}

function addTerrain(map, COLORS) {
  const d = demSource();
  map.addSource('map-dem', { type: 'raster-dem', tiles: [d ? d.sharedDemProtocolUrl : DEM_URL], encoding: 'terrarium', tileSize: 256, maxzoom: 12,
    attribution: 'Terrain: AWS Terrain Tiles' });
  map.addLayer({
    id: 'map-hillshade',
    type: 'hillshade',
    source: 'map-dem',
    paint: {
      'hillshade-exaggeration': 0.42,
      'hillshade-shadow-color': COLORS.contour,
      'hillshade-highlight-color': COLORS.paper,
      'hillshade-illumination-anchor': 'viewport',
    },
  });
  if (!d) return;
  map.addSource('map-contours', {
    type: 'vector',
    maxzoom: 12,
    tiles: [d.contourProtocolUrl({
      multiplier: 1,
      overzoom: 1,
      thresholds: { 5: [400, 2000], 6: [250, 1250], 7: [150, 750], 8: [100, 500], 9: [50, 250], 11: [25, 100] },
      elevationKey: 'ele',
      levelKey: 'level',
      contourLayer: 'contours',
    })],
  });
  map.addLayer({
    id: 'map-contour-minor',
    type: 'line',
    source: 'map-contours',
    'source-layer': 'contours',
    filter: ['==', ['get', 'level'], 0],
    layout: { visibility: 'visible', 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COLORS.contourMinor || COLORS.contour, 'line-width': 0.65, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0, 5, 0.25, 8, 0.4] },
  });
  map.addLayer({
    id: 'map-contour-major',
    type: 'line',
    source: 'map-contours',
    'source-layer': 'contours',
    filter: ['>=', ['get', 'level'], 1],
    layout: { visibility: 'visible', 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COLORS.contour, 'line-width': 1.25, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0, 5, 0.45, 8, 0.72] },
  });
}

function addCountryLayers(map) {
  map.addSource('map-countries', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'map-countries-fill',
    type: 'fill',
    source: 'map-countries',
    paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': 0.1,
    },
  });
  map.addLayer({
    id: 'map-countries-casing',
    type: 'line',
    source: 'map-countries',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#FFFFFF',
      'line-width': 3.5,
      'line-opacity': 0.7,
    },
  });
  map.addLayer({
    id: 'map-countries-line',
    type: 'line',
    source: 'map-countries',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 2.0,
      'line-opacity': 0.85,
    },
  });
}

function addBasinOutlines(map, COLORS) {
  map.addSource('map-geo', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'map-basin-fill',
    type: 'fill',
    source: 'map-geo',
    filter: ['==', ['get', 'kind'], 'basin'],
    paint: { 'fill-color': COLORS.basin, 'fill-opacity': 0.12 },
  });
  map.addLayer({
    id: 'map-basin-casing',
    type: 'line',
    source: 'map-geo',
    filter: ['==', ['get', 'kind'], 'basin'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#FFFFFF', 'line-width': 3.6, 'line-opacity': 0.75 },
  });
  map.addLayer({
    id: 'map-basin-line',
    type: 'line',
    source: 'map-geo',
    filter: ['==', ['get', 'kind'], 'basin'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COLORS.basin, 'line-width': 2.0, 'line-dasharray': [3, 2] },
  });
}

function addLabels(map, COLORS) {
  map.addLayer({
    id: 'map-basin-label',
    type: 'symbol',
    source: 'map-geo',
    filter: ['==', ['get', 'kind'], 'basin'],
    layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 12, 'text-anchor': 'top', 'text-offset': [0, 0.4], 'symbol-placement': 'point' },
    paint: { 'text-color': COLORS.ink, 'text-halo-color': COLORS.paper, 'text-halo-width': 1.8 },
  });
  if (map.getSource('map-contours')) {
    map.addLayer({
      id: 'map-contour-label',
      type: 'symbol',
      source: 'map-contours',
      'source-layer': 'contours',
      filter: ['>=', ['get', 'level'], 1],
      layout: { visibility: 'none', 'symbol-placement': 'line', 'text-field': ['concat', ['to-string', ['get', 'ele']], ' m'], 'text-font': FONT, 'text-size': 10.5 },
      paint: { 'text-color': COLORS.contour, 'text-halo-color': COLORS.paper, 'text-halo-width': 1.4 },
    });
  }
}

export async function mount(el, ctx) {
  injectStyle();
  const { store, data, theme } = ctx;
  const { COLORS, COUNTRY_COLORS } = theme;
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
  const map = new window.maplibregl.Map({
    container,
    style: STYLE_URL,
    center: cam.center,
    zoom: cam.zoom,
    pitch: cam.pitch,
    bearing: cam.bearing,
    maxPitch: 70,
    fadeDuration: 150,
    maxTileCacheSize: 120,
    attributionControl: false,
  });
  map.on('error', (e) => console.warn('map:', e && e.error ? e.error.message : e));
  map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new window.maplibregl.AttributionControl({
    compact: true,
    customAttribution: 'Fires: NASA FIRMS · Air: MERRA-2 · Water: MODIS-Aqua · © OpenFreeMap © OpenMapTiles © OpenStreetMap contributors',
  }));
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

  function styleCountryFocus(state) {
    const basin = state.view === 'basin';
    const active = state.countryId;
    map.setPaintProperty('map-countries-fill', 'fill-opacity', basin
      ? 0.035
      : ['case', ['==', ['get', 'id'], active], 0.14, 0.06]);
    map.setPaintProperty('map-countries-line', 'line-width', ['case', ['==', ['get', 'id'], active], 2.2, 1.15]);
    map.setPaintProperty('map-countries-line', 'line-opacity', basin
      ? ['case', ['==', ['get', 'id'], active], 0.55, 0.25]
      : ['case', ['==', ['get', 'id'], active], 0.92, 0.5]);
    map.setPaintProperty('map-countries-casing', 'line-width', ['case', ['==', ['get', 'id'], active], 4.2, 2.2]);
  }

  function applyView(state, meta, animate) {
    const basin = state.view === 'basin';
    if (!basin) map.setTerrain(null);
    map.setProjection({ type: basin ? 'mercator' : 'globe' });
    if (basin && map.getSource('map-dem')) map.setTerrain({ source: 'map-dem', exaggeration: 1.7 });

    if (map.getLayer('map-contour-minor')) {
      map.setPaintProperty('map-contour-minor', 'line-opacity', basin
        ? 0.36
        : ['interpolate', ['linear'], ['zoom'], 3.5, 0, 5, 0.24, 8, 0.36]);
    }
    if (map.getLayer('map-contour-major')) {
      map.setPaintProperty('map-contour-major', 'line-opacity', basin
        ? 0.68
        : ['interpolate', ['linear'], ['zoom'], 3.5, 0, 5, 0.42, 8, 0.68]);
    }
    if (map.getLayer('map-contour-label')) {
      map.setLayoutProperty('map-contour-label', 'visibility', basin ? 'visible' : 'none');
    }

    styleCountryFocus(state);
    map.setPaintProperty('map-basin-fill', 'fill-opacity', basin ? 0 : 0.12);
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

  async function loadAllCountries() {
    const items = await data.getAllCountriesGeo();
    const features = [];
    for (const { country, geo } of items) {
      const color = (COUNTRY_COLORS && COUNTRY_COLORS[country.id]) || COLORS.country;
      for (const f of geo.features) {
        if (f.properties && f.properties.kind === 'country') {
          features.push({
            type: 'Feature',
            geometry: smoothGeometry(f.geometry, 2),
            properties: { ...f.properties, id: country.id, color },
          });
        }
      }
    }
    if (map.getSource('map-countries')) {
      map.getSource('map-countries').setData({ type: 'FeatureCollection', features });
    }
  }

  async function refresh(state, viewChanged) {
    const my = ++token;
    const [scope, fires, air] = await Promise.all([
      data.getScope(state),
      data.getFires(state, state.year),
      data.getAir(state, state.year),
    ]);
    if (my !== token || !ready) return;
    const meta = scope ? scope.meta : null;
    if (viewChanged) {
      applyView(state, meta, viewChanged !== 'first');
      const geo = scope && scope.geo ? scope.geo : EMPTY;
      const basinFeatures = (geo.features || [])
        .filter((f) => f.properties && f.properties.kind === 'basin')
        .map((f) => ({
          ...f,
          geometry: smoothGeometry(f.geometry, 2),
          properties: meta && meta.basin
            ? { ...f.properties, label: `Case study: ${meta.basin.shortName} — click to zoom` }
            : f.properties,
        }));
      map.getSource('map-geo').setData({ type: 'FeatureCollection', features: basinFeatures });
    }
    for (const api of layers) {
      try { api.update(state, { scope, fires, air }); } catch (err) { console.info('map: layer update failed', err && err.message ? err.message : err); }
    }
    // Warm next year quietly while playing so slider playback stays buttery
    const maxY = regions && Array.isArray(regions.years) ? regions.years[1] : 2025;
    if (state.playing && state.year < maxY) {
      data.getFires(state, state.year + 1);
      data.getAir(state, state.year + 1);
    }
  }

  map.on('load', async () => {
    addTerrain(map, COLORS);
    addCountryLayers(map);
    await loadLayer('./air.js');
    await loadLayer('./water.js');
    addBasinOutlines(map, COLORS);
    await loadLayer('./fires.js');
    addLabels(map, COLORS);

    // Clickable country colors on the globe + clickable case-study basin
    map.on('click', 'map-basin-fill', () => { if (store.get().view !== 'basin') store.set({ view: 'basin' }); });
    map.on('mouseenter', 'map-basin-fill', () => { if (store.get().view !== 'basin') map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'map-basin-fill', () => { map.getCanvas().style.cursor = ''; });

    map.on('click', 'map-countries-fill', (e) => {
      if (store.get().view === 'basin') return;
      const basinHit = map.queryRenderedFeatures(e.point, { layers: ['map-basin-fill'] });
      if (basinHit && basinHit.length) return;
      const f = e.features && e.features[0];
      const cid = f && f.properties && f.properties.id;
      if (cid && cid !== store.get().countryId) store.set({ countryId: cid, playing: false });
    });
    map.on('mousemove', 'map-countries-fill', (e) => {
      if (store.get().view === 'basin') return;
      const f = e.features && e.features[0];
      const cid = f && f.properties && f.properties.id;
      if (cid && cid !== store.get().countryId) map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'map-countries-fill', () => { map.getCanvas().style.cursor = ''; });

    await loadAllCountries();
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
