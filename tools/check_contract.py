#!/usr/bin/env python3
"""tools/check_contract.py - validate contract/examples/*.json against contract/schemas (C0).

Each example file name starts with the schema it belongs to: regions.json, geo.*.json,
rivers.*.json, fires.*.json, air.*.json, series.*.json, stats.*.json.
Run from the repo root:  python tools/check_contract.py   (exit 1 on any failure)
"""
import json
import sys
from pathlib import Path

try:
    from jsonschema import Draft202012Validator
except ImportError:  # pragma: no cover
    sys.exit("pip install jsonschema")

ROOT = Path(__file__).resolve().parents[1]
SCHEMAS = ROOT / "contract" / "schemas"
EXAMPLES = ROOT / "contract" / "examples"


def validator_for(name):
    schema = json.loads((SCHEMAS / f"{name}.schema.json").read_text())
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def main():
    failures = 0
    validators = {}
    for path in sorted(EXAMPLES.glob("*.json")):
        name = path.name.split(".")[0]
        if name not in validators:
            validators[name] = validator_for(name)
        errors = sorted(validators[name].iter_errors(json.loads(path.read_text())), key=lambda e: list(e.path))
        status = "PASS" if not errors else "FAIL"
        if errors:
            failures += 1
        print(f"{status}  {path.relative_to(ROOT)}  ->  {name}.schema.json")
        for err in errors[:5]:
            loc = "/".join(str(p) for p in err.absolute_path) or "<root>"
            print(f"       at {loc}: {err.message[:160]}")
    for name in ("regions", "geo", "rivers", "fires", "air", "series", "stats"):
        if name not in validators:
            validator_for(name)
            print(f"NOTE  no example for {name}.schema.json (schema itself is valid)")
    print("all examples valid" if not failures else f"{failures} example file(s) failed")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
