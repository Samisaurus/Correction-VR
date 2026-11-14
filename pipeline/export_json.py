#!/usr/bin/env python3
"""pipeline/export_json.py — copy the pipeline output into data/ and rewrite regions.json (P7).

    python pipeline/export_json.py --scope all        then        python pipeline/validate.py

For each scope: data/<scope path>/series.json from common.load_series (processed CSVs), and a copy of
geo.geojson, rivers.geojson, stats.json, fires/*.geojson and air/*.geojson from processed/<scope path>/.
regions.json is rewritten from the current file with "mock": false and every scope's eventYears set to
common.event_years(scope) (fraser and yukon stay fixed). Warns if a fixed event year has below-median fire_frp.
Real data replaces mock data in one commit: run this for all scopes, validate, then commit data/.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline import common  # noqa: E402

COPY = ["geo.geojson", "rivers.geojson", "stats.json"]


def main(argv=None) -> int:
    scopes = common.scope_args(argv, __doc__.splitlines()[0])
    regions = common.load_regions()
    for scope in scopes:
        pdir, ddir = common.processed_dir(scope), common.data_dir(scope)
        ddir.mkdir(parents=True, exist_ok=True)
        series = common.load_series(scope)
        size = common.write_json(series, ddir / "series.json")
        print(f"{scope['name']}: series.json {size / 1000:.0f} kB")
        for name in COPY:
            if (pdir / name).exists():
                shutil.copyfile(pdir / name, ddir / name)
            else:
                print(f"  WARNING {name} missing in {pdir.relative_to(common.ROOT)}")
        for folder in ("fires", "air"):
            (ddir / folder).mkdir(exist_ok=True)
            for y in common.YEARS:
                src = pdir / folder / f"{y}.geojson"
                if src.exists():
                    shutil.copyfile(src, ddir / folder / f"{y}.geojson")
                else:
                    print(f"  WARNING {folder}/{y}.geojson missing")
        events = common.event_years(scope, series)
        annual = [v for _, v in series["variables"]["fire_frp"]["annual"] if v is not None]
        median = sorted(annual)[len(annual) // 2] if annual else None
        for y in events:
            v = dict((yy, vv) for yy, vv in series["variables"]["fire_frp"]["annual"]).get(y)
            if scope["name"] in common.FIXED_EVENT_SCOPES and median is not None and (v is None or v < median):
                print(f"  WARNING fixed event year {y} has below-median fire_frp ({v} < {median})")
        for c in regions["countries"]:
            if scope["kind"] == "country" and c["id"] == scope["name"]:
                c["eventYears"] = events
            elif scope["kind"] == "basin" and c["basin"]["id"] == scope["name"]:
                c["basin"]["eventYears"] = events
        print(f"  eventYears -> {events}")
    regions["mock"] = False
    common.write_json(regions, common.DATA / "regions.json")
    print('regions.json rewritten with "mock": false — now run python pipeline/validate.py')
    return 0


if __name__ == "__main__":
    sys.exit(main())
