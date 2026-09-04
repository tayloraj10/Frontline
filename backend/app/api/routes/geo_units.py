import json
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db

router = APIRouter(prefix="/geo-units", tags=["geo-units"])

_UK_POSTCODE_DISTRICT_RE = re.compile(r"^[A-Z]{1,2}[0-9][A-Z0-9]?$")


# Registered ahead of /{geo_unit_id}/bbox below: both are GET under /geo-units, and a
# literal "bbox" path segment would otherwise be swallowed by that route's {geo_unit_id}.
@router.get("/bbox")
async def get_geo_units_bbox_union(
    ids: str = Query(..., description="Comma-separated geo_unit ids"),
    db: AsyncSession = Depends(get_db),
):
    """Union bounding box across multiple geo units — e.g. to zoom the map to fit a top-3 set."""
    id_list = [i.strip() for i in ids.split(",") if i.strip()]
    if not id_list:
        raise HTTPException(400, "ids must contain at least one geo_unit id")

    row = await db.execute(
        text("""
            SELECT
              ST_XMin(ext) AS min_lng,
              ST_YMin(ext) AS min_lat,
              ST_XMax(ext) AS max_lng,
              ST_YMax(ext) AS max_lat
            FROM (SELECT ST_Extent(geometry::geometry) AS ext FROM geo_units WHERE id = ANY(:ids)) e
        """),
        {"ids": id_list},
    )
    result = row.fetchone()
    if not result or result.min_lng is None:
        raise HTTPException(404, "No matching geo units found")
    return {"bbox": [result.min_lng, result.min_lat, result.max_lng, result.max_lat]}


@router.get("/{geo_unit_id}/boundary")
async def get_geo_unit_boundary(geo_unit_id: str, db: AsyncSession = Depends(get_db)):
    """Simplified GeoJSON boundary for a single geo unit — e.g. to outline the focused
    neighborhood while its child zip codes are shown as the primary choropleth."""
    row = await db.execute(
        text("""
            SELECT ST_AsGeoJSON(ST_SimplifyPreserveTopology(geometry, 0.0002)) AS geojson
            FROM geo_units
            WHERE id = :geo_unit_id
        """),
        {"geo_unit_id": geo_unit_id},
    )
    result = row.fetchone()
    if not result:
        raise HTTPException(404, f"Geo unit {geo_unit_id} not found")
    return {"geometry": json.loads(result.geojson)}


@router.get("/zip/{zip_code}/centroid")
async def get_zip_centroid(zip_code: str, db: AsyncSession = Depends(get_db)):
    if not zip_code.isdigit() or len(zip_code) != 5:
        raise HTTPException(400, "ZIP code must be 5 digits")
    row = await db.execute(
        text("""
            SELECT
              ST_Y(ST_Centroid(geometry::geometry)) AS lat,
              ST_X(ST_Centroid(geometry::geometry)) AS lng,
              ST_XMin(geometry::geometry) AS min_lng,
              ST_YMin(geometry::geometry) AS min_lat,
              ST_XMax(geometry::geometry) AS max_lng,
              ST_YMax(geometry::geometry) AS max_lat
            FROM geo_units
            WHERE unit_type = 'zip' AND unit_id = :zip
        """),
        {"zip": zip_code},
    )
    result = row.fetchone()
    if not result:
        raise HTTPException(404, f"ZIP code {zip_code} not found")
    return {
        "lat": result.lat,
        "lng": result.lng,
        "bbox": [result.min_lng, result.min_lat, result.max_lng, result.max_lat],
    }


@router.get("/{geo_unit_id}/bbox")
async def get_geo_unit_bbox(geo_unit_id: str, db: AsyncSession = Depends(get_db)):
    row = await db.execute(
        text("""
            SELECT
              display_name,
              ST_Y(ST_Centroid(geometry::geometry)) AS lat,
              ST_X(ST_Centroid(geometry::geometry)) AS lng,
              ST_XMin(geometry::geometry) AS min_lng,
              ST_YMin(geometry::geometry) AS min_lat,
              ST_XMax(geometry::geometry) AS max_lng,
              ST_YMax(geometry::geometry) AS max_lat
            FROM geo_units
            WHERE id = :geo_unit_id
        """),
        {"geo_unit_id": geo_unit_id},
    )
    result = row.fetchone()
    if not result:
        raise HTTPException(404, f"Geo unit {geo_unit_id} not found")
    return {
        "display_name": result.display_name,
        "lat": result.lat,
        "lng": result.lng,
        "bbox": [result.min_lng, result.min_lat, result.max_lng, result.max_lat],
    }


@router.get("/{geo_unit_id}/stats")
async def get_geo_unit_stats(
    geo_unit_id: str,
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
):
    exists = await db.execute(
        text("SELECT 1 FROM geo_units WHERE id = :geo_unit_id"),
        {"geo_unit_id": geo_unit_id},
    )
    if not exists.fetchone():
        raise HTTPException(404, f"Geo unit {geo_unit_id} not found")

    totals_row = (
        await db.execute(
            text("""
                SELECT COALESCE(SUM(c.value), 0) AS total_points
                FROM contributions c
                JOIN geo_units t ON t.id = :geo_unit_id
                WHERE c.campaign_id = :campaign_id
                  AND c.location IS NOT NULL
                  AND ST_Contains(t.geometry, c.location::geometry)
            """),
            {"geo_unit_id": geo_unit_id, "campaign_id": campaign_id},
        )
    ).fetchone()

    recent = (
        await db.execute(
            text("""
                SELECT c.value, c.submitted_at, c.group_id, c.user_id,
                       g.name AS group_name, p.display_name, p.username,
                       cl.metrics_small_bags, cl.metrics_large_bags
                FROM contributions c
                JOIN geo_units t ON t.id = :geo_unit_id
                LEFT JOIN groups g ON g.id = c.group_id
                LEFT JOIN profiles p ON p.id = c.user_id
                LEFT JOIN cleanups cl ON cl.id = c.cleanup_id
                WHERE c.campaign_id = :campaign_id
                  AND c.location IS NOT NULL
                  AND ST_Contains(t.geometry, c.location::geometry)
                ORDER BY c.submitted_at DESC
                LIMIT 20
            """),
            {"geo_unit_id": geo_unit_id, "campaign_id": campaign_id},
        )
    ).fetchall()

    cleanups = (
        await db.execute(
            text("""
                SELECT cl.id, cl.metrics_small_bags, cl.metrics_large_bags, cl.image_urls, cl.route_photos
                FROM cleanups cl
                JOIN geo_units t ON t.id = :geo_unit_id
                WHERE cl.campaign_id = :campaign_id
                  AND cl.location IS NOT NULL
                  AND ST_Contains(t.geometry, cl.location::geometry)
                ORDER BY cl.created_at DESC
            """),
            {"geo_unit_id": geo_unit_id, "campaign_id": campaign_id},
        )
    ).fetchall()

    report_row = (
        await db.execute(
            text("""
                SELECT COUNT(*) FILTER (WHERE r.status = 'open') AS open_reports,
                       COUNT(*) AS total_reports
                FROM problem_reports r
                JOIN geo_units t ON t.id = :geo_unit_id
                WHERE r.campaign_id = :campaign_id AND ST_Contains(t.geometry, r.location::geometry)
            """),
            {"geo_unit_id": geo_unit_id, "campaign_id": campaign_id},
        )
    ).fetchone()

    bag_totals = {"small": 0, "large": 0}
    cleanup_photos: list[dict] = []
    for c in cleanups:
        bag_totals["small"] += c.metrics_small_bags or 0
        bag_totals["large"] += c.metrics_large_bags or 0
        cleanup_photos.extend({"url": url, "cleanup_id": str(c.id)} for url in (c.image_urls or []))
        cleanup_photos.extend({"url": p["url"], "cleanup_id": str(c.id)} for p in (c.route_photos or []))

    return {
        "total_points": totals_row.total_points,
        "bag_totals": bag_totals,
        "open_report_count": report_row.open_reports,
        "total_report_count": report_row.total_reports,
        "cleanup_photos": cleanup_photos[:10],
        "recent_contributions": [
            {
                "value": r.value,
                "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
                "group_name": r.group_name,
                "contributor_name": r.display_name or r.username or "Anonymous",
                "small_bags": r.metrics_small_bags or 0,
                "large_bags": r.metrics_large_bags or 0,
            }
            for r in recent
        ],
    }


@router.get("/uk-postcode/{postcode}/centroid")
async def get_uk_postcode_centroid(postcode: str, db: AsyncSession = Depends(get_db)):
    district = postcode.strip().upper()
    if not _UK_POSTCODE_DISTRICT_RE.match(district):
        raise HTTPException(400, "Postcode must be a valid UK postcode district (e.g. SW1A, M1, EH3)")
    row = await db.execute(
        text("""
            SELECT
              ST_Y(ST_Centroid(geometry::geometry)) AS lat,
              ST_X(ST_Centroid(geometry::geometry)) AS lng,
              ST_XMin(geometry::geometry) AS min_lng,
              ST_YMin(geometry::geometry) AS min_lat,
              ST_XMax(geometry::geometry) AS max_lng,
              ST_YMax(geometry::geometry) AS max_lat
            FROM geo_units
            WHERE unit_type = 'uk_postcode_district' AND unit_id = :district
        """),
        {"district": district},
    )
    result = row.fetchone()
    if not result:
        raise HTTPException(404, f"Postcode district {district} not found")
    return {
        "lat": result.lat,
        "lng": result.lng,
        "bbox": [result.min_lng, result.min_lat, result.max_lng, result.max_lat],
    }
