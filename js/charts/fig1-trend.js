// js/charts/fig1-trend.js
// Purpose: Fig. 1 (#fig1) — annual line + monthly trace + thick Sen trend line for the focused variable,
//          with Fire | Air | Water | Fish buttons that set focus and a Mann-Kendall stats line from stats.json.
// Exports: mount(el, ctx)
// Owner: GPT-UI · Task G4 (built here against the Session Primer v2). Uses Observable Plot 0.6 (contract R2).
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm';

const STYLE = `
.f1-root { padding: 10px 12px 8px; }
.f1-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; }
.f1-title { font-family: var(--f-serif); font-size: 15px; font-weight: 600; margin: 0; }
.f1-seg { display: inline-flex; border: 1px solid var(--c-rule); border-radius: 2px; overflow: hidden; }
.f1-seg button { border: 0; border-radius: 0; border-left: 1px solid var(--c-rule); padding: 2px 9px; font-size: 12.5px; color: var(--c-muted); background: var(--c-paper); }
.f1-seg button:first-child { border-left: 0; }
.f1-seg button[aria-pressed="true"] { color: var(--c-paper); background: var(--c-ink); }
.f1-seg button[data-group="fire"][aria-pressed="true"] { background: var(--c-fire); }
.f1-seg button[data-group="air"][aria-pressed="true"] { background: var(--c-smoke); }
.f1-seg button[data-group="water"][aria-pressed="true"] { background: var(--c-water); }
.f1-seg button[data-group="fish"][aria-pressed="true"] { background: var(--c-fish); }
.f1-plot { margin-top: 4px; min-height: 230px; }
.f1-plot svg { display: block; max-width: 100%; }
.f1-stats { font-family: var(--f-mono); font-size: 12.5px; color: var(--c-ink); margin: 4px 0 0; line-height: 1.5; }
.f1-stats .f1-muted { color: var(--c-muted); }
.f1-cap { font-size: 13px; font-style: italic; color: var(--c-muted); margin: 4px 0 0; }
.f1-link { color: var(--c-link); }
`;
const DAY = (y, m = 0, d = 1) => new Date(Date.UTC(y, m, d));

function injectStyle() {
  if (document.querySelector('style[data-module="f1"]')) return;
  const s = document.createElement('style');
  s.dataset.module = 'f1';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

function signed(v, digits) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  return `${v < 0 ? '−' : '+'}${abs}`;
}

function trendText(t, unit, theme) {
  if (!t) return null;
  const label = t.basis === 'annual' ? 'Mann-Kendall (annual)' : 'Seasonal Mann-Kendall (monthly)';
  const digits = Math.abs(t.sen_slope || 0) >= 100 ? 0 : 4;
  const tau = t.tau === null ? 'τ = —' : `τ = ${t.tau.toFixed(2).replace('-', '−')}`;
  return `${label}: ${tau} · ${theme.fmtP(t.p)} · Sen = ${signed(t.sen_slope, digits)} ${unit}/yr · ${t.direction}${t.n ? ` (n = ${t.n})` : ''}`;
}

export async function mount(el, ctx) {
  injectStyle();
  const { store, data, theme } = ctx;
  const { COLORS, VARS, GROUP_DEFAULT, GROUPS, GROUP_LABEL } = theme;
  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'f1-root';
  const head = document.createElement('div');
  head.className = 'f1-head';
  const title = document.createElement('h3');
  title.className = 'f1-title';
  title.textContent = 'Fig. 1 — Trend';
  const seg = document.createElement('div');
  seg.className = 'f1-seg';
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Variable group');
  const segButtons = {};
  for (const g of GROUPS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.group = g;
    b.textContent = GROUP_LABEL[g];
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      const varId = GROUP_DEFAULT[g] || (current && current.meta.fishMetric);
      if (varId) store.set({ focus: varId });
    });
    seg.appendChild(b);
    segButtons[g] = b;
  }
  head.append(title, seg);
  const plotBox = document.createElement('div');
  plotBox.className = 'f1-plot';
  const stats = document.createElement('p');
  stats.className = 'f1-stats';
  const cap = document.createElement('p');
  cap.className = 'f1-cap';
  root.append(head, plotBox, stats, cap);
  el.appendChild(root);

  let current = null; // scope
  let token = 0;

  function draw(state) {
    if (!current) return;
    const { meta, series, stats: st } = current;
    const focus = VARS[state.focus] ? state.focus : 'fire_frp';
    const v = VARS[focus];
    for (const g of GROUPS) segButtons[g].setAttribute('aria-pressed', String(v.group === g));
    const unit = theme.unitFor(focus, meta);
    const [y0, y1] = meta.years || [2012, 2025];
    cap.textContent = `Fig. 1 — ${v.label}, ${meta.name}, ${y0}–${y1}. Thick line: Sen slope.`;
    plotBox.innerHTML = '';
    stats.innerHTML = '';
    if (data.isWaterVar(focus) && meta.kind !== 'basin') {
      const p = theme.placeholder(plotBox, '');
      p.textContent = 'Water variables are measured in the case-study basin. ';
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'f1-link';
      a.textContent = 'Open the case study →';
      a.addEventListener('click', (ev) => { ev.preventDefault(); store.set({ view: 'basin' }); });
      p.appendChild(a);
      return;
    }
    const wb = data.isWaterVar(focus) ? meta.primaryWaterBody : undefined;
    const annual = data.annualSeries(series, focus, wb).map((d) => ({ ...d, date: DAY(d.year, 6, 1) }));
    const monthly = data.monthlySeries(series, focus, wb).filter((d) => d.value !== null);
    if (!annual.some((d) => d.value !== null) && !monthly.length) {
      theme.placeholder(plotBox);
      return;
    }
    const trends = (st && st.trends ? st.trends : []).filter((t) => t.variable === focus && (wb ? t.waterBody === wb : !t.waterBody));
    const ta = trends.find((t) => t.basis === 'annual');
    const tm = trends.find((t) => t.basis === 'monthly');
    const sen = ta && ta.sen_slope !== null && ta.sen_intercept !== null
      ? annual.map((d) => ({ date: d.date, value: ta.sen_intercept + ta.sen_slope * (d.year - y0) }))
      : [];
    const width = Math.max(260, plotBox.clientWidth || el.clientWidth - 40 || 420);
    const step = width < 520 ? 2 : 1;
    const ticks = [];
    for (let y = y0; y <= y1; y += step) ticks.push(DAY(y));
    const events = (meta.eventYears || []).map((y) => ({ date: DAY(y, 6, 1), year: y }));
    const isWater = data.isWaterVar(focus);
    const monthlyShown = isWater ? monthly.filter((d) => [5, 6, 7, 8, 9].includes(d.date.getUTCMonth() + 1)) : monthly;
    const marks = [
      Plot.gridY({ stroke: COLORS.rule, strokeOpacity: 0.45 }),
      monthlyShown.length
        ? (isWater
          ? Plot.dot(monthlyShown, { x: 'date', y: 'value', r: 1.5, fill: COLORS.rule })
          : Plot.line(monthlyShown, { x: 'date', y: 'value', stroke: COLORS.rule, strokeWidth: 1 }))
        : null,
      sen.length ? Plot.line(sen, { x: 'date', y: 'value', stroke: v.color, strokeWidth: 5, strokeOpacity: 0.85 }) : null,
      Plot.line(annual, { x: 'date', y: 'value', stroke: COLORS.ink, strokeWidth: 1.5 }),
      Plot.dot(annual.filter((d) => d.value !== null), { x: 'date', y: 'value', r: 2.5, fill: COLORS.ink,
        title: (d) => `${d.year}: ${theme.fmt(d.value, focus)} ${unit}` }),
      Plot.ruleX([DAY(state.year, 6, 1)], { stroke: COLORS.year, strokeWidth: 1.5, strokeDasharray: '4 3' }),
      events.length ? Plot.dot(events, { x: 'date', frameAnchor: 'bottom', dy: -3, symbol: 'triangle', r: 4, fill: COLORS.fire,
        title: (d) => `Major fire year ${d.year}` }) : null,
    ].filter(Boolean);
    const svg = Plot.plot({
      width, height: 248, marginLeft: 64, marginRight: 20, marginTop: 30, marginBottom: 28,
      style: { fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: '11px', color: COLORS.muted, background: 'transparent', overflow: 'visible' },
      x: { domain: [DAY(y0), DAY(y1 + 1)], ticks, tickFormat: '%Y', label: null },
      y: { label: `${v.short} (${unit})`, labelAnchor: 'top', nice: true, zero: !isWater },
      marks,
    });
    plotBox.appendChild(svg);
    const lines = [trendText(ta, unit, theme), trendText(tm, unit, theme)].filter(Boolean);
    if (!lines.length) lines.push('No trend test for this selection');
    stats.innerHTML = lines.map((l, i) => `<span class="${i ? 'f1-muted' : ''}">${l}</span>`).join('<br>');
  }

  async function build(state) {
    const my = ++token;
    const scope = await data.getScope(state);
    if (my !== token) return;
    current = scope && scope.meta ? scope : null;
    if (!current) {
      theme.placeholder(plotBox);
      return;
    }
    draw(state);
  }

  let resizeTimer = null;
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => draw(store.get()), 150);
    }).observe(el);
  }
  store.subscribe((state, prev) => {
    if (state.countryId !== prev.countryId || state.view !== prev.view) build(state);
    else if (state.focus !== prev.focus || state.year !== prev.year) draw(state);
  });
  await build(store.get());
}
