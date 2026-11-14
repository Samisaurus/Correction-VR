/*
 * Ember to Ocean — CSV reading and column profiling.
 * No dependencies. Works with comma, semicolon, tab or pipe separated files.
 */
(function () {
  "use strict";

  const MISSING = new Set(["", "na", "n/a", "nan", "null", "none", "-", "--", "..", "…", "?", "nd", "n.d."]);

  function detectDelimiter(text) {
    const firstLine = text.slice(0, 5000).split(/\r?\n/)[0] || "";
    const candidates = [",", ";", "\t", "|"];
    let best = ",", bestCount = 0;
    for (const d of candidates) {
      let count = 0, inQ = false;
      for (const ch of firstLine) {
        if (ch === '"') inQ = !inQ;
        else if (ch === d && !inQ) count++;
      }
      if (count > bestCount) { best = d; bestCount = count; }
    }
    return best;
  }

  /** Parse CSV text into { headers: string[], rows: string[][], delimiter } */
  function parse(text) {
    text = String(text || "").replace(/^﻿/, "");
    const d = detectDelimiter(text);
    const rows = [];
    let row = [], field = "", inQ = false, i = 0;
    const n = text.length;
    while (i < n) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      if (ch === '"') { inQ = true; i++; continue; }
      if (ch === d) { row.push(field); field = ""; i++; continue; }
      if (ch === "\r") { i++; continue; }
      if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += ch; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }

    const nonEmpty = rows.filter(r => r.some(c => c.trim() !== ""));
    if (!nonEmpty.length) return { headers: [], rows: [], delimiter: d };

    const rawHeaders = nonEmpty[0].map(h => h.trim());
    const width = Math.max(...nonEmpty.map(r => r.length));
    const headers = [];
    const seen = {};
    for (let c = 0; c < width; c++) {
      let h = rawHeaders[c] || `Column ${c + 1}`;
      if (seen[h]) { seen[h]++; h = `${h} (${seen[h]})`; } else seen[h] = 1;
      headers.push(h);
    }
    const body = nonEmpty.slice(1).map(r => {
      const out = new Array(width);
      for (let c = 0; c < width; c++) out[c] = (r[c] ?? "").trim();
      return out;
    });
    return { headers, rows: body, delimiter: d };
  }

  function isMissing(s) { return s == null || MISSING.has(String(s).trim().toLowerCase()); }

  /** Convert a cell to a number, or null. Accepts "1,234.5", "12%", "1 234", "3.2e5". */
  function toNumber(s) {
    if (isMissing(s)) return null;
    let t = String(s).trim().replace(/[   ]/g, "");
    if (t.endsWith("%")) t = t.slice(0, -1);
    if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");
    else if (/^[-+]?\d+,\d+$/.test(t)) t = t.replace(",", "."); // decimal comma
    if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return null;
    const v = Number(t);
    return Number.isFinite(v) ? v : null;
  }

  /** Convert a cell to a date-ish object {t, y, m, d} or null. */
  function toDate(s) {
    if (isMissing(s)) return null;
    const t = String(s).trim();
    let m;
    if ((m = t.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?(?:[ T].*)?$/))) {
      return mk(+m[1], +m[2], m[3] ? +m[3] : 1);
    }
    if ((m = t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:[ T].*)?$/))) {
      // ambiguous day/month: assume month/day unless first part > 12
      let a = +m[1], b = +m[2];
      return a > 12 ? mk(+m[3], b, a) : mk(+m[3], a, b);
    }
    if ((m = t.match(/^(\d{4})[- ]?Q([1-4])$/i))) return mk(+m[1], (+m[2] - 1) * 3 + 1, 1);
    if (/[a-z]{3,}/i.test(t) && /\d{4}/.test(t)) {
      const p = Date.parse(t);
      if (!Number.isNaN(p)) { const dt = new Date(p); return mk(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()); }
    }
    return null;
    function mk(y, mo, d) {
      if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1000 || y > 3000) return null;
      return { t: Date.UTC(y, mo - 1, d), y, m: mo, d };
    }
  }

  const X_HINT = /^(year|yr|date|time|period|month|day|datetime|timestamp|acq_date|год|дата|年份?|日期)$|year|date|period|time/i;

  /** Inspect every column and decide on a type: year | date | number | text */
  function profile(table) {
    const { headers, rows } = table;
    const columns = headers.map((name, idx) => {
      let present = 0, nums = 0, ints = 0, dates = 0, yearish = 0;
      const uniq = new Map();
      for (const r of rows) {
        const v = r[idx];
        if (isMissing(v)) continue;
        present++;
        if (uniq.size <= 500) uniq.set(v, (uniq.get(v) || 0) + 1);
        const num = toNumber(v);
        if (num !== null) {
          nums++;
          if (Number.isInteger(num)) { ints++; if (num >= 1800 && num <= 2200 && /^\d{4}$/.test(v)) yearish++; }
        } else if (toDate(v)) dates++;
      }
      let type = "text";
      const share = x => present ? x / present : 0;
      if (present === 0) type = "empty";
      else if (share(yearish) >= 0.95 && (X_HINT.test(name) || idx === 0)) type = "year";
      else if (share(dates) >= 0.9) type = "date";
      else if (share(nums) >= 0.9) type = "number";
      const col = { name, index: idx, type, present, missing: rows.length - present, unique: uniq.size > 500 ? "500+" : uniq.size, uniqueValues: uniq };
      if (type === "number" || type === "year") col.stats = numericStats(rows.map(r => toNumber(r[idx])).filter(v => v !== null));
      if (type === "date") {
        const ts = rows.map(r => toDate(r[idx])).filter(Boolean).map(d => d.t);
        col.range = [Math.min(...ts), Math.max(...ts)];
      }
      return col;
    });

    // Choose the column used as the horizontal axis (time, if any).
    let x = columns.find(c => (c.type === "year" || c.type === "date") && X_HINT.test(c.name))
         || columns.find(c => c.type === "year" || c.type === "date")
         || columns.find(c => c.type === "text")
         || null;

    // Coordinates, if present, are used to place rows on the map.
    const isNum = c => c.type === "number";
    const lat = columns.find(c => isNum(c) && /^(lat|latitude|lat_?dd|y_?lat|decimal_?latitude|широта|纬度)$|latitude/i.test(c.name) && c.stats && c.stats.min >= -90 && c.stats.max <= 90);
    const lon = columns.find(c => isNum(c) && /^(lon|lng|long|longitude|lon_?dd|x_?lon|decimal_?longitude|долгота|经度)$|longitude/i.test(c.name) && c.stats && c.stats.min >= -360 && c.stats.max <= 360);
    const geo = lat && lon ? [lat.index, lon.index] : null;

    return {
      rowCount: rows.length,
      colCount: headers.length,
      columns,
      x: x ? x.index : -1,
      lat: geo ? geo[0] : -1,
      lon: geo ? geo[1] : -1,
      numeric: columns.filter(c => c.type === "number" && (!x || c.index !== x.index) && !(geo && geo.includes(c.index))),
      categorical: columns.filter(c => c.type === "text" && (!x || c.index !== x.index) && typeof c.unique === "number" && c.unique >= 2 && c.unique <= 200)
    };
  }

  function numericStats(vals) {
    if (!vals.length) return null;
    const s = [...vals].sort((a, b) => a - b);
    const sum = s.reduce((a, b) => a + b, 0);
    const mid = s.length >> 1;
    return {
      count: s.length,
      min: s[0],
      max: s[s.length - 1],
      mean: sum / s.length,
      sum,
      median: s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
    };
  }

  window.VR_CSV = { parse, profile, toNumber, toDate, isMissing, numericStats };
})();
