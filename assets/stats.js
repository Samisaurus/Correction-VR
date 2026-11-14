/*
 * Ember to Ocean — statistics used by the figures. No dependencies.
 *   mannKendall(ys)            trend test (with tie correction)
 *   senSlope(xs, ys)           Theil–Sen slope and intercept
 *   welch(a, b)                Welch's unequal-variance t-test
 *   mannWhitney(a, b)          Mann–Whitney U test (normal approximation, tie-corrected)
 *   spearman(x, y)             Spearman rank correlation with t-approximation p-value
 *   lagCorrelation(sa, sb, maxLag)   best Spearman correlation of b lagged 0..maxLag years after a
 */
(function () {
  "use strict";

  // ---------- distributions
  function erf(x) { // Abramowitz–Stegun 7.1.26, |error| < 1.5e-7
    const s = Math.sign(x); x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  const normCdf = z => 0.5 * (1 + erf(z / Math.SQRT2));
  const twoSidedZ = z => Math.min(1, 2 * (1 - normCdf(Math.abs(z))));

  function lgamma(x) { // Lanczos
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
      12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    x -= 1;
    let a = c[0];
    const t = x + g + 0.5;
    for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function betacf(a, b, x) {
    const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d; let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function ibeta(x, a, b) { // regularized incomplete beta I_x(a,b)
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  const twoSidedT = (t, df) => (!Number.isFinite(t) ? 0 : df > 0 ? Math.min(1, ibeta(df / (df + t * t), df / 2, 0.5)) : NaN);

  // ---------- helpers
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const variance = a => { const m = mean(a); return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1); };
  const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  function ranks(a) {
    const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(a.length);
    for (let i = 0; i < idx.length;) {
      let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  }
  function tieGroups(a) { const m = new Map(); a.forEach(v => m.set(v, (m.get(v) || 0) + 1)); return [...m.values()].filter(t => t > 1); }

  // ---------- tests
  function mannKendall(ys) {
    const n = ys.length;
    if (n < 4) return null;
    let S = 0;
    for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) S += Math.sign(ys[j] - ys[i]);
    const ties = tieGroups(ys);
    const v = (n * (n - 1) * (2 * n + 5) - ties.reduce((s, t) => s + t * (t - 1) * (2 * t + 5), 0)) / 18;
    const z = v > 0 ? (S > 0 ? (S - 1) / Math.sqrt(v) : S < 0 ? (S + 1) / Math.sqrt(v) : 0) : 0;
    const tau = S / (n * (n - 1) / 2);
    return { n, S, z, tau, p: twoSidedZ(z) };
  }

  function senSlope(xs, ys) {
    const slopes = [];
    for (let i = 0; i < xs.length - 1; i++) for (let j = i + 1; j < xs.length; j++)
      if (xs[j] !== xs[i]) slopes.push((ys[j] - ys[i]) / (xs[j] - xs[i]));
    if (!slopes.length) return null;
    const slope = median(slopes);
    const intercept = median(ys.map((y, i) => y - slope * xs[i]));
    return { slope, intercept };
  }

  function welch(a, b) {
    if (a.length < 2 || b.length < 2) return null;
    const ma = mean(a), mb = mean(b), va = variance(a), vb = variance(b);
    const se2 = va / a.length + vb / b.length;
    if (se2 === 0) return { t: ma === mb ? 0 : Infinity, df: a.length + b.length - 2, p: ma === mb ? 1 : 0, ma, mb };
    const t = (mb - ma) / Math.sqrt(se2);
    const df = se2 * se2 / ((va / a.length) ** 2 / (a.length - 1) + (vb / b.length) ** 2 / (b.length - 1));
    return { t, df, p: twoSidedT(t, df), ma, mb };
  }

  function mannWhitney(a, b) {
    const n1 = a.length, n2 = b.length;
    if (n1 < 2 || n2 < 2) return null;
    const all = a.concat(b), r = ranks(all);
    const R1 = r.slice(0, n1).reduce((s, v) => s + v, 0);
    const U1 = R1 - n1 * (n1 + 1) / 2, U = Math.min(U1, n1 * n2 - U1);
    const N = n1 + n2;
    const tieTerm = tieGroups(all).reduce((s, t) => s + (t ** 3 - t), 0);
    const sd = Math.sqrt(n1 * n2 / 12 * ((N + 1) - tieTerm / (N * (N - 1))));
    const z = sd > 0 ? (Math.abs(U1 - n1 * n2 / 2) - 0.5) / sd : 0;
    return { U, z, p: sd > 0 ? twoSidedZ(Math.max(0, z)) : 1 };
  }

  function pearson(x, y) {
    const mx = mean(x), my = mean(y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
  }
  function spearman(x, y) {
    const n = x.length;
    if (n < 4) return null;
    const r = pearson(ranks(x), ranks(y));
    if (!Number.isFinite(r)) return null;
    const t = Math.abs(r) >= 1 ? Infinity : r * Math.sqrt((n - 2) / (1 - r * r));
    return { r, n, p: twoSidedT(t, n - 2) };
  }

  /** a, b: Map(year -> value). Correlate a[y] with b[y + lag] for lag = 0..maxLag; return the strongest. */
  function lagCorrelation(a, b, maxLag = 3) {
    let best = null;
    for (let lag = 0; lag <= maxLag; lag++) {
      const xs = [], ys = [];
      for (const [yr, v] of a) if (b.has(yr + lag)) { xs.push(v); ys.push(b.get(yr + lag)); }
      const s = spearman(xs, ys);
      if (s && (!best || Math.abs(s.r) > Math.abs(best.r))) best = Object.assign({ lag }, s);
    }
    return best;
  }

  window.VR_STATS = { mannKendall, senSlope, welch, mannWhitney, spearman, lagCorrelation, mean, median, normCdf, twoSidedT };
})();
