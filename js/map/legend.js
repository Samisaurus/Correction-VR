// js/map/legend.js
// Purpose: Field Alert & Layer Guide (#map-legend) with progressive disclosure for regional rankings & burn splits.

const STYLE = `
.leg-root { display: flex; flex-direction: column; height: 100%; background: var(--c-paper); color: var(--c-ink); font-size: 12px; line-height: 1.4; }
.leg-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px 10px; border-bottom: 1px solid var(--c-edge); background: var(--c-panel); }
.leg-title-wrap { display: flex; flex-direction: column; min-width: 0; }
.leg-kicker { font-family: var(--f-mono); font-size: 10px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--c-muted); }
.leg-title { font-family: var(--f-serif); font-size: 16px; font-weight: 700; color: var(--c-ink); line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.leg-badge { flex: 0 0 auto; padding: 3px 8px; border-radius: 5px; font-family: var(--f-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; border: 1px solid var(--c-edge); background: var(--c-paper); color: var(--c-muted); }
.leg-badge.is-extreme { background: #FEF2F2; border-color: #FCA5A5; color: #B91C1C; }
.leg-badge.is-elevated { background: #FFFBEB; border-color: #FCD34D; color: #B45309; }
.leg-badge.is-moderate { background: #FFF7ED; border-color: #FDBA74; color: #C2410C; }
.leg-badge.is-baseline { background: #F0FDF4; border-color: #86EFAC; color: #15803D; }
.leg-badge.is-loading { background: #EFF6FF; border-color: #93C5FD; color: #1D4ED8; }
.leg-telemetry { padding: 10px 14px; border-bottom: 1px solid var(--c-edge); background: var(--c-panel); }
.leg-kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
.leg-kpi { background: var(--c-paper); border: 1px solid var(--c-edge); border-radius: 5px; padding: 6px 8px; min-width: 0; }
.leg-kpi-label { display: block; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--c-muted); }
.leg-kpi-val { display: block; margin-top: 1px; font-family: var(--f-mono); font-size: 14px; font-weight: 700; color: var(--c-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.leg-kpi-sub { display: block; font-size: 10.5px; color: var(--c-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.leg-kpi-val.is-hot { color: #B91C1C; }
.leg-kpi-val.is-warn { color: #C2410C; }
.leg-brief { margin: 8px 0 0; font-size: 11.5px; line-height: 1.4; color: var(--c-ink); }
.leg-brief.is-muted { color: var(--c-muted); }
.leg-layers { flex: 0 0 auto; display: flex; flex-direction: column; gap: 9px; padding: 11px 14px; }
.leg-context { flex: 1 1 auto; display: flex; flex-direction: column; gap: 9px; padding: 10px 14px 11px; border-top: 1px solid var(--c-edge); background: var(--c-panel); }
.leg-ctx-block { display: flex; flex-direction: column; gap: 5px; }
.leg-ctx-head { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
.leg-ctx-title { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--c-ink); }
.leg-ctx-meta { font-family: var(--f-mono); font-variant-numeric: tabular-nums; font-size: 10px; color: var(--c-muted); white-space: nowrap; flex: 0 0 auto; }
.leg-em-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
.leg-em-cell { background: var(--c-paper); border: 1px solid var(--c-edge); border-radius: 4px; padding: 4px 6px; min-width: 0; }
.leg-em-k { display: block; font-size: 9.5px; font-weight: 600; color: var(--c-muted); }
.leg-em-v { display: block; font-family: var(--f-mono); font-variant-numeric: tabular-nums; font-size: 11.5px; font-weight: 700; color: var(--c-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.leg-delta-track { height: 5px; border-radius: 3px; background: #E2E8F0; overflow: hidden; }
.leg-delta-fill { height: 100%; border-radius: 3px; transition: width 180ms var(--ease-out); }
.leg-det-btn {
  width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 6px;
  padding: 5px 8px; border: 1px solid var(--c-edge); border-radius: 5px; background: var(--c-paper);
  font-family: var(--f-mono); font-size: 10.5px; font-weight: 600; color: var(--c-ink);
}
.leg-det-body { display: flex; flex-direction: column; gap: 9px; }
.leg-det-body[hidden] { display: none; }
.leg-reg-list, .leg-split-rows { display: flex; flex-direction: column; gap: 5px; }
.leg-reg-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; align-items: center; }
.leg-reg-name { font-size: 11px; font-weight: 500; color: var(--c-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.leg-reg-val { font-family: var(--f-mono); font-variant-numeric: tabular-nums; font-size: 10.5px; font-weight: 600; color: var(--c-muted); }
.leg-reg-bar, .leg-split-track { height: 4px; border-radius: 2px; background: #E2E8F0; overflow: hidden; }
.leg-reg-bar { grid-column: 1 / -1; }
.leg-reg-fill { height: 100%; border-radius: 2px; background: #D55E00; }
.leg-split-item { display: flex; flex-direction: column; gap: 3px; }
.leg-split-labels { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--c-muted); font-family: var(--f-mono); }
.leg-split-track { display: flex; height: 5px; }
.leg-split-a { background: #2B5FC7; }
.leg-split-b { background: #94A3B8; }
.leg-split-a--warm { background: #D55E00; }
.leg-split-b--cool { background: #475569; }
.leg-card { display: flex; flex-direction: column; gap: 4px; padding-bottom: 8px; border-bottom: 1px dashed var(--c-edge); }
.leg-card:last-child { padding-bottom: 0; border-bottom: 0; }
.leg-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.leg-card-title { font-size: 12px; font-weight: 700; color: var(--c-ink); }
.leg-card-tag { font-family: var(--f-mono); font-size: 10px; color: var(--c-muted); }
.leg-bar-wrap { display: flex; align-items: center; gap: 8px; }
.leg-bar { flex: 1 1 auto; height: 8px; border-radius: 4px; border: 1px solid rgba(15, 23, 42, 0.12); }
.leg-bar--fire { background: linear-gradient(90deg, #FACC15 0%, #F59E0B 28%, #EA580C 56%, #DC2626 80%, #991B1B 100%); }
.leg-bar--smoke { background: linear-gradient(90deg, rgba(138, 127, 114, 0.12) 0%, rgba(126, 113, 99, 0.42) 55%, rgba(78, 66, 56, 0.8) 100%); }
.leg-bar--pred { background: linear-gradient(90deg, #6A3093 0%, #9333EA 52%, #D97706 100%); }
.leg-ticks { display: flex; justify-content: space-between; font-family: var(--f-mono); font-size: 9.5px; color: var(--c-muted); }
.leg-desc { margin: 0; font-size: 11px; line-height: 1.35; color: var(--c-muted); }
.leg-foot { padding: 9px 14px 11px; border-top: 1px solid var(--c-edge); background: var(--c-panel); margin-top: auto; }
.leg-countries { display: flex; flex-wrap: wrap; gap: 5px; width: 100%; }
.leg-cbtn { flex: 1 1 auto; display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 4px 7px; font-size: 11px; font-weight: 600; border-radius: 5px; border: 1px solid var(--c-edge); background: var(--c-paper); color: var(--c-muted); }
.leg-cbtn[aria-pressed="true"] { color: var(--c-ink); border-color: var(--c-ink); }
.leg-swatch { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
.leg-swatch[data-country="canada"] { background: #2A9D8F; }
.leg-swatch[data-country="usa"] { background: #C84B59; }
.leg-swatch[data-country="russia"] { background: #3D6CB9; }

@media (max-width: 1199px) {
  .leg-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .leg-layers { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 14px; }
  .leg-layers[data-cols="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .leg-card { padding-bottom: 0; border-bottom: 0; padding-right: 12px; border-right: 1px dashed var(--c-edge); }
  .leg-card:last-child { padding-right: 0; border-right: 0; }
  .leg-countries { width: auto; }
}
@media (max-width: 799px) {
  .leg-kpis, .leg-layers, .leg-layers[data-cols="3"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .leg-card:nth-child(even) { padding-right: 0; border-right: 0; }
}
@media (max-width: 519px) {
  .leg-layers, .leg-layers[data-cols="3"] { grid-template-columns: 1fr; }
  .leg-card { padding-right: 0; border-right: 0; padding-bottom: 8px; border-bottom: 1px dashed var(--c-edge); }
  .leg-card:last-child { padding-bottom: 0; border-bottom: 0; }
}
`;
const NS = 'http://www.w3.org/2000/svg';

function makeFireDotsSvg() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '52');
  svg.setAttribute('height', '22');
  svg.setAttribute('viewBox', '0 0 52 22');
  const r = (n) => (1.3 + 0.42 * Math.sqrt(n)).toFixed(1);
  svg.innerHTML = `<circle cx="7" cy="11" r="${r(8)}" fill="#FACC15" fill-opacity="0.72"/><circle cx="22" cy="11" r="${r(65)}" fill="#EA580C" fill-opacity="0.78"/><circle cx="41" cy="11" r="${r(320)}" fill="#991B1B" fill-opacity="0.82"/>`;
  return svg;
}

export async function mount(el, ctx) {
  const { store, data, theme } = ctx;
  const { injectCss, escHtml, fmtCompact, fmtMass } = theme;
  injectCss('leg', STYLE);
  const regions = await data.getRegions();

  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'leg-root';
  root.innerHTML = `
    <div class="leg-head">
      <div class="leg-title-wrap">
        <span class="leg-kicker">Live Field Signal</span>
        <div class="leg-title" data-ref="title"></div>
      </div>
      <span class="leg-badge" data-ref="badge"></span>
    </div>
    <div class="leg-telemetry">
      <div class="leg-kpis" data-ref="kpis"></div>
      <p class="leg-brief" data-ref="brief"></p>
    </div>
    <div class="leg-layers" data-ref="layers"></div>
    <div class="leg-context" data-ref="contextBox"></div>
    <div class="leg-foot"><div class="leg-countries" data-ref="cRow"></div></div>
  `;
  el.appendChild(root);

  const ref = (n) => root.querySelector(`[data-ref="${n}"]`);
  const title = ref('title');
  const badge = ref('badge');
  const kpis = ref('kpis');
  const brief = ref('brief');
  const layers = ref('layers');
  const contextBox = ref('contextBox');
  const cRow = ref('cRow');

  const cBtns = new Map();
  if (regions && Array.isArray(regions.countries)) {
    for (const c of regions.countries) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'leg-cbtn';
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = `<span class="leg-swatch" data-country="${escHtml(c.id)}"></span>${escHtml(c.shortName || c.id)}`;
      btn.addEventListener('click', () => store.set({ countryId: c.id, playing: false }));
      cRow.appendChild(btn);
      cBtns.set(c.id, btn);
    }
  }

  let token = 0;
  let lastScopeKey = null;
  let lastOverlayState = null;
  let detailsOpen = false;

  function buildLayers(state) {
    layers.innerHTML = '';
    layers.dataset.cols = state.showPredictedOverlay ? '3' : '2';

    const fireCard = document.createElement('div');
    fireCard.className = 'leg-card';
    fireCard.innerHTML = '<div class="leg-card-head"><span class="leg-card-title">1. Wildfire Density</span><span class="leg-card-tag">per 5 km²</span></div>';
    const fireBarWrap = document.createElement('div');
    fireBarWrap.className = 'leg-bar-wrap';
    const fireBar = document.createElement('div');
    fireBar.className = 'leg-bar leg-bar--fire';
    fireBarWrap.append(makeFireDotsSvg(), fireBar);
    fireCard.appendChild(fireBarWrap);
    fireCard.insertAdjacentHTML('beforeend', '<div class="leg-ticks"><span>&lt;0.05 low</span><span>0.6+ active</span><span>6+ extreme</span></div><p class="leg-desc">Translucent 0.2° clusters sort intense red cores on top.</p>');

    const smokeCard = document.createElement('div');
    smokeCard.className = 'leg-card';
    smokeCard.innerHTML = '<div class="leg-card-head"><span class="leg-card-title">2. Smoke &amp; Carbon Plume</span><span class="leg-card-tag">GFAS PM₂.₅</span></div><div class="leg-bar leg-bar--smoke"></div><div class="leg-ticks"><span>Light</span><span>Regional haze</span><span>Dense plume</span></div><p class="leg-desc">Spatially gridded particulate smoke and carbon monoxide drift.</p>';

    layers.append(fireCard, smokeCard);

    if (state.showPredictedOverlay) {
      const predCard = document.createElement('div');
      predCard.className = 'leg-card';
      predCard.innerHTML = `<div class="leg-card-head"><span class="leg-card-title">3. Predicted Risk (${state.horizonYear})</span><span class="leg-card-tag">+${state.warmingPct}% stress</span></div><div class="leg-bar leg-bar--pred"></div><div class="leg-ticks"><span>Emerging</span><span>High</span><span>Critical</span></div><p class="leg-desc">Violet-amber rings mark projected hotspot persistence in Fig. 4.</p>`;
      layers.appendChild(predCard);
    }
  }

  function makeKpi(label, val, sub, toneClass = '') {
    const box = document.createElement('div');
    box.className = 'leg-kpi';
    box.innerHTML = `<span class="leg-kpi-label">${escHtml(label)}</span><span class="leg-kpi-val${toneClass ? ` ${toneClass}` : ''}">${escHtml(val)}</span><span class="leg-kpi-sub">${escHtml(sub)}</span>`;
    return box;
  }

  function computePeakDensity(fires) {
    if (fires?.summary && Number.isFinite(fires.summary.peakDensity5km2)) return fires.summary.peakDensity5km2;
    if (!fires?.features?.length) return 0;
    const deg = fires.gridDeg || 0.2;
    let peak = 0;
    for (const f of fires.features) {
      const lat = Array.isArray(f?.geometry?.coordinates) ? Number(f.geometry.coordinates[1]) : 0;
      const area = (deg * 110.574) * (deg * 111.32 * Math.max(0.15, Math.cos(lat * (Math.PI / 180))));
      const dens = area > 0 ? (Number(f.properties?.count) || 0) / (area / 5) : 0;
      if (dens > peak) peak = dens;
    }
    return Number(peak.toFixed(2));
  }

  function renderContext(scope, yr, yrRow, mappedDetections, totalFrp) {
    const emRoot = scope?.emissions || null;
    const emYr = emRoot?.years?.[yr] || null;
    const ranks = emRoot?.ranksByYear?.[yr] || null;
    const med = emRoot?.medians || null;
    const yearCount = emRoot ? emRoot.yearCount : 24;
    contextBox.innerHTML = '';

    const emBlock = document.createElement('div');
    emBlock.className = 'leg-ctx-block';
    if (emYr && med) {
      const medCo2 = med.co2 || 1;
      const pct = Math.round(((emYr.co2 - medCo2) / medCo2) * 100);
      const rankStr = ranks?.co2 ? `#${ranks.co2}/${yearCount} (${pct >= 0 ? '+' : ''}${pct}%)` : `${pct >= 0 ? '+' : ''}${pct}% vs med`;
      const ratioPct = Math.max(8, Math.min(100, Math.round((emYr.co2 / Math.max(medCo2 * 2.5, emYr.co2)) * 100)));
      const barColor = pct >= 40 ? '#B91C1C' : pct >= 0 ? '#D55E00' : '#2A9D8F';
      emBlock.innerHTML = `<div class="leg-ctx-head"><span class="leg-ctx-title">Air Emissions (${yr}${yr === 2026 ? ' YTD' : ''})</span><span class="leg-ctx-meta">${escHtml(rankStr)}</span></div><div class="leg-em-strip"><div class="leg-em-cell"><span class="leg-em-k">CO₂</span><span class="leg-em-v">${fmtMass(emYr.co2, 'Mt')}</span></div><div class="leg-em-cell"><span class="leg-em-k">PM₂.₅</span><span class="leg-em-v">${fmtMass(emYr.pm25)}</span></div><div class="leg-em-cell"><span class="leg-em-k">Black C</span><span class="leg-em-v">${fmtMass(emYr.bc, 'kt')}</span></div></div><div class="leg-delta-track"><div class="leg-delta-fill" style="width:${ratioPct}%;background:${barColor}"></div></div>`;
    } else {
      const modisDet = yrRow ? (yrRow.modisTotal || yrRow.detections) : mappedDetections;
      const avgFrp = modisDet && totalFrp ? (totalFrp / modisDet).toFixed(1) : '—';
      const highPct = yrRow && modisDet ? Math.round(((yrRow.highFrpCount || 0) / modisDet) * 100) : null;
      emBlock.innerHTML = `<div class="leg-ctx-head"><span class="leg-ctx-title">Pre-GFAS Baseline (${yr})</span><span class="leg-ctx-meta">CAMS starts 2003</span></div><div class="leg-em-strip"><div class="leg-em-cell"><span class="leg-em-k">MODIS</span><span class="leg-em-v">${modisDet ? fmtCompact(modisDet) : '—'}</span></div><div class="leg-em-cell"><span class="leg-em-k">Mean FRP</span><span class="leg-em-v">${avgFrp === '—' ? '—' : `${avgFrp} MW`}</span></div><div class="leg-em-cell"><span class="leg-em-k">High Int.</span><span class="leg-em-v">${highPct !== null ? `${highPct}%` : '—'}</span></div></div>`;
    }
    contextBox.appendChild(emBlock);

    const detBtn = document.createElement('button');
    detBtn.type = 'button';
    detBtn.className = 'leg-det-btn';
    detBtn.setAttribute('aria-expanded', String(detailsOpen));
    detBtn.innerHTML = `<span>Regional &amp; Plume Detail</span><span>${detailsOpen ? '▾' : '▸'}</span>`;

    const detBody = document.createElement('div');
    detBody.className = 'leg-det-body';
    detBody.hidden = !detailsOpen;

    detBtn.addEventListener('click', () => {
      detailsOpen = !detailsOpen;
      detBtn.setAttribute('aria-expanded', String(detailsOpen));
      detBtn.lastElementChild.textContent = detailsOpen ? '▾' : '▸';
      detBody.hidden = !detailsOpen;
    });

    if (emYr?.topRegions?.length) {
      const top4 = emYr.topRegions.slice(0, 4);
      const maxVal = top4[0].co2 || 1;
      const totCo2 = emYr.co2 || top4.reduce((s, r) => s + r.co2, 0) || 1;
      detBody.insertAdjacentHTML('beforeend', `<div class="leg-ctx-block"><div class="leg-ctx-head"><span class="leg-ctx-title">Top Emitting Regions</span><span class="leg-ctx-meta">CO₂ (% share)</span></div><div class="leg-reg-list">${top4.map((r) => `<div class="leg-reg-row"><span class="leg-reg-name">${escHtml(r.name)}</span><span class="leg-reg-val">${fmtMass(r.co2, 'Mt')} · ${Math.round((r.co2 / totCo2) * 100)}%</span><div class="leg-reg-bar"><div class="leg-reg-fill" style="width:${Math.max(4, Math.round((r.co2 / maxVal) * 100))}%"></div></div></div>`).join('')}</div></div>`);
    } else if (yrRow?.topStates?.length) {
      const top4 = yrRow.topStates.slice(0, 4);
      const maxVal = top4[0].count || 1;
      detBody.insertAdjacentHTML('beforeend', `<div class="leg-ctx-block"><div class="leg-ctx-head"><span class="leg-ctx-title">Top Fire Regions (${yr})</span><span class="leg-ctx-meta">MODIS det.</span></div><div class="leg-reg-list">${top4.map((r) => `<div class="leg-reg-row"><span class="leg-reg-name">${escHtml(r.name)}</span><span class="leg-reg-val">${fmtCompact(r.count)}</span><div class="leg-reg-bar"><div class="leg-reg-fill" style="width:${Math.max(4, Math.round((r.count / maxVal) * 100))}%"></div></div></div>`).join('')}</div></div>`);
    }

    const hasDetectSplit = !!(yrRow && (yrRow.inNationalForestCount + yrRow.otherForestCount > 0 || yrRow.dayCount + yrRow.nightCount > 0));
    if (hasDetectSplit) {
      const nfTot = (yrRow.inNationalForestCount || 0) + (yrRow.otherForestCount || 0);
      const nfPct = nfTot > 0 ? Math.round((yrRow.inNationalForestCount / nfTot) * 100) : 0;
      const dnTot = (yrRow.dayCount || 0) + (yrRow.nightCount || 0);
      const dayPct = dnTot > 0 ? Math.round((yrRow.dayCount / dnTot) * 100) : 0;
      detBody.insertAdjacentHTML('beforeend', `<div class="leg-ctx-block"><div class="leg-ctx-head"><span class="leg-ctx-title">Burn Regime Split</span><span class="leg-ctx-meta">${fmtCompact(yrRow.detections || mappedDetections)} pts</span></div><div class="leg-split-rows">${nfTot > 0 ? `<div class="leg-split-item"><div class="leg-split-labels"><span>Natl Forest ${nfPct}%</span><span>Other ${100 - nfPct}%</span></div><div class="leg-split-track"><div class="leg-split-a" style="width:${nfPct}%"></div><div class="leg-split-b" style="width:${100 - nfPct}%"></div></div></div>` : ''}${dnTot > 0 ? `<div class="leg-split-item"><div class="leg-split-labels"><span>Daytime ${dayPct}%</span><span>Night ${100 - dayPct}%</span></div><div class="leg-split-track"><div class="leg-split-a leg-split-a--warm" style="width:${dayPct}%"></div><div class="leg-split-b leg-split-b--cool" style="width:${100 - dayPct}%"></div></div></div>` : ''}</div></div>`);
    } else if (emYr) {
      const coKt = (emYr.co || 0) / 1000;
      const ch4Kt = (emYr.ch4 || 0) / 1000;
      const smkTot = coKt + ((emYr.nox || 0) / 1000) + ch4Kt || 1;
      const coPct = Math.round((coKt / smkTot) * 100);
      detBody.insertAdjacentHTML('beforeend', `<div class="leg-ctx-block"><div class="leg-ctx-head"><span class="leg-ctx-title">Plume Gas Trace</span><span class="leg-ctx-meta">GFAS mass</span></div><div class="leg-split-rows"><div class="leg-split-item"><div class="leg-split-labels"><span>CO ${fmtMass(emYr.co)}</span><span>CH₄ ${fmtMass(emYr.ch4)}</span></div><div class="leg-split-track"><div class="leg-split-a leg-split-a--warm" style="width:${coPct}%"></div><div class="leg-split-b" style="width:${100 - coPct}%"></div></div></div><div class="leg-split-item"><div class="leg-split-labels"><span>NOx ${fmtMass(emYr.nox)}</span><span>SO₂ ${fmtMass(emYr.so2)}</span></div></div></div></div>`);
    }

    contextBox.append(detBtn, detBody);
  }

  function renderTelemetry(state, scope, fires, loading = false) {
    const meta = scope ? scope.meta : null;
    const yr = Number(state.year);

    for (const [id, b] of cBtns) b.setAttribute('aria-pressed', String(id === state.countryId));
    title.textContent = `${yr} · ${meta ? meta.shortName : state.countryId}`;

    const summary = scope ? scope.summary : null;
    const yrRow = summary?.byYear?.get(yr) || null;
    const fs = fires?.summary || null;
    const mappedDetections = (fs?.detections) || (yrRow && (yrRow.detections || yrRow.modisTotal || yrRow.allTotal)) || null;
    const totalFrp = (fs?.totalFrpMw) || yrRow?.totalFrpMw || null;
    const peakDensity = computePeakDensity(fires);
    const isMajorEvent = !!(meta?.eventYears?.includes(yr));
    const hasSpatialFires = !!(fires?.features?.length);
    const isViirsOnly = yrRow ? (yrRow.sensor === 'VIIRS' && !(yrRow.modisTotal > 0)) : !!(fs && fs.sensor === 'VIIRS');
    const medTotal = isViirsOnly ? summary?.medianViirs : summary?.medianTotal;
    const p75Total = isViirsOnly ? summary?.p75Viirs : summary?.p75Total;
    const p90Total = isViirsOnly ? summary?.p90Viirs : summary?.p90Total;
    const comparableTotal = yrRow ? (isViirsOnly ? (yrRow.viirsTotal || yrRow.detections) : (yrRow.modisTotal || yrRow.detections || yrRow.allTotal)) : mappedDetections;
    const relRatio = (medTotal > 0 && comparableTotal) ? (comparableTotal / medTotal) : null;
    const emYr = scope?.emissions?.years?.[yr] || null;
    const emMed = scope?.emissions?.medians?.co2 || null;
    const emRanks = scope?.emissions?.ranksByYear?.[yr] || null;
    const emYearCount = scope?.emissions?.yearCount || 24;
    const emRatio = (emYr && emMed > 0) ? (emYr.co2 / emMed) : null;

    let statusClass = 'is-baseline';
    let statusLabel = 'Baseline';
    if (loading && !yrRow) { statusClass = 'is-loading'; statusLabel = 'Loading CSV'; }
    else if (!hasSpatialFires && !comparableTotal && !emYr) { statusClass = ''; statusLabel = 'Awaiting CSV'; }
    else if ((p90Total && medTotal && p90Total > medTotal && comparableTotal >= p90Total && (emRatio === null || emRatio >= 0.85)) || (emRatio !== null && emRatio >= 1.75) || (isMajorEvent && (emRatio === null || emRatio >= 0.85)) || (peakDensity >= 4.0 && (relRatio === null || relRatio >= 0.95) && (emRatio === null || emRatio >= 0.95))) { statusClass = 'is-extreme'; statusLabel = 'Critical Surge'; }
    else if ((p75Total && medTotal && p75Total > medTotal && comparableTotal >= p75Total && (emRatio === null || emRatio >= 0.8)) || (emRatio !== null && emRatio >= 1.2) || (peakDensity >= 1.5 && (relRatio === null || relRatio >= 0.8) && (emRatio === null || emRatio >= 0.85))) { statusClass = 'is-elevated'; statusLabel = 'High Stress'; }
    else if ((relRatio !== null && relRatio >= 0.45) || (emRatio !== null && emRatio >= 0.45) || (hasSpatialFires && relRatio === null && emRatio === null)) { statusClass = 'is-moderate'; statusLabel = 'Active Season'; }

    badge.className = `leg-badge${statusClass ? ` ${statusClass}` : ''}`;
    badge.textContent = statusLabel;

    const sensorTag = fs?.sensor || yrRow?.sensor || null;
    let detSub = sensorTag ? `${sensorTag} detections` : (emYr ? 'point CSV not archived' : 'mapped points');
    if (comparableTotal && medTotal > 0 && (!isViirsOnly || comparableTotal !== medTotal)) {
      const pct = Math.round(((comparableTotal - medTotal) / medTotal) * 100);
      detSub = `${sensorTag === 'VIIRS' && isViirsOnly ? 'VIIRS ' : ''}${pct >= 0 ? '+' : ''}${pct}% vs med`;
    }
    const maxFrp = fs?.maxFrpMw || yrRow?.maxFrpMw || null;
    const topStateName = fs?.topState?.name || yrRow?.topStates?.[0]?.name || emYr?.topRegions?.[0]?.name;
    const co2Pct = emYr && emMed > 0 ? Math.round(((emYr.co2 - emMed) / emMed) * 100) : null;
    const co2Sub = emYr
      ? `${emRanks?.co2 ? `#${emRanks.co2}/${emYearCount}` : 'CAMS GFAS'}${co2Pct !== null ? ` · ${co2Pct >= 0 ? '+' : ''}${co2Pct}%` : ''}`
      : 'starts 2003';

    const frpSub = maxFrp
      ? `Peak ${fmtCompact(maxFrp)} MW`
      : (yrRow?.hasSpatialGrid ? 'GFAS loc. grid mapped' : (yrRow?.summaryOnly ? 'summary counts only' : (emYr ? 'see CO₂ emissions' : 'radiative heat')));
    const densSub = topStateName
      ? `Top: ${topStateName}`
      : (fs?.activeCells ? `${fs.activeCells} hotspots` : 'no point CSV for yr');

    kpis.innerHTML = '';
    kpis.append(
      makeKpi('Detections', mappedDetections ? fmtCompact(mappedDetections) : '—', detSub, statusClass === 'is-extreme' ? 'is-hot' : ''),
      makeKpi('Fire Power', totalFrp ? `${fmtCompact(totalFrp)} MW` : '—', frpSub, totalFrp > 2_500_000 ? 'is-warn' : ''),
      makeKpi('Peak Density', peakDensity > 0 ? `${peakDensity.toFixed(2)} / 5km²` : '—', densSub, peakDensity >= 2.2 ? 'is-hot' : peakDensity >= 0.65 ? 'is-warn' : ''),
      makeKpi('CO₂ Emissions', emYr ? fmtMass(emYr.co2, 'Mt') : '—', co2Sub, emRatio !== null && emRatio >= 1.75 ? 'is-hot' : emRatio !== null && emRatio >= 1.2 ? 'is-warn' : ''),
    );

    const topForestName = fs?.topForest?.name || yrRow?.topForests?.[0]?.name || emYr?.topForests?.[0]?.name;
    if (loading) {
      brief.className = 'leg-brief is-muted';
      brief.textContent = `Streaming ${yr} fire detections for ${meta ? meta.shortName : state.countryId}…`;
    } else if (!hasSpatialFires && !comparableTotal && !emYr) {
      brief.className = 'leg-brief is-muted';
      brief.innerHTML = `No fire CSV rows loaded for <strong>${escHtml(meta ? meta.shortName : state.countryId)}</strong>.`;
    } else if (yrRow && yrRow.modisTotal > 0 && yrRow.viirsTotal > 0 && mappedDetections) {
      brief.className = 'leg-brief';
      brief.innerHTML = `<strong>${fmtCompact(mappedDetections)}</strong> MODIS + <strong>${fmtCompact(yrRow.viirsTotal)}</strong> VIIRS${topForestName ? ` · Top: <strong>${escHtml(topForestName)}</strong>` : ''}.`;
    } else if (topForestName && statusClass === 'is-extreme') {
      brief.className = 'leg-brief';
      brief.innerHTML = `<strong>Alert:</strong> Peak activity in <strong>${escHtml(topForestName)}</strong>.`;
    } else {
      brief.className = 'leg-brief is-muted';
      brief.innerHTML = topForestName ? `Peak activity: <strong>${escHtml(topForestName)}</strong>.` : 'Compare fire clusters and atmospheric smoke plumes across years.';
    }

    renderContext(scope, yr, yrRow, mappedDetections, totalFrp);
  }

  async function render(state) {
    const my = ++token;
    const scopePath = data.scopePath(state);
    const scope = await data.getScope(state);
    if (my !== token) return;
    const overlayKey = `${state.showPredictedOverlay}:${state.horizonYear}:${state.warmingPct}`;
    if (scopePath !== lastScopeKey || overlayKey !== lastOverlayState) {
      lastScopeKey = scopePath;
      lastOverlayState = overlayKey;
      buildLayers(state);
    }
    if (scope?.hasFireCsvs) renderTelemetry(state, scope, null, true);
    const fires = await data.getFires(state, state.year);
    if (my !== token) return;
    renderTelemetry(state, scope, fires, false);
  }

  store.subscribe((state, prev) => {
    if (state.year !== prev.year || state.countryId !== prev.countryId
      || state.showPredictedOverlay !== prev.showPredictedOverlay || state.horizonYear !== prev.horizonYear || state.warmingPct !== prev.warmingPct) {
      render(state);
    }
  });
  await render(store.get());
}
