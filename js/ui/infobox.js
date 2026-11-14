// js/ui/infobox.js
// Purpose: Wikipedia-style infobox (#infobox): the selected year's value, a sparkline and the change
//          against the 2012–2025 median for every variable of the current scope; rows set focus.

const STYLE = `
.ibx-box { border: 1px solid var(--c-edge); background: var(--c-paper); border-radius: 2px; font-size: 14px; }
.ibx-caption { position: relative; padding: 10px 14px 8px; border-bottom: 1px solid var(--c-edge); }
.ibx-name { display: block; font-family: var(--f-serif); font-size: 18px; font-weight: 700; line-height: 1.25; color: var(--c-ink); }
.ibx-sub { display: block; margin-top: 3px; font-family: var(--f-mono); font-size: 12px; color: var(--c-muted); }
.ibx-sub strong { color: var(--c-ink); font-weight: 600; }
.ibx-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.ibx-row[data-group="fire"] { --ibx-color: var(--c-fire); }
.ibx-row[data-group="air"] { --ibx-color: var(--c-smoke); }
.ibx-row[data-group="water"] { --ibx-color: var(--c-water); }
.ibx-row[data-group="fish"] { --ibx-color: var(--c-fish); }
.ibx-row th, .ibx-row td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--c-edge);
  vertical-align: middle;
  transition: background-color 160ms var(--ease-out), border-color 180ms var(--ease-out);
}
.ibx-row:last-of-type th, .ibx-row:last-of-type td { border-bottom: 0; }
.ibx-row th {
  width: 44%;
  font-weight: 600;
  color: var(--c-ink);
  border-left: 3px solid transparent;
  text-align: left;
  transition: background-color 160ms var(--ease-out), border-left-color 200ms var(--ease-out);
}
.ibx-row[role="button"] { cursor: pointer; }
.ibx-row[role="button"]:hover th, .ibx-row[role="button"]:hover td { background: var(--c-panel); }
.ibx-row[role="button"]:active th, .ibx-row[role="button"]:active td { background: #EEF2F6; }
.ibx-row.is-focus th { border-left-color: var(--ibx-color); background: rgba(15, 23, 42, 0.02); }
.ibx-row.is-focus td { background: rgba(15, 23, 42, 0.02); }
.ibx-row:focus-visible { outline: 2px solid var(--c-link); outline-offset: -2px; }
.ibx-sublabel { display: block; font-size: 11px; font-weight: 500; color: var(--c-muted); margin-top: 1px; }
.ibx-value { white-space: nowrap; }
.ibx-num { font-family: var(--f-mono); font-size: 15.5px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--c-ink); }
.ibx-unit { font-size: 12px; font-weight: 500; color: var(--c-muted); margin-left: 4px; }
.ibx-delta { display: block; font-size: 11.5px; color: var(--c-muted); margin-top: 2px; }
.ibx-delta strong { font-weight: 600; color: var(--c-ink); }
.ibx-spark { width: 84px; text-align: right; }
.ibx-spark svg { display: inline-block; width: 72px; height: 18px; color: var(--ibx-color); overflow: visible; }
.ibx-spark polyline { fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.ibx-spark circle { fill: var(--c-year); stroke: var(--c-paper); stroke-width: 1.2; transition: cx 180ms var(--ease-out), cy 180ms var(--ease-out); }
.ibx-link { color: var(--c-link); font-weight: 600; }
.ibx-foot { padding: 8px 14px; font-size: 12px; color: var(--c-muted); border-top: 1px solid var(--c-edge); }
.ibx-foot strong { color: var(--c-ink); font-weight: 600; }
.ibx-missing { font-style: italic; color: var(--c-muted); font-size: 13px; }
@media (max-width: 480px) {
  .ibx-row th { width: 38%; }
  .ibx-spark { width: 60px; }
  .ibx-spark svg { width: 52px; }
  .ibx-value { white-space: normal; }
  .ibx-row th, .ibx-row td { padding: 6px 6px; }
}
`;
const NS = 'http://www.w3.org/2000/svg';

function injectStyle() {
  if (document.querySelector('style[data-module="ibx"]')) return;
  const style = document.createElement('style');
  style.dataset.module = 'ibx';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

function hasAny(series, varId) {
  const v = series && series.variables && series.variables[varId];
  if (!v) return false;
  return (v.annual || []).some((d) => d[1] !== null) || (v.monthly || []).some((d) => d[1] !== null);
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
    if (p.value === null) {
      flush();
    } else {
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
  injectStyle();
  const { store, data, theme } = ctx;
  const regions = await data.getRegions();
  if (!regions) {
    theme.placeholder(el);
    return;
  }
  const [y0, y1] = Array.isArray(regions.years) ? regions.years : [2012, 2025];
  let current = null;
  let token = 0;

  function rowSpecs(scope) {
    const { meta, series } = scope;
    const rows = [{ id: 'fire_count' }, { id: 'fire_frp' }, { id: 'aod' }];
    if (hasAny(series, 'pm25')) rows.push({ id: 'pm25' });
    if (meta.kind === 'basin') {
      const wb = meta.primaryWaterBody;
      const body = (meta.waterBodies || []).find((w) => w.id === wb);
      rows.push({ id: 'kd490', wb, sub: body ? body.name : wb }, { id: 'chlor_a', wb, sub: body ? body.name : wb });
    } else {
      rows.push({ link: true });
    }
    rows.push({ id: meta.fishMetric });
    return rows;
  }

  function render(scope, state) {
    const { meta } = scope;
    const country = regions.countries.find((c) => c.id === meta.countryId);
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
    subLead.textContent = meta.kind === 'basin' ? 'Case study' : 'Whole country';
    const subMid = document.createTextNode(meta.kind === 'basin' ? ` in ${country ? country.shortName : meta.countryId} · ` : ' · ');
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
      if (spec.link) {
        tr.dataset.group = 'water';
        th.textContent = 'Water';
        const td = document.createElement('td');
        td.colSpan = 2;
        const a = document.createElement('a');
        a.href = '#';
        a.className = 'ibx-link';
        a.textContent = 'Measured in the case-study basin →';
        a.addEventListener('click', (ev) => {
          ev.preventDefault();
          store.set({ view: 'basin' });
        });
        td.appendChild(a);
        tr.append(th, td);
        tbody.appendChild(tr);
        return { spec, tr };
      }
      const v = theme.VARS[spec.id];
      tr.dataset.group = v ? v.group : 'fire';
      tr.dataset.var = spec.id;
      tr.setAttribute('role', 'button');
      tr.tabIndex = 0;
      th.textContent = v ? v.label : spec.id;
      if (spec.sub) {
        const s = document.createElement('span');
        s.className = 'ibx-sublabel';
        s.textContent = spec.sub;
        th.appendChild(s);
      }

      const tdVal = document.createElement('td');
      tdVal.className = 'ibx-value';
      const numEl = document.createElement('span');
      numEl.className = 'ibx-num';
      const unitEl = document.createElement('span');
      unitEl.className = 'ibx-unit';
      unitEl.textContent = theme.unitFor(spec.id, meta);
      const deltaEl = document.createElement('span');
      deltaEl.className = 'ibx-delta';
      const deltaValEl = document.createElement('strong');
      const deltaSuffixEl = document.createTextNode(` vs ${y0}–${y1} median`);
      deltaEl.append(deltaValEl, deltaSuffixEl);
      tdVal.append(numEl, unitEl, deltaEl);

      const tdSpark = document.createElement('td');
      tdSpark.className = 'ibx-spark';
      const points = data.annualSeries(scope.series, spec.id, spec.wb);
      const spark = buildSparkline(points);
      tdSpark.appendChild(spark.svg);

      tr.append(th, tdVal, tdSpark);
      const focus = () => store.set({ focus: spec.id });
      tr.addEventListener('click', focus);
      tr.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          focus();
        }
      });
      tbody.appendChild(tr);
      const med = data.annualMedian(scope.series, spec.id, spec.wb);
      return { spec, tr, numEl, unitEl, deltaValEl, spark, med };
    });
    table.appendChild(tbody);
    const foot = document.createElement('div');
    foot.className = 'ibx-foot';
    foot.innerHTML = '<strong>Sources:</strong> NASA FIRMS (VIIRS), MERRA-2, MODIS-Aqua · DFO, NOAA, FAO';
    box.append(cap, table, foot);
    el.appendChild(box);
    current = { scope, rows, subYear };
    update(state);
  }

  function update(state) {
    if (!current) return;
    const { scope, rows, subYear } = current;
    const yr = Number(state.year);
    subYear.textContent = String(yr);
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (row.spec.link) continue;
      const { spec, tr, numEl, unitEl, deltaValEl, spark, med } = row;
      tr.classList.toggle('is-focus', state.focus === spec.id);
      const value = data.annualValue(scope.series, spec.id, yr, spec.wb);
      numEl.textContent = theme.fmt(value, spec.id);
      unitEl.hidden = value === null;
      if (value !== null && med !== null && med !== 0) {
        const pct = ((value - med) / Math.abs(med)) * 100;
        const sign = pct >= 0 ? '+' : '−';
        deltaValEl.textContent = `${sign}${Math.abs(pct).toFixed(0)}%`;
      } else {
        deltaValEl.textContent = '—';
      }
      if (spark.dot) {
        const pt = spark.coordsByYear.get(yr);
        if (pt) {
          spark.dot.setAttribute('cx', pt[0]);
          spark.dot.setAttribute('cy', pt[1]);
          spark.dot.style.display = '';
        } else {
          spark.dot.style.display = 'none';
        }
      }
    }
  }

  async function build(state) {
    const my = ++token;
    const scope = await data.getScope(state);
    if (my !== token) return;
    if (!scope || !scope.meta) {
      current = null;
      theme.placeholder(el);
      return;
    }
    render(scope, state);
  }

  store.subscribe((state, prev) => {
    if (state.countryId !== prev.countryId || state.view !== prev.view) build(state);
    else if (state.year !== prev.year || state.focus !== prev.focus) update(state);
  });
  await build(store.get());
}
