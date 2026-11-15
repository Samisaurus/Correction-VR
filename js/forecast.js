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
  const third = f.topZones[2]?.region;
  const regionPhrase = runner ? `${lead} and ${runner}` : lead;
  const regimeNote = f.warmingPct >= 25
    ? 'Severe vapor-pressure deficits turn cured northern fuels and deep duff layers into multi-week crowning corridors'
    : f.warmingPct >= 15
      ? 'Longer late-summer drying windows amplify lightning holdovers and conifer canopy stress'
      : 'Persistent seasonal drought slowly compounds baseline ignition pressure';

  return {
    headline: `${f.countryName} ${f.horizonYear}: ${lead} anchors a +${f.projectedFrpPct}% fire-energy shift`,
    riskOutlook: `${regimeNote} across ${regionPhrase}${third ? ` (with secondary pressure into ${third})` : ''}. Combined Theil-Sen drift and +${f.warmingPct}% dry-season stress push radiative energy +${f.projectedFrpPct}% and GFAS carbon output +${f.projectedCo2Pct}% above historical medians.`,
    priorityZones: f.topZones.slice(0, 3).map((z) => ({
      region: z.region,
      riskLevel: z.tier,
      driver: z.deltaPct >= 45 ? 'Extended summer vapor-pressure deficit & cured canopy' : 'Compounding lightning ignitions & dry duff',
    })),
    smokeNote: `${f.plumeTier} plume stress (${f.plumeRiskScore}/100): Dense smoke plumes lofted from ${lead} degrade downwind airsheds with fine PM₂.₅ haze and light-absorbing black carbon during peak synoptic wind corridors.`,
  };
}

export function summarizeScopeContext(scope, year) {
  const yr = Number(year) || 2023;
  const meta = scope?.meta || {};
  const emYears = scope?.emissions?.years || {};
  const emMed = scope?.emissions?.medians?.co2 || 0;
  const emYr = emYears[yr] || null;
  const yrRow = scope?.summary?.byYear?.get(yr) || null;
  const rankCo2 = scope?.emissions?.ranksByYear?.[yr]?.co2 || null;

  const peakCo2Years = Object.entries(emYears)
    .map(([y, v]) => ({ year: Number(y), co2Mt: Number(((v.co2 || 0) / 1e6).toFixed(1)), topRegion: v.topRegions?.[0]?.name || '' }))
    .sort((a, b) => b.co2Mt - a.co2Mt)
    .slice(0, 3);

  return {
    scopePath: meta.path || 'usa',
    countryName: meta.name || 'United States',
    selectedYear: yr,
    medianCo2Mt: emMed ? Number((emMed / 1e6).toFixed(1)) : null,
    selectedYearCo2Mt: emYr ? Number((emYr.co2 / 1e6).toFixed(1)) : null,
    selectedYearPm25Kt: emYr ? Number((emYr.pm25 / 1e3).toFixed(1)) : null,
    selectedYearRank: rankCo2,
    selectedYearDetections: yrRow ? (yrRow.modisTotal || yrRow.detections || yrRow.allTotal || null) : null,
    selectedYearViirs: yrRow?.viirsTotal || null,
    selectedYearTopRegions: (emYr?.topRegions || yrRow?.topStates || []).slice(0, 4).map((r) => ({
      name: r.name,
      co2Mt: r.co2 ? Number((r.co2 / 1e6).toFixed(1)) : null,
      count: r.count || null,
    })),
    peakCo2Years,
  };
}

export function buildDeterministicAnswer(question, ctx = {}) {
  const q = String(question || '').trim().toLowerCase();
  const cName = ctx.countryName || 'this region';
  const yr = Number(ctx.selectedYear) || 2023;
  const hYr = Number(ctx.horizonYear) || 2030;
  const wPct = Number(ctx.warmingPct) ?? 15;
  const lead = ctx.topZones?.[0]?.region || ctx.selectedYearTopRegions?.[0]?.name || cName;
  const co2Mt = ctx.selectedYearCo2Mt;
  const pm25Kt = ctx.selectedYearPm25Kt;
  const peaks = Array.isArray(ctx.peakCo2Years) ? ctx.peakCo2Years : [];
  const peakStr = peaks.slice(0, 2).map((p) => `${p.year} (${p.co2Mt} Mt CO₂${p.topRegion ? ` in ${p.topRegion}` : ''})`).join(' and ');

  let suggestedScenario = null;
  const pctMatch = q.match(/\+?(\d{1,2})\s*%/);
  const yrMatch = q.match(/\b(2027|2030|2035)\b/);
  if (pctMatch || yrMatch || /extreme|severe|worst.?case|stress|map|overlay|hotspot/.test(q)) {
    const nextW = pctMatch ? clamp(Math.round(Number(pctMatch[1]) / 5) * 5, 0, 40) : (/extreme|severe|worst/.test(q) ? 35 : wPct);
    const nextH = yrMatch ? Number(yrMatch[1]) : (/2035|long/.test(q) ? 2035 : hYr);
    const showOverlay = /map|overlay|hotspot|zone|where|show/.test(q) ? true : undefined;
    suggestedScenario = {
      horizonYear: nextH,
      warmingPct: nextW,
      ...(showOverlay !== undefined ? { showPredictedOverlay: showOverlay } : {}),
    };
  }

  let answer;
  if (/why|cause|surge|driver|peak|worst|high/.test(q)) {
    answer = co2Mt
      ? `In ${yr}, ${cName} released ${co2Mt} Mt CO₂${ctx.selectedYearRank ? ` (#${ctx.selectedYearRank} of 24 GFAS years)` : ''}, led by concentrated burning in ${lead}. Across the full archive, ${cName}'s heaviest carbon years—such as ${peakStr || yr}—occur when multi-month dry-season anomalies overlap lightning-rich continental corridors.`
      : `Across ${cName}'s archive, the sharpest surges cluster when synchronous summer blocking ridges cure biomass rapidly across ${lead}${peakStr ? `, exemplified by ${peakStr}` : ''}.`;
  } else if (/smoke|pm2|air|haze|carbon|co2/.test(q)) {
    answer = co2Mt && pm25Kt
      ? `During ${yr}, ${cName} lofted ${co2Mt} Mt CO₂ alongside ${pm25Kt} kt of fine PM₂.₅ smoke—primarily from ${lead}. Because smoldering duff and permafrost soils emit disproportionately more PM₂.₅ and CO per unit of radiative heat than brief grass fires, smoke hazards persist well downwind.`
      : `Smoke tonnage scales nonlinearly with organic fuel depth: peat and boreal duff layers in ${lead} yield heavy PM₂.₅ and black-carbon plumes that degrade regional air quality even hundreds of kilometers downwind.`;
  } else if (/missing|csv|2011|2012|2019|2021|sensor|modis|viirs/.test(q)) {
    answer = `${cName} tracks fire activity across dual MODIS (1 km, 2002–2026) and higher-sensitivity VIIRS (375 m, 2012+) instruments paired with Copernicus CAMS GFAS emissions (2003–2026). Even where individual point-detection files weren't archived on disk for a given year, CAMS GFAS totals and workbook sensor summaries preserve the continuous record in charts and telemetry.`;
  } else if (suggestedScenario) {
    answer = `Shifting the scenario to ${suggestedScenario.horizonYear} at +${suggestedScenario.warmingPct}% dry-season stress amplifies late-summer vapor deficits along ${lead}, accelerating projected FRP (~+${ctx.projectedFrpPct || 25}% currently at ${hYr}/+${wPct}%) and widening high-risk hotspot corridors. Click Apply below to project those parameters directly onto the globe and model.`;
  } else {
    answer = `Looking at ${cName} (${yr}${co2Mt ? `: ${co2Mt} Mt CO₂` : ''}), activity pivots around ${lead}${peakStr ? `, with historic extremes in ${peakStr}` : ''}. Under your +${wPct}% warming stress horizon to ${hYr}, projected fire energy rises +${ctx.projectedFrpPct ?? 0}% above the long-run median—ask about specific regions, smoke aerosols, or test a +35% 2035 scenario to explore further.`;
  }

  return {
    answer,
    takeaway: `${cName} · Peak benchmark: ${peakStr || yr} · Focus corridor: ${lead}`,
    suggestedScenario,
  };
}

export const CITIES_BY_COUNTRY = Object.freeze({
  usa: [
    { name: 'Redding, CA', lat: 40.5865, lon: -122.3917, region: 'Northern California' },
    { name: 'Paradise / Chico, CA', lat: 39.7285, lon: -121.8375, region: 'Sierra Foothills' },
    { name: 'Los Angeles, CA', lat: 34.0522, lon: -118.2437, region: 'Southern California' },
    { name: 'Bend, OR', lat: 44.0582, lon: -121.3153, region: 'Central Oregon' },
    { name: 'Boise, ID', lat: 43.615, lon: -116.2023, region: 'Treasure Valley' },
    { name: 'Missoula, MT', lat: 46.8721, lon: -113.994, region: 'Western Montana' },
    { name: 'Flagstaff, AZ', lat: 35.1983, lon: -111.6513, region: 'Northern Arizona' },
    { name: 'Denver, CO', lat: 39.7392, lon: -104.9903, region: 'Front Range' },
    { name: 'Seattle, WA', lat: 47.6062, lon: -122.3321, region: 'Puget Sound' },
    { name: 'Fairbanks, AK', lat: 64.8378, lon: -147.7164, region: 'Interior Alaska' },
    { name: 'Anchorage, AK', lat: 61.2181, lon: -149.9003, region: 'Southcentral Alaska' },
    { name: 'Austin, TX', lat: 30.2672, lon: -97.7431, region: 'Central Texas' },
    { name: 'Atlanta, GA', lat: 33.749, lon: -84.388, region: 'Piedmont' },
    { name: 'New York, NY', lat: 40.7128, lon: -74.006, region: 'Northeast' },
  ],
  canada: [
    { name: 'Yellowknife, NT', lat: 62.454, lon: -114.3718, region: 'Northwest Territories' },
    { name: 'Fort McMurray, AB', lat: 56.7267, lon: -111.379, region: 'Northern Alberta' },
    { name: 'Jasper, AB', lat: 52.8737, lon: -118.0814, region: 'Canadian Rockies' },
    { name: 'Kamloops, BC', lat: 50.6745, lon: -120.3273, region: 'BC Interior' },
    { name: 'Kelowna, BC', lat: 49.888, lon: -119.496, region: 'Okanagan Valley' },
    { name: 'Prince George, BC', lat: 53.9171, lon: -122.7497, region: 'Central BC' },
    { name: 'Whitehorse, YT', lat: 60.7212, lon: -135.0568, region: 'Yukon' },
    { name: 'La Ronge, SK', lat: 55.1001, lon: -105.2842, region: 'Northern Saskatchewan' },
    { name: 'Thompson, MB', lat: 55.7433, lon: -97.8553, region: 'Northern Manitoba' },
    { name: 'Thunder Bay, ON', lat: 48.3809, lon: -89.2477, region: 'Northwestern Ontario' },
    { name: 'Chibougamau, QC', lat: 49.9167, lon: -74.3667, region: 'Northern Quebec' },
    { name: 'Vancouver, BC', lat: 49.2827, lon: -123.1207, region: 'Coast Mountains' },
    { name: 'Toronto, ON', lat: 43.6532, lon: -79.3832, region: 'Southern Ontario' },
    { name: 'Halifax, NS', lat: 44.6488, lon: -63.5752, region: 'Atlantic Canada' },
  ],
  russia: [
    { name: 'Yakutsk, Sakha', lat: 62.0355, lon: 129.6755, region: 'Sakha Republic' },
    { name: 'Krasnoyarsk', lat: 56.0153, lon: 92.8932, region: 'Central Siberia' },
    { name: 'Irkutsk', lat: 52.2869, lon: 104.305, region: 'Lake Baikal' },
    { name: 'Chita, Zabaykalsky', lat: 52.0336, lon: 113.501, region: 'Transbaikal' },
    { name: 'Blagoveshchensk', lat: 50.2906, lon: 127.5272, region: 'Amur Oblast' },
    { name: 'Khabarovsk', lat: 48.4802, lon: 135.0719, region: 'Russian Far East' },
    { name: 'Magadan', lat: 59.5682, lon: 150.8085, region: 'Sea of Okhotsk' },
    { name: 'Novosibirsk', lat: 55.0084, lon: 82.9357, region: 'Western Siberia' },
    { name: 'Tyumen', lat: 57.1553, lon: 65.5619, region: 'Ural / West Siberia' },
    { name: 'Yekaterinburg', lat: 56.8389, lon: 60.6057, region: 'Ural Mountains' },
    { name: 'Moscow', lat: 55.7558, lon: 37.6173, region: 'Central Russia' },
    { name: 'Saint Petersburg', lat: 59.9343, lon: 30.3351, region: 'Northwestern Russia' },
    { name: 'Sochi', lat: 43.6028, lon: 39.7342, region: 'Black Sea Coast' },
  ],
});

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeLocalFireRisk({
  countryId = 'usa',
  lat,
  lon,
  label = 'Selected location',
  grids = [],
  scope = null,
  horizonYear = 2030,
  warmingPct = 15,
  radiusKm = 100,
} = {}) {
  const safeLat = Number(lat);
  const safeLon = Number(lon);
  const totalYears = Array.isArray(grids) && grids.length ? grids.length : 25;

  let activeYearsCount = 0;
  let totalNearbyDetections = 0;
  let peakFrpMw = 0;
  let nearestKm = Infinity;
  let peakYear = null;
  let peakYearDetections = 0;
  const nearbyForestCounts = new Map();

  for (const g of grids || []) {
    const feats = Array.isArray(g?.features) ? g.features : [];
    let yearDet = 0;
    for (let i = 0; i < feats.length; i += 1) {
      const f = feats[i];
      const coords = f?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      const fLon = Number(coords[0]);
      const fLat = Number(coords[1]);
      if (!Number.isFinite(fLat) || !Number.isFinite(fLon)) continue;
      // Fast coarse bounding pre-filter (~1.4 deg lat) before Haversine
      if (Math.abs(fLat - safeLat) <= 2.2) {
        const dKm = haversineKm(safeLat, safeLon, fLat, fLon);
        if (dKm < nearestKm) nearestKm = dKm;
        if (dKm <= radiusKm) {
          const p = f.properties || {};
          const cnt = Math.max(1, Number(p.count) || 1);
          const mFrp = Number(p.max_frp) || Number(p.frp_sum) || 0;
          yearDet += cnt;
          totalNearbyDetections += cnt;
          if (mFrp > peakFrpMw) peakFrpMw = mFrp;
          if (p.forest && !String(p.forest).startsWith('Other forest')) {
            nearbyForestCounts.set(p.forest, (nearbyForestCounts.get(p.forest) || 0) + cnt);
          }
        }
      } else if (nearestKm === Infinity) {
        const dKm = haversineKm(safeLat, safeLon, fLat, fLon);
        if (dKm < nearestKm) nearestKm = dKm;
      }
    }
    if (yearDet > 0) {
      activeYearsCount += 1;
      if (yearDet > peakYearDetections) {
        peakYearDetections = yearDet;
        peakYear = g.year;
      }
    }
  }

  const avgAnnualDetections = totalNearbyDetections / Math.max(1, totalYears);
  const yearFreq = activeYearsCount / Math.max(1, totalYears);
  const densityScore = clamp(Math.log10(1 + avgAnnualDetections) / 2.55, 0, 1);
  const frpScore = clamp(Math.log10(1 + peakFrpMw) / 3.45, 0, 1);

  let historicalPct;
  if (activeYearsCount > 0) {
    historicalPct = Math.round(clamp(yearFreq * 48 + densityScore * 30 + frpScore * 12, 4, 86));
  } else if (Number.isFinite(nearestKm) && nearestKm < Infinity) {
    historicalPct = Math.max(2, Math.round(14 * Math.exp(-Math.max(0, nearestKm - radiusKm) / 140)));
  } else {
    historicalPct = 4;
  }

  const forecast = scope ? computeForecast({ scope, horizonYear, warmingPct }) : { multiplier: 1.18 };
  const scenarioLift = clamp((forecast.multiplier - 1) * 0.42, 0, 0.34);
  const riskPct = Math.round(clamp(historicalPct * (1 + scenarioLift) + (Number(warmingPct) || 0) * 0.1, 2, 95));

  let tier;
  let tierClass;
  let summary;
  let advice;

  if (riskPct >= 75) {
    tier = 'High';
    tierClass = 'is-high';
    summary = `Frequent satellite fire clusters logged within ${radiusKm} km across ${activeYearsCount} of ${totalYears} seasons.`;
    advice = [
      'Take extra seasonal caution: check daily local fire-danger ratings and follow all regional burn bans.',
      'On smoky summer days, keep windows closed and run a clean indoor air filter or purifier.',
      'Keep a tidy, trimmed perimeter around buildings—clear dry leaves, pine needles, and stacked brush.',
    ];
  } else if (riskPct >= 50) {
    tier = 'Elevated';
    tierClass = 'is-elevated';
    summary = `Recurring seasonal fire detections within ${radiusKm} km (${activeYearsCount} active years observed).`;
    advice = [
      'Take standard dry-season caution with outdoor grills, campfires, and equipment sparks.',
      'Keep an eye on regional air quality (AQI) updates when winds shift during late summer.',
      'Clear dry grass and dead branches a few paces away from decks, sheds, and fences.',
    ];
  } else if (riskPct >= 25) {
    tier = 'Moderate';
    tierClass = 'is-moderate';
    summary = `Occasional fire activity observed within ${radiusKm} km during warmer, drier summers.`;
    advice = [
      'Take basic caution during hot, breezy weeks and check municipal rules before outdoor burning.',
      'Monitor local smoke advisories—even moderate distant fires can bring brief haze downwind.',
      'Store firewood away from siding and sweep dry yard debris from gutters periodically.',
    ];
  } else {
    tier = 'Low';
    tierClass = 'is-low';
    summary = activeYearsCount > 0
      ? `Light historical fire activity within ${radiusKm} km (${activeYearsCount} of ${totalYears} years).`
      : `Historically quiet fire zone; no active grid clusters logged within ${radiusKm} km.`;
    advice = [
      'Routine caution is plenty: follow local campfire safety rules and avoid burning in gusty weather.',
      'Check regional air-quality alerts on hazy summer afternoons, as smoke plumes travel far.',
      'Keep gutters and yard corners free of dry leaves as part of normal seasonal upkeep.',
    ];
  }

  let topForest = null;
  let topForestCnt = 0;
  for (const [fName, cnt] of nearbyForestCounts.entries()) {
    if (cnt > topForestCnt) {
      topForestCnt = cnt;
      topForest = fName;
    }
  }

  return {
    countryId,
    label,
    lat: Number(safeLat.toFixed(3)),
    lon: Number(safeLon.toFixed(3)),
    radiusKm,
    riskPct,
    historicalPct,
    tier,
    tierClass,
    activeYearsCount,
    totalYears,
    totalNearbyDetections,
    avgAnnualDetections: Math.round(avgAnnualDetections),
    peakFrpMw: Math.round(peakFrpMw),
    nearestKm: Number.isFinite(nearestKm) && nearestKm < Infinity ? Math.round(nearestKm) : null,
    peakYear,
    topForest,
    horizonYear: Number(horizonYear) || 2030,
    warmingPct: Number(warmingPct) ?? 15,
    summary,
    advice,
  };
}

