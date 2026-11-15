import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const SCOPE_PATTERNS = [
  { scope: 'canada/fraser', match: ['canada/fraser', 'fraser'] },
  { scope: 'usa/yukon', match: ['usa/yukon', 'yukon'] },
  { scope: 'russia/amur', match: ['russia/amur', 'amur'] },
  { scope: 'canada', match: ['canada', 'can_'] },
  { scope: 'usa', match: ['usa', 'united_states', 'u.s.'] },
  { scope: 'russia', match: ['russia', 'rus_'] },
];

function csvHasDataRows(filePath) {
  let fd;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size === 0) return false;
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(Math.min(stat.size, 1024));
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const lines = buf.subarray(0, n).toString('utf8').split(/\r?\n/).filter((l) => l.trim());
    return lines.length >= 2;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function detectScope(relPath, fileName) {
  const norm = relPath.replace(/\\/g, '/').toLowerCase();
  const base = fileName.toLowerCase();
  for (const entry of SCOPE_PATTERNS) {
    if (norm.startsWith(`${entry.scope}/`)) return entry.scope;
  }
  for (const entry of SCOPE_PATTERNS) {
    if (entry.match.some((m) => norm.includes(m) || base.includes(m))) return entry.scope;
  }
  return null;
}

export function buildDataManifest(dataRoot = path.resolve('data')) {
  const scopes = {};
  const ensure = (s) => {
    if (!scopes[s]) {
      scopes[s] = {
        fires: [],
        air: null,
        series: null,
        summaryByYear: null,
        summaryByForest: null,
        summaryByForestYear: null,
        viirsOutageDays: null,
      };
    }
    return scopes[s];
  };

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (!ent.isFile() || !ent.name.toLowerCase().endsWith('.csv')) continue;
      if (!csvHasDataRows(full)) continue;

      const rel = path.relative(dataRoot, full).replace(/\\/g, '/');
      const relLower = rel.toLowerCase();
      const scope = detectScope(rel, ent.name);
      if (!scope) continue;

      const lower = ent.name.toLowerCase();
      const url = `./data/${rel}`;
      const bucket = ensure(scope);

      if (lower === 'series.csv' || lower.includes('series')) {
        bucket.series = url;
      } else if (lower.includes('summary_by_year')) {
        bucket.summaryByYear = url;
      } else if (lower.includes('summary_by_forest_year')) {
        bucket.summaryByForestYear = url;
      } else if (lower.includes('summary_by_forest')) {
        bucket.summaryByForest = url;
      } else if (lower.includes('outage')) {
        bucket.viirsOutageDays = url;
      } else if (lower.includes('summary')) {
        continue;
      } else if (lower === 'air.csv' || /(?:^|\/)air(?:\/|_)/.test(relLower)) {
        bucket.air = url;
      } else if (lower === 'fires.csv' || relLower.includes('csv_by_year/') || lower.includes('viirs') || lower.includes('modis') || lower.includes('fire')) {
        const yearMatch = ent.name.match(/(?:^|[_-])((?:19|20)\d{2})(?:[_.-]|$)/);
        const year = yearMatch ? Number(yearMatch[1]) : null;
        const sensor = lower.includes('viirs') ? 'viirs' : lower.includes('modis') ? 'modis' : 'other';
        bucket.fires.push({ url, year, sensor, file: ent.name });
      }
    }
  }

  walk(dataRoot);
  return { generatedAt: new Date().toISOString(), scopes };
}

function splitCsvLine(line) {
  if (!line.includes('"')) return line.split(',');
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i += 1; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsvSync(filePath, onRow) {
  const txt = fs.readFileSync(filePath, 'utf8');
  let pos = 0;
  let headers = null;
  let idx = null;
  while (pos < txt.length) {
    let nl = txt.indexOf('\n', pos);
    if (nl < 0) nl = txt.length;
    let line = txt.slice(pos, nl);
    pos = nl + 1;
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (!line) continue;
    const cells = splitCsvLine(line);
    if (!headers) {
      headers = cells.map((h) => h.trim().toLowerCase());
      idx = new Map(headers.map((h, i) => [h, i]));
      continue;
    }
    onRow(cells, idx);
  }
}

function resolveFile(dataRoot, relUrl) {
  return path.join(dataRoot, relUrl.replace(/^\.\/data\//, ''));
}

function createFireAccumulator() {
  return {
    annualCount: new Map(),
    annualFrp: new Map(),
    monthlyCount: new Map(),
    monthlyFrp: new Map(),
    yearDetails: new Map(),
  };
}

function getYearDetail(acc, yr) {
  let d = acc.yearDetails.get(yr);
  if (!d) {
    d = {
      detections: 0,
      totalFrpMw: 0,
      maxFrpMw: 0,
      highFrpCount: 0,
      lowFrpCount: 0,
      inNationalForestCount: 0,
      otherForestCount: 0,
      terraCount: 0,
      aquaCount: 0,
      dayCount: 0,
      nightCount: 0,
      states: new Map(),
      forests: new Map(),
      nationalForests: new Map(),
      sensor: null,
    };
    acc.yearDetails.set(yr, d);
  }
  return d;
}

function finalizeAccumulator(acc) {
  const toSortedPairs = (map, round = false) => Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => [k, round ? Number(v.toFixed(1)) : v]);

  const years = {};
  for (const [yr, d] of Array.from(acc.yearDetails.entries()).sort((a, b) => a[0] - b[0])) {
    const topStates = Array.from(d.states.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 12)
      .map(([name, s]) => ({ name, count: s.count, frpMw: Math.round(s.frp) }));
    const topForests = Array.from(d.forests.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15)
      .map(([name, s]) => ({ name, state: s.state, count: s.count, frpMw: Math.round(s.frp), inNationalForest: s.inNf }));
    const topNationalForests = Array.from(d.nationalForests.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([name, s]) => ({ name, state: s.state, count: s.count, frpMw: Math.round(s.frp) }));
    years[yr] = {
      detections: d.detections,
      totalFrpMw: Math.round(d.totalFrpMw),
      maxFrpMw: Math.round(d.maxFrpMw),
      meanFrpMw: d.detections ? Number((d.totalFrpMw / d.detections).toFixed(1)) : 0,
      highFrpCount: d.highFrpCount,
      lowFrpCount: d.lowFrpCount,
      inNationalForestCount: d.inNationalForestCount,
      otherForestCount: d.otherForestCount,
      terraCount: d.terraCount,
      aquaCount: d.aquaCount,
      dayCount: d.dayCount,
      nightCount: d.nightCount,
      sensor: d.sensor,
      topStates,
      topForests,
      topNationalForests,
    };
  }

  return {
    series: {
      fire_count: {
        annual: toSortedPairs(acc.annualCount, false),
        monthly: toSortedPairs(acc.monthlyCount, false),
      },
      fire_frp: {
        annual: toSortedPairs(acc.annualFrp, true),
        monthly: toSortedPairs(acc.monthlyFrp, true),
      },
    },
    years,
  };
}

export function buildScopeIndex(dataRoot = path.resolve('data')) {
  const manifest = buildDataManifest(dataRoot);
  let regions = null;
  try {
    regions = JSON.parse(fs.readFileSync(path.join(dataRoot, 'regions.json'), 'utf8'));
  } catch {
    regions = null;
  }

  const scopes = {};
  const countryList = (regions && Array.isArray(regions.countries)) ? regions.countries : [];

  for (const [scopeKey, entry] of Object.entries(manifest.scopes)) {
    if (scopeKey.includes('/')) continue;
    const fires = Array.isArray(entry.fires) ? entry.fires : [];
    const byYearEntries = new Map();
    for (const f of fires) {
      const y = f.year || 'all';
      if (!byYearEntries.has(y)) byYearEntries.set(y, []);
      byYearEntries.get(y).push(f);
    }

    const pickedFiles = [];
    for (const list of byYearEntries.values()) {
      const viirs = list.filter((e) => e.sensor === 'viirs');
      if (viirs.length) pickedFiles.push(...viirs);
      else pickedFiles.push(...list);
    }

    const countryMeta = countryList.find((c) => c.id === scopeKey);
    const basin = countryMeta && countryMeta.basin ? countryMeta.basin : null;
    const basinBbox = basin && Array.isArray(basin.bbox) ? basin.bbox : null;
    const basinKey = basin && basin.id ? `${scopeKey}/${basin.id}` : null;

    const countryAcc = createFireAccumulator();
    const basinAcc = basinBbox ? createFireAccumulator() : null;

    const ingestRow = (acc, yr, ym, frp, frpClass, inNf, sat, dn, stateName, forestName, sensorLabel) => {
      acc.annualCount.set(yr, (acc.annualCount.get(yr) || 0) + 1);
      acc.annualFrp.set(yr, (acc.annualFrp.get(yr) || 0) + frp);
      if (ym) {
        acc.monthlyCount.set(ym, (acc.monthlyCount.get(ym) || 0) + 1);
        acc.monthlyFrp.set(ym, (acc.monthlyFrp.get(ym) || 0) + frp);
      }
      const d = getYearDetail(acc, yr);
      if (!d.sensor && sensorLabel) d.sensor = sensorLabel;
      d.detections += 1;
      d.totalFrpMw += frp;
      if (frp > d.maxFrpMw) d.maxFrpMw = frp;
      if (frpClass === 'high') d.highFrpCount += 1;
      else if (frpClass === 'low') d.lowFrpCount += 1;
      if (inNf) d.inNationalForestCount += 1;
      else d.otherForestCount += 1;
      if (sat === 'terra') d.terraCount += 1;
      else if (sat === 'aqua') d.aquaCount += 1;
      if (dn === 'day') d.dayCount += 1;
      else if (dn === 'night') d.nightCount += 1;

      if (stateName) {
        let st = d.states.get(stateName);
        if (!st) { st = { count: 0, frp: 0 }; d.states.set(stateName, st); }
        st.count += 1;
        st.frp += frp;
      }
      if (forestName) {
        let fo = d.forests.get(forestName);
        if (!fo) { fo = { count: 0, frp: 0, state: stateName, inNf }; d.forests.set(forestName, fo); }
        fo.count += 1;
        fo.frp += frp;
        if (inNf || !forestName.startsWith('Other forest land')) {
          let nf = d.nationalForests.get(forestName);
          if (!nf) { nf = { count: 0, frp: 0, state: stateName }; d.nationalForests.set(forestName, nf); }
          nf.count += 1;
          nf.frp += frp;
        }
      }
    };

    for (const item of pickedFiles) {
      const full = resolveFile(dataRoot, item.url);
      if (!fs.existsSync(full)) continue;
      const sensorLabel = item.sensor === 'viirs' ? 'VIIRS' : item.sensor === 'modis' ? 'MODIS' : null;
      parseCsvSync(full, (cells, idx) => {
        const col = (names) => {
          for (const n of names) {
            if (idx.has(n)) return idx.get(n);
          }
          return -1;
        };
        const iLat = col(['latitude', 'lat']);
        const iLon = col(['longitude', 'lon', 'lng']);
        if (iLat < 0 || iLon < 0) return;
        const lat = Number(cells[iLat]);
        const lon = Number(cells[iLon]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        const iYr = col(['year', 'acq_year']);
        const iDate = col(['acq_date', 'date']);
        const iMo = col(['month']);
        const iFrp = col(['frp_mw', 'frp', 'frp_sum']);
        const iFrpCls = col(['frp_class']);
        const iNf = col(['in_national_forest']);
        const iSat = col(['satellite']);
        const iDn = col(['day_night']);
        const iSt = col(['state', 'province']);
        const iFo = col(['forest_name', 'forest']);

        const rawDate = iDate >= 0 ? (cells[iDate] || '').trim() : '';
        let yr = iYr >= 0 ? Number(cells[iYr]) : NaN;
        if (!Number.isInteger(yr) && rawDate.length >= 4) yr = Number(rawDate.slice(0, 4));
        if (!Number.isInteger(yr)) yr = item.year;
        if (!Number.isInteger(yr)) return;

        let ym = null;
        if (rawDate.length >= 7 && rawDate[4] === '-') {
          ym = rawDate.slice(0, 7);
        } else if (iMo >= 0) {
          const m = Number(cells[iMo]);
          if (Number.isInteger(m) && m >= 1 && m <= 12) ym = `${yr}-${String(m).padStart(2, '0')}`;
        }

        const frp = iFrp >= 0 ? (Number(cells[iFrp]) || 0) : 0;
        const frpClass = iFrpCls >= 0 ? (cells[iFrpCls] || '').trim().toLowerCase() : '';
        const inNf = iNf >= 0 ? (cells[iNf] || '').trim().toLowerCase() === 'true' : false;
        const sat = iSat >= 0 ? (cells[iSat] || '').trim().toLowerCase() : '';
        const dn = iDn >= 0 ? (cells[iDn] || '').trim().toLowerCase() : '';
        const stateName = iSt >= 0 ? (cells[iSt] || '').trim() : '';
        const forestName = iFo >= 0 ? (cells[iFo] || '').trim() : '';

        ingestRow(countryAcc, yr, ym, frp, frpClass, inNf, sat, dn, stateName, forestName, sensorLabel);
        if (basinAcc && lon >= basinBbox[0] && lon <= basinBbox[2] && lat >= basinBbox[1] && lat <= basinBbox[3]) {
          ingestRow(basinAcc, yr, ym, frp, frpClass, inNf, sat, dn, stateName, forestName, sensorLabel);
        }
      });
    }

    const summaryByYear = [];
    if (entry.summaryByYear) {
      const full = resolveFile(dataRoot, entry.summaryByYear);
      if (fs.existsSync(full)) {
        parseCsvSync(full, (cells, idx) => {
          const getN = (name) => {
            const i = idx.get(name);
            return i !== undefined ? (Number(cells[i]) || 0) : 0;
          };
          const iYr = idx.get('year');
          const yr = iYr !== undefined ? Number(cells[iYr]) : NaN;
          if (!Number.isInteger(yr)) return;
          summaryByYear.push({
            year: yr,
            modisHighFrp: getN('modis_high_frp'),
            modisLowFrp: getN('modis_low_frp'),
            viirsHighFrp: getN('viirs_high_frp'),
            viirsLowFrp: getN('viirs_low_frp'),
            modisTotal: getN('modis_total'),
            viirsTotal: getN('viirs_total'),
            allTotal: getN('all_total'),
          });
        });
      }
    }

    const allForests = [];
    if (entry.summaryByForest) {
      const full = resolveFile(dataRoot, entry.summaryByForest);
      if (fs.existsSync(full)) {
        parseCsvSync(full, (cells, idx) => {
          const getS = (name) => {
            const i = idx.get(name);
            return i !== undefined ? String(cells[i] || '').trim() : '';
          };
          const getN = (name) => {
            const i = idx.get(name);
            return i !== undefined ? (Number(cells[i]) || 0) : 0;
          };
          const name = getS('forest_name') || getS('forest');
          if (!name) return;
          allForests.push({
            name,
            state: getS('state'),
            modis: getN('modis'),
            viirs: getN('viirs'),
            total: getN('total'),
            maxFrpMw: getN('max_frp_mw'),
          });
        });
      }
    }

    const forestYearsByYear = {};
    if (entry.summaryByForestYear) {
      const full = resolveFile(dataRoot, entry.summaryByForestYear);
      if (fs.existsSync(full)) {
        parseCsvSync(full, (cells, idx) => {
          const getS = (name) => {
            const i = idx.get(name);
            return i !== undefined ? String(cells[i] || '').trim() : '';
          };
          const getN = (name) => {
            const i = idx.get(name);
            return i !== undefined ? (Number(cells[i]) || 0) : 0;
          };
          const name = getS('forest_name') || getS('forest');
          const yr = getN('year');
          if (!name || !Number.isInteger(yr)) return;
          const modis = getN('modis');
          const viirs = getN('viirs');
          if (!forestYearsByYear[yr]) forestYearsByYear[yr] = [];
          forestYearsByYear[yr].push([name, modis, viirs]);
        });
        for (const list of Object.values(forestYearsByYear)) {
          list.sort((a, b) => (b[1] + b[2]) - (a[1] + a[2]));
        }
      }
    }

    const viirsOutageByYear = {};
    const viirsOutageDates = [];
    if (entry.viirsOutageDays) {
      const full = resolveFile(dataRoot, entry.viirsOutageDays);
      if (fs.existsSync(full)) {
        parseCsvSync(full, (cells, idx) => {
          const iDate = idx.get('date');
          const dt = iDate !== undefined ? String(cells[iDate] || '').trim() : '';
          if (!dt) return;
          viirsOutageDates.push(dt);
          const yr = Number(dt.slice(0, 4));
          if (Number.isInteger(yr)) {
            if (!viirsOutageByYear[yr]) viirsOutageByYear[yr] = [];
            viirsOutageByYear[yr].push(dt);
          }
        });
      }
    }

    const finalizedCountry = finalizeAccumulator(countryAcc);
    scopes[scopeKey] = {
      ...finalizedCountry,
      summaryByYear,
      allForests,
      forestYearsByYear,
      viirsOutageDates,
      viirsOutageByYear,
    };
    if (basinAcc && basinKey) {
      scopes[basinKey] = finalizeAccumulator(basinAcc);
    }
  }

  return { generatedAt: new Date().toISOString(), scopes };
}

function dataPipelinePlugin() {
  let cachedScopeIndexJson = null;

  const getScopeIndexJson = () => {
    if (!cachedScopeIndexJson) {
      cachedScopeIndexJson = JSON.stringify(buildScopeIndex(path.resolve('data')));
    }
    return cachedScopeIndexJson;
  };

  return {
    name: 'data-manifest-and-copy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const cleanUrl = (req.url || '').split('?')[0];
        if (cleanUrl === '/data/manifest.json') {
          const manifest = buildDataManifest(path.resolve('data'));
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(manifest));
          return;
        }
        if (cleanUrl === '/data/scope-index.json') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(getScopeIndexJson());
          return;
        }
        next();
      });
    },
    closeBundle() {
      const src = path.resolve('data');
      const dest = path.resolve('dist/data');
      if (fs.existsSync(src)) {
        const manifestJson = JSON.stringify(buildDataManifest(src));
        const scopeIndexJson = getScopeIndexJson();
        fs.writeFileSync(path.join(src, 'manifest.json'), manifestJson);
        fs.writeFileSync(path.join(src, 'scope-index.json'), scopeIndexJson);
        fs.cpSync(src, dest, { recursive: true });
      }
    },
  };
}

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      external: [/^https?:\/\//],
    },
  },
  plugins: [dataPipelinePlugin()],
});
