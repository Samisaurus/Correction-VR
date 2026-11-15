// js/map/legend.js
// Purpose: side-by-side Field Alert & Layer Guide (#map-legend) outside the map window.
//          Conveys live fire/smoke/river severity, peak hotspots, urgent causal context,
//          and intuitive visual scales in a vertical rail (>= 1200px) or horizontal deck (< 1200px).

const STYLE = `
.leg-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--c-paper);
  color: var(--c-ink);
  font-size: 12px;
  line-height: 1.4;
}
.leg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--c-edge);
  background: linear-gradient(180deg, rgba(246, 248, 250, 0.9), #FFFFFF);
}
.leg-title-wrap {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.leg-kicker {
  font-family: var(--f-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-muted);
}
.leg-title {
  font-family: var(--f-serif);
  font-size: 16px;
  font-weight: 700;
  color: var(--c-ink);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.leg-badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 5px;
  font-family: var(--f-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border: 1px solid var(--c-edge);
  background: var(--c-panel);
  color: var(--c-muted);
}
.leg-badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.leg-badge.is-extreme {
  background: #FEF2F2;
  border-color: #FCA5A5;
  color: #B91C1C;
}
.leg-badge.is-extreme .leg-badge-dot {
  animation: legPulse 1.3s ease-in-out infinite;
}
.leg-badge.is-elevated {
  background: #FFFBEB;
  border-color: #FCD34D;
  color: #B45309;
}
.leg-badge.is-moderate {
  background: #FFF7ED;
  border-color: #FDBA74;
  color: #C2410C;
}
.leg-badge.is-baseline {
  background: #F0FDF4;
  border-color: #86EFAC;
  color: #15803D;
}
.leg-badge.is-loading {
  background: #EFF6FF;
  border-color: #93C5FD;
  color: #1D4ED8;
}
.leg-badge.is-loading .leg-badge-dot {
  animation: legPulse 0.9s ease-in-out infinite;
}

@keyframes legPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(1.35); }
}

.leg-telemetry {
  padding: 10px 14px;
  border-bottom: 1px solid var(--c-edge);
  background: var(--c-panel);
}
.leg-kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}
.leg-kpi {
  background: var(--c-paper);
  border: 1px solid var(--c-edge);
  border-radius: 5px;
  padding: 6px 8px;
  min-width: 0;
}
.leg-kpi-label {
  display: block;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--c-muted);
}
.leg-kpi-val {
  display: block;
  margin-top: 1px;
  font-family: var(--f-mono);
  font-size: 14px;
  font-weight: 700;
  color: var(--c-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.leg-kpi-sub {
  display: block;
  font-size: 10.5px;
  color: var(--c-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.leg-kpi-val.is-hot { color: #B91C1C; }
.leg-kpi-val.is-warn { color: #C2410C; }
.leg-kpi-val.is-purple { color: #6A3093; }

.leg-brief {
  margin: 8px 0 0;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--c-ink);
}
.leg-brief strong { color: var(--c-ink); }
.leg-brief.is-muted { color: var(--c-muted); }

.leg-layers {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 11px 14px;
}
.leg-context {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px 11px;
  border-top: 1px solid var(--c-edge);
  background: linear-gradient(180deg, rgba(246, 248, 250, 0.45), rgba(246, 248, 250, 0.85));
}
.leg-ctx-block {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.leg-ctx-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
}
.leg-ctx-title {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--c-ink);
}
.leg-ctx-meta {
  font-family: var(--f-mono);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: var(--c-muted);
  white-space: nowrap;
  flex: 0 0 auto;
}
.leg-em-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
}
.leg-em-cell {
  background: var(--c-paper);
  border: 1px solid var(--c-edge);
  border-radius: 4px;
  padding: 4px 6px;
  min-width: 0;
}
.leg-em-k {
  display: block;
  font-size: 9.5px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--c-muted);
}
.leg-em-v {
  display: block;
  font-family: var(--f-mono);
  font-variant-numeric: tabular-nums;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.leg-delta-track {
  position: relative;
  height: 5px;
  border-radius: 3px;
  background: #E2E8F0;
  overflow: hidden;
}
.leg-delta-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 220ms var(--ease-out);
}
.leg-reg-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.leg-reg-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 8px;
  align-items: center;
}
.leg-reg-name {
  font-size: 11px;
  font-weight: 500;
  color: var(--c-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.leg-reg-val {
  font-family: var(--f-mono);
  font-variant-numeric: tabular-nums;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--c-muted);
}
.leg-reg-bar {
  grid-column: 1 / -1;
  height: 3.5px;
  border-radius: 2px;
  background: #E2E8F0;
  overflow: hidden;
}
.leg-reg-fill {
  height: 100%;
  border-radius: 2px;
  background: #D55E00;
  transition: width 220ms var(--ease-out);
}
.leg-split-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.leg-split-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.leg-split-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  color: var(--c-muted);
  font-family: var(--f-mono);
  font-variant-numeric: tabular-nums;
}
.leg-split-track {
  display: flex;
  height: 5px;
  border-radius: 3px;
  overflow: hidden;
  background: #E2E8F0;
}
.leg-split-a { background: #2B5FC7; transition: width 220ms var(--ease-out); }
.leg-split-b { background: #94A3B8; transition: width 220ms var(--ease-out); }
.leg-split-a--warm { background: #D55E00; }
.leg-split-b--cool { background: #475569; }
.leg-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--c-edge);
}
.leg-card:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}
.leg-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.leg-card-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--c-ink);
}
.leg-card-tag {
  font-family: var(--f-mono);
  font-size: 10px;
  color: var(--c-muted);
}
.leg-bar-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.leg-bar {
  flex: 1 1 auto;
  height: 8px;
  border-radius: 4px;
  border: 1px solid rgba(15, 23, 42, 0.12);
}
.leg-bar--fire {
  background: linear-gradient(90deg, #FACC15 0%, #F59E0B 28%, #EA580C 56%, #DC2626 80%, #991B1B 100%);
}
.leg-bar--river {
  background: linear-gradient(90deg, #56B4E9 0%, #5B8FD9 36%, #6A58B7 68%, #7B3294 100%);
}
.leg-bar--smoke {
  background: linear-gradient(90deg, rgba(138, 127, 114, 0.12) 0%, rgba(126, 113, 99, 0.42) 55%, rgba(78, 66, 56, 0.8) 100%);
}
.leg-ticks {
  display: flex;
  justify-content: space-between;
  font-family: var(--f-mono);
  font-size: 9.5px;
  color: var(--c-muted);
}
.leg-desc {
  margin: 0;
  font-size: 11px;
  line-height: 1.35;
  color: var(--c-muted);
}
.leg-ember-dot {
  transform-origin: center;
  animation: legEmber 2.3s ease-in-out infinite;
}
@keyframes legEmber {
  0%, 100% { fill-opacity: 0.72; }
  50% { fill-opacity: 0.94; }
}

.leg-action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
}
.leg-basin-btn {
  width: 100%;
  padding: 5px 9px;
  border-radius: 5px;
  border: 1px solid var(--c-edge);
  background: var(--c-panel);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--c-ink);
  text-align: left;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.leg-basin-btn:hover:not([disabled]) {
  border-color: var(--c-basin);
  background: rgba(230, 159, 0, 0.08);
}

.leg-foot {
  padding: 9px 14px 11px;
  border-top: 1px solid var(--c-edge);
  background: var(--c-panel);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
}
.leg-countries {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  width: 100%;
}
.leg-cbtn {
  flex: 1 1 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 4px 7px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 5px;
  border: 1px solid var(--c-edge);
  background: var(--c-paper);
  color: var(--c-muted);
}
.leg-cbtn[aria-pressed="true"] {
  color: var(--c-ink);
  border-color: var(--c-win-border-hover, var(--c-ink));
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}
.leg-swatch {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  display: inline-block;
}
.leg-swatch[data-country="canada"] { background: #2A9D8F; }
.leg-swatch[data-country="usa"] { background: #C84B59; }
.leg-swatch[data-country="russia"] { background: #3D6CB9; }

@media (max-width: 1199px) {
  .leg-kpis {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .leg-layers {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px 14px;
  }
  .leg-context {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px 16px;
  }
  .leg-card {
    padding-bottom: 0;
    border-bottom: 0;
    padding-right: 12px;
    border-right: 1px dashed var(--c-edge);
  }
  .leg-card:last-child {
    padding-right: 0;
    border-right: 0;
  }
  .leg-countries {
    width: auto;
  }
}

@media (max-width: 799px) {
  .leg-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .leg-layers {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .leg-context {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .leg-card:nth-child(even) {
    padding-right: 0;
    border-right: 0;
  }
}

@media (max-width: 519px) {
  .leg-layers {
    grid-template-columns: 1fr;
  }
  .leg-card {
    padding-right: 0;
    border-right: 0;
    padding-bottom: 8px;
    border-bottom: 1px dashed var(--c-edge);
  }
  .leg-card:last-child {
    padding-bottom: 0;
    border-bottom: 0;
  }
}
`;

const NS = 'http://www.w3.org/2000/svg';

function injectStyle() {
  if (document.querySelector('style[data-module="leg"]')) return;
  const s = document.createElement('style');
  s.dataset.module = 'leg';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

function fmtCompact(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toLocaleString('en-US');
}

function makeFireDotsSvg(isBasin) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '52');
  svg.setAttribute('height', '22');
  svg.setAttribute('viewBox', '0 0 52 22');
  const k = isBasin ? 0.68 : 0.42;
  const r = (n) => (1.3 + k * Math.sqrt(n)).toFixed(1);
  svg.innerHTML = `<circle cx="7" cy="11" r="${r(8)}" fill="#FACC15" fill-opacity="0.72"/>`
    + `<circle cx="22" cy="11" r="${r(65)}" fill="#EA580C" fill-opacity="0.78"/>`
    + `<circle class="leg-ember-dot" cx="41" cy="11" r="${r(320)}" fill="#991B1B" fill-opacity="0.82"/>`;
  return svg;
}

export async function mount(el, ctx) {
  injectStyle();
  const { store, data, theme } = ctx;
  const regions = await data.getRegions();

  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'leg-root';

  const head = document.createElement('div');
  head.className = 'leg-head';
  const titleWrap = document.createElement('div');
  titleWrap.className = 'leg-title-wrap';
  const kicker = document.createElement('span');
  kicker.className = 'leg-kicker';
  kicker.textContent = 'Live Field Signal';
  const title = document.createElement('div');
  title.className = 'leg-title';
  titleWrap.append(kicker, title);

  const badge = document.createElement('span');
  badge.className = 'leg-badge';
  const badgeDot = document.createElement('span');
  badgeDot.className = 'leg-badge-dot';
  const badgeText = document.createElement('span');
  badge.append(badgeDot, badgeText);
  head.append(titleWrap, badge);

  const telemetry = document.createElement('div');
  telemetry.className = 'leg-telemetry';
  const kpis = document.createElement('div');
  kpis.className = 'leg-kpis';
  const brief = document.createElement('p');
  brief.className = 'leg-brief';
  telemetry.append(kpis, brief);

  const layers = document.createElement('div');
  layers.className = 'leg-layers';

  const contextBox = document.createElement('div');
  contextBox.className = 'leg-context';

  const foot = document.createElement('div');
  foot.className = 'leg-foot';
  const cRow = document.createElement('div');
  cRow.className = 'leg-countries';
  const cBtns = new Map();
  if (regions && Array.isArray(regions.countries)) {
    for (const c of regions.countries) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'leg-cbtn';
      btn.setAttribute('aria-pressed', 'false');
      const sw = document.createElement('span');
      sw.className = 'leg-swatch';
      sw.dataset.country = c.id;
      btn.append(sw, document.createTextNode(c.shortName || c.id));
      btn.addEventListener('click', () => store.set({ countryId: c.id, playing: false }));
      cRow.appendChild(btn);
      cBtns.set(c.id, btn);
    }
  }
  foot.appendChild(cRow);
  root.append(head, telemetry, layers, contextBox, foot);
  el.appendChild(root);

  let token = 0;
  let lastScopeKey = null;
  let lastRiverSummary = null;
  let lastState = store.get();

  function buildLayers(meta) {
    const basin = meta && meta.kind === 'basin';
    layers.innerHTML = '';

    // 1. Wildfire Density
    const fireCard = document.createElement('div');
    fireCard.className = 'leg-card';
    fireCard.innerHTML = '<div class="leg-card-head"><span class="leg-card-title">1. Wildfire Density</span><span class="leg-card-tag">per 5 km²</span></div>';
    const fireBarWrap = document.createElement('div');
    fireBarWrap.className = 'leg-bar-wrap';
    const fireBar = document.createElement('div');
    fireBar.className = 'leg-bar leg-bar--fire';
    fireBarWrap.append(makeFireDotsSvg(basin), fireBar);
    fireCard.appendChild(fireBarWrap);
    fireCard.insertAdjacentHTML('beforeend',
      '<div class="leg-ticks"><span>&lt;0.05 low</span><span>0.6+ active</span><span>6+ extreme</span></div>'
      + `<p class="leg-desc">Translucent ${basin ? '0.05°' : '0.2°'} clusters sort intense red cores on top.</p>`);

    // 2. River Runoff Exposure
    const riverCard = document.createElement('div');
    riverCard.className = 'leg-card';
    riverCard.innerHTML = '<div class="leg-card-head"><span class="leg-card-title">2. River Ash &amp; Runoff</span><span class="leg-card-tag">width = order</span></div>'
      + '<div class="leg-bar leg-bar--river"></div>'
      + '<div class="leg-ticks"><span>Clean blue</span><span>Elevated</span><span>Toxic purple</span></div>'
      + '<p class="leg-desc">Post-burn erosion carries charcoal &amp; metals down salmon rivers.</p>';

    // 3. Downwind Smoke Choke
    const smokeCard = document.createElement('div');
    smokeCard.className = 'leg-card';
    smokeCard.innerHTML = '<div class="leg-card-head"><span class="leg-card-title">3. Smoke Plume (AOD)</span><span class="leg-card-tag">May–Sep</span></div>'
      + '<div class="leg-bar leg-bar--smoke"></div>'
      + '<div class="leg-ticks"><span>0.0 clear</span><span>0.25 haze</span><span>0.60+ severe</span></div>'
      + '<p class="leg-desc">Airborne fine aerosols dim light &amp; stress downwind basins.</p>';

    // 4. Case Study & Terrain
    const ctxCard = document.createElement('div');
    ctxCard.className = 'leg-card';
    ctxCard.innerHTML = `<div class="leg-card-head"><span class="leg-card-title">4. ${basin ? '3D Basin Terrain' : 'Case-Study Focus'}</span><span class="leg-card-tag">${basin ? 'Kd490 + DEM' : 'contours on zoom'}</span></div>`
      + `<p class="leg-desc">${basin ? 'Green water box tracks coastal light attenuation downstream.' : 'Dashed orange border marks salmon watershed test zone.'}</p>`;
    if (basin || (meta && meta.basin)) {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'leg-basin-btn';
      actionBtn.innerHTML = basin
        ? '<span>← Return to country map</span><span>Reset</span>'
        : `<span>Zoom to ${meta.basin.shortName} basin</span><span>3D →</span>`;
      actionBtn.addEventListener('click', () => store.set({ view: basin ? 'country' : 'basin' }));
      ctxCard.appendChild(actionBtn);
    }

    layers.append(fireCard, riverCard, smokeCard, ctxCard);
  }

  function makeKpi(label, val, sub, toneClass = '') {
    const box = document.createElement('div');
    box.className = 'leg-kpi';
    const l = document.createElement('span');
    l.className = 'leg-kpi-label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = `leg-kpi-val${toneClass ? ` ${toneClass}` : ''}`;
    v.textContent = val;
    const s = document.createElement('span');
    s.className = 'leg-kpi-sub';
    s.textContent = sub;
    box.append(l, v, s);
    return box;
  }

  function computePeakDensity(fires, isBasin) {
    if (fires && fires.summary && Number.isFinite(fires.summary.peakDensity5km2)) {
      return fires.summary.peakDensity5km2;
    }
    if (!fires || !Array.isArray(fires.features) || !fires.features.length) return 0;
    const deg = (fires && fires.gridDeg) || (isBasin ? 0.1 : 0.5);
    let peak = 0;
    for (let i = 0; i < fires.features.length; i += 1) {
      const f = fires.features[i];
      const lat = f && f.geometry && Array.isArray(f.geometry.coordinates) ? Number(f.geometry.coordinates[1]) : 0;
      const cosLat = Math.max(0.15, Math.cos(lat * (Math.PI / 180)));
      const area = (deg * 110.574) * (deg * 111.32 * cosLat);
      const dens = area > 0 ? (Number(f.properties && f.properties.count) || 0) / (area / 5) : 0;
      if (dens > peak) peak = dens;
    }
    return Number(peak.toFixed(2));
  }

  function renderTelemetry(state, scope, fires, loading = false) {
    const meta = scope ? scope.meta : null;
    const basin = meta && meta.kind === 'basin';
    const yr = Number(state.year);

    for (const [id, b] of cBtns) b.setAttribute('aria-pressed', String(id === state.countryId));
    title.textContent = `${yr} · ${meta ? meta.shortName : state.countryId}`;

    if (loading) {
      badge.className = 'leg-badge is-loading';
      badgeText.textContent = 'Streaming CSV';
    }

    const summary = scope ? scope.summary : null;
    const yrRow = summary && summary.byYear ? summary.byYear.get(yr) : null;
    const fs = fires && fires.summary ? fires.summary : null;
    const mappedDetections = (fs && fs.detections) || (yrRow && (yrRow.detections || yrRow.modisTotal || yrRow.allTotal)) || null;
    const totalFrp = (fs && fs.totalFrpMw) || (yrRow && yrRow.totalFrpMw) || null;
    const peakDensity = computePeakDensity(fires, basin);
    const isMajorEvent = meta && Array.isArray(meta.eventYears) && meta.eventYears.includes(yr);
    const hasSpatialFires = !!(fires && Array.isArray(fires.features) && fires.features.length > 0);
    const isViirsOnly = yrRow ? (yrRow.sensor === 'VIIRS' && !(yrRow.modisTotal > 0)) : !!(fs && fs.sensor === 'VIIRS');
    const medTotal = isViirsOnly ? (summary ? summary.medianViirs : null) : (summary ? summary.medianTotal : null);
    const p75Total = isViirsOnly ? (summary ? summary.p75Viirs : null) : (summary ? summary.p75Total : null);
    const p90Total = isViirsOnly ? (summary ? summary.p90Viirs : null) : (summary ? summary.p90Total : null);
    const comparableTotal = yrRow ? (isViirsOnly ? (yrRow.viirsTotal || yrRow.detections) : (yrRow.modisTotal || yrRow.detections || yrRow.allTotal)) : mappedDetections;
    const relRatio = (medTotal && medTotal > 0 && comparableTotal) ? (comparableTotal / medTotal) : null;
    const emYr = scope && scope.emissions && scope.emissions.years ? scope.emissions.years[yr] : null;
    const emMed = scope && scope.emissions && scope.emissions.medians ? scope.emissions.medians.co2 : null;
    const emRatio = (emYr && emMed > 0) ? (emYr.co2 / emMed) : null;

    let statusClass = 'is-baseline';
    let statusLabel = 'Baseline';
    if (loading && !yrRow) {
      statusClass = 'is-loading';
      statusLabel = 'Loading CSV';
    } else if (!hasSpatialFires && !comparableTotal) {
      statusClass = '';
      statusLabel = 'Awaiting CSV';
    } else if (
      (p90Total && medTotal && p90Total > medTotal && comparableTotal >= p90Total && (emRatio === null || emRatio >= 0.85))
      || (emRatio !== null && emRatio >= 1.75)
      || (isMajorEvent && (emRatio === null || emRatio >= 0.85))
      || (peakDensity >= 4.0 && (relRatio === null || relRatio >= 0.95) && (emRatio === null || emRatio >= 0.95))
    ) {
      statusClass = 'is-extreme';
      statusLabel = 'Critical Surge';
    } else if (
      (p75Total && medTotal && p75Total > medTotal && comparableTotal >= p75Total && (emRatio === null || emRatio >= 0.8))
      || (emRatio !== null && emRatio >= 1.2)
      || (peakDensity >= 1.5 && (relRatio === null || relRatio >= 0.8) && (emRatio === null || emRatio >= 0.85))
    ) {
      statusClass = 'is-elevated';
      statusLabel = 'High Stress';
    } else if (
      (relRatio !== null && relRatio >= 0.45)
      || (emRatio !== null && emRatio >= 0.45)
      || (hasSpatialFires && relRatio === null && emRatio === null)
    ) {
      statusClass = 'is-moderate';
      statusLabel = 'Active Season';
    }
    badge.className = `leg-badge${statusClass ? ` ${statusClass}` : ''}`;
    badgeText.textContent = statusLabel;

    const sensorTag = (fs && fs.sensor) || (yrRow && yrRow.sensor) || null;
    let detSub = sensorTag ? `${sensorTag} detections` : 'mapped points';
    if (comparableTotal && medTotal && medTotal > 0 && (!isViirsOnly || comparableTotal !== medTotal)) {
      const pct = Math.round(((comparableTotal - medTotal) / medTotal) * 100);
      detSub = `${sensorTag === 'VIIRS' && isViirsOnly ? 'VIIRS ' : ''}${pct >= 0 ? '+' : ''}${pct}% vs med`;
    }
    const detVal = mappedDetections ? fmtCompact(mappedDetections) : '—';
    const frpVal = totalFrp ? `${fmtCompact(totalFrp)} MW` : '—';
    const maxFrp = (fs && fs.maxFrpMw) || (yrRow && yrRow.maxFrpMw) || null;
    const frpSub = maxFrp ? `Peak ${fmtCompact(maxFrp)} MW` : 'radiative heat';
    const peakVal = peakDensity > 0 ? `${peakDensity.toFixed(2)} / 5km²` : '—';
    const topStateName = (fs && fs.topState && fs.topState.name)
      || (yrRow && yrRow.topStates && yrRow.topStates[0] && yrRow.topStates[0].name);
    const peakSub = topStateName
      ? `Top: ${topStateName}`
      : (fs && fs.activeCells ? `${fs.activeCells} hotspots` : 'hotspot density');

    const rSum = lastRiverSummary && lastRiverSummary.year === yr ? lastRiverSummary.summary : null;
    const riverVal = rSum
      ? (rSum.highRiskRivers > 0 ? `${rSum.highRiskRivers} severe` : rSum.elevatedRivers > 0 ? `${rSum.elevatedRivers} stressed` : 'Clear')
      : '—';
    const riverSub = rSum && rSum.worstRiverName && rSum.maxExposurePct > 0
      ? `${rSum.worstRiverName} (${rSum.maxExposurePct}%)`
      : 'watershed runoff';

    kpis.innerHTML = '';
    kpis.append(
      makeKpi('Detections', detVal, detSub, statusClass === 'is-extreme' ? 'is-hot' : ''),
      makeKpi('Fire Power', frpVal, frpSub, totalFrp > 2_500_000 ? 'is-warn' : ''),
      makeKpi('Peak Density', peakVal, peakSub, peakDensity >= 2.2 ? 'is-hot' : peakDensity >= 0.65 ? 'is-warn' : ''),
      makeKpi('River Risk', riverVal, riverSub, rSum && rSum.highRiskRivers > 0 ? 'is-purple' : ''),
    );

    const outageDates = summary && summary.viirsOutageByYear && summary.viirsOutageByYear[yr];
    const outageNote = outageDates && outageDates.length ? ` · ${outageDates.length} VIIRS outage day${outageDates.length > 1 ? 's' : ''}` : '';
    const topForestName = (fs && fs.topForest && fs.topForest.name)
      || (yrRow && yrRow.topForests && yrRow.topForests[0] && yrRow.topForests[0].name);

    if (loading) {
      brief.className = 'leg-brief is-muted';
      brief.textContent = `Streaming ${yr} fire detections for ${meta ? meta.shortName : state.countryId}…`;
    } else if (!hasSpatialFires && !comparableTotal) {
      brief.className = 'leg-brief is-muted';
      brief.innerHTML = `No fire CSV rows loaded for <strong>${meta ? meta.shortName : state.countryId}</strong> yet. Add CSVs in <code>data/${state.countryId}/</code>.`;
    } else if (yrRow && yrRow.modisTotal > 0 && yrRow.viirsTotal > 0 && mappedDetections) {
      brief.className = 'leg-brief';
      brief.innerHTML = `<strong>${fmtCompact(mappedDetections)}</strong> MODIS mapped + <strong>${fmtCompact(yrRow.viirsTotal)}</strong> VIIRS (${fmtCompact(yrRow.allTotal)} total)${topForestName ? ` · Top: <strong>${topForestName}</strong>` : ''}${outageNote}.`;
    } else if (isViirsOnly && mappedDetections) {
      brief.className = 'leg-brief';
      brief.innerHTML = `<strong>${fmtCompact(mappedDetections)}</strong> VIIRS detections${topForestName ? ` · Top: <strong>${topForestName}</strong>` : ''}${outageNote}.`;
    } else if (topForestName && statusClass === 'is-extreme') {
      brief.className = 'leg-brief';
      brief.innerHTML = `<strong>Alert:</strong> Peak pressure in <strong>${topForestName}</strong>${topStateName && !topForestName.includes(topStateName) ? ` (${topStateName})` : ''}${outageNote}.`;
    } else if (rSum && rSum.highRiskRivers > 0 && rSum.worstRiverName) {
      brief.className = 'leg-brief';
      brief.innerHTML = `<strong>Runoff alert:</strong> <strong>${rSum.worstRiverName}</strong> shows high burn-zone ash exposure (${rSum.maxExposurePct}%).`;
    } else if (topForestName) {
      brief.className = 'leg-brief is-muted';
      brief.innerHTML = `Peak activity: <strong>${topForestName}</strong>${outageNote}.`;
    } else {
      brief.className = 'leg-brief is-muted';
      brief.textContent = `Compare fire clusters, smoke drift & downstream river color across years.`;
    }

    renderContext(state, scope, yr, yrRow, mappedDetections, totalFrp);
  }

  function fmtTonnes(t, unit = 'auto') {
    if (!Number.isFinite(Number(t))) return '—';
    const v = Number(t);
    if (unit === 'Mt' || (unit === 'auto' && v >= 1_000_000)) return `${(v / 1_000_000).toFixed(1)} Mt`;
    if (unit === 'kt' || (unit === 'auto' && v >= 1_000)) return `${(v / 1_000).toFixed(1)} kt`;
    return `${v.toFixed(0)} t`;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderContext(state, scope, yr, yrRow, mappedDetections, totalFrp) {
    const emRoot = scope && scope.emissions ? scope.emissions : null;
    const emYr = emRoot && emRoot.years ? emRoot.years[yr] : null;
    const ranks = emRoot && emRoot.ranksByYear ? emRoot.ranksByYear[yr] : null;
    const med = emRoot ? emRoot.medians : null;
    const yearCount = emRoot ? emRoot.yearCount : 24;

    contextBox.innerHTML = '';

    // 1. Atmospheric Emissions Pulse (GFAS 2003–2026) or Pre-GFAS MODIS Baseline (2002)
    const emBlock = document.createElement('div');
    emBlock.className = 'leg-ctx-block';
    if (emYr && med) {
      const medCo2 = med.co2 || 1;
      const pct = Math.round(((emYr.co2 - medCo2) / medCo2) * 100);
      const rankStr = ranks && ranks.co2 ? `#${ranks.co2}/${yearCount} (${pct >= 0 ? '+' : ''}${pct}%)` : `${pct >= 0 ? '+' : ''}${pct}% vs med`;
      const ratioPct = Math.max(8, Math.min(100, Math.round((emYr.co2 / Math.max(medCo2 * 2.5, emYr.co2)) * 100)));
      const barColor = pct >= 40 ? '#B91C1C' : pct >= 0 ? '#D55E00' : '#2A9D8F';
      emBlock.innerHTML = `
        <div class="leg-ctx-head">
          <span class="leg-ctx-title">Air Emissions (${yr}${yr === 2026 ? ' YTD' : ''})</span>
          <span class="leg-ctx-meta">${esc(rankStr)}</span>
        </div>
        <div class="leg-em-strip">
          <div class="leg-em-cell"><span class="leg-em-k">CO₂</span><span class="leg-em-v">${fmtTonnes(emYr.co2, 'Mt')}</span></div>
          <div class="leg-em-cell"><span class="leg-em-k">PM₂.₅</span><span class="leg-em-v">${fmtTonnes(emYr.pm25)}</span></div>
          <div class="leg-em-cell"><span class="leg-em-k">Black C</span><span class="leg-em-v">${fmtTonnes(emYr.bc, 'kt')}</span></div>
        </div>
        <div class="leg-delta-track" title="CO₂ emissions relative to 2003–2026 median (${fmtTonnes(medCo2, 'Mt')})">
          <div class="leg-delta-fill" style="width:${ratioPct}%;background:${barColor}"></div>
        </div>
      `;
    } else {
      const modisDet = yrRow ? (yrRow.modisTotal || yrRow.detections) : mappedDetections;
      const avgFrp = modisDet && totalFrp ? (totalFrp / modisDet).toFixed(1) : '—';
      const highPct = yrRow && modisDet ? Math.round(((yrRow.highFrpCount || 0) / modisDet) * 100) : null;
      emBlock.innerHTML = `
        <div class="leg-ctx-head">
          <span class="leg-ctx-title">Pre-GFAS Baseline (${yr})</span>
          <span class="leg-ctx-meta">CAMS starts 2003</span>
        </div>
        <div class="leg-em-strip">
          <div class="leg-em-cell"><span class="leg-em-k">MODIS</span><span class="leg-em-v">${modisDet ? fmtCompact(modisDet) : '—'}</span></div>
          <div class="leg-em-cell"><span class="leg-em-k">Mean FRP</span><span class="leg-em-v">${avgFrp === '—' ? '—' : `${avgFrp} MW`}</span></div>
          <div class="leg-em-cell"><span class="leg-em-k">High Int.</span><span class="leg-em-v">${highPct !== null ? `${highPct}%` : '—'}</span></div>
        </div>
      `;
    }
    contextBox.appendChild(emBlock);

    // 2. Top Emitting / Active Regions
    const regBlock = document.createElement('div');
    regBlock.className = 'leg-ctx-block';
    const hasEmRegs = !!(emYr && Array.isArray(emYr.topRegions) && emYr.topRegions.length > 0);
    const hasStateRows = !!(yrRow && Array.isArray(yrRow.topStates) && yrRow.topStates.length > 0);

    if (hasEmRegs) {
      const top4 = emYr.topRegions.slice(0, 4);
      const maxVal = top4[0].co2 || 1;
      const totCo2 = emYr.co2 || top4.reduce((s, r) => s + r.co2, 0) || 1;
      regBlock.innerHTML = `
        <div class="leg-ctx-head">
          <span class="leg-ctx-title">Top Emitting Regions</span>
          <span class="leg-ctx-meta">CO₂ (% share)</span>
        </div>
        <div class="leg-reg-list">
          ${top4.map((r) => {
            const w = Math.max(4, Math.round((r.co2 / maxVal) * 100));
            const share = Math.round((r.co2 / totCo2) * 100);
            return `<div class="leg-reg-row">
              <span class="leg-reg-name">${esc(r.name)}</span>
              <span class="leg-reg-val">${fmtTonnes(r.co2, 'Mt')} · ${share}%</span>
              <div class="leg-reg-bar"><div class="leg-reg-fill" style="width:${w}%"></div></div>
            </div>`;
          }).join('')}
        </div>
      `;
    } else if (hasStateRows) {
      const top4 = yrRow.topStates.slice(0, 4);
      const maxVal = top4[0].count || 1;
      regBlock.innerHTML = `
        <div class="leg-ctx-head">
          <span class="leg-ctx-title">Top Fire Regions (${yr})</span>
          <span class="leg-ctx-meta">MODIS det.</span>
        </div>
        <div class="leg-reg-list">
          ${top4.map((r) => {
            const w = Math.max(4, Math.round((r.count / maxVal) * 100));
            return `<div class="leg-reg-row">
              <span class="leg-reg-name">${esc(r.name)}</span>
              <span class="leg-reg-val">${fmtCompact(r.count)}</span>
              <div class="leg-reg-bar"><div class="leg-reg-fill" style="width:${w}%"></div></div>
            </div>`;
          }).join('')}
        </div>
      `;
    } else {
      regBlock.innerHTML = `
        <div class="leg-ctx-head">
          <span class="leg-ctx-title">Regional Signal (${yr})</span>
          <span class="leg-ctx-meta">awaiting CSV</span>
        </div>
        <p class="leg-desc">Select 2003–2026 to inspect regional CAMS emissions drivers.</p>
      `;
    }
    contextBox.appendChild(regBlock);

    // 3. Burn Regime / Smoke Chemistry Split
    const splitBlock = document.createElement('div');
    splitBlock.className = 'leg-ctx-block';
    const hasDetectSplit = !!(yrRow && (yrRow.inNationalForestCount + yrRow.otherForestCount > 0 || yrRow.dayCount + yrRow.nightCount > 0));
    if (hasDetectSplit) {
      const nfTot = (yrRow.inNationalForestCount || 0) + (yrRow.otherForestCount || 0);
      const nfPct = nfTot > 0 ? Math.round((yrRow.inNationalForestCount / nfTot) * 100) : 0;
      const dnTot = (yrRow.dayCount || 0) + (yrRow.nightCount || 0);
      const dayPct = dnTot > 0 ? Math.round((yrRow.dayCount / dnTot) * 100) : 0;
      splitBlock.innerHTML = `
        <div class="leg-ctx-head">
          <span class="leg-ctx-title">Burn Regime Split</span>
          <span class="leg-ctx-meta">${fmtCompact(yrRow.detections || mappedDetections)} pts</span>
        </div>
        <div class="leg-split-rows">
          ${nfTot > 0 ? `<div class="leg-split-item">
            <div class="leg-split-labels"><span>Natl Forest ${nfPct}%</span><span>State/Other ${100 - nfPct}%</span></div>
            <div class="leg-split-track"><div class="leg-split-a" style="width:${nfPct}%"></div><div class="leg-split-b" style="width:${100 - nfPct}%"></div></div>
          </div>` : ''}
          ${dnTot > 0 ? `<div class="leg-split-item">
            <div class="leg-split-labels"><span>Daytime ${dayPct}%</span><span>Night ${100 - dayPct}%</span></div>
            <div class="leg-split-track"><div class="leg-split-a leg-split-a--warm" style="width:${dayPct}%"></div><div class="leg-split-b leg-split-b--cool" style="width:${100 - dayPct}%"></div></div>
          </div>` : ''}
        </div>
      `;
    } else if (emYr) {
      const coKt = (emYr.co || 0) / 1000;
      const noxKt = (emYr.nox || 0) / 1000;
      const ch4Kt = (emYr.ch4 || 0) / 1000;
      const smkTot = coKt + noxKt + ch4Kt || 1;
      const coPct = Math.round((coKt / smkTot) * 100);
      splitBlock.innerHTML = `
        <div class="leg-ctx-head">
          <span class="leg-ctx-title">Plume Gas Trace</span>
          <span class="leg-ctx-meta">GFAS mass</span>
        </div>
        <div class="leg-split-rows">
          <div class="leg-split-item">
            <div class="leg-split-labels"><span>CO ${fmtTonnes(emYr.co)}</span><span>CH₄ ${fmtTonnes(emYr.ch4)}</span></div>
            <div class="leg-split-track"><div class="leg-split-a leg-split-a--warm" style="width:${coPct}%"></div><div class="leg-split-b" style="width:${100 - coPct}%"></div></div>
          </div>
          <div class="leg-split-item">
            <div class="leg-split-labels"><span>NOx ${fmtTonnes(emYr.nox)}</span><span>SO₂ ${fmtTonnes(emYr.so2)}</span></div>
          </div>
        </div>
      `;
    }
    if (splitBlock.innerHTML) contextBox.appendChild(splitBlock);
  }

  async function render(state) {
    lastState = state;
    const my = ++token;
    const scopePath = data.scopePath(state);
    const scope = await data.getScope(state);
    if (my !== token) return;
    const meta = scope ? scope.meta : null;
    if (scopePath !== lastScopeKey) {
      lastScopeKey = scopePath;
      buildLayers(meta);
    }

    const shouldStream = !!(scope && scope.hasFireCsvs);
    if (shouldStream) renderTelemetry(state, scope, null, true);

    const fires = await data.getFires(state, state.year);
    if (my !== token) return;
    renderTelemetry(state, scope, fires, false);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('ember:rivers-scored', (ev) => {
      const d = ev && ev.detail;
      if (!d) return;
      lastRiverSummary = d;
      if (d.scope === lastScopeKey && d.year === Number(lastState.year)) {
        data.getScope(lastState).then((scope) => {
          data.getFires(lastState, lastState.year).then((fires) => {
            renderTelemetry(lastState, scope, fires, false);
          });
        });
      }
    });
  }

  store.subscribe((state, prev) => {
    if (state.year !== prev.year || state.countryId !== prev.countryId || state.view !== prev.view) {
      render(state);
    }
  });
  await render(store.get());
}
