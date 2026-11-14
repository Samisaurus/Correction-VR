// js/map/river-pollution.js
// Purpose: pure spatial scoring of river segments from wildfire (FRP/count) + smoke (AOD/PM2.5)
//          + basin water turbidity (Kd490), producing a normalized 0..1 pollution score per feature.

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON = 111.32;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function sampleLine(coords, maxSamples = 5) {
  if (!Array.isArray(coords) || coords.length === 0) return [];
  if (coords.length <= maxSamples) return coords;
  const out = [];
  const step = (coords.length - 1) / (maxSamples - 1);
  for (let i = 0; i < maxSamples; i += 1) {
    out.push(coords[Math.round(i * step)]);
  }
  return out;
}

function extractSamples(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'LineString') {
    return sampleLine(geometry.coordinates, 7);
  }
  if (geometry.type === 'MultiLineString') {
    const pts = [];
    for (const line of geometry.coordinates || []) {
      const s = sampleLine(line, 4);
      for (const p of s) pts.push(p);
    }
    return pts.length > 10 ? sampleLine(pts, 10) : pts;
  }
  return [];
}

function featureCentroid(f) {
  if (!f || !f.geometry) return null;
  if (f.geometry.type === 'Point') return f.geometry.coordinates;
  const ring = f.geometry.type === 'Polygon'
    ? f.geometry.coordinates[0]
    : f.geometry.type === 'MultiPolygon'
      ? f.geometry.coordinates[0] && f.geometry.coordinates[0][0]
      : null;
  if (!ring || !ring.length) return null;
  let sx = 0;
  let sy = 0;
  const len = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.length - 1
    : ring.length;
  for (let i = 0; i < len; i += 1) {
    sx += ring[i][0];
    sy += ring[i][1];
  }
  return len ? [sx / len, sy / len] : null;
}

/**
 * Precompute river bounding boxes & sample points once per scope so yearly updates stay sub-millisecond.
 */
export function prepareRivers(rivers) {
  if (!rivers || !Array.isArray(rivers.features)) return [];
  const prepared = [];
  for (const f of rivers.features) {
    const samples = extractSamples(f.geometry);
    if (!samples.length) continue;
    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const [lon, lat] of samples) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    const midLatRad = ((minLat + maxLat) * 0.5) * (Math.PI / 180);
    const cosLat = Math.max(0.18, Math.cos(midLatRad));
    prepared.push({
      feature: f,
      samples,
      minLon,
      maxLon,
      minLat,
      maxLat,
      cosLat,
    });
  }
  return prepared;
}

function extractFirePoints(fires) {
  if (!fires || !Array.isArray(fires.features)) return [];
  const pts = [];
  for (const f of fires.features) {
    const c = featureCentroid(f);
    if (!c) continue;
    const p = f.properties || {};
    const frp = Number(p.frp_sum);
    const count = Number(p.count);
    pts.push({
      lon: c[0],
      lat: c[1],
      power: (Number.isFinite(frp) && frp > 0 ? frp : 0) + (Number.isFinite(count) && count > 0 ? count * 4 : 0),
    });
  }
  return pts;
}

function extractAirPoints(air) {
  if (!air || !Array.isArray(air.features)) return [];
  const pts = [];
  for (const f of air.features) {
    const c = featureCentroid(f);
    if (!c) continue;
    const p = f.properties || {};
    const aod = Number(p.aod);
    const pm25 = p.pm25 === null || p.pm25 === undefined ? NaN : Number(p.pm25);
    pts.push({
      lon: c[0],
      lat: c[1],
      aod: Number.isFinite(aod) ? aod : 0,
      pm25: Number.isFinite(pm25) ? pm25 : null,
    });
  }
  return pts;
}

/**
 * Compute continuous river pollution exposure (0 = clean blue, 1 = high purple) from fire, smoke,
 * and optional basin turbidity data. Returns a fresh GeoJSON FeatureCollection sharing original geometries.
 */
export function scoreRiversForYear({ preparedRivers, fires, air, isBasin = false, kdNorm = null }) {
  if (!Array.isArray(preparedRivers) || preparedRivers.length === 0) {
    return { type: 'FeatureCollection', features: [] };
  }

  const firePts = extractFirePoints(fires);
  const airPts = extractAirPoints(air);

  const fireRadiusKm = isBasin ? 45 : 95;
  const fireHalfKm = isBasin ? 18 : 38;
  const airRadiusKm = isBasin ? 85 : 175;
  const airHalfKm = isBasin ? 40 : 85;

  const fireLatPad = fireRadiusKm / KM_PER_DEG_LAT;
  const airLatPad = airRadiusKm / KM_PER_DEG_LAT;

  // Calibration scales so quiet fire/smoke years stay blue and severe fire/smoke regions turn purple
  const frpScale = isBasin ? 3200 : 28000;
  const kdBoost = isBasin && kdNorm !== null && Number.isFinite(kdNorm)
    ? (kdNorm - 0.4) * 0.22
    : 0;

  const features = new Array(preparedRivers.length);

  for (let i = 0; i < preparedRivers.length; i += 1) {
    const r = preparedRivers[i];
    const samples = r.samples;
    const fireLonPad = fireRadiusKm / (KM_PER_DEG_LON * r.cosLat);
    const airLonPad = airRadiusKm / (KM_PER_DEG_LON * r.cosLat);
    const kmPerLon = KM_PER_DEG_LON * r.cosLat;

    // 1. Fire pressure near river samples (max weighted fire cluster along the river segment)
    let peakFireScore = 0;
    const fireMinLon = r.minLon - fireLonPad;
    const fireMaxLon = r.maxLon + fireLonPad;
    const fireMinLat = r.minLat - fireLatPad;
    const fireMaxLat = r.maxLat + fireLatPad;

    for (let s = 0; s < samples.length; s += 1) {
      const [sx, sy] = samples[s];
      let localPower = 0;
      for (let j = 0; j < firePts.length; j += 1) {
        const fp = firePts[j];
        if (fp.lon < fireMinLon || fp.lon > fireMaxLon || fp.lat < fireMinLat || fp.lat > fireMaxLat) continue;
        const dx = (fp.lon - sx) * kmPerLon;
        const dy = (fp.lat - sy) * KM_PER_DEG_LAT;
        const d2 = dx * dx + dy * dy;
        if (d2 > fireRadiusKm * fireRadiusKm) continue;
        const w = 1 / (1 + d2 / (fireHalfKm * fireHalfKm));
        localPower += fp.power * w;
      }
      if (localPower > peakFireScore) peakFireScore = localPower;
    }

    const fireNorm = peakFireScore > 0
      ? clamp(Math.log1p(peakFireScore / frpScale) / Math.log1p(4.5), 0, 1)
      : 0;

    // 2. Smoke/AOD/PM2.5 pressure over the river segment
    let airWeightedSum = 0;
    let airWeightTotal = 0;
    const airMinLon = r.minLon - airLonPad;
    const airMaxLon = r.maxLon + airLonPad;
    const airMinLat = r.minLat - airLatPad;
    const airMaxLat = r.maxLat + airLatPad;

    for (let s = 0; s < samples.length; s += 1) {
      const [sx, sy] = samples[s];
      for (let j = 0; j < airPts.length; j += 1) {
        const ap = airPts[j];
        if (ap.lon < airMinLon || ap.lon > airMaxLon || ap.lat < airMinLat || ap.lat > airMaxLat) continue;
        const dx = (ap.lon - sx) * kmPerLon;
        const dy = (ap.lat - sy) * KM_PER_DEG_LAT;
        const d2 = dx * dx + dy * dy;
        if (d2 > airRadiusKm * airRadiusKm) continue;
        const w = 1 / (1 + d2 / (airHalfKm * airHalfKm));
        // Clean baseline AOD ~0.07; elevated smoke >= 0.14..0.38
        const aodExcess = clamp((ap.aod - 0.075) / 0.24, 0, 1);
        const pmExcess = ap.pm25 !== null ? clamp((ap.pm25 - 5) / 22, 0, 1) : aodExcess;
        const cellSmoke = 0.65 * aodExcess + 0.35 * pmExcess;
        airWeightedSum += cellSmoke * w;
        airWeightTotal += w;
      }
    }

    const airNorm = airWeightTotal > 0 ? clamp(airWeightedSum / airWeightTotal, 0, 1) : 0;

    // Combined pollution score: clean when low, smoothly shifts blue -> purple as fire/smoke/turbidity climb
    const raw = 0.64 * fireNorm + 0.36 * airNorm + kdBoost;
    const pollution = raw <= 0.08 ? 0 : Number(clamp((raw - 0.08) / 0.78, 0, 1).toFixed(3));

    const origProps = r.feature.properties || {};
    features[i] = {
      type: 'Feature',
      geometry: r.feature.geometry,
      properties: {
        ...origProps,
        pollution,
      },
    };
  }

  return { type: 'FeatureCollection', features };
}
