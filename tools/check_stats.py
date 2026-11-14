#!/usr/bin/env python3
"""tools/check_stats.py — independent recomputation of every stats.json value (Claude · C11).

    python tools/check_stats.py            # all six scopes under data/
    python tools/check_stats.py --scope fraser --tol 1e-5

Reads data/<scope>/series.json and data/regions.json, recomputes every trend, before/after and link with
scipy + pymannkendall (NOT with pipeline/stats_core.py), applying the primer rules, and lists every
difference larger than rounding with the exact correction for the pipeline. Exit 1 on any mismatch.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import warnings
from pathlib import Path

import numpy as np
import pymannkendall as mk
from scipy import stats as ss

ROOT = Path(__file__).resolve().parents[1]
YEARS = list(range(2012, 2026))
MONTHS = [f"{y}-{m:02d}" for y in YEARS for m in range(1, 13)]
OPEN = [5, 6, 7, 8, 9]
WATER = ("kd490", "chlor_a")


def arr(pairs):
    return np.array([np.nan if v is None else float(v) for _, v in pairs], dtype=float)


def var_series(series, var_id, wb):
    if var_id in WATER:
        return series["waterBodies"].get(wb or "", {}).get(var_id)
    return series["variables"].get(var_id)


def annual(series, var_id, wb=None):
    v = var_series(series, var_id, wb)
    return arr(v["annual"]) if v else np.full(14, np.nan)


def monthly(series, var_id, wb=None):
    v = var_series(series, var_id, wb)
    return arr(v["monthly"]) if v and v.get("monthly") else np.full(168, np.nan)


def direction(p, slope):
    if p is None or slope is None or not (p < 0.05) or slope == 0:
        return "no trend"
    return "increasing" if slope > 0 else "decreasing"


def expected_trends(series, kind, fish, wb):
    out = {}
    annual_vars = ["fire_count", "fire_frp", "aod", "pm25"] + (list(WATER) if kind == "basin" else []) + [fish]
    years = np.array(YEARS, dtype=float)
    for v in annual_vars:
        w = wb if v in WATER else None
        y = annual(series, v, w)
        n = int(np.sum(~np.isnan(y)))
        e = {"n": n, "tau": None, "p": None, "sen_slope": None, "sen_intercept": None, "direction": "no trend"}
        if n >= 8:
            r = mk.original_test(y)                        # NaNs kept in place -> slope per year
            slope = float(r.slope)
            ok = ~np.isnan(y)
            e.update({"tau": float(r.Tau), "p": float(r.p), "sen_slope": slope,
                      "sen_intercept": float(np.median(y[ok] - slope * (years[ok] - 2012))), "direction": direction(r.p, slope)})
        out[(v, w, "annual")] = e
    for v in ["fire_frp", "aod"]:
        m = monthly(series, v)
        n = int(np.sum(~np.isnan(m)))
        e = {"n": n, "tau": None, "p": None, "sen_slope": None, "sen_intercept": None, "direction": "no trend"}
        if n >= 8:
            r = mk.seasonal_test(m, period=12)
            e.update({"tau": float(r.Tau), "p": float(r.p), "sen_slope": float(r.slope), "direction": direction(r.p, r.slope)})
        out[(v, None, "monthly")] = e
    if kind == "basin":
        for v in WATER:
            m = monthly(series, v, wb).reshape(14, 12)[:, [mm - 1 for mm in OPEN]].reshape(-1)
            n = int(np.sum(~np.isnan(m)))
            e = {"n": n, "tau": None, "p": None, "sen_slope": None, "sen_intercept": None, "direction": "no trend"}
            if n >= 8:
                r = mk.seasonal_test(m, period=5)
                e.update({"tau": float(r.Tau), "p": float(r.p), "sen_slope": float(r.slope), "direction": direction(r.p, r.slope)})
            out[(v, wb, "monthly")] = e
    return out


def expected_before_after(series, kind, wb, events):
    out = {}
    for E in events:
        plan = [("aod", None, [E])] + ([(v, wb, [E + 1, E + 2]) for v in WATER] if kind == "basin" else [])
        for v, w, after_years in plan:
            x = monthly(series, v, w).reshape(14, 12)
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", RuntimeWarning)
                clim = np.nanmean(x, axis=0)
            anom = x - clim
            before_years = [y for y in range(E - 3, E) if y in YEARS]
            after_years = [y for y in after_years if y in YEARS]
            cols = [mm - 1 for mm in OPEN]
            rb = [YEARS.index(y) for y in before_years]
            ra = [YEARS.index(y) for y in after_years]
            a_b = anom[np.ix_(rb, cols)].ravel() if rb else np.array([])
            a_a = anom[np.ix_(ra, cols)].ravel() if ra else np.array([])
            a_b, a_a = a_b[~np.isnan(a_b)], a_a[~np.isnan(a_a)]
            if len(a_b) < (6 if len(before_years) > 1 else 4) or len(a_a) < (6 if len(after_years) > 1 else 4):
                continue
            t = ss.ttest_ind(a_a, a_b, equal_var=False)
            mw = ss.mannwhitneyu(a_a, a_b, alternative="two-sided", method="asymptotic", use_continuity=True)
            pooled = math.sqrt(((len(a_a) - 1) * np.var(a_a, ddof=1) + (len(a_b) - 1) * np.var(a_b, ddof=1)) / (len(a_a) + len(a_b) - 2))
            out[(v, w, E)] = {
                "before_years": before_years, "after_years": after_years, "n_before": len(a_b), "n_after": len(a_a),
                "mean_before": float(np.nanmean(x[np.ix_(rb, cols)])), "mean_after": float(np.nanmean(x[np.ix_(ra, cols)])),
                "welch_t": float(t.statistic), "df": float(t.df), "p": float(t.pvalue),
                "cohens_d": float((a_a.mean() - a_b.mean()) / pooled), "mannwhitney_p": float(mw.pvalue)}
    return out


def expected_links(series, kind, fish, wb):
    def one(x, y, lags):
        rows = []
        for lag in lags:
            xs, ys = (x[:-lag], y[lag:]) if lag else (x, y)
            ok = ~(np.isnan(xs) | np.isnan(ys))
            n = int(ok.sum())
            if n >= 8:
                r = ss.spearmanr(xs[ok], ys[ok])
                rows.append({"lag": lag, "rho": float(r.statistic), "p": float(r.pvalue), "p_adj": None, "n": n})
            else:
                rows.append({"lag": lag, "rho": None, "p": None, "p_adj": None, "n": n})
        ps = [r["p"] for r in rows if r["p"] is not None]
        if ps:
            adj = iter(ss.false_discovery_control(ps, method="bh"))
            for r in rows:
                if r["p"] is not None:
                    r["p_adj"] = float(next(adj))
        valid = [r for r in rows if r["rho"] is not None]
        best = max(valid, key=lambda r: abs(r["rho"])) if valid else rows[0]
        return dict(best, all_lags=rows)
    out = {("fire_frp", "aod"): one(monthly(series, "fire_frp"), monthly(series, "aod"), [0, 1, 2])}
    if kind == "basin":
        out[("aod", "kd490")] = one(annual(series, "aod"), annual(series, "kd490", wb), [0, 1, 2])
        out[("kd490", fish)] = one(annual(series, "kd490", wb), annual(series, fish), [0, 1, 2, 3, 4])
    out[("fire_frp", fish)] = one(annual(series, "fire_frp"), annual(series, fish), [0, 1, 2, 3, 4])
    return out


def close(a, b, tol):
    if a is None or b is None:
        return a is None and b is None
    if isinstance(a, list) or isinstance(b, list):
        return a == b
    if isinstance(a, str) or isinstance(b, str):
        return a == b
    return abs(float(a) - float(b)) <= tol * max(1.0, abs(float(a)), abs(float(b)))


def check_scope(country, basin, tol):
    path = country["id"] if basin is None else f"{country['id']}/{basin['id']}"
    kind = "country" if basin is None else "basin"
    series = json.loads((ROOT / "data" / path / "series.json").read_text())
    stats = json.loads((ROOT / "data" / path / "stats.json").read_text())
    meta = country if basin is None else basin
    fish, wb = meta["fishMetric"], (basin or {}).get("primaryWaterBody")
    if basin is not None and basin["id"] in ("fraser", "yukon"):
        events = list(basin["eventYears"])
    else:
        frp = series["variables"]["fire_frp"]["annual"]
        valid = sorted(((v, y) for y, v in frp if v is not None), key=lambda t: (-t[0], t[1]))
        events = sorted(y for _, y in valid[:2]) if len(valid) >= 2 else list(meta["eventYears"])
        if events != list(meta["eventYears"]):
            print(f"  {path}: regions.json eventYears {meta['eventYears']} but top-2 fire_frp years are {events} -> rerun export_json.py")
    problems = []
    exp = expected_trends(series, kind, fish, wb)
    got = {(t["variable"], t["waterBody"], t["basis"]): t for t in stats["trends"]}
    for key in set(exp) | set(got):
        if key not in got:
            problems.append(f"trend {key}: missing in stats.json; add it"); continue
        if key not in exp:
            problems.append(f"trend {key}: not expected by the primer rules; remove it"); continue
        for f in ("n", "tau", "p", "sen_slope", "sen_intercept", "direction"):
            if not close(got[key].get(f), exp[key][f], tol):
                problems.append(f"trend {key} {f}: stats.json {got[key].get(f)} vs recomputed {exp[key][f]}")
    exp = expected_before_after(series, kind, wb, events)
    got = {(b["variable"], b["waterBody"], b["event"]): b for b in stats["beforeAfter"]}
    for key in set(exp) | set(got):
        if key not in got:
            problems.append(f"beforeAfter {key}: missing in stats.json"); continue
        if key not in exp:
            problems.append(f"beforeAfter {key}: should not exist (fewer than 6 valid months on one side or event outside 2012-2025)"); continue
        for f, e in exp[key].items():
            if not close(got[key].get(f), e, tol):
                problems.append(f"beforeAfter {key} {f}: stats.json {got[key].get(f)} vs recomputed {e}")
    exp = expected_links(series, kind, fish, wb)
    got = {(l["from"], l["to"]): l for l in stats["links"]}
    for key in set(exp) | set(got):
        if key not in got:
            problems.append(f"link {key}: missing in stats.json"); continue
        if key not in exp:
            problems.append(f"link {key}: not expected for a {kind} scope; remove it"); continue
        for f in ("lag", "rho", "p", "p_adj", "n"):
            if not close(got[key].get(f), exp[key][f], tol):
                problems.append(f"link {key} {f}: stats.json {got[key].get(f)} vs recomputed {exp[key][f]}")
        for g, e in zip(got[key]["all_lags"], exp[key]["all_lags"]):
            for f in ("lag", "rho", "p", "p_adj", "n"):
                if not close(g.get(f), e[f], tol):
                    problems.append(f"link {key} all_lags[{e['lag']}] {f}: stats.json {g.get(f)} vs recomputed {e[f]}")
        if len(got[key]["all_lags"]) != len(exp[key]["all_lags"]):
            problems.append(f"link {key}: {len(got[key]['all_lags'])} lags, expected {len(exp[key]['all_lags'])}")
    n_checked = len(stats["trends"]) * 6 + sum(len(b) for b in stats["beforeAfter"]) + sum(5 + 5 * len(l["all_lags"]) for l in stats["links"])
    return path, n_checked, sorted(problems)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--scope", default="all")
    ap.add_argument("--tol", type=float, default=6e-6, help="relative tolerance: 6 significant figures round by at most 5e-6")
    args = ap.parse_args(argv)
    regions = json.loads((ROOT / "data" / "regions.json").read_text())
    total_problems = 0
    for c in regions["countries"]:
        for basin in (None, c["basin"]):
            name = c["id"] if basin is None else basin["id"]
            if args.scope != "all" and name not in args.scope.split(","):
                continue
            path, n, problems = check_scope(c, basin, args.tol)
            total_problems += len(problems)
            print(f"{'PASS' if not problems else 'FAIL'}  {path:14s} {n:4d} values recomputed, {len(problems)} mismatch(es)")
            for p in problems:
                print("      ", p)
    print("all stats.json values match the independent recomputation" if not total_problems else f"{total_problems} mismatch(es)")
    return 1 if total_problems else 0


if __name__ == "__main__":
    sys.exit(main())
