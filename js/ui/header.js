// js/ui/header.js
// Purpose: site title and country tabs (#region-tabs).

import { startTour } from './tour.js';

const STYLE = `
.hdr-root { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 10px 24px; }
.hdr-brand { display: flex; align-items: center; gap: 11px; }
.hdr-mark {
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  border-radius: 7px;
  background: var(--c-paper);
  border: 1.5px solid var(--c-win-border, var(--c-edge));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.05);
}
.hdr-brand-text h1 { font-family: var(--f-serif); font-size: 27px; font-weight: 700; letter-spacing: -0.015em; line-height: 1.15; margin: 0; }
.hdr-sub { margin: 3px 0 0; font-size: 13px; color: var(--c-muted); letter-spacing: 0.005em; }
.hdr-sub strong { color: var(--c-ink); font-weight: 600; }
.hdr-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
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
.hdr-tour-btn {
  padding: 5px 10px;
  font-family: var(--f-sans);
  font-size: 11.5px;
  font-weight: 600;
  border-radius: 6px;
  border: 1px solid var(--c-edge);
  background: var(--c-paper);
  color: var(--c-muted);
  white-space: nowrap;
}
.hdr-tour-btn:hover { color: var(--c-ink); border-color: var(--c-edge-hover); background: var(--c-panel); }
@media (max-width: 899px) {
  .hdr-brand-text h1 { font-size: 22px; }
  .hdr-mark { width: 30px; height: 30px; flex-basis: 30px; }
  .hdr-btn { padding: 6px 8px 5px; font-size: 14px; }
}
`;

const EMBLEM_SVG = `
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M12 2.5C12 2.5 17.5 7.6 17.5 13.2C17.5 16.9 15 19.8 12 19.8C9 19.8 6.5 16.9 6.5 13.2C6.5 10.6 8 8.3 9.4 6.8C9.2 8.7 10.2 9.9 11.2 10.4C10.9 7.8 11.6 4.7 12 2.5Z" fill="#D55E00" fill-opacity="0.88"/>
  <path d="M12 11.8C13.6 13.3 14.3 15 14.3 16.5C14.3 18.2 13.3 19.5 12 19.5C10.7 19.5 9.7 18.2 9.7 16.5C9.7 14.8 10.7 13.2 12 11.8Z" fill="#E69F00"/>
</svg>
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
  const mark = document.createElement('div');
  mark.className = 'hdr-mark';
  mark.innerHTML = EMBLEM_SVG;
  const brandText = document.createElement('div');
  brandText.className = 'hdr-brand-text';
  const h1 = document.createElement('h1');
  h1.textContent = 'Ember Observatory';
  const sub = document.createElement('p');
  sub.className = 'hdr-sub';
  sub.innerHTML = `<strong>Wildfire &amp; atmospheric chronicles</strong> · Mapping boreal fire &amp; smoke (${y0}–${y1})`;
  brandText.append(h1, sub);
  brand.append(mark, brandText);

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

  const tourBtn = document.createElement('button');
  tourBtn.type = 'button';
  tourBtn.className = 'hdr-tour-btn';
  tourBtn.textContent = 'Take tour';
  tourBtn.title = 'Highlight observatory features';
  tourBtn.addEventListener('click', () => startTour(theme));

  arrowNavigation(tabs);
  controls.append(tabs, tourBtn);
  root.append(brand, controls);
  el.appendChild(root);

  function render(state) {
    for (const [id, b] of tabButtons) b.setAttribute('aria-pressed', String(id === state.countryId));
  }

  store.subscribe(render);
  render(store.get());
}
