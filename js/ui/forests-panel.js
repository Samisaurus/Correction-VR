// js/ui/forests-panel.js
// Purpose: Active Forests & Sensors (#forests-panel) — expanded bottom-left panel showing
//          sensor splits, VIIRS outage days, and searchable forest/region fire counts.

const STYLE = `
.fsp-root { display: flex; flex-direction: column; gap: 9px; height: 100%; }
.fsp-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 8px 12px; }
.fsp-title-wrap { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.fsp-title { font-family: var(--f-serif); font-size: 17px; font-weight: 700; letter-spacing: -0.01em; margin: 0; color: var(--c-ink); }
.fsp-sub { font-family: var(--f-mono); font-size: 11px; color: var(--c-muted); font-variant-numeric: tabular-nums; }
.fsp-tabs {
  display: inline-flex; padding: 2px; gap: 2px;
  background: var(--c-panel); border: 1px solid var(--c-edge); border-radius: 6px;
}
.fsp-tabs button {
  border: 1px solid transparent; border-radius: 4px; padding: 3px 9px;
  font-family: var(--f-mono); font-size: 11px; font-weight: 600;
  color: var(--c-muted); background: transparent; line-height: 1.25;
}
.fsp-tabs button:hover:not([aria-pressed="true"]) { color: var(--c-ink); background: rgba(255, 255, 255, 0.7); }
.fsp-tabs button[aria-pressed="true"] {
  color: var(--c-ink); background: var(--c-paper); border-color: var(--c-edge-hover);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.fsp-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.fsp-chip {
  font-family: var(--f-mono); font-size: 11px; color: var(--c-ink);
  background: var(--c-panel); border: 1px solid var(--c-edge); border-radius: 5px; padding: 3px 8px;
}
.fsp-chip span { color: var(--c-muted); }
.fsp-controls { display: flex; align-items: center; gap: 8px; }
.fsp-search {
  flex: 1 1 auto; min-width: 0; padding: 5px 9px;
  font-family: var(--f-sans); font-size: 12.5px; color: var(--c-ink);
  background: var(--c-paper); border: 1px solid var(--c-edge); border-radius: 6px;
}
.fsp-search:focus { outline: 2px solid var(--c-link); outline-offset: -1px; border-color: var(--c-link); }
.fsp-count { font-family: var(--f-mono); font-size: 11px; color: var(--c-muted); white-space: nowrap; }
.fsp-wrap {
  flex: 1 1 auto; min-height: 168px; max-height: 235px; overflow-y: auto;
  border: 1px solid var(--c-edge); border-radius: 6px; background: var(--c-paper);
}
.fsp-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
.fsp-tbl th, .fsp-tbl td { padding: 5px 9px; border-bottom: 1px solid var(--c-edge); }
.fsp-tbl th {
  position: sticky; top: 0; z-index: 1; background: var(--c-panel);
  font-family: var(--f-mono); font-size: 10.5px; font-weight: 700;
  color: var(--c-muted); text-transform: uppercase; letter-spacing: 0.03em;
}
.fsp-tbl td.num, .fsp-tbl th.num { text-align: right; font-family: var(--f-mono); white-space: nowrap; }
.fsp-tbl tbody tr:hover td { background: rgba(246, 248, 250, 0.85); }
.fsp-tbl tr:last-child td { border-bottom: 0; }
.fsp-empty { padding: 14px; text-align: center; font-style: italic; color: var(--c-muted); font-size: 12.5px; }
`;

export async function mount(el, ctx) {
  const { store, data, theme } = ctx;
  const { injectCss, escHtml, fmtMass, spinner, placeholder } = theme;
  injectCss('fsp', STYLE);

  const regions = await data.getRegions();
  const [y0, y1] = regions && Array.isArray(regions.years) ? regions.years : [2002, 2026];

  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'fsp-root';
  root.innerHTML = `
    <div class="fsp-head">
      <div class="fsp-title-wrap">
        <h3 class="fsp-title">Active Forests &amp; Sensors</h3>
        <span class="fsp-sub" data-ref="sub">Satellite detections and top burned forests</span>
      </div>
      <div class="fsp-tabs" role="group" aria-label="Forest table scope">
        <button type="button" data-mode="year" aria-pressed="true">Selected year</button>
        <button type="button" data-mode="all" aria-pressed="false">All ${y0}–${y1}</button>
      </div>
    </div>
    <div class="fsp-chips" data-ref="chips"></div>
    <div class="fsp-controls">
      <input type="search" class="fsp-search" data-ref="search" placeholder="Search forest or region…" aria-label="Search forest or region">
      <span class="fsp-count" data-ref="count"></span>
    </div>
    <div class="fsp-wrap">
      <table class="fsp-tbl">
        <thead data-ref="thead"></thead>
        <tbody data-ref="tbody"></tbody>
      </table>
    </div>
  `;
  el.appendChild(root);

  const ref = (n) => root.querySelector(`[data-ref="${n}"]`);
  const subEl = ref('sub');
  const chipsEl = ref('chips');
  const searchEl = ref('search');
  const countEl = ref('count');
  const theadEl = ref('thead');
  const tbodyEl = ref('tbody');
  const tabYear = root.querySelector('[data-mode="year"]');
  const tabAll = root.querySelector('[data-mode="all"]');

  let scope = null;
  let mode = 'year';
  let filterText = '';
  let token = 0;

  tabYear.addEventListener('click', () => {
    mode = 'year';
    render(store.get());
  });
  tabAll.addEventListener('click', () => {
    mode = 'all';
    render(store.get());
  });
  searchEl.addEventListener('input', () => {
    filterText = searchEl.value;
    render(store.get());
  });

  function render(state) {
    if (!scope || !scope.meta) return;
    const yr = Number(state.year);
    const summary = scope.summary || null;
    const yrRow = summary?.byYear?.get(yr) || null;
    const emYr = scope.emissions?.years?.[yr] || null;
    const allForests = Array.isArray(summary?.allForests) ? summary.allForests : [];
    const fyRows = summary?.forestYearsByYear?.[yr] || null;

    if (mode === 'all' && !allForests.length) mode = 'year';
    tabYear.setAttribute('aria-pressed', String(mode === 'year'));
    tabAll.setAttribute('aria-pressed', String(mode === 'all'));
    tabAll.hidden = !allForests.length;

    chipsEl.innerHTML = '';
    const chips = [];
    if (yrRow) {
      const mHi = yrRow.highFrpCount ?? yrRow.modisHighFrp;
      const mLo = yrRow.lowFrpCount ?? yrRow.modisLowFrp;
      if (mHi || mLo) chips.push(['MODIS power', `${Number(mHi || 0).toLocaleString()} strong / ${Number(mLo || 0).toLocaleString()} mild`]);
      if (yrRow.viirsHighFrp || yrRow.viirsLowFrp) chips.push(['VIIRS power', `${Number(yrRow.viirsHighFrp || 0).toLocaleString()} strong / ${Number(yrRow.viirsLowFrp || 0).toLocaleString()} mild`]);
      if (yrRow.inNationalForestCount || yrRow.otherForestCount) chips.push(['Land type', `${Number(yrRow.inNationalForestCount || 0).toLocaleString()} national / ${Number(yrRow.otherForestCount || 0).toLocaleString()} other`]);
      if (yrRow.terraCount || yrRow.aquaCount) chips.push(['Satellites', `Terra ${Number(yrRow.terraCount || 0).toLocaleString()} · Aqua ${Number(yrRow.aquaCount || 0).toLocaleString()}`]);
      if (yrRow.dayCount || yrRow.nightCount) chips.push(['Time of day', `Day ${Number(yrRow.dayCount || 0).toLocaleString()} · Night ${Number(yrRow.nightCount || 0).toLocaleString()}`]);
    }
    const outages = summary?.viirsOutageByYear?.[yr];
    if (outages?.length) {
      chips.push(['Sensor outages', `${outages.length} days (${outages.slice(0, 2).join(', ')}${outages.length > 2 ? '…' : ''})`]);
    } else if (summary?.viirsOutageDates?.length && mode === 'all') {
      chips.push(['VIIRS archive gaps', `${summary.viirsOutageDates.length} total days (${y0}–${y1})`]);
    }
    if (!chips.length && emYr) {
      chips.push(['CO₂ output', fmtMass(emYr.co2, 'Mt')]);
      chips.push(['Smoke PM₂.₅', fmtMass(emYr.pm25)]);
    }

    chipsEl.hidden = !chips.length;
    for (const [k, v] of chips) {
      const span = document.createElement('span');
      span.className = 'fsp-chip';
      span.innerHTML = `<span>${escHtml(k)}:</span> ${escHtml(v)}`;
      chipsEl.appendChild(span);
    }

    const q = filterText.trim().toLowerCase();
    tbodyEl.innerHTML = '';

    if (mode === 'all' && allForests.length) {
      subEl.textContent = `${scope.meta.shortName} · ${allForests.length} catalogued forests & areas (${y0}–${y1})`;
      theadEl.innerHTML = '<tr><th>Forest / Area</th><th>Region</th><th class="num">MODIS</th><th class="num">VIIRS</th><th class="num">Peak MW</th></tr>';
      const filtered = q
        ? allForests.filter((f) => f.name.toLowerCase().includes(q) || (f.state && f.state.toLowerCase().includes(q)))
        : allForests;
      countEl.textContent = `${filtered.length} shown`;
      tbodyEl.innerHTML = filtered.length
        ? filtered.slice(0, 120).map((f) => `<tr><td>${escHtml(f.name)}</td><td>${escHtml(f.state || '—')}</td><td class="num">${f.modis.toLocaleString()}</td><td class="num">${f.viirs.toLocaleString()}</td><td class="num">${Math.round(f.maxFrpMw).toLocaleString()}</td></tr>`).join('')
        : '<tr><td colspan="5" class="fsp-empty">No matching forests found</td></tr>';
      return;
    }

    if (fyRows?.length) {
      subEl.textContent = `${scope.meta.shortName} · ${yr} active forests (${fyRows.length} total)`;
      theadEl.innerHTML = '<tr><th>Forest / Area</th><th class="num">MODIS</th><th class="num">VIIRS</th><th class="num">Total</th></tr>';
      const filtered = q ? fyRows.filter(([name]) => name.toLowerCase().includes(q)) : fyRows;
      countEl.textContent = `${filtered.length} shown`;
      tbodyEl.innerHTML = filtered.length
        ? filtered.slice(0, 120).map(([name, m, v]) => `<tr><td>${escHtml(name)}</td><td class="num">${m.toLocaleString()}</td><td class="num">${v.toLocaleString()}</td><td class="num">${(m + v).toLocaleString()}</td></tr>`).join('')
        : '<tr><td colspan="4" class="fsp-empty">No matching forests in this year</td></tr>';
    } else if (yrRow?.topForests?.length) {
      subEl.textContent = `${scope.meta.shortName} · ${yr} leading forests & regions`;
      theadEl.innerHTML = `<tr><th>Forest / Area</th><th>Region</th><th class="num">${escHtml(yrRow.sensor || 'Det.')}</th><th class="num">Power MW</th></tr>`;
      const filtered = q
        ? yrRow.topForests.filter((f) => f.name.toLowerCase().includes(q) || (f.state && f.state.toLowerCase().includes(q)))
        : yrRow.topForests;
      countEl.textContent = `${filtered.length} shown`;
      tbodyEl.innerHTML = filtered.length
        ? filtered.map((f) => `<tr><td>${escHtml(f.name)}</td><td>${escHtml(f.state || '—')}</td><td class="num">${f.count.toLocaleString()}</td><td class="num">${f.frpMw ? f.frpMw.toLocaleString() : '—'}</td></tr>`).join('')
        : '<tr><td colspan="4" class="fsp-empty">No matching forests in this year</td></tr>';
    } else if (emYr?.topForests?.length) {
      subEl.textContent = `${scope.meta.shortName} · ${yr} top smoke-emitting forests`;
      theadEl.innerHTML = '<tr><th>Forest / Area</th><th>Region</th><th class="num">CO₂ Mt</th><th class="num">PM₂.₅ kt</th></tr>';
      const filtered = q
        ? emYr.topForests.filter((f) => f.name.toLowerCase().includes(q) || (f.region && f.region.toLowerCase().includes(q)))
        : emYr.topForests;
      countEl.textContent = `${filtered.length} shown`;
      tbodyEl.innerHTML = filtered.length
        ? filtered.map((f) => `<tr><td>${escHtml(f.name)}</td><td>${escHtml(f.region || '—')}</td><td class="num">${(f.co2 / 1e6).toFixed(2)}</td><td class="num">${(f.pm25 / 1e3).toFixed(1)}</td></tr>`).join('')
        : '<tr><td colspan="4" class="fsp-empty">No matching forests in this year</td></tr>';
    } else {
      subEl.textContent = `${scope.meta.shortName} · ${yr} archive`;
      countEl.textContent = '0 shown';
      theadEl.innerHTML = '<tr><th>Forest / Area</th><th>Region</th><th class="num">Detections</th></tr>';
      tbodyEl.innerHTML = '<tr><td colspan="3" class="fsp-empty">Switch to "All 2002–2026" above to browse the full national forest list</td></tr>';
    }
  }

  async function build(state) {
    const my = ++token;
    if (!scope) spinner(tbodyEl, 'Loading forests & sensors…');
    const sc = await data.getScope(state);
    if (my !== token) return;
    scope = sc && sc.meta ? sc : null;
    if (!scope) {
      placeholder(el);
      return;
    }
    if (!root.parentNode) {
      el.innerHTML = '';
      el.appendChild(root);
    }
    render(store.get());
  }

  store.subscribe((state, prev) => {
    if (state.countryId !== prev.countryId) build(state);
    else if (state.year !== prev.year) render(state);
  });

  await build(store.get());
}
