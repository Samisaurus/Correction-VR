#!/usr/bin/env python3
"""pipeline/stats.py — trends, before/after tests and lag links for every scope (GPT-Data P6, built here).

    python pipeline/stats.py --scope canada|fraser|usa|yukon|russia|amur|all

Reads the processed CSVs through common.load_series(scope) and writes processed/<scope path>/stats.json.
compute_stats(series, scope, events) is also used by tools/make_mock.py, so mock and real stats.json
come from the same code. All tests live in pipeline/stats_core.py (numpy only).

Rules (Session Primer v2 + task P6):
  TRENDS  annual: Mann-Kendall + Sen slope on the 14 annual values (nulls dropped, need n >= 8) for
          fire_count, fire_frp, aod, pm25, kd490 and chlor_a (primary water body, basin scopes only)
          and the scope's fish metric; sen_intercept = median(y_i - slope * (year_i - 2012)).
          monthly: seasonal Mann-Kendall (period 12) for fire_frp and aod on 168 months; kd490 and
          chlor_a with period 5 on May-Sep months only; sen_intercept null.
          direction = increasing / decreasing by the slope sign if p < 0.05, else "no trend".
  BEFORE / AFTER  for every event year E (common.event_years): kd490 and chlor_a (basin scopes):
          before E-3..E-1, after E+1..E+2 (years <= 2025); aod (both scopes): after = [E].
          Months 5..9, need >= 6 valid months on each side (>= 4 of the 5 when a side is one year).
          Values are deseasonalised
          (minus the 2012-2025 mean of each calendar month); Welch t, Mann-Whitney U and Cohen's d on
          the anomalies, mean_before / mean_after on the raw values, df = Welch-Satterthwaite.
  LINKS   Spearman on pairs where both values are non-null, need n >= 8:
          fire_frp -> aod (monthly, lags 0,1,2 months); fire_frp -> fish (annual, lags 0..4);
          basin only: aod -> kd490 (annual, lags 0,1,2); kd490 -> fish (annual, lags 0..4).
          all_lags carries Benjamini-Hochberg p_adj within the link; the top level reports the lag
          with the largest |rho|. If no lag reaches n >= 8 the link is kept with nulls.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline import common, stats_core as sc  # noqa: E402

YEARS = np.array(common.YEARS, dtype=float)
ANNUAL_VARS = ["fire_count", "fire_frp", "aod", "pm25"]
MIN_N = 8
MIN_MONTHS_EACH_SIDE = 6
MIN_MONTHS_SINGLE_YEAR = 4


def _nan(v):
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else float(v)


def _annual(series: dict, var_id: str, wb: str | None) -> np.ndarray:
    v = _var(series, var_id, wb)
    if not v:
        return np.full(len(common.YEARS), np.nan)
    return np.array([np.nan if common.is_null(x) else float(x) for _, x in v["annual"]], dtype=float)


def _monthly(series: dict, var_id: str, wb: str | None) -> np.ndarray:
    v = _var(series, var_id, wb)
    if not v or not v.get("monthly"):
        return np.full(len(common.MONTHS), np.nan)
    return np.array([np.nan if common.is_null(x) else float(x) for _, x in v["monthly"]], dtype=float)


def _var(series: dict, var_id: str, wb: str | None):
    if var_id in common.WATER_VARS:
        return (series.get("waterBodies") or {}).get(wb or "", {}).get(var_id)
    return (series.get("variables") or {}).get(var_id)


def _direction(p, slope) -> str:
    if p is None or slope is None or math.isnan(p) or math.isnan(slope) or p >= 0.05 or slope == 0:
        return "no trend"
    return "increasing" if slope > 0 else "decreasing"


def trend_annual(var_id: str, wb: str | None, y: np.ndarray) -> dict:
    n = int(np.sum(~np.isnan(y)))
    entry = {"variable": var_id, "waterBody": wb, "basis": "annual", "test": "mann_kendall", "n": n,
             "tau": None, "p": None, "sen_slope": None, "sen_intercept": None, "slope_unit": "per year", "direction": "no trend"}
    if n < MIN_N:
        return entry
    r = sc.mann_kendall(YEARS, y)
    slope = r["slope"]
    ok = ~np.isnan(y)
    intercept = float(np.median(y[ok] - slope * (YEARS[ok] - 2012.0)))
    entry.update({"tau": _nan(r["tau"]), "p": _nan(r["p"]), "sen_slope": _nan(slope), "sen_intercept": _nan(intercept),
                  "direction": _direction(r["p"], slope)})
    return entry


def trend_monthly(var_id: str, wb: str | None, m: np.ndarray, period: int) -> dict:
    n = int(np.sum(~np.isnan(m)))
    entry = {"variable": var_id, "waterBody": wb, "basis": "monthly", "test": "seasonal_mann_kendall", "n": n,
             "tau": None, "p": None, "sen_slope": None, "sen_intercept": None, "slope_unit": "per year", "direction": "no trend"}
    if n < MIN_N:
        return entry
    r = sc.seasonal_mann_kendall(m, period)
    entry.update({"tau": _nan(r["tau"]), "p": _nan(r["p"]), "sen_slope": _nan(r["slope"]), "direction": _direction(r["p"], r["slope"])})
    return entry


def _open_months_only(m: np.ndarray) -> np.ndarray:
    """168 monthly values -> 70 values (May-Sep of each year, chronological)."""
    x = m.reshape(len(common.YEARS), 12)
    return x[:, [mm - 1 for mm in common.OPEN_MONTHS]].reshape(-1)


def before_after(var_id: str, wb: str | None, m: np.ndarray, event: int, after_years: list[int]) -> dict | None:
    x = m.reshape(len(common.YEARS), 12)
    valid = (~np.isnan(x)).sum(axis=0)
    clim = np.where(valid > 0, np.nansum(x, axis=0) / np.maximum(valid, 1), np.nan)   # monthly climatology, NaN-safe
    anom = x - clim[None, :]
    before_years = [y for y in range(event - 3, event) if y in common.YEARS]
    after_years = [y for y in after_years if y in common.YEARS]
    cols = [mm - 1 for mm in common.OPEN_MONTHS]

    def pick(arr, years):
        rows = [common.YEARS.index(y) for y in years]
        return arr[np.ix_(rows, cols)].reshape(-1) if rows else np.array([])

    a_before, a_after = pick(anom, before_years), pick(anom, after_years)
    r_before, r_after = pick(x, before_years), pick(x, after_years)
    a_before, a_after = a_before[~np.isnan(a_before)], a_after[~np.isnan(a_after)]
    # >= 6 valid months per side; a side made of a single year (aod: after = [E]) has only 5 May-Sep
    # months, so it needs >= 4 of them.
    need_before = MIN_MONTHS_EACH_SIDE if len(before_years) > 1 else MIN_MONTHS_SINGLE_YEAR
    need_after = MIN_MONTHS_EACH_SIDE if len(after_years) > 1 else MIN_MONTHS_SINGLE_YEAR
    if len(a_before) < need_before or len(a_after) < need_after:
        return None
    w = sc.welch_t(a_after, a_before)
    if math.isnan(w["t"]) or math.isnan(w["p"]):
        return None
    return {
        "variable": var_id, "waterBody": wb, "event": int(event), "months": list(common.OPEN_MONTHS),
        "before_years": before_years, "after_years": after_years,
        "n_before": int(len(a_before)), "n_after": int(len(a_after)),
        "mean_before": float(np.nanmean(r_before)), "mean_after": float(np.nanmean(r_after)),
        "welch_t": float(w["t"]), "df": float(w["df"]), "p": float(w["p"]),
        "cohens_d": _nan(sc.cohens_d(a_after, a_before)) if not math.isnan(sc.cohens_d(a_after, a_before)) else 0.0,
        "mannwhitney_p": float(sc.mann_whitney_p(a_after, a_before)),
    }


def link(frm: str, to: str, x: np.ndarray, y: np.ndarray, lags: list[int], unit: str) -> dict:
    """Spearman of y[t + lag] against x[t] for each lag."""
    rows = []
    for lag in lags:
        xs = x[: len(x) - lag] if lag else x
        ys = y[lag:] if lag else y
        r = sc.spearman(xs, ys)
        if r["n"] >= MIN_N and not math.isnan(r["rho"]):
            rows.append({"lag": lag, "rho": r["rho"], "p": r["p"], "p_adj": None, "n": r["n"]})
        else:
            rows.append({"lag": lag, "rho": None, "p": None, "p_adj": None, "n": r["n"]})
    adj = sc.bh_adjust([row["p"] for row in rows])
    for row, pa in zip(rows, adj):
        row["p_adj"] = pa
    valid = [row for row in rows if row["rho"] is not None]
    best = max(valid, key=lambda row: abs(row["rho"])) if valid else rows[0]
    return {"from": frm, "to": to, "method": "spearman", "lag": best["lag"], "lag_unit": unit,
            "rho": best["rho"], "p": best["p"], "p_adj": best["p_adj"], "n": best["n"], "all_lags": rows}


def compute_stats(series: dict, scope: dict, events: list[int]) -> dict:
    meta = scope["meta"]
    basin = scope["kind"] == "basin"
    fish = meta["fishMetric"]
    wb = meta.get("primaryWaterBody") if basin else None

    trends = [trend_annual(v, None, _annual(series, v, None)) for v in ANNUAL_VARS]
    if basin:
        trends += [trend_annual(v, wb, _annual(series, v, wb)) for v in common.WATER_VARS]
    trends.append(trend_annual(fish, None, _annual(series, fish, None)))
    trends.append(trend_monthly("fire_frp", None, _monthly(series, "fire_frp", None), 12))
    trends.append(trend_monthly("aod", None, _monthly(series, "aod", None), 12))
    if basin:
        for v in common.WATER_VARS:
            trends.append(trend_monthly(v, wb, _open_months_only(_monthly(series, v, wb)), len(common.OPEN_MONTHS)))

    before_after_rows = []
    for e in sorted(set(int(x) for x in events)):
        row = before_after("aod", None, _monthly(series, "aod", None), e, [e])
        if row:
            before_after_rows.append(row)
        if basin:
            for v in common.WATER_VARS:
                row = before_after(v, wb, _monthly(series, v, wb), e, [e + 1, e + 2])
                if row:
                    before_after_rows.append(row)

    fire_m, aod_m = _monthly(series, "fire_frp", None), _monthly(series, "aod", None)
    fire_a, aod_a, fish_a = _annual(series, "fire_frp", None), _annual(series, "aod", None), _annual(series, fish, None)
    links = [link("fire_frp", "aod", fire_m, aod_m, [0, 1, 2], "month")]
    if basin:
        kd_a = _annual(series, "kd490", wb)
        links.append(link("aod", "kd490", aod_a, kd_a, [0, 1, 2], "year"))
        links.append(link("kd490", fish, kd_a, fish_a, [0, 1, 2, 3, 4], "year"))
    links.append(link("fire_frp", fish, fire_a, fish_a, [0, 1, 2, 3, 4], "year"))
    return {"scope": scope["path"], "trends": trends, "beforeAfter": before_after_rows, "links": links}


def main(argv=None) -> int:
    for scope in common.scope_args(argv, __doc__.splitlines()[0]):
        series = common.load_series(scope)
        events = common.event_years(scope, series)
        stats = compute_stats(series, scope, events)
        out = common.processed_dir(scope) / "stats.json"
        size = common.write_json(stats, out)
        sig = [t for t in stats["trends"] if t["direction"] != "no trend"]
        print(f"{scope['name']:7s} events={events} trends={len(stats['trends'])} ({len(sig)} significant) "
              f"beforeAfter={len(stats['beforeAfter'])} links={len(stats['links'])} -> {out.relative_to(common.ROOT)} ({size} B)")
        for ln in stats["links"]:
            rho = "null" if ln["rho"] is None else f"{ln['rho']:+.2f}"
            padj = "null" if ln["p_adj"] is None else f"{ln['p_adj']:.3g}"
            print(f"         {ln['from']} -> {ln['to']}: rho {rho} lag {ln['lag']} {ln['lag_unit']} p_adj {padj} n {ln['n']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
