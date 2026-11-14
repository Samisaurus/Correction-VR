#!/usr/bin/env python3
"""pipeline/fetch_fish.py — salmon value (2024 prices) and catch per scope (P5).

    python pipeline/fetch_fish.py --scope canada|fraser|usa|yukon|russia|amur|all

Inputs: pipeline/raw/fish/<scope>_fish.csv with columns year, value_nominal (millions, local currency,
may be empty), catch_tonnes (may be empty); pipeline/raw/fish/cpi_CAD.csv and cpi_USD.csv (year, cpi).
  fish_value = value_nominal * cpi[2024] / cpi[year] for scopes with a currency; null otherwise.
  fish_catch = catch_tonnes / 1000 (thousand tonnes).
Writes processed/<scope path>/fish_annual.csv (year, fish_value, fish_catch) for 2012–2025, blanks kept,
prints the table and any year missing CPI.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline import common  # noqa: E402

BASE_YEAR = 2024


def load_cpi(currency: str) -> dict[int, float]:
    path = common.RAW / "fish" / f"cpi_{currency}.csv"
    if not path.exists():
        print(f"  WARNING missing {path.relative_to(common.ROOT)}; fish_value will be null")
        return {}
    out = {}
    for row in common.read_csv_rows(path):
        try:
            y = int(float(row.get("year", "")))
        except ValueError:
            continue
        v = common.to_float(row.get("cpi"))
        if v is not None:
            out[y] = v
    return out


def main(argv=None) -> int:
    cpis: dict[str, dict[int, float]] = {}
    for scope in common.scope_args(argv, __doc__.splitlines()[0]):
        path = common.RAW / "fish" / f"{scope['name']}_fish.csv"
        rows = {}
        if path.exists():
            for row in common.read_csv_rows(path):
                try:
                    rows[int(float(row.get("year", "")))] = row
                except ValueError:
                    continue
        else:
            print(f"  WARNING missing {path.relative_to(common.ROOT)}")
        currency = scope["meta"]["currency"]
        cpi = cpis.setdefault(currency, load_cpi(currency)) if currency else {}
        out = common.processed_dir(scope) / "fish_annual.csv"
        out.parent.mkdir(parents=True, exist_ok=True)
        print(f"{scope['name']} ({currency or 'no currency'}):")
        print("  year  fish_value  fish_catch")
        with open(out, "w", encoding="utf-8") as fh:
            fh.write("year,fish_value,fish_catch\n")
            for y in common.YEARS:
                row = rows.get(y, {})
                nominal = common.to_float(row.get("value_nominal"))
                tonnes = common.to_float(row.get("catch_tonnes"))
                value = None
                if currency and nominal is not None:
                    if BASE_YEAR in cpi and y in cpi and cpi[y]:
                        value = nominal * cpi[BASE_YEAR] / cpi[y]
                    else:
                        print(f"  WARNING no CPI for {currency} {y}{'' if BASE_YEAR in cpi else f' (or {BASE_YEAR})'}; fish_value null")
                catch = tonnes / 1000.0 if tonnes is not None else None
                fh.write(f"{y},{'' if value is None else round(value, 3)},{'' if catch is None else round(catch, 3)}\n")
                print(f"  {y}  {'—' if value is None else f'{value:10.2f}'}  {'—' if catch is None else f'{catch:10.2f}'}")
        print(f"  -> {out.relative_to(common.ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
