// js/data.js
// Purpose: cached loader for ./data/ (GeoJSON/JSON + flexible large-CSV adapter & grid aggregator)
//          plus sync series helpers. Never throws: a missing file returns null.

import { DATA_CONFIG } from './data-config.js';

const BASE = './data/';
const cache = new Map();       // url or key -> Promise
const csvIndexCache = new Map(); // csvUrl + kind -> Promise<Map<year, FeatureCollection>>
const csvOverrides = new Map();  // `${scopePath}:${kind}` -> string (url) | File | Blob
let regionsSync = null;

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
        if (!res.ok) return null;
        return await res.text();
      } catch {
        return null;
      }
    })());
  }
  return cache.get(url);
}

// ---- Flexible, non-blocking CSV parser & spatial aggregator for large CSV files -----------------

function splitCsvRow(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function findCol(headers, aliases) {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const alias of aliases) {
    const idx = lower.indexOf(alias.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

function toNum(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const s = String(raw).trim();
  if (!s || s === 'NA' || s === 'NaN' || s === 'null' || s === '-9999') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseYear(rawYear, rawDate) {
  if (rawYear !== undefined && rawYear !== '') {
    const y = Number(rawYear);
    if (Number.isInteger(y) && y >= 1900 && y <= 2100) return y;
  }
  if (rawDate) {
    const m = String(rawDate).match(/(\d{4})/);
    if (m) return Number(m[1]);
  }
  return null;
}

/**
 * Parse a large CSV string in chunks (non-blocking) and invoke onRow(cells, indices) for each row.
 */
export async function parseCsv(text, onRow, chunkRows = DATA_CONFIG.chunkRows) {
  if (!text) return;
  const lines = text.split(/\r?\n/);
  let headerIdx = 0;
  while (headerIdx < lines.length && !lines[headerIdx].trim()) headerIdx += 1;
  if (headerIdx >= lines.length) return;

  const headers = splitCsvRow(lines[headerIdx]);
  const cols = {};
  for (const [k, aliases] of Object.entries(DATA_CONFIG.columns)) {
    cols[k] = findCol(headers, aliases);
  }

  for (let i = headerIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line && line.trim()) {
      onRow(splitCsvRow(line), cols, headers);
    }
    if (chunkRows > 0 && (i - headerIdx) % chunkRows === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}

/**
 * Register a runtime CSV override (URL string or browser File/Blob) for any scope + kind ('fires'|'air').
 * Clears cached layers for that key so the next refresh loads the new CSV immediately.
 */
export function setCsvOverride(scope, kind, source) {
  const key = `${scope}:${kind}`;
  if (!source) csvOverrides.delete(key);
  else csvOverrides.set(key, source);
  for (const k of Array.from(csvIndexCache.keys())) {
    if (k.startsWith(`${key}:`)) csvIndexCache.delete(k);
  }
}

async function readCsvSource(source) {
  if (!source) return null;
  if (typeof source === 'string') return fetchText(source);
  if (typeof source.text === 'function') return source.text();
  return null;
}

function resolveCsvSource(scope, kind, year) {
  const override = csvOverrides.get(`${scope}:${kind}`);
  if (override) return override;
  const scopeCfg = DATA_CONFIG.scopes && DATA_CONFIG.scopes[scope];
  const prop = kind === 'fires' ? 'firesCsv' : kind === 'air' ? 'airCsv' : 'seriesCsv';
  if (scopeCfg && scopeCfg[prop]) {
    return scopeCfg[prop].replace('{scope}', scope).replace('{year}', String(year));
  }
  const pat = DATA_CONFIG.patterns && DATA_CONFIG.patterns[prop];
  if (pat) {
    return pat.replace('{scope}', scope).replace('{year}', String(year));
  }
  return null;
}

async function loadSeriesCsv(source, scope) {
  const text = await readCsvSource(source);
  if (!text) return null;
  const variables = {};
  const waterBodies = {};
  const ensureVar = (bucket, id) => {
    if (!bucket[id]) bucket[id] = { annualMap: new Map(), monthlyMap: new Map() };
    return bucket[id];
  };
  await parseCsv(text, (cells, cols) => {
    const varId = cols.variable >= 0 ? String(cells[cols.variable] || '').trim() : '';
    const val = cols.value >= 0 ? toNum(cells[cols.value]) : null;
    if (!varId || val === null) return;
    const wb = cols.waterBody >= 0 ? String(cells[cols.waterBody] || '').trim() : '';
    const bucket = wb ? (waterBodies[wb] || (waterBodies[wb] = {})) : variables;
    const target = ensureVar(bucket, varId);
    const dateRaw = cols.date >= 0 ? String(cells[cols.date] || '').trim() : '';
    const ym = dateRaw.match(/^(\d{4})-(\d{2})/);
    if (ym) {
      target.monthlyMap.set(`${ym[1]}-${ym[2]}`, val);
    } else {
      const yr = parseYear(cols.year >= 0 ? cells[cols.year] : undefined, dateRaw);
      if (yr !== null) target.annualMap.set(yr, val);
    }
  });
  const finalize = (bucket) => {
    const out = {};
    for (const [id, entry] of Object.entries(bucket)) {
      const annual = Array.from(entry.annualMap.entries()).sort((a, b) => a[0] - b[0]);
      const monthly = Array.from(entry.monthlyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      out[id] = { annual, monthly };
    }
    return out;
  };
  const wbOut = {};
  for (const [wb, b] of Object.entries(waterBodies)) wbOut[wb] = finalize(b);
  return { scope, variables: finalize(variables), waterBodies: wbOut };
}

async function loadSpatialCsvByYear(source, kind, scope, isBasin, defaultYear) {
  const cacheKey = `${scope}:${kind}:${typeof source === 'string' ? source : 'blob'}`;
  if (csvIndexCache.has(cacheKey)) return csvIndexCache.get(cacheKey);

  const promise = (async () => {
    const text = await readCsvSource(source);
    if (!text) return null;

    const gridDeg = kind === 'fires'
      ? (isBasin ? DATA_CONFIG.gridDeg.basinFires : DATA_CONFIG.gridDeg.countryFires)
      : (isBasin ? DATA_CONFIG.gridDeg.basinAir : DATA_CONFIG.gridDeg.countryAir);

    // year -> Map<cellKey, accumulator>
    const byYear = new Map();

    await parseCsv(text, (cells, cols) => {
      const lat = cols.lat >= 0 ? toNum(cells[cols.lat]) : null;
      const lon = cols.lon >= 0 ? toNum(cells[cols.lon]) : null;
      if (lat === null || lon === null) return;

      const yr = parseYear(
        cols.year >= 0 ? cells[cols.year] : undefined,
        cols.date >= 0 ? cells[cols.date] : undefined,
      ) ?? defaultYear;
      if (!Number.isInteger(yr)) return;

      let yearMap = byYear.get(yr);
      if (!yearMap) {
        yearMap = new Map();
        byYear.set(yr, yearMap);
      }

      const snapLat = gridDeg > 0 ? Math.floor(lat / gridDeg) * gridDeg + gridDeg / 2 : lat;
      const snapLon = gridDeg > 0 ? Math.floor(lon / gridDeg) * gridDeg + gridDeg / 2 : lon;
      const key = `${snapLon.toFixed(4)},${snapLat.toFixed(4)}`;

      if (kind === 'fires') {
        const count = cols.count >= 0 ? (toNum(cells[cols.count]) ?? 1) : 1;
        const frp = cols.frp >= 0 ? (toNum(cells[cols.frp]) ?? 0) : 0;
        const dateStr = cols.date >= 0 ? cells[cols.date] : `${yr}-07-01`;
        const cur = yearMap.get(key);
        if (!cur) {
          yearMap.set(key, { lon: snapLon, lat: snapLat, count, frp_sum: frp, first: dateStr, last: dateStr });
        } else {
          cur.count += count;
          cur.frp_sum += frp;
          if (dateStr && dateStr < cur.first) cur.first = dateStr;
          if (dateStr && dateStr > cur.last) cur.last = dateStr;
        }
      } else {
        const aod = cols.aod >= 0 ? toNum(cells[cols.aod]) : null;
        const pm25 = cols.pm25 >= 0 ? toNum(cells[cols.pm25]) : null;
        if (aod === null && pm25 === null) return;
        const cur = yearMap.get(key);
        if (!cur) {
          yearMap.set(key, { lon: snapLon, lat: snapLat, aodSum: aod ?? 0, aodN: aod !== null ? 1 : 0, pmSum: pm25 ?? 0, pmN: pm25 !== null ? 1 : 0 });
        } else {
          if (aod !== null) { cur.aodSum += aod; cur.aodN += 1; }
          if (pm25 !== null) { cur.pmSum += pm25; cur.pmN += 1; }
        }
      }
    });

    const collections = new Map();
    for (const [yr, yearMap] of byYear.entries()) {
      const features = [];
      for (const item of yearMap.values()) {
        if (kind === 'fires') {
          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [item.lon, item.lat] },
            properties: { count: Math.round(item.count), frp_sum: Number(item.frp_sum.toFixed(1)), first: item.first, last: item.last },
          });
        } else {
          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [item.lon, item.lat] },
            properties: {
              aod: item.aodN ? Number((item.aodSum / item.aodN).toFixed(4)) : 0,
              pm25: item.pmN ? Number((item.pmSum / item.pmN).toFixed(2)) : null,
            },
          });
        }
      }
      collections.set(yr, { type: 'FeatureCollection', scope, year: yr, features });
    }
    return collections;
  })();

  csvIndexCache.set(cacheKey, promise);
  return promise;
}

// ---- Public API ---------------------------------------------------------------------------------

/** Parsed data/regions.json (or null). */
export async function getRegions() {
  const regions = await fetchJson(`${BASE}regions.json`);
  if (regions && !regionsSync) regionsSync = regions;
  return regions;
}

export function regionsCached() {
  return regionsSync;
}

function countryEntry(countryId, regions = regionsSync) {
  if (!regions || !Array.isArray(regions.countries)) return null;
  return regions.countries.find((c) => c.id === countryId) || null;
}

export function scopePath(state) {
  const country = countryEntry(state.countryId);
  if (state.view === 'basin' && country && country.basin && country.basin.id) {
    return `${state.countryId}/${country.basin.id}`;
  }
  return state.countryId;
}

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

export async function getScope(state) {
  const regions = await getRegions();
  const country = countryEntry(state.countryId, regions);
  if (!country) return null;
  const view = state.view === 'basin' && country.basin ? 'basin' : 'country';
  const path = view === 'basin' ? `${country.id}/${country.basin.id}` : country.id;
  const key = `scope:${path}`;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const seriesCsv = DATA_CONFIG.mode !== 'geojson' ? resolveCsvSource(path, 'series', '') : null;
      const [geo, rivers, seriesJson, stats, seriesFromCsv] = await Promise.all([
        fetchJson(`${BASE}${path}/geo.geojson`),
        fetchJson(`${BASE}${path}/rivers.geojson`),
        fetchJson(`${BASE}${path}/series.json`),
        fetchJson(`${BASE}${path}/stats.json`),
        seriesCsv ? loadSeriesCsv(seriesCsv, path) : Promise.resolve(null),
      ]);
      return { meta: buildMeta(country, view, regions), geo, rivers, series: seriesFromCsv || seriesJson, stats };
    })());
  }
  return cache.get(key);
}

/** Load geo.geojson for all configured countries (so all 3 countries can be coloured on the map). */
export async function getAllCountriesGeo() {
  const regions = await getRegions();
  if (!regions || !Array.isArray(regions.countries)) return [];
  const list = await Promise.all(regions.countries.map(async (c) => {
    const geo = await fetchJson(`${BASE}${c.id}/geo.geojson`);
    return { country: c, geo };
  }));
  return list.filter((x) => x.geo && Array.isArray(x.geo.features));
}

async function yearLayer(state, folder, year) {
  const y = Number(year);
  if (!Number.isInteger(y)) return null;
  const scope = scopePath(state);
  const isBasin = scope.includes('/');

  if (DATA_CONFIG.mode !== 'geojson') {
    const csvSource = resolveCsvSource(scope, folder, y);
    if (csvSource) {
      const indexed = await loadSpatialCsvByYear(csvSource, folder, scope, isBasin, y);
      if (indexed && indexed.has(y)) return indexed.get(y);
      if (DATA_CONFIG.mode === 'csv') return { type: 'FeatureCollection', scope, year: y, features: [] };
    }
  }
  return fetchJson(`${BASE}${scope}/${folder}/${y}.geojson`);
}

export function getFires(state, year) {
  return yearLayer(state, 'fires', year);
}

export function getAir(state, year) {
  return yearLayer(state, 'air', year);
}

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

export function annualSeries(series, varId, waterBodyId) {
  const v = pickVariable(series, varId, waterBodyId);
  if (!v || !Array.isArray(v.annual)) return [];
  return v.annual.map(([year, value]) => ({ year: Number(year), value: num(value) }));
}

export function monthlySeries(series, varId, waterBodyId) {
  const v = pickVariable(series, varId, waterBodyId);
  if (!v || !Array.isArray(v.monthly)) return [];
  return v.monthly.map(([month, value]) => {
    const [y, m] = String(month).split('-').map(Number);
    return { date: new Date(Date.UTC(y, (m || 1) - 1, 1)), month: String(month), value: num(value) };
  });
}

export function annualValue(series, varId, year, waterBodyId) {
  const row = annualSeries(series, varId, waterBodyId).find((d) => d.year === Number(year));
  return row ? row.value : null;
}
