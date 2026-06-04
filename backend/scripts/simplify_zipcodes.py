#!/usr/bin/env python3
"""
Convert and simplify the custom ZIP code JSON to standard GeoJSON.

Input format: [{polygonId: "06810", points: [[lat, lng], ...]}, ...]
Output format: GeoJSON FeatureCollection (MULTIPOLYGON per ZIP)

Usage (from backend/ directory):
    python scripts/simplify_zipcodes.py --input /path/to/zipcode_data_simple.json
    python scripts/simplify_zipcodes.py --input /path/to/zipcode_data_simple.json --tolerance 0.001 --precision 4
"""

import json
import argparse
from pathlib import Path
from collections import defaultdict
from shapely.geometry import Polygon, MultiPolygon, mapping
from shapely.ops import unary_union


def truncate_coords(obj, precision: int):
    """Recursively truncate all coordinate floats to given decimal places."""
    if isinstance(obj, list):
        return [truncate_coords(item, precision) for item in obj]
    if isinstance(obj, float):
        return round(obj, precision)
    return obj


def simplify_zipcodes(input_path: Path, output_path: Path, tolerance: float, precision: int) -> None:
    print(f"Reading {input_path} ...")
    with open(input_path, encoding="utf-8") as f:
        data = json.load(f)
    print(f"  {len(data)} entries loaded.")

    # Group by polygonId to handle multi-part ZIPs (multiple rings same ZIP)
    groups: dict[str, list] = defaultdict(list)
    for entry in data:
        zip_code = entry.get("polygonId")
        points = entry.get("points", [])
        if zip_code and len(points) >= 4:
            groups[zip_code].append(points)

    print(f"  {len(groups)} unique ZIP codes.")

    features = []
    skipped = 0

    for i, (zip_code, rings) in enumerate(groups.items()):
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

            geom = unary_union(polys)
            geom = geom.simplify(tolerance, preserve_topology=True)

            if geom.is_empty:
                skipped += 1
                continue

            if isinstance(geom, Polygon):
                geom = MultiPolygon([geom])
            elif not isinstance(geom, MultiPolygon):
                skipped += 1
                continue

            geojson_geom = truncate_coords(mapping(geom), precision)

            features.append({
                "type": "Feature",
                "properties": {"zip": zip_code},
                "geometry": geojson_geom,
            })

        except Exception as exc:
            print(f"  error for {zip_code}: {exc}")
            skipped += 1

        if (i + 1) % 5000 == 0:
            print(f"  processed {i + 1}/{len(groups)} ...")

    feature_collection = {"type": "FeatureCollection", "features": features}

    print(f"Writing {output_path} ...")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(feature_collection, f, separators=(",", ":"))

    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"Done. {len(features)} features written, {skipped} skipped. Size: {size_mb:.1f} MB")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--input",
        default=str(Path(__file__).parent.parent / "data" / "zipcode_data_simple.json"),
        help="Path to input zipcode_data_simple.json (default: backend/data/zipcode_data_simple.json)",
    )
    parser.add_argument(
        "--output",
        default=str(Path(__file__).parent.parent / "data" / "us_zipcodes.geojson"),
        help="Output path (default: backend/data/us_zipcodes.geojson)",
    )
    parser.add_argument(
        "--tolerance",
        type=float,
        default=0.001,
        help="Simplification tolerance in degrees (~110m at 0.001). Default: 0.001",
    )
    parser.add_argument(
        "--precision",
        type=int,
        default=4,
        help="Decimal places to keep in coordinates (~11m at 4). Default: 4",
    )
    args = parser.parse_args()

    simplify_zipcodes(
        input_path=Path(args.input),
        output_path=Path(args.output),
        tolerance=args.tolerance,
        precision=args.precision,
    )
