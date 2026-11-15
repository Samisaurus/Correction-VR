// js/data.js
// Purpose: cached loader for ./data/ (GeoJSON/JSON + streaming large-CSV adapter & grid aggregator)
//          with automatic discovery of copy-pasted csv_by_year folders and basin bbox filtering.

import { DATA_CONFIG } from './data-config.js';

const BASE = './data/';
const cache = new Map();        // url or key -> Promise
const csvIndexCache = new Map(); // cacheKey -> Promise<Map<year, FeatureCollection>>
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

async function fetchJsonOptional(url) {
  if (!cache.has(url)) {
    cache.set(url, (async () => {
      try {
        const res = await fetch(url);
        return res.ok ? await res.json() : null;
      } catch {
        return null;
      }
    })());
  }
  return cache.get(url);
}

async function getManifest() {
  if (typeof fetch !== 'function') return null;
  return fetchJsonOptional(`${BASE}manifest.json`);
}

// ---- Streaming, non-blocking CSV parser & spatial aggregator for 20–60+ MB CSVs ----------------

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

// Fast zero-allocation field extractor for unquoted CSV lines (standard NASA FIRMS rows)
function fastSplit(line, out) {
  out.length = 0;
  let start = 0;
  const len = line.length;
  for (let i = 0; i < len; i += 1) {
    if (line.charCodeAt(i) === 44) {
      out.push(line.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(line.slice(start).trim());
  return out;
}

function resolveColumns(headerLine) {
  const headers = splitCsvRow(headerLine);
  const lower = headers.map((h) => h.toLowerCase().trim());
  const cols = {};
  for (const [k, aliases] of Object.entries(DATA_CONFIG.columns)) {
    let idx = -1;
    for (const alias of aliases) {
      const found = lower.indexOf(alias.toLowerCase());
      if (found >= 0) {
        idx = found;
        break;
      }
    }
    cols[k] = idx;
  }
  return { cols, headers };
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
 * Parse a CSV string in non-blocking chunks and invoke onRow(cells, cols, headers).
 */
export async function parseCsv(text, onRow, chunkRows = DATA_CONFIG.chunkRows) {
  if (!text) return;
  let pos = 0;
  const len = text.length;
  let cols = null;
  let headers = null;
  let count = 0;
  const rowBuf = [];

  while (pos < len) {
    let nl = text.indexOf('\n', pos);
    if (nl < 0) nl = len;
    const rawLine = text.slice(pos, nl);
    pos = nl + 1;

    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (!line || !line.trim()) continue;

    if (!cols) {
      ({ cols, headers } = resolveColumns(line));
      continue;
    }

    const cells = line.indexOf('"') >= 0 ? splitCsvRow(line) : fastSplit(line, rowBuf);
    onRow(cells, cols, headers);
    count += 1;
    if (chunkRows > 0 && count % chunkRows === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}

/**
 * Stream a CSV source (URL string or File/Blob) line-by-line via ReadableStream so multi-decade
 * 20–60+ MB FIRMS files never allocate massive intermediate string arrays.
 */
async function streamCsv(source, onRow, chunkRows = DATA_CONFIG.chunkRows) {
  if (!source) return false;
  if (typeof source !== 'string') {
    if (typeof source.text === 'function') {
      await parseCsv(await source.text(), onRow, chunkRows);
      return true;
    }
    return false;
  }

  let res;
  try {
    res = await fetch(source);
  } catch {
    return false;
  }
  if (!res.ok) return false;

  if (!res.body || typeof res.body.getReader !== 'function') {
    await parseCsv(await res.text(), onRow, chunkRows);
    return true;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let carry = '';
  let cols = null;
  let headers = null;
  let rowCount = 0;
  const rowBuf = [];

  const handleLine = (raw) => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (!line || !line.trim()) return;
    if (!cols) {
      ({ cols, headers } = resolveColumns(line));
      return;
    }
    const cells = line.indexOf('"') >= 0 ? splitCsvRow(line) : fastSplit(line, rowBuf);
    onRow(cells, cols, headers);
    rowCount += 1;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = carry + decoder.decode(value, { stream: true });
    let start = 0;
    while (true) {
      const nl = chunk.indexOf('\n', start);
      if (nl < 0) break;
      handleLine(chunk.slice(start, nl));
      start = nl + 1;
      if (chunkRows > 0 && rowCount > 0 && rowCount % chunkRows === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    carry = chunk.slice(start);
  }
  carry += decoder.decode();
  if (carry.trim()) handleLine(carry);
  return true;
}

/**
 * Register a runtime CSV override (URL string or browser File/Blob) for any scope + kind ('fires'|'air'|'series').
 */
export function setCsvOverride(scope, kind, source) {
  const key = `${scope}:${kind}`;
  if (!source) csvOverrides.delete(key);
  else csvOverrides.set(key, source);
  for (const k of Array.from(csvIndexCache.keys())) {
    if (k.startsWith(`${key}:`)) csvIndexCache.delete(k);
  }
}

function selectSensorEntries(entries, year) {
  const matches = entries.filter((e) => e.year === null || e.year === year);
  if (!matches.length) return [];
  const pref = DATA_CONFIG.sensorPreference || 'viirs-first';
  if (pref === 'merge') return matches.map((e) => e.url);
  const primary = pref === 'modis-first' ? 'modis' : 'viirs';
  const secondary = primary === 'viirs' ? 'modis' : 'viirs';
  const pickedPrimary = matches.filter((e) => e.sensor === primary);
  if (pickedPrimary.length) return pickedPrimary.map((e) => e.url);
  const pickedSecondary = matches.filter((e) => e.sensor === secondary);
  if (pickedSecondary.length) return pickedSecondary.map((e) => e.url);
  return matches.map((e) => e.url);
}

async function resolveSourcesForYear(scope, kind, year) {
  const override = csvOverrides.get(`${scope}:${kind}`);
  if (override) return { sources: [override], clipBbox: null };

  const scopeCfg = DATA_CONFIG.scopes && DATA_CONFIG.scopes[scope];
  const prop = kind === 'fires' ? 'firesCsv' : kind === 'air' ? 'airCsv' : 'seriesCsv';
  if (scopeCfg && scopeCfg[prop]) {
    return { sources: [scopeCfg[prop].replace('{scope}', scope).replace('{year}', String(year))], clipBbox: null };
  }

  const manifest = await getManifest();
  if (manifest && manifest.scopes) {
    const entry = manifest.scopes[scope];
    if (kind === 'fires') {
      if (entry && Array.isArray(entry.fires) && entry.fires.length) {
        const picked = selectSensorEntries(entry.fires, year);
        if (picked.length) return { sources: picked, clipBbox: null };
      }
      // If a case-study basin has no dedicated fire CSVs, filter the parent country's CSV by basin bbox
      if (scope.includes('/')) {
        const [countryId, basinId] = scope.split('/');
        const parentEntry = manifest.scopes[countryId];
        if (parentEntry && Array.isArray(parentEntry.fires) && parentEntry.fires.length) {
          const picked = selectSensorEntries(parentEntry.fires, year);
          if (picked.length) {
            const c = countryEntry(countryId);
            const bbox = c && c.basin && c.basin.id === basinId && Array.isArray(c.basin.bbox) ? c.basin.bbox : null;
            return { sources: picked, clipBbox: bbox };
          }
        }
      }
      return { sources: [], clipBbox: null };
    }
    const direct = entry && entry[kind];
    return { sources: direct ? [direct] : [], clipBbox: null };
  }

  // Static fallback when no manifest is available
  const pat = DATA_CONFIG.patterns && DATA_CONFIG.patterns[prop];
  return {
    sources: pat ? [pat.replace('{scope}', scope).replace('{year}', String(year))] : [],
    clipBbox: null,
  };
}

async function loadSeriesCsv(sources, scope) {
  const list = Array.isArray(sources) ? sources : [sources];
  if (!list.length) return null;
  const variables = {};
  const waterBodies = {};
  const ensureVar = (bucket, id) => {
    if (!bucket[id]) bucket[id] = { annualMap: new Map(), monthlyMap: new Map() };
    return bucket[id];
  };

  let loadedAny = false;
  for (const src of list) {
    const ok = await streamCsv(src, (cells, cols) => {
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
    if (ok) loadedAny = true;
  }

  if (!loadedAny) return null;
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
  const finalized = finalize(variables);
  if (!Object.keys(finalized).length && !Object.keys(wbOut).length) return null;
  return { scope, variables: finalized, waterBodies: wbOut };
}

function topKeyFromCounts(map) {
  let bestKey = null;
  let bestVal = -1;
  for (const [k, v] of map.entries()) {
    if (v > bestVal) {
      bestVal = v;
      bestKey = k;
    }
  }
  return bestKey ? { name: bestKey, value: bestVal } : null;
}

async function loadSummaryData(entry) {
  if (!entry || (!entry.summaryByYear && !entry.summaryByForest)) return null;
  const byYear = new Map();
  const topForests = [];

  if (entry.summaryByYear) {
    await streamCsv(entry.summaryByYear, (cells, cols, headers) => {
      const yr = parseYear(cols.year >= 0 ? cells[cols.year] : undefined, undefined);
      if (!Number.isInteger(yr)) return;
      const idxOf = (name) => headers.findIndex((h) => h.toLowerCase() === name);
      const getN = (name) => {
        const idx = idxOf(name);
        return idx >= 0 ? (toNum(cells[idx]) ?? 0) : 0;
      };
      const modisHigh = getN('modis_high_frp');
      const modisLow = getN('modis_low_frp');
      const viirsHigh = getN('viirs_high_frp');
      const viirsLow = getN('viirs_low_frp');
      const modisTotal = getN('modis_total') || (modisHigh + modisLow);
      const viirsTotal = getN('viirs_total') || (viirsHigh + viirsLow);
      const allTotal = getN('all_total') || (modisTotal + viirsTotal);
      byYear.set(yr, {
        year: yr,
        modisTotal,
        viirsTotal,
        allTotal,
        modisHighFrp: modisHigh,
        viirsHighFrp: viirsHigh,
      });
    }, 0);
  }

  if (entry.summaryByForest) {
    await streamCsv(entry.summaryByForest, (cells, cols, headers) => {
      const idxOf = (name) => headers.findIndex((h) => h.toLowerCase() === name);
      const fIdx = cols.forest >= 0 ? cols.forest : idxOf('forest_name');
      const sIdx = cols.state >= 0 ? cols.state : idxOf('state');
      const tIdx = idxOf('total');
      const mIdx = idxOf('max_frp_mw');
      const name = fIdx >= 0 ? String(cells[fIdx] || '').trim() : '';
      const state = sIdx >= 0 ? String(cells[sIdx] || '').trim() : '';
      const total = tIdx >= 0 ? (toNum(cells[tIdx]) ?? 0) : 0;
      const maxFrpMw = mIdx >= 0 ? (toNum(cells[mIdx]) ?? 0) : 0;
      if (name && total > 0 && topForests.length < 15) {
        topForests.push({ name, state, total, maxFrpMw });
      }
    }, 0);
  }

  const totals = Array.from(byYear.values()).map((d) => d.allTotal).filter((v) => v > 0).sort((a, b) => a - b);
  const quantile = (q) => {
    if (!totals.length) return null;
    const pos = Math.min(totals.length - 1, Math.max(0, Math.floor(q * (totals.length - 1))));
    return totals[pos];
  };
  return {
    byYear,
    topForests,
    medianTotal: quantile(0.5),
    p75Total: quantile(0.75),
    p90Total: quantile(0.9),
  };
}

async function loadSpatialCsvByYear(sources, kind, scope, isBasin, defaultYear, clipBbox) {
  const sourceKey = sources.map((s) => (typeof s === 'string' ? s : 'blob')).join('|');
  const bboxKey = clipBbox ? clipBbox.join(',') : '';
  const cacheKey = `${scope}:${kind}:${sourceKey}:${bboxKey}`;
  if (csvIndexCache.has(cacheKey)) return csvIndexCache.get(cacheKey);

  const promise = (async () => {
    const gridDeg = kind === 'fires'
      ? (isBasin ? DATA_CONFIG.gridDeg.basinFires : DATA_CONFIG.gridDeg.countryFires)
      : (isBasin ? DATA_CONFIG.gridDeg.basinAir : DATA_CONFIG.gridDeg.countryAir);

    const byYear = new Map();
    const statsByYear = new Map();
    const minLon = clipBbox ? clipBbox[0] : -Infinity;
    const minLat = clipBbox ? clipBbox[1] : -Infinity;
    const maxLon = clipBbox ? clipBbox[2] : Infinity;
    const maxLat = clipBbox ? clipBbox[3] : Infinity;

    const getStats = (yr, src) => {
      let s = statsByYear.get(yr);
      if (!s) {
        const lowerSrc = typeof src === 'string' ? src.toLowerCase() : '';
        const sensor = lowerSrc.includes('viirs') ? 'VIIRS' : lowerSrc.includes('modis') ? 'MODIS' : null;
        s = {
          detections: 0,
          totalFrpMw: 0,
          maxFrpMw: 0,
          sensor,
          stateCounts: new Map(),
          forestCounts: new Map(),
        };
        statsByYear.set(yr, s);
      }
      return s;
    };

    for (const src of sources) {
      await streamCsv(src, (cells, cols) => {
        const lat = cols.lat >= 0 ? toNum(cells[cols.lat]) : null;
        const lon = cols.lon >= 0 ? toNum(cells[cols.lon]) : null;
        if (lat === null || lon === null) return;
        if (lat < minLat || lat > maxLat || lon < minLon || lon > maxLon) return;

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
          const dateStr = cols.date >= 0 ? (cells[cols.date] || `${yr}-07-01`) : `${yr}-07-01`;
          const cur = yearMap.get(key);
          if (!cur) {
            yearMap.set(key, { lon: snapLon, lat: snapLat, count, frp_sum: frp, first: dateStr, last: dateStr });
          } else {
            cur.count += count;
            cur.frp_sum += frp;
            if (dateStr < cur.first) cur.first = dateStr;
            if (dateStr > cur.last) cur.last = dateStr;
          }

          const st = getStats(yr, src);
          st.detections += count;
          st.totalFrpMw += frp;
          if (frp > st.maxFrpMw) st.maxFrpMw = frp;
          if (cols.state >= 0) {
            const stateName = String(cells[cols.state] || '').trim();
            if (stateName) st.stateCounts.set(stateName, (st.stateCounts.get(stateName) || 0) + count);
          }
          if (cols.forest >= 0) {
            const fName = String(cells[cols.forest] || '').trim();
            if (fName && !fName.startsWith('Other forest land')) {
              st.forestCounts.set(fName, (st.forestCounts.get(fName) || 0) + count);
            }
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
    }

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
      const st = statsByYear.get(yr);
      const summary = st ? {
        detections: Math.round(st.detections),
        totalFrpMw: Math.round(st.totalFrpMw),
        maxFrpMw: Math.round(st.maxFrpMw),
        sensor: st.sensor,
        topState: topKeyFromCounts(st.stateCounts),
        topForest: topKeyFromCounts(st.forestCounts),
      } : null;
      collections.set(yr, { type: 'FeatureCollection', scope, year: yr, features, summary });
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
  const common = { years: regions.years };
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
      const csvOnly = DATA_CONFIG.mode === 'csv';
      const [resolvedSeries, manifest] = await Promise.all([
        DATA_CONFIG.mode !== 'geojson' ? resolveSourcesForYear(path, 'series', '') : Promise.resolve({ sources: [] }),
        getManifest(),
      ]);
      const mEntry = manifest && manifest.scopes ? manifest.scopes[path] : null;
      const [geo, rivers, seriesJson, stats, seriesFromCsv, summary] = await Promise.all([
        fetchJson(`${BASE}${path}/geo.geojson`),
        fetchJson(`${BASE}${path}/rivers.geojson`),
        csvOnly ? Promise.resolve(null) : fetchJson(`${BASE}${path}/series.json`),
        csvOnly ? Promise.resolve(null) : fetchJson(`${BASE}${path}/stats.json`),
        resolvedSeries.sources.length ? loadSeriesCsv(resolvedSeries.sources, path) : Promise.resolve(null),
        DATA_CONFIG.mode !== 'geojson' ? loadSummaryData(mEntry) : Promise.resolve(null),
      ]);

      let mergedSeries = seriesFromCsv || seriesJson;
      if (summary && summary.byYear && summary.byYear.size) {
        if (!mergedSeries) mergedSeries = { scope: path, variables: {}, waterBodies: {} };
        if (!mergedSeries.variables.fire_count) {
          const [y0, y1] = Array.isArray(regions.years) ? regions.years : [2012, 2025];
          const annual = [];
          for (const row of Array.from(summary.byYear.values()).sort((a, b) => a.year - b.year)) {
            if (row.year >= y0 && row.year <= y1) {
              annual.push([row.year, row.allTotal || row.viirsTotal || row.modisTotal]);
            }
          }
          if (annual.length) mergedSeries.variables.fire_count = { annual, monthly: [] };
        }
      }

      const fireEntries = mEntry && Array.isArray(mEntry.fires)
        ? mEntry.fires
        : (view === 'basin' && manifest && manifest.scopes && manifest.scopes[country.id] && manifest.scopes[country.id].fires) || [];
      return {
        meta: buildMeta(country, view, regions),
        geo,
        rivers,
        series: mergedSeries,
        stats,
        summary,
        hasFireCsvs: fireEntries.length > 0,
      };
    })());
  }
  return cache.get(key);
}

/** Load accurate 50m country borders (falls back cleanly to 50m data/<country>/geo.geojson). */
export async function getAllCountriesGeo() {
  const regions = await getRegions();
  if (!regions || !Array.isArray(regions.countries)) return [];
  const bordersFc = (await fetchJsonOptional('./country-borders.geojson'))
    || (await fetchJsonOptional('./public/country-borders.geojson'));
  if (bordersFc && Array.isArray(bordersFc.features) && bordersFc.features.length) {
    const byId = new Map();
    for (const f of bordersFc.features) {
      const id = f && f.properties && f.properties.id;
      if (id) byId.set(id, f);
    }
    const accurate = regions.countries
      .map((c) => {
        const feat = byId.get(c.id);
        if (!feat) return null;
        return {
          country: c,
          geo: {
            type: 'FeatureCollection',
            features: [{ ...feat, properties: { ...feat.properties, kind: 'country' } }],
          },
        };
      })
      .filter(Boolean);
    if (accurate.length === regions.countries.length) return accurate;
  }
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
    const { sources, clipBbox } = await resolveSourcesForYear(scope, folder, y);
    if (sources.length) {
      const indexed = await loadSpatialCsvByYear(sources, folder, scope, isBasin, y, clipBbox);
      if (indexed && indexed.has(y)) return indexed.get(y);
    }
    if (DATA_CONFIG.mode === 'csv') return { type: 'FeatureCollection', scope, year: y, features: [] };
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

const seriesIndexCache = new WeakMap();

function getIndexedVariable(series, varId, waterBodyId) {
  const v = pickVariable(series, varId, waterBodyId);
  if (!v) return null;
  let perSeries = seriesIndexCache.get(series);
  if (!perSeries) {
    perSeries = new Map();
    seriesIndexCache.set(series, perSeries);
  }
  const key = `${waterBodyId || ''}:${varId}`;
  let entry = perSeries.get(key);
  if (entry) return entry;

  const annual = Array.isArray(v.annual)
    ? v.annual.map(([year, value]) => ({ year: Number(year), value: num(value) }))
    : [];
  const annualMap = new Map();
  const valid = [];
  for (let i = 0; i < annual.length; i += 1) {
    annualMap.set(annual[i].year, annual[i].value);
    if (annual[i].value !== null) valid.push(annual[i].value);
  }
  valid.sort((a, b) => a - b);
  let median = null;
  if (valid.length) {
    const mid = valid.length >> 1;
    median = valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
  }
  const monthly = Array.isArray(v.monthly)
    ? v.monthly.map(([month, value]) => {
      const [y, m] = String(month).split('-').map(Number);
      return { date: new Date(Date.UTC(y, (m || 1) - 1, 1)), month: String(month), value: num(value) };
    })
    : [];

  entry = { annual, annualMap, monthly, median };
  perSeries.set(key, entry);
  return entry;
}

export function annualSeries(series, varId, waterBodyId) {
  const entry = getIndexedVariable(series, varId, waterBodyId);
  return entry ? entry.annual : [];
}

export function monthlySeries(series, varId, waterBodyId) {
  const entry = getIndexedVariable(series, varId, waterBodyId);
  return entry ? entry.monthly : [];
}

export function annualValue(series, varId, year, waterBodyId) {
  const entry = getIndexedVariable(series, varId, waterBodyId);
  if (!entry) return null;
  const val = entry.annualMap.get(Number(year));
  return val === undefined ? null : val;
}

export function annualMedian(series, varId, waterBodyId) {
  const entry = getIndexedVariable(series, varId, waterBodyId);
  return entry ? entry.median : null;
}
