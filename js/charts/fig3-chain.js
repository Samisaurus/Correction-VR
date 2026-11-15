// js/charts/fig3-chain.js
// Purpose: Fig. 3 (#fig3) — Combustion Plume & Atmospheric Footprint interactive visualization
//          combining CAMS GFAS species spectrum (2003–2026), MODIS 2002 baseline fingerprint,
//          regional/forest emission drivers, the Fire->Air->Water->Fish Spearman chain,
//          and a tailored factual & interpretive Season Dispatch summary per (country, year).

import { getTimestampSummary } from '../summaries.js';

const STYLE = `
.f3-root { padding: 14px 18px 13px; display: flex; flex-direction: column; gap: 10px; }
.f3-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}
.f3-title-wrap { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.f3-title { font-family: var(--f-serif); font-size: 16px; font-weight: 700; margin: 0; color: var(--c-ink); }
.f3-sub { font-family: var(--f-mono); font-size: 11px; color: var(--c-muted); font-variant-numeric: tabular-nums; }
.f3-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px;
  background: var(--c-panel);
  border: 1px solid var(--c-edge);
  border-radius: 6px;
}
.f3-tab {
  font-family: var(--f-sans);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--c-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 4px 9px;
  line-height: 1.25;
}
.f3-tab:hover:not([aria-selected="true"]) { color: var(--c-ink); background: rgba(255, 255, 255, 0.7); }
.f3-tab[aria-selected="true"] {
  color: var(--c-ink);
  background: var(--c-paper);
  border-color: var(--c-edge-hover);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}

.f3-stage { min-height: 224px; animation: emberFadeIn 190ms var(--ease-out); }
.f3-svg { display: block; width: 100%; height: auto; font-family: var(--f-sans); }

/* Plume Spectrum interactive SVG */
.f3-sp-row { cursor: pointer; }
.f3-sp-row rect.f3-sp-hit { fill: transparent; transition: fill 130ms var(--ease-out); }
.f3-sp-row:hover rect.f3-sp-hit { fill: rgba(246, 248, 250, 0.9); }
.f3-sp-row.is-sel rect.f3-sp-hit { fill: #F1F5F9; stroke: #CBD5E1; stroke-width: 1; }
.f3-sp-flow { fill: none; transition: stroke-opacity 150ms var(--ease-out), stroke-width 150ms var(--ease-out); }
.f3-sp-lbl { font-family: var(--f-sans); font-size: 11.5px; font-weight: 600; fill: var(--c-ink); }
.f3-sp-val { font-family: var(--f-mono); font-size: 10.5px; font-weight: 600; fill: var(--c-muted); font-variant-numeric: tabular-nums; }
.f3-sp-pct { font-family: var(--f-mono); font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums; }
.f3-sp-hdr { font-family: var(--f-mono); font-size: 9.5px; font-weight: 600; fill: var(--c-muted); letter-spacing: 0.04em; text-transform: uppercase; }
.f3-sp-hub-t { font-family: var(--f-serif); font-size: 13px; font-weight: 700; fill: var(--c-ink); text-anchor: middle; }
.f3-sp-hub-s { font-family: var(--f-mono); font-size: 10px; font-weight: 600; fill: var(--c-muted); text-anchor: middle; }

.f3-inspector {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px 14px;
  margin-top: 6px;
  padding: 7px 11px;
  background: var(--c-panel);
  border: 1px solid var(--c-edge);
  border-radius: 5px;
  font-size: 12px;
  color: var(--c-ink);
}
.f3-insp-left { font-weight: 600; }
.f3-insp-metrics {
  font-family: var(--f-mono);
  font-variant-numeric: tabular-nums;
  font-size: 11.5px;
  color: var(--c-muted);
}
.f3-insp-metrics strong { color: var(--c-ink); }

/* Regional & Forest drivers view */
.f3-reg-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.f3-reg-col {
  border: 1px solid var(--c-edge);
  border-radius: 5px;
  background: var(--c-paper);
  padding: 10px 12px;
  min-width: 0;
}
.f3-reg-col-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  padding-bottom: 6px;
  margin-bottom: 7px;
  border-bottom: 1px solid var(--c-edge);
}
.f3-reg-col-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--c-ink);
}
.f3-reg-col-unit {
  font-family: var(--f-mono);
  font-size: 10px;
  color: var(--c-muted);
}
.f3-reg-items { display: flex; flex-direction: column; gap: 6px; }
.f3-reg-item { display: flex; flex-direction: column; gap: 2px; }
.f3-reg-line {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 11.5px;
}
.f3-reg-name {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 600;
  color: var(--c-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.f3-reg-sub { font-weight: 400; color: var(--c-muted); font-size: 10.5px; }
.f3-reg-num {
  flex: 0 0 auto;
  font-family: var(--f-mono);
  font-variant-numeric: tabular-nums;
  font-size: 10.5px;
  color: var(--c-muted);
  white-space: nowrap;
}
.f3-reg-track { height: 4px; border-radius: 2px; background: #E2E8F0; overflow: hidden; }
.f3-reg-fill { height: 100%; border-radius: 2px; }

/* Spearman chain view */
.f3-node { cursor: pointer; transform-box: fill-box; transform-origin: center; transition: transform 170ms var(--ease-spring), opacity 160ms var(--ease-out); }
.f3-node:hover { transform: scale(1.045); }
.f3-node:active { transform: scale(0.95); transition-duration: 60ms; }
.f3-node circle { fill: var(--c-paper); stroke-width: 2.5; transition: stroke-width 160ms var(--ease-out), fill 160ms var(--ease-out); }
.f3-node.is-focus circle { stroke-width: 4; fill: var(--c-panel); }
.f3-node.is-missing circle { stroke-dasharray: 4 3; }
.f3-name { font-size: 13px; font-weight: 700; fill: var(--c-ink); text-anchor: middle; }
.f3-value { font-family: var(--f-mono); font-size: 12.5px; font-weight: 600; fill: var(--c-ink); text-anchor: middle; }
.f3-unit { font-size: 10px; fill: var(--c-muted); text-anchor: middle; }
.f3-arrow { fill: none; stroke-width: 2; }
.f3-label { font-family: var(--f-mono); font-size: 10.5px; fill: var(--c-muted); text-anchor: middle; }
.f3-link { font-size: 11px; font-weight: 600; fill: var(--c-link); text-anchor: middle; cursor: pointer; }
.f3-chain-note { font-size: 12.5px; line-height: 1.5; margin: 6px 0 0; color: var(--c-muted); }

/* Tailored timestamp summary dispatch */
.f3-dispatch {
  padding-top: 10px;
  border-top: 1px solid var(--c-edge);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.f3-dispatch-kicker {
  font-family: var(--f-mono);
  font-variant-numeric: tabular-nums;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--c-muted);
}
.f3-dispatch-body {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.56;
  color: var(--c-ink);
}
.f3-dispatch-basin {
  margin: 2px 0 0;
  font-size: 12.5px;
  line-height: 1.48;
  color: var(--c-muted);
}
.f3-dispatch-basin strong { color: var(--c-ink); font-weight: 600; }
.f3-cap { font-size: 12px; font-style: italic; color: var(--c-muted); margin: 0; }

@media (max-width: 759px) {
  .f3-reg-grid { grid-template-columns: 1fr; gap: 10px; }
}
`;

const NS = 'http://www.w3.org/2000/svg';
const CHAIN_NODES = ['fire', 'air', 'water', 'fish'];

const SPECIES_META = [
  { id: 'co2',  label: 'CO₂',   full: 'Carbon dioxide',     group: 'Climate',  color: '#D55E00', role: 'Primary greenhouse gas released by biomass combustion' },
  { id: 'ch4',  label: 'CH₄',   full: 'Methane',            group: 'Climate',  color: '#E69F00', role: 'Potent short-lived greenhouse gas from smoldering fuels' },
  { id: 'pm25', label: 'PM₂.₅', full: 'Fine Particulates',  group: 'Smoke',    color: '#7B3294', role: 'Breathable smoke aerosols driving acute regional haze' },
  { id: 'co',   label: 'CO',    full: 'Carbon monoxide',    group: 'Smoke',    color: '#8A7F72', role: 'Incomplete combustion tracer elevated in deep duff burns' },
  { id: 'oc',   label: 'OC',    full: 'Organic carbon',     group: 'Smoke',    color: '#A16207', role: 'Primary organic aerosol mass carrying semi-volatile organics' },
  { id: 'bc',   label: 'BC',    full: 'Black carbon soot',  group: 'Reactive', color: '#334155', role: 'Light-absorbing soot accelerating snow/ice melt downwind' },
  { id: 'nox',  label: 'NOx',   full: 'Nitrogen oxides',    group: 'Reactive', color: '#2B5FC7', role: 'Ozone & secondary nitrate precursor from hot crown flames' },
  { id: 'so2',  label: 'SO₂',   full: 'Sulfur dioxide',     group: 'Reactive', color: '#0072B2', role: 'Sulfur emissions contributing to acidifying aerosol deposition' },
];

const SPECIES_MAP = new Map(SPECIES_META.map((s) => [s.id, s]));

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

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtMass(tonnes) {
  const v = Number(tonnes);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} Mt`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)} kt`;
  return `${v.toFixed(0)} t`;
}

function fmtCompact(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toLocaleString('en-US');
}

const linkLabel = (l, theme) => (l.rho === null
  ? ['ρ = —', 'too few pairs']
  : [`ρ = ${l.rho.toFixed(2)}`, `lag ${l.lag} ${l.lag_unit === 'month' ? 'mo' : 'yr'} · ${theme.fmtP(l.p_adj)}`]);

export async function mount(el, ctx) {
  injectStyle();
  const { store, data, theme } = ctx;
  const { COLORS, VARS } = theme;
  const TOKEN = { fire: COLORS.fire, air: COLORS.smoke, water: COLORS.water, fish: COLORS.fish };

  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'f3-root';

  const head = document.createElement('div');
  head.className = 'f3-head';
  const titleWrap = document.createElement('div');
  titleWrap.className = 'f3-title-wrap';
  const titleEl = document.createElement('h3');
  titleEl.className = 'f3-title';
  titleEl.textContent = 'Fig. 3 — Combustion Plume & Atmospheric Footprint';
  const subEl = document.createElement('span');
  subEl.className = 'f3-sub';
  titleWrap.append(titleEl, subEl);

  const tabsEl = document.createElement('div');
  tabsEl.className = 'f3-tabs';
  tabsEl.setAttribute('role', 'tablist');
  tabsEl.setAttribute('aria-label', 'Fig. 3 analytical views');

  const VIEWS = [
    { id: 'plume', label: 'Plume & Pollutants' },
    { id: 'regions', label: 'Regional Drivers' },
    { id: 'chain', label: 'Chain & Basin' },
  ];
  let activeTab = 'plume';
  let selectedSpecies = 'pm25';
  const tabBtns = new Map();

  for (const v of VIEWS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'f3-tab';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(v.id === activeTab));
    btn.textContent = v.label;
    btn.addEventListener('click', () => {
      if (activeTab === v.id) return;
      activeTab = v.id;
      for (const [id, b] of tabBtns) b.setAttribute('aria-selected', String(id === activeTab));
      renderActive(store.get());
    });
    tabsEl.appendChild(btn);
    tabBtns.set(v.id, btn);
  }

  head.append(titleWrap, tabsEl);

  const stage = document.createElement('div');
  stage.className = 'f3-stage';

  const dispatch = document.createElement('div');
  dispatch.className = 'f3-dispatch';
  const dispatchKicker = document.createElement('div');
  dispatchKicker.className = 'f3-dispatch-kicker';
  const dispatchBody = document.createElement('p');
  dispatchBody.className = 'f3-dispatch-body';
  const dispatchBasin = document.createElement('p');
  dispatchBasin.className = 'f3-dispatch-basin';
  dispatch.append(dispatchKicker, dispatchBody, dispatchBasin);

  const cap = document.createElement('p');
  cap.className = 'f3-cap';

  root.append(head, stage, dispatch, cap);
  el.appendChild(root);

  let current = null;
  let token = 0;

  function renderPlumeView(scope, state) {
    const yr = Number(state.year);
    const { meta, summary, emissions } = scope;
    const emYr = emissions && emissions.years ? emissions.years[yr] : null;
    const ranks = emissions && emissions.ranksByYear ? emissions.ranksByYear[yr] : null;
    const meds = emissions ? emissions.medians : null;
    const yrRow = summary && summary.byYear ? summary.byYear.get(yr) : null;

    stage.innerHTML = '';

    if (emYr && meds) {
      const yearCount = emissions.yearCount || 24;
      const co2Rank = ranks && ranks.co2 ? `#${ranks.co2}/${yearCount}` : '—';
      const co2Med = meds.co2 || 1;
      const co2Pct = Math.round(((emYr.co2 - co2Med) / co2Med) * 100);
      subEl.textContent = `${yr}${yr === 2026 ? ' YTD (through Aug 31)' : ''} · CAMS GFAS · Total ${fmtMass(emYr.co2)} CO₂ (${co2Pct >= 0 ? '+' : ''}${co2Pct}% vs median · ${co2Rank})`;

      const svg = svgEl('svg', {
        class: 'f3-svg',
        viewBox: '0 0 740 242',
        role: 'img',
        'aria-label': `Forest fire emission spectrum for ${meta.name} in ${yr}`,
      });

      svg.appendChild(svgEl('text', { class: 'f3-sp-hdr', x: '20', y: '14' }, 'Combustion Hub'));
      svg.appendChild(svgEl('text', { class: 'f3-sp-hdr', x: '240', y: '14' }, 'Pollutant Mass'));
      svg.appendChild(svgEl('text', { class: 'f3-sp-hdr', x: '454', y: '14' }, 'Deviation vs. 2003–2026 Median (%)'));
      svg.appendChild(svgEl('text', { class: 'f3-sp-hdr', x: '724', y: '14', 'text-anchor': 'end' }, 'Rank'));

      // Combustion source card on left
      const hubX = 82;
      const hubY = 126;
      const detCount = yrRow ? (yrRow.modisTotal || yrRow.viirsTotal || yrRow.detections) : null;
      const detSensor = yrRow && !(yrRow.modisTotal > 0) && (yrRow.viirsTotal > 0 || yrRow.sensor === 'VIIRS') ? 'VIIRS' : 'MODIS';
      const frpVal = yrRow ? yrRow.totalFrpMw : null;
      const hubLine2 = detCount ? `${fmtCompact(detCount)} ${detSensor}` : `CO₂ ${fmtMass(emYr.co2)}`;
      const hubLine3 = frpVal ? `${fmtCompact(frpVal)} MW FRP` : `PM₂.₅ ${fmtMass(emYr.pm25)}`;

      svg.appendChild(svgEl('rect', {
        x: '14', y: '86', width: '136', height: '80', rx: '6',
        fill: '#F8FAFC', stroke: '#CBD5E1', 'stroke-width': '1.25',
      }));
      svg.appendChild(svgEl('text', { class: 'f3-sp-hub-t', x: hubX, y: hubY - 14 }, `${yr} Burn`));
      svg.appendChild(svgEl('text', { class: 'f3-sp-hub-s', x: hubX, y: hubY + 4 }, hubLine2));
      svg.appendChild(svgEl('text', { class: 'f3-sp-hub-s', x: hubX, y: hubY + 20 }, hubLine3));

      // Zero line & bounds for diverging bar panel
      const zeroX = 528;
      const negSpan = 72;   // down to -100%
      const posSpan = 136;  // up to +250% (clipped nicely at 250)
      svg.appendChild(svgEl('line', { x1: zeroX, y1: '24', x2: zeroX, y2: '226', stroke: '#94A3B8', 'stroke-width': '1', 'stroke-dasharray': '3 3' }));
      svg.appendChild(svgEl('text', { class: 'f3-sp-hdr', x: zeroX, y: '238', 'text-anchor': 'middle' }, 'Median (0%)'));
      svg.appendChild(svgEl('text', { class: 'f3-sp-hdr', x: zeroX - negSpan, y: '238', 'text-anchor': 'middle' }, '-100%'));
      svg.appendChild(svgEl('text', { class: 'f3-sp-hdr', x: zeroX + posSpan, y: '238', 'text-anchor': 'end' }, '+250%+'));

      const startY = 30;
      const rowH = 24.5;
      const inspector = document.createElement('div');
      inspector.className = 'f3-inspector';

      const rowNodes = new Map();

      function updateInspector(spId) {
        const sp = SPECIES_MAP.get(spId) || SPECIES_META[2];
        const val = emYr[sp.id] || 0;
        const med = meds[sp.id] || 0;
        const rk = ranks && ranks[sp.id] ? `#${ranks[sp.id]}/${yearCount}` : '—';
        const dPct = med > 0 ? Math.round(((val - med) / med) * 100) : 0;
        for (const [id, refs] of rowNodes) {
          const isSel = id === sp.id;
          refs.g.classList.toggle('is-sel', isSel);
          refs.flow.setAttribute('stroke-opacity', isSel ? '0.92' : '0.26');
          refs.flow.setAttribute('stroke-width', isSel ? refs.selW : refs.baseW);
        }
        inspector.innerHTML = `
          <span class="f3-insp-left">${escHtml(sp.full)} (${sp.label}) · ${escHtml(sp.role)}</span>
          <span class="f3-insp-metrics"><strong>${fmtMass(val)}</strong> (${yr}) · Median <strong>${fmtMass(med)}</strong> · <strong>${dPct >= 0 ? '+' : ''}${dPct}%</strong> · Rank <strong>${rk}</strong></span>
        `;
      }

      SPECIES_META.forEach((sp, i) => {
        const cy = startY + i * rowH + 10;
        const val = emYr[sp.id] || 0;
        const med = meds[sp.id] || 0;
        const pct = med > 0 ? ((val - med) / med) * 100 : 0;
        const pctRound = Math.round(pct);
        const rk = ranks && ranks[sp.id] ? ranks[sp.id] : null;
        const ratio = med > 0 ? val / med : 1;
        const baseW = Math.max(1.4, Math.min(6.2, 1.4 + ratio * 1.4)).toFixed(2);
        const selW = (Number(baseW) + 2.0).toFixed(2);

        // Flow curve from combustion hub -> species node
        const flow = svgEl('path', {
          class: 'f3-sp-flow',
          d: `M 150 ${hubY} C 188 ${hubY}, 194 ${cy}, 228 ${cy}`,
          stroke: sp.color,
          'stroke-width': baseW,
          'stroke-opacity': '0.32',
        });
        svg.appendChild(flow);

        const g = svgEl('g', { class: 'f3-sp-row', tabindex: '0', role: 'button', 'aria-label': `${sp.full}: ${fmtMass(val)}` });
        g.appendChild(svgEl('rect', { class: 'f3-sp-hit', x: '226', y: String(cy - 10.5), width: '502', height: '21', rx: '4' }));
        g.appendChild(svgEl('circle', { cx: '234', cy: String(cy), r: '4', fill: sp.color }));
        g.appendChild(svgEl('text', { class: 'f3-sp-lbl', x: '244', y: String(cy + 4) }, sp.label));
        g.appendChild(svgEl('text', { class: 'f3-sp-val', x: '374', y: String(cy + 4), 'text-anchor': 'end' }, fmtMass(val)));

        // Diverging bar vs median
        if (pct >= 0) {
          const bw = Math.max(3, Math.min(posSpan, (Math.min(pct, 250) / 250) * posSpan));
          g.appendChild(svgEl('rect', {
            x: String(zeroX), y: String(cy - 5.5), width: bw.toFixed(1), height: '11', rx: '2',
            fill: sp.color, 'fill-opacity': '0.86',
          }));
          g.appendChild(svgEl('text', {
            class: 'f3-sp-pct',
            x: (zeroX + bw + 5).toFixed(1),
            y: String(cy + 3.5),
            fill: pct >= 50 ? '#991B1B' : '#1E293B',
          }, `+${pctRound}%`));
        } else {
          const bw = Math.max(3, Math.min(negSpan, (Math.min(Math.abs(pct), 100) / 100) * negSpan));
          g.appendChild(svgEl('rect', {
            x: (zeroX - bw).toFixed(1), y: String(cy - 5.5), width: bw.toFixed(1), height: '11', rx: '2',
            fill: '#64748B', 'fill-opacity': '0.55',
          }));
          g.appendChild(svgEl('text', {
            class: 'f3-sp-pct',
            x: (zeroX - bw - 5).toFixed(1),
            y: String(cy + 3.5),
            'text-anchor': 'end',
            fill: '#475569',
          }, `${pctRound}%`));
        }

        // Rank column
        g.appendChild(svgEl('text', {
          class: 'f3-sp-val',
          x: '724',
          y: String(cy + 4),
          'text-anchor': 'end',
          fill: rk && rk <= 3 ? '#B91C1C' : '#54595D',
        }, rk ? `#${rk}` : '—'));

        const selectThis = () => {
          selectedSpecies = sp.id;
          updateInspector(sp.id);
        };
        g.addEventListener('click', selectThis);
        g.addEventListener('mouseenter', selectThis);
        g.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectThis(); }
        });

        svg.appendChild(g);
        rowNodes.set(sp.id, { g, flow, baseW, selW });
      });

      stage.append(svg, inspector);
      updateInspector(selectedSpecies);
      return;
    }

    // 2002 Pre-GFAS MODIS & Historical Footprint
    const modisDet = yrRow ? (yrRow.modisTotal || yrRow.detections) : null;
    const medDet = summary ? summary.medianTotal : null;
    const detPct = modisDet && medDet ? Math.round(((modisDet - medDet) / medDet) * 100) : null;
    subEl.textContent = `${yr} · Pre-GFAS MODIS Sensor Fingerprint (Copernicus CAMS GFAS starts 2003)`;

    const svg = svgEl('svg', {
      class: 'f3-svg',
      viewBox: '0 0 740 198',
      role: 'img',
      'aria-label': `Pre-GFAS ${yr} MODIS fire fingerprint for ${meta.name}`,
    });

    svg.appendChild(svgEl('rect', {
      x: '14', y: '34', width: '164', height: '126', rx: '6',
      fill: '#F8FAFC', stroke: '#CBD5E1', 'stroke-width': '1.25',
    }));
    svg.appendChild(svgEl('text', { class: 'f3-sp-hub-t', x: '96', y: '82' }, `${yr} Baseline`));
    svg.appendChild(svgEl('text', { class: 'f3-sp-hub-s', x: '96', y: '104' }, modisDet ? `${fmtCompact(modisDet)} MODIS det.` : 'Awaiting MODIS rows'));
    svg.appendChild(svgEl('text', { class: 'f3-sp-hub-s', x: '96', y: '122' }, yrRow && yrRow.totalFrpMw ? `${fmtCompact(yrRow.totalFrpMw)} MW FRP` : 'Historical pre-2003'));
    if (detPct !== null) {
      svg.appendChild(svgEl('text', { class: 'f3-sp-hub-s', x: '96', y: '140' }, `${detPct >= 0 ? '+' : ''}${detPct}% vs MODIS med`));
    }

    const total = modisDet || 0;
    const metrics = [
      {
        label: 'High-Intensity Burns (>50 MW)',
        aLabel: 'High FRP',
        bLabel: 'Low/Mod FRP',
        aVal: yrRow ? yrRow.highFrpCount : 0,
        bVal: Math.max(0, total - (yrRow ? yrRow.highFrpCount : 0)),
        colorA: '#DC2626',
        colorB: '#F59E0B',
      },
      {
        label: 'Land Ownership Footprint',
        aLabel: 'National Forest',
        bLabel: 'State / Private / Other',
        aVal: yrRow ? yrRow.inNationalForestCount : 0,
        bVal: yrRow ? yrRow.otherForestCount : 0,
        colorA: '#2B5FC7',
        colorB: '#94A3B8',
      },
      {
        label: 'Diurnal Ignition Cycle',
        aLabel: 'Daytime Overpass',
        bLabel: 'Nighttime Overpass',
        aVal: yrRow ? yrRow.dayCount : 0,
        bVal: yrRow ? yrRow.nightCount : 0,
        colorA: '#D55E00',
        colorB: '#475569',
      },
      {
        label: 'MODIS Constellation Split',
        aLabel: 'Aqua Satellite',
        bLabel: 'Terra Satellite',
        aVal: yrRow ? yrRow.aquaCount : 0,
        bVal: yrRow ? yrRow.terraCount : 0,
        colorA: '#009E73',
        colorB: '#56B4E9',
      },
    ];

    metrics.forEach((m, i) => {
      const y = 32 + i * 38;
      svg.appendChild(svgEl('path', {
        class: 'f3-sp-flow',
        d: `M 178 97 C 210 97, 212 ${y + 12}, 244 ${y + 12}`,
        stroke: m.colorA,
        'stroke-width': '2',
        'stroke-opacity': '0.42',
      }));
      const sum = (m.aVal || 0) + (m.bVal || 0);
      const aPct = sum > 0 ? Math.round((m.aVal / sum) * 100) : 0;
      const barW = 468;
      svg.appendChild(svgEl('text', { class: 'f3-sp-lbl', x: '250', y: String(y + 8) }, m.label));
      const detail = sum > 0
        ? `${m.aLabel} ${aPct}% (${fmtCompact(m.aVal)})  ·  ${m.bLabel} ${100 - aPct}% (${fmtCompact(m.bVal)})`
        : 'Row-level MODIS CSV not yet populated for this region';
      svg.appendChild(svgEl('text', { class: 'f3-sp-val', x: '718', y: String(y + 8), 'text-anchor': 'end' }, detail));
      svg.appendChild(svgEl('rect', { x: '250', y: String(y + 15), width: String(barW), height: '8', rx: '3', fill: '#E2E8F0' }));
      if (sum > 0) {
        const wa = Math.max(2, (aPct / 100) * barW);
        svg.appendChild(svgEl('rect', { x: '250', y: String(y + 15), width: wa.toFixed(1), height: '8', rx: '3', fill: m.colorA }));
      }
    });

    stage.appendChild(svg);
  }

  function fmtShortMass(tonnes) {
    const v = Number(tonnes);
    if (!Number.isFinite(v)) return '—';
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} Mt`;
    if (v >= 1_000) return `${Math.round(v / 1_000)} kt`;
    return `${Math.round(v)} t`;
  }

  function renderRegionsView(scope, state) {
    const yr = Number(state.year);
    const { meta, summary, emissions } = scope;
    const emYr = emissions && emissions.years ? emissions.years[yr] : null;
    const yrRow = summary && summary.byYear ? summary.byYear.get(yr) : null;
    const fyList = summary && summary.forestYearsByYear ? summary.forestYearsByYear[yr] : null;

    subEl.textContent = `${yr} · Spatial breakdown of leading ${meta.shortName} emission & fire corridors`;
    stage.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'f3-reg-grid';

    // Left: Regions / States / Provinces / Oblasts
    const regCol = document.createElement('div');
    regCol.className = 'f3-reg-col';
    if (emYr && Array.isArray(emYr.topRegions) && emYr.topRegions.length) {
      const rows = emYr.topRegions.slice(0, 7);
      const maxCo2 = rows[0].co2 || 1;
      const totCo2 = emYr.co2 || rows.reduce((s, r) => s + r.co2, 0) || 1;
      regCol.innerHTML = `
        <div class="f3-reg-col-head">
          <span class="f3-reg-col-title">Top Regions (${yr})</span>
          <span class="f3-reg-col-unit">CO₂ · PM₂.₅ · %</span>
        </div>
        <div class="f3-reg-items">
          ${rows.map((r) => {
            const w = Math.max(3, Math.round((r.co2 / maxCo2) * 100));
            const share = Math.round((r.co2 / totCo2) * 100);
            return `<div class="f3-reg-item">
              <div class="f3-reg-line">
                <span class="f3-reg-name" title="${escHtml(r.name)}">${escHtml(r.name)}</span>
                <span class="f3-reg-num">${fmtShortMass(r.co2)} · ${fmtShortMass(r.pm25)} (${share}%)</span>
              </div>
              <div class="f3-reg-track"><div class="f3-reg-fill" style="width:${w}%;background:#D55E00"></div></div>
            </div>`;
          }).join('')}
        </div>
      `;
    } else if (yrRow && Array.isArray(yrRow.topStates) && yrRow.topStates.length) {
      const rows = yrRow.topStates.slice(0, 7);
      const maxC = rows[0].count || 1;
      const regSensor = yrRow && !(yrRow.modisTotal > 0) && (yrRow.viirsTotal > 0 || yrRow.sensor === 'VIIRS') ? 'VIIRS' : 'MODIS';
      regCol.innerHTML = `
        <div class="f3-reg-col-head">
          <span class="f3-reg-col-title">Top Regions (${yr})</span>
          <span class="f3-reg-col-unit">${regSensor} det · FRP</span>
        </div>
        <div class="f3-reg-items">
          ${rows.map((r) => {
            const w = Math.max(3, Math.round((r.count / maxC) * 100));
            return `<div class="f3-reg-item">
              <div class="f3-reg-line">
                <span class="f3-reg-name" title="${escHtml(r.name)}">${escHtml(r.name)}</span>
                <span class="f3-reg-num">${fmtCompact(r.count)} · ${fmtCompact(r.frpMw)} MW</span>
              </div>
              <div class="f3-reg-track"><div class="f3-reg-fill" style="width:${w}%;background:#D55E00"></div></div>
            </div>`;
          }).join('')}
        </div>
      `;
    } else {
      regCol.innerHTML = `
        <div class="f3-reg-col-head">
          <span class="f3-reg-col-title">Top Regions (${yr})</span>
          <span class="f3-reg-col-unit">CAMS starts 2003</span>
        </div>
        <p class="f3-chain-note">Pixel-level CAMS GFAS regional emissions tracking begins in 2003. Scrub the timeline to 2003–2026 to compare regional emission rankings.</p>
      `;
    }

    // Right: Named Forests
    const forCol = document.createElement('div');
    forCol.className = 'f3-reg-col';
    if (emYr && Array.isArray(emYr.topForests) && emYr.topForests.length) {
      const rows = emYr.topForests.slice(0, 7);
      const maxCo2 = rows[0].co2 || 1;
      forCol.innerHTML = `
        <div class="f3-reg-col-head">
          <span class="f3-reg-col-title">Top Forest Units (${yr})</span>
          <span class="f3-reg-col-unit">CO₂ · PM₂.₅</span>
        </div>
        <div class="f3-reg-items">
          ${rows.map((f) => {
            const w = Math.max(3, Math.round((f.co2 / maxCo2) * 100));
            return `<div class="f3-reg-item">
              <div class="f3-reg-line">
                <span class="f3-reg-name" title="${escHtml(f.name)}">${escHtml(f.name)}${f.region ? ` <span class="f3-reg-sub">· ${escHtml(f.region)}</span>` : ''}</span>
                <span class="f3-reg-num">${fmtShortMass(f.co2)} · ${fmtShortMass(f.pm25)}</span>
              </div>
              <div class="f3-reg-track"><div class="f3-reg-fill" style="width:${w}%;background:#7B3294"></div></div>
            </div>`;
          }).join('')}
        </div>
      `;
    } else if (Array.isArray(fyList) && fyList.length) {
      const rows = fyList.slice(0, 7);
      const maxTot = (rows[0][1] + rows[0][2]) || 1;
      forCol.innerHTML = `
        <div class="f3-reg-col-head">
          <span class="f3-reg-col-title">Top Forest Units (${yr})</span>
          <span class="f3-reg-col-unit">MODIS + VIIRS</span>
        </div>
        <div class="f3-reg-items">
          ${rows.map((f) => {
            const tot = f[1] + f[2];
            const w = Math.max(3, Math.round((tot / maxTot) * 100));
            return `<div class="f3-reg-item">
              <div class="f3-reg-line">
                <span class="f3-reg-name" title="${escHtml(f[0])}">${escHtml(f[0])}</span>
                <span class="f3-reg-num">${fmtCompact(tot)} det</span>
              </div>
              <div class="f3-reg-track"><div class="f3-reg-fill" style="width:${w}%;background:#7B3294"></div></div>
            </div>`;
          }).join('')}
        </div>
      `;
    } else {
      forCol.innerHTML = `
        <div class="f3-reg-col-head">
          <span class="f3-reg-col-title">Top Forest Units (${yr})</span>
          <span class="f3-reg-col-unit">2003–2026</span>
        </div>
        <p class="f3-chain-note">Forest-level carbon and smoke breakdowns are available across 2003–2026 from CAMS GFAS.</p>
      `;
    }

    grid.append(regCol, forCol);
    stage.appendChild(grid);
  }

  function renderChainView(scope, state) {
    const { meta, stats, series } = scope;
    const basin = meta.kind === 'basin';
    const yr = Number(state.year);
    subEl.textContent = `${yr} · Spearman rank correlations across Fire → Air → Water → Salmon`;
    stage.innerHTML = '';

    const svg = svgEl('svg', {
      class: 'f3-svg',
      viewBox: '0 0 720 228',
      role: 'img',
      'aria-label': 'Fire to air to water to fish chain with Spearman correlations',
    });

    const defs = svgEl('defs');
    for (const g of CHAIN_NODES) {
      const m = svgEl('marker', { id: `f3-arrow-${g}`, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
      m.appendChild(svgEl('path', { d: 'M0 0L10 5L0 10z', fill: TOKEN[g] }));
      defs.appendChild(m);
    }
    const grey = svgEl('marker', { id: 'f3-arrow-grey', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
    grey.appendChild(svgEl('path', { d: 'M0 0L10 5L0 10z', fill: COLORS.rule }));
    defs.appendChild(grey);
    svg.appendChild(defs);

    const varOf = { fire: 'fire_frp', air: 'aod', water: 'kd490', fish: meta.fishMetric };
    const links = stats && Array.isArray(stats.links) ? stats.links : [];
    const find = (a, b) => links.find((l) => l.from === a && l.to === b) || null;
    const chain = [find('fire_frp', 'aod'), find('aod', 'kd490'), find('kd490', meta.fishMetric)];
    const arc = find('fire_frp', meta.fishMetric);

    const cx = [90, 270, 450, 630];
    const cy = 84;
    const R = 38;

    const drawArrow = (d, l, target, labelXY) => {
      const sig = l && l.rho !== null && l.p_adj !== null && l.p_adj < 0.05;
      svg.appendChild(svgEl('path', {
        class: 'f3-arrow',
        d,
        stroke: sig ? TOKEN[target] : COLORS.rule,
        'stroke-dasharray': sig ? 'none' : '6 4',
        'marker-end': `url(#f3-arrow-${sig ? target : 'grey'})`,
      }));
      if (l) {
        const [l1, l2] = linkLabel(l, theme);
        svg.appendChild(svgEl('text', { class: 'f3-label', x: labelXY[0], y: labelXY[1] }, l1));
        svg.appendChild(svgEl('text', { class: 'f3-label', x: labelXY[0], y: labelXY[1] + 13 }, l2));
      }
    };

    for (let i = 0; i < 3; i += 1) {
      if (!basin && i > 0) continue;
      drawArrow(`M${cx[i] + R + 4} ${cy} L${cx[i + 1] - R - 6} ${cy}`, chain[i], CHAIN_NODES[i + 1], [(cx[i] + cx[i + 1]) / 2, cy - R - 22]);
    }
    if (arc) {
      const ay = cy + R + 28;
      drawArrow(`M${cx[0]} ${ay} C ${cx[0] + 60} ${ay + 62}, ${cx[3] - 60} ${ay + 62}, ${cx[3]} ${ay + 2}`, arc, 'fish', [360, ay + 56]);
    }

    const focusGroup = VARS[state.focus] ? VARS[state.focus].group : null;
    for (let i = 0; i < 4; i += 1) {
      const g = CHAIN_NODES[i];
      const varId = varOf[g];
      const v = VARS[varId];
      const unavailable = g === 'water' && !basin;
      const isFocus = state.focus === varId || (focusGroup && focusGroup === g);
      const node = svgEl('g', { class: `f3-node${unavailable ? ' is-missing' : ''}${isFocus ? ' is-focus' : ''}`, tabindex: '0', role: 'button' });
      node.appendChild(svgEl('circle', { cx: cx[i], cy, r: R, stroke: TOKEN[g] }));
      node.appendChild(svgEl('text', { class: 'f3-name', x: cx[i], y: cy - 4 }, v ? v.short : g));

      if (unavailable) {
        node.appendChild(svgEl('text', { class: 'f3-link', x: cx[i], y: cy + 12 }, 'basin only'));
        const hint = svgEl('text', { class: 'f3-link', x: cx[i], y: cy + R + 17 }, 'Open case-study basin →');
        hint.addEventListener('click', () => store.set({ view: 'basin' }));
        svg.appendChild(hint);
        node.addEventListener('click', () => store.set({ view: 'basin' }));
      } else {
        const value = data.annualValue(series, varId, yr, g === 'water' ? meta.primaryWaterBody : undefined);
        const unitStr = theme.unitFor(varId, meta);
        node.appendChild(svgEl('text', { class: 'f3-value', x: cx[i], y: cy + 13 }, theme.fmt(value, varId)));
        node.appendChild(svgEl('text', { class: 'f3-unit', x: cx[i], y: cy + R + 16 }, `${yr} · ${unitStr}`));
        node.addEventListener('click', () => store.set({ focus: varId }));
      }
      node.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); node.dispatchEvent(new Event('click')); }
      });
      svg.appendChild(node);
    }

    stage.appendChild(svg);
  }

  function renderDispatchAndCaption(scope, state) {
    const yr = Number(state.year);
    const { meta } = scope;
    const summaryInfo = getTimestampSummary(meta.path, yr, scope);
    dispatchKicker.textContent = summaryInfo.kicker;
    dispatchBody.textContent = summaryInfo.text;
    if (summaryInfo.basinNote) {
      dispatchBasin.style.display = '';
      dispatchBasin.innerHTML = `<strong>${escHtml(summaryInfo.basinLabel)}:</strong> ${escHtml(summaryInfo.basinNote)}`;
    } else {
      dispatchBasin.style.display = 'none';
      dispatchBasin.textContent = '';
    }

    const [y0, y1] = meta.years || [2002, 2026];
    cap.innerHTML = `<strong>Fig. 3</strong> — ${escHtml(meta.name)} (${y0}–${y1}). Atmospheric species from Copernicus CAMS GFAS (2003–2026); MODIS/VIIRS detections cover 2002–2026. Click any pollutant or switch views above.`;
  }

  function renderActive(state) {
    if (!current || !current.meta) return;
    if (activeTab === 'plume') renderPlumeView(current, state);
    else if (activeTab === 'regions') renderRegionsView(current, state);
    else renderChainView(current, state);
    renderDispatchAndCaption(current, state);
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
    renderActive(state);
  }

  store.subscribe((state, prev) => {
    if (state.countryId !== prev.countryId || state.view !== prev.view) build(state);
    else if (state.focus !== prev.focus || state.year !== prev.year) renderActive(state);
  });

  await build(store.get());
}
