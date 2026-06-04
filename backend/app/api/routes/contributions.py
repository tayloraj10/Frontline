from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db

router = APIRouter(prefix="/contributions", tags=["contributions"])


class ContributionRequest(BaseModel):
    campaign_id: UUID
    user_id: UUID
    group_id: UUID | None = None
    contribution_type: str
    value: float | None = None
    photo_url: str | None = None
    latitude: float
    longitude: float
    notes: str | None = None


@router.post("/submit")
async def submit_contribution(payload: ContributionRequest, db: AsyncSession = Depends(get_db)):
    """
    Full contribution submission: inserts the contribution row, assigns it to a geo_unit
    via point-in-polygon, and upserts territory_claims. Called directly from the frontend.
    """
    # Find geo_unit via point-in-polygon
    geo_result = await db.execute(
        text("""
            SELECT id FROM geo_units
            WHERE ST_Contains(geometry, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))
            AND campaign_id = :campaign_id
            LIMIT 1
        """),
        {"lon": payload.longitude, "lat": payload.latitude, "campaign_id": str(payload.campaign_id)},
    )
    geo_unit_row = geo_result.fetchone()
    geo_unit_id = str(geo_unit_row[0]) if geo_unit_row else None

    # Proximity check (point within 5km of tract centroid)
    location_verified = False
    if geo_unit_id:
        prox = await db.execute(
            text("""
                SELECT ST_DWithin(
                    geography(ST_Centroid(geometry)),
                    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                    5000
                ) FROM geo_units WHERE id = :geo_unit_id
            """),
            {"lon": payload.longitude, "lat": payload.latitude, "geo_unit_id": geo_unit_id},
        )
        location_verified = bool(prox.scalar())

    # Insert contribution row
    await db.execute(
        text("""
            INSERT INTO contributions
                (campaign_id, user_id, group_id, geo_unit_id, contribution_type,
                 value, photo_url, location, location_verified, notes)
            VALUES
                (:campaign_id, :user_id, :group_id, :geo_unit_id, :contribution_type,
                 :value, :photo_url,
                 ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                 :location_verified, :notes)
        """),
        {
            "campaign_id": str(payload.campaign_id),
            "user_id": str(payload.user_id),
            "group_id": str(payload.group_id) if payload.group_id else None,
            "geo_unit_id": geo_unit_id,
            "contribution_type": payload.contribution_type,
            "value": payload.value or 1,
            "photo_url": payload.photo_url,
            "lon": payload.longitude,
            "lat": payload.latitude,
            "location_verified": location_verified,
            "notes": payload.notes,
        },
    )

    # Upsert territory claim
    if geo_unit_id:
        await db.execute(
            text("""
                INSERT INTO territory_claims
                    (campaign_id, geo_unit_id, claimed_by_user, claimed_by_group, total_value, last_contribution_at)
                VALUES
                    (:campaign_id, :geo_unit_id, :user_id, :group_id, :value, NOW())
                ON CONFLICT (campaign_id, geo_unit_id) DO UPDATE SET
                    total_value = territory_claims.total_value + EXCLUDED.total_value,
                    claimed_by_user = EXCLUDED.claimed_by_user,
                    claimed_by_group = EXCLUDED.claimed_by_group,
                    last_contribution_at = NOW(),
                    decay_starts_at = NULL,
                    updated_at = NOW()
            """),
            {
                "campaign_id": str(payload.campaign_id),
                "geo_unit_id": geo_unit_id,
                "user_id": str(payload.user_id),
                "group_id": str(payload.group_id) if payload.group_id else None,
                "value": payload.value or 1,
            },
        )

    await db.commit()
    return {
        "geo_unit_id": geo_unit_id,
        "location_verified": location_verified,
        "claimed_territory": geo_unit_id is not None,
    }


@router.post("/process")
async def process_contribution(payload: ContributionRequest, db: AsyncSession = Depends(get_db)):
    """
    Assigns the contribution to the correct geo_unit via point-in-polygon,
    then upserts territory_claims. Called by the Next.js server after the
    contribution row is already inserted via Supabase PostgREST.
    """
    # Find which geo_unit this point falls inside
    result = await db.execute(
        text("""
            SELECT id FROM geo_units
            WHERE ST_Contains(geometry, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))
            AND campaign_id = :campaign_id
            LIMIT 1
        """),
        {"lon": payload.longitude, "lat": payload.latitude, "campaign_id": str(payload.campaign_id)},
    )
    geo_unit_row = result.fetchone()

    if not geo_unit_row:
        raise HTTPException(status_code=422, detail="Location does not fall within any campaign geo unit")

    geo_unit_id = geo_unit_row[0]

    # Proximity validation — check point is within 5km of claimed tract centroid
    proximity_check = await db.execute(
        text("""
            SELECT ST_DWithin(
                geography(ST_Centroid(geometry)),
                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                5000
            ) FROM geo_units WHERE id = :geo_unit_id
        """),
        {"lon": payload.longitude, "lat": payload.latitude, "geo_unit_id": str(geo_unit_id)},
    )
    within_range = proximity_check.scalar()

    # Upsert territory claim
    claimed_by_group = str(payload.group_id) if payload.group_id else None
    await db.execute(
        text("""
            INSERT INTO territory_claims (campaign_id, geo_unit_id, claimed_by_user, claimed_by_group, total_value, last_contribution_at)
            VALUES (:campaign_id, :geo_unit_id, :user_id, :group_id, :value, NOW())
            ON CONFLICT (campaign_id, geo_unit_id) DO UPDATE SET
                total_value = territory_claims.total_value + EXCLUDED.total_value,
                claimed_by_user = EXCLUDED.claimed_by_user,
                claimed_by_group = EXCLUDED.claimed_by_group,
                last_contribution_at = NOW(),
                decay_starts_at = NULL,
                updated_at = NOW()
        """),
        {
            "campaign_id": str(payload.campaign_id),
            "geo_unit_id": str(geo_unit_id),
            "user_id": str(payload.user_id),
            "group_id": claimed_by_group,
            "value": payload.value or 1,
        },
    )
    await db.commit()

    return {
        "geo_unit_id": str(geo_unit_id),
        "location_verified": within_range,
    }
