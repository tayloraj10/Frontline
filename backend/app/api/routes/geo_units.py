import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db

router = APIRouter(prefix="/geo-units", tags=["geo-units"])

_UK_POSTCODE_DISTRICT_RE = re.compile(r"^[A-Z]{1,2}[0-9][A-Z0-9]?$")


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
