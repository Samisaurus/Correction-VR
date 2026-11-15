// js/map/air.js
// Purpose: smooth organic GFAS smoke & carbon plume heatmap from air grid cells with hover popup.

const EMPTY = { type: 'FeatureCollection', features: [] };

function featureCentroid(f) {
  if (!f || !f.geometry) return null;
  if (f.geometry.type === 'Point') return f.geometry.coordinates;
  const ring = f.geometry.type === 'Polygon'
    ? f.geometry.coordinates[0]
    : f.geometry.type === 'MultiPolygon'
      ? f.geometry.coordinates[0] && f.geometry.coordinates[0][0]
      : null;
  if (!ring || ring.length === 0) return null;
  let sx = 0;
  let sy = 0;
  let n = 0;
  const len = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.length - 1
    : ring.length;
  for (let i = 0; i < len; i += 1) {
    sx += ring[i][0];
    sy += ring[i][1];
    n += 1;
  }
  return n ? [sx / n, sy / n] : null;
}

const plumeCache = new WeakMap();

function toPointPlume(air) {
  if (!air || !Array.isArray(air.features) || air.features.length === 0) return EMPTY;
  const cached = plumeCache.get(air);
  if (cached) return cached;
  const features = [];
  for (const f of air.features) {
    const coords = featureCentroid(f);
    if (!coords) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords },
      properties: f.properties || {},
    });
  }
  const out = { type: 'FeatureCollection', features };
  plumeCache.set(air, out);
  return out;
}

export function addLayer(map, ctx) {
  const { fmt, fmtMass, escHtml } = ctx.theme;
  map.addSource('air-src', { type: 'geojson', data: EMPTY, attribution: 'Air: Copernicus CAMS GFAS' });

  map.addLayer({
    id: 'air-haze',
    type: 'heatmap',
    source: 'air-src',
    paint: {
      'heatmap-weight': ['max', ['coalesce', ['get', 'intensity'], 0], ['/', ['coalesce', ['get', 'aod'], 0], 0.75]],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 1, 0.95, 4, 0.8, 7, 0.65],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 1, 20, 3, 30, 5, 44, 8, 68],
      'heatmap-opacity': 0.85,
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0.0, 'rgba(138, 127, 114, 0)',
        0.15, 'rgba(138, 127, 114, 0.14)',
        0.4, 'rgba(126, 113, 99, 0.28)',
        0.7, 'rgba(104, 91, 78, 0.44)',
        1.0, 'rgba(78, 66, 56, 0.58)',
      ],
    },
  });

  map.addLayer({
    id: 'air-cells',
    type: 'circle',
    source: 'air-src',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 12, 4, 20, 7, 30],
      'circle-opacity': 0,
      'circle-stroke-width': 0,
    },
  });

  const popup = new window.maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 6 });
  map.on('mousemove', 'air-cells', (e) => {
    const f = e.features && e.features[0];
    if (!f) return;
    const p = f.properties || {};
    const hasMass = p.co2 !== undefined || Number(p.pm25) > 0;
    const loc = [p.forest, p.region].filter(Boolean).map(escHtml).join(' · ');
    if (hasMass) {
      const bcStr = p.bc !== undefined ? ` · BC ${fmtMass(p.bc, 'kt')}` : '';
      popup.setLngLat(e.lngLat)
        .setHTML(`<strong>PM₂.₅ ${fmtMass(p.pm25)}</strong> · CO₂ ${fmtMass(p.co2)}${bcStr}${loc ? `<br>${loc}` : ''}`)
        .addTo(map);
    } else if (p.aod !== undefined) {
      popup.setLngLat(e.lngLat)
        .setHTML(`<strong>AOD ${fmt(p.aod, 'aod')}</strong>${loc ? `<br>${loc}` : ''}`)
        .addTo(map);
    }
  });
  map.on('mouseleave', 'air-cells', () => popup.remove());

  let lastAir = null;
  return {
    update(state, payload) {
      const air = payload && payload.air ? toPointPlume(payload.air) : EMPTY;
      if (air !== lastAir) {
        lastAir = air;
        map.getSource('air-src').setData(air);
      }
      popup.remove();
    },
  };
}
