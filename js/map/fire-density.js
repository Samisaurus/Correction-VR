// js/map/fire-density.js
// Purpose: pure spatial calculation of wildfire detection density per 10 sq km
//          and ascending density sorting so high-density red hotspots layer atop low-density yellow dots.

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON = 111.32;

const enrichedCache = new WeakMap();

export function cellAreaKm2(lat, deg = 0.5) {
  const cosLat = Math.max(0.15, Math.cos((Number(lat) || 0) * (Math.PI / 180)));
  return (deg * KM_PER_DEG_LAT) * (deg * KM_PER_DEG_LON * cosLat);
}

/**
 * Compute detections per 10 km^2 for every fire feature and sort ascending by density
 * so higher-density red circles draw on top of lower-density yellow circles.
 */
export function enrichAndSortFires(fires, { isBasin = false, gridDeg = null } = {}) {
  if (!fires || !Array.isArray(fires.features) || fires.features.length === 0) {
    return { type: 'FeatureCollection', features: [] };
  }
  const deg = gridDeg || (isBasin ? 0.1 : 0.5);
  let perDeg = enrichedCache.get(fires);
  if (!perDeg) {
    perDeg = new Map();
    enrichedCache.set(fires, perDeg);
  }
  if (perDeg.has(deg)) return perDeg.get(deg);

  const features = new Array(fires.features.length);
  for (let i = 0; i < fires.features.length; i += 1) {
    const f = fires.features[i];
    const coords = f && f.geometry && f.geometry.coordinates;
    const lat = Array.isArray(coords) ? Number(coords[1]) : 0;
    const props = f.properties || {};
    const count = Math.max(0, Number(props.count) || 0);
    const area = cellAreaKm2(lat, deg);
    const density = area > 0 ? Number((count / (area / 10)).toFixed(2)) : 0;
    features[i] = {
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        ...props,
        density_10km2: density,
      },
    };
  }

  features.sort((a, b) => a.properties.density_10km2 - b.properties.density_10km2);
  const out = { type: 'FeatureCollection', features };
  perDeg.set(deg, out);
  return out;
}
