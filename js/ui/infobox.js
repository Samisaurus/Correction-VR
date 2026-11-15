// js/ui/infobox.js
// Purpose: Infobox (#infobox): selected year's fire & smoke metrics, sparklines, and median comparisons.

const STYLE = `
.ibx-box { border: 1px solid var(--c-edge); background: var(--c-paper); border-radius: 2px; font-size: 14px; }
.ibx-caption { position: relative; padding: 10px 14px 8px; border-bottom: 1px solid var(--c-edge); }
.ibx-name { display: block; font-family: var(--f-serif); font-size: 18px; font-weight: 700; line-height: 1.25; color: var(--c-ink); }
.ibx-sub { display: block; margin-top: 3px; font-family: var(--f-mono); font-size: 12px; color: var(--c-muted); }
.ibx-sub strong { color: var(--c-ink); font-weight: 600; }
.ibx-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.ibx-row[data-group="fire"] { --ibx-color: var(--c-fire); }
.ibx-row[data-group="air"] { --ibx-color: var(--c-smoke); }
.ibx-row th, .ibx-row td { padding: 8px 10px; border-bottom: 1px solid var(--c-edge); vertical-align: middle; transition: background-color 160ms var(--ease-out); }
.ibx-row:last-of-type th, .ibx-row:last-of-type td { border-bottom: 0; }
.ibx-row th { width: 44%; font-weight: 600; color: var(--c-ink); border-left: 3px solid transparent; text-align: left; }
.ibx-row[role="button"] { cursor: pointer; }
.ibx-row[role="button"]:hover th, .ibx-row[role="button"]:hover td { background: var(--c-panel); }
.ibx-row.is-focus th { border-left-color: var(--ibx-color); background: rgba(15, 23, 42, 0.02); }
.ibx-row.is-focus td { background: rgba(15, 23, 42, 0.02); }
.ibx-value { white-space: nowrap; }
.ibx-num { font-family: var(--f-mono); font-size: 15.5px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--c-ink); }
.ibx-unit { font-size: 12px; font-weight: 500; color: var(--c-muted); margin-left: 4px; }
.ibx-delta { display: block; font-size: 11.5px; color: var(--c-muted); margin-top: 2px; }
.ibx-delta strong { font-weight: 700; color: var(--c-ink); }
.ibx-delta strong.is-surge { color: #B91C1C; }
.ibx-delta strong.is-calm { color: #0F766E; }
.ibx-spark { width: 84px; text-align: right; }
.ibx-spark svg { display: inline-block; width: 72px; height: 18px; color: var(--ibx-color); overflow: visible; }
.ibx-spark polyline { fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.ibx-spark circle { fill: var(--c-year); stroke: var(--c-paper); stroke-width: 1.2; transition: cx 180ms var(--ease-out), cy 180ms var(--ease-out); }
.ibx-foot { padding: 8px 14px; font-size: 12px; color: var(--c-muted); border-top: 1px solid var(--c-edge); }
.ibx-foot strong { color: var(--c-ink); font-weight: 600; }
@media (max-width: 480px) {
  .ibx-row th { width: 38%; }
  .ibx-spark { width: 60px; }
  .ibx-spark svg { width: 52px; }
  .ibx-value { white-space: normal; }
  .ibx-row th, .ibx-row td { padding: 6px 6px; }
}
`;
const NS = 'http://www.w3.org/2000/svg';

function hasAny(series, varId) {
  const v = series && series.variables && series.variables[varId];
  return !!(v && ((v.annual || []).some((d) => d[1] !== null) || (v.monthly || []).some((d) => d[1] !== null)));
}

function buildSparkline(points) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 72 18');
  svg.setAttribute('aria-hidden', 'true');
  const vals = points.map((p) => p.value).filter((v) => v !== null);
  if (vals.length < 2) return { svg, coordsByYear: new Map(), dot: null };
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const n = points.length;
  const x = (i) => 1 + (70 * i) / Math.max(1, n - 1);
  const y = (v) => (hi === lo ? 9 : 16 - (14 * (v - lo)) / (hi - lo));
  const coordsByYear = new Map();
  let run = [];
  const flush = () => {
    if (run.length > 1) {
      const pl = document.createElementNS(NS, 'polyline');
      pl.setAttribute('points', run.join(' '));
      svg.appendChild(pl);
    }
    run = [];
  };
  for (let i = 0; i < n; i += 1) {
    const p = points[i];
    if (p.value === null) flush();
    else {
      const cx = x(i).toFixed(1);
      const cy = y(p.value).toFixed(1);
      coordsByYear.set(p.year, [cx, cy]);
      run.push(`${cx},${cy}`);
    }
  }
  flush();
  const dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('r', '2.5');
  dot.style.display = 'none';
  svg.appendChild(dot);
  return { svg, coordsByYear, dot };
}

export async function mount(el, ctx) {
  const { store, data, theme } = ctx;
  const { injectCss, fmt, fmtMass, unitFor, VARS, placeholder } = theme;
  injectCss('ibx', STYLE);
  const regions = await data.getRegions();
  if (!regions) {
    placeholder(el);
    return;
  }
  const [y0, y1] = Array.isArray(regions.years) ? regions.years : [2002, 2026];
  let current = null;
  let token = 0;

  function rowSpecs(scope) {
    const { series } = scope;
    const rows = [{ id: 'fire_count' }, { id: 'fire_frp' }];
    if (hasAny(series, 'viirs_count')) rows.push({ id: 'viirs_count', span: '2012–2026' });
    if (hasAny(series, 'co2_em')) rows.push({ id: 'co2_em', span: '2003–2026', massUnit: 'Mt' });
    if (hasAny(series, 'pm25_em')) rows.push({ id: 'pm25_em', span: '2003–2026', massUnit: 'auto' });
    return rows;
  }

  function render(scope, state) {
    const { meta } = scope;
    el.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'ibx-box';
    const cap = document.createElement('div');
    cap.className = 'ibx-caption';
    const name = document.createElement('span');
    name.className = 'ibx-name';
    name.textContent = meta.name;
    const sub = document.createElement('span');
    sub.className = 'ibx-sub';
    const subLead = document.createElement('strong');
    subLead.textContent = 'National summary';
    const subMid = document.createTextNode(' · ');
    const subYear = document.createElement('strong');
    sub.append(subLead, subMid, subYear);
    cap.append(name, sub);

    const table = document.createElement('table');
    table.className = 'ibx-table';
    const tbody = document.createElement('tbody');
    const rows = rowSpecs(scope).map((spec) => {
      const tr = document.createElement('tr');
      tr.className = 'ibx-row';
      const th = document.createElement('th');
      th.scope = 'row';
      const v = VARS[spec.id];
      tr.dataset.group = v ? v.group : 'fire';
      tr.dataset.var = spec.id;
      tr.setAttribute('role', 'button');
      tr.tabIndex = 0;
      th.textContent = v ? v.label : spec.id;

      const tdVal = document.createElement('td');
      tdVal.className = 'ibx-value';
      const numEl = document.createElement('span');
      numEl.className = 'ibx-num';
      const unitEl = document.createElement('span');
      unitEl.className = 'ibx-unit';
      unitEl.textContent = spec.massUnit ? '' : unitFor(spec.id);
      const deltaEl = document.createElement('span');
      deltaEl.className = 'ibx-delta';
      const deltaValEl = document.createElement('strong');
      deltaEl.append(deltaValEl, document.createTextNode(` vs. ${spec.span || `${y0}–${y1}`} typical`));
      tdVal.append(numEl, unitEl, deltaEl);

      const tdSpark = document.createElement('td');
      tdSpark.className = 'ibx-spark';
      const spark = buildSparkline(data.annualSeries(scope.series, spec.id));
      tdSpark.appendChild(spark.svg);

      tr.append(th, tdVal, tdSpark);
      const focus = () => store.set({ focus: spec.id });
      tr.addEventListener('click', focus);
      tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); focus(); } });
      tbody.appendChild(tr);
      return { spec, tr, numEl, unitEl, deltaValEl, spark, med: data.annualMedian(scope.series, spec.id) };
    });
    table.appendChild(tbody);

    const foot = document.createElement('div');
    foot.className = 'ibx-foot';
    foot.innerHTML = '<strong>Data:</strong> NASA FIRMS (MODIS &amp; VIIRS), USFS, NRCan, Copernicus CAMS · <em>Click any row to highlight it in charts</em>';
    box.append(cap, table, foot);
    el.appendChild(box);
    current = { scope, rows, subYear };
    update(state);
  }

  async function update(state) {
    if (!current) return;
    const { scope, rows, subYear } = current;
    const yr = Number(state.year);
    const snapCurrent = current;
    const myUpdateToken = ++token;
    subYear.textContent = String(yr);

    const yrRow = scope?.summary?.byYear?.get(yr) || null;
    const paintRows = (fireSummary = null) => {
      const hasViirsThisYr = data.annualValue(scope.series, 'viirs_count', yr) !== null
        || !!(yrRow && yrRow.viirsTotal > 0)
        || !!(fireSummary && fireSummary.sensor === 'VIIRS');

      for (const row of rows) {
        const { spec, tr, numEl, unitEl, deltaValEl, spark, med } = row;
        tr.classList.toggle('is-focus', state.focus === spec.id);
        let value = data.annualValue(scope.series, spec.id, yr);
        if (value === null && fireSummary) {
          if (spec.id === 'fire_frp' && fireSummary.totalFrpMw > 0) value = fireSummary.totalFrpMw;
          else if (spec.id === 'fire_count' && fireSummary.sensor !== 'VIIRS' && fireSummary.detections > 0) value = fireSummary.detections;
          else if (spec.id === 'viirs_count' && fireSummary.sensor === 'VIIRS' && fireSummary.detections > 0) value = fireSummary.detections;
        }
        numEl.textContent = spec.massUnit && value !== null ? fmtMass(value, spec.massUnit) : fmt(value, spec.id);
        unitEl.hidden = value === null || !!spec.massUnit;
        deltaValEl.classList.remove('is-surge', 'is-calm');
        if (value !== null && med !== null && med !== 0) {
          const pct = ((value - med) / Math.abs(med)) * 100;
          deltaValEl.textContent = `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)}%`;
          if (pct >= 20) deltaValEl.classList.add('is-surge');
          else if (pct <= -15) deltaValEl.classList.add('is-calm');
        } else if (spec.id === 'fire_count' && value === null && hasViirsThisYr) {
          deltaValEl.textContent = 'VIIRS year';
        } else if (spec.id === 'viirs_count' && yr < 2012) {
          deltaValEl.textContent = 'Starts 2012';
        } else if (spec.id === 'fire_frp' && value === null && yrRow) {
          deltaValEl.textContent = 'Counts only';
        } else if (value === null && scope.emissions?.years?.[yr] && (spec.id === 'fire_count' || spec.id === 'fire_frp' || spec.id === 'viirs_count')) {
          deltaValEl.textContent = 'Smoke data active';
        } else if (value !== null && spec.id === 'fire_frp' && fireSummary?.sensor) {
          deltaValEl.textContent = `${fireSummary.sensor} live`;
        } else {
          deltaValEl.textContent = '—';
        }
        if (spark.dot) {
          const pt = spark.coordsByYear.get(yr);
          spark.dot.style.display = pt ? '' : 'none';
          if (pt) { spark.dot.setAttribute('cx', pt[0]); spark.dot.setAttribute('cy', pt[1]); }
        }
      }
    };

    paintRows(null);
    if (scope?.hasFireCsvs && !yrRow) {
      const fires = await data.getFires(state, yr);
      if (myUpdateToken !== token || current !== snapCurrent || Number(store.get().year) !== yr) return;
      if (fires?.summary) paintRows(fires.summary);
    }
  }

  async function build(state) {
    const my = ++token;
    if (!current) theme.spinner(el, 'Loading summary…');
    const scope = await data.getScope(state);
    if (my !== token) return;
    if (!scope || !scope.meta) { current = null; placeholder(el); return; }
    render(scope, store.get());
  }

  store.subscribe((state, prev) => {
    if (state.countryId !== prev.countryId) build(state);
    else if (state.year !== prev.year || state.focus !== prev.focus) update(state);
  });
  await build(store.get());
}
