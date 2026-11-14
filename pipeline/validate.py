#!/usr/bin/env python3
"""pipeline/validate.py — check every file under data/ against the contract (GPT-Data P7, built here).

    python pipeline/validate.py            # all six scopes; exit 1 on any failure
    python pipeline/validate.py --scope fraser

Checks: JSON Schema (contract/schemas) for regions.json and for geo, rivers, series, stats, fires/<year>
and air/<year> of every scope; the size budgets (country fires < 250 KB, basin fires < 80 KB, air < 150 KB,
rivers < 400 KB, geo < 300 KB, series < 150 KB, stats < 30 KB, regions < 10 KB; 1 KB = 1000 bytes);
every series has exactly the 168 months 2012-01..2025-12 and the 14 years 2012..2025; every year file
exists; no NaN / Infinity tokens; stats.json trends cover the scope's fish metric.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline import common  # noqa: E402

try:
    from jsonschema import Draft202012Validator
except ImportError:  # pragma: no cover
    Draft202012Validator = None

KB = 1000
BUDGETS = {"fires_country": 250 * KB, "fires_basin": 80 * KB, "air": 150 * KB, "rivers": 400 * KB,
           "geo": 300 * KB, "series": 150 * KB, "stats": 30 * KB, "regions": 10 * KB}
_validators: dict[str, object] = {}


def _validator(name: str):
    if Draft202012Validator is None:
        return None
    if name not in _validators:
        schema = json.loads((common.SCHEMAS / f"{name}.schema.json").read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        _validators[name] = Draft202012Validator(schema)
    return _validators[name]


def _bad_constant(token: str):
    raise ValueError(f"non-finite token {token!r} in JSON")


def check_file(path: Path, schema: str, budget: int, extra=None) -> dict:
    """Returns { file, size, status, problems[] }."""
    row = {"file": str(path.relative_to(common.ROOT)), "size": 0, "status": "PASS", "problems": []}
    if not path.exists():
        row["status"] = "FAIL"
        row["problems"].append("missing")
        return row
    row["size"] = path.stat().st_size
    if row["size"] > budget:
        row["problems"].append(f"size {row['size']} B > budget {budget} B")
    try:
        obj = json.loads(path.read_text(encoding="utf-8"), parse_constant=_bad_constant)
    except ValueError as err:
        row["status"] = "FAIL"
        row["problems"].append(f"invalid JSON: {err}")
        return row
    v = _validator(schema)
    if v is not None:
        errors = sorted(v.iter_errors(obj), key=lambda e: list(e.path))
        for err in errors[:3]:
            loc = "/".join(str(p) for p in err.absolute_path) or "<root>"
            row["problems"].append(f"schema: {loc}: {err.message[:120]}")
        if len(errors) > 3:
            row["problems"].append(f"schema: {len(errors) - 3} more error(s)")
    else:
        row["problems"].append("jsonschema not installed; schema not checked")
    if extra:
        row["problems"].extend(extra(obj))
    if row["problems"]:
        row["status"] = "FAIL"
    return row


def _series_extra(scope: dict):
    def check(obj):
        problems = []
        groups = [("variables", obj.get("variables", {}))] + [(f"waterBodies/{k}", v) for k, v in (obj.get("waterBodies") or {}).items()]
        for prefix, vars_ in groups:
            for var_id, v in vars_.items():
                years = [a[0] for a in v.get("annual", [])]
                if years != common.YEARS:
                    problems.append(f"{prefix}/{var_id}: annual years are not 2012..2025")
                if v.get("monthly") is not None:
                    months = [m[0] for m in v["monthly"]]
                    if months != common.MONTHS:
                        problems.append(f"{prefix}/{var_id}: monthly is not 2012-01..2025-12")
        if obj.get("scope") != scope["path"]:
            problems.append(f"scope is {obj.get('scope')!r}, expected {scope['path']!r}")
        if scope["kind"] == "basin":
            for wb in scope["meta"]["waterBodies"]:
                if wb["id"] not in (obj.get("waterBodies") or {}):
                    problems.append(f"waterBodies lacks {wb['id']}")
        return problems
    return check


def _stats_extra(scope: dict):
    def check(obj):
        problems = []
        if obj.get("scope") != scope["path"]:
            problems.append(f"scope is {obj.get('scope')!r}, expected {scope['path']!r}")
        fish = scope["meta"]["fishMetric"]
        if not any(t.get("variable") == fish and t.get("basis") == "annual" for t in obj.get("trends", [])):
            problems.append(f"no annual trend for the fish metric {fish}")
        for ln in obj.get("links", []):
            if ln.get("to") in ("fish_value", "fish_catch") and ln.get("to") != fish:
                problems.append(f"link to {ln['to']} but the scope's fish metric is {fish}")
        return problems
    return check


def _scope_member(scope: dict):
    def check(obj):
        s = obj.get("scope")
        return [f"scope member is {s!r}, expected {scope['path']!r}"] if s is not None and s != scope["path"] else []
    return check


def validate_scope(scope: dict) -> list[dict]:
    d = common.data_dir(scope)
    fires_budget = BUDGETS["fires_basin"] if scope["kind"] == "basin" else BUDGETS["fires_country"]
    rows = [
        check_file(d / "geo.geojson", "geo", BUDGETS["geo"], _scope_member(scope)),
        check_file(d / "rivers.geojson", "rivers", BUDGETS["rivers"], _scope_member(scope)),
        check_file(d / "series.json", "series", BUDGETS["series"], _series_extra(scope)),
        check_file(d / "stats.json", "stats", BUDGETS["stats"], _stats_extra(scope)),
    ]
    for y in common.YEARS:
        rows.append(check_file(d / "fires" / f"{y}.geojson", "fires", fires_budget, _scope_member(scope)))
    for y in common.YEARS:
        rows.append(check_file(d / "air" / f"{y}.geojson", "air", BUDGETS["air"], _scope_member(scope)))
    return rows


def validate_all(scopes: list[dict] | None = None, verbose: bool = True) -> list[dict]:
    rows = [check_file(common.DATA / "regions.json", "regions", BUDGETS["regions"])]
    for scope in scopes or common.SCOPES:
        rows.extend(validate_scope(scope))
    if verbose:
        width = max(len(r["file"]) for r in rows)
        shown = 0
        for r in rows:
            tag = r["file"].split("/")
            yearly = len(tag) >= 2 and tag[-2] in ("fires", "air") and r["status"] == "PASS"
            if yearly and not r["file"].endswith(("2012.geojson", "2025.geojson")):
                continue  # keep the table short: first and last year file per folder when they pass
            shown += 1
            print(f"{r['status']:4s} {r['size']:>8,d} B  {r['file']:<{width}}  {'; '.join(r['problems'])}")
        failed = [r for r in rows if r["status"] != "PASS"]
        print(f"{len(rows)} files checked ({shown} shown), {len(failed)} failed; total "
              f"{sum(r['size'] for r in rows) / 1e6:.2f} MB")
    return rows


def main(argv=None) -> int:
    scopes = common.scope_args(argv, __doc__.splitlines()[0])
    rows = validate_all(scopes)
    regions = common.load_regions()
    if regions.get("mock"):
        print("NOTE regions.json has \"mock\": true — never submit with the MOCK DATA badge showing.")
    return 1 if any(r["status"] != "PASS" for r in rows) else 0


if __name__ == "__main__":
    sys.exit(main())
