#!/usr/bin/env python3
"""pipeline/stats_core.py — the statistics behind stats.json, in numpy and the standard library only.

Used by pipeline/stats.py (real data) and tools/make_mock.py (mock data), so both produce identical
numbers for identical input. tools/check_stats.py recomputes everything with scipy + pymannkendall.

Conventions follow pymannkendall.original_test / seasonal_test and scipy.stats
(ttest_ind(equal_var=False), mannwhitneyu(method='asymptotic', use_continuity=True), spearmanr).
"""
from __future__ import annotations

import math

import numpy as np


# ----------------------------------------------------------------------------- distributions
def norm_sf(z: float) -> float:
    return 0.5 * math.erfc(z / math.sqrt(2.0))


def norm_p_two_sided(z: float) -> float:
    return min(1.0, 2.0 * norm_sf(abs(z)))


def _betacf(a: float, b: float, x: float, max_iter: int = 400, eps: float = 1e-15) -> float:
    """Continued fraction for the incomplete beta function (Numerical Recipes, modified Lentz)."""
    tiny = 1e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c, d = 1.0, 1.0 - qab * x / qap
    d = tiny if abs(d) < tiny else d
    d = 1.0 / d
    h = d
    for m in range(1, max_iter + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        d = tiny if abs(d) < tiny else d
        c = 1.0 + aa / c
        c = tiny if abs(c) < tiny else c
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        d = tiny if abs(d) < tiny else d
        c = 1.0 + aa / c
        c = tiny if abs(c) < tiny else c
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < eps:
            break
    return h


def betainc(a: float, b: float, x: float) -> float:
    """Regularised incomplete beta function I_x(a, b)."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    ln_front = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b) + a * math.log(x) + b * math.log1p(-x)
    front = math.exp(ln_front)
    if x < (a + 1.0) / (a + b + 2.0):
        return front * _betacf(a, b, x) / a
    return 1.0 - front * _betacf(b, a, 1.0 - x) / b


def t_p_two_sided(t: float, df: float) -> float:
    """Two-sided p-value of Student's t with df degrees of freedom."""
    if not math.isfinite(t) or df <= 0:
        return float("nan")
    return min(1.0, betainc(df / 2.0, 0.5, df / (df + t * t)))


# ----------------------------------------------------------------------------- ranks
def rankdata(x) -> np.ndarray:
    """Average ranks (1-based), ties get the mean rank, like scipy.stats.rankdata."""
    x = np.asarray(x, dtype=float)
    order = np.argsort(x, kind="mergesort")
    ranks = np.empty(len(x), dtype=float)
    sx = x[order]
    i, n = 0, len(x)
    while i < n:
        j = i
        while j + 1 < n and sx[j + 1] == sx[i]:
            j += 1
        ranks[order[i:j + 1]] = (i + j) / 2.0 + 1.0
        i = j + 1
    return ranks


def _tie_counts(x: np.ndarray) -> np.ndarray:
    _, counts = np.unique(x, return_counts=True)
    return counts.astype(float)


# ----------------------------------------------------------------------------- Mann-Kendall
def _mk_parts(x: np.ndarray):
    """S and var(S) with the tie correction for a NaN-free 1-D array."""
    n = len(x)
    diff = np.sign(x[None, :] - x[:, None])
    s = float(np.sum(np.triu(diff, 1)))
    t = _tie_counts(x)
    var_s = (n * (n - 1) * (2 * n + 5) - float(np.sum(t * (t - 1) * (2 * t + 5)))) / 18.0
    return s, var_s


def _z_from_s(s: float, var_s: float) -> float:
    if var_s <= 0:
        return 0.0
    if s > 0:
        return (s - 1.0) / math.sqrt(var_s)
    if s < 0:
        return (s + 1.0) / math.sqrt(var_s)
    return 0.0


def sen_slope(t, y) -> float:
    """Median of pairwise slopes (y_j - y_i) / (t_j - t_i) over pairs where both values are valid.
    With t = the real years this equals pymannkendall's slope on the NaN-in-place series."""
    t = np.asarray(t, dtype=float)
    y = np.asarray(y, dtype=float)
    ok = ~np.isnan(y)
    t, y = t[ok], y[ok]
    if len(y) < 2:
        return float("nan")
    i, j = np.triu_indices(len(y), 1)
    dt = t[j] - t[i]
    keep = dt != 0
    if not keep.any():
        return float("nan")
    return float(np.median((y[j] - y[i])[keep] / dt[keep]))


def mann_kendall(t, y) -> dict:
    """Original Mann-Kendall test (ties corrected) + Sen slope per unit of t. NaNs in y are dropped.
    Returns {n, s, var_s, z, tau, p, slope}; tau/p/slope are NaN when n < 2."""
    t = np.asarray(t, dtype=float)
    y = np.asarray(y, dtype=float)
    ok = ~np.isnan(y)
    tv, yv = t[ok], y[ok]
    n = int(len(yv))
    if n < 2:
        return {"n": n, "s": 0.0, "var_s": 0.0, "z": 0.0, "tau": float("nan"), "p": float("nan"), "slope": float("nan")}
    s, var_s = _mk_parts(yv)
    z = _z_from_s(s, var_s)
    return {"n": n, "s": s, "var_s": var_s, "z": z, "tau": s / (0.5 * n * (n - 1)),
            "p": norm_p_two_sided(z), "slope": sen_slope(tv, yv)}


def seasonal_mann_kendall(y, period: int) -> dict:
    """Seasonal Mann-Kendall (Hirsch & Slack) on a chronological series with `period` seasons per cycle.
    NaNs are skipped season by season. slope is per cycle (= per year for monthly data).
    Matches pymannkendall.seasonal_test(x, period)."""
    y = np.asarray(y, dtype=float)
    cycles = int(math.ceil(len(y) / period))
    if cycles * period != len(y):
        y = np.concatenate([y, np.full(cycles * period - len(y), np.nan)])
    x = y.reshape(cycles, period)
    s_tot = var_tot = denom = 0.0
    n_tot = 0
    slopes: list[float] = []
    cyc = np.arange(cycles, dtype=float)
    for k in range(period):
        col = x[:, k]
        ok = ~np.isnan(col)
        v = col[ok]
        n = len(v)
        n_tot += n
        if n < 2:
            continue
        s, var_s = _mk_parts(v)
        s_tot += s
        var_tot += var_s
        denom += 0.5 * n * (n - 1)
        ti = cyc[ok]
        i, j = np.triu_indices(n, 1)
        slopes.extend(((v[j] - v[i]) / (ti[j] - ti[i])).tolist())
    if denom == 0:
        return {"n": n_tot, "s": 0.0, "var_s": 0.0, "z": 0.0, "tau": float("nan"), "p": float("nan"), "slope": float("nan")}
    z = _z_from_s(s_tot, var_tot)
    return {"n": n_tot, "s": s_tot, "var_s": var_tot, "z": z, "tau": s_tot / denom, "p": norm_p_two_sided(z),
            "slope": float(np.median(slopes)) if slopes else float("nan")}


# ----------------------------------------------------------------------------- two-sample tests
def welch_t(a, b) -> dict:
    """Welch's t-test of a vs b (t > 0 when mean(a) > mean(b)); df by Welch–Satterthwaite."""
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    a, b = a[~np.isnan(a)], b[~np.isnan(b)]
    na, nb = len(a), len(b)
    if na < 2 or nb < 2:
        return {"t": float("nan"), "df": float("nan"), "p": float("nan"), "mean_a": float("nan"), "mean_b": float("nan")}
    va, vb = float(np.var(a, ddof=1)), float(np.var(b, ddof=1))
    se2 = va / na + vb / nb
    if se2 <= 0:
        return {"t": float("nan"), "df": float("nan"), "p": float("nan"), "mean_a": float(a.mean()), "mean_b": float(b.mean())}
    t = (float(a.mean()) - float(b.mean())) / math.sqrt(se2)
    df = se2 ** 2 / ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1))
    return {"t": t, "df": df, "p": t_p_two_sided(t, df), "mean_a": float(a.mean()), "mean_b": float(b.mean())}


def cohens_d(a, b) -> float:
    """(mean a - mean b) / pooled SD."""
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    a, b = a[~np.isnan(a)], b[~np.isnan(b)]
    na, nb = len(a), len(b)
    if na < 2 or nb < 2:
        return float("nan")
    pooled = ((na - 1) * np.var(a, ddof=1) + (nb - 1) * np.var(b, ddof=1)) / (na + nb - 2)
    if pooled <= 0:
        return float("nan")
    return float((a.mean() - b.mean()) / math.sqrt(pooled))


def mann_whitney_p(a, b) -> float:
    """Two-sided Mann-Whitney U, asymptotic normal approximation with tie and continuity corrections
    (scipy.stats.mannwhitneyu(method='asymptotic', use_continuity=True))."""
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    a, b = a[~np.isnan(a)], b[~np.isnan(b)]
    n1, n2 = len(a), len(b)
    if n1 < 1 or n2 < 1:
        return float("nan")
    pooled = np.concatenate([a, b])
    ranks = rankdata(pooled)
    r1 = float(ranks[:n1].sum())
    u1 = r1 - n1 * (n1 + 1) / 2.0
    u2 = n1 * n2 - u1
    u = max(u1, u2)
    n = n1 + n2
    t = _tie_counts(pooled)
    tie_term = float(np.sum(t ** 3 - t))
    sigma2 = n1 * n2 / 12.0 * ((n + 1) - tie_term / (n * (n - 1)))
    if sigma2 <= 0:
        return 1.0
    z = (u - n1 * n2 / 2.0 - 0.5) / math.sqrt(sigma2)
    return min(1.0, 2.0 * norm_sf(z))


# ----------------------------------------------------------------------------- correlation
def spearman(a, b) -> dict:
    """Spearman rank correlation of paired values (pairs with a NaN are dropped), p like scipy.stats.spearmanr."""
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    ok = ~(np.isnan(a) | np.isnan(b))
    a, b = a[ok], b[ok]
    n = int(len(a))
    if n < 3:
        return {"rho": float("nan"), "p": float("nan"), "n": n}
    ra, rb = rankdata(a), rankdata(b)
    ra, rb = ra - ra.mean(), rb - rb.mean()
    denom = math.sqrt(float(np.sum(ra * ra)) * float(np.sum(rb * rb)))
    if denom == 0:
        return {"rho": float("nan"), "p": float("nan"), "n": n}
    rho = float(np.sum(ra * rb) / denom)
    rho = max(-1.0, min(1.0, rho))
    if abs(rho) >= 1.0:
        p = 0.0
    else:
        t = rho * math.sqrt((n - 2) / ((1.0 + rho) * (1.0 - rho)))
        p = t_p_two_sided(t, n - 2)
    return {"rho": rho, "p": p, "n": n}


def bh_adjust(ps: list) -> list:
    """Benjamini-Hochberg adjusted p-values; None/NaN entries stay None and do not count."""
    idx = [i for i, p in enumerate(ps) if p is not None and not (isinstance(p, float) and math.isnan(p))]
    out: list = [None] * len(ps)
    m = len(idx)
    if m == 0:
        return out
    order = sorted(idx, key=lambda i: ps[i])
    prev = 1.0
    for rank in range(m, 0, -1):
        i = order[rank - 1]
        val = min(prev, ps[i] * m / rank)
        prev = val
        out[i] = float(min(1.0, val))
    return out
