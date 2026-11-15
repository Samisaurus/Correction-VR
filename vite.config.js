import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { defineConfig } from 'vite';

const SCOPE_PATTERNS = [
  { scope: 'canada', match: ['canada', 'can_'] },
  { scope: 'usa', match: ['usa', 'united_states', 'u.s.'] },
  { scope: 'russia', match: ['russia', 'rus_'] },
];

function readZipEntries(filePath, filterFn = () => true) {
  const buf = fs.readFileSync(filePath);
  let eocd = -1;
  const minOffset = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minOffset; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const out = [];
  let ptr = cdOffset;
  const cdEnd = Math.min(buf.length, cdOffset + cdSize);
  while (ptr + 46 <= cdEnd && buf.readUInt32LE(ptr) === 0x02014b50) {
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const uncompSize = buf.readUInt32LE(ptr + 24);
    const fnLen = buf.readUInt16LE(ptr + 28);
    const exLen = buf.readUInt16LE(ptr + 30);
    const cmLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + fnLen);
    if (!name.startsWith('__MACOSX/') && filterFn(name)) {
      out.push({ name, method, compSize, uncompSize, localOffset, buf });
    }
    ptr += 46 + fnLen + exLen + cmLen;
  }
  return out;
}

function inflateZipEntry(entry, filePath) {
  const { buf, localOffset, compSize, method } = entry;
  if (buf.readUInt32LE(localOffset) !== 0x04034b50) return null;
  const fnLen = buf.readUInt16LE(localOffset + 26);
  const exLen = buf.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + fnLen + exLen;
  const slice = buf.subarray(start, start + compSize);
  if (method === 0) return slice;
  if (method === 8) return zlib.inflateRawSync(slice);
  throw new Error(`Unsupported zip compression method ${method} in ${filePath}`);
}

function zipHasCsvDataRows(filePath) {
  try {
    const entries = readZipEntries(filePath, (n) => n.toLowerCase().endsWith('.csv'));
    return entries.some((e) => e.uncompSize > 120);
  } catch {
    return false;
  }
}

function readZipFirstCsvBuffer(filePath) {
  const entries = readZipEntries(filePath, (n) => n.toLowerCase().endsWith('.csv'));
  if (!entries.length) return null;
  return inflateZipEntry(entries[0], filePath);
}

function decodeXmlEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function readXlsxSheets(filePath) {
  const entries = readZipEntries(filePath);
  const byName = new Map();
  for (const e of entries) {
    const raw = inflateZipEntry(e, filePath);
    if (raw) byName.set(e.name, raw.toString('utf8'));
  }

  const sharedStrings = [];
  const sstXml = byName.get('xl/sharedStrings.xml');
  if (sstXml) {
    const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = siRe.exec(sstXml))) {
      const parts = [];
      const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
      let tm;
      while ((tm = tRe.exec(m[1]))) parts.push(decodeXmlEntities(tm[1]));
      sharedStrings.push(parts.join(''));
    }
  }

  const rels = new Map();
  const relsXml = byName.get('xl/_rels/workbook.xml.rels') || '';
  const relRe = /<Relationship\b([^>]*)\/>/g;
  let rm;
  while ((rm = relRe.exec(relsXml))) {
    const id = (rm[1].match(/\bId="([^"]+)"/) || [])[1];
    const target = (rm[1].match(/\bTarget="([^"]+)"/) || [])[1];
    if (id && target) {
      const normTarget = target.replace(/^\/+/, '');
      rels.set(id, normTarget.startsWith('xl/') ? normTarget : `xl/${normTarget}`);
    }
  }

  const parseSheetRows = (xml) => {
    const rows = [];
    const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
    let rMatch;
    while ((rMatch = rowRe.exec(xml))) {
      const cells = [];
      const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
      let cMatch;
      while ((cMatch = cellRe.exec(rMatch[1]))) {
        const attrs = cMatch[1];
        const inner = cMatch[2];
        const ref = (attrs.match(/\br="([A-Z]+)\d+"/) || [])[1] || '';
        const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || '';
        let colIdx = 0;
        for (let i = 0; i < ref.length; i += 1) colIdx = colIdx * 26 + (ref.charCodeAt(i) - 64);
        let val = '';
        const inlineM = inner.match(/<is>[\s\S]*?<t\b[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/);
        const valM = inner.match(/<v>([\s\S]*?)<\/v>/);
        if (inlineM) val = decodeXmlEntities(inlineM[1]);
        else if (type === 's' && valM) val = sharedStrings[Number(valM[1])] ?? '';
        else if (valM) val = decodeXmlEntities(valM[1]);
        const targetIdx = colIdx > 0 ? colIdx - 1 : cells.length;
        while (cells.length < targetIdx) cells.push('');
        cells[targetIdx] = val.trim();
      }
      if (cells.some(Boolean)) rows.push(cells);
    }
    return rows;
  };

  const sheets = new Map();
  const wbXml = byName.get('xl/workbook.xml') || '';
  const shRe = /<sheet\b([^>]*)\/>/g;
  let sm;
  while ((sm = shRe.exec(wbXml))) {
    const name = decodeXmlEntities((sm[1].match(/\bname="([^"]+)"/) || [])[1] || '');
    const rId = (sm[1].match(/\br:id="([^"]+)"/) || [])[1] || '';
    const sheetPath = rels.get(rId);
    const xml = sheetPath ? byName.get(sheetPath) : null;
    if (name && xml) sheets.set(name.toLowerCase(), parseSheetRows(xml));
  }
  return sheets;
}

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
        summaryXlsx: null,
        viirsOutageDays: null,
        pre2012SmallFires: null,
        emissionsByYear: null,
        emissionsByRegionYear: null,
        emissionsByForestYear: null,
        emissionsByYearFiles: [],
      };
    }
    return scopes[s];
  };

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'fire-grid' || ent.name === 'air-grid') continue;
        walk(full);
        continue;
      }
      if (!ent.isFile()) continue;
      const lower = ent.name.toLowerCase();
      const isCsv = lower.endsWith('.csv');
      const isZip = lower.endsWith('.zip');
      const isXlsx = lower.endsWith('.xlsx');
      if (!isCsv && !isZip && !isXlsx) continue;

      const rel = path.relative(dataRoot, full).replace(/\\/g, '/');
      const relLower = rel.toLowerCase();
      const scope = detectScope(rel, ent.name);
      if (!scope) continue;

      if (isXlsx) {
        if (lower.includes('summary')) {
          ensure(scope).summaryXlsx = `./data/${rel}`;
        }
        continue;
      }

      if (isCsv ? !csvHasDataRows(full) : !zipHasCsvDataRows(full)) continue;

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
      } else if (lower.includes('pre2012_small_fires')) {
        bucket.pre2012SmallFires = url;
      } else if (lower.includes('emissions_by_forest_year')) {
        bucket.emissionsByForestYear = url;
      } else if (lower.includes('emissions_by_region_year')) {
        bucket.emissionsByRegionYear = url;
      } else if (lower.includes('emissions_by_year')) {
        bucket.emissionsByYear = url;
      } else if (lower.includes('emissions') || relLower.includes('fire_emissions')) {
        const yearMatch = ent.name.match(/(?:^|[_-])((?:19|20)\d{2})(?:[_.-]|$)/);
        const year = yearMatch ? Number(yearMatch[1]) : null;
        const gridUrl = year ? `./data/air-grid/${scope}-${year}.json` : undefined;
        bucket.emissionsByYearFiles.push({ url, year, file: ent.name, ...(gridUrl ? { gridUrl } : {}) });
      } else if (lower.includes('summary')) {
        continue;
      } else if (lower === 'air.csv' || /(?:^|\/)air(?:\/|_)/.test(relLower)) {
        bucket.air = url;
      } else if (lower === 'fires.csv' || relLower.includes('csv_by_year/') || lower.includes('viirs') || lower.includes('modis') || lower.includes('fire')) {
        const yearMatch = ent.name.match(/(?:^|[_-])((?:19|20)\d{2})(?:[_.-]|$)/);
        const year = yearMatch ? Number(yearMatch[1]) : null;
        const sensor = lower.includes('viirs') ? 'viirs' : lower.includes('modis') ? 'modis' : 'other';
        const gridUrl = year ? `./data/fire-grid/${scope}-${year}.json` : undefined;
        bucket.fires.push({ url, year, sensor, file: ent.name, ...(isZip ? { format: 'zip' } : {}), ...(gridUrl ? { gridUrl } : {}) });
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

function parseCsvBufferSync(buf, onRow) {
  let pos = 0;
  let headers = null;
  let idx = null;
  const len = buf.length;
  while (pos < len) {
    let nl = buf.indexOf(10, pos);
    if (nl < 0) nl = len;
    const end = nl > pos && buf[nl - 1] === 13 ? nl - 1 : nl;
    const line = buf.toString('utf8', pos, end);
    pos = nl + 1;
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

function parseCsvSync(filePath, onRow) {
  const buf = fs.readFileSync(filePath);
  parseCsvBufferSync(buf, onRow);
}

function resolveFile(dataRoot, relUrl) {
  return path.join(dataRoot, relUrl.replace(/^\.\/data\//, ''));
}

function createFireAccumulator() {
  return {
    modisAnnualCount: new Map(),
    modisMonthlyCount: new Map(),
    viirsAnnualCount: new Map(),
    viirsMonthlyCount: new Map(),
    annualFrp: new Map(),
    monthlyFrp: new Map(),
    yearDetails: new Map(),
  };
}

function getYearDetail(acc, yr) {
  let d = acc.yearDetails.get(yr);
  if (!d) {
    d = {
      detections: 0,
      modisTotal: 0,
      viirsTotal: 0,
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
      modisTotal: d.modisTotal,
      viirsTotal: d.viirsTotal,
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
      hasSpatialGrid: true,
      topStates,
      topForests,
      topNationalForests,
    };
  }

  const series = {
    fire_frp: {
      annual: toSortedPairs(acc.annualFrp, true),
      monthly: toSortedPairs(acc.monthlyFrp, true),
    },
  };
  if (acc.modisAnnualCount.size > 0) {
    series.fire_count = {
      annual: toSortedPairs(acc.modisAnnualCount, false),
      monthly: toSortedPairs(acc.modisMonthlyCount, false),
    };
  }
  if (acc.viirsAnnualCount.size > 0) {
    series.viirs_count = {
      annual: toSortedPairs(acc.viirsAnnualCount, false),
      monthly: toSortedPairs(acc.viirsMonthlyCount, false),
    };
  }

  return { series, years };
}

export function buildScopeIndex(dataRoot = path.resolve('data'), options = {}) {
  const manifest = buildDataManifest(dataRoot);
  const writeGrids = Boolean(options && options.writeGrids);
  const scopes = {};

  if (writeGrids) {
    const fireGridDir = path.join(dataRoot, 'fire-grid');
    if (fs.existsSync(fireGridDir)) {
      for (const f of fs.readdirSync(fireGridDir)) {
        if (/-(fraser|yukon|amur)-/i.test(f)) fs.unlinkSync(path.join(fireGridDir, f));
      }
    }
  }

  for (const [scopeKey, entry] of Object.entries(manifest.scopes)) {
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

    const countryAcc = createFireAccumulator();

    const ingestRow = (acc, yr, ym, frp, frpClass, inNf, sat, dn, stateName, forestName, sensorLabel) => {
      if (sensorLabel === 'VIIRS') {
        acc.viirsAnnualCount.set(yr, (acc.viirsAnnualCount.get(yr) || 0) + 1);
        if (ym) acc.viirsMonthlyCount.set(ym, (acc.viirsMonthlyCount.get(ym) || 0) + 1);
      } else {
        acc.modisAnnualCount.set(yr, (acc.modisAnnualCount.get(yr) || 0) + 1);
        if (ym) acc.modisMonthlyCount.set(ym, (acc.modisMonthlyCount.get(ym) || 0) + 1);
      }
      acc.annualFrp.set(yr, (acc.annualFrp.get(yr) || 0) + frp);
      if (ym) acc.monthlyFrp.set(ym, (acc.monthlyFrp.get(ym) || 0) + frp);
      const d = getYearDetail(acc, yr);
      if (!d.sensor && sensorLabel) d.sensor = sensorLabel;
      d.detections += 1;
      if (sensorLabel === 'VIIRS') d.viirsTotal += 1;
      else d.modisTotal += 1;
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

    const addGridPoint = (gridMap, gridDeg, lat, lon, frp, isHighFrp, dateStr, stateName, forestName) => {
      const snapLat = Math.floor(lat / gridDeg) * gridDeg + gridDeg / 2;
      const snapLon = Math.floor(lon / gridDeg) * gridDeg + gridDeg / 2;
      const key = `${snapLon.toFixed(4)},${snapLat.toFixed(4)}`;
      const cur = gridMap.get(key);
      if (!cur) {
        gridMap.set(key, {
          lon: snapLon,
          lat: snapLat,
          count: 1,
          frp_sum: frp,
          max_frp: frp,
          high_frp: isHighFrp ? 1 : 0,
          first: dateStr,
          last: dateStr,
          state: stateName,
          forest: forestName,
        });
      } else {
        cur.count += 1;
        cur.frp_sum += frp;
        if (frp > cur.max_frp) {
          cur.max_frp = frp;
          if (stateName) cur.state = stateName;
          if (forestName) cur.forest = forestName;
        }
        if (isHighFrp) cur.high_frp += 1;
        if (dateStr && dateStr < cur.first) cur.first = dateStr;
        if (dateStr && dateStr > cur.last) cur.last = dateStr;
      }
    };

    for (const item of pickedFiles) {
      const full = resolveFile(dataRoot, item.url);
      if (!fs.existsSync(full)) continue;
      const sensorLabel = item.sensor === 'viirs' ? 'VIIRS' : item.sensor === 'modis' ? 'MODIS' : null;
      const buf = item.format === 'zip' ? readZipFirstCsvBuffer(full) : fs.readFileSync(full);
      if (!buf) continue;
      const buildGrid = writeGrids && Number.isInteger(item.year);
      const cGrid = buildGrid ? new Map() : null;

      parseCsvBufferSync(buf, (cells, idx) => {
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
        const iSt = col(['state', 'province', 'region']);
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
        const dateStr = rawDate || `${yr}-07-01`;

        ingestRow(countryAcc, yr, ym, frp, frpClass, inNf, sat, dn, stateName, forestName, sensorLabel);
        if (cGrid) addGridPoint(cGrid, 0.2, lat, lon, frp, frpClass === 'high', dateStr, stateName, forestName);
      });

      if (cGrid && cGrid.size) {
        const gridDir = path.join(dataRoot, 'fire-grid');
        fs.mkdirSync(gridDir, { recursive: true });
        const fc = {
          type: 'FeatureCollection',
          scope: scopeKey,
          year: item.year,
          gridDeg: 0.2,
          summary: { sensor: sensorLabel },
          features: Array.from(cGrid.values()).map((it) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [it.lon, it.lat] },
            properties: {
              count: it.count,
              frp_sum: Number(it.frp_sum.toFixed(1)),
              max_frp: Number(it.max_frp.toFixed(1)),
              high_frp: it.high_frp,
              first: it.first,
              last: it.last,
              state: it.state || undefined,
              forest: it.forest || undefined,
            },
          })),
        };
        fs.writeFileSync(path.join(gridDir, `${scopeKey}-${item.year}.json`), JSON.stringify(fc));
      }
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
            state: getS('state') || getS('province'),
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

    // Parse workbook summary (.xlsx) when per-table CSV summaries are not separately provided (e.g. Canada 2002-2026)
    if (entry.summaryXlsx) {
      const fullXlsx = resolveFile(dataRoot, entry.summaryXlsx);
      if (fs.existsSync(fullXlsx)) {
        const sheets = readXlsxSheets(fullXlsx);
        if (!summaryByYear.length && sheets.has('by year')) {
          const rows = sheets.get('by year');
          for (let i = 1; i < rows.length; i += 1) {
            const r = rows[i];
            const yr = Number(r[0]);
            if (!Number.isInteger(yr)) continue;
            summaryByYear.push({
              year: yr,
              modisHighFrp: Number(r[1]) || 0,
              modisLowFrp: Number(r[2]) || 0,
              modisTotal: Number(r[3]) || 0,
              viirsHighFrp: Number(r[4]) || 0,
              viirsLowFrp: Number(r[5]) || 0,
              viirsTotal: Number(r[6]) || 0,
              allTotal: Number(r[7]) || 0,
            });
          }
        }
        if (!allForests.length && sheets.has('by forest')) {
          const rows = sheets.get('by forest');
          for (let i = 1; i < rows.length; i += 1) {
            const r = rows[i];
            const name = String(r[0] || '').trim();
            if (!name || name === 'Total') continue;
            allForests.push({
              name,
              state: String(r[1] || '').trim(),
              modis: Number(r[2]) || 0,
              viirs: Number(r[3]) || 0,
              total: Number(r[4]) || 0,
              maxFrpMw: Number(r[5]) || 0,
            });
          }
        }
        if (!Object.keys(forestYearsByYear).length && sheets.has('by forest and year')) {
          const rows = sheets.get('by forest and year');
          for (let i = 1; i < rows.length; i += 1) {
            const r = rows[i];
            const name = String(r[0] || '').trim();
            const yr = Number(r[1]);
            if (!name || !Number.isInteger(yr)) continue;
            const modis = Number(r[2]) || 0;
            const viirs = Number(r[3]) || 0;
            if (!forestYearsByYear[yr]) forestYearsByYear[yr] = [];
            forestYearsByYear[yr].push([name, modis, viirs]);
          }
          for (const list of Object.values(forestYearsByYear)) {
            list.sort((a, b) => (b[1] + b[2]) - (a[1] + a[2]));
          }
        }
        if (!viirsOutageDates.length && sheets.has('viirs outage days')) {
          const rows = sheets.get('viirs outage days');
          for (let i = 1; i < rows.length; i += 1) {
            const dt = String(rows[i][0] || '').trim();
            if (!/^\d{4}-\d{2}-\d{2}/.test(dt)) continue;
            viirsOutageDates.push(dt);
            const yr = Number(dt.slice(0, 4));
            if (Number.isInteger(yr)) {
              if (!viirsOutageByYear[yr]) viirsOutageByYear[yr] = [];
              viirsOutageByYear[yr].push(dt);
            }
          }
        }
      }
    }

    const SPECIES = ['bc', 'c', 'ch4', 'co2', 'co', 'nmhc', 'nox', 'oc', 'pm25', 'so2', 'tc'];
    const emByYear = {};
    const emByRegionYear = new Map();
    const emByForestYear = new Map();

    if (entry.emissionsByYear) {
      const full = resolveFile(dataRoot, entry.emissionsByYear);
      if (fs.existsSync(full)) {
        parseCsvSync(full, (cells, idx) => {
          const iYr = idx.get('year');
          const yr = iYr !== undefined ? Number(cells[iYr]) : NaN;
          if (!Number.isInteger(yr)) return;
          const rec = {};
          for (const sp of SPECIES) {
            const colIdx = idx.get(`${sp}_tonnes`);
            rec[sp] = colIdx !== undefined ? Number((Number(cells[colIdx]) || 0).toFixed(1)) : 0;
          }
          emByYear[yr] = rec;
        });
      }
    }

    if (entry.emissionsByRegionYear) {
      const full = resolveFile(dataRoot, entry.emissionsByRegionYear);
      if (fs.existsSync(full)) {
        parseCsvSync(full, (cells, idx) => {
          const iYr = idx.get('year');
          const iReg = idx.get('region');
          const yr = iYr !== undefined ? Number(cells[iYr]) : NaN;
          const name = iReg !== undefined ? String(cells[iReg] || '').trim() : '';
          if (!Number.isInteger(yr) || !name) return;
          const rec = { name };
          for (const sp of SPECIES) {
            const colIdx = idx.get(`${sp}_tonnes`);
            rec[sp] = colIdx !== undefined ? Number((Number(cells[colIdx]) || 0).toFixed(1)) : 0;
          }
          if (!emByRegionYear.has(yr)) emByRegionYear.set(yr, []);
          emByRegionYear.get(yr).push(rec);
        });
      }
    }

    if (entry.emissionsByForestYear) {
      const full = resolveFile(dataRoot, entry.emissionsByForestYear);
      if (fs.existsSync(full)) {
        parseCsvSync(full, (cells, idx) => {
          const iYr = idx.get('year');
          const iReg = idx.get('region');
          const iFor = idx.get('forest_name');
          const yr = iYr !== undefined ? Number(cells[iYr]) : NaN;
          const name = iFor !== undefined ? String(cells[iFor] || '').trim() : '';
          let region = iReg !== undefined ? String(cells[iReg] || '').trim() : '';
          if (!region && name.includes(' - ')) {
            region = name.slice(name.lastIndexOf(' - ') + 3).trim();
          }
          if (!Number.isInteger(yr) || !name) return;
          const iCo2 = idx.get('co2_tonnes');
          const iPm = idx.get('pm25_tonnes');
          const iBc = idx.get('bc_tonnes');
          const iCo = idx.get('co_tonnes');
          const rec = {
            name,
            region,
            co2: iCo2 !== undefined ? Number((Number(cells[iCo2]) || 0).toFixed(1)) : 0,
            pm25: iPm !== undefined ? Number((Number(cells[iPm]) || 0).toFixed(1)) : 0,
            bc: iBc !== undefined ? Number((Number(cells[iBc]) || 0).toFixed(1)) : 0,
            co: iCo !== undefined ? Number((Number(cells[iCo]) || 0).toFixed(1)) : 0,
          };
          if (!emByForestYear.has(yr)) emByForestYear.set(yr, []);
          emByForestYear.get(yr).push(rec);
        });
      }
    }

    // Aggregate pixel-level spatial CAMS GFAS emissions CSVs into air-grid JSONs + monthly CO2/PM2.5 traces,
    // AND recover MODIS point grids + monthly detection counts for any year missing a separate point CSV (e.g. Canada 2015-2019, 2021-2022)
    const coveredFireYears = new Set(pickedFiles.map((f) => f.year).filter(Boolean));
    const emMonthlyCo2 = new Map();
    const emMonthlyPm25 = new Map();
    const fallbackModisByYear = new Map();
    for (const emItem of entry.emissionsByYearFiles || []) {
      const full = resolveFile(dataRoot, emItem.url);
      if (!fs.existsSync(full)) continue;
      const aGrid = writeGrids && Number.isInteger(emItem.year) ? new Map() : null;
      const needFireFallback = Number.isInteger(emItem.year) && !coveredFireYears.has(emItem.year);
      const fGrid = writeGrids && needFireFallback ? new Map() : null;
      const fStates = needFireFallback ? new Map() : null;
      const fForests = needFireFallback ? new Map() : null;
      const fMonthly = needFireFallback ? new Map() : null;
      let fDetections = 0;
      const deg = 0.5;
      parseCsvSync(full, (cells, idx) => {
        const iDate = idx.get('date');
        const iLat = idx.get('latitude');
        const iLon = idx.get('longitude');
        const iReg = idx.get('region');
        const iFor = idx.get('forest_name');
        const iCo2 = idx.get('co2_tonnes');
        const iPm = idx.get('pm25_tonnes');
        const iBc = idx.get('bc_tonnes');
        const dt = iDate !== undefined ? (cells[iDate] || '').trim() : '';
        const co2 = iCo2 !== undefined ? (Number(cells[iCo2]) || 0) : 0;
        const pm25 = iPm !== undefined ? (Number(cells[iPm]) || 0) : 0;
        const bc = iBc !== undefined ? (Number(cells[iBc]) || 0) : 0;
        const reg = iReg !== undefined ? (cells[iReg] || '').trim() : '';
        const forest = iFor !== undefined ? (cells[iFor] || '').trim() : '';
        if (dt.length >= 7 && dt[4] === '-') {
          const ym = dt.slice(0, 7);
          emMonthlyCo2.set(ym, (emMonthlyCo2.get(ym) || 0) + co2);
          emMonthlyPm25.set(ym, (emMonthlyPm25.get(ym) || 0) + pm25);
          if (fMonthly) fMonthly.set(ym, (fMonthly.get(ym) || 0) + 1);
        }
        if ((aGrid || fGrid || needFireFallback) && iLat !== undefined && iLon !== undefined) {
          const lat = Number(cells[iLat]);
          const lon = Number(cells[iLon]);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
          if (aGrid) {
            const snapLat = Math.floor(lat / deg) * deg + deg / 2;
            const snapLon = Math.floor(lon / deg) * deg + deg / 2;
            const key = `${snapLon.toFixed(2)},${snapLat.toFixed(2)}`;
            const cur = aGrid.get(key);
            if (!cur) {
              aGrid.set(key, { lon: snapLon, lat: snapLat, co2, pm25, bc, maxPm: pm25, region: reg, forest });
            } else {
              cur.co2 += co2;
              cur.pm25 += pm25;
              cur.bc += bc;
              if (pm25 > cur.maxPm) {
                cur.maxPm = pm25;
                if (reg) cur.region = reg;
                if (forest) cur.forest = forest;
              }
            }
          }
          if (needFireFallback) {
            fDetections += 1;
            if (reg) fStates.set(reg, (fStates.get(reg) || 0) + 1);
            if (forest) fForests.set(forest, { count: ((fForests.get(forest)?.count) || 0) + 1, state: reg });
            if (fGrid) {
              const sLat = Math.floor(lat / 0.2) * 0.2 + 0.1;
              const sLon = Math.floor(lon / 0.2) * 0.2 + 0.1;
              const fKey = `${sLon.toFixed(4)},${sLat.toFixed(4)}`;
              const curF = fGrid.get(fKey);
              const dateStr = dt || `${emItem.year}-07-01`;
              if (!curF) {
                fGrid.set(fKey, { lon: sLon, lat: sLat, count: 1, frp_sum: 0, max_frp: 0, high_frp: 0, first: dateStr, last: dateStr, state: reg, forest });
              } else {
                curF.count += 1;
                if (dateStr < curF.first) curF.first = dateStr;
                if (dateStr > curF.last) curF.last = dateStr;
              }
            }
          }
        }
      });
      if (needFireFallback && fDetections > 0) {
        const topStates = Array.from(fStates.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([name, count]) => ({ name, count, frpMw: 0 }));
        const topForests = Array.from(fForests.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 15)
          .map(([name, s]) => ({ name, state: s.state, count: s.count, frpMw: 0, inNationalForest: !name.startsWith('Other forest land') }));
        fallbackModisByYear.set(emItem.year, {
          detections: fDetections,
          topStates,
          topForests,
          monthly: Array.from(fMonthly.entries()),
        });
        if (fGrid && fGrid.size) {
          const gridDir = path.join(dataRoot, 'fire-grid');
          fs.mkdirSync(gridDir, { recursive: true });
          const fc = {
            type: 'FeatureCollection',
            scope: scopeKey,
            year: emItem.year,
            gridDeg: 0.2,
            summary: { sensor: 'MODIS (GFAS locs)', fromEmissions: true },
            features: Array.from(fGrid.values()).map((it) => ({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [it.lon, it.lat] },
              properties: {
                count: it.count,
                frp_sum: 0,
                max_frp: 0,
                high_frp: 0,
                first: it.first,
                last: it.last,
                state: it.state || undefined,
                forest: it.forest || undefined,
              },
            })),
          };
          fs.writeFileSync(path.join(gridDir, `${scopeKey}-${emItem.year}.json`), JSON.stringify(fc));
        }
      }
      if (aGrid && aGrid.size) {
        const airDir = path.join(dataRoot, 'air-grid');
        fs.mkdirSync(airDir, { recursive: true });
        const fc = {
          type: 'FeatureCollection',
          scope: scopeKey,
          year: emItem.year,
          gridDeg: deg,
          features: Array.from(aGrid.values()).map((it) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [it.lon, it.lat] },
            properties: {
              co2: Number(it.co2.toFixed(1)),
              pm25: Number(it.pm25.toFixed(1)),
              bc: Number(it.bc.toFixed(2)),
              intensity: Number(Math.min(1, Math.log10(1 + it.pm25 / 50) / 3.6).toFixed(3)),
              region: it.region || undefined,
              forest: it.forest || undefined,
            },
          })),
        };
        fs.writeFileSync(path.join(airDir, `${scopeKey}-${emItem.year}.json`), JSON.stringify(fc));
      }
    }

    const finalizeEmissions = (yrMap) => {
      const years = {};
      const yrs = Object.keys(yrMap).map(Number).sort((a, b) => a - b);
      if (!yrs.length && !emByRegionYear.size) return null;
      const targetYrs = yrs.length ? yrs : Array.from(emByRegionYear.keys()).sort((a, b) => a - b);

      for (const yr of targetYrs) {
        const rawRegs = (emByRegionYear.get(yr) || []).slice().sort((a, b) => b.co2 - a.co2);
        let base = yrMap[yr] ? { ...yrMap[yr] } : null;
        if (!base && rawRegs.length) {
          base = {};
          for (const sp of SPECIES) {
            base[sp] = Number(rawRegs.reduce((s, r) => s + (r[sp] || 0), 0).toFixed(1));
          }
        }
        if (!base) continue;
        const rawFors = (emByForestYear.get(yr) || []).slice().sort((a, b) => b.co2 - a.co2);
        years[yr] = {
          ...base,
          topRegions: rawRegs.slice(0, 8).map((r) => ({
            name: r.name, co2: r.co2, pm25: r.pm25, bc: r.bc, co: r.co,
          })),
          topForests: rawFors.slice(0, 8),
        };
      }

      const validYrs = Object.keys(years).map(Number).sort((a, b) => a - b);
      if (!validYrs.length) return null;
      const medians = {};
      const ranksByYear = {};
      for (const yr of validYrs) ranksByYear[yr] = {};
      for (const sp of SPECIES) {
        const vals = validYrs.map((y) => years[y][sp] || 0).filter((v) => v > 0).sort((a, b) => a - b);
        const mid = vals.length >> 1;
        medians[sp] = vals.length ? (vals.length % 2 ? vals[mid] : Number(((vals[mid - 1] + vals[mid]) / 2).toFixed(1))) : 0;
        const ranked = validYrs.slice().sort((a, b) => (years[b][sp] || 0) - (years[a][sp] || 0));
        ranked.forEach((y, i) => {
          ranksByYear[y][sp] = i + 1;
        });
      }

      const monthlyCo2 = Array.from(emMonthlyCo2.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => [k, Number(v.toFixed(1))]);
      const monthlyPm25 = Array.from(emMonthlyPm25.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => [k, Number(v.toFixed(1))]);

      return {
        source: 'Copernicus CAMS GFAS via GWIS',
        yearCount: validYrs.length,
        years,
        medians,
        ranksByYear,
        monthlyCo2,
        monthlyPm25,
      };
    };

    const countryEmissions = finalizeEmissions(emByYear);
    const finalizedCountry = finalizeAccumulator(countryAcc);

    // Ensure MODIS & VIIRS summary counts (e.g. Canada 2002-2026 XLSX) + GFAS MODIS coordinate locations backfill series & year details
    const fireCountMonthlyMap = new Map((finalizedCountry.series.fire_count?.monthly) || []);
    if (fallbackModisByYear.size) {
      const modisAnnMap = new Map((finalizedCountry.series.fire_count?.annual) || []);
      for (const [yr, fb] of fallbackModisByYear.entries()) {
        for (const [ym, c] of fb.monthly) {
          if (!fireCountMonthlyMap.has(ym)) fireCountMonthlyMap.set(ym, c);
        }
        if (!modisAnnMap.has(yr) && fb.detections > 0) modisAnnMap.set(yr, fb.detections);
        if (finalizedCountry.years[yr]) {
          finalizedCountry.years[yr].hasSpatialGrid = true;
          finalizedCountry.years[yr].pointsSource = 'MODIS (GFAS locs)';
          if (!finalizedCountry.years[yr].topStates?.length) finalizedCountry.years[yr].topStates = fb.topStates;
          if (!finalizedCountry.years[yr].topForests?.length) finalizedCountry.years[yr].topForests = fb.topForests;
        } else {
          finalizedCountry.years[yr] = {
            hasSpatialGrid: true,
            pointsSource: 'MODIS (GFAS locs)',
            detections: fb.detections,
            modisTotal: fb.detections,
            viirsTotal: 0,
            totalFrpMw: 0,
            maxFrpMw: 0,
            meanFrpMw: 0,
            highFrpCount: 0,
            lowFrpCount: 0,
            sensor: 'MODIS',
            topStates: fb.topStates,
            topForests: fb.topForests,
            topNationalForests: [],
          };
        }
      }
      finalizedCountry.series.fire_count = {
        annual: Array.from(modisAnnMap.entries()).sort((a, b) => a[0] - b[0]),
        monthly: Array.from(fireCountMonthlyMap.entries()).sort((a, b) => a[0].localeCompare(b[0])),
      };
    }

    if (summaryByYear.length) {
      const modisMap = new Map((finalizedCountry.series.fire_count?.annual) || []);
      const viirsMap = new Map((finalizedCountry.series.viirs_count?.annual) || []);
      for (const row of summaryByYear) {
        if (row.modisTotal > 0 && !modisMap.has(row.year)) modisMap.set(row.year, row.modisTotal);
        if (row.viirsTotal > 0 && !viirsMap.has(row.year)) viirsMap.set(row.year, row.viirsTotal);
        const fb = fallbackModisByYear.get(row.year);
        if (!finalizedCountry.years[row.year] && (row.modisTotal > 0 || row.viirsTotal > 0 || row.allTotal > 0)) {
          const fyRows = forestYearsByYear[row.year] || [];
          finalizedCountry.years[row.year] = {
            summaryOnly: !fb,
            hasSpatialGrid: Boolean(fb),
            ...(fb ? { pointsSource: 'MODIS (GFAS locs)' } : {}),
            detections: row.modisTotal || row.viirsTotal || row.allTotal,
            modisTotal: row.modisTotal,
            viirsTotal: row.viirsTotal,
            allTotal: row.allTotal,
            totalFrpMw: 0,
            maxFrpMw: 0,
            meanFrpMw: 0,
            highFrpCount: row.modisHighFrp || 0,
            lowFrpCount: row.modisLowFrp || 0,
            sensor: row.viirsTotal > 0 ? (row.modisTotal > 0 ? 'MODIS+VIIRS' : 'VIIRS') : 'MODIS',
            topStates: fb ? fb.topStates : [],
            topForests: fyRows.length
              ? fyRows.slice(0, 15).map(([name, m, v]) => ({
                  name,
                  count: m + v,
                  frpMw: 0,
                  inNationalForest: !name.startsWith('Other forest land'),
                }))
              : (fb ? fb.topForests : []),
            topNationalForests: [],
          };
        } else if (finalizedCountry.years[row.year] && fb) {
          finalizedCountry.years[row.year].hasSpatialGrid = true;
          finalizedCountry.years[row.year].summaryOnly = false;
          finalizedCountry.years[row.year].pointsSource = 'MODIS (GFAS locs)';
          if (!finalizedCountry.years[row.year].viirsTotal && row.viirsTotal) finalizedCountry.years[row.year].viirsTotal = row.viirsTotal;
          if (!finalizedCountry.years[row.year].topStates?.length) finalizedCountry.years[row.year].topStates = fb.topStates;
        }
      }
      if (modisMap.size) {
        finalizedCountry.series.fire_count = {
          annual: Array.from(modisMap.entries()).sort((a, b) => a[0] - b[0]),
          monthly: Array.from(fireCountMonthlyMap.entries()).sort((a, b) => a[0].localeCompare(b[0])),
        };
      }
      if (viirsMap.size) {
        finalizedCountry.series.viirs_count = {
          annual: Array.from(viirsMap.entries()).sort((a, b) => a[0] - b[0]),
          monthly: finalizedCountry.series.viirs_count?.monthly || [],
        };
      }
    }

    scopes[scopeKey] = {
      ...finalizedCountry,
      summaryByYear,
      allForests,
      forestYearsByYear,
      viirsOutageDates,
      viirsOutageByYear,
      emissions: countryEmissions,
    };
  }

  return { generatedAt: new Date().toISOString(), scopes };
}

function dataPipelinePlugin() {
  let cachedScopeIndexJson = null;

  const getScopeIndexJson = (preferDisk = false) => {
    if (!cachedScopeIndexJson) {
      const diskPath = path.resolve('data/scope-index.json');
      if (preferDisk && fs.existsSync(diskPath)) {
        cachedScopeIndexJson = fs.readFileSync(diskPath, 'utf8');
      } else {
        cachedScopeIndexJson = JSON.stringify(buildScopeIndex(path.resolve('data'), { writeGrids: true }));
      }
    }
    return cachedScopeIndexJson;
  };

  return {
    name: 'data-manifest-and-copy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const cleanUrl = (req.url || '').split('?')[0];
        if (cleanUrl === '/data/manifest.json') {
          const manifestPath = path.resolve('data/manifest.json');
          const out = fs.existsSync(manifestPath)
            ? fs.readFileSync(manifestPath, 'utf8')
            : JSON.stringify(buildDataManifest(path.resolve('data')));
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(out);
          return;
        }
        if (cleanUrl === '/data/scope-index.json') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(getScopeIndexJson(true));
          return;
        }
        next();
      });
    },
    closeBundle() {
      const src = path.resolve('data');
      const dest = path.resolve('dist/data');
      if (fs.existsSync(src)) {
        cachedScopeIndexJson = null;
        const scopeIndexJson = getScopeIndexJson(false);
        const manifestJson = JSON.stringify(buildDataManifest(src));
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
