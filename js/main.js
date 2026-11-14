// js/main.js
// Purpose: app entry. Builds ctx = { store, data, theme } and mounts every module into its slot.

import { store } from './store.js';
import * as data from './data.js';
import * as theme from './theme.js';

export const ctx = { store, data, theme };

const LOADERS = {
  './ui/header.js': () => import('./ui/header.js'),
  './ui/slider.js': () => import('./ui/slider.js'),
  './map/map.js': () => import('./map/map.js'),
  './map/legend.js': () => import('./map/legend.js'),
  './ui/infobox.js': () => import('./ui/infobox.js'),
  './charts/fig1-trend.js': () => import('./charts/fig1-trend.js'),
  './charts/fig2-before-after.js': () => import('./charts/fig2-before-after.js'),
  './charts/fig3-chain.js': () => import('./charts/fig3-chain.js'),
};

export const MODULES = [
  { id: 'site-header', path: './ui/header.js' },
  { id: 'year-slider', path: './ui/slider.js' },
  { id: 'map', path: './map/map.js' },
  { id: 'map-legend', path: './map/legend.js' },
  { id: 'infobox', path: './ui/infobox.js' },
  { id: 'fig1', path: './charts/fig1-trend.js' },
  { id: 'fig2', path: './charts/fig2-before-after.js' },
  { id: 'fig3', path: './charts/fig3-chain.js' },
];

function notReady(id, path, err) {
  console.info(`main: ${path} is not ready for #${id} (${err && err.message ? err.message : err})`);
  const el = document.getElementById(id);
  if (el) theme.placeholder(el, 'Module not ready');
}

async function mountModule(entry, mod) {
  const el = document.getElementById(entry.id);
  if (!el) {
    console.info(`main: slot #${entry.id} is missing from index.html`);
    return;
  }
  try {
    if (!mod || typeof mod.mount !== 'function') throw new Error('module has no mount(el, ctx)');
    await mod.mount(el, ctx);
  } catch (err) {
    notReady(entry.id, entry.path, err);
  }
}

/** Mirror countryId and view onto <html>. */
function syncFrame(state) {
  const root = document.documentElement;
  root.dataset.country = state.countryId;
  root.dataset.view = state.view;
}

export async function main() {
  syncFrame(store.get());
  store.subscribe(syncFrame);

  const regions = await data.getRegions();
  if (!regions) console.info('main: data/regions.json could not be loaded; modules will show placeholders');

  const imports = MODULES.map((m) => LOADERS[m.path]().catch((err) => ({ importError: err })));
  for (let i = 0; i < MODULES.length; i += 1) {
    const entry = MODULES[i];
    const mod = await imports[i];
    if (mod && mod.importError) {
      notReady(entry.id, entry.path, mod.importError);
      continue;
    }
    await mountModule(entry, mod);
  }
  document.documentElement.dataset.ready = 'true';
}

main().catch((err) => console.info('main: unexpected failure', err));
