"""Geometry processing utilities (simplification, format conversion)."""

import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon, mapping
from shapely.ops import unary_union

DATA_DIR = Path(__file__).parent.parent.parent / "data"
RAW_ZIP_FILE = DATA_DIR / "zipcode_data_simple.json"
SIMPLIFIED_ZIP_FILE = DATA_DIR / "us_zipcodes.geojson"


@dataclass
class SimplifyResult:
    input_size_mb: float
    output_size_mb: float
    feature_count: int
    skipped_count: int


def _truncate_coords(obj, precision: int):
    if isinstance(obj, list):
        return [_truncate_coords(item, precision) for item in obj]
    if isinstance(obj, float):
        return round(obj, precision)
    return obj


def simplify_zipcodes(
    input_path: Path = RAW_ZIP_FILE,
    output_path: Path = SIMPLIFIED_ZIP_FILE,
    tolerance: float = 0.001,
    precision: int = 4,
) -> SimplifyResult:
    with open(input_path, encoding="utf-8") as f:
        data = json.load(f)

    # Group by polygonId to handle multi-part ZIPs
    groups: dict[str, list] = defaultdict(list)
    for entry in data:
        zip_code = entry.get("polygonId")
        points = entry.get("points", [])
        if zip_code and len(points) >= 4:
            groups[zip_code].append(points)

    features = []
    skipped = 0

    for zip_code, rings in groups.items():
        try:
            polys = []
            for points in rings:
                # Input is [lat, lng]; GeoJSON requires [lng, lat]
                coords = [[lng, lat] for lat, lng in points]
                p = Polygon(coords)
                if not p.is_valid:
                    p = p.buffer(0)
                if not p.is_empty:
                    polys.append(p)

            if not polys:
                skipped += 1
                continue

            geom = unary_union(polys).simplify(tolerance, preserve_topology=True)

            if geom.is_empty:
                skipped += 1
                continue

            if isinstance(geom, Polygon):
                geom = MultiPolygon([geom])
            elif not isinstance(geom, MultiPolygon):
                skipped += 1
                continue

            features.append({
                "type": "Feature",
                "properties": {"zip": zip_code},
                "geometry": _truncate_coords(mapping(geom), precision),
            })

        except Exception:
            skipped += 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))

    return SimplifyResult(
        input_size_mb=input_path.stat().st_size / (1024 * 1024),
        output_size_mb=output_path.stat().st_size / (1024 * 1024),
        feature_count=len(features),
        skipped_count=skipped,
    )
