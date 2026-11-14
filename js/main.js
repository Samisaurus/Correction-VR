// js/main.js
// Purpose: app entry. Builds ctx = { store, data, theme }, mounts every module into its slot with a
//          safe dynamic import (a missing or broken module shows "Module not ready" and never breaks
//          the page), and inserts content/methods.html into #methods.
// Exports: ctx, MODULES, main (also run on load)
// Owner: Claude · Task C1 (skeleton) / C10 (final)

import { store } from './store.js';
import * as data from './data.js';
import * as theme from './theme.js';

export const ctx = { store, data, theme };

/** Mount order from the primer: header, slider, map, legend, infobox, fig1, fig2, fig3, methods. */
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

async function mountModule(entry, modulePromise) {
  const el = document.getElementById(entry.id);
  if (!el) {
    console.info(`main: slot #${entry.id} is missing from index.html`);
    return;
  }
  try {
    const mod = await modulePromise;
    if (!mod || typeof mod.mount !== 'function') throw new Error('module has no mount(el, ctx)');
    await mod.mount(el, ctx);
  } catch (err) {
    notReady(entry.id, entry.path, err);
  }
}

async function mountMethods() {
  const el = document.getElementById('methods');
  if (!el) return;
  const html = await data.getMethodsHtml();
  if (html && html.trim()) {
    el.innerHTML = html;
  } else {
    notReady('methods', 'content/methods.html', 'file missing or empty');
  }
}

export async function main() {
  // regions.json first, so data.scopePath() works synchronously for every module.
  const regions = await data.getRegions();
  if (!regions) console.info('main: data/regions.json could not be loaded; modules will show placeholders');

  // Start every import at once, then mount in the primer order.
  const imports = MODULES.map((m) => import(m.path).catch((err) => ({ importError: err })));
  const methods = mountMethods();
  for (let i = 0; i < MODULES.length; i += 1) {
    const entry = MODULES[i];
    const mod = await imports[i];
    if (mod && mod.importError) {
      notReady(entry.id, entry.path, mod.importError);
      continue;
    }
    await mountModule(entry, Promise.resolve(mod));
  }
  await methods;
  document.documentElement.dataset.ready = 'true';
}

main().catch((err) => console.info('main: unexpected failure', err));
