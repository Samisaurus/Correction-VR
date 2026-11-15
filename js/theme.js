// js/theme.js
// Purpose: shared colours, variable metadata, CSS injection, and formatting/math utilities.

export const COLORS = Object.freeze({
  fire: '#D55E00',
  smoke: '#8A7F72',
  year: '#E69F00',
  ink: '#1A1D21',
  muted: '#54595D',
  rule: '#D0D7DE',
  panel: '#F6F8FA',
  link: '#2B5FC7',
  paper: '#FFFFFF',
  contour: '#6E6256',
  contourMinor: '#8E8174',
  country: '#202122',
  forecast: '#6A3093',
});

/** Distinct cartographic colours for the three countries on the map. */
export const COUNTRY_COLORS = Object.freeze({
  canada: '#2A9D8F',
  usa: '#C84B59',
  russia: '#3D6CB9',
});

/** Variable table. ids are fixed by the contract; digits = decimals shown by fmt(). */
export const VARS = Object.freeze({
  fire_count: { label: 'Fire detections (MODIS)', short: 'Fires', unit: 'detections', group: 'fire', color: COLORS.fire, digits: 0 },
  viirs_count: { label: 'Fire detections (VIIRS)', short: 'VIIRS fires', unit: 'detections', group: 'fire', color: COLORS.fire, digits: 0 },
  fire_frp: { label: 'Fire radiative power', short: 'Fire power', unit: 'MW (annual sum)', group: 'fire', color: COLORS.fire, digits: 0 },
  co2_em: { label: 'Forest fire CO₂ emissions', short: 'CO₂ emissions', unit: 'tonnes', group: 'air', color: COLORS.smoke, digits: 0 },
  pm25_em: { label: 'Fine particulate smoke (PM₂.₅)', short: 'PM₂.₅ smoke', unit: 'tonnes', group: 'air', color: COLORS.smoke, digits: 0 },
  aod: { label: 'Aerosol optical depth 550 nm', short: 'AOD', unit: 'unitless', group: 'air', color: COLORS.smoke, digits: 3 },
  pm25: { label: 'Surface PM2.5', short: 'PM2.5', unit: 'µg/m³', group: 'air', color: COLORS.smoke, digits: 1 },
});

export const GROUP_DEFAULT = Object.freeze({ fire: 'fire_frp', air: 'co2_em' });
export const GROUPS = Object.freeze(['fire', 'air']);
export const GROUP_LABEL = Object.freeze({ fire: 'Fire', air: 'Air & Smoke' });

export function injectCss(id, css) {
  if (typeof document === 'undefined' || document.querySelector(`style[data-module="${id}"]`)) return;
  const s = document.createElement('style');
  s.dataset.module = id;
  s.textContent = css;
  document.head.appendChild(s);
}

export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function fmt(value, varId) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const digits = VARS[varId] ? VARS[varId].digits : 2;
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtCompact(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 10_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toLocaleString('en-US');
}

export function fmtCompactTick(val) {
  const v = Number(val);
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (Math.abs(v) >= 10_000) return `${Math.round(v / 1_000)}k`;
  return String(v);
}

export function fmtMass(tonnes, unit = 'auto') {
  const v = Number(tonnes);
  if (!Number.isFinite(v)) return '—';
  if (unit === 'Mt' || (unit === 'auto' && Math.abs(v) >= 1_000_000)) return `${(v / 1_000_000).toFixed(1)} Mt`;
  if (unit === 'kt' || (unit === 'auto' && Math.abs(v) >= 1_000)) return `${(v / 1_000).toFixed(1)} kt`;
  return `${v.toFixed(0)} t`;
}

export function fmtP(p) {
  if (p === null || p === undefined || !Number.isFinite(Number(p))) return 'p = —';
  const v = Number(p);
  if (v < 0.001) return 'p < 0.001';
  return `p = ${v.toFixed(3)}`;
}

export function quantileSorted(sorted, q) {
  if (!Array.isArray(sorted) || !sorted.length) return null;
  const pos = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[pos];
}

export function erfcApprox(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const ans = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196
    + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398
    + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? ans : 2 - ans;
}

export function unitFor(varId) {
  const v = VARS[varId];
  return v ? v.unit : '';
}

export function spinner(el, label = 'Loading…') {
  if (!el) return null;
  for (const child of Array.from(el.childNodes)) {
    if (!(child.nodeType === 1 && child.id)) child.remove();
  }
  const wrap = document.createElement('div');
  wrap.className = 'ember-loading';
  wrap.innerHTML = `<span class="ember-spinner" aria-hidden="true"></span><span>${escHtml(label)}</span>`;
  el.appendChild(wrap);
  return wrap;
}

export function placeholder(el, text = 'No data for this selection') {
  if (!el) return null;
  for (const child of Array.from(el.childNodes)) {
    if (!(child.nodeType === 1 && child.id)) child.remove();
  }
  const p = document.createElement('p');
  p.className = 'placeholder';
  p.textContent = text;
  el.appendChild(p);
  return p;
}
