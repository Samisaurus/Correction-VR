// js/map/legend.js
// Purpose: compact legend overlay (#map-legend).

const STYLE = `
.leg-box {
  background: rgba(255, 255, 255, 0.96); border: 1px solid var(--c-edge); border-radius: 10px;
  font-size: 11.5px; line-height: 1.35; min-width: 176px; max-width: 248px; backdrop-filter: blur(4px);
}
.leg-title {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 6px 10px; border-bottom: 1px solid var(--c-edge); font-family: var(--f-mono);
  font-size: 12px; font-weight: 600; cursor: pointer;
  transition: background-color 150ms var(--ease-out);
}
.leg-title:hover { background: var(--c-panel); }
.leg-title button { border: 0; background: none; padding: 0 3px; font-size: 13px; font-weight: 700; color: var(--c-muted); }
.leg-body { padding: 7px 10px; }
.leg-box.is-collapsed .leg-body { display: none; }
.leg-box.is-collapsed .leg-title { border-bottom: 0; }
.leg-row { display: flex; align-items: center; gap: 7px; margin: 4px 0; }
.leg-row svg { flex: 0 0 auto; display: block; overflow: visible; }
.leg-fire { fill: var(--c-fire); fill-opacity: 0.75; }
.leg-river { stroke: var(--c-river); stroke-width: 2; fill: none; }
.leg-polluted { stroke: var(--c-polluted); stroke-width: 3; fill: none; }
.leg-aod { fill: var(--c-smoke); }
.leg-water { fill: var(--c-water); fill-opacity: 0.4; stroke: var(--c-water); stroke-width: 1; }
.leg-contour { stroke: var(--c-contour); stroke-width: 1; fill: none; }
.leg-basin { stroke: var(--c-basin); stroke-width: 1.5; stroke-dasharray: 3 2; fill: var(--c-basin); fill-opacity: 0.12; }
.leg-mock { color: var(--c-fire); font-family: var(--f-mono); font-size: 11px; font-weight: 600; margin-top: 5px; }
.leg-muted { color: var(--c-muted); }
`;
const NS = 'http://www.w3.org/2000/svg';

function injectStyle() {
  if (document.querySelector('style[data-module="leg"]')) return;
  const s = document.createElement('style');
  s.dataset.module = 'leg';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

function svg(w, h, inner) {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('width', w);
  el.setAttribute('height', h);
  el.setAttribute('viewBox', `0 0 ${w} ${h}`);
  el.innerHTML = inner;
  return el;
}

function row(graphic, text) {
  const r = document.createElement('div');
  r.className = 'leg-row';
  const span = document.createElement('span');
  span.innerHTML = text;
  r.append(graphic, span);
  return r;
}

export async function mount(el, ctx) {
  injectStyle();
  const { store, data } = ctx;
  const regions = await data.getRegions();
  const box = document.createElement('div');
  box.className = 'leg-box';
  const title = document.createElement('div');
  title.className = 'leg-title';
  const titleText = document.createElement('span');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Collapse legend');
  title.append(titleText, toggle);
  const body = document.createElement('div');
  body.className = 'leg-body';
  box.append(title, body);
  el.innerHTML = '';
  el.appendChild(box);
  let collapsed = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 899px)').matches;
  const setCollapsed = (c) => {
    collapsed = c;
    box.classList.toggle('is-collapsed', c);
    toggle.textContent = c ? '+' : '−';
    toggle.setAttribute('aria-expanded', String(!c));
  };
  title.addEventListener('click', () => setCollapsed(!collapsed));
  setCollapsed(collapsed);
  let token = 0;

  async function render(state) {
    const my = ++token;
    const scope = await data.getScope(state);
    if (my !== token) return;
    const meta = scope ? scope.meta : null;
    const basin = meta && meta.kind === 'basin';
    titleText.textContent = `${state.year} · ${meta ? meta.shortName : state.countryId}`;
    body.innerHTML = '';
    const k = basin ? 0.75 : 0.4;
    const r = (n) => (1 + k * Math.sqrt(n)).toFixed(1);
    body.appendChild(row(svg(64, 26, `<circle class="leg-fire" cx="8" cy="13" r="${r(10)}"/><circle class="leg-fire" cx="26" cy="13" r="${r(100)}"/><circle class="leg-fire" cx="52" cy="13" r="${r(1000)}"/>`),
      `<strong>Fire cells:</strong> 10 / 100 / 1,000 detections<br><span class="leg-muted">${basin ? '0.1°' : '0.5°'} cells, opacity = fire power</span>`));
    body.appendChild(row(svg(28, 10, '<path class="leg-river" d="M1 7 C 8 2, 14 10, 27 3"/>'), '<strong>River</strong> (width = stream order)'));
    body.appendChild(row(svg(28, 10, '<path class="leg-polluted" d="M1 7 C 8 2, 14 10, 27 3"/>'), `<strong>River near fires</strong> in ${state.year} (&lt; ${basin ? 25 : 50} km)`));
    body.appendChild(row(svg(46, 12, '<rect class="leg-aod" x="0" y="1" width="14" height="10" fill-opacity="0.04"/><rect class="leg-aod" x="16" y="1" width="14" height="10" fill-opacity="0.22"/><rect class="leg-aod" x="32" y="1" width="14" height="10" fill-opacity="0.45"/>'),
      '<strong>AOD haze:</strong> 0 / 0.3 / 0.6 (May–Sep mean)'));
    if (basin) {
      body.appendChild(row(svg(28, 12, '<rect class="leg-water" x="1" y="1" width="26" height="10"/>'), '<strong>Water box</strong> (Kd490 shade)'));
      body.appendChild(row(svg(28, 12, '<path class="leg-contour" d="M1 9 C 6 2, 10 2, 14 7 S 24 11, 27 3"/>'), '<strong>Contour lines</strong> (terrain)'));
    } else {
      body.appendChild(row(svg(28, 14, '<path class="leg-basin" d="M3 11 L6 3 L22 2 L26 9 L18 13 Z"/>'), `<strong>Case-study outline</strong>${meta && meta.basin ? ` (${meta.basin.shortName})` : ''}: click to zoom`));
    }
    if (regions && regions.mock === true) {
      const m = document.createElement('div');
      m.className = 'leg-mock';
      m.textContent = 'Data: mock';
      body.appendChild(m);
    }
  }
  store.subscribe((state, prev) => {
    if (state.year !== prev.year || state.countryId !== prev.countryId || state.view !== prev.view) render(state);
  });
  await render(store.get());
}
