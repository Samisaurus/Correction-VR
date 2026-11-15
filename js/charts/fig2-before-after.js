// js/charts/fig2-before-after.js
// Purpose: #fig2 — before / during big fire-year bars & dots for the focused variable.
//          Supports monthly May–Sep series and automatic annual-window fallback so all metrics render cleanly.
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm';

const STYLE = `
.f2-root { padding: 10px 12px 8px; }
.f2-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; }
.f2-title { font-family: var(--f-serif); font-size: 17px; font-weight: 700; letter-spacing: -0.01em; margin: 0; color: var(--c-ink); }
.f2-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.f2-chip {
  padding: 2px 9px; font-family: var(--f-mono); font-size: 12px; font-weight: 500;
  color: var(--c-muted); border: 1px solid var(--c-edge); border-radius: 8px; background: var(--c-paper);
  transition:
    background-color 160ms var(--ease-out),
    border-color 160ms var(--ease-out),
    color 160ms var(--ease-out),
    transform 100ms var(--ease-spring);
}
.f2-chip:hover:not([aria-pressed="true"]) { color: var(--c-ink); background: var(--c-panel); border-color: var(--c-edge-hover); }
.f2-chip:active { transform: scale(0.94); transition-duration: 60ms; }
.f2-chip[aria-pressed="true"] { color: var(--c-ink); border-color: var(--c-year); background: rgba(230, 159, 0, 0.1); font-weight: 700; }
.f2-plot { margin-top: 6px; min-height: 230px; }
.f2-plot svg { display: block; max-width: 100%; animation: vrFadeIn 190ms var(--ease-out); }
.f2-stats { font-family: var(--f-mono); font-size: 12px; margin: 6px 0 0; line-height: 1.55; color: var(--c-ink); }
.f2-stats strong { font-weight: 600; color: var(--c-ink); }
.f2-verdict { font-weight: 700; color: var(--c-ink); }
.f2-verdict.is-surge { color: #B91C1C; }
.f2-cap { font-size: 12.5px; font-style: italic; color: var(--c-muted); margin: 4px 0 0; }
`;
const ORDER = ['fire_frp', 'co2_em', 'pm25_em', 'fire_count', 'viirs_count'];

const span = (years) => (years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : String(years[0]));

export async function mount(el, ctx) {
  const { store, data, theme } = ctx;
  const { COLORS, VARS, injectCss, fmtCompactTick } = theme;
  injectCss('f2', STYLE);
  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'f2-root';
  const head = document.createElement('div');
  head.className = 'f2-head';
  const title = document.createElement('h3');
  title.className = 'f2-title';
  title.textContent = 'Before vs. During Big Fire Years';
  const chips = document.createElement('div');
  chips.className = 'f2-chips';
  chips.setAttribute('aria-label', 'Major fire years');
  head.append(title, chips);
  const plotBox = document.createElement('div');
  plotBox.className = 'f2-plot';
  const stats = document.createElement('p');
  stats.className = 'f2-stats';
  const cap = document.createElement('p');
  cap.className = 'f2-cap';
  root.append(head, plotBox, stats, cap);
  el.appendChild(root);

  let current = null;
  let token = 0;
  let lastRenderKey = null;
  let lastWidth = 0;

  function pickEntries(state) {
    const { stats: st } = current;
    const all = st && Array.isArray(st.beforeAfter) ? st.beforeAfter : [];
    const forVar = (v) => all.filter((e) => e.variable === v);
    let entries = forVar(state.focus);
    for (const v of ORDER) if (!entries.length) entries = forVar(v);
    if (!entries.length && all.length) entries = forVar(all[0].variable);
    return entries.sort((a, b) => a.event - b.event);
  }

  function draw(state, force = false) {
    if (!current) return;
    const { meta, series } = current;
    const width = Math.max(260, plotBox.clientWidth || el.clientWidth - 40 || 420);

    const entries = pickEntries(state);
    if (!entries.length) {
      const key = `${meta.path}|empty`;
      if (!force && key === lastRenderKey) return;
      lastRenderKey = key;
      plotBox.innerHTML = '';
      stats.innerHTML = '';
      chips.innerHTML = '';
      theme.placeholder(plotBox);
      cap.textContent = `Select another fire metric above to compare ${meta.name} fire seasons.`;
      return;
    }

    const upTo = entries.filter((e) => e.event <= state.year);
    const entry = upTo.length ? upTo[upTo.length - 1] : entries[0];
    const renderKey = `${meta.path}|${entry.variable}|${entry.event}|${width}`;
    if (!force && renderKey === lastRenderKey) return;
    lastRenderKey = renderKey;
    lastWidth = width;

    plotBox.innerHTML = '';
    stats.innerHTML = '';
    chips.innerHTML = '';

    for (const e of entries) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'f2-chip';
      b.textContent = String(e.event);
      b.setAttribute('aria-pressed', String(e === entry));
      b.addEventListener('click', () => store.set({ year: e.event }));
      chips.appendChild(b);
    }

    const v = VARS[entry.variable];
    const unit = theme.unitFor(entry.variable);
    const during = entry.after_years.length === 1 && entry.after_years[0] === entry.event;
    const beforeLabel = `Prior (${span(entry.before_years)})`;
    const afterLabel = `${during ? 'Peak' : 'After'} (${span(entry.after_years)})`;
    const dots = [];

    if (entry.basis === 'annual') {
      const annual = data.annualSeries(series, entry.variable);
      const pickAnnual = (years, cx, side) => {
        years.forEach((yr, idx) => {
          const hit = annual.find((d) => d.year === yr && d.value !== null);
          if (!hit) return;
          const jitter = years.length > 1 ? ((idx - (years.length - 1) / 2) * 0.08) : 0;
          dots.push({ x: cx + jitter, value: hit.value, side, label: `${yr}: ${theme.fmt(hit.value, entry.variable)} ${unit}` });
        });
      };
      pickAnnual(entry.before_years, 0.5, 'before');
      pickAnnual(entry.after_years, 1.5, 'after');
    } else {
      const monthly = data.monthlySeries(series, entry.variable);
      const pick = (years, cx, side) => {
        let i = 0;
        for (const d of monthly) {
          const y = d.date.getUTCFullYear();
          const m = d.date.getUTCMonth() + 1;
          if (!years.includes(y) || !entry.months.includes(m) || d.value === null) continue;
          dots.push({ x: cx + (((i * 7) % 11) - 5) / 25, value: d.value, side, label: `${d.month}: ${theme.fmt(d.value, entry.variable)}` });
          i += 1;
        }
      };
      pick(entry.before_years, 0.5, 'before');
      pick(entry.after_years, 1.5, 'after');
    }

    const bars = [
      { x1: 0.2, x2: 0.8, y: entry.mean_before, side: 'before' },
      { x1: 1.2, x2: 1.8, y: entry.mean_after, side: 'after' },
    ];
    const color = (d) => (d.side === 'after' ? v.color : COLORS.muted);
    const svg = Plot.plot({
      width, height: 248, marginLeft: 56, marginRight: 20, marginTop: 30, marginBottom: 28,
      style: { fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: '11px', color: COLORS.muted, background: 'transparent', overflow: 'visible' },
      x: { domain: [0, 2], ticks: [0.5, 1.5], tickFormat: (d) => (d < 1 ? beforeLabel : afterLabel), label: null },
      y: { label: `${v.short} (${unit})`, labelAnchor: 'top', nice: true, zero: true, tickFormat: fmtCompactTick },
      marks: [
        Plot.gridY({ stroke: COLORS.rule, strokeOpacity: 0.5 }),
        Plot.rectY(bars, { x1: 'x1', x2: 'x2', y: 'y', fill: color, fillOpacity: 0.18, stroke: color, strokeWidth: 1.5 }),
        Plot.dot(dots, { x: 'x', y: 'value', r: 3.2, fill: color, fillOpacity: 0.88, title: 'label' }),
        Plot.ruleY([0], { stroke: COLORS.rule }),
      ],
    });
    plotBox.appendChild(svg);

    const pctDiff = entry.mean_before > 0
      ? Math.round(((entry.mean_after - entry.mean_before) / entry.mean_before) * 100)
      : 0;
    const pctStr = `${pctDiff >= 0 ? '+' : '−'}${Math.abs(pctDiff)}%`;
    const sig = entry.p < 0.05;
    let verdict;
    if (sig && pctDiff > 0) {
      verdict = `Strong jump: ${pctStr} higher than prior years (${theme.fmtP(entry.p)})`;
    } else if (sig && pctDiff < 0) {
      verdict = `Clear drop: ${pctStr} below prior years (${theme.fmtP(entry.p)})`;
    } else if (pctDiff >= 20) {
      verdict = `Major spike: ${pctStr} above prior years (wide monthly swings, ${theme.fmtP(entry.p)})`;
    } else if (pctDiff <= -20) {
      verdict = `Noticeably lower: ${pctStr} below prior years (${theme.fmtP(entry.p)})`;
    } else {
      verdict = `Near prior baseline (${pctStr} change, ${theme.fmtP(entry.p)})`;
    }

    const basisLabel = entry.basis === 'annual' ? 'Annual totals' : 'May–Sep monthly';
    stats.innerHTML = `<strong>${basisLabel}:</strong> Prior avg ${theme.fmt(entry.mean_before, entry.variable)} → ${entry.event} avg ${theme.fmt(entry.mean_after, entry.variable)} ${unit} · <strong>t</strong> = ${entry.welch_t.toFixed(2)} · <strong>effect d</strong> = ${entry.cohens_d.toFixed(2)}<br>`
      + `<span class="f2-verdict${pctDiff >= 20 ? ' is-surge' : ''}">${verdict}</span>`;
    cap.innerHTML = `${v.label} before vs. during the <strong>${entry.event}</strong> fire season in ${meta.name}. Dots show ${entry.basis === 'annual' ? 'yearly totals' : 'summer months'}; bars show averages.`;
  }

  async function build(state) {
    const my = ++token;
    theme.spinner(plotBox, 'Loading comparison…');
    const scope = await data.getScope(state);
    if (my !== token) return;
    current = scope && scope.meta ? scope : null;
    lastRenderKey = null;
    if (!current) {
      theme.placeholder(plotBox);
      return;
    }
    draw(state, true);
  }

  let resizeTimer = null;
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      const nextW = Math.max(260, plotBox.clientWidth || el.clientWidth - 40 || 420);
      if (nextW === lastWidth) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => draw(store.get()), 150);
    }).observe(el);
  }
  store.subscribe((state, prev) => {
    if (state.countryId !== prev.countryId) build(state);
    else if (state.focus !== prev.focus || state.year !== prev.year) draw(state);
  });
  await build(store.get());
}
