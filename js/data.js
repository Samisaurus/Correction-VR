// js/data.js
// Purpose: cached loader for everything under ./data/ and ./content/ plus sync series helpers
//          (Session Primer v2, DATA API and SCOPE META). Never throws: a missing file is null.
// Exports: getRegions, scopePath, getScope, getFires, getAir, getMethodsHtml,
//          annualSeries, monthlySeries, annualValue, isWaterVar, regionsCached, buildMeta
// Owner: Claude · Task C2

const BASE = './data/';
const CONTENT = './content/';
const cache = new Map(); // url or key -> Promise
let regionsSync = null; // last parsed regions.json, for the sync scopePath()

async function fetchJson(url) {
  if (!cache.has(url)) {
    cache.set(url, (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`data: ${url} -> HTTP ${res.status}`);
          return null;
        }
        return await res.json();
      } catch (err) {
        console.warn(`data: ${url} failed (${err && err.message ? err.message : err})`);
        return null;
      }
    })());
  }
  return cache.get(url);
}

async function fetchText(url) {
  if (!cache.has(url)) {
    cache.set(url, (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`data: ${url} -> HTTP ${res.status}`);
          return null;
        }
        return await res.text();
      } catch (err) {
        console.warn(`data: ${url} failed (${err && err.message ? err.message : err})`);
        return null;
      }
    })());
  }
  return cache.get(url);
}

/** Parsed data/regions.json (or null). */
export async function getRegions() {
  const regions = await fetchJson(`${BASE}regions.json`);
  if (regions && !regionsSync) regionsSync = regions;
  return regions;
}

/** regions.json if it has already been loaded once (sync), else null. */
export function regionsCached() {
  return regionsSync;
}

function countryEntry(countryId, regions = regionsSync) {
  if (!regions || !Array.isArray(regions.countries)) return null;
  return regions.countries.find((c) => c.id === countryId) || null;
}

/** 'canada' in country view, 'canada/fraser' in basin view. Sync; needs regions loaded once. */
export function scopePath(state) {
  const country = countryEntry(state.countryId);
  if (state.view === 'basin' && country && country.basin && country.basin.id) {
    return `${state.countryId}/${country.basin.id}`;
  }
  return state.countryId;
}

/** SCOPE META exactly as the primer defines it, plus years/mock/path for convenience. */
export function buildMeta(country, view, regions) {
  const common = { years: regions.years, mock: regions.mock === true };
  if (view === 'basin' && country.basin) {
    const b = country.basin;
    return {
      kind: 'basin', id: b.id, countryId: country.id, name: b.name, shortName: b.shortName,
      bbox: b.bbox, camera: b.camera, eventYears: b.eventYears, fishMetric: b.fishMetric,
      currency: b.currency, primaryWaterBody: b.primaryWaterBody, waterBodies: b.waterBodies || [],
      basin: null, path: `${country.id}/${b.id}`, ...common,
    };
  }
  return {
    kind: 'country', id: country.id, countryId: country.id, name: country.name, shortName: country.shortName,
    bbox: country.bbox, camera: country.camera, eventYears: country.eventYears, fishMetric: country.fishMetric,
    currency: country.currency, primaryWaterBody: null, waterBodies: [],
    basin: country.basin ? { id: country.basin.id, name: country.basin.name, shortName: country.basin.shortName } : null,
    path: country.id, ...common,
  };
}

/** { meta, geo, rivers, series, stats } for the current scope; null only if regions.json is missing. */
export async function getScope(state) {
  const regions = await getRegions();
  const country = countryEntry(state.countryId, regions);
  if (!country) return null;
  const view = state.view === 'basin' && country.basin ? 'basin' : 'country';
  const path = view === 'basin' ? `${country.id}/${country.basin.id}` : country.id;
  const key = `scope:${path}`;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const [geo, rivers, series, stats] = await Promise.all(
        ['geo.geojson', 'rivers.geojson', 'series.json', 'stats.json'].map((f) => fetchJson(`${BASE}${path}/${f}`)),
      );
      return { meta: buildMeta(country, view, regions), geo, rivers, series, stats };
    })());
  }
  return cache.get(key);
}

function yearFile(state, folder, year) {
  const y = Number(year);
  if (!Number.isInteger(y)) return Promise.resolve(null);
  return fetchJson(`${BASE}${scopePath(state)}/${folder}/${y}.geojson`);
}

/** GeoJSON FeatureCollection of fire cells for that year in the current scope, or null. */
export function getFires(state, year) {
  return yearFile(state, 'fires', year);
}

/** GeoJSON FeatureCollection of air cells for that year in the current scope, or null. */
export function getAir(state, year) {
  return yearFile(state, 'air', year);
}

/** content/methods.html as a string, or null. */
export function getMethodsHtml() {
  return fetchText(`${CONTENT}methods.html`);
}

/** true for the water variables, which live under series.waterBodies. */
export function isWaterVar(varId) {
  return varId === 'kd490' || varId === 'chlor_a';
}

function pickVariable(series, varId, waterBodyId) {
  if (!series || !varId) return null;
  if (isWaterVar(varId)) {
    if (!waterBodyId || !series.waterBodies) return null;
    const body = series.waterBodies[waterBodyId];
    return body && body[varId] ? body[varId] : null;
  }
  return series.variables && series.variables[varId] ? series.variables[varId] : null;
}

function num(v) {
  return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);
}

/** [{ year, value }] for all 14 years (value may be null); [] when the variable is absent. */
export function annualSeries(series, varId, waterBodyId) {
  const v = pickVariable(series, varId, waterBodyId);
  if (!v || !Array.isArray(v.annual)) return [];
  return v.annual.map(([year, value]) => ({ year: Number(year), value: num(value) }));
}

/** [{ date, month: 'YYYY-MM', value }] for all 168 months; [] when monthly is null or absent. */
export function monthlySeries(series, varId, waterBodyId) {
  const v = pickVariable(series, varId, waterBodyId);
  if (!v || !Array.isArray(v.monthly)) return [];
  return v.monthly.map(([month, value]) => {
    const [y, m] = String(month).split('-').map(Number);
    return { date: new Date(Date.UTC(y, (m || 1) - 1, 1)), month: String(month), value: num(value) };
  });
}

/** The annual value for one year, or null. */
export function annualValue(series, varId, year, waterBodyId) {
  const row = annualSeries(series, varId, waterBodyId).find((d) => d.year === Number(year));
  return row ? row.value : null;
}

/*
Browser-console self-test (paste after the page has loaded):
  const d = await import('./js/data.js');
  const r = await d.getRegions(); console.assert(r && r.countries.length >= 3, 'regions loaded');
  for (const c of r.countries) {
    const cs = await d.getScope({ countryId: c.id, view: 'country' });
    const bs = await d.getScope({ countryId: c.id, view: 'basin' });
    console.assert(cs.meta.kind === 'country' && cs.meta.basin.id === c.basin.id && cs.meta.waterBodies.length === 0, c.id);
    console.assert(bs.meta.kind === 'basin' && bs.meta.basin === null && bs.meta.primaryWaterBody, c.basin.id);
    console.assert(d.scopePath({ countryId: c.id, view: 'basin' }) === `${c.id}/${c.basin.id}`);
    console.assert(d.annualSeries(cs.series, 'fire_frp').length === 14 && d.monthlySeries(cs.series, 'aod').length === 168);
    console.assert(d.annualSeries(cs.series, 'kd490', bs.meta.primaryWaterBody).length === 0, 'no water in country scope');
  }
  console.assert((await d.getFires({ countryId: 'canada', view: 'country' }, 1999)) === null, 'missing year -> null');
  console.log('data.js self-test done');
*/
