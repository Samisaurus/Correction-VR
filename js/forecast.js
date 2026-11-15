// js/forecast.js
// Purpose: wildfire trend & 2027-2035 forecast model, realistic distance-weighted local fire/smoke
//          risk estimator with personalized everyday advice, and rich AI data-search digest.

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
    const fallbackName = scope?.meta?.shortName || scope?.meta?.name || 'Main Forest Belt';
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
  const picked = scored.slice(0, 65).reverse();

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
  const plumeTier = plumeRiskScore >= 75 ? 'High' : plumeRiskScore >= 55 ? 'Moderate' : 'Mild';

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
    ? 'Hotter, drier summers dry out forest floors fast and let fires grow bigger across multiple weeks'
    : f.warmingPct >= 15
      ? 'Longer dry spells in late summer raise the chance of lightning fires spreading through dry trees'
      : 'Normal summer dryness slowly builds on past multi-year fire trends';

  return {
    headline: `${f.countryName} ${f.horizonYear}: ${lead} leads a +${f.projectedFrpPct}% rise in fire heat`,
    riskOutlook: `${regimeNote} in ${regionPhrase}${third ? ` (and nearby ${third})` : ''}. With a +${f.warmingPct}% dry-weather boost, fire heat rises +${f.projectedFrpPct}% and CO₂ smoke rises +${f.projectedCo2Pct}% above typical years.`,
    priorityZones: f.topZones.slice(0, 3).map((z) => ({
      region: z.region,
      riskLevel: z.tier,
      driver: z.deltaPct >= 45 ? 'Dry summer heat & cured forest fuel' : 'Lightning starts & dry ground cover',
    })),
    smokeNote: `${f.plumeTier} smoke index (${f.plumeRiskScore}/100): Smoke drifting from ${lead} can bring hazy skies and fine PM₂.₅ dust to towns far downwind.`,
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

export function buildAiDataDigest({ scope, year, allScopes = [], localRisk = null, forecast = null } = {}) {
  const base = summarizeScopeContext(scope, year);
  const yr = Number(year) || 2023;
  const emYears = scope?.emissions?.years || {};
  const byYear = scope?.summary?.byYear || new Map();

  const frpMap = new Map((scope?.series?.variables?.fire_frp?.annual || []).map(([y, v]) => [Number(y), Number(v)]));
  const modisMap = new Map((scope?.series?.variables?.fire_count?.annual || []).map(([y, v]) => [Number(y), Number(v)]));
  const viirsMap = new Map((scope?.series?.variables?.viirs_count?.annual || []).map(([y, v]) => [Number(y), Number(v)]));

  const timeline25Yr = [];
  for (let y = 2002; y <= 2026; y += 1) {
    const em = emYears[y];
    const row = byYear.get(y);
    timeline25Yr.push({
      yr: y,
      frpMw: Math.round(frpMap.get(y) || row?.totalFrpMw || 0) || null,
      modis: modisMap.get(y) || row?.modisTotal || null,
      viirs: viirsMap.get(y) || row?.viirsTotal || null,
      co2Mt: em?.co2 ? Number((em.co2 / 1e6).toFixed(1)) : null,
      pm25Kt: em?.pm25 ? Number((em.pm25 / 1e3).toFixed(1)) : null,
    });
  }

  const emSelected = emYears[yr];
  const speciesSelected = emSelected ? {
    co2Mt: Number(((emSelected.co2 || 0) / 1e6).toFixed(2)),
    pm25Kt: Number(((emSelected.pm25 || 0) / 1e3).toFixed(1)),
    ch4Kt: Number(((emSelected.ch4 || 0) / 1e3).toFixed(1)),
    coMt: Number(((emSelected.co || 0) / 1e6).toFixed(2)),
    ocKt: Number(((emSelected.oc || 0) / 1e3).toFixed(1)),
    bcKt: Number(((emSelected.bc || 0) / 1e3).toFixed(1)),
    noxKt: Number(((emSelected.nox || 0) / 1e3).toFixed(1)),
    so2Kt: Number(((emSelected.so2 || 0) / 1e3).toFixed(1)),
  } : null;

  const topForestsAllTime = (scope?.summary?.allForests || []).slice(0, 12).map((f) => ({
    name: f.name,
    region: f.state || '',
    totalDetections: (f.modis || 0) + (f.viirs || 0) || f.total || 0,
    maxFrpMw: Math.round(f.maxFrpMw || 0),
  }));

  const threeNationComparison = (allScopes || [])
    .filter((sc) => sc?.meta?.path)
    .map((sc) => {
      const s = summarizeScopeContext(sc, yr);
      return {
        countryId: s.scopePath,
        countryName: s.countryName,
        selectedYearCo2Mt: s.selectedYearCo2Mt,
        selectedYearPm25Kt: s.selectedYearPm25Kt,
        medianCo2Mt: s.medianCo2Mt,
        peakYear: s.peakCo2Years[0] || null,
        cataloguedForests: sc?.summary?.allForests?.length || 0,
      };
    });

  return {
    ...base,
    ...(forecast ? {
      horizonYear: forecast.horizonYear,
      warmingPct: forecast.warmingPct,
      projectedFrpPct: forecast.projectedFrpPct,
      projectedCo2Pct: forecast.projectedCo2Pct,
      plumeRiskScore: forecast.plumeRiskScore,
      topZones: forecast.topZones,
    } : {}),
    speciesSelected,
    topForestsAllTime,
    timeline25Yr,
    threeNationComparison,
    activeLocalPin: localRisk ? {
      label: localRisk.label,
      riskPct: localRisk.riskPct,
      smokeRiskPct: localRisk.smokeRiskPct,
      nearestKm: localRisk.nearestKm,
      topForest: localRisk.topForest,
      peakYear: localRisk.peakYear,
      activeYearsCount: localRisk.activeYearsCount,
    } : null,
  };
}

export function buildDeterministicAnswer(question, ctx = {}) {
  const q = String(question || '').trim().toLowerCase();
  const cName = ctx.countryName || 'this country';
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
  const histYrMatch = q.match(/\b(200[2-9]|201[0-9]|202[0-6])\b/);
  let targetCountry = null;
  if (/\bcanada\b/.test(q) && ctx.scopePath !== 'canada') targetCountry = 'canada';
  else if (/\brussia\b/.test(q) && ctx.scopePath !== 'russia') targetCountry = 'russia';
  else if (/\b(usa|united states|america)\b/.test(q) && ctx.scopePath !== 'usa') targetCountry = 'usa';

  if (pctMatch || yrMatch || targetCountry || histYrMatch || /extreme|severe|worst|stress|map|overlay|hotspot|compare/.test(q)) {
    const nextW = pctMatch ? clamp(Math.round(Number(pctMatch[1]) / 5) * 5, 0, 40) : (/extreme|severe|worst/.test(q) ? 35 : undefined);
    const nextH = yrMatch ? Number(yrMatch[1]) : (/2035|long/.test(q) ? 2035 : undefined);
    const showOverlay = /map|overlay|hotspot|zone|where|show/.test(q) ? true : undefined;
    suggestedScenario = {
      ...(targetCountry ? { countryId: targetCountry } : {}),
      ...(histYrMatch ? { focusYear: Number(histYrMatch[1]) } : {}),
      ...(nextH ? { horizonYear: nextH } : {}),
      ...(nextW !== undefined ? { warmingPct: nextW } : {}),
      ...(showOverlay !== undefined ? { showPredictedOverlay: showOverlay } : {}),
      ...(/smoke|pm2|haze/.test(q) ? { focus: 'pm25_em' } : {}),
    };
    if (!Object.keys(suggestedScenario).length) suggestedScenario = null;
  }

  const nations = Array.isArray(ctx.threeNationComparison) ? ctx.threeNationComparison : [];
  const topForests = Array.isArray(ctx.topForestsAllTime) ? ctx.topForestsAllTime : [];
  const pin = ctx.activeLocalPin;

  let answer;
  if (/compare|biggest|worst country|canada.*russia|russia.*canada|usa.*canada|three countries|3 countries/.test(q) && nations.length >= 2) {
    const sorted = nations.slice().sort((a, b) => (b.peakYear?.co2Mt || 0) - (a.peakYear?.co2Mt || 0));
    const lines = sorted.map((n) => `${n.countryName} peaked in ${n.peakYear?.year || '—'} at ${n.peakYear?.co2Mt || '—'} Mt CO₂ (${n.selectedYearCo2Mt ?? '—'} Mt in ${yr})`);
    answer = `Comparing the 25-year archive across all three countries: ${lines.join('; ')}. ${sorted[0].countryName} holds the single largest recorded smoke-carbon spike in the dataset.`;
  } else if (/forest|national forest|woods|corridor/.test(q) && topForests.length) {
    const top3 = topForests.slice(0, 3).map((f) => `${f.name}${f.region ? ` (${f.region})` : ''} with ${f.totalDetections.toLocaleString()} detections`).join(', ');
    answer = `In ${cName}, the busiest catalogued fire areas across 2002–2026 are ${top3}. Today's forecast concentrates future smoke risk around ${lead}.`;
  } else if (/my pin|near me|local|city|town|danger|safe/.test(q) && pin) {
    answer = `Around ${pin.label}, direct fire threat is ${pin.riskPct}% while seasonal smoke haze odds are ${pin.smokeRiskPct}%. Fires were detected in ${pin.activeYearsCount} of 25 seasons (closest ${pin.nearestKm ?? '—'} km${pin.topForest ? `, mostly near ${pin.topForest}` : ''}), so smoky air is a more frequent concern than direct flames.`;
  } else if (histYrMatch && Array.isArray(ctx.timeline25Yr)) {
    const qYr = Number(histYrMatch[1]);
    const row = ctx.timeline25Yr.find((r) => r.yr === qYr);
    if (row) {
      answer = `In ${qYr}, ${cName} logged ${row.co2Mt ?? '—'} Mt of CO₂, ${row.pm25Kt ?? '—'} kt of fine PM₂.₅ smoke, and ${row.frpMw ? `${row.frpMw.toLocaleString()} MW` : 'archived'} fire heat (${row.modis ? `${row.modis.toLocaleString()} MODIS` : 'VIIRS-era'} detections). Click Apply below to jump the map straight to ${qYr}.`;
    }
  }

  if (!answer) {
    if (/why|cause|driver|peak|surge|high/.test(q)) {
      answer = co2Mt
        ? `In ${yr}, ${cName} released ${co2Mt} Mt of CO₂${ctx.selectedYearRank ? ` (rank #${ctx.selectedYearRank} of 24 years)` : ''}, led by burning in ${lead}. The biggest spikes—like ${peakStr || yr}—happen when hot, dry summer winds overlap lightning storms across dense forests.`
        : `Across ${cName}'s record, major spikes happen when multi-week dry spells cure forests quickly around ${lead}${peakStr ? `, such as ${peakStr}` : ''}.`;
    } else if (/smoke|pm2|air|haze|carbon|co2/.test(q)) {
      answer = co2Mt && pm25Kt
        ? `In ${yr}, ${cName} released ${co2Mt} Mt CO₂ and ${pm25Kt} kt of fine PM₂.₅ smoke particles, mostly from ${lead}. Deep forest soil and peat smolder slowly, making extra PM₂.₅ haze that drifts hundreds of kilometers downwind.`
        : `Smoldering forest ground fuels in ${lead} produce heavy PM₂.₅ smoke and black carbon that travel far downwind even when flames stay remote.`;
    } else if (suggestedScenario) {
      const nextH = suggestedScenario.horizonYear || hYr;
      const nextW = suggestedScenario.warmingPct ?? wPct;
      answer = `Testing ${nextH} at +${nextW}% dry-season stress pushes fire heat higher around ${lead} (currently +${ctx.projectedFrpPct ?? 25}% at ${hYr}/+${wPct}%) and widens high-risk smoke corridors. Click Apply below to update the map and charts.`;
    } else {
      answer = `In ${cName} (${yr}${co2Mt ? `: ${co2Mt} Mt CO₂` : ''}), most fire activity centers on ${lead}${peakStr ? `, with record peaks in ${peakStr}` : ''}. Ask me to compare Canada, USA, and Russia, check a specific year (like 2021 or 2023), inspect top forests, or test a +35% 2035 scenario.`;
    }
  }

  return {
    answer,
    takeaway: `${cName} · Peak record: ${peakStr || yr} · Main area: ${lead}`,
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
  let closeActiveYears = 0;
  let totalNearbyDetections = 0;
  let weightedDetections = 0;
  let peakFrpMw = 0;
  let closePeakFrpMw = 0;
  let nearestKm = Infinity;
  let peakYear = null;
  let peakYearDetections = 0;
  const nearbyForestCounts = new Map();

  for (const g of grids || []) {
    const feats = Array.isArray(g?.features) ? g.features : [];
    let yearDet = 0;
    let yearClose = false;
    for (let i = 0; i < feats.length; i += 1) {
      const f = feats[i];
      const coords = f?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      const fLon = Number(coords[0]);
      const fLat = Number(coords[1]);
      if (!Number.isFinite(fLat) || !Number.isFinite(fLon)) continue;

      if (Math.abs(fLat - safeLat) <= 2.2) {
        const dKm = haversineKm(safeLat, safeLon, fLat, fLon);
        if (dKm < nearestKm) nearestKm = dKm;
        if (dKm <= radiusKm) {
          const p = f.properties || {};
          const cnt = Math.max(1, Number(p.count) || 1);
          const mFrp = Number(p.max_frp) || Number(p.frp_sum) || 0;
          // Distance-decayed proximity weight: remote wilderness (>55 km) adds far less direct threat
          const distWeight = dKm <= 25 ? 1.0 : dKm <= 55 ? 0.32 : 0.07;

          yearDet += cnt;
          totalNearbyDetections += cnt;
          weightedDetections += cnt * distWeight;
          if (mFrp > peakFrpMw) peakFrpMw = mFrp;
          if (dKm <= 35) {
            yearClose = true;
            if (mFrp > closePeakFrpMw) closePeakFrpMw = mFrp;
          }
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
      if (yearClose) closeActiveYears += 1;
      if (yearDet > peakYearDetections) {
        peakYearDetections = yearDet;
        peakYear = g.year;
      }
    }
  }

  let topForest = null;
  let topForestCnt = 0;
  for (const [fName, cnt] of nearbyForestCounts.entries()) {
    if (cnt > topForestCnt) {
      topForestCnt = cnt;
      topForest = fName;
    }
  }

  const avgAnnualDetections = totalNearbyDetections / Math.max(1, totalYears);
  const yearFreq = activeYearsCount / Math.max(1, totalYears);
  const closeFreq = closeActiveYears / Math.max(1, totalYears);
  const weightedAvg = weightedDetections / Math.max(1, totalYears);
  const weightedDensityScore = clamp(Math.log10(1 + weightedAvg) / 2.6, 0, 1);
  const densityScore = clamp(Math.log10(1 + avgAnnualDetections) / 2.55, 0, 1);
  const closeFrpScore = clamp(Math.log10(1 + closePeakFrpMw) / 3.5, 0, 1);
  const frpScore = clamp(Math.log10(1 + peakFrpMw) / 3.45, 0, 1);

  // Realistic personal fire danger (capped <= 55% because regional detections rarely burn an entire town)
  let baseThreat;
  if (closeActiveYears > 0) {
    baseThreat = clamp(closeFreq * 18 + weightedDensityScore * 16 + closeFrpScore * 6, 3, 42);
  } else if (activeYearsCount > 0) {
    baseThreat = clamp(yearFreq * 10 + weightedDensityScore * 9 + frpScore * 3, 2, 18);
  } else if (Number.isFinite(nearestKm) && nearestKm < Infinity) {
    baseThreat = Math.max(1, Math.round(7 * Math.exp(-Math.max(0, nearestKm - radiusKm) / 140)));
  } else {
    baseThreat = 2;
  }

  const forecast = scope ? computeForecast({ scope, horizonYear, warmingPct }) : { multiplier: 1.18 };
  const scenarioLift = clamp((forecast.multiplier - 1) * 0.34, 0, 0.28);
  const stressPct = Number(warmingPct) || 0;
  const riskPct = Math.round(clamp(baseThreat * (1 + scenarioLift) + stressPct * 0.14, 1, 55));

  // Separate smoke-haze odds (smoke travels far even when direct fire threat stays low)
  let smokeBase;
  if (activeYearsCount > 0) {
    smokeBase = clamp(yearFreq * 36 + densityScore * 28 + frpScore * 10, 12, 74);
  } else if (Number.isFinite(nearestKm) && nearestKm < Infinity) {
    smokeBase = Math.max(8, Math.round(28 * Math.exp(-Math.max(0, nearestKm - radiusKm) / 260)));
  } else {
    smokeBase = 10;
  }
  const smokeRiskPct = Math.round(clamp(smokeBase * (1 + scenarioLift * 0.7) + stressPct * 0.25, 8, 86));

  const nearestRounded = Number.isFinite(nearestKm) && nearestKm < Infinity ? Math.round(nearestKm) : null;
  const hYr = Number(horizonYear) || 2030;

  let tier;
  let tierClass;
  let summary;
  if (riskPct >= 36) {
    tier = 'Elevated';
    tierClass = 'is-high';
    summary = `Fires have come close to ${label} (${closeActiveYears} of ${totalYears} yrs within 35 km), though widespread smoke haze (${smokeRiskPct}% odds) is still far more likely than direct flames.`;
  } else if (riskPct >= 20) {
    tier = 'Moderate';
    tierClass = 'is-elevated';
    summary = `Past fires burned inside 100 km of ${label} during ${activeYearsCount} of ${totalYears} yrs—personal flame danger stays moderate, while smoky air (${smokeRiskPct}% odds) is common in dry summers.`;
  } else if (riskPct >= 9) {
    tier = 'Low–Mod';
    tierClass = 'is-moderate';
    summary = `Most fires near ${label} stayed ${nearestRounded ? `${nearestRounded}+ km` : 'well'} outside town (${activeYearsCount} active yrs), bringing occasional summer haze (${smokeRiskPct}% odds) rather than direct threat.`;
  } else {
    tier = 'Low';
    tierClass = 'is-low';
    summary = activeYearsCount > 0
      ? `Only light distant burning occurred near ${label} (${activeYearsCount} of ${totalYears} yrs), keeping direct fire risk low.`
      : `Quiet fire history around ${label}${nearestRounded ? ` (closest recorded fire was ${nearestRounded} km away)` : ''}.`;
  }

  // Personalized plain-English everyday advice referencing place, distance, forest, peak year, and stress
  const forestPhrase = topForest ? ` around ${topForest}` : '';
  const peakPhrase = peakYear ? ` (busiest year: ${peakYear})` : '';

  const tip1 = closeActiveYears > 0 && nearestRounded !== null && nearestRounded <= 35
    ? `Closest fires near ${label} came within ${nearestRounded} km${forestPhrase}${peakPhrase}. Keep dry leaves, pine needles, and firewood cleared a few steps away from your siding and deck.`
    : activeYearsCount > 0
      ? `Past fires near ${label} stayed ${nearestRounded ?? '35'}+ km out${forestPhrase}${peakPhrase}. Direct danger is low—just use normal caution with grills and campfires on breezy days.`
      : `No fires were spotted within ${radiusKm} km of ${label}${nearestRounded ? ` (closest was ${nearestRounded} km away)` : ''}. Direct fire danger is very low; standard outdoor fire safety is plenty.`;

  const tip2 = smokeRiskPct >= 45
    ? `Drifting smoke is the main summer issue for ${label} (${smokeRiskPct}% seasonal haze odds). Keep a clean HVAC or HEPA filter ready and check local air quality (AQI) on hazy days.`
    : `Even when local fire risk is low, summer wind can carry distant forest smoke toward ${label} (${smokeRiskPct}% haze odds)—close windows and run indoor air circulation if skies turn smoky.`;

  const tip3 = stressPct >= 25
    ? `With a +${stressPct}% drier-summer test for ${hYr}, check local burn bans before yard burning or off-road parking on dry grass around ${label}.`
    : `Looking toward ${hYr} (+${stressPct}% dry stress), follow local burn rules around ${label} and avoid mower or equipment sparks during hot, windy afternoons.`;

  return {
    countryId,
    label,
    lat: Number(safeLat.toFixed(3)),
    lon: Number(safeLon.toFixed(3)),
    radiusKm,
    riskPct,
    smokeRiskPct,
    historicalPct: Math.round(baseThreat),
    tier,
    tierClass,
    activeYearsCount,
    closeActiveYears,
    totalYears,
    totalNearbyDetections,
    avgAnnualDetections: Math.round(avgAnnualDetections),
    peakFrpMw: Math.round(peakFrpMw),
    nearestKm: nearestRounded,
    peakYear,
    topForest,
    horizonYear: hYr,
    warmingPct: stressPct,
    summary,
    advice: [tip1, tip2, tip3],
  };
}
