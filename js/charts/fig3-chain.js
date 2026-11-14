// js/charts/fig3-chain.js
// Purpose: Fig. 3 (#fig3) — hand-built SVG chain Fire → Air → Water → Fish with the selected year's values,
//          one Spearman arrow per link from stats.json (solid and coloured when p_adj < 0.05, dashed grey
//          otherwise), a Fire → Fish arc, and one plain-English sentence ("associated with", never "caused").
// Exports: mount(el, ctx)
// Owner: Claude · Task C9

const STYLE = `
.f3-root { padding: 10px 12px 8px; }
.f3-title { font-family: var(--f-serif); font-size: 15px; font-weight: 600; margin: 0 0 4px; }
.f3-svg { display: block; width: 100%; height: auto; font-family: var(--f-sans); }
.f3-node { cursor: pointer; }
.f3-node circle { fill: var(--c-paper); stroke-width: 2.5; }
.f3-node.is-focus circle { stroke-width: 4; }
.f3-node.is-missing circle { stroke-dasharray: 4 3; }
.f3-name { font-size: 13px; font-weight: 600; fill: var(--c-ink); text-anchor: middle; }
.f3-value { font-family: var(--f-mono); font-size: 12px; fill: var(--c-ink); text-anchor: middle; }
.f3-unit { font-size: 10px; fill: var(--c-muted); text-anchor: middle; }
.f3-arrow { fill: none; stroke-width: 2; }
.f3-label { font-family: var(--f-mono); font-size: 10.5px; fill: var(--c-muted); text-anchor: middle; }
.f3-link { font-size: 11px; fill: var(--c-link); text-anchor: middle; cursor: pointer; }
.f3-text { font-size: 13.5px; margin: 6px 0 0; }
.f3-cap { font-size: 13px; font-style: italic; color: var(--c-muted); margin: 4px 0 0; }
`;
const NS = 'http://www.w3.org/2000/svg';
const NODES = ['fire', 'air', 'water', 'fish'];

function injectStyle() {
  if (document.querySelector('style[data-module="f3"]')) return;
  const s = document.createElement('style');
  s.dataset.module = 'f3';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

function svgEl(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}

const linkLabel = (l, theme) => (l.rho === null
  ? 'ρ = — · too few pairs'
  : `ρ = ${l.rho.toFixed(2)} · lag ${l.lag} ${l.lag_unit === 'month' ? 'mo' : 'yr'} · p_adj ${theme.fmtP(l.p_adj).replace('p ', '')}`);

function sentence(meta, links, vars, theme) {
  const strength = (r) => (Math.abs(r) >= 0.5 ? 'strongly' : Math.abs(r) >= 0.3 ? 'moderately' : 'weakly');
  const parts = [];
  for (const l of links) {
    const from = vars[l.from] ? vars[l.from].label.toLowerCase() : l.from;
    const to = vars[l.to] ? vars[l.to].label.toLowerCase() : l.to;
    if (l.rho === null) parts.push(`${from} and ${to} have too few overlapping values to test`);
    else if (l.p_adj !== null && l.p_adj < 0.05) {
      const lag = l.lag ? ` ${l.lag} ${l.lag_unit}${l.lag > 1 ? 's' : ''} later` : l.lag_unit === 'month' ? ' in the same month' : ' in the same year';
      parts.push(`higher ${from} is ${strength(l.rho)} associated with ${l.rho > 0 ? 'higher' : 'lower'} ${to}${lag} (ρ = ${l.rho.toFixed(2)}, ${theme.fmtP(l.p_adj).replace('p', 'adjusted p')})`);
    } else parts.push(`${from} is not clearly associated with ${to} (ρ = ${l.rho.toFixed(2)}, ${theme.fmtP(l.p_adj).replace('p', 'adjusted p')})`);
  }
  const [y0, y1] = meta.years || [2012, 2025];
  return `In ${meta.name}, ${y0}–${y1}: ${parts.join('; ')}. Association is not causation.`;
}

export async function mount(el, ctx) {
  injectStyle();
  const { store, data, theme } = ctx;
  const { COLORS, VARS } = theme;
  const TOKEN = { fire: COLORS.fire, air: COLORS.smoke, water: COLORS.water, fish: COLORS.fish };
  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'f3-root';
  const title = document.createElement('h3');
  title.className = 'f3-title';
  title.textContent = 'Fig. 3 — The chain';
  const svg = svgEl('svg', { class: 'f3-svg', viewBox: '0 0 720 236', role: 'img', 'aria-label': 'Fire to air to water to fish chain with Spearman correlations' });
  const text = document.createElement('p');
  text.className = 'f3-text';
  const cap = document.createElement('p');
  cap.className = 'f3-cap';
  root.append(title, svg, text, cap);
  el.appendChild(root);
  let current = null;
  let token = 0;

  function draw(state) {
    if (!current) return;
    const { meta, series, stats } = current;
    const basin = meta.kind === 'basin';
    const varOf = { fire: 'fire_frp', air: 'aod', water: 'kd490', fish: meta.fishMetric };
    const links = stats && Array.isArray(stats.links) ? stats.links : [];
    const find = (a, b) => links.find((l) => l.from === a && l.to === b) || null;
    const chain = [find('fire_frp', 'aod'), find('aod', 'kd490'), find('kd490', meta.fishMetric)];
    const arc = find('fire_frp', meta.fishMetric);
    svg.innerHTML = '';
    const defs = svgEl('defs');
    for (const g of NODES) {
      const m = svgEl('marker', { id: `f3-arrow-${g}`, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
      m.appendChild(svgEl('path', { d: 'M0 0L10 5L0 10z', fill: TOKEN[g] }));
      defs.appendChild(m);
    }
    const grey = svgEl('marker', { id: 'f3-arrow-grey', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
    grey.appendChild(svgEl('path', { d: 'M0 0L10 5L0 10z', fill: COLORS.rule }));
    defs.appendChild(grey);
    svg.appendChild(defs);
    const cx = [90, 270, 450, 630];
    const cy = 92;
    const R = 34;
    const drawArrow = (d, l, target, labelXY) => {
      const sig = l && l.rho !== null && l.p_adj !== null && l.p_adj < 0.05;
      const p = svgEl('path', { class: 'f3-arrow', d, stroke: sig ? TOKEN[target] : COLORS.rule,
        'stroke-dasharray': sig ? 'none' : '6 4', 'marker-end': `url(#f3-arrow-${sig ? target : 'grey'})` });
      svg.appendChild(p);
      if (l) svg.appendChild(svgEl('text', { class: 'f3-label', x: labelXY[0], y: labelXY[1] }, linkLabel(l, theme)));
    };
    for (let i = 0; i < 3; i += 1) {
      const l = chain[i];
      const missing = !basin && i > 0;
      if (missing) continue;
      drawArrow(`M${cx[i] + R + 4} ${cy} L${cx[i + 1] - R - 6} ${cy}`, l, NODES[i + 1], [(cx[i] + cx[i + 1]) / 2, cy - 10]);
    }
    if (arc) {
      drawArrow(`M${cx[0] + 10} ${cy + R + 4} C ${cx[0] + 60} ${cy + 118}, ${cx[3] - 60} ${cy + 118}, ${cx[3] - 10} ${cy + R + 6}`, arc, 'fish', [360, cy + 108]);
    }
    for (let i = 0; i < 4; i += 1) {
      const g = NODES[i];
      const varId = varOf[g];
      const v = VARS[varId];
      const unavailable = g === 'water' && !basin;
      const node = svgEl('g', { class: `f3-node${state.focus === varId ? ' is-focus' : ''}${unavailable ? ' is-missing' : ''}`, tabindex: '0', role: 'button' });
      node.appendChild(svgEl('circle', { cx: cx[i], cy, r: R, stroke: TOKEN[g] }));
      node.appendChild(svgEl('text', { class: 'f3-name', x: cx[i], y: cy - 4 }, v ? v.short : g));
      if (unavailable) {
        node.appendChild(svgEl('text', { class: 'f3-link', x: cx[i], y: cy + 12 }, 'basin only'));
        const hint = svgEl('text', { class: 'f3-link', x: cx[i], y: cy + 58 }, 'Measured in the case-study basin →');
        hint.addEventListener('click', () => store.set({ view: 'basin' }));
        svg.appendChild(hint);
        node.addEventListener('click', () => store.set({ view: 'basin' }));
      } else {
        const value = data.annualValue(series, varId, state.year, g === 'water' ? meta.primaryWaterBody : undefined);
        node.appendChild(svgEl('text', { class: 'f3-value', x: cx[i], y: cy + 13 }, theme.fmt(value, varId)));
        node.appendChild(svgEl('text', { class: 'f3-unit', x: cx[i], y: cy + 52 }, `${state.year} · ${theme.unitFor(varId, meta)}`));
        node.addEventListener('click', () => store.set({ focus: varId }));
      }
      node.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); node.dispatchEvent(new Event('click')); }
      });
      svg.appendChild(node);
    }
    text.textContent = links.length ? sentence(meta, links, VARS, theme) : 'No link statistics for this selection.';
    cap.textContent = `Fig. 3 — Spearman rank correlation per link, lag with the largest |ρ| shown; solid when Benjamini-Hochberg adjusted p < 0.05.${basin ? '' : ' Water links are tested in the case-study basin.'}`;
  }

  async function build(state) {
    const my = ++token;
    const scope = await data.getScope(state);
    if (my !== token) return;
    current = scope && scope.meta ? scope : null;
    if (!current) {
      theme.placeholder(el);
      return;
    }
    draw(state);
  }
  store.subscribe((state, prev) => {
    if (state.countryId !== prev.countryId || state.view !== prev.view) build(state);
    else if (state.focus !== prev.focus || state.year !== prev.year) draw(state);
  });
  await build(store.get());
}
