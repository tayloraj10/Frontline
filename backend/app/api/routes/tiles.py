from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services.seeders import GeoUnitType

router = APIRouter(prefix="/tiles", tags=["tiles"])

# In-process tile cache: keyed by (campaign_id, z, x, y) → raw bytes
# Capped at 2 000 entries (~200 MB worst-case at 100 KB/tile) to prevent OOM.
_tile_cache: dict[tuple, bytes] = {}
_TILE_CACHE_MAX = 2000

# GeoUnitType value -> cache_key prefix used by that type's tile endpoint above.
_TILE_CACHE_PREFIX_BY_UNIT_TYPE = {
    "nyc_borough": "nyc_boroughs",
    "nyc_neighborhood": "nyc_neighborhoods",
    "city": "cities",
    "philadelphia_neighborhood": "philadelphia_neighborhoods",
    "chicago_neighborhood": "chicago_neighborhoods",
    "la_neighborhood": "la_neighborhoods",
}


def reset_tile_cache(unit_type: str) -> None:
    """Evict cached MVT tiles for one unit_type after a reload.

    Without this, any (z, x, y) tile requested before a reload finished (e.g.
    while the geo_units table was still empty) keeps serving its stale cached
    bytes forever, regardless of how much later the data actually arrives.
    """
    prefix = _TILE_CACHE_PREFIX_BY_UNIT_TYPE.get(unit_type)
    if prefix is None:
        return
    for key in [k for k in _tile_cache if k[0] == prefix]:
        del _tile_cache[key]

# Adjacency rarely changes (only on a re-seed), so cache the whole map in-process
# rather than per-request. None means "not yet computed"; reset on backend restart,
# or explicitly via reset_adjacency_cache() when a reload repopulates the data.
_nyc_adjacency_cache: dict[str, list[str]] | None = None
_philadelphia_adjacency_cache: dict[str, list[str]] | None = None
_chicago_adjacency_cache: dict[str, list[str]] | None = None
_la_adjacency_cache: dict[str, list[str]] | None = None


def reset_adjacency_cache(unit_type: str) -> None:
    """Clear the in-process adjacency cache for one unit_type after a reload.

    Without this, a reload that runs after an earlier empty-result cache hit
    (e.g. seeding before the geo_units table had any rows) leaves that empty
    result cached for the life of the process, since `is not None` treats an
    empty dict as "already computed".
    """
    global _nyc_adjacency_cache, _philadelphia_adjacency_cache, _chicago_adjacency_cache, _la_adjacency_cache
    if unit_type == "nyc_neighborhood":
        _nyc_adjacency_cache = None
    elif unit_type == "philadelphia_neighborhood":
        _philadelphia_adjacency_cache = None
    elif unit_type == "chicago_neighborhood":
        _chicago_adjacency_cache = None
    elif unit_type == "la_neighborhood":
        _la_adjacency_cache = None

_SIMPLIFY_TOLERANCE = {
    range(0, 6): 0.05,
    range(6, 9): 0.005,
    range(9, 12): 0.001,
}

# Tighter tolerance for unit types whose adjacent polygons must share borders
# (independent per-row simplification otherwise breaks shared edges and opens
# visible gaps between neighboring shapes). Falls back to _SIMPLIFY_TOLERANCE
# for any unit_type not listed here. Keyed by GeoUnitType (not raw strings) so
# adding a new country's geography here can't silently typo-mismatch the
# unit_type written by its seeder.
_SIMPLIFY_TOLERANCE_BY_UNIT_TYPE: dict[GeoUnitType, dict] = {
    GeoUnitType.UK_POSTCODE_DISTRICT: {
        range(0, 9): 0.0001,
    },
    GeoUnitType.NYC_NEIGHBORHOOD: {
        range(0, 9): 0.0001,
    },
    GeoUnitType.PHILADELPHIA_NEIGHBORHOOD: {
        range(0, 9): 0.0001,
    },
    GeoUnitType.CHICAGO_NEIGHBORHOOD: {
        range(0, 9): 0.0001,
    },
    GeoUnitType.LA_NEIGHBORHOOD: {
        range(0, 9): 0.0001,
    },
}


def _tolerance(z: int, unit_type_table: dict | None = None) -> float:
    table = unit_type_table or _SIMPLIFY_TOLERANCE
    for r, t in table.items():
        if z in r:
            return t
    return 0.0


@router.get("/h3-bloom/{campaign_id}/{z}/{x}/{y}.mvt")
async def get_h3_bloom_tile(
    campaign_id: UUID,
    z: int,
    x: int,
    y: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
            WITH bounds AS (
                SELECT
                    ST_TileEnvelope(:z, :x, :y)                      AS geom_3857,
                    ST_Transform(ST_TileEnvelope(:z, :x, :y), 4326)  AS geom_4326
            ),
            mvt_geom AS (
                SELECT
                    gu.id::text                                AS geo_unit_id,
                    gu.unit_id                                 AS h3_index,
                    COALESCE(tc.total_value, 0)::float         AS bloom_score,
                    CASE
                        WHEN COALESCE(tc.total_value, 0) >= 1500 THEN 5
                        WHEN COALESCE(tc.total_value, 0) >= 600  THEN 4
                        WHEN COALESCE(tc.total_value, 0) >= 200  THEN 3
                        WHEN COALESCE(tc.total_value, 0) >= 50   THEN 2
                        WHEN tc.total_value IS NOT NULL           THEN 1
                        ELSE 0
                    END                                        AS bloom_stage,
                    gu.seed_source,
                    ST_AsMVTGeom(
                        ST_Transform(gu.geometry, 3857),
                        bounds.geom_3857,
                        4096, 8, true
                    )                                          AS geom
                FROM geo_units gu
                CROSS JOIN bounds
                LEFT JOIN territory_claims tc
                    ON tc.geo_unit_id = gu.id
                    AND tc.campaign_id = :campaign_id
                WHERE gu.unit_type = 'h3_hex'
                  AND gu.geometry && bounds.geom_4326
            )
            SELECT ST_AsMVT(mvt_geom.*, 'hexes', 4096, 'geom')
            FROM mvt_geom
            WHERE mvt_geom.geom IS NOT NULL
        """),
        {"z": z, "x": x, "y": y, "campaign_id": str(campaign_id)},
    )

    tile_data = result.scalar()
    tile_bytes = bytes(tile_data) if tile_data else b""
    return Response(
        content=tile_bytes,
        media_type="application/x-protobuf",
        headers={"Cache-Control": "public, max-age=30", "Access-Control-Allow-Origin": "*"},
    )


@router.get("/nyc-neighborhoods/adjacency")
async def get_nyc_neighborhoods_adjacency(db: AsyncSession = Depends(get_db)):
    global _nyc_adjacency_cache
    if _nyc_adjacency_cache is not None:
        return _nyc_adjacency_cache

    # Seed every neighborhood as a key first (empty list default) so units with no
    # detected touching neighbor still get a dict entry — otherwise the client-side
    # graph coloring never assigns them a color and they render with the fallback
    # (gray) fill instead of a palette color.
    all_units = await db.execute(
        text("SELECT unit_id FROM geo_units WHERE unit_type = 'nyc_neighborhood'")
    )
    adjacency: dict[str, list[str]] = {row.unit_id: [] for row in all_units}

    result = await db.execute(
        text("""
            SELECT a.unit_id AS unit_id, b.unit_id AS adjacent_unit_id
            FROM geo_unit_adjacency ga
            JOIN geo_units a ON a.id = ga.geo_unit_id
            JOIN geo_units b ON b.id = ga.adjacent_geo_unit_id
            WHERE a.unit_type = 'nyc_neighborhood'
        """)
    )
    for row in result:
        adjacency.setdefault(row.unit_id, []).append(row.adjacent_unit_id)

    _nyc_adjacency_cache = adjacency
    return _nyc_adjacency_cache


@router.get("/nyc-boroughs/{z}/{x}/{y}.mvt")
async def get_nyc_boroughs_tile(
    z: int,
    x: int,
    y: int,
    db: AsyncSession = Depends(get_db),
):
    """Per-borough polygons (5 features) — for future borough-level features/layers."""
    cache_key = ("nyc_boroughs", z, x, y)
    if cache_key in _tile_cache:
        return Response(
            content=_tile_cache[cache_key],
            media_type="application/x-protobuf",
            headers={"Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*"},
        )

    result = await db.execute(
        text("""
            WITH bounds AS (
                SELECT
                    ST_TileEnvelope(:z, :x, :y) AS geom_3857,
                    ST_Transform(ST_TileEnvelope(:z, :x, :y), 4326) AS geom_4326
            ),
            mvt_geom AS (
                SELECT
                    g.id::text AS geo_unit_id,
                    g.unit_id AS unit_id,
                    COALESCE(g.display_name, g.unit_id) AS display_name,
                    ST_AsMVTGeom(
                        ST_Transform(g.geometry, 3857),
                        bounds.geom_3857,
                        4096, 8, true
                    ) AS geom
                FROM geo_units g
                CROSS JOIN bounds
                WHERE g.unit_type = 'nyc_borough'
                  AND g.geometry && bounds.geom_4326
                  AND ST_Intersects(g.geometry, bounds.geom_4326)
            )
            SELECT ST_AsMVT(mvt_geom.*, 'nyc_boroughs', 4096, 'geom')
            FROM mvt_geom
            WHERE mvt_geom.geom IS NOT NULL
        """),
        {"z": z, "x": x, "y": y},
    )

    tile_data = result.scalar()
    tile_bytes = bytes(tile_data) if tile_data else b""
    if len(_tile_cache) >= _TILE_CACHE_MAX:
        evict = list(_tile_cache.keys())[: _TILE_CACHE_MAX // 4]
        for k in evict:
            _tile_cache.pop(k, None)
    _tile_cache[cache_key] = tile_bytes

    return Response(
        content=tile_bytes,
        media_type="application/x-protobuf",
        headers={"Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*"},
    )


# Registered ahead of the generic /{campaign_id}/{z}/{x}/{y}.mvt route below: both
# have the same four-segment shape, and a literal "nyc-neighborhoods" prefix would
# otherwise be swallowed by that route first and fail UUID validation on campaign_id.
@router.get("/nyc-neighborhoods/{z}/{x}/{y}.mvt")
async def get_nyc_neighborhoods_tile(
    z: int,
    x: int,
    y: int,
    db: AsyncSession = Depends(get_db),
):
    cache_key = ("nyc_neighborhoods", z, x, y)
    if cache_key in _tile_cache:
        return Response(
            content=_tile_cache[cache_key],
            media_type="application/x-protobuf",
            headers={"Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*"},
        )

    tolerance = _tolerance(z, _SIMPLIFY_TOLERANCE_BY_UNIT_TYPE.get(GeoUnitType.NYC_NEIGHBORHOOD))
    geom_expr = (
        f"ST_SimplifyPreserveTopology(g.geometry, {tolerance})" if tolerance > 0 else "g.geometry"
    )

    result = await db.execute(
        text(f"""
            WITH bounds AS (
                SELECT
                    ST_TileEnvelope(:z, :x, :y) AS geom_3857,
                    ST_Transform(ST_TileEnvelope(:z, :x, :y), 4326) AS geom_4326
            ),
            mvt_geom AS (
                SELECT
                    g.id::text AS geo_unit_id,
                    g.unit_id AS unit_id,
                    COALESCE(g.display_name, g.unit_id) AS display_name,
                    ST_AsMVTGeom(
                        ST_Transform({geom_expr}, 3857),
                        bounds.geom_3857,
                        4096, 8, true
                    ) AS geom
                FROM geo_units g
                CROSS JOIN bounds
                WHERE g.unit_type = 'nyc_neighborhood'
                  AND g.geometry && bounds.geom_4326
                  AND ST_Intersects(g.geometry, bounds.geom_4326)
            )
            SELECT ST_AsMVT(mvt_geom.*, 'nyc_neighborhoods', 4096, 'geom')
            FROM mvt_geom
            WHERE mvt_geom.geom IS NOT NULL
        """),
        {"z": z, "x": x, "y": y},
    )

    tile_data = result.scalar()
    tile_bytes = bytes(tile_data) if tile_data else b""
    if len(_tile_cache) >= _TILE_CACHE_MAX:
        evict = list(_tile_cache.keys())[: _TILE_CACHE_MAX // 4]
        for k in evict:
            _tile_cache.pop(k, None)
    _tile_cache[cache_key] = tile_bytes

    return Response(
        content=tile_bytes,
        media_type="application/x-protobuf",
        headers={"Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*"},
    )


@router.get("/philadelphia-neighborhoods/adjacency")
async def get_philadelphia_neighborhoods_adjacency(db: AsyncSession = Depends(get_db)):
    global _philadelphia_adjacency_cache
    if _philadelphia_adjacency_cache is not None:
        return _philadelphia_adjacency_cache

    all_units = await db.execute(
        text("SELECT unit_id FROM geo_units WHERE unit_type = 'philadelphia_neighborhood'")
    )
    adjacency: dict[str, list[str]] = {row.unit_id: [] for row in all_units}

    result = await db.execute(
        text("""
            SELECT a.unit_id AS unit_id, b.unit_id AS adjacent_unit_id
            FROM geo_unit_adjacency ga
            JOIN geo_units a ON a.id = ga.geo_unit_id
            JOIN geo_units b ON b.id = ga.adjacent_geo_unit_id
            WHERE a.unit_type = 'philadelphia_neighborhood'
        """)
    )
    for row in result:
        adjacency.setdefault(row.unit_id, []).append(row.adjacent_unit_id)

    _philadelphia_adjacency_cache = adjacency
    return _philadelphia_adjacency_cache


@router.get("/chicago-neighborhoods/adjacency")
async def get_chicago_neighborhoods_adjacency(db: AsyncSession = Depends(get_db)):
    global _chicago_adjacency_cache
    if _chicago_adjacency_cache is not None:
        return _chicago_adjacency_cache

    all_units = await db.execute(
        text("SELECT unit_id FROM geo_units WHERE unit_type = 'chicago_neighborhood'")
    )
    adjacency: dict[str, list[str]] = {row.unit_id: [] for row in all_units}

    result = await db.execute(
        text("""
            SELECT a.unit_id AS unit_id, b.unit_id AS adjacent_unit_id
            FROM geo_unit_adjacency ga
            JOIN geo_units a ON a.id = ga.geo_unit_id
            JOIN geo_units b ON b.id = ga.adjacent_geo_unit_id
            WHERE a.unit_type = 'chicago_neighborhood'
        """)
    )
    for row in result:
        adjacency.setdefault(row.unit_id, []).append(row.adjacent_unit_id)

    _chicago_adjacency_cache = adjacency
    return _chicago_adjacency_cache


@router.get("/la-neighborhoods/adjacency")
async def get_la_neighborhoods_adjacency(db: AsyncSession = Depends(get_db)):
    global _la_adjacency_cache
    if _la_adjacency_cache is not None:
        return _la_adjacency_cache

    all_units = await db.execute(
        text("SELECT unit_id FROM geo_units WHERE unit_type = 'la_neighborhood'")
    )
    adjacency: dict[str, list[str]] = {row.unit_id: [] for row in all_units}

    result = await db.execute(
        text("""
            SELECT a.unit_id AS unit_id, b.unit_id AS adjacent_unit_id
            FROM geo_unit_adjacency ga
            JOIN geo_units a ON a.id = ga.geo_unit_id
            JOIN geo_units b ON b.id = ga.adjacent_geo_unit_id
            WHERE a.unit_type = 'la_neighborhood'
        """)
    )
    for row in result:
        adjacency.setdefault(row.unit_id, []).append(row.adjacent_unit_id)

    _la_adjacency_cache = adjacency
    return _la_adjacency_cache


@router.get("/cities/{z}/{x}/{y}.mvt")
async def get_cities_tile(
    z: int,
    x: int,
    y: int,
    db: AsyncSession = Depends(get_db),
):
    """City-limits polygons (4 features: NYC, Philadelphia, Chicago, LA)."""
    cache_key = ("cities", z, x, y)
    if cache_key in _tile_cache:
        return Response(
            content=_tile_cache[cache_key],
            media_type="application/x-protobuf",
            headers={"Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*"},
        )

    result = await db.execute(
        text("""
            WITH bounds AS (
                SELECT
                    ST_TileEnvelope(:z, :x, :y) AS geom_3857,
                    ST_Transform(ST_TileEnvelope(:z, :x, :y), 4326) AS geom_4326
            ),
            mvt_geom AS (
                SELECT
                    g.id::text AS geo_unit_id,
                    g.unit_id AS unit_id,
                    COALESCE(g.display_name, g.unit_id) AS display_name,
                    ST_AsMVTGeom(
                        ST_Transform(g.geometry, 3857),
                        bounds.geom_3857,
                        4096, 8, true
                    ) AS geom
                FROM geo_units g
                CROSS JOIN bounds
                WHERE g.unit_type = 'city'
                  AND g.geometry && bounds.geom_4326
                  AND ST_Intersects(g.geometry, bounds.geom_4326)
            )
            SELECT ST_AsMVT(mvt_geom.*, 'cities', 4096, 'geom')
            FROM mvt_geom
            WHERE mvt_geom.geom IS NOT NULL
        """),
        {"z": z, "x": x, "y": y},
    )

    tile_data = result.scalar()
    tile_bytes = bytes(tile_data) if tile_data else b""
    if len(_tile_cache) >= _TILE_CACHE_MAX:
        evict = list(_tile_cache.keys())[: _TILE_CACHE_MAX // 4]
        for k in evict:
            _tile_cache.pop(k, None)
    _tile_cache[cache_key] = tile_bytes

    return Response(
        content=tile_bytes,
        media_type="application/x-protobuf",
        headers={"Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*"},
    )


@router.get("/philadelphia-neighborhoods/{z}/{x}/{y}.mvt")
async def get_philadelphia_neighborhoods_tile(
    z: int,
    x: int,
    y: int,
    db: AsyncSession = Depends(get_db),
):
    cache_key = ("philadelphia_neighborhoods", z, x, y)
    if cache_key in _tile_cache:
        return Response(
            content=_tile_cache[cache_key],
            media_type="application/x-protobuf",
            headers={"Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*"},
        )

    tolerance = _tolerance(z, _SIMPLIFY_TOLERANCE_BY_UNIT_TYPE.get(GeoUnitType.PHILADELPHIA_NEIGHBORHOOD))
    geom_expr = (
        f"ST_SimplifyPreserveTopology(g.geometry, {tolerance})" if tolerance > 0 else "g.geometry"
    )

    result = await db.execute(
        text(f"""
            WITH bounds AS (
                SELECT
                    ST_TileEnvelope(:z, :x, :y) AS geom_3857,
                    ST_Transform(ST_TileEnvelope(:z, :x, :y), 4326) AS geom_4326
            ),
            mvt_geom AS (
                SELECT
                    g.id::text AS geo_unit_id,
                    g.unit_id AS unit_id,
                    COALESCE(g.display_name, g.unit_id) AS display_name,
                    ST_AsMVTGeom(
                        ST_Transform({geom_expr}, 3857),
                        bounds.geom_3857,
                        4096, 8, true
                    ) AS geom
                FROM geo_units g
                CROSS JOIN bounds
                WHERE g.unit_type = 'philadelphia_neighborhood'
                  AND g.geometry && bounds.geom_4326
                  AND ST_Intersects(g.geometry, bounds.geom_4326)
            )
            SELECT ST_AsMVT(mvt_geom.*, 'philadelphia_neighborhoods', 4096, 'geom')
            FROM mvt_geom
            WHERE mvt_geom.geom IS NOT NULL
        """),
        {"z": z, "x": x, "y": y},
    )

    tile_data = result.scalar()
    tile_bytes = bytes(tile_data) if tile_data else b""
    if len(_tile_cache) >= _TILE_CACHE_MAX:
        evict = list(_tile_cache.keys())[: _TILE_CACHE_MAX // 4]
        for k in evict:
            _tile_cache.pop(k, None)
    _tile_cache[cache_key] = tile_bytes

    return Response(
        content=tile_bytes,
        media_type="application/x-protobuf",
        headers={"Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*"},
    )


@router.get("/chicago-neighborhoods/{z}/{x}/{y}.mvt")
async def get_chicago_neighborhoods_tile(
    z: int,
    x: int,
    y: int,
    db: AsyncSession = Depends(get_db),
):
    cache_key = ("chicago_neighborhoods", z, x, y)
    if cache_key in _tile_cache:
        return Response(
            content=_tile_cache[cache_key],
            media_type="application/x-protobuf",
            headers={"Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*"},
        )

    tolerance = _tolerance(z, _SIMPLIFY_TOLERANCE_BY_UNIT_TYPE.get(GeoUnitType.CHICAGO_NEIGHBORHOOD))
    geom_expr = (
        f"ST_SimplifyPreserveTopology(g.geometry, {tolerance})" if tolerance > 0 else "g.geometry"
    )

    result = await db.execute(
        text(f"""
            WITH bounds AS (
                SELECT
                    ST_TileEnvelope(:z, :x, :y) AS geom_3857,
                    ST_Transform(ST_TileEnvelope(:z, :x, :y), 4326) AS geom_4326
            ),
            mvt_geom AS (
                SELECT
                    g.id::text AS geo_unit_id,
                    g.unit_id AS unit_id,
                    COALESCE(g.display_name, g.unit_id) AS display_name,
                    ST_AsMVTGeom(
                        ST_Transform({geom_expr}, 3857),
                        bounds.geom_3857,
                        4096, 8, true
                    ) AS geom
                FROM geo_units g
                CROSS JOIN bounds
                WHERE g.unit_type = 'chicago_neighborhood'
                  AND g.geometry && bounds.geom_4326
                  AND ST_Intersects(g.geometry, bounds.geom_4326)
            )
            SELECT ST_AsMVT(mvt_geom.*, 'chicago_neighborhoods', 4096, 'geom')
            FROM mvt_geom
            WHERE mvt_geom.geom IS NOT NULL
        """),
        {"z": z, "x": x, "y": y},
    )

    tile_data = result.scalar()
    tile_bytes = bytes(tile_data) if tile_data else b""
    if len(_tile_cache) >= _TILE_CACHE_MAX:
        evict = list(_tile_cache.keys())[: _TILE_CACHE_MAX // 4]
        for k in evict:
            _tile_cache.pop(k, None)
    _tile_cache[cache_key] = tile_bytes

    return Response(
        content=tile_bytes,
        media_type="application/x-protobuf",
        headers={"Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*"},
    )


@router.get("/la-neighborhoods/{z}/{x}/{y}.mvt")
async def get_la_neighborhoods_tile(
    z: int,
    x: int,
    y: int,
    db: AsyncSession = Depends(get_db),
):
    cache_key = ("la_neighborhoods", z, x, y)
    if cache_key in _tile_cache:
        return Response(
            content=_tile_cache[cache_key],
            media_type="application/x-protobuf",
            headers={"Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*"},
        )

    tolerance = _tolerance(z, _SIMPLIFY_TOLERANCE_BY_UNIT_TYPE.get(GeoUnitType.LA_NEIGHBORHOOD))
    geom_expr = (
        f"ST_SimplifyPreserveTopology(g.geometry, {tolerance})" if tolerance > 0 else "g.geometry"
    )

    result = await db.execute(
        text(f"""
            WITH bounds AS (
                SELECT
                    ST_TileEnvelope(:z, :x, :y) AS geom_3857,
                    ST_Transform(ST_TileEnvelope(:z, :x, :y), 4326) AS geom_4326
            ),
            mvt_geom AS (
                SELECT
                    g.id::text AS geo_unit_id,
                    g.unit_id AS unit_id,
                    COALESCE(g.display_name, g.unit_id) AS display_name,
                    ST_AsMVTGeom(
                        ST_Transform({geom_expr}, 3857),
                        bounds.geom_3857,
                        4096, 8, true
                    ) AS geom
                FROM geo_units g
                CROSS JOIN bounds
                WHERE g.unit_type = 'la_neighborhood'
                  AND g.geometry && bounds.geom_4326
                  AND ST_Intersects(g.geometry, bounds.geom_4326)
            )
            SELECT ST_AsMVT(mvt_geom.*, 'la_neighborhoods', 4096, 'geom')
            FROM mvt_geom
            WHERE mvt_geom.geom IS NOT NULL
        """),
        {"z": z, "x": x, "y": y},
    )

    tile_data = result.scalar()
    tile_bytes = bytes(tile_data) if tile_data else b""
    if len(_tile_cache) >= _TILE_CACHE_MAX:
        evict = list(_tile_cache.keys())[: _TILE_CACHE_MAX // 4]
        for k in evict:
            _tile_cache.pop(k, None)
    _tile_cache[cache_key] = tile_bytes

    return Response(
        content=tile_bytes,
        media_type="application/x-protobuf",
        headers={"Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*"},
    )


@router.get("/{campaign_id}/{z}/{x}/{y}.mvt")
async def get_tile(
    campaign_id: UUID,
    z: int,
    x: int,
    y: int,
    db: AsyncSession = Depends(get_db),
):
    cache_key = (str(campaign_id), z, x, y)
    if cache_key in _tile_cache:
        return Response(
            content=_tile_cache[cache_key],
            media_type="application/x-protobuf",
            headers={"Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*"},
        )

    default_tolerance = _tolerance(z)
    case_clauses = []
    for unit_type, table in _SIMPLIFY_TOLERANCE_BY_UNIT_TYPE.items():
        tolerance = _tolerance(z, table)
        clause = (
            f"WHEN g.unit_type = '{unit_type.value}' THEN ST_SimplifyPreserveTopology(g.geometry, {tolerance})"
            if tolerance > 0
            else f"WHEN g.unit_type = '{unit_type.value}' THEN g.geometry"
        )
        case_clauses.append(clause)
    default_clause = (
        f"ST_SimplifyPreserveTopology(g.geometry, {default_tolerance})"
        if default_tolerance > 0
        else "g.geometry"
    )
    geom_expr = "CASE " + " ".join(case_clauses) + f" ELSE {default_clause} END"

    result = await db.execute(
        text(f"""
            WITH
            bounds AS (
                SELECT
                    ST_TileEnvelope(:z, :x, :y) AS geom_3857,
                    ST_Transform(ST_TileEnvelope(:z, :x, :y), 4326) AS geom_4326
            ),
            mvt_geom AS (
                SELECT
                    g.id::text AS geo_unit_id,
                    COALESCE(g.display_name, g.unit_id) AS display_name,
                    g.unit_type AS unit_type,
                    ST_AsMVTGeom(
                        ST_Transform({geom_expr}, 3857),
                        bounds.geom_3857,
                        4096, 8, true
                    ) AS geom
                FROM geo_units g
                CROSS JOIN bounds
                WHERE
                    g.unit_type = ANY(SELECT unnest(geo_unit) FROM campaigns WHERE id = :campaign_id)
                    AND g.geometry && bounds.geom_4326
                    AND ST_Intersects(g.geometry, bounds.geom_4326)
            )
            SELECT ST_AsMVT(mvt_geom.*, 'territories', 4096, 'geom')
            FROM mvt_geom
            WHERE mvt_geom.geom IS NOT NULL
        """),
        {"z": z, "x": x, "y": y, "campaign_id": str(campaign_id)},
    )

    tile_data = result.scalar()
    tile_bytes = bytes(tile_data) if tile_data else b""
    if len(_tile_cache) >= _TILE_CACHE_MAX:
        # Evict oldest quarter when full
        evict = list(_tile_cache.keys())[: _TILE_CACHE_MAX // 4]
        for k in evict:
            _tile_cache.pop(k, None)
    _tile_cache[cache_key] = tile_bytes

    return Response(
        content=tile_bytes,
        media_type="application/x-protobuf",
        headers={"Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*"},
    )
