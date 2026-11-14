// js/ui/header.js
// Purpose: site title, country tabs (#region-tabs) and the Whole country / Case study toggle (#view-toggle).
//          Writes countryId (keeping view and year, playing false) and view. Reads regions.json only.
// Exports: mount(el, ctx)
// Owner: GPT-UI · Task G1 (built here against the Session Primer v2)

const STYLE = `
.hdr-root { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 10px 24px; }
.hdr-brand h1 { font-family: var(--f-serif); font-size: 26px; font-weight: 600; line-height: 1.15; margin: 0; }
.hdr-sub { margin: 3px 0 0; font-size: 14px; color: var(--c-muted); }
.hdr-controls { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px 18px; }
.hdr-tabs, .hdr-toggle { display: flex; gap: 2px; }
.hdr-toggle { border-left: 1px solid var(--c-rule); padding-left: 14px; }
.hdr-btn { background: none; border: 0; border-bottom: 2px solid transparent; border-radius: 0; padding: 6px 10px 5px;
  color: var(--c-muted); font-size: 15px; font-weight: 500; cursor: pointer; white-space: nowrap; }
.hdr-btn:hover { color: var(--c-ink); background: var(--c-panel); }
.hdr-btn[aria-pressed="true"] { color: var(--c-ink); border-bottom-color: var(--c-ink); }
.hdr-btn--basin[aria-pressed="true"] { border-bottom-color: var(--c-basin); }
@media (max-width: 899px) {
  .hdr-brand h1 { font-size: 22px; }
  .hdr-toggle { border-left: 0; padding-left: 0; }
  .hdr-btn { padding: 6px 8px 5px; font-size: 14px; }
}
`;

function injectStyle() {
  if (document.querySelector('style[data-module="hdr"]')) return;
  const style = document.createElement('style');
  style.dataset.module = 'hdr';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

function button(text, title, extraClass) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `hdr-btn${extraClass ? ` ${extraClass}` : ''}`;
  b.textContent = text;
  if (title) b.title = title;
  b.setAttribute('aria-pressed', 'false');
  return b;
}

/** ArrowLeft / ArrowRight move focus between the buttons of one group. */
function arrowNavigation(group) {
  group.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    const buttons = Array.from(group.querySelectorAll('button'));
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    ev.preventDefault();
    const next = buttons[(i + (ev.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
    next.focus();
  });
}

export async function mount(el, ctx) {
  injectStyle();
  const { store, data, theme } = ctx;
  const regions = await data.getRegions();
  if (!regions || !Array.isArray(regions.countries) || regions.countries.length === 0) {
    theme.placeholder(el);
    return;
  }
  const [y0, y1] = Array.isArray(regions.years) ? regions.years : [2012, 2025];

  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'hdr-root';

  const brand = document.createElement('div');
  brand.className = 'hdr-brand';
  const h1 = document.createElement('h1');
  h1.textContent = 'Ember to Ocean';
  const sub = document.createElement('p');
  sub.className = 'hdr-sub';
  sub.textContent = `Wildfire, air, water and salmon · ${y0}–${y1} · NASA Space Apps 2026`;
  brand.append(h1, sub);

  const controls = document.createElement('div');
  controls.className = 'hdr-controls';

  const tabs = document.createElement('nav');
  tabs.id = 'region-tabs';
  tabs.className = 'hdr-tabs';
  tabs.setAttribute('aria-label', 'Country');
  const tabButtons = new Map();
  for (const c of regions.countries) {
    const b = button(c.shortName || c.id, c.name, '');
    b.dataset.countryId = c.id;
    b.addEventListener('click', () => store.set({ countryId: c.id, playing: false }));
    tabs.appendChild(b);
    tabButtons.set(c.id, b);
  }

  const toggle = document.createElement('div');
  toggle.id = 'view-toggle';
  toggle.className = 'hdr-toggle';
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'Map level');
  const wholeBtn = button('Whole country', 'Whole-country view: fires, smoke, rivers and national salmon series', '');
  wholeBtn.dataset.view = 'country';
  wholeBtn.addEventListener('click', () => store.set({ view: 'country' }));
  const basinBtn = button('Case study', 'Case-study basin: pitched terrain, 0.1° fires and the water measurement box', 'hdr-btn--basin');
  basinBtn.dataset.view = 'basin';
  basinBtn.addEventListener('click', () => store.set({ view: 'basin' }));
  toggle.append(wholeBtn, basinBtn);

  arrowNavigation(tabs);
  arrowNavigation(toggle);
  controls.append(tabs, toggle);
  root.append(brand, controls);
  el.appendChild(root);

  function render(state) {
    for (const [id, b] of tabButtons) b.setAttribute('aria-pressed', String(id === state.countryId));
    const country = regions.countries.find((c) => c.id === state.countryId) || regions.countries[0];
    const basinName = country && country.basin ? country.basin.shortName || country.basin.id : null;
    basinBtn.textContent = basinName ? `Case study: ${basinName}` : 'Case study';
    basinBtn.disabled = !basinName;
    wholeBtn.setAttribute('aria-pressed', String(state.view !== 'basin'));
    basinBtn.setAttribute('aria-pressed', String(state.view === 'basin'));
  }

  store.subscribe(render);
  render(store.get());
}
