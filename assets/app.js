/*
 * Ember to Ocean — application logic (routing, pages, data loading).
 * Everything is generated from assets/config.js plus whatever CSV files exist.
 */
(function () {
  "use strict";
  const C = window.VR_CONFIG;
  const CSV = window.VR_CSV;
  const CH = window.VR_CHART;
  const content = document.getElementById("content");

  /* ---------------------------------------------------------------- helpers */
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const country = id => C.countries.find(c => c.id === id);
  const topic = id => C.topics.find(t => t.id === id);
  const catalogId = (c, t) => `VR-${c.code}-${t.code}`;
  const dsTitle = (c, t) => `${t.name} in ${c.name === "United States" ? "the United States" : c.name}`;
  const dsLink = (c, t, sub) => `#/data/${c.id}/${t.id}${sub ? "/" + sub : ""}`;

  function meta(cid, tid) {
    const o = (C.datasets || {})[`${cid}/${tid}`] || {};
    return { file: o.file || `${C.dataRoot}/${cid}/${tid}.csv`, source: o.source, sourceUrl: o.sourceUrl, notes: o.notes };
  }

  function fmtNum(v) {
    if (v == null || Number.isNaN(v)) return "—";
    const a = Math.abs(v);
    if (a >= 1e7) return CH.fmt(v);
    return v.toLocaleString(undefined, { maximumFractionDigits: a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 4 });
  }
  function fmtBytes(n) { return n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(1) + " MB"; }
  function pct(a, b) {
    if (a == null || b == null || a === 0) return "—";
    const p = (b - a) / Math.abs(a) * 100;
    return (p > 0 ? "+" : "") + p.toFixed(1) + "%";
  }

  /* ----------------------------------------------------------- data access */
  const cache = new Map();
  const previews = new Map(); // locally loaded files (session only)

  function build(text, path, extra) {
    const table = CSV.parse(text);
    if (!table.headers.length) return Object.assign({ status: "empty", path }, extra);
    return Object.assign({ status: "ok", path, text, size: new Blob([text]).size, table, profile: CSV.profile(table) }, extra);
  }

  function getDataset(cid, tid) {
    const key = `${cid}/${tid}`;
    if (previews.has(key)) return Promise.resolve(previews.get(key));
    if (cache.has(key)) return cache.get(key);
    const path = meta(cid, tid).file;
    const p = fetch(path, { cache: "no-cache" }).then(async res => {
      const type = res.headers.get("content-type") || "";
      if (!res.ok || type.includes("text/html")) return { status: "missing", path };
      const text = await res.text();
      return build(text, path, { modified: res.headers.get("last-modified") });
    }).catch(err => ({
      status: location.protocol === "file:" ? "offline" : "error",
      path, error: String(err && err.message || err)
    }));
    cache.set(key, p);
    return p;
  }
  const getAll = () => Promise.all(C.countries.flatMap(c => C.topics.map(t => getDataset(c.id, t.id).then(ds => ({ c, t, ds })))));

  /* -------------------------------------------------------------- analysis */
  const AGG = {
    mean: { label: "Average (mean)", f: v => v.reduce((a, b) => a + b, 0) / v.length },
    sum: { label: "Total (sum)", f: v => v.reduce((a, b) => a + b, 0) },
    median: { label: "Median", f: v => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; } },
    min: { label: "Minimum", f: v => Math.min(...v) },
    max: { label: "Maximum", f: v => Math.max(...v) }
  };
  const SUMMABLE = /area|hectare|\bha\b|acre|count|number|total|fires?\b|incident|emission|burn|events?|cases|volume|discharge/i;

  function xColumn(ds) { const p = ds.profile; return p.x >= 0 ? p.columns[p.x] : null; }
  function isTime(col) { return col && (col.type === "year" || col.type === "date"); }

  function defaults(ds) {
    const p = ds.profile, xc = xColumn(ds);
    const m = p.numeric[0];
    let gran = "year";
    if (xc && xc.type === "date") {
      const years = (xc.range[1] - xc.range[0]) / 31557600000;
      gran = years >= 3 ? "year" : years >= 0.2 ? "month" : "day";
    }
    return { metric: m ? m.index : "__count", agg: m && SUMMABLE.test(m.name) ? "sum" : "mean", gran, filterCol: "", filterVal: "" };
  }

  function xFormatter(xc, gran) {
    if (!xc || xc.type === "year") return v => String(v);
    if (gran === "year") return v => String(v);
    if (gran === "month") return v => { const y = Math.floor(v + 1e-9); const m = Math.round((v - y) * 12) + 1; return `${y}-${String(m).padStart(2, "0")}`; };
    return v => new Date(v).toISOString().slice(0, 10);
  }

  /** Group rows along the x column and reduce the chosen metric. */
  function analyse(ds, o) {
    const xc = xColumn(ds);
    const rows = ds.table.rows;
    const groups = new Map();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (o.filterCol !== "" && o.filterCol != null && r[o.filterCol] !== o.filterVal) continue;
      let key, x;
      if (!xc) { key = i; x = i + 1; }
      else if (xc.type === "year") { x = CSV.toNumber(r[xc.index]); if (x == null) continue; key = x; }
      else if (xc.type === "date") {
        const d = CSV.toDate(r[xc.index]); if (!d) continue;
        x = o.gran === "year" ? d.y : o.gran === "month" ? d.y + (d.m - 1) / 12 : d.t; key = x;
      } else { key = r[xc.index]; if (CSV.isMissing(key)) continue; x = groups.has(key) ? groups.get(key).x : groups.size; }
      let g = groups.get(key);
      if (!g) { g = { x, label: xc && xc.type === "text" ? key : null, vals: [], n: 0 }; groups.set(key, g); }
      g.n++;
      if (o.metric !== "__count") { const v = CSV.toNumber(r[o.metric]); if (v != null) g.vals.push(v); }
    }
    const fx = xFormatter(xc, o.gran);
    let points = [...groups.values()].map(g => ({
      x: g.x, label: g.label ?? fx(g.x),
      value: o.metric === "__count" ? g.n : g.vals.length ? AGG[o.agg].f(g.vals) : null, n: g.n
    })).sort((a, b) => a.x - b.x);
    const kind = isTime(xc) || !xc ? "line" : "bar";
    let truncated = false;
    if (kind === "bar" && points.length > 40) {
      points = points.filter(p => p.value != null).sort((a, b) => b.value - a.value).slice(0, 40);
      truncated = true;
    }
    const grouped = [...groups.values()].some(g => g.n > 1);
    return { points, kind, xFormat: fx, truncated, grouped };
  }

  function metricName(ds, metric) { return metric === "__count" ? "Number of records" : ds.table.headers[metric]; }

  function coverage(ds) {
    const xc = xColumn(ds);
    if (!xc) return null;
    if (xc.type === "year") return `${xc.stats.min}–${xc.stats.max}`;
    if (xc.type === "date") return `${new Date(xc.range[0]).toISOString().slice(0, 10)} – ${new Date(xc.range[1]).toISOString().slice(0, 10)}`;
    return `${xc.unique} ${xc.name.toLowerCase()} values`;
  }

  /* ------------------------------------------------------- page scaffolding */
  function tabs(left, right) {
    const t = (arr) => arr.map(x => `<a class="tab${x.on ? " selected" : ""}" href="${esc(x.href || "#")}"${x.download ? ` download` : ""}${x.scroll ? ` data-scroll="${esc(x.scroll)}"` : ""}>${esc(x.label)}</a>`).join("");
    return `<nav class="tabs" aria-label="Page tabs"><div class="tabs-left">${t(left)}</div><div class="tabs-right">${t(right || [])}</div></nav>`;
  }
  function heading(title, sub) {
    return `<h1 class="first-heading">${esc(title)}</h1><div class="site-sub">From ${esc(C.siteName)}, ${esc(C.tagline.charAt(0).toLowerCase() + C.tagline.slice(1))}${sub ? ` · <span class="mono">${esc(sub)}</span>` : ""}</div>`;
  }
  function toc(items) {
    return `<div class="toc" role="navigation"><div class="toc-title">Contents</div><ol>${items.map((it, i) =>
      `<li><a href="#" data-scroll="${esc(it.id)}"><span class="toc-num">${i + 1}</span> ${esc(it.label)}</a></li>`).join("")}</ol></div>`;
  }
  function infobox(title, caption, rows, color) {
    return `<table class="infobox"><caption${color ? ` style="--accent:${color}"` : ""}>${esc(title)}</caption>
      ${caption ? `<tr><td colspan="2" class="infobox-sub">${caption}</td></tr>` : ""}
      ${rows.filter(r => r && r[1] != null && r[1] !== "").map(r => r[0] === "§" ? `<tr><th colspan="2" class="infobox-header">${esc(r[1])}</th></tr>` :
        `<tr><th scope="row">${esc(r[0])}</th><td>${r[1]}</td></tr>`).join("")}</table>`;
  }
  function statusPill(ds) {
    if (ds.status === "ok") return `<span class="pill ok">${ds.preview ? "Preview" : "Catalogued"}</span>`;
    if (ds.status === "missing" || ds.status === "empty") return `<span class="pill wait">Awaiting data</span>`;
    return `<span class="pill err">Unavailable</span>`;
  }
  function set(html, title) {
    content.innerHTML = html;
    document.title = title ? `${title} — ${C.siteName}` : `${C.siteName} — ${C.tagline}`;
  }
  function loading(title) { set(`${heading(title)}<p class="muted">Loading specimens…</p>`, title); }

  function notice(kind, title, body) {
    return `<div class="ambox ambox-${kind}"><div class="ambox-icon" aria-hidden="true">${kind === "wait" ? "⚗" : kind === "err" ? "!" : "ℹ"}</div><div><b>${title}</b><div>${body}</div></div></div>`;
  }
  function problemNotice(ds, c, t) {
    if (ds.status === "offline") return notice("err", "The archive cannot be read from a local file.",
      `Browsers block data loading when a page is opened directly from disk. Start a small local server in the project folder (for example <code>python3 -m http.server</code>) and open <code>http://localhost:8000</code>, or publish the site with GitHub Pages.`);
    if (ds.status === "error") return notice("err", "This dataset could not be loaded.", `<code>${esc(ds.path)}</code> — ${esc(ds.error)}`);
    return notice("wait", "This specimen has not been catalogued yet.",
      `${esc(C.siteName)} has no data for <b>${esc(dsTitle(c, t).toLowerCase())}</b> yet. Add a CSV file at <code>${esc(ds.path)}</code> and it will appear here automatically — any columns are accepted. ` +
      `You can also <a href="#/preview/${c.id}/${t.id}">preview a file from your computer</a> before adding it.`);
  }

  /* ------------------------------------------------------------- explorer */
  let figureNo = 0;
  function explorer(host, ds, opts = {}) {
    const o = Object.assign(defaults(ds), opts.initial || {});
    const p = ds.profile, xc = xColumn(ds);
    const id = "x" + Math.random().toString(36).slice(2, 8);
    const color = opts.color || "#2f6f6a";
    const no = ++figureNo;
    const metricOpts = p.numeric.map(c => `<option value="${c.index}">${esc(c.name)}</option>`).join("") + `<option value="__count">Number of records</option>`;
    const filterOpts = p.categorical.map(c => `<option value="${c.index}">${esc(c.name)}</option>`).join("");
    host.innerHTML = `
      ${opts.compact ? "" : `<div class="controls" id="${id}">
        <label>Measure <select data-k="metric">${metricOpts}</select></label>
        <label data-show="agg">Combine rows using <select data-k="agg">${Object.entries(AGG).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select></label>
        ${xc && xc.type === "date" ? `<label>Time step <select data-k="gran"><option value="year">Year</option><option value="month">Month</option><option value="day">Day</option></select></label>` : ""}
        ${filterOpts ? `<label>Only rows where <select data-k="filterCol"><option value="">(all rows)</option>${filterOpts}</select></label>
          <label data-show="filterVal">is <select data-k="filterVal"></select></label>` : ""}
      </div>`}
      <figure class="thumb"><div class="chart-host"></div><figcaption></figcaption></figure>`;
    const box = host.querySelector(".controls");
    const chartHost = host.querySelector(".chart-host");
    const cap = host.querySelector("figcaption");

    function fillFilterValues() {
      if (!box) return;
      const sel = box.querySelector('[data-k="filterVal"]');
      if (!sel) return;
      const wrap = box.querySelector('[data-show="filterVal"]');
      if (o.filterCol === "") { wrap.hidden = true; return; }
      wrap.hidden = false;
      const col = p.columns[o.filterCol];
      const vals = [...col.uniqueValues.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      if (!vals.includes(o.filterVal)) o.filterVal = vals[0];
      sel.innerHTML = vals.map(v => `<option>${esc(v)}</option>`).join("");
      sel.value = o.filterVal;
    }
    function draw() {
      const a = analyse(ds, o);
      if (box) {
        box.querySelector('[data-show="agg"]').hidden = o.metric === "__count" || !a.grouped;
        for (const s of box.querySelectorAll("select[data-k]")) if (s.dataset.k !== "filterVal") s.value = o[s.dataset.k];
      }
      const name = metricName(ds, o.metric);
      CH.render(chartHost, { kind: a.kind, xFormat: a.xFormat, yLabel: name, title: name,
        series: [{ name, color, points: a.points.filter(pt => pt.value != null) }] });
      const how = o.metric === "__count" ? "Number of records" : a.grouped ? `${AGG[o.agg].label.replace(/ \(.*/, "")} of ${name}` : name;
      const by = !xc ? "by row" : isTime(xc) ? `by ${xc.type === "date" ? o.gran : "year"}` : `by ${xc.name}`;
      const where = o.filterCol !== "" ? ` where ${p.columns[o.filterCol].name} = “${o.filterVal}”` : "";
      cap.innerHTML = `<b>Figure ${no}.</b> ${esc(how)} ${esc(by)}${esc(where)}${a.truncated ? " (40 highest shown)" : ""}. ` +
        `<span class="muted">Source: <code>${esc(ds.path)}</code></span>`;
    }
    if (box) {
      box.addEventListener("change", e => {
        const k = e.target.dataset.k; if (!k) return;
        const v = e.target.value;
        o[k] = (k === "metric" || k === "filterCol") && v !== "__count" && v !== "" ? +v : v;
        if (k === "metric" && v !== "__count") o.agg = SUMMABLE.test(p.columns[+v].name) ? "sum" : "mean";
        if (k === "filterCol") fillFilterValues();
        draw();
      });
      fillFilterValues();
    }
    draw();
  }

  /* ---------------------------------------------------------- data table */
  function dataTable(host, ds) {
    const { headers, rows } = ds.table;
    const types = ds.profile.columns.map(c => c.type);
    const st = { q: "", sort: -1, dir: 1, page: 0, size: 25 };
    host.innerHTML = `<div class="table-tools"><input type="search" class="filter" placeholder="Filter rows…" aria-label="Filter rows"><span class="muted count"></span></div>
      <div class="table-wrap"><table class="wikitable sortable"><thead></thead><tbody></tbody></table></div><div class="pager"></div>`;
    const thead = host.querySelector("thead"), tbody = host.querySelector("tbody"), pager = host.querySelector(".pager"), count = host.querySelector(".count");
    function view() {
      let r = rows;
      if (st.q) { const q = st.q.toLowerCase(); r = r.filter(row => row.some(c => c.toLowerCase().includes(q))); }
      if (st.sort >= 0) {
        const i = st.sort, num = types[i] === "number" || types[i] === "year";
        const dt = types[i] === "date";
        r = [...r].sort((a, b) => {
          let x = a[i], y = b[i];
          if (num) { x = CSV.toNumber(x); y = CSV.toNumber(y); }
          else if (dt) { x = (CSV.toDate(x) || {}).t; y = (CSV.toDate(y) || {}).t; }
          if (x == null || x === "") return 1; if (y == null || y === "") return -1;
          return (num || dt ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * st.dir;
        });
      }
      return r;
    }
    function draw() {
      const r = view();
      const pages = Math.max(1, Math.ceil(r.length / st.size));
      st.page = Math.min(st.page, pages - 1);
      thead.innerHTML = `<tr><th class="rownum">#</th>${headers.map((h, i) => `<th data-i="${i}" class="${types[i] === "number" || types[i] === "year" ? "num" : ""}" aria-sort="${st.sort === i ? (st.dir > 0 ? "ascending" : "descending") : "none"}">${esc(h)}<span class="sort-ind">${st.sort === i ? (st.dir > 0 ? "▲" : "▼") : "⇅"}</span></th>`).join("")}</tr>`;
      const start = st.page * st.size;
      tbody.innerHTML = r.slice(start, start + st.size).map((row, k) =>
        `<tr><td class="rownum">${start + k + 1}</td>${row.map((c, i) => `<td class="${types[i] === "number" || types[i] === "year" ? "num" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("") ||
        `<tr><td colspan="${headers.length + 1}" class="muted">No matching rows.</td></tr>`;
      count.textContent = `${r.length.toLocaleString()} of ${rows.length.toLocaleString()} rows`;
      pager.innerHTML = pages > 1 ? `<button data-p="prev" ${st.page === 0 ? "disabled" : ""}>← Previous</button>
        <span>Page ${st.page + 1} of ${pages}</span><button data-p="next" ${st.page >= pages - 1 ? "disabled" : ""}>Next →</button>` : "";
    }
    thead.addEventListener("click", e => {
      const th = e.target.closest("th[data-i]"); if (!th) return;
      const i = +th.dataset.i;
      if (st.sort === i) st.dir = -st.dir; else { st.sort = i; st.dir = 1; }
      draw();
    });
    host.querySelector(".filter").addEventListener("input", e => { st.q = e.target.value.trim(); st.page = 0; draw(); });
    pager.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; st.page += b.dataset.p === "next" ? 1 : -1; draw(); });
    draw();
  }

  /* ------------------------------------------------- headline measures */
  /** Choose the measure that represents a topic in this file (config override → name patterns → row count → first number). */
  function headline(ds, t, cid) {
    const o = meta(cid, t.id), p = ds.profile;
    const byName = n => p.columns.find(c => c.type === "number" && c.name.toLowerCase() === String(n).toLowerCase());
    const grouped = isTime(xColumn(ds)) ? analyse(ds, { metric: "__count", agg: "sum", gran: "year", filterCol: "" }).grouped : false;
    const make = col => col === "__count"
      ? { metric: "__count", agg: "sum", label: "Number of records" }
      : { metric: col.index, agg: o.combine || (SUMMABLE.test(col.name) ? "sum" : "mean"), label: col.name };
    if (o.metric) { if (/^(count|__count|rows?)$/i.test(o.metric)) return make("__count"); const c = byName(o.metric); if (c) return make(c); }
    const prefer = t.prefer || [];
    for (let i = 0; i < prefer.length; i++) {
      if (i === 1 && t.countFallback && grouped) return make("__count");
      const c = p.numeric.find(col => prefer[i].test(col.name));
      if (c) return make(c);
    }
    if (t.countFallback && grouped) return make("__count");
    return p.numeric[0] ? make(p.numeric[0]) : make("__count");
  }
  /** Map(year → value) for the headline measure, or null if the file has no year/date column. */
  function yearSeries(ds, h) {
    if (!isTime(xColumn(ds))) return null;
    const a = analyse(ds, { metric: h.metric, agg: h.agg, gran: "year", filterCol: "" });
    const m = new Map();
    for (const pt of a.points) if (pt.value != null && Number.isFinite(pt.value)) m.set(Math.round(pt.x), pt.value);
    return m.size ? m : null;
  }
  /** Map(year → [{lat, lon, w|v}]) for files with coordinates. mode "points" keeps every row, "sites" averages per location. */
  function geoByYear(ds, h, mode) {
    const key = `${h.metric}|${mode}`;
    ds._geo = ds._geo || {};
    if (key in ds._geo) return ds._geo[key];
    const p = ds.profile, xc = xColumn(ds);
    if (p.lat < 0 || !isTime(xc)) return (ds._geo[key] = null);
    const out = new Map(), sites = new Map();
    for (const r of ds.table.rows) {
      const y = xc.type === "year" ? CSV.toNumber(r[xc.index]) : (CSV.toDate(r[xc.index]) || {}).y;
      const lat = CSV.toNumber(r[p.lat]), lon = CSV.toNumber(r[p.lon]);
      if (y == null || lat == null || lon == null) continue;
      const v = h.metric === "__count" ? 1 : CSV.toNumber(r[h.metric]);
      if (v == null) continue;
      if (mode === "points") { if (!out.has(y)) out.set(y, []); out.get(y).push({ lat, lon, w: v }); continue; }
      const k = `${y}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
      const s = sites.get(k) || { y, lat, lon, sum: 0, n: 0 };
      s.sum += v; s.n++; sites.set(k, s);
    }
    if (mode !== "points") for (const s of sites.values()) {
      if (!out.has(s.y)) out.set(s.y, []);
      out.get(s.y).push({ lat: s.lat, lon: s.lon, v: h.agg === "sum" ? s.sum : s.sum / s.n });
    }
    return (ds._geo[key] = out.size ? out : null);
  }

  /* ---------------------------------------------------------- geography */
  let geoPromise = null;
  const getGeo = () => geoPromise || (geoPromise = fetch("assets/geo/countries.json").then(r => r.json()).catch(() => ({})));

  /* ---------------------------------------------------------- instrument */
  const fmtP = p => p == null || Number.isNaN(p) ? "—" : p < 0.001 ? "< 0.001" : p.toFixed(3);
  const sig = p => p != null && p < 0.05;
  const inst = { cid: null, year: null, focus: null, data: null, map: null, timer: null };

  function sparkline(series, years, year, color) {
    if (!series || series.size < 2) return `<span class="muted small">—</span>`;
    const xs = [...series.keys()].sort((a, b) => a - b), vs = xs.map(x => series.get(x));
    const x0 = Math.min(years[0], xs[0]), x1 = Math.max(years[years.length - 1], xs[xs.length - 1]);
    const v0 = Math.min(...vs), v1 = Math.max(...vs);
    const W = 78, H = 24, X = x => 2 + (x - x0) / ((x1 - x0) || 1) * (W - 4), Y = v => H - 3 - (v - v0) / ((v1 - v0) || 1) * (H - 6);
    const d = xs.map((x, i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(series.get(x)).toFixed(1)}`).join("");
    const mark = series.has(year) ? `<circle cx="${X(year)}" cy="${Y(series.get(year))}" r="2.6" fill="${color}"/>` : "";
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><line x1="${X(year)}" x2="${X(year)}" y1="0" y2="${H}" class="spark-mark"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.4"/>${mark}</svg>`;
  }

  async function pageInstrument(cid, yr) {
    const c = country(cid) || country(inst.cid) || C.countries[0];
    stopPlay();
    set(`${tabs([{ label: "Instrument", href: "#/", on: true }, { label: "Data archive", href: "#/archive" }], [{ label: "Methods", scroll: "methods" }, { label: "Data sources", scroll: "sources" }])}
      <article class="article instrument">
        <div class="e2o-head">
          <div><h1 class="first-heading">${esc(C.siteName)}</h1>
          <div class="site-sub">${esc(C.subtitle || C.tagline)}${C.event ? ` · <span class="mono">${esc(C.event)}</span>` : ""}</div></div>
        </div>
        <div class="country-tabs" role="tablist" aria-label="Country">${C.countries.map(x =>
          `<a role="tab" href="#/at/${x.id}" class="${x === c ? "on" : ""}" aria-selected="${x === c}"><span class="swatch" style="background:${x.color}"></span>${esc(x.name)}</a>`).join("")}</div>
        <div class="slider-card" id="slider"><span class="muted small">Loading ${esc(c.name)}…</span></div>
        <div class="inst-grid">
          <section class="map-card"><div class="card-h"><b>2.5D map</b> <span class="muted" id="map-title"></span></div>
            <div id="map"></div><div class="map-legend" id="legend"></div><div class="small muted map-note" id="map-note"></div></section>
          <aside id="info"></aside>
        </div>
        <div class="fig-grid">
          <figure class="thumb fig" id="fig1"></figure>
          <figure class="thumb fig" id="fig2"></figure>
          <figure class="thumb fig" id="fig3"></figure>
        </div>
        <div class="inst-article" id="inst-article"></div>
      </article>`, c.name === C.countries[0].name && !cid ? null : c.name);

    const [geo, items] = await Promise.all([getGeo(), Promise.all(C.topics.map(t => getDataset(c.id, t.id).then(ds => ({ t, ds }))))]);
    if (!document.getElementById("slider")) return; // navigated away
    const data = items.map(({ t, ds }) => {
      if (ds.status !== "ok") return { t, ds };
      const h = headline(ds, t, c.id);
      return { t, ds, h, series: yearSeries(ds, h) };
    });
    const years = [...new Set(data.flatMap(d => d.series ? [...d.series.keys()] : []))].sort((a, b) => a - b);
    inst.cid = c.id; inst.data = data; inst.years = years; inst.country = c;
    // Default year: the peak fire year (the most interesting "event"), otherwise the latest year.
    const fireS = data.find(d => d.t.role === "fire" && d.series);
    const peak = fireS ? [...fireS.series.entries()].reduce((b, e) => e[1] > b[1] ? e : b)[0] : null;
    inst.year = yr && years.includes(+yr) ? +yr : peak != null && years.indexOf(peak) > 0 ? peak : years.length ? years[years.length - 1] : null;
    if (!inst.focus || !data.find(d => d.t.id === inst.focus && d.series)) inst.focus = (data.find(d => d.series) || data[0]).t.id;

    const colors = { fire: (C.topics.find(t => t.role === "fire") || {}).color || "#d55e00", air: (C.topics.find(t => t.role === "air") || {}).color || "#cc79a7",
      water: (C.topics.find(t => t.role === "water") || {}).color || "#0072b2", near: (C.map && C.map.nearFireColor) || "#7b3fa0" };
    inst.colors = colors;
    inst.map = VR_MAP.create(document.getElementById("map"), { colors });
    const shape = geo[String(c.iso)];
    if (shape) inst.map.setCountry(shape.polygons, c.center || [0, 0]);
    else document.getElementById("map-note").textContent = `No outline found for ISO code ${c.iso}; check “iso” in assets/config.js.`;

    renderSlider(); renderArticle(); update();
  }

  function renderSlider() {
    const host = document.getElementById("slider");
    const ys = inst.years;
    if (!ys.length) {
      host.innerHTML = `<span class="small muted">No dated records for ${esc(inst.country.name)} yet. Add CSV files with a year or date column — see <a href="#/help">Adding data</a>.</span>`;
      return;
    }
    const fire = inst.data.find(d => d.t.role === "fire" && d.series);
    let marks = "";
    if (fire) {
      const vals = [...fire.series.values()].sort((a, b) => a - b);
      const q3 = vals[Math.floor(vals.length * 0.75)];
      marks = ys.filter(y => fire.series.has(y) && fire.series.get(y) >= q3 && vals.length >= 4)
        .map(y => `<span class="tick-mark" style="left:${pos(y)}%" title="${y}: high ${esc(fire.t.short || fire.t.name)} year"></span>`).join("");
    }
    host.innerHTML = `<button type="button" class="play" aria-label="Play through the years" title="Play">▶</button>
      <div class="slider-body">
        <div class="slider-year" id="slider-year"></div>
        <input type="range" id="year" min="0" max="${ys.length - 1}" step="1" value="${ys.indexOf(inst.year)}" aria-label="Year">
        <div class="slider-marks">${marks}</div>
        <div class="slider-ends small muted"><span>${ys[0]}</span>${fire ? `<span><span class="tri"></span> high ${esc((fire.t.short || fire.t.name).toLowerCase())} years</span>` : ""}<span>${ys[ys.length - 1]}</span></div>
      </div>`;
    const input = host.querySelector("#year");
    input.addEventListener("input", () => { inst.year = ys[+input.value]; update(); });
    host.querySelector(".play").addEventListener("click", () => inst.timer ? stopPlay() : startPlay());
    function pos(y) { return ys.length > 1 ? (ys.indexOf(y) / (ys.length - 1)) * 100 : 50; }
  }
  function startPlay() {
    const ys = inst.years; if (ys.length < 2) return;
    if (inst.year === ys[ys.length - 1]) inst.year = ys[0];
    const b = document.querySelector(".slider-card .play"); if (b) { b.textContent = "❚❚"; b.title = "Pause"; }
    update();
    inst.timer = setInterval(() => {
      const i = ys.indexOf(inst.year);
      if (i >= ys.length - 1 || !document.getElementById("year")) return stopPlay();
      inst.year = ys[i + 1]; update();
    }, 1100);
  }
  function stopPlay() {
    if (inst.timer) clearInterval(inst.timer);
    inst.timer = null;
    const b = document.querySelector(".slider-card .play"); if (b) { b.textContent = "▶"; b.title = "Play"; }
  }

  function update() {
    if (!inst.data || !document.getElementById("info")) return;
    const ys = inst.years, y = inst.year, c = inst.country;
    const input = document.getElementById("year");
    if (input) {
      input.value = ys.indexOf(y);
      const lab = document.getElementById("slider-year");
      lab.textContent = y; lab.style.left = `calc(${ys.length > 1 ? ys.indexOf(y) / (ys.length - 1) * 100 : 50}% + ${8 - (ys.length > 1 ? ys.indexOf(y) / (ys.length - 1) : .5) * 16}px)`;
    }
    if (y != null) history.replaceState(null, "", `#/at/${c.id}/${y}`);
    document.getElementById("map-title").textContent = `${c.name}${y != null ? " · " + y : ""}`;
    updateMap(); renderInfo(); renderFig1(); renderFig2(); renderFig3();
  }

  function updateMap() {
    if (!inst.map) return;
    const y = inst.year, layers = { nearKm: (C.map && C.map.nearFireKm) || 50, labels: {} };
    const notes = [], legend = [];
    for (const d of inst.data) {
      const role = d.t.role; if (!role) continue;
      if (d.ds.status !== "ok") { notes.push(`${d.t.name}: awaiting data.`); continue; }
      layers.labels[role] = d.h.label;
      const g = geoByYear(d.ds, d.h, role === "fire" ? "points" : "sites");
      if (g) {
        const pts = g.get(y) || [];
        if (role === "fire") layers.fires = pts; else if (role === "air") layers.air = pts; else layers.water = pts;
        if (!pts.length) notes.push(`${d.t.name}: no mapped records in ${y}.`);
      } else if (role === "air" && d.series) {
        const vs = [...d.series.values()], lo = Math.min(...vs), hi = Math.max(...vs);
        layers.airLevel = d.series.has(y) ? (hi > lo ? (d.series.get(y) - lo) / (hi - lo) : 0.5) : null;
        notes.push(`${d.t.name}: no coordinates in the file, so the haze shows the national level for each year.`);
      } else notes.push(`${d.t.name}: add latitude and longitude columns to place records on the map.`);
    }
    inst.map.setLayers(layers);
    const C2 = inst.colors;
    if (layers.fires && layers.fires.length) legend.push(`<span><i class="lg-col" style="background:${C2.fire}"></i>${esc(layers.labels.fire)} (columns)</span>`, `<span><i class="lg-line" style="border-color:${C2.fire}"></i>fire density contours</span>`);
    if ((layers.air && layers.air.length) || layers.airLevel != null) legend.push(`<span><i class="lg-haze" style="background:${C2.air}"></i>${esc(layers.labels.air)} (haze)</span>`);
    if (layers.water && layers.water.length) legend.push(`<span><i class="lg-dot" style="background:${C2.water}"></i>${esc(layers.labels.water)} site</span>`, `<span><i class="lg-dot ring" style="background:${C2.near};color:${C2.near}"></i>within ${layers.nearKm} km of a fire</span>`);
    document.getElementById("legend").innerHTML = legend.join("");
    document.getElementById("map-note").innerHTML = notes.map(esc).join(" ");
  }

  function renderInfo() {
    const c = inst.country, y = inst.year;
    const rows = inst.data.map(d => {
      const href = dsLink(c, d.t);
      if (d.ds.status !== "ok") return `<tr class="info-row missing"><th scope="row"><span class="swatch" style="background:${d.t.color}"></span>${esc(d.t.name)}</th>
        <td colspan="2"><a href="${href}" class="small">awaiting data →</a></td></tr>`;
      const v = d.series && d.series.get(y), prev = d.series && d.series.get(y - 1);
      const delta = v != null && prev != null ? pct(prev, v) : "";
      return `<tr class="info-row${d.t.id === inst.focus ? " focus" : ""}" data-focus="${d.t.id}" tabindex="0" title="Show ${esc(d.t.name.toLowerCase())} in Fig. 1 and Fig. 2">
        <th scope="row"><span class="swatch" style="background:${d.t.color}"></span>${esc(d.t.name)}<div class="small muted info-metric">${esc(d.h.label)}${d.h.metric !== "__count" && (d.h.agg === "sum") ? " · total" : d.h.metric !== "__count" ? " · average" : ""}</div></th>
        <td class="num"><b>${v != null ? fmtNum(v) : "—"}</b>${delta && delta !== "—" ? `<div class="small muted">${delta} vs ${y - 1}</div>` : ""}</td>
        <td>${sparkline(d.series, inst.years, y, d.t.color)}</td></tr>`;
    }).join("");
    const host = document.getElementById("info");
    host.innerHTML = `<table class="infobox inst-info"><caption style="--accent:${c.color}">${esc(c.name)}</caption>
      <tr><td colspan="3" class="infobox-sub">${y != null ? `Values for <b>${y}</b>` : "No dated values yet"}</td></tr>
      <tr><th colspan="3" class="infobox-header">Headline measures</th></tr>${rows}
      <tr><td colspan="3" class="small muted info-foot">Select a row to study it in Fig. 1 and Fig. 2. <a href="#/country/${c.id}">${esc(c.name)} in the archive →</a></td></tr></table>`;
    host.querySelectorAll("[data-focus]").forEach(tr => {
      const go = () => { inst.focus = tr.dataset.focus; renderInfo(); renderFig1(); renderFig2(); };
      tr.addEventListener("click", go);
      tr.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
  }

  const focusData = () => inst.data.find(d => d.t.id === inst.focus);

  function renderFig1() {
    const host = document.getElementById("fig1"), d = focusData();
    const head = `<div class="fig-h"><b>Fig. 1</b> Trend</div><div class="fig-sub">Mann–Kendall test and Sen's slope</div>`;
    if (!d || !d.series || d.series.size < 2) { host.innerHTML = head + `<div class="fig-empty">Needs a dated series for ${esc(d ? d.t.name.toLowerCase() : "this subject")}.</div>`; return; }
    const xs = [...d.series.keys()].sort((a, b) => a - b), ys = xs.map(x => d.series.get(x));
    const mk = VR_STATS.mannKendall(ys), sen = VR_STATS.senSlope(xs, ys);
    host.innerHTML = head + `<div class="chart-host"></div><figcaption></figcaption>`;
    const series = [{ name: d.h.label, color: d.t.color, points: xs.map((x, i) => ({ x, value: ys[i] })) }];
    if (sen) series.push({ name: "Sen slope", color: "#767b80", dash: "5 4", width: 1.6, noDots: true, noHover: true,
      points: [xs[0], xs[xs.length - 1]].map(x => ({ x, value: sen.intercept + sen.slope * x })) });
    CH.render(host.querySelector(".chart-host"), { kind: "line", series, xFormat: v => String(v), markX: inst.year, noLegend: true, title: d.h.label });
    host.querySelector("figcaption").innerHTML = `<b>${esc(d.t.name)}</b> — ${esc(d.h.label)} per year. ` + (mk
      ? `Mann–Kendall τ = ${mk.tau.toFixed(2)}, p = ${fmtP(mk.p)} (n = ${mk.n}): <b>${sig(mk.p) ? (mk.tau > 0 ? "significant upward trend" : "significant downward trend") : "no significant trend"}</b>. `
      : `At least 4 years are needed for the trend test. `) + (sen ? `Sen's slope ${sen.slope >= 0 ? "+" : ""}${fmtNum(sen.slope)} per year (dashed line).` : "");
  }

  function renderFig2() {
    const host = document.getElementById("fig2"), d = focusData(), y = inst.year;
    const head = `<div class="fig-h"><b>Fig. 2</b> Before / after ${y ?? ""}</div><div class="fig-sub">Welch t-test and Mann–Whitney U</div>`;
    if (!d || !d.series) { host.innerHTML = head + `<div class="fig-empty">Needs a dated series.</div>`; return; }
    const xs = [...d.series.keys()].sort((a, b) => a - b);
    const before = xs.filter(x => x < y).map(x => d.series.get(x)), after = xs.filter(x => x >= y).map(x => d.series.get(x));
    const w = VR_STATS.welch(before, after), mw = VR_STATS.mannWhitney(before, after);
    const all = before.concat(after), lo = Math.min(0, ...all), hi = Math.max(...all) || 1;
    const W = 320, H = 170, b = 22, top = 12, Y = v => H - b - (v - lo) / ((hi - lo) || 1) * (H - b - top);
    const bar = (vals, cx, label, filled) => {
      if (!vals.length) return `<text x="${cx}" y="${H - b - 6}" class="tick" text-anchor="middle">no years</text><text x="${cx}" y="${H - 6}" class="tick" text-anchor="middle">${label}</text>`;
      const m = VR_STATS.mean(vals);
      return `<rect x="${cx - 42}" y="${Y(m)}" width="84" height="${Math.max(1, Y(lo) - Y(m))}" class="${filled ? "bar-after" : "bar-before"}" style="--c:${d.t.color}"/>` +
        vals.map((v, i) => `<circle cx="${cx - 30 + (vals.length > 1 ? i / (vals.length - 1) * 60 : 30)}" cy="${Y(v)}" r="2.6" fill="${d.t.color}" opacity=".85"/>`).join("") +
        `<text x="${cx}" y="${Y(m) - 5}" class="tick" text-anchor="middle">${esc(fmtNum(m))}</text><text x="${cx}" y="${H - 6}" class="tick" text-anchor="middle">${label}</text>`;
    };
    host.innerHTML = head + `<svg class="fig-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Before and after comparison">
      <line x1="10" x2="${W - 10}" y1="${Y(lo)}" y2="${Y(lo)}" class="axis"/>
      ${bar(before, W * 0.3, `before ${y} (${before.length} y)`, false)}${bar(after, W * 0.7, `${y} onward (${after.length} y)`, true)}</svg>
      <figcaption><b>${esc(d.t.name)}</b> — mean ${esc(d.h.label)} per year; dots are single years. ` + (w
        ? `Welch t = ${w.t.toFixed(2)}, p = ${fmtP(w.p)}; Mann–Whitney U = ${fmtNum(mw.U)}, p = ${fmtP(mw.p)}: <b>${sig(w.p) || sig(mw.p) ? "the difference is significant" : "no significant difference"}</b>. Move the slider to change the split.`
        : `Move the slider so that each side has at least 2 years.`) + `</figcaption>`;
  }

  function renderFig3() {
    const host = document.getElementById("fig3");
    const chain = inst.data.filter(d => d.t.role || d.series);
    const n = chain.length, W = 320, H = 150, cy = 62, R = 21;
    const xAt = i => n > 1 ? 34 + i * (W - 68) / (n - 1) : W / 2;
    const links = [];
    for (let i = 0; i < n - 1; i++) {
      const a = chain[i], b = chain[i + 1];
      links.push(a.series && b.series ? VR_STATS.lagCorrelation(a.series, b.series, 3) : null);
    }
    const svg = `<svg class="fig-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chain of lagged correlations">
      <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="arrow-head"/></marker></defs>
      ${links.map((l, i) => {
        const x1 = xAt(i) + R + 3, x2 = xAt(i + 1) - R - 4, mid = (x1 + x2) / 2, ok = l && sig(l.p);
        return `<line x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}" class="chain-link${ok ? "" : " weak"}" marker-end="url(#arr)"/>
          <text x="${mid}" y="${cy - 10}" class="tick" text-anchor="middle">${l ? `ρ ${l.r >= 0 ? "+" : ""}${l.r.toFixed(2)}` : "n/a"}</text>
          ${l ? `<text x="${mid}" y="${cy + 18}" class="tick" text-anchor="middle">lag ${l.lag} y</text><text x="${mid}" y="${cy + 31}" class="tick muted-t" text-anchor="middle">p ${fmtP(l.p)}</text>` : ""}`;
      }).join("")}
      ${chain.map((d, i) => `<circle cx="${xAt(i)}" cy="${cy}" r="${R}" class="chain-node" style="stroke:${d.series ? d.t.color : "var(--rule)"}"/>
        <text x="${xAt(i)}" y="${cy + 4}" text-anchor="middle" class="chain-label">${esc(d.t.short || d.t.name)}</text>`).join("")}
    </svg>`;
    const strong = links.filter(l => l && sig(l.p)).length;
    host.innerHTML = `<div class="fig-h"><b>Fig. ${3}</b> The chain</div><div class="fig-sub">Spearman correlation, lag 0–3 years</div>${svg}
      <figcaption>Each arrow links one year's ${esc(chain[0] ? (chain[0].t.short || chain[0].t.name).toLowerCase() : "")} value with the next subject up to three years later; the lag with the strongest correlation is shown. Solid = significant at p &lt; 0.05, dashed = not significant. ${links.some(l => l) ? `${strong} of ${links.length} links significant for ${esc(inst.country.name)}.` : "Needs dated series for neighbouring subjects."}</figcaption>`;
  }

  function renderArticle() {
    const c = inst.country;
    const srcs = inst.data.map(d => {
      const m = meta(c.id, d.t.id);
      return `<li><a href="${dsLink(c, d.t)}">${esc(dsTitle(c, d.t))}</a> — ${m.source ? (m.sourceUrl ? `<a href="${esc(m.sourceUrl)}" rel="noopener">${esc(m.source)}</a>, ` : esc(m.source) + ", ") : ""}<code>${esc(d.ds.path)}</code> ${statusPill(d.ds)}${d.h ? ` <span class="small muted">headline measure: ${esc(d.h.label)}</span>` : ""}</li>`;
    }).join("");
    const chainNames = inst.data.map(d => d.t.short || d.t.name).join(" → ");
    const team = (C.team || []).length ? `<ul>${C.team.map(m => `<li><b>${esc(m.name)}</b>${m.role ? ` — ${esc(m.role)}` : ""}</li>`).join("")}</ul>` : `<p class="muted">Team members are listed in <code>assets/config.js</code>.</p>`;
    document.getElementById("inst-article").innerHTML = `
      <h2 id="overview">Overview</h2>
      <p class="lead"><b>${esc(C.siteName)}</b> follows the trail of a wildfire from the forest to the water: does a bad fire year leave a mark on the air, and later on rivers and lakes? It compares ${C.countries.map(x => esc(x.name)).join(", ").replace(/, ([^,]*)$/, " and $1")} using the data files in the archive. Choose a country, move the slider through the years, and select a measure in the infobox to test it.</p>
      <h2 id="methods">Methods</h2>
      <h3>Data handling</h3>
      <p>Each subject and country is one CSV file. When a file loads, every column is classified as a year, date, number or text. The column called <i>year</i> or <i>date</i> (or the first such column) becomes the time axis. A <i>headline measure</i> is then chosen for each file: the column named in the configuration, otherwise the first column whose name matches the subject (for example PM2.5 or AOD for air), otherwise — for files with one row per event, such as satellite fire detections — the number of records per year. Rows that share a year are combined: totals for counts and areas, averages for concentrations.</p>
      <h3>Map</h3>
      <p>The outline is drawn with a Lambert azimuthal equal-area projection centred on the country, so areas are comparable, then tilted into a 2.5D view. Rows with latitude and longitude are placed on the map for the selected year: fires are summed into grid cells shown as columns (taller = more), with contour lines of smoothed fire density; air measurements become a haze whose strength follows the value; water sites turn purple when a fire was recorded within ${esc(String((C.map && C.map.nearFireKm) || 50))} km in the same year. Files without coordinates still feed every chart.</p>
      <h3>Statistics</h3>
      <ul>
        <li><b>Fig. 1 — Trend.</b> The Mann–Kendall test asks whether the yearly series tends to rise or fall, without assuming a straight line or normal data (variance corrected for ties). Sen's slope is the median of the slopes between all pairs of years.</li>
        <li><b>Fig. 2 — Before / after.</b> Years before the selected year are compared with the selected year and after, using Welch's t-test (means, unequal variances) and the Mann–Whitney U test (ranks, normal approximation).</li>
        <li><b>Fig. 3 — The chain.</b> For each neighbouring pair (${esc(chainNames)}), the Spearman rank correlation is computed between the first subject in one year and the second subject 0, 1, 2 or 3 years later; the strongest lag is reported. All tests are two-sided at α = 0.05.</li>
      </ul>
      <h2 id="sources">Data sources</h2>
      <ol class="references">${srcs}</ol>
      <h2 id="caveats">Caveats</h2>
      <ul>
        <li>Correlation is not causation. Fig. 3 shows whether changes line up in time, not that one causes the other.</li>
        <li>Yearly series are short, so tests have little power. Choosing the best of four lags also makes a chance result more likely.</li>
        <li>Countries measure pollution differently; compare trends within a country more readily than levels between countries.</li>
        <li>Satellite water products describe water <i>condition</i> (for example turbidity or chlorophyll), not chemical pollution directly.</li>
        <li>Everything shown is computed from the files listed above, exactly as supplied.</li>
      </ul>
      <h2 id="team">Team and AI use</h2>
      ${team}
      <p>${esc(C.aiUse || "")}</p>`;
  }

  /* ---------------------------------------------------------------- pages */
  async function pageArchive() {
    loading("Data archive");
    const all = await getAll();
    const ok = all.filter(x => x.ds.status === "ok");
    const records = ok.reduce((a, x) => a + x.ds.profile.rowCount, 0);
    const offline = all.some(x => x.ds.status === "offline");
    const matrix = `<table class="wikitable matrix"><thead><tr><th></th>${C.topics.map(t => `<th><a href="#/topic/${t.id}">${esc(t.name)}</a></th>`).join("")}</tr></thead><tbody>
      ${C.countries.map(c => `<tr><th scope="row"><span class="swatch" style="background:${c.color}"></span><a href="#/country/${c.id}">${esc(c.name)}</a></th>${C.topics.map(t => {
        const ds = all.find(x => x.c === c && x.t === t).ds;
        return `<td><a class="cell-link" href="${dsLink(c, t)}"><span class="mono small">${catalogId(c, t)}</span>${statusPill(ds)}
          <span class="small muted">${ds.status === "ok" ? `${ds.profile.rowCount.toLocaleString()} records${coverage(ds) ? " · " + esc(coverage(ds)) : ""}` : esc(ds.path)}</span></a></td>`;
      }).join("")}</tr>`).join("")}</tbody></table>`;

    set(`${tabs([{ label: "Instrument", href: "#/" }, { label: "Data archive", href: "#/archive", on: true }], [{ label: "Adding data", href: "#/help" }])}
      <article class="article main-page">
        <div class="mp-welcome">
          <h1>The <span class="brand-word">${esc(C.siteName)}</span> data archive</h1>
          <p>${esc(C.tagline.toLowerCase())} — an open notebook comparing <b>${C.topics.map(t => esc(t.name.toLowerCase())).join("</b>, <b>").replace(/, <b>([^<]*)<\/b>$/, " and <b>$1</b>")}</b>
          across ${C.countries.map(c => `<a href="#/country/${c.id}">${esc(c.name)}</a>`).join(", ").replace(/, ([^,]*)$/, " and $1")}.</p>
          <p class="mp-count">${ok.length} of ${all.length} datasets catalogued · ${records.toLocaleString()} records</p>
        </div>
        ${offline ? problemNotice({ status: "offline" }) : ""}
        <div class="mp-grid">
          <section class="mp-box mp-wide"><h2 class="mp-h">The archive</h2>
            <p>Every cell below is one dataset. Open it to read its article: an automatically written overview, charts, column statistics and the full table.</p>
            <div class="table-wrap">${matrix}</div></section>
          <section class="mp-box"><h2 class="mp-h">Countries</h2>
            ${C.countries.map(c => `<div class="mp-item"><span class="swatch" style="background:${c.color}"></span><div><a href="#/country/${c.id}"><b>${esc(c.name)}</b></a><p class="small">${esc(c.summary)}</p></div></div>`).join("")}</section>
          <section class="mp-box"><h2 class="mp-h">Subjects</h2>
            ${C.topics.map(t => `<div class="mp-item"><span class="mono tag">${esc(t.code)}</span><div><a href="#/topic/${t.id}"><b>${esc(t.name)}</b></a><p class="small">${esc(t.summary.split(". ")[0])}.</p></div></div>`).join("")}</section>
          <section class="mp-box mp-wide mp-notes"><h2 class="mp-h">Laboratory notes</h2>
            <p>${esc(C.siteName)} does not come with data built in. It reads whatever CSV files are placed in the <code>${esc(C.dataRoot)}/</code> folder and works out for itself which columns are years, dates, measurements or categories.
            Replace or extend a file and every page updates on the next visit. See <a href="#/help">Adding data</a> for the conventions, or <a href="#/preview">preview a file</a> straight from your computer.</p></section>
        </div>
      </article>`, "Data archive");
  }

  async function pageCountry(cid) {
    const c = country(cid); if (!c) return pageNotFound();
    loading(c.name);
    const items = await Promise.all(C.topics.map(t => getDataset(c.id, t.id).then(ds => ({ t, ds }))));
    const ok = items.filter(x => x.ds.status === "ok");
    set(`${tabs([{ label: "Article", href: `#/country/${c.id}`, on: true }, { label: "Discussion", href: "#/about" }])}
      <article class="article">
        ${heading(c.name, `VR-${c.code}`)}
        ${infobox(c.name, esc(c.officialName), [
          ["Catalogue prefix", `<span class="mono">VR-${esc(c.code)}</span>`],
          ["§", "Archive holdings"],
          ["Datasets", `${ok.length} of ${C.topics.length}`],
          ["Records", ok.reduce((a, x) => a + x.ds.profile.rowCount, 0).toLocaleString()],
          ...C.topics.map(t => { const ds = items.find(x => x.t === t).ds; return [t.name, `<a href="${dsLink(c, t)}">${ds.status === "ok" ? ds.profile.rowCount.toLocaleString() + " rows" : "awaiting data"}</a>`]; })
        ], c.color)}
        <p class="lead"><b>${esc(c.name)}</b> (officially the ${esc(c.officialName)}) is one of the countries studied in the ${esc(C.siteName)} archive. ${esc(c.summary)}</p>
        <div class="hatnote">For the interactive map and statistics, see <a href="#/at/${c.id}">${esc(C.siteName)} — ${esc(c.name)}</a>.</div>
        <p>This article brings together the ${C.topics.length} environmental datasets held for ${esc(c.name)}. ${ok.length ? `${ok.length} ${ok.length === 1 ? "is" : "are"} currently catalogued.` : "None have been catalogued yet."}</p>
        ${toc(C.topics.map(t => ({ id: t.id, label: t.name })).concat([{ id: "see-also", label: "See also" }]))}
        ${items.map(({ t, ds }) => `<h2 id="${t.id}">${esc(t.name)}</h2>
          <div class="hatnote">Main article: <a href="${dsLink(c, t)}">${esc(dsTitle(c, t))}</a></div>
          ${ds.status === "ok" ? `<p>${autoSummary(ds, c, t, true)}</p><div class="explore" data-t="${t.id}"></div>` : problemNotice(ds, c, t)}`).join("")}
        <h2 id="see-also">See also</h2>
        <ul>${C.countries.filter(x => x !== c).map(x => `<li><a href="#/country/${x.id}">${esc(x.name)}</a></li>`).join("")}
            ${C.topics.map(t => `<li><a href="#/topic/${t.id}">${esc(t.name)}</a> — comparison between countries</li>`).join("")}</ul>
      </article>`, c.name);
    for (const { t, ds } of ok) { const hl = headline(ds, t, c.id); explorer(content.querySelector(`.explore[data-t="${t.id}"]`), ds, { color: t.color || c.color, compact: true, initial: { metric: hl.metric, agg: hl.agg } }); }
  }

  async function pageTopic(tid) {
    const t = topic(tid); if (!t) return pageNotFound();
    loading(t.name);
    const items = await Promise.all(C.countries.map(c => getDataset(c.id, t.id).then(ds => ({ c, ds }))));
    const ok = items.filter(x => x.ds.status === "ok");
    set(`${tabs([{ label: "Article", href: `#/topic/${t.id}`, on: true }, { label: "Discussion", href: "#/about" }])}
      <article class="article">
        ${heading(t.name, t.code)}
        ${infobox(t.name, null, [
          ["Subject code", `<span class="mono">${esc(t.code)}</span>`],
          ["§", "Datasets"],
          ...items.map(({ c, ds }) => [c.name, `<a href="${dsLink(c, t)}">${ds.status === "ok" ? ds.profile.rowCount.toLocaleString() + " rows" : "awaiting data"}</a>`])
        ])}
        <p class="lead">${esc(t.summary).replace(esc(t.name), `<b>${esc(t.name)}</b>`)}</p>
        <p>This article compares the ${esc(t.name.toLowerCase())} records held by ${esc(C.siteName)} for ${items.map(x => esc(x.c.name)).join(", ").replace(/, ([^,]*)$/, " and $1")}.</p>
        ${toc([{ id: "comparison", label: "Comparison" }, { id: "summary", label: "Summary table" }, { id: "by-country", label: "Datasets by country" }])}
        <h2 id="comparison">Comparison</h2>
        ${ok.length ? `<div id="compare"></div>` : notice("wait", "No datasets catalogued yet.", `Add files named <code>${esc(C.dataRoot)}/&lt;country&gt;/${esc(t.id)}.csv</code> to start comparing.`)}
        <h2 id="summary">Summary table</h2><div id="compare-table">${ok.length ? "" : `<p class="muted">Nothing to summarise yet.</p>`}</div>
        <h2 id="by-country">Datasets by country</h2>
        <ul>${items.map(({ c, ds }) => `<li><a href="${dsLink(c, t)}">${esc(dsTitle(c, t))}</a> ${statusPill(ds)} <span class="mono small muted">${catalogId(c, t)}</span></li>`).join("")}</ul>
      </article>`, t.name);
    if (ok.length) compare(t, ok);
  }

  function compare(t, ok) {
    const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    const metrics = new Map();
    for (const { c, ds } of ok) for (const col of ds.profile.numeric) {
      const k = norm(col.name);
      if (!metrics.has(k)) metrics.set(k, { label: col.name, have: [] });
      metrics.get(k).have.push(c.name);
    }
    const list = [...metrics.entries()].sort((a, b) => b[1].have.length - a[1].have.length);
    const host = document.getElementById("compare");
    const st = { key: list.length ? list[0][0] : "__count", agg: "" };
    host.innerHTML = `<div class="controls">
      <label>Measure <select data-k="key">${list.map(([k, m]) => `<option value="${esc(k)}">${esc(m.label)}${m.have.length < ok.length ? ` (${esc(m.have.join(", "))} only)` : ""}</option>`).join("")}<option value="__count">Number of records</option></select></label>
      <label data-show="agg">Combine rows using <select data-k="agg">${Object.entries(AGG).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select></label></div>
      <figure class="thumb"><div class="chart-host"></div><figcaption></figcaption></figure>`;
    const chartHost = host.querySelector(".chart-host"), cap = host.querySelector("figcaption");
    const no = ++figureNo;
    function draw() {
      const label = st.key === "__count" ? "Number of records" : metrics.get(st.key).label;
      if (!st.agg) st.agg = SUMMABLE.test(label) ? "sum" : "mean";
      host.querySelector('[data-k="agg"]').value = st.agg;
      host.querySelector('[data-show="agg"]').hidden = st.key === "__count";
      const results = ok.map(({ c, ds }) => {
        const col = st.key === "__count" ? "__count" : (ds.profile.numeric.find(x => norm(x.name) === st.key) || {}).index;
        if (col == null) return { c, ds, a: null };
        return { c, ds, a: analyse(ds, { metric: col, agg: st.agg, gran: "year", filterCol: "" }) };
      });
      const timeBased = results.filter(r => r.a && r.a.kind === "line");
      const use = timeBased.length ? timeBased : results.filter(r => r.a);
      const kind = timeBased.length ? "line" : "bar";
      CH.render(chartHost, { kind, xFormat: v => String(v), yLabel: label,
        series: use.map(r => ({ name: r.c.name, color: r.c.color, points: r.a.points.filter(p => p.value != null) })) });
      const left = results.filter(r => !use.includes(r)).map(r => r.c.name);
      cap.innerHTML = `<b>Figure ${no}.</b> ${esc(st.key === "__count" ? label : `${AGG[st.agg].label.replace(/ \(.*/, "")} of ${label}`)} ${kind === "line" ? "by year" : ""}, by country.` +
        (left.length ? ` <span class="muted">Not shown: ${esc(left.join(", "))} (measure or time column not present).</span>` : "");
      document.getElementById("compare-table").innerHTML = `<div class="table-wrap"><table class="wikitable"><thead><tr><th>Country</th><th>Coverage</th><th>First value</th><th>Latest value</th><th>Lowest</th><th>Highest</th><th>Change</th></tr></thead><tbody>
        ${results.map(({ c, a }) => {
          const pts = a ? a.points.filter(p => p.value != null) : [];
          if (!pts.length) return `<tr><th scope="row">${esc(c.name)}</th><td colspan="6" class="muted">Measure not present in this dataset</td></tr>`;
          const vals = pts.map(p => p.value), f = pts[0], l = pts[pts.length - 1];
          return `<tr><th scope="row"><span class="swatch" style="background:${c.color}"></span>${esc(c.name)}</th><td>${a.kind === "line" ? `${esc(f.label)}–${esc(l.label)}` : `${pts.length} groups`}</td>
            <td class="num">${fmtNum(f.value)}${a.kind === "line" ? ` <span class="muted small">(${esc(f.label)})</span>` : ""}</td><td class="num">${fmtNum(l.value)}${a.kind === "line" ? ` <span class="muted small">(${esc(l.label)})</span>` : ""}</td>
            <td class="num">${fmtNum(Math.min(...vals))}</td><td class="num">${fmtNum(Math.max(...vals))}</td><td class="num">${a.kind === "line" ? pct(f.value, l.value) : "—"}</td></tr>`;
        }).join("")}</tbody></table></div><p class="small muted">Values are ${esc(label)} after combining rows per year using the ${esc(AGG[st.agg].label.toLowerCase())}, as plotted above.</p>`;
    }
    host.querySelector(".controls").addEventListener("change", e => {
      const k = e.target.dataset.k; if (!k) return;
      st[k] = e.target.value;
      if (k === "key") { st.agg = ""; }
      draw();
    });
    draw();
  }

  function autoSummary(ds, c, t, short) {
    const p = ds.profile, xc = xColumn(ds), cov = coverage(ds);
    let s = `The ${short ? "" : `<b>${esc(t.name.toLowerCase())}</b> `}dataset for ${esc(c.name)} contains <b>${p.rowCount.toLocaleString()}</b> records described by <b>${p.colCount}</b> columns`;
    if (xc && isTime(xc)) s += `, covering <b>${esc(cov)}</b>`;
    else if (xc) s += `, organised by <i>${esc(xc.name)}</i>`;
    s += ".";
    if (p.numeric.length) s += ` Measured quantities include ${p.numeric.slice(0, 4).map(n => `<i>${esc(n.name)}</i>`).join(", ")}${p.numeric.length > 4 ? ` and ${p.numeric.length - 4} more` : ""}.`;
    if (!short && p.categorical.length) s += ` Rows can be grouped by ${p.categorical.slice(0, 3).map(n => `<i>${esc(n.name)}</i>`).join(", ")}.`;
    return s;
  }

  async function pageDataset(cid, tid, sub) {
    const c = country(cid), t = topic(tid); if (!c || !t) return pageNotFound();
    const title = dsTitle(c, t);
    loading(title);
    const ds = await getDataset(c.id, t.id);
    const m = meta(c.id, t.id);
    const base = dsLink(c, t);
    const tabBar = tabs([
      { label: "Article", href: base, on: !sub },
      { label: "Data table", href: base + "/table", on: sub === "table" },
      { label: "View source", href: base + "/source", on: sub === "source" }
    ], ds.status === "ok" && !ds.preview ? [{ label: "Download CSV", href: ds.path, download: true }] : []);

    if (ds.status !== "ok") {
      set(`${tabBar}<article class="article">${heading(title, catalogId(c, t))}${problemNotice(ds, c, t)}
        <p>When catalogued, this article will describe the file automatically: its coverage, a chart of each measurement, column statistics and the full table.</p>
        <h2>See also</h2><ul><li><a href="#/country/${c.id}">${esc(c.name)}</a></li><li><a href="#/topic/${t.id}">${esc(t.name)}</a></li></ul></article>`, title);
      return;
    }
    const p = ds.profile, xc = xColumn(ds);
    const previewBanner = ds.preview ? notice("info", "You are viewing a local preview.", `This file (<code>${esc(ds.path)}</code>) is loaded only in your browser and has not been added to the archive. <a href="#" data-clear="${c.id}/${t.id}">Discard preview</a>.`) : "";

    if (sub === "table") {
      set(`${tabBar}<article class="article">${heading(title, catalogId(c, t))}${previewBanner}<div id="dt"></div></article>`, title);
      dataTable(document.getElementById("dt"), ds);
      return;
    }
    if (sub === "source") {
      const lines = ds.text.split(/\r?\n/);
      set(`${tabBar}<article class="article">${heading(title, catalogId(c, t))}${previewBanner}
        <p class="muted">Raw contents of <code>${esc(ds.path)}</code>${lines.length > 400 ? ` (first 400 of ${lines.length.toLocaleString()} lines)` : ""}.</p>
        <pre class="source">${esc(lines.slice(0, 400).join("\n"))}</pre></article>`, title);
      return;
    }

    const secs = [{ id: "overview", label: "Overview" }, { id: "variables", label: "Variables" }];
    if (xc && isTime(xc) && p.numeric.length) secs.push({ id: "key-figures", label: "Key figures" });
    secs.push({ id: "sample", label: "Sample records" }, { id: "see-also", label: "See also" }, { id: "references", label: "References" });

    const keyFigures = xc && isTime(xc) && p.numeric.length ? (() => {
      const rows = p.numeric.map(col => {
        const agg = SUMMABLE.test(col.name) ? "sum" : "mean";
        const a = analyse(ds, { metric: col.index, agg, gran: "year", filterCol: "" });
        const pts = a.points.filter(x => x.value != null);
        if (!pts.length) return "";
        const f = pts[0], l = pts[pts.length - 1];
        const peak = pts.reduce((b, x) => x.value > b.value ? x : b);
        return `<tr><th scope="row">${esc(col.name)}</th><td class="small muted">${AGG[agg].label.replace(/ \(.*/, "").toLowerCase()} per year</td><td class="num">${fmtNum(f.value)} <span class="muted small">(${esc(f.label)})</span></td>
          <td class="num">${fmtNum(l.value)} <span class="muted small">(${esc(l.label)})</span></td><td class="num">${fmtNum(peak.value)} <span class="muted small">(${esc(peak.label)})</span></td><td class="num">${pct(f.value, l.value)}</td></tr>`;
      }).join("");
      return `<h2 id="key-figures">Key figures</h2><div class="table-wrap"><table class="wikitable"><thead><tr><th>Measure</th><th>Rows combined as</th><th>First</th><th>Latest</th><th>Peak</th><th>Change</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    })() : "";

    const typeName = { year: "Year", date: "Date", number: "Number", text: "Text", empty: "Empty" };
    set(`${tabBar}<article class="article">
      ${heading(title, catalogId(c, t))}${previewBanner}
      ${infobox(title, `<span class="mono">${catalogId(c, t)}</span>`, [
        ["Country", `<a href="#/country/${c.id}">${esc(c.name)}</a>`],
        ["Subject", `<a href="#/topic/${t.id}">${esc(t.name)}</a>`],
        ["§", "Specimen"],
        ["File", `<code class="wrap">${esc(ds.path)}</code>`],
        ["Records", p.rowCount.toLocaleString()],
        ["Columns", p.colCount],
        ["Coverage", cov(ds)],
        ["Index column", xc ? esc(xc.name) : "row order"],
        ["Size", fmtBytes(ds.size)],
        ["Updated", ds.modified ? esc(new Date(ds.modified).toISOString().slice(0, 10)) : null],
        ["Source", m.source ? (m.sourceUrl ? `<a href="${esc(m.sourceUrl)}" rel="noopener">${esc(m.source)}</a>` : esc(m.source)) : null]
      ], c.color)}
      <p class="lead">${autoSummary(ds, c, t, false)}</p>
      ${m.notes ? `<p>${esc(m.notes)}</p>` : ""}
      ${toc(secs)}
      <h2 id="overview">Overview</h2><div id="ex"></div>
      <h2 id="variables">Variables</h2>
      <div class="table-wrap"><table class="wikitable"><thead><tr><th>Column</th><th>Type</th><th>Filled</th><th>Distinct</th><th>Min</th><th>Median</th><th>Mean</th><th>Max</th></tr></thead><tbody>
      ${p.columns.map(col => `<tr><th scope="row">${esc(col.name)}${col.index === p.x ? ` <span class="pill small-pill">index</span>` : ""}</th><td>${typeName[col.type]}</td>
        <td class="num">${p.rowCount ? Math.round(col.present / p.rowCount * 100) : 0}%</td><td class="num">${esc(col.unique)}</td>
        ${col.stats ? `<td class="num">${fmtNum(col.stats.min)}</td><td class="num">${fmtNum(col.stats.median)}</td><td class="num">${fmtNum(col.stats.mean)}</td><td class="num">${fmtNum(col.stats.max)}</td>` : `<td colspan="4" class="muted small">${col.type === "date" ? esc(cov(ds)) : "—"}</td>`}</tr>`).join("")}
      </tbody></table></div>
      ${keyFigures}
      <h2 id="sample">Sample records</h2>
      <div class="hatnote">Full table: <a href="${base}/table">${esc(title)} — data table</a></div>
      <div class="table-wrap"><table class="wikitable"><thead><tr>${ds.table.headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${ds.table.rows.slice(0, 8).map(r => `<tr>${r.map((v, i) => `<td class="${p.columns[i].type === "number" ? "num" : ""}">${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <h2 id="see-also">See also</h2>
      <ul>${C.topics.filter(x => x !== t).map(x => `<li><a href="${dsLink(c, x)}">${esc(dsTitle(c, x))}</a></li>`).join("")}
        ${C.countries.filter(x => x !== c).map(x => `<li><a href="${dsLink(x, t)}">${esc(dsTitle(x, t))}</a></li>`).join("")}
        <li><a href="#/topic/${t.id}">${esc(t.name)}</a> — comparison between countries</li></ul>
      <h2 id="references">References</h2>
      <ol class="references"><li>${m.source ? (m.sourceUrl ? `<a href="${esc(m.sourceUrl)}" rel="noopener">${esc(m.source)}</a>. ` : esc(m.source) + ". ") : ""}Data file <code>${esc(ds.path)}</code>${ds.preview ? " (local preview)" : `, retrieved ${new Date().toISOString().slice(0, 10)}`}.</li></ol>
    </article>`, title);
    const hl = headline(ds, t, c.id);
    explorer(document.getElementById("ex"), ds, { color: c.color, initial: { metric: hl.metric, agg: hl.agg } });
    function cov(d) { return coverage(d); }
  }

  function pagePreview(cid, tid) {
    const c = country(cid) || C.countries[0], t = topic(tid) || C.topics[0];
    set(`${tabs([{ label: "Special page", href: "#/preview", on: true }])}
      <article class="article">${heading("Preview a local file")}
      <p class="lead">Load a CSV file from your computer to see how ${esc(C.siteName)} will present it. The file stays in your browser — nothing is uploaded — and the preview lasts until you reload the page.</p>
      <div class="form-card">
        <label>Country <select id="pv-c">${C.countries.map(x => `<option value="${x.id}" ${x === c ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
        <label>Subject <select id="pv-t">${C.topics.map(x => `<option value="${x.id}" ${x === t ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
        <label class="drop" id="pv-drop"><input type="file" id="pv-f" accept=".csv,.tsv,.txt,text/csv"><span><b>Choose a CSV file</b> or drop it here</span></label>
        <p class="small muted" id="pv-msg"></p>
      </div>
      <p>To add the file permanently, save it as <code id="pv-path">${esc(meta(c.id, t.id).file)}</code> in the repository. See <a href="#/help">Adding data</a>.</p>
      </article>`, "Preview a local file");
    const sc = document.getElementById("pv-c"), stp = document.getElementById("pv-t"), f = document.getElementById("pv-f"), drop = document.getElementById("pv-drop");
    const upd = () => { document.getElementById("pv-path").textContent = meta(sc.value, stp.value).file; };
    sc.onchange = stp.onchange = upd;
    const load = file => {
      if (!file) return;
      const r = new FileReader();
      r.onload = () => {
        const ds = build(String(r.result), file.name, { preview: true, modified: file.lastModified ? new Date(file.lastModified).toUTCString() : null });
        if (ds.status !== "ok") { document.getElementById("pv-msg").textContent = "That file appears to be empty."; return; }
        previews.set(`${sc.value}/${stp.value}`, ds);
        location.hash = `#/data/${sc.value}/${stp.value}`;
      };
      r.readAsText(file);
    };
    f.onchange = () => load(f.files[0]);
    drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); load(e.dataTransfer.files[0]); });
  }

  function pageAbout() {
    set(`${tabs([{ label: "Project page", href: "#/about", on: true }, { label: "Adding data", href: "#/help" }])}
      <article class="article">${heading("About " + C.siteName)}
      <p class="lead"><b>${esc(C.siteName)}</b> is a small reference work on the state of the environment in ${C.countries.map(c => esc(c.name)).join(", ").replace(/, ([^,]*)$/, " and $1")}. It is written in the manner of an encyclopaedia and kept like a laboratory notebook: every figure on the site is drawn directly from a catalogued data file, and every file can be inspected in full.</p>
      ${toc([{ id: "principles", label: "Principles" }, { id: "catalogue", label: "Catalogue numbers" }, { id: "reading", label: "Reading the charts" }, { id: "tech", label: "How the site works" }])}
      <h2 id="principles">Principles</h2>
      <ul><li><b>Data first.</b> The site contains no hard-coded figures. Articles, charts and statistics are generated from the CSV files present at the time of reading.</li>
        <li><b>Nothing hidden.</b> Each dataset has a <i>Data table</i> tab and a <i>View source</i> tab showing the file exactly as supplied.</li>
        <li><b>Comparable, not identical.</b> National statistics are collected in different ways. Where the same measure exists for several countries it is plotted together; otherwise datasets are shown side by side.</li></ul>
      <h2 id="catalogue">Catalogue numbers</h2>
      <p>Each dataset carries a catalogue number of the form <span class="mono">VR-&lt;country&gt;-&lt;subject&gt;</span>, for example <span class="mono">${catalogId(C.countries[0], C.topics[0])}</span> for ${esc(dsTitle(C.countries[0], C.topics[0]).toLowerCase())}.</p>
      <h2 id="reading">Reading the charts</h2>
      <p>When a file contains a year or date column the charts show change over time; otherwise they compare groups. If several rows share the same year (for example one row per city or per fire), they are combined: totals are used for counts and areas, averages for concentrations. You can change this under <i>Combine rows using</i>, and limit the chart to one region or category with <i>Only rows where</i>.</p>
      <h2 id="tech">How the site works</h2>
      <p>${esc(C.siteName)} is a static website with no build step and no external libraries: one HTML page, one stylesheet and four small scripts. It can be hosted on GitHub Pages or any web server. The list of countries and subjects lives in <code>assets/config.js</code>.</p>
      </article>`, "About");
  }

  function pageHelp() {
    const ex = `${C.dataRoot}/${C.countries[0].id}/${C.topics[0].id}.csv`;
    set(`${tabs([{ label: "Help page", href: "#/help", on: true }, { label: "About", href: "#/about" }])}
      <article class="article">${heading("Help: Adding data")}
      <p class="lead">${esc(C.siteName)} reads ordinary CSV files. You do not need to change any code to add or replace data.</p>
      ${toc([{ id: "where", label: "Where files go" }, { id: "format", label: "File format" }, { id: "examples", label: "Examples" }, { id: "options", label: "Optional settings" }, { id: "more", label: "Adding countries or subjects" }])}
      <h2 id="where">Where files go</h2>
      <p>Save each file as <code>${esc(C.dataRoot)}/&lt;country&gt;/&lt;subject&gt;.csv</code>:</p>
      <div class="table-wrap"><table class="wikitable"><thead><tr><th></th>${C.topics.map(t => `<th>${esc(t.name)}</th>`).join("")}</tr></thead><tbody>
        ${C.countries.map(c => `<tr><th scope="row">${esc(c.name)}</th>${C.topics.map(t => `<td><code class="small">${esc(meta(c.id, t.id).file)}</code></td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <h2 id="format">File format</h2>
      <ul><li>The first row must contain column names. Any names, in any language, are fine.</li>
        <li>Commas, semicolons or tabs may be used as separators; this is detected automatically.</li>
        <li>A column called something like <i>Year</i> or <i>Date</i> is used as the time axis. Values such as <code>2021</code>, <code>2021-07</code>, <code>2021-07-14</code> and <code>07/14/2021</code> are understood.</li>
        <li>Numbers may use thousands separators (<code>1,250</code>) or percent signs (<code>12%</code>). Blank cells, <code>NA</code> and <code>-</code> are treated as missing.</li>
        <li>Text columns with a modest number of distinct values (regions, cities, causes…) become filters.</li></ul>
      <h2 id="examples">Examples</h2>
      <p>One row per year:</p><pre class="source">Year,PM2.5 (µg/m³),NO2 (µg/m³),SO2 (µg/m³)
2019,17.2,24.1,6.3
2020,15.8,21.7,5.9</pre>
      <p>Many rows per year (one per region, or per fire) also work — they are combined automatically:</p><pre class="source">date,region,cause,area_burned_ha
2021-06-02,Yakutia,lightning,1520
2021-06-03,Krasnoyarsk,human,310</pre>
      <h2 id="options">Optional settings</h2>
      <p>To use a different file name or to credit a source, add an entry to <code>datasets</code> in <code>assets/config.js</code>:</p>
      <pre class="source">datasets: {
  "${C.countries[0].id}/${C.topics[0].id}": {
    file: "${esc(ex)}",
    source: "Name of the publishing agency",
    sourceUrl: "https://…",
    notes: "Annual averages for monitored cities."
  }
}</pre>
      <h2 id="more">Adding countries or subjects</h2>
      <p>Add an entry to <code>countries</code> or <code>topics</code> in <code>assets/config.js</code> with an <code>id</code>, a <code>name</code>, a short <code>code</code> and a <code>summary</code>. Navigation, the archive table and every comparison will include it automatically.</p>
      <p>Before committing a file you can check how it will look with <a href="#/preview">Preview a local file</a>.</p>
      </article>`, "Adding data");
  }

  async function pageSearch(q) {
    q = decodeURIComponent(q || "").trim();
    loading("Search results");
    const ql = q.toLowerCase();
    const hits = [];
    const add = (title, href, snippet) => hits.push({ title, href, snippet });
    for (const c of C.countries) if ((c.name + " " + c.officialName + " " + c.summary).toLowerCase().includes(ql)) add(c.name, `#/country/${c.id}`, c.summary);
    for (const t of C.topics) if ((t.name + " " + t.summary).toLowerCase().includes(ql)) add(t.name, `#/topic/${t.id}`, t.summary);
    const all = await getAll();
    for (const { c, t, ds } of all) {
      const title = dsTitle(c, t);
      const cols = ds.status === "ok" ? ds.table.headers.filter(h => h.toLowerCase().includes(ql)) : [];
      if (title.toLowerCase().includes(ql) || catalogId(c, t).toLowerCase().includes(ql) || cols.length)
        add(title, dsLink(c, t), cols.length ? `Columns: ${cols.join(", ")}` : `${catalogId(c, t)} · ${ds.status === "ok" ? ds.profile.rowCount + " records" : "awaiting data"}`);
    }
    if (/about|help|add|upload|csv/.test(ql)) { add("Help: Adding data", "#/help", "How to add CSV files."); add("About " + C.siteName, "#/about", "Principles and methods."); }
    const exact = hits.find(h => h.title.toLowerCase() === ql);
    if (exact && hits.length === 1) { location.replace(exact.href); return; }
    set(`${tabs([{ label: "Special page", href: "#", on: true }])}<article class="article">${heading("Search results")}
      <p>${hits.length ? `${hits.length} result${hits.length > 1 ? "s" : ""} for` : "There were no results matching"} “<b>${esc(q)}</b>”.</p>
      <ul class="search-results">${hits.map(h => `<li><a href="${h.href}">${esc(h.title)}</a><div class="small">${esc(h.snippet)}</div></li>`).join("")}</ul></article>`, "Search results");
  }

  function pageNotFound() {
    set(`${tabs([{ label: "Article", href: "#", on: true }])}<article class="article">${heading("Page not found")}
      ${notice("info", `${esc(C.siteName)} does not have a page with this name.`, `Return to the <a href="#/">Main Page</a> or use the search box.`)}</article>`, "Not found");
  }

  /* --------------------------------------------------------------- shell */
  function sidebar() {
    const sb = document.getElementById("sidebar");
    sb.innerHTML = `
      <div class="portal"><div class="portal-h">Navigation</div><ul>
        <li><a href="#/">Instrument</a></li><li><a href="#/archive">Data archive</a></li><li><a href="#/random" id="random">Random dataset</a></li><li><a href="#/preview">Preview a local file</a></li></ul></div>
      <div class="portal"><div class="portal-h">Countries</div><ul>${C.countries.map(c => `<li><a href="#/country/${c.id}">${esc(c.name)}</a></li>`).join("")}</ul></div>
      <div class="portal"><div class="portal-h">Subjects</div><ul>${C.topics.map(t => `<li><a href="#/topic/${t.id}">${esc(t.name)}</a></li>`).join("")}</ul></div>
      <div class="portal"><div class="portal-h">Laboratory</div><ul><li><a href="#/about">About ${esc(C.siteName)}</a></li><li><a href="#/help">Adding data</a></li></ul></div>`;
    const brand = document.querySelector(".brand-name"); if (brand) brand.textContent = C.siteName;
    const tag = document.querySelector(".brand-tag"); if (tag) tag.textContent = C.tagline;
    document.getElementById("footer-text").innerHTML = `${esc(C.siteName)} — ${esc(C.tagline.toLowerCase())}. Figures are generated from the catalogued CSV files at the time of reading and are shown as supplied. <a href="#/about">About</a> · <a href="#/help">Adding data</a>`;
  }

  function markNav() {
    let h = location.hash || "#/";
    if (h.startsWith("#/at/")) h = "#/";
    document.querySelectorAll("#sidebar a").forEach(a => a.classList.toggle("active", a.getAttribute("href") === h || (h.startsWith(a.getAttribute("href") + "/") && a.getAttribute("href") !== "#/")));
  }

  function route() {
    figureNo = 0;
    const h = decodeURI(location.hash.replace(/^#/, "")) || "/";
    let m;
    document.body.classList.remove("nav-open");
    if (h === "/" || h === "") pageInstrument();
    else if ((m = h.match(/^\/at\/([\w-]+)(?:\/(\d{4}))?$/))) pageInstrument(m[1], m[2]);
    else if (h === "/archive") pageArchive();
    else if ((m = h.match(/^\/country\/([\w-]+)$/))) pageCountry(m[1]);
    else if ((m = h.match(/^\/topic\/([\w-]+)$/))) pageTopic(m[1]);
    else if ((m = h.match(/^\/data\/([\w-]+)\/([\w-]+)(?:\/(table|source))?$/))) pageDataset(m[1], m[2], m[3]);
    else if ((m = h.match(/^\/preview(?:\/([\w-]+)\/([\w-]+))?$/))) pagePreview(m[1], m[2]);
    else if (h === "/about") pageAbout();
    else if (h === "/help") pageHelp();
    else if ((m = h.match(/^\/search\/(.*)$/))) pageSearch(m[1]);
    else if (h === "/random") {
      const c = C.countries[Math.floor(Math.random() * C.countries.length)], t = C.topics[Math.floor(Math.random() * C.topics.length)];
      location.replace(dsLink(c, t));
    } else pageNotFound();
    markNav();
    window.scrollTo(0, 0);
  }

  document.addEventListener("click", e => {
    const s = e.target.closest("[data-scroll]");
    if (s) { e.preventDefault(); const t = document.getElementById(s.dataset.scroll); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const clr = e.target.closest("[data-clear]");
    if (clr) { e.preventDefault(); previews.delete(clr.dataset.clear); route(); }
    if (e.target.closest(".menu-toggle")) document.body.classList.toggle("nav-open");
  });
  document.getElementById("search-form").addEventListener("submit", e => {
    e.preventDefault();
    const q = document.getElementById("search-input").value.trim();
    if (q) location.hash = "#/search/" + encodeURIComponent(q);
  });
  window.addEventListener("hashchange", route);
  sidebar();
  route();
})();
