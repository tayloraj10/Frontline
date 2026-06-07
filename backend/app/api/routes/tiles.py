from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db

router = APIRouter(prefix="/tiles", tags=["tiles"])

# In-process tile cache: keyed by (campaign_id, z, x, y) → raw bytes
# Capped at 2 000 entries (~200 MB worst-case at 100 KB/tile) to prevent OOM.
_tile_cache: dict[tuple, bytes] = {}
_TILE_CACHE_MAX = 2000

_SIMPLIFY_TOLERANCE = {
    range(0, 6): 0.05,
    range(6, 9): 0.005,
    range(9, 12): 0.001,
}


def _tolerance(z: int) -> float:
    for r, t in _SIMPLIFY_TOLERANCE.items():
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
                        ELSE 1
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

    tolerance = _tolerance(z)
    geom_expr = (
        f"ST_SimplifyPreserveTopology(g.geometry, {tolerance})"
        if tolerance > 0
        else "g.geometry"
    )

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
                    ST_AsMVTGeom(
                        ST_Transform({geom_expr}, 3857),
                        bounds.geom_3857,
                        4096, 8, true
                    ) AS geom
                FROM geo_units g
                CROSS JOIN bounds
                WHERE
                    g.unit_type = (SELECT geo_unit FROM campaigns WHERE id = :campaign_id)
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
