// js/ui/local-risk.js
// Purpose: Local Fire & Smoke Risk (#local-risk) — pick a country & city or drop a pin on the map
//          to see realistic personal fire risk %, separate smoke haze odds, and personalized everyday tips.

import { CITIES_BY_COUNTRY, computeLocalFireRisk } from '../forecast.js';

const STYLE = `
.lrk-root { display: flex; flex-direction: column; gap: 10px; height: 100%; }
.lrk-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 6px 12px; }
.lrk-title-wrap { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.lrk-title { font-family: var(--f-serif); font-size: 17px; font-weight: 700; color: var(--c-ink); margin: 0; letter-spacing: -0.01em; }
.lrk-sub { font-size: 11.5px; color: var(--c-muted); line-height: 1.35; }
.lrk-countries {
  display: inline-flex; padding: 2px; gap: 2px;
  background: var(--c-panel); border: 1px solid var(--c-edge); border-radius: 6px;
}
.lrk-cbtn {
  border: 1px solid transparent; border-radius: 4px; padding: 3px 8px;
  font-size: 11.5px; font-weight: 600; color: var(--c-muted); background: transparent; line-height: 1.25;
}
.lrk-cbtn:hover:not([aria-pressed="true"]) { color: var(--c-ink); background: rgba(255, 255, 255, 0.7); }
.lrk-cbtn[aria-pressed="true"] {
  color: var(--c-ink); background: var(--c-paper); border-color: var(--c-edge-hover);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}

.lrk-controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.lrk-select {
  width: 100%; min-width: 0; padding: 6px 9px; border-radius: 6px;
  border: 1px solid var(--c-edge); background: var(--c-paper);
  font-family: var(--f-sans); font-size: 12.5px; font-weight: 500; color: var(--c-ink);
  cursor: pointer;
}
.lrk-select:focus-visible { outline: 2px solid var(--c-link); outline-offset: 1px; }
.lrk-pin-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 11px; border-radius: 6px; border: 1px solid var(--c-edge-hover);
  background: var(--c-panel); color: var(--c-ink);
  font-size: 12px; font-weight: 600; white-space: nowrap;
}
.lrk-pin-btn:hover { background: var(--c-paper); border-color: var(--c-ink); }
.lrk-pin-btn[aria-pressed="true"] {
  background: var(--c-fire); border-color: var(--c-fire); color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(213, 94, 0, 0.25);
}

.lrk-pin-hint {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 6px 10px; border-radius: 5px;
  background: rgba(213, 94, 0, 0.08); border: 1px solid rgba(213, 94, 0, 0.35);
  font-size: 11.5px; color: var(--c-ink);
}
.lrk-pin-hint[hidden] { display: none; }

.lrk-body { display: flex; flex-direction: column; gap: 9px; flex: 1 1 auto; }
.lrk-hero {
  display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; align-items: center;
  padding: 10px 12px; border-radius: 6px; border: 1px solid var(--c-edge); background: var(--c-panel);
}
.lrk-pct-box { display: flex; flex-direction: column; align-items: flex-start; min-width: 96px; }
.lrk-pct-lbl { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--c-muted); margin-bottom: 2px; }
.lrk-pct {
  font-family: var(--f-mono); font-size: 29px; font-weight: 700; line-height: 1;
  font-variant-numeric: tabular-nums; letter-spacing: -0.02em; color: var(--c-ink);
}
.lrk-pct.is-high { color: #B91C1C; }
.lrk-pct.is-elevated { color: #C2410C; }
.lrk-pct.is-moderate { color: #B45309; }
.lrk-pct.is-low { color: #0F766E; }
.lrk-tier {
  margin-top: 4px; display: inline-block; padding: 2px 7px; border-radius: 4px;
  font-family: var(--f-mono); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  border: 1px solid var(--c-edge); background: var(--c-paper);
}
.lrk-tier.is-high { background: #FEF2F2; border-color: #FCA5A5; color: #B91C1C; }
.lrk-tier.is-elevated { background: #FFF7ED; border-color: #FDBA74; color: #C2410C; }
.lrk-tier.is-moderate { background: #FFFBEB; border-color: #FCD34D; color: #B45309; }
.lrk-tier.is-low { background: #F0FDF4; border-color: #86EFAC; color: #15803D; }

.lrk-meter-col { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.lrk-loc-row { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
.lrk-loc-name { font-size: 13px; font-weight: 700; color: var(--c-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lrk-coords { font-family: var(--f-mono); font-size: 10.5px; color: var(--c-muted); flex: 0 0 auto; }
.lrk-track { height: 7px; border-radius: 4px; background: #E2E8F0; overflow: hidden; }
.lrk-fill { height: 100%; border-radius: 4px; transition: width 260ms var(--ease-out); }
.lrk-fill.is-high { background: linear-gradient(90deg, #F59E0B, #DC2626); }
.lrk-fill.is-elevated { background: linear-gradient(90deg, #FBBF24, #EA580C); }
.lrk-fill.is-moderate { background: linear-gradient(90deg, #34D399, #F59E0B); }
.lrk-fill.is-low { background: linear-gradient(90deg, #2DD4BF, #0D9488); }
.lrk-summary { margin: 0; font-size: 11.5px; line-height: 1.4; color: var(--c-muted); }

.lrk-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.lrk-stat { background: var(--c-paper); border: 1px solid var(--c-edge); border-radius: 5px; padding: 5px 8px; min-width: 0; }
.lrk-stat-k { display: block; font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--c-muted); }
.lrk-stat-v { display: block; font-family: var(--f-mono); font-size: 12px; font-weight: 700; color: var(--c-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lrk-stat-v.is-smoke { color: #6A3093; }

.lrk-advice {
  padding: 8px 11px; border-radius: 5px; border: 1px solid var(--c-edge);
  border-left: 3px solid var(--c-win-border-hover, var(--c-ink));
  background: var(--c-paper); display: flex; flex-direction: column; gap: 4px; margin-top: auto;
}
.lrk-advice-head { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--c-ink); }
.lrk-advice-list { margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; line-height: 1.38; color: var(--c-muted); }
.lrk-advice-list li::marker { color: var(--c-fire); }

@media (max-width: 560px) {
  .lrk-controls { grid-template-columns: 1fr; }
  .lrk-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
`;

const PIN_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';

function defaultCityFor(countryId) {
  const list = CITIES_BY_COUNTRY[countryId] || CITIES_BY_COUNTRY.usa;
  return list[0];
}

export async function mount(el, ctx) {
  const { store, data, theme } = ctx;
  const { injectCss, escHtml, spinner } = theme;
  injectCss('lrk', STYLE);

  const regions = await data.getRegions();
  const countries = regions && Array.isArray(regions.countries)
    ? regions.countries
    : [{ id: 'canada', shortName: 'Canada' }, { id: 'usa', shortName: 'USA' }, { id: 'russia', shortName: 'Russia' }];

  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'lrk-root';
  root.innerHTML = `
    <div class="lrk-head">
      <div class="lrk-title-wrap">
        <h3 class="lrk-title">Local Fire &amp; Smoke Risk Near You</h3>
        <span class="lrk-sub">Pick a city or drop a map pin to see realistic local fire odds, smoke risk, and tailored tips</span>
      </div>
      <div class="lrk-countries" role="group" aria-label="Select country for local risk" data-ref="cGroup"></div>
    </div>
    <div class="lrk-controls">
      <select class="lrk-select" aria-label="Choose a city or town" data-ref="citySelect"></select>
      <button type="button" class="lrk-pin-btn" data-ref="pinBtn" aria-pressed="false">${PIN_ICON}<span data-ref="pinBtnLabel">Drop Pin on Map</span></button>
    </div>
    <div class="lrk-pin-hint" data-ref="pinHint" hidden>
      <span>Click anywhere on the map to place your 100 km check pin.</span>
      <button type="button" class="lrk-cbtn" data-ref="cancelPin">Cancel</button>
    </div>
    <div class="lrk-body" data-ref="body"></div>
  `;
  el.appendChild(root);

  const ref = (n) => root.querySelector(`[data-ref="${n}"]`);
  const cGroup = ref('cGroup');
  const citySelect = ref('citySelect');
  const pinBtn = ref('pinBtn');
  const pinBtnLabel = ref('pinBtnLabel');
  const pinHint = ref('pinHint');
  const cancelPin = ref('cancelPin');
  const body = ref('body');

  const cBtns = new Map();
  for (const c of countries) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lrk-cbtn';
    b.textContent = c.shortName || c.id;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      const city = defaultCityFor(c.id);
      store.set({
        countryId: c.id,
        playing: false,
        pinMode: false,
        localPin: { countryId: c.id, lat: city.lat, lon: city.lon, label: city.name, isCity: true },
      });
    });
    cGroup.appendChild(b);
    cBtns.set(c.id, b);
  }

  function populateCities(countryId, currentPin) {
    const list = CITIES_BY_COUNTRY[countryId] || [];
    citySelect.innerHTML = '';
    if (currentPin && !currentPin.isCity) {
      const customOpt = document.createElement('option');
      customOpt.value = '__pin__';
      customOpt.textContent = `Map Pin (${currentPin.lat.toFixed(2)}°, ${currentPin.lon.toFixed(2)}°)`;
      citySelect.appendChild(customOpt);
    }
    for (const city of list) {
      const opt = document.createElement('option');
      opt.value = city.name;
      opt.textContent = `${city.name} — ${city.region}`;
      citySelect.appendChild(opt);
    }
    if (currentPin && currentPin.isCity && list.some((c) => c.name === currentPin.label)) {
      citySelect.value = currentPin.label;
    } else if (currentPin && !currentPin.isCity) {
      citySelect.value = '__pin__';
    } else if (list.length) {
      citySelect.value = list[0].name;
    }
  }

  citySelect.addEventListener('change', () => {
    const val = citySelect.value;
    if (val === '__pin__') return;
    const countryId = store.get().countryId || 'usa';
    const city = (CITIES_BY_COUNTRY[countryId] || []).find((c) => c.name === val);
    if (!city) return;
    store.set({
      pinMode: false,
      localPin: { countryId, lat: city.lat, lon: city.lon, label: city.name, isCity: true },
    });
  });

  pinBtn.addEventListener('click', () => {
    const cur = store.get();
    store.set({ pinMode: !cur.pinMode });
  });
  cancelPin.addEventListener('click', () => store.set({ pinMode: false }));

  let evalToken = 0;

  async function evaluate(state) {
    const my = ++evalToken;
    const countryId = state.countryId || 'usa';
    for (const [id, b] of cBtns) b.setAttribute('aria-pressed', String(id === countryId));

    let pin = state.localPin;
    if (!pin || pin.countryId !== countryId) {
      const def = defaultCityFor(countryId);
      pin = { countryId, lat: def.lat, lon: def.lon, label: def.name, isCity: true };
      store.set({ localPin: pin });
    }

    populateCities(countryId, pin);
    pinBtn.setAttribute('aria-pressed', String(!!state.pinMode));
    pinBtnLabel.textContent = state.pinMode ? 'Click on Map…' : 'Drop Pin on Map';
    pinHint.hidden = !state.pinMode;

    spinner(body, `Checking ${countryId.toUpperCase()} fire maps near ${pin.label}…`);

    const [scope, grids] = await Promise.all([
      data.getScope(state),
      data.getAllFireGrids(countryId),
    ]);
    if (my !== evalToken) return;

    const risk = computeLocalFireRisk({
      countryId,
      lat: pin.lat,
      lon: pin.lon,
      label: pin.label,
      grids,
      scope,
      horizonYear: state.horizonYear,
      warmingPct: state.warmingPct,
    });

    const coordStr = `${Math.abs(risk.lat).toFixed(2)}°${risk.lat >= 0 ? 'N' : 'S'}, ${Math.abs(risk.lon).toFixed(2)}°${risk.lon >= 0 ? 'E' : 'W'}`;
    const nearestStr = risk.nearestKm !== null ? `${risk.nearestKm.toLocaleString()} km` : '—';
    const peakYrStr = risk.peakYear ? String(risk.peakYear) : 'None';

    body.innerHTML = `
      <div class="lrk-hero">
        <div class="lrk-pct-box">
          <span class="lrk-pct-lbl">Direct Fire Threat</span>
          <span class="lrk-pct ${risk.tierClass}">${risk.riskPct}%</span>
          <span class="lrk-tier ${risk.tierClass}">${escHtml(risk.tier)}</span>
        </div>
        <div class="lrk-meter-col">
          <div class="lrk-loc-row">
            <span class="lrk-loc-name" title="${escHtml(risk.label)}">${escHtml(risk.label)}</span>
            <span class="lrk-coords">${coordStr}</span>
          </div>
          <div class="lrk-track" aria-hidden="true">
            <div class="lrk-fill ${risk.tierClass}" style="width:${risk.riskPct}%"></div>
          </div>
          <p class="lrk-summary">${escHtml(risk.summary)}</p>
        </div>
      </div>
      <div class="lrk-metrics">
        <div class="lrk-stat">
          <span class="lrk-stat-k">Smoke Haze Odds</span>
          <span class="lrk-stat-v is-smoke">${risk.smokeRiskPct}%</span>
        </div>
        <div class="lrk-stat">
          <span class="lrk-stat-k">Fire Years (100 km)</span>
          <span class="lrk-stat-v">${risk.activeYearsCount} / ${risk.totalYears}</span>
        </div>
        <div class="lrk-stat">
          <span class="lrk-stat-k">Closest Fire</span>
          <span class="lrk-stat-v">${escHtml(nearestStr)}</span>
        </div>
        <div class="lrk-stat">
          <span class="lrk-stat-k">Busiest Year</span>
          <span class="lrk-stat-v">${escHtml(peakYrStr)}</span>
        </div>
      </div>
      <div class="lrk-advice">
        <span class="lrk-advice-head">Tailored Safety Tips for ${escHtml(risk.label)} (${risk.horizonYear} · +${risk.warmingPct}%)</span>
        <ul class="lrk-advice-list">
          ${risk.advice.map((tip) => `<li>${escHtml(tip)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  store.subscribe((state, prev) => {
    if (
      state.countryId !== prev.countryId
      || state.localPin !== prev.localPin
      || state.pinMode !== prev.pinMode
      || state.horizonYear !== prev.horizonYear
      || state.warmingPct !== prev.warmingPct
    ) {
      evaluate(state);
    }
  });

  await evaluate(store.get());
}
