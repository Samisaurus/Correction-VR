// js/forecast.js
// Purpose: hybrid statistical wildfire trend & scenario projection model (2027-2035)
//          plus predicted spatial hotspot overlay GeoJSON and local fallback brief.

import { quantileSorted } from './theme.js';

export const HORIZONS = Object.freeze([2027, 2030, 2035]);
const EMPTY_FC = Object.freeze({ type: 'FeatureCollection', features: [] });

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function medianOf(nums) {
  const valid = nums.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!valid.length) return 0;
  const mid = valid.length >> 1;
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

function senSlope(points) {
  if (points.length < 3) return 0;
  const slopes = [];
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const dx = points[j].year - points[i].year;
      if (dx !== 0) slopes.push((points[j].value - points[i].value) / dx);
    }
  }
  if (!slopes.length) return 0;
  slopes.sort((a, b) => a - b);
  return quantileSorted(slopes, 0.5) ?? 0;
}

function extractFrpPoints(scope) {
  const raw = scope?.series?.variables?.fire_frp?.annual;
  const pts = [];
  if (Array.isArray(raw)) {
    for (const [yr, val] of raw) {
      const y = Number(yr);
      const v = Number(val);
      if (Number.isInteger(y) && Number.isFinite(v) && v > 0) pts.push({ year: y, value: v });
    }
  } else if (scope?.summary?.byYear) {
    for (const [yr, row] of scope.summary.byYear.entries()) {
      const v = Number(row?.totalFrpMw);
      if (Number.isFinite(v) && v > 0) pts.push({ year: Number(yr), value: v });
    }
  }
  pts.sort((a, b) => a.year - b.year);
  // Exclude incomplete current-year YTD (e.g. 2026) from slope estimation when much lower than median
  if (pts.length > 5 && pts[pts.length - 1].year >= 2026) {
    const priorMed = medianOf(pts.slice(0, -1).map((p) => p.value));
    if (priorMed > 0 && pts[pts.length - 1].value < priorMed * 0.45) {
      pts.pop();
    }
  }
  return pts;
}

function aggregateTopRegions(scope, multiplier, warmingPct) {
  const scores = new Map();
  const addScore = (name, weight, srcTag) => {
    if (!name || /other|unknown/i.test(name)) return;
    const prev = scores.get(name) || { name, weight: 0, peakWeight: 0, srcTag };
    prev.weight += weight;
    if (weight > prev.peakWeight) prev.peakWeight = weight;
    scores.set(name, prev);
  };

  const emYears = scope?.emissions?.years || {};
  for (const [yrStr, em] of Object.entries(emYears)) {
    const yr = Number(yrStr);
    if (yr < 2016 || yr > 2025) continue;
    const recency = 1 + Math.max(0, yr - 2016) * 0.14;
    for (const reg of (em.topRegions || []).slice(0, 6)) {
      addScore(reg.name, (Number(reg.co2) || 0) * recency, 'CAMS');
    }
  }

  if (scores.size < 3 && scope?.summary?.byYear) {
    for (const [yr, row] of scope.summary.byYear.entries()) {
      if (yr < 2013 || yr > 2025) continue;
      const recency = 1 + Math.max(0, yr - 2013) * 0.12;
      for (const st of (row.topStates || []).slice(0, 6)) {
        addScore(st.name, (Number(st.frpMw) || Number(st.count) * 20 || 0) * recency, 'FIRMS');
      }
    }
  }

  const ranked = Array.from(scores.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  if (!ranked.length) {
    const fallbackName = scope?.meta?.shortName || scope?.meta?.name || 'Primary Boreal Corridor';
    ranked.push({ name: fallbackName, weight: 100 });
  }

  const topW = ranked[0].weight || 1;
  return ranked.map((r, idx) => {
    const rel = clamp(r.weight / topW, 0.35, 1);
    const deltaPct = Math.round(((multiplier - 1) * 100) * (0.78 + 0.32 * rel) + warmingPct * 0.12);
    const riskScore = Math.min(99, Math.round(44 + rel * 32 + (multiplier - 1) * 24 - idx * 3));
    const tier = riskScore >= 78 ? 'Extreme' : riskScore >= 60 ? 'High' : 'Elevated';
    return {
      region: r.name,
      deltaPct,
      riskScore,
      tier,
      sharePct: Math.max(8, Math.round((r.weight / ranked.reduce((s, x) => s + x.weight, 0)) * 100)),
    };
  });
}

export function buildPredictedHotspotsGeoJson(baseFires, { horizonYear = 2030, warmingPct = 15, multiplier = 1.25 } = {}) {
  const feats = baseFires && Array.isArray(baseFires.features) ? baseFires.features : [];
  if (!feats.length) return EMPTY_FC;

  const scored = [];
  let maxPower = 1;
  for (let i = 0; i < feats.length; i += 1) {
    const f = feats[i];
    const coords = f?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const p = f.properties || {};
    const frp = Math.max(0, Number(p.frp_sum) || 0);
    const count = Math.max(1, Number(p.count) || 1);
    const power = frp + count * 12;
    if (power > maxPower) maxPower = power;
    scored.push({ coords, p, frp, count, power });
  }

  scored.sort((a, b) => b.power - a.power);
  const picked = scored.slice(0, 65).reverse(); // ascending sort so hottest targets render on top

  const outFeatures = picked.map((it) => {
    const norm = Math.sqrt(clamp(it.power / maxPower, 0.02, 1));
    const riskScore = Math.min(99, Math.round(42 + norm * 38 + (multiplier - 1) * 22));
    const projFrp = Math.round(it.frp * multiplier);
    const deltaPct = Math.round((multiplier - 1) * 100 * (0.75 + 0.45 * norm));
    const tier = riskScore >= 80 ? 'Extreme' : riskScore >= 64 ? 'High' : 'Emerging';
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: it.coords },
      properties: {
        risk_score: riskScore,
        tier,
        delta_pct: deltaPct,
        projected_frp: projFrp,
        horizon: horizonYear,
        warming_pct: warmingPct,
        region: it.p.state || '',
        forest: it.p.forest || '',
      },
    };
  });

  return { type: 'FeatureCollection', features: outFeatures };
}

export function computeForecast({ scope, baseFires = null, horizonYear = 2030, warmingPct = 15 } = {}) {
  const hYear = clamp(Number(horizonYear) || 2030, 2027, 2035);
  const stressPct = clamp(Number(warmingPct) || 0, 0, 40);
  const dtYears = Math.max(1, hYear - 2025);
  const stressRatio = stressPct / 100;

  const frpPoints = extractFrpPoints(scope);
  const recentPts = frpPoints.filter((p) => p.year >= 2016);
  const baselineFrpMw = Math.round(medianOf(frpPoints.map((p) => p.value)) || 1_200_000);
  const recentMedianMw = Math.round(medianOf(recentPts.map((p) => p.value)) || baselineFrpMw);
  const senPerYr = senSlope(frpPoints.length >= 6 ? frpPoints : recentPts);
  const relSlope = baselineFrpMw > 0 ? clamp(senPerYr / baselineFrpMw, -0.01, 0.048) : 0.012;

  const horizonDrift = Math.max(0.015, relSlope + 0.011) * dtYears;
  const stressAmplifier = stressRatio * (0.95 + 0.055 * dtYears);
  const multiplier = Number((1 + horizonDrift + stressAmplifier).toFixed(3));
  const anchorFrp = Math.max(baselineFrpMw, Math.round(0.55 * baselineFrpMw + 0.45 * recentMedianMw));

  const projectedFrpMw = Math.round(anchorFrp * multiplier);
  const projectedFrpPct = Math.round(((projectedFrpMw - baselineFrpMw) / Math.max(1, baselineFrpMw)) * 100);

  const medCo2 = Number(scope?.emissions?.medians?.co2) || 45_000_000;
  const projectedCo2Tonnes = Math.round(medCo2 * (0.94 + (multiplier - 1) * 1.12));
  const projectedCo2Pct = Math.round(((projectedCo2Tonnes - medCo2) / Math.max(1, medCo2)) * 100);

  const plumeRiskScore = Math.min(98, Math.round(32 + (multiplier - 1) * 46 + stressRatio * 34));
  const plumeTier = plumeRiskScore >= 75 ? 'Severe' : plumeRiskScore >= 55 ? 'Elevated' : 'Moderate';

  // Trajectory points (recent historical 2018-2025 + future anchors 2027, 2030, 2035)
  const histWindow = frpPoints.filter((p) => p.year >= 2018 && p.year <= 2025);
  const trajectory = histWindow.map((p) => ({
    year: p.year,
    value: p.value,
    low: p.value,
    high: p.value,
    kind: 'historical',
  }));
  for (const ty of HORIZONS) {
    const dt = ty - 2025;
    const hDrift = Math.max(0.015, relSlope + 0.011) * dt;
    const sBoost = stressRatio * (0.95 + 0.055 * dt);
    const midMult = 1 + hDrift + sBoost;
    const val = Math.round(anchorFrp * midMult);
    const spread = 0.14 + 0.025 * dt;
    trajectory.push({
      year: ty,
      value: val,
      low: Math.round(val * (1 - spread)),
      high: Math.round(val * (1 + spread * 1.25)),
      kind: 'projected',
    });
  }

  const topZones = aggregateTopRegions(scope, multiplier, stressPct);
  const hotspotsGeoJson = buildPredictedHotspotsGeoJson(baseFires, {
    horizonYear: hYear,
    warmingPct: stressPct,
    multiplier,
  });

  return {
    scopePath: scope?.meta?.path || 'usa',
    countryName: scope?.meta?.name || 'United States',
    horizonYear: hYear,
    warmingPct: stressPct,
    multiplier,
    baselineFrpMw,
    projectedFrpMw,
    projectedFrpPct,
    baselineCo2Tonnes: medCo2,
    projectedCo2Tonnes,
    projectedCo2Pct,
    plumeRiskScore,
    plumeTier,
    senSlopePerYr: Math.round(senPerYr),
    topZones,
    trajectory,
    hotspotsGeoJson,
  };
}

export function buildDeterministicBrief(f) {
  const lead = f.topZones[0]?.region || f.countryName;
  const runner = f.topZones[1]?.region;
  const regionPhrase = runner ? `${lead} and ${runner}` : lead;

  return {
    headline: `${f.countryName} ${f.horizonYear} Outlook: +${f.projectedFrpPct}% Fire Energy in ${lead}`,
    riskOutlook: `Under a +${f.warmingPct}% dry-season stress scenario by ${f.horizonYear}, Theil-Sen momentum and seasonal moisture deficits point to concentrated radiative heat across ${regionPhrase}, lifting total fire power +${f.projectedFrpPct}% and GFAS CO₂ +${f.projectedCo2Pct}% above historical medians.`,
    priorityZones: f.topZones.slice(0, 3).map((z) => ({
      region: z.region,
      riskLevel: z.tier,
      driver: z.deltaPct >= 45 ? 'Extended summer vapor-pressure deficit & cured canopy' : 'Compounding lightning ignitions & dry duff',
    })),
    smokeNote: `${f.plumeTier} plume stress (${f.plumeRiskScore}/100): Dense boreal smoke from ${lead} raises downwind PM₂.₅ haze and black-carbon transport during peak late-summer wind events.`,
  };
}
