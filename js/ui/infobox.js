// js/ui/infobox.js
// Purpose: Wikipedia-style infobox (#infobox): the selected year's value, a sparkline and the change
//          against the 2012–2025 median for every variable of the current scope; rows set focus.
//          Shows the MOCK DATA badge while regions.json has "mock": true.
// Exports: mount(el, ctx)
// Owner: GPT-UI · Task G3 (built here against the Session Primer v2)

const STYLE = `
.ibx-box { border: 1px solid var(--c-rule); background: var(--c-panel); border-radius: 2px; font-size: 14px; }
.ibx-caption { position: relative; padding: 10px 14px 8px; border-bottom: 1px solid var(--c-rule); }
.ibx-name { display: block; font-family: var(--f-serif); font-size: 17px; font-weight: 600; line-height: 1.25; padding-right: 92px; }
.ibx-sub { display: block; margin-top: 3px; font-family: var(--f-mono); font-size: 12px; color: var(--c-muted); }
.ibx-badge { position: absolute; top: 10px; right: 12px; padding: 1px 6px; border: 1px solid var(--c-fire); border-radius: 2px;
  color: var(--c-fire); font-family: var(--f-mono); font-size: 11px; font-weight: 500; letter-spacing: 0.04em; }
.ibx-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.ibx-row[data-group="fire"] { --ibx-color: var(--c-fire); }
.ibx-row[data-group="air"] { --ibx-color: var(--c-smoke); }
.ibx-row[data-group="water"] { --ibx-color: var(--c-water); }
.ibx-row[data-group="fish"] { --ibx-color: var(--c-fish); }
.ibx-row th, .ibx-row td { padding: 7px 10px; border-bottom: 1px solid var(--c-rule); vertical-align: middle; }
.ibx-row:last-of-type th, .ibx-row:last-of-type td { border-bottom: 0; }
.ibx-row th { width: 44%; font-weight: 500; border-left: 3px solid transparent; text-align: left; }
.ibx-row[role="button"] { cursor: pointer; }
.ibx-row[role="button"]:hover th, .ibx-row[role="button"]:hover td { background: var(--c-paper); }
.ibx-row.is-focus th { border-left-color: var(--ibx-color); }
.ibx-row:focus-visible { outline: 2px solid var(--c-link); outline-offset: -2px; }
.ibx-sublabel { display: block; font-size: 11px; color: var(--c-muted); }
.ibx-value { white-space: nowrap; }
.ibx-num { font-family: var(--f-mono); font-size: 15px; font-variant-numeric: tabular-nums; }
.ibx-unit { font-size: 12px; color: var(--c-muted); margin-left: 3px; }
.ibx-delta { display: block; font-size: 11px; color: var(--c-muted); margin-top: 1px; }
.ibx-spark { width: 84px; text-align: right; }
.ibx-spark svg { display: inline-block; width: 72px; height: 18px; color: var(--ibx-color); overflow: visible; }
.ibx-spark polyline { fill: none; stroke: currentColor; stroke-width: 1.2; }
.ibx-spark circle { fill: var(--c-year); stroke: var(--c-paper); stroke-width: 1; }
.ibx-link { color: var(--c-link); }
.ibx-foot { padding: 7px 12px; font-size: 12px; color: var(--c-muted); border-top: 1px solid var(--c-rule); }
.ibx-missing { font-style: italic; color: var(--c-muted); font-size: 13px; }
@media (max-width: 480px) {
  .ibx-row th { width: 38%; }
  .ibx-spark { width: 60px; }
  .ibx-spark svg { width: 52px; }
  .ibx-value { white-space: normal; }
  .ibx-row th, .ibx-row td { padding: 6px 6px; }
}
`;

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

function median(values) {
  const v = values.filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function sparkline(points, year) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 72 18');
  svg.setAttribute('aria-hidden', 'true');
  const vals = points.map((p) => p.value).filter((v) => v !== null);
  if (vals.length < 2) return svg;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const n = points.length;
  const x = (i) => 1 + (70 * i) / Math.max(1, n - 1);
  const y = (v) => (hi === lo ? 9 : 16 - (14 * (v - lo)) / (hi - lo));
  let run = [];
  const flush = () => {
    if (run.length > 1) {
      const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      pl.setAttribute('points', run.join(' '));
      svg.appendChild(pl);
    }
    run = [];
  };
  points.forEach((p, i) => (p.value === null ? flush() : run.push(`${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)));
  flush();
  const sel = points.findIndex((p) => p.year === year && p.value !== null);
  if (sel >= 0) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', x(sel).toFixed(1));
    c.setAttribute('cy', y(points[sel].value).toFixed(1));
    c.setAttribute('r', '2.4');
    svg.appendChild(c);
  }
  return svg;
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
  let current = null; // { scope, rows }
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
    cap.append(name, sub);
    if (regions.mock === true) {
      const badge = document.createElement('span');
      badge.className = 'ibx-badge';
      badge.textContent = 'MOCK DATA';
      badge.title = 'Placeholder data from tools/make_mock.py — not real measurements';
      cap.appendChild(badge);
    }
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
      const tdSpark = document.createElement('td');
      tdSpark.className = 'ibx-spark';
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
      return { spec, tr, tdVal, tdSpark, points: data.annualSeries(scope.series, spec.id, spec.wb) };
    });
    table.appendChild(tbody);
    const foot = document.createElement('div');
    foot.className = 'ibx-foot';
    foot.textContent = 'Sources: NASA FIRMS (VIIRS), MERRA-2, MODIS-Aqua; DFO, NOAA, FAO';
    box.append(cap, table, foot);
    el.appendChild(box);
    current = { scope, rows, sub, countryShort: country ? country.shortName : meta.countryId };
    update(state);
  }

  function update(state) {
    if (!current) return;
    const { scope, rows, sub, countryShort } = current;
    const { meta } = scope;
    sub.textContent = meta.kind === 'basin' ? `Case study in ${countryShort} · ${state.year}` : `Whole country · ${state.year}`;
    for (const row of rows) {
      if (row.spec.link) continue;
      const { spec, tr, tdVal, tdSpark, points } = row;
      tr.classList.toggle('is-focus', state.focus === spec.id);
      const value = data.annualValue(scope.series, spec.id, state.year, spec.wb);
      tdVal.innerHTML = '';
      const num = document.createElement('span');
      num.className = 'ibx-num';
      num.textContent = theme.fmt(value, spec.id);
      tdVal.appendChild(num);
      if (value !== null) {
        const unit = document.createElement('span');
        unit.className = 'ibx-unit';
        unit.textContent = theme.unitFor(spec.id, meta);
        tdVal.appendChild(unit);
      }
      const delta = document.createElement('span');
      delta.className = 'ibx-delta';
      const med = median(points.map((p) => p.value));
      if (value !== null && med !== null && med !== 0) {
        const pct = ((value - med) / Math.abs(med)) * 100;
        delta.textContent = `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)} % vs ${y0}–${y1} median`;
      } else {
        delta.textContent = `— vs ${y0}–${y1} median`;
      }
      tdVal.appendChild(delta);
      tdSpark.innerHTML = '';
      tdSpark.appendChild(sparkline(points, state.year));
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
