#!/usr/bin/env python3
"""pipeline/build_geo.py — outlines, basins, water boxes and rivers with near-fire years (P4).

    python pipeline/build_geo.py --scope canada|fraser|usa|yukon|russia|amur|all   (run after fetch_firms.py)

Inputs: pipeline/raw/geo/<country>_outline.geojson, <country>_rivers.geojson (Natural Earth),
        <basin>_basin.geojson (HydroBASINS), <basin>_rivers.geojson (HydroRIVERS, ORD_STRA kept),
        processed/<scope path>/fires/<year>.geojson from P1.
Country geo.geojson: national outline clipped to the scope bbox (kind country) + dissolved basin (kind basin).
Basin geo.geojson: dissolved basin (kind basin) + one rectangle per water body (kind water). Simplified from
0.01° until < 300 KB. rivers.geojson: multi-lines exploded; order = ORD_STRA if present else clip(10 -
scalerank, 1, 9); basin keeps order >= 4 (5 if over 400 KB); country keeps everything (drops the smallest order
while over 400 KB); simplify 0.005° (basin) / 0.02° (country); sequential ids; name from NAME/name or null.
nearFire: per year, buffer the fire-cell centres by 25 km (basin, UTM zone of the bbox centre) or 50 km
(country, EPSG:6933) and record the year on every intersecting segment. Coordinates rounded to 4 decimals.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline import common  # noqa: E402

from shapely.geometry import box, mapping, shape  # noqa: E402
from shapely.ops import transform, unary_union  # noqa: E402
from shapely.strtree import STRtree  # noqa: E402
from pyproj import CRS, Transformer  # noqa: E402

GEO_BUDGET, RIVER_BUDGET = 300_000, 400_000


def read(path: Path):
    if not path.exists():
        print(f"  WARNING missing {path.relative_to(common.ROOT)}")
        return []
    gj = json.loads(path.read_text(encoding="utf-8"))
    return gj["features"] if gj.get("type") == "FeatureCollection" else [gj]


def dissolve(features):
    geoms = [shape(f["geometry"]).buffer(0) for f in features if f.get("geometry")]
    return unary_union(geoms) if geoms else None


def rounded(geom, nd=4):
    return json.loads(json.dumps(mapping(geom)), parse_float=lambda s: round(float(s), nd))


def feature(geom, props):
    return {"type": "Feature", "geometry": rounded(geom), "properties": props}


def write_geo(scope: dict) -> None:
    meta, path = scope["meta"], common.processed_dir(scope) / "geo.geojson"
    bbox = box(*meta["bbox"])
    basin_id = meta["id"] if scope["kind"] == "basin" else meta["basin"]["id"]
    basin_name = meta["name"] if scope["kind"] == "basin" else meta["basin"]["name"]
    basin = dissolve(read(common.RAW / "geo" / f"{basin_id}_basin.geojson"))
    parts = []
    if scope["kind"] == "country":
        outline = dissolve(read(common.RAW / "geo" / f"{scope['country']}_outline.geojson"))
        if outline is not None:
            parts.append((outline.intersection(bbox), {"kind": "country", "id": scope["country"], "name": meta["name"]}))
        if basin is not None:
            parts.append((basin, {"kind": "basin", "id": basin_id, "name": basin_name}))
    else:
        if basin is not None:
            parts.append((basin, {"kind": "basin", "id": basin_id, "name": basin_name}))
        for wb in meta["waterBodies"]:
            parts.append((box(*wb["bbox"]), {"kind": "water", "id": wb["id"], "name": wb["name"]}))
    tol = 0.01
    while True:
        feats = [feature(g.simplify(tol, preserve_topology=True) if p["kind"] != "water" else g, p) for g, p in parts]
        size = common.write_json({"type": "FeatureCollection", "scope": scope["path"], "features": feats}, path, sig=8)
        if size <= GEO_BUDGET or tol > 1:
            break
        tol *= 1.5
    print(f"  geo.geojson: {len(feats)} features, {size / 1000:.0f} kB (tolerance {tol:.3f}°)")


def fire_points(scope: dict, year: int):
    path = common.processed_dir(scope) / "fires" / f"{year}.geojson"
    if not path.exists():
        return []
    from shapely.geometry import Point
    return [Point(f["geometry"]["coordinates"]) for f in json.loads(path.read_text(encoding="utf-8"))["features"]]


def metric_crs(scope: dict) -> CRS:
    if scope["kind"] == "country":
        return CRS.from_epsg(6933)
    w, s, e, n = scope["meta"]["bbox"]
    zone = int((((w + e) / 2) + 180) // 6) + 1
    return CRS.from_epsg((32600 if (s + n) / 2 >= 0 else 32700) + zone)


def write_rivers(scope: dict) -> None:
    kind = scope["kind"]
    src = common.RAW / "geo" / (f"{scope['country']}_rivers.geojson" if kind == "country" else f"{scope['meta']['id']}_rivers.geojson")
    lines = []
    for f in read(src):
        p = f.get("properties") or {}
        if "ORD_STRA" in p and p["ORD_STRA"] is not None:
            order = int(p["ORD_STRA"])
        else:
            order = int(max(1, min(9, 10 - int(p.get("scalerank") or 5))))
        name = p.get("NAME") or p.get("name") or p.get("name_en") or None
        g = shape(f["geometry"])
        geoms = list(g.geoms) if g.geom_type == "MultiLineString" else [g]
        for ln in geoms:
            lines.append((ln.simplify(0.005 if kind == "basin" else 0.02, preserve_topology=False), order, name))
    min_order = 4 if kind == "basin" else 1
    path = common.processed_dir(scope) / "rivers.geojson"
    fwd = Transformer.from_crs(CRS.from_epsg(4326), metric_crs(scope), always_xy=True).transform
    radius = 25_000 if kind == "basin" else 50_000
    while True:
        kept = [l for l in lines if l[1] >= min_order and len(l[0].coords) >= 2]
        metric = [transform(fwd, l[0]) for l in kept]
        tree = STRtree(metric) if metric else None
        near = [[] for _ in kept]
        counts = {}
        for year in common.YEARS:
            pts = fire_points(scope, year)
            if not pts or tree is None:
                continue
            buf = unary_union([transform(fwd, p).buffer(radius) for p in pts])
            hits = set(tree.query(buf, predicate="intersects").tolist())
            counts[year] = len(hits)
            for i in hits:
                near[i].append(year)
        feats = [feature(l[0], {"id": i + 1, "name": l[2], "order": int(l[1]), "nearFire": sorted(near[i])}) for i, l in enumerate(kept)]
        size = common.write_json({"type": "FeatureCollection", "scope": scope["path"], "features": feats}, path, sig=8)
        if size <= RIVER_BUDGET or min_order >= 9:
            break
        min_order += 1
        print(f"  WARNING rivers over 400 KB; dropping order < {min_order}")
    print(f"  rivers.geojson: {len(feats)} segments, {size / 1000:.0f} kB; near-fire segments per year: {counts}")


def main(argv=None) -> int:
    for scope in common.scope_args(argv, __doc__.splitlines()[0]):
        print(f"{scope['name']}:")
        write_geo(scope)
        write_rivers(scope)
    return 0


if __name__ == "__main__":
    sys.exit(main())
