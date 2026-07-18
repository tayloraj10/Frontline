"""Geometry processing utilities (simplification, format conversion)."""

import json
import xml.etree.ElementTree as ET
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.ops import unary_union

DATA_DIR = Path(__file__).parent.parent.parent / "data"
RAW_ZIP_FILE = DATA_DIR / "zipcode_data_simple.json"
SIMPLIFIED_ZIP_FILE = DATA_DIR / "us_zipcodes.geojson"
RAW_UK_POSTCODE_FILE = DATA_DIR / "uk_postcode_districts.kml"
SIMPLIFIED_UK_POSTCODE_FILE = DATA_DIR / "uk_postcode_districts.geojson"
RAW_NYC_NEIGHBORHOODS_FILE = DATA_DIR / "nyc_neighborhoods_raw.geojson"
SIMPLIFIED_NYC_NEIGHBORHOODS_FILE = DATA_DIR / "nyc_neighborhoods.geojson"

_KML_NS = {"kml": "http://www.opengis.net/kml/2.2"}


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


def _kml_coords_to_ring(coords_text: str) -> list[list[float]]:
    ring = []
    for triplet in coords_text.split():
        lng, lat, *_ = triplet.split(",")
        ring.append([float(lng), float(lat)])
    return ring


def _kml_polygon_to_shapely(polygon_el: ET.Element) -> Polygon | None:
    outer_el = polygon_el.find("kml:outerBoundaryIs/kml:LinearRing/kml:coordinates", _KML_NS)
    if outer_el is None or not (outer_el.text or "").strip():
        return None
    outer = _kml_coords_to_ring(outer_el.text)
    if len(outer) < 4:
        return None

    holes = []
    for inner_el in polygon_el.findall("kml:innerBoundaryIs/kml:LinearRing/kml:coordinates", _KML_NS):
        if inner_el.text and inner_el.text.strip():
            hole = _kml_coords_to_ring(inner_el.text)
            if len(hole) >= 4:
                holes.append(hole)

    poly = Polygon(outer, holes)
    if not poly.is_valid:
        poly = poly.buffer(0)
    return None if poly.is_empty else poly


def simplify_uk_postcode_districts(
    input_path: Path = RAW_UK_POSTCODE_FILE,
    output_path: Path = SIMPLIFIED_UK_POSTCODE_FILE,
    tolerance: float = 0.001,
    precision: int = 4,
) -> SimplifyResult:
    tree = ET.parse(input_path)
    root = tree.getroot()

    polys_by_district: dict[str, list[Polygon]] = defaultdict(list)
    skipped = 0

    for placemark in root.findall(".//kml:Placemark", _KML_NS):
        name_el = placemark.find("kml:name", _KML_NS)
        district = (name_el.text or "").strip() if name_el is not None else ""
        if not district:
            skipped += 1
            continue

        try:
            polygon_els = placemark.findall(
                "kml:MultiGeometry/kml:Polygon", _KML_NS
            ) or placemark.findall("kml:Polygon", _KML_NS)

            polys = [p for p in (_kml_polygon_to_shapely(el) for el in polygon_els) if p is not None]
            if not polys:
                skipped += 1
                continue

            polys_by_district[district].extend(polys)

        except Exception:
            skipped += 1

    features = []
    for district, polys in polys_by_district.items():
        try:
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
                "properties": {"postcode_district": district},
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


def simplify_nyc_neighborhoods(
    input_path: Path = RAW_NYC_NEIGHBORHOODS_FILE,
    output_path: Path = SIMPLIFIED_NYC_NEIGHBORHOODS_FILE,
    tolerance: float = 0.0001,
    precision: int = 5,
) -> SimplifyResult:
    """
    NYC Open Data's 2020 Neighborhood Tabulation Areas (NTA) GeoJSON. Filters out
    ntatype != '0' rows (parks, cemeteries, airports, and other non-residential areas)
    since those aren't neighborhoods and would break the adjacency-colored mosaic look.
    """
    with open(input_path, encoding="utf-8") as f:
        data = json.load(f)

    features = []
    skipped = 0

    for feat in data.get("features", []):
        props = feat.get("properties") or {}
        if props.get("ntatype") != "0":
            skipped += 1
            continue

        unit_id = props.get("nta2020")
        display_name = props.get("ntaname")
        geometry = feat.get("geometry")
        if not unit_id or not display_name or not geometry:
            skipped += 1
            continue

        try:
            geom = shape(geometry).simplify(tolerance, preserve_topology=True)

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
                "properties": {"unit_id": unit_id, "display_name": display_name},
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
