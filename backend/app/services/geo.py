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
RAW_NYC_BOROUGHS_FILE = DATA_DIR / "nyc_boroughs_raw.geojson"
SIMPLIFIED_NYC_BOROUGHS_FILE = DATA_DIR / "nyc_boroughs.geojson"
RAW_CITIES_FILE = DATA_DIR / "cities_raw.geojson"
SIMPLIFIED_CITIES_FILE = DATA_DIR / "cities.geojson"
RAW_PHILADELPHIA_NEIGHBORHOODS_FILE = DATA_DIR / "philadelphia_neighborhoods_raw.geojson"
SIMPLIFIED_PHILADELPHIA_NEIGHBORHOODS_FILE = DATA_DIR / "philadelphia_neighborhoods.geojson"
RAW_CHICAGO_NEIGHBORHOODS_FILE = DATA_DIR / "chicago_neighborhoods_raw.geojson"
SIMPLIFIED_CHICAGO_NEIGHBORHOODS_FILE = DATA_DIR / "chicago_neighborhoods.geojson"
RAW_LA_NEIGHBORHOODS_FILE = DATA_DIR / "la_neighborhoods_raw.geojson"
SIMPLIFIED_LA_NEIGHBORHOODS_FILE = DATA_DIR / "la_neighborhoods.geojson"

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


def simplify_philadelphia_neighborhoods(
    input_path: Path = RAW_PHILADELPHIA_NEIGHBORHOODS_FILE,
    output_path: Path = SIMPLIFIED_PHILADELPHIA_NEIGHBORHOODS_FILE,
    tolerance: float = 0.0001,
    precision: int = 5,
) -> SimplifyResult:
    """
    OpenDataPhilly's Philadelphia Neighborhoods GeoJSON. NAME is the unique upper-case
    key; LISTNAME is the human-readable display name.
    """
    with open(input_path, encoding="utf-8") as f:
        data = json.load(f)

    features = []
    skipped = 0

    for feat in data.get("features", []):
        props = feat.get("properties") or {}
        unit_id = props.get("NAME")
        display_name = props.get("LISTNAME")
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


def simplify_chicago_neighborhoods(
    input_path: Path = RAW_CHICAGO_NEIGHBORHOODS_FILE,
    output_path: Path = SIMPLIFIED_CHICAGO_NEIGHBORHOODS_FILE,
    tolerance: float = 0.0001,
    precision: int = 5,
) -> SimplifyResult:
    """
    Chicago Data Portal's "Boundaries - Neighborhoods" dataset (bbvz-uum9), fetched via
    its v3 query API since the SODA/export endpoints for this dataset return empty
    geometry. pri_neigh is the unique neighborhood name.
    """
    with open(input_path, encoding="utf-8") as f:
        data = json.load(f)

    features = []
    skipped = 0

    for feat in data.get("features", []):
        props = feat.get("properties") or {}
        unit_id = props.get("pri_neigh")
        display_name = props.get("pri_neigh")
        geometry = feat.get("geometry")
        if not unit_id or not geometry:
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


def simplify_la_neighborhoods(
    input_path: Path = RAW_LA_NEIGHBORHOODS_FILE,
    output_path: Path = SIMPLIFIED_LA_NEIGHBORHOODS_FILE,
    tolerance: float = 0.0001,
    precision: int = 5,
) -> SimplifyResult:
    """
    LA Times "Mapping L.A." neighborhood boundaries (ArcGIS FeatureServer mirror at
    services5.arcgis.com/7nsPwEMP38bSkCjy). Unlike Philadelphia/Chicago's official city
    GIS layers, this is an editorial/crowd-informed dataset, not a government source —
    but it's the standard reference for what Angelenos call their neighborhoods, and
    the layer is already scoped to the City of LA proper (no independent cities like
    Long Beach or Santa Monica mixed in). name is the unique key.
    """
    with open(input_path, encoding="utf-8") as f:
        data = json.load(f)

    features = []
    skipped = 0

    for feat in data.get("features", []):
        props = feat.get("properties") or {}
        unit_id = props.get("name")
        display_name = props.get("name")
        geometry = feat.get("geometry")
        if not unit_id or not geometry:
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


# Census BASENAME values are the bare place name (e.g. "New York"), which reads
# ambiguously next to Philadelphia/Chicago/LA on the map. Override per GEOID.
#
# LA is fetched from the Urban Areas layer (GEOID 51445, "Los Angeles--Long Beach--
# Anaheim"), not Incorporated Places, because LA city limits are riddled with
# carved-out enclave cities (Beverly Hills, West Hollywood, Culver City, Santa
# Monica) and a narrow non-contiguous-looking "shoestring strip" down to the port at
# San Pedro — it reads as a broken/wrong shape on the map even though it's accurate.
# The CBSA (GEOID 31080, all of LA County) was tried first but is coextensive with
# the county line: it reaches ~35 miles further north into the Antelope Valley
# desert than the built-up area does, and detaches to include Catalina and San
# Nicolas islands offshore — neither of which reads as "LA" on a map. The Urban Area
# boundary is the actual contiguous developed footprint (crossing into Orange/
# Riverside/San Bernardino counties where the urbanization does, with no desert
# panhandle or islands) and is what people actually mean by "LA" colloquially. It's
# still a different kind of boundary than NYC/Philadelphia/Chicago's city limits —
# the override name below exists so the map is upfront about that instead of just
# saying "Los Angeles" like it's a city limit.
_CITY_DISPLAY_NAME_OVERRIDES = {
    "3651000": "New York City",
    "51445": "Los Angeles Metro Area",
}


def simplify_cities(
    input_path: Path = RAW_CITIES_FILE,
    output_path: Path = SIMPLIFIED_CITIES_FILE,
    tolerance: float = 0.0002,
    precision: int = 5,
) -> SimplifyResult:
    """
    City-limits polygons fetched from the Census TIGERweb "Incorporated Places" layer
    (queried by GEOID, which encodes state + place and avoids name collisions across
    states). Used for optional team-event geofencing: a team can be assigned to a
    city's boundary so only contributions logged inside it count.
    """
    with open(input_path, encoding="utf-8") as f:
        data = json.load(f)

    features = []
    skipped = 0

    for feat in data.get("features", []):
        props = feat.get("properties") or {}
        unit_id = props.get("GEOID")
        display_name = props.get("BASENAME")
        geometry = feat.get("geometry")
        if not unit_id or not display_name or not geometry:
            skipped += 1
            continue
        display_name = _CITY_DISPLAY_NAME_OVERRIDES.get(unit_id, display_name)

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


def simplify_nyc_boroughs(
    input_path: Path = RAW_NYC_BOROUGHS_FILE,
    output_path: Path = SIMPLIFIED_NYC_BOROUGHS_FILE,
    tolerance: float = 0.0001,
    precision: int = 5,
) -> SimplifyResult:
    """
    NYC Open Data's "Borough Boundaries" dataset (shoreline-clipped, 5 features —
    one per borough). Used both for its own toggleable layer and, dissolved, as
    the single gold outline around the whole city.
    """
    with open(input_path, encoding="utf-8") as f:
        data = json.load(f)

    features = []
    skipped = 0

    for feat in data.get("features", []):
        props = feat.get("properties") or {}
        unit_id = props.get("borocode")
        display_name = props.get("boroname")
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
