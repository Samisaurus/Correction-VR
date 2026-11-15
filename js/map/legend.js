// js/map/legend.js
// Purpose: compact legend overlay (#map-legend) with 3-country color swatches,
//          blue-to-purple river pollution gradient key, and smooth smoke haze key.

const STYLE = `
.leg-box {
  background: rgba(255, 255, 255, 0.96); border: 1px solid var(--c-edge); border-radius: 10px;
  font-size: 11px; line-height: 1.3; min-width: 186px; max-width: 248px; backdrop-filter: blur(4px);
}
.leg-title {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 5px 9px; border-bottom: 1px solid var(--c-edge); font-family: var(--f-mono);
  font-size: 11.5px; font-weight: 600; cursor: pointer;
  transition: background-color 150ms var(--ease-out);
}
.leg-title:hover { background: var(--c-panel); }
.leg-title button { border: 0; background: none; padding: 0 3px; font-size: 13px; font-weight: 700; color: var(--c-muted); }
.leg-body { padding: 5px 9px; }
.leg-box.is-collapsed .leg-body { display: none; }
.leg-box.is-collapsed .leg-title { border-bottom: 0; }
.leg-row { display: flex; align-items: center; gap: 7px; margin: 2.5px 0; }
.leg-row svg { flex: 0 0 auto; display: block; overflow: visible; }
.leg-water { fill: var(--c-water); fill-opacity: 0.4; stroke: var(--c-water); stroke-width: 1; }
.leg-contour { stroke: var(--c-contour); stroke-width: 1.1; fill: none; }
.leg-basin { stroke: var(--c-basin); stroke-width: 1.5; stroke-dasharray: 3 2; fill: var(--c-basin); fill-opacity: 0.12; }
.leg-countries { display: flex; flex-wrap: wrap; gap: 6px 10px; padding-top: 5px; margin-top: 5px; border-top: 1px solid var(--c-edge); font-size: 11px; }
.leg-cchip { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; color: var(--c-ink); }
.leg-swatch { width: 9px; height: 9px; border-radius: 3px; border: 1px solid rgba(0,0,0,0.2); display: inline-block; }
.leg-muted { color: var(--c-muted); }
.leg-nw { white-space: nowrap; }
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
  const { store, data, theme } = ctx;
  const { COUNTRY_COLORS, COLORS } = theme;
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
  let lastScopePath = null;
  let lastMeta = null;

  function buildBody(meta) {
    const basin = meta && meta.kind === 'basin';
    body.innerHTML = '';
    const k = basin ? 0.75 : 0.4;
    const r = (n) => (1 + k * Math.sqrt(n)).toFixed(1);
    body.appendChild(row(
      svg(56, 26, `<circle cx="7" cy="13" r="${r(10)}" fill="#FACC15" fill-opacity="0.55"/><circle cx="23" cy="13" r="${r(100)}" fill="#EA580C" fill-opacity="0.68"/><circle cx="46" cy="13" r="${r(1000)}" fill="#991B1B" fill-opacity="0.78"/>`),
      `<strong>Fire density:</strong> yellow–red / <span class="leg-nw">5 km²</span><br><span class="leg-muted">${basin ? '0.1°' : '0.5°'} grid, size = detections</span>`,
    ));
    body.appendChild(row(
      svg(46, 12,
        `<defs><linearGradient id="leg-river-g" x1="0" x2="1"><stop offset="0%" stop-color="${COLORS.river}"/><stop offset="45%" stop-color="#5E88D6"/><stop offset="100%" stop-color="${COLORS.polluted}"/></linearGradient></defs>`
        + '<rect x="0" y="3" width="46" height="6" rx="3" fill="url(#leg-river-g)"/>'),
      '<strong>River pollution:</strong> low (blue) → high (purple)<br><span class="leg-muted">width = stream order</span>',
    ));
    body.appendChild(row(
      svg(46, 12,
        '<defs><linearGradient id="leg-smoke-g" x1="0" x2="1"><stop offset="0%" stop-color="#8A7F72" stop-opacity="0.06"/><stop offset="50%" stop-color="#7E7163" stop-opacity="0.32"/><stop offset="100%" stop-color="#4E4238" stop-opacity="0.58"/></linearGradient></defs><rect x="0" y="1" width="46" height="10" rx="5" fill="url(#leg-smoke-g)"/>'),
      '<strong>Smoke plume (AOD):</strong> 0 → 0.6+',
    ));
    if (basin) {
      body.appendChild(row(svg(28, 12, '<rect class="leg-water" x="1" y="1" width="26" height="10" rx="2"/>'), '<strong>Water box</strong> (Kd490 shade)'));
      body.appendChild(row(svg(28, 12, '<path class="leg-contour" d="M1 9 C 6 2, 10 2, 14 7 S 24 11, 27 3"/>'), '<strong>Contour lines</strong> (terrain)'));
    } else {
      body.appendChild(row(svg(28, 14, '<path class="leg-basin" d="M3 11 Q 6 3 22 2 Q 26 9 18 13 Z"/>'), `<strong>Case-study outline</strong>${meta && meta.basin ? ` (${meta.basin.shortName})` : ''}: click to zoom`));
      body.appendChild(row(svg(28, 12, '<path class="leg-contour" d="M1 9 C 6 2, 10 2, 14 7 S 24 11, 27 3"/>'), '<strong>Topographic contours</strong> (zoom in)'));
    }
    if (regions && Array.isArray(regions.countries) && COUNTRY_COLORS) {
      const cRow = document.createElement('div');
      cRow.className = 'leg-countries';
      for (const c of regions.countries) {
        const chip = document.createElement('span');
        chip.className = 'leg-cchip';
        const sw = document.createElement('span');
        sw.className = 'leg-swatch';
        const col = COUNTRY_COLORS[c.id] || '#54595D';
        sw.style.backgroundColor = col;
        sw.style.borderColor = col;
        chip.append(sw, document.createTextNode(c.shortName || c.id));
        cRow.appendChild(chip);
      }
      body.appendChild(cRow);
    }
  }

  async function render(state) {
    const scopePath = data.scopePath(state);
    if (scopePath !== lastScopePath) {
      const my = ++token;
      const scope = await data.getScope(state);
      if (my !== token) return;
      lastScopePath = scopePath;
      lastMeta = scope ? scope.meta : null;
      buildBody(lastMeta);
    }
    titleText.textContent = `${state.year} · ${lastMeta ? lastMeta.shortName : state.countryId}`;
  }

  store.subscribe((state, prev) => {
    if (state.year !== prev.year || state.countryId !== prev.countryId || state.view !== prev.view) render(state);
  });
  await render(store.get());
}
