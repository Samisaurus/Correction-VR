// js/map/map.js
// Purpose: optimized MapLibre map (#map) with accurate 1:50m country borders,
//          distinct colors for Canada/USA/Russia, topographic contours, and predicted hotspot overlay.

import { addLayer as addAirLayer } from './air.js';
import { addLayer as addFiresLayer } from './fires.js';
import { addLayer as addPredictedLayer } from './predicted.js';
import { computeForecast } from '../forecast.js';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const EMPTY = { type: 'FeatureCollection', features: [] };
const FONT = ['Noto Sans Regular'];
const CSS = `
.map-canvas { position: absolute; inset: 0; }
#map .maplibregl-popup-content { font-family: var(--f-mono); font-size: 12px; color: var(--c-ink); padding: 7px 10px; border-radius: 6px; border: 1px solid var(--c-edge); box-shadow: 0 4px 12px rgba(15, 23, 42, 0.1); }
#map .maplibregl-ctrl-group { border-radius: 6px; box-shadow: none; border: 1px solid var(--c-edge); }
#map .maplibregl-ctrl-attrib { font-size: 10px; }
`;

let dem = null;
function demSource() {
  if (dem || !window.mlcontour) return dem;
  dem = new window.mlcontour.DemSource({ url: DEM_URL, encoding: 'terrarium', maxzoom: 12, worker: true, cacheSize: 150, timeoutMs: 10000 });
  dem.setupMaplibre(window.maplibregl);
  return dem;
}

function addTerrain(map, COLORS) {
  const d = demSource();
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
    paint: { 'line-color': COLORS.contourMinor || COLORS.contour, 'line-width': 0.65, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 3.5, 0, 5, 0.24, 8, 0.36] },
  });
  map.addLayer({
    id: 'map-contour-major',
    type: 'line',
    source: 'map-contours',
    'source-layer': 'contours',
    filter: ['>=', ['get', 'level'], 1],
    layout: { visibility: 'visible', 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COLORS.contour, 'line-width': 1.25, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 3.5, 0, 5, 0.42, 8, 0.68] },
  });
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

function addCountryLayers(map) {
  map.addSource('map-countries', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'map-countries-fill',
    type: 'fill',
    source: 'map-countries',
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.1 },
  });
  map.addLayer({
    id: 'map-countries-casing',
    type: 'line',
    source: 'map-countries',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#FFFFFF', 'line-width': 2.6, 'line-opacity': 0.72 },
  });
  map.addLayer({
    id: 'map-countries-line',
    type: 'line',
    source: 'map-countries',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 1.6, 'line-opacity': 0.88 },
  });
}

function pickReferenceFireYear(scope, fallbackYear) {
  const byYear = scope?.summary?.byYear;
  if (!byYear || !byYear.size) return fallbackYear;
  let bestYr = null;
  let bestScore = -1;
  for (const [yr, row] of byYear.entries()) {
    if (yr < 2013 || yr > 2025) continue;
    const frp = Number(row?.totalFrpMw) || 0;
    const det = Number(row?.detections || row?.viirsTotal || row?.modisTotal) || 0;
    const score = frp > 0 ? frp : det;
    if (score > bestScore) {
      bestScore = score;
      bestYr = yr;
    }
  }
  return bestYr ?? fallbackYear;
}

export async function mount(el, ctx) {
  const { store, data, theme } = ctx;
  const { COLORS, COUNTRY_COLORS, injectCss } = theme;
  injectCss('map', CSS);
  if (!window.maplibregl) throw new Error('maplibre-gl is not loaded');
  for (const p of el.querySelectorAll(':scope > .placeholder')) p.remove();
  let container = el.querySelector('.map-canvas');
  if (!container) {
    container = document.createElement('div');
    container.className = 'map-canvas';
    el.insertBefore(container, el.firstChild);
  }

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
    fadeDuration: 120,
    maxTileCacheSize: 150,
    attributionControl: false,
  });
  map.on('error', (e) => console.warn('map:', e && e.error ? e.error.message : e));
  map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new window.maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  let userOpenedAttrib = false;
  function syncAttribState() {
    const attr = el.querySelector('.maplibregl-ctrl-attrib');
    if (!attr || userOpenedAttrib) return;
    attr.classList.add('maplibregl-compact');
    attr.classList.remove('maplibregl-compact-show');
    attr.removeAttribute('open');
  }
  const attrBtn = el.querySelector('.maplibregl-ctrl-attrib-button');
  if (attrBtn) {
    attrBtn.addEventListener('click', () => {
      const attr = attrBtn.closest('.maplibregl-ctrl-attrib');
      requestAnimationFrame(() => {
        userOpenedAttrib = !!(attr && (attr.hasAttribute('open') || attr.classList.contains('maplibregl-compact-show')));
      });
    });
  }
  syncAttribState();
  ctx.map = map;
  const layers = [];
  let ready = false;
  let refreshing = false;
  let queued = null;

  function registerLayer(addFn) {
    try {
      const api = addFn(map, ctx);
      if (api && typeof api.update === 'function') layers.push(api);
    } catch (err) {
      console.info(`map: layer failed (${err && err.message ? err.message : err})`);
    }
  }

  function styleCountryFocus(state) {
    const active = state.countryId;
    map.setPaintProperty('map-countries-fill', 'fill-opacity', ['case', ['==', ['get', 'id'], active], 0.14, 0.06]);
    map.setPaintProperty('map-countries-line', 'line-width', ['case', ['==', ['get', 'id'], active], 1.85, 1.0]);
    map.setPaintProperty('map-countries-line', 'line-opacity', ['case', ['==', ['get', 'id'], active], 0.92, 0.48]);
    map.setPaintProperty('map-countries-casing', 'line-width', ['case', ['==', ['get', 'id'], active], 3.2, 1.8]);
  }

  function applyView(state, meta, animate) {
    const curProj = typeof map.getProjection === 'function' ? map.getProjection() : null;
    if (!curProj || curProj.type !== 'globe') map.setProjection({ type: 'globe' });
    styleCountryFocus(state);
    const camera = meta ? meta.camera : cam;
    if (animate) map.flyTo({ ...camera, duration: 900, essential: true });
    else map.jumpTo(camera);
  }

  async function loadAllCountries() {
    const items = await data.getAllCountriesGeo();
    const features = [];
    for (const { country, geo } of items) {
      const color = (COUNTRY_COLORS && COUNTRY_COLORS[country.id]) || COLORS.country;
      for (const f of geo.features) {
        if (f.properties && f.properties.kind === 'country') {
          features.push({ type: 'Feature', geometry: f.geometry, properties: { ...f.properties, id: country.id, color } });
        }
      }
    }
    if (map.getSource('map-countries')) {
      map.getSource('map-countries').setData({ type: 'FeatureCollection', features });
    }
  }

  async function runRefresh(state, viewChanged) {
    const [scope, fires, air] = await Promise.all([
      data.getScope(state),
      data.getFires(state, state.year),
      data.getAir(state, state.year),
    ]);
    if (!ready) return;

    let refFires = fires;
    let forecastMultiplier = 1.25;
    if (state.showPredictedOverlay && scope) {
      if (!refFires || !refFires.features || !refFires.features.length) {
        const refYr = pickReferenceFireYear(scope, state.year);
        if (refYr !== state.year) {
          const candidate = await data.getFires(state, refYr);
          if (candidate && candidate.features && candidate.features.length) refFires = candidate;
        }
      } else {
        const refYr = pickReferenceFireYear(scope, state.year);
        if (refYr !== state.year) {
          const candidate = await data.getFires(state, refYr);
          if (candidate && candidate.features && candidate.features.length) refFires = candidate;
        }
      }
      forecastMultiplier = computeForecast({
        scope,
        horizonYear: state.horizonYear,
        warmingPct: state.warmingPct,
      }).multiplier;
    }

    const meta = scope ? scope.meta : null;
    if (viewChanged) applyView(state, meta, viewChanged !== 'first');

    for (let i = 0; i < layers.length; i += 1) {
      try {
        layers[i].update(state, { scope, fires, air, refFires, forecastMultiplier });
      } catch (err) {
        console.info('map: layer update failed', err && err.message ? err.message : err);
      }
    }
    const maxY = regions && Array.isArray(regions.years) ? regions.years[1] : 2026;
    if (state.playing && state.year < maxY) {
      data.getFires(state, state.year + 1);
      data.getAir(state, state.year + 1);
    }
  }

  async function refresh(state, viewChanged) {
    if (refreshing) {
      queued = { state, viewChanged: (queued && queued.viewChanged) || viewChanged };
      return;
    }
    refreshing = true;
    try {
      await runRefresh(state, viewChanged);
      while (queued) {
        const next = queued;
        queued = null;
        await runRefresh(next.state, next.viewChanged);
      }
    } finally {
      refreshing = false;
    }
  }

  map.on('load', async () => {
    if (map.getLayer('boundary_2')) {
      map.setPaintProperty('boundary_2', 'line-color', '#475569');
      map.setPaintProperty('boundary_2', 'line-opacity', ['interpolate', ['linear'], ['zoom'], 0, 0.55, 4, 0.9]);
    }

    addTerrain(map, COLORS);
    addCountryLayers(map);
    registerLayer(addAirLayer);
    registerLayer(addFiresLayer);
    registerLayer(addPredictedLayer);

    map.on('click', 'map-countries-fill', (e) => {
      const f = e.features && e.features[0];
      const cid = f && f.properties && f.properties.id;
      if (cid && cid !== store.get().countryId) store.set({ countryId: cid, playing: false });
    });
    map.on('mousemove', 'map-countries-fill', (e) => {
      const f = e.features && e.features[0];
      const cid = f && f.properties && f.properties.id;
      if (cid && cid !== store.get().countryId) map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'map-countries-fill', () => { map.getCanvas().style.cursor = ''; });

    await loadAllCountries();
    ready = true;
    el.dataset.mapReady = 'true';
    syncAttribState();
    refresh(store.get(), 'first');
  });

  store.subscribe((state, prev) => {
    const viewChanged = state.countryId !== prev.countryId;
    const outlookChanged = state.horizonYear !== prev.horizonYear
      || state.warmingPct !== prev.warmingPct
      || state.showPredictedOverlay !== prev.showPredictedOverlay;
    if (viewChanged || state.year !== prev.year || outlookChanged) refresh(state, viewChanged);
  });
  if (typeof ResizeObserver !== 'undefined') {
    let t = null;
    new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => {
        map.resize();
        syncAttribState();
      }, 100);
    }).observe(el);
  }
}
