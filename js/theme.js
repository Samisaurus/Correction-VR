// js/theme.js
// Purpose: colours, variable table and number formatting shared by every module (Session Primer v2, THEME).
// Exports: COLORS, VARS, GROUP_DEFAULT, GROUPS, GROUP_LABEL, fmt, fmtP, placeholder, unitFor
// Owner: Claude · Task C2
//
// JS uses these hex strings (SVG and MapLibre need them); CSS uses the matching --c-* variables in
// css/tokens.css. No other file types a hex colour.

export const COLORS = Object.freeze({
  fire: '#D55E00',
  smoke: '#8A7F72',
  water: '#009E73',
  river: '#56B4E9',
  polluted: '#7B3294',
  fish: '#0072B2',
  year: '#E69F00',
  ink: '#202122',
  muted: '#54595D',
  rule: '#A2A9B1',
  panel: '#F8F9FA',
  link: '#3366CC',
  paper: '#FFFFFF',
  contour: '#8C7B6B',
  country: '#202122',
  basin: '#E69F00',
});

/** Variable table. ids are fixed by the contract; digits = decimals shown by fmt(). */
export const VARS = Object.freeze({
  fire_count: { label: 'Fire detections (VIIRS)', short: 'Fires', unit: 'detections', group: 'fire', color: COLORS.fire, digits: 0 },
  fire_frp: { label: 'Fire radiative power', short: 'Fire power', unit: 'MW (annual sum)', group: 'fire', color: COLORS.fire, digits: 0 },
  aod: { label: 'Aerosol optical depth 550 nm', short: 'AOD', unit: 'unitless', group: 'air', color: COLORS.smoke, digits: 3 },
  pm25: { label: 'Surface PM2.5', short: 'PM2.5', unit: 'ug/m3', group: 'air', color: COLORS.smoke, digits: 1 },
  kd490: { label: 'Water turbidity (Kd490)', short: 'Kd490', unit: '1/m', group: 'water', color: COLORS.water, digits: 3 },
  chlor_a: { label: 'Chlorophyll-a', short: 'Chl-a', unit: 'mg/m3', group: 'water', color: COLORS.water, digits: 2 },
  fish_value: { label: 'Salmon landed value', short: 'Value', unit: 'million (2024 prices, local currency)', group: 'fish', color: COLORS.fish, digits: 1 },
  fish_catch: { label: 'Salmon catch', short: 'Catch', unit: 'thousand tonnes', group: 'fish', color: COLORS.fish, digits: 1 },
});

/** Default variable per group; fish is null because it comes from the scope's meta.fishMetric. */
export const GROUP_DEFAULT = Object.freeze({ fire: 'fire_frp', air: 'aod', water: 'kd490', fish: null });

export const GROUPS = Object.freeze(['fire', 'air', 'water', 'fish']);
export const GROUP_LABEL = Object.freeze({ fire: 'Fire', air: 'Air', water: 'Water', fish: 'Fish' });

/**
 * Format a value with the variable's digits and thousands separators. null/undefined/NaN -> em dash.
 * fmt(0.3141, 'aod') -> '0.314'; fmt(12400, 'fire_count') -> '12,400'; fmt(null) -> '—'
 */
export function fmt(value, varId) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const digits = VARS[varId] ? VARS[varId].digits : 2;
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** fmtP(0.0004) -> 'p < 0.001'; fmtP(0.0341) -> 'p = 0.034'; fmtP(null) -> 'p = —' */
export function fmtP(p) {
  if (p === null || p === undefined || !Number.isFinite(Number(p))) return 'p = —';
  const v = Number(p);
  if (v < 0.001) return 'p < 0.001';
  return `p = ${v.toFixed(3)}`;
}

/** Unit text for display; fish_value gets the scope's currency in front ('CAD million (2024 prices)'). */
export function unitFor(varId, meta) {
  const v = VARS[varId];
  if (!v) return '';
  if (varId === 'fish_value' && meta && meta.currency) return `${meta.currency} million (2024 prices)`;
  return v.unit;
}

/**
 * Replace el's content with a muted italic message. Child elements that carry an id (nested slots
 * such as #map-legend inside #map) are kept so other modules can still mount into them.
 */
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

/*
Browser-console self-test (paste after the page has loaded):
  const t = await import('./js/theme.js');
  console.assert(Object.keys(t.VARS).length === 8, 'VARS has 8 variables');
  console.assert(t.fmt(12400, 'fire_count') === '12,400' && t.fmt(0.31416, 'aod') === '0.314' && t.fmt(null) === '—');
  console.assert(t.fmtP(0.0004) === 'p < 0.001' && t.fmtP(0.0341) === 'p = 0.034');
  console.assert(t.COLORS.fire === '#D55E00' && t.GROUP_DEFAULT.fish === null);
  console.log('theme.js self-test done');
*/
