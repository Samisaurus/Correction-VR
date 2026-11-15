// js/ui/header.js
// Purpose: site title and country tabs (#region-tabs).

const STYLE = `
.hdr-root { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 10px 24px; }
.hdr-brand h1 { font-family: var(--f-serif); font-size: 27px; font-weight: 700; letter-spacing: -0.015em; line-height: 1.15; margin: 0; }
.hdr-sub { margin: 4px 0 0; font-size: 13.5px; color: var(--c-muted); letter-spacing: 0.005em; }
.hdr-sub strong { color: var(--c-ink); font-weight: 600; }
.hdr-controls { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px 18px; }
.hdr-tabs { display: flex; gap: 4px; }
.hdr-btn {
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 6px 6px 0 0;
  padding: 6px 11px 6px;
  color: var(--c-muted);
  font-size: 14.5px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition:
    color 160ms var(--ease-out),
    background-color 160ms var(--ease-out),
    border-color 200ms var(--ease-out),
    transform 100ms var(--ease-spring);
}
.hdr-btn:hover:not([disabled]) {
  color: var(--c-ink);
  background: rgba(15, 23, 42, 0.045);
}
.hdr-btn:active:not([disabled]) {
  transform: scale(0.96);
  transition-duration: 60ms;
}
.hdr-btn[aria-pressed="true"] {
  color: var(--c-ink);
  font-weight: 600;
  border-bottom-color: var(--c-ink);
  background: rgba(15, 23, 42, 0.03);
}
@media (max-width: 899px) {
  .hdr-brand h1 { font-size: 22px; }
  .hdr-btn { padding: 6px 8px 5px; font-size: 14px; }
}
`;

function button(text, title) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'hdr-btn';
  b.textContent = text;
  if (title) b.title = title;
  b.setAttribute('aria-pressed', 'false');
  return b;
}

function arrowNavigation(group) {
  group.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    const buttons = Array.from(group.querySelectorAll('button'));
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    ev.preventDefault();
    buttons[(i + (ev.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length].focus();
  });
}

export async function mount(el, ctx) {
  const { store, data, theme } = ctx;
  theme.injectCss('hdr', STYLE);
  const regions = await data.getRegions();
  if (!regions || !Array.isArray(regions.countries) || regions.countries.length === 0) {
    theme.placeholder(el);
    return;
  }
  const [y0, y1] = Array.isArray(regions.years) ? regions.years : [2002, 2026];

  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'hdr-root';

  const brand = document.createElement('div');
  brand.className = 'hdr-brand';
  const h1 = document.createElement('h1');
  h1.textContent = 'Ember Observatory';
  const sub = document.createElement('p');
  sub.className = 'hdr-sub';
  sub.innerHTML = `<strong>Wildfire &amp; atmospheric emissions</strong> · ${y0}–${y1}`;
  brand.append(h1, sub);

  const controls = document.createElement('div');
  controls.className = 'hdr-controls';

  const tabs = document.createElement('nav');
  tabs.id = 'region-tabs';
  tabs.className = 'hdr-tabs';
  tabs.setAttribute('aria-label', 'Country');
  const tabButtons = new Map();
  for (const c of regions.countries) {
    const b = button(c.shortName || c.id, c.name);
    b.dataset.countryId = c.id;
    b.addEventListener('click', () => store.set({ countryId: c.id, playing: false }));
    tabs.appendChild(b);
    tabButtons.set(c.id, b);
  }

  arrowNavigation(tabs);
  controls.append(tabs);
  root.append(brand, controls);
  el.appendChild(root);

  function render(state) {
    for (const [id, b] of tabButtons) b.setAttribute('aria-pressed', String(id === state.countryId));
  }

  store.subscribe(render);
  render(store.get());
}
