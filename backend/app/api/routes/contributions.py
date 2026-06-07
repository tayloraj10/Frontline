from uuid import UUID

import h3
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db

router = APIRouter(prefix="/contributions", tags=["contributions"])

BLOOM_THRESHOLDS = [0, 50, 200, 600, 1500]


def _bloom_stage(score: float) -> int:
    stage = 0
    for i, t in enumerate(BLOOM_THRESHOLDS):
        if score >= t:
            stage = i
    return stage


def _h3_boundary_wkt(h3_index: str) -> str:
    boundary = h3.cell_to_boundary(h3_index)  # [(lat, lng), ...]
    coords = [(lng, lat) for lat, lng in boundary]
    coords.append(coords[0])
    return "POLYGON((" + ", ".join(f"{x} {y}" for x, y in coords) + "))"


class ContributionRequest(BaseModel):
    campaign_id: UUID
    user_id: UUID
    group_id: UUID | None = None
    contribution_type: str
    value: float | None = None
    photo_url: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    notes: str | None = None


@router.post("/submit")
async def submit_contribution(
    payload: ContributionRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Full contribution submission: inserts the contribution row, assigns it to a geo_unit,
    and upserts territory_claims. For h3_hex campaigns uses H3 math instead of PostGIS
    point-in-polygon. Called directly from the frontend.
    """
    from app.api.routes.events import _evaluate_triggers

    has_location = payload.latitude is not None and payload.longitude is not None
    geo_unit_id = None
    location_verified = False

    # Determine campaign geo_unit type
    camp_result = await db.execute(
        text("SELECT geo_unit FROM campaigns WHERE id = :campaign_id"),
        {"campaign_id": str(payload.campaign_id)},
    )
    camp_row = camp_result.fetchone()
    campaign_geo_unit = camp_row[0] if camp_row else "zip"

    if has_location:
        if campaign_geo_unit == "h3_hex":
            h3_index = h3.latlng_to_cell(payload.latitude, payload.longitude, 5)

            geo_result = await db.execute(
                text("SELECT id::text FROM geo_units WHERE unit_type = 'h3_hex' AND unit_id = :h3_index"),
                {"h3_index": h3_index},
            )
            geo_row = geo_result.fetchone()

            if geo_row:
                geo_unit_id = geo_row[0]
            else:
                wkt = _h3_boundary_wkt(h3_index)
                new_result = await db.execute(
                    text("""
                        INSERT INTO geo_units (unit_type, unit_id, geometry, display_name)
                        VALUES ('h3_hex', :h3_index, ST_Multi(ST_GeomFromText(:wkt, 4326)), :h3_index)
                        ON CONFLICT (unit_type, unit_id) DO UPDATE SET unit_id = EXCLUDED.unit_id
                        RETURNING id::text
                    """),
                    {"h3_index": h3_index, "wkt": wkt},
                )
                geo_unit_id = new_result.scalar()

            location_verified = True

        else:
            geo_result = await db.execute(
                text("""
                    SELECT id FROM geo_units
                    WHERE ST_Contains(geometry, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))
                    AND unit_type = :geo_unit
                    LIMIT 1
                """),
                {"lon": payload.longitude, "lat": payload.latitude, "geo_unit": campaign_geo_unit},
            )
            geo_unit_row = geo_result.fetchone()
            geo_unit_id = str(geo_unit_row[0]) if geo_unit_row else None

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

    if has_location:
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
    else:
        await db.execute(
            text("""
                INSERT INTO contributions
                    (campaign_id, user_id, group_id, geo_unit_id, contribution_type,
                     value, photo_url, location_verified, notes)
                VALUES
                    (:campaign_id, :user_id, :group_id, NULL, :contribution_type,
                     :value, :photo_url, FALSE, :notes)
            """),
            {
                "campaign_id": str(payload.campaign_id),
                "user_id": str(payload.user_id),
                "group_id": str(payload.group_id) if payload.group_id else None,
                "contribution_type": payload.contribution_type,
                "value": payload.value or 1,
                "photo_url": payload.photo_url,
                "notes": payload.notes,
            },
        )

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

    background_tasks.add_task(_evaluate_triggers, payload.campaign_id, db)

    return {
        "geo_unit_id": geo_unit_id,
        "location_verified": location_verified,
        "claimed_territory": geo_unit_id is not None,
    }


@router.get("/{campaign_id}/hex-bloom")
async def get_hex_bloom(campaign_id: UUID, db: AsyncSession = Depends(get_db)):
    """Return all bloomed H3 hexes for a hex_bloom campaign with stage data."""
    result = await db.execute(
        text("""
            SELECT
                tc.geo_unit_id::text,
                gu.unit_id AS h3_index,
                tc.total_value AS bloom_score,
                gu.seed_source
            FROM territory_claims tc
            JOIN geo_units gu ON gu.id = tc.geo_unit_id
            WHERE tc.campaign_id = :campaign_id
              AND gu.unit_type = 'h3_hex'
            ORDER BY tc.total_value DESC
        """),
        {"campaign_id": str(campaign_id)},
    )
    rows = result.fetchall()
    return [
        {
            "geo_unit_id": row.geo_unit_id,
            "h3_index": row.h3_index,
            "bloom_score": float(row.bloom_score or 0),
            "bloom_stage": _bloom_stage(float(row.bloom_score or 0)),
            "seed_source": row.seed_source,
        }
        for row in rows
    ]


@router.get("/{campaign_id}/locations")
async def get_contribution_locations(campaign_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
            SELECT
                id::text,
                user_id::text,
                value,
                photo_url,
                submitted_at,
                ST_Y(location::geometry) AS latitude,
                ST_X(location::geometry) AS longitude
            FROM contributions
            WHERE campaign_id = :campaign_id
              AND location IS NOT NULL
            ORDER BY submitted_at DESC
            LIMIT 1000
        """),
        {"campaign_id": str(campaign_id)},
    )
    rows = result.fetchall()
    return [
        {
            "id": row.id,
            "user_id": row.user_id,
            "value": row.value,
            "photo_url": row.photo_url,
            "submitted_at": row.submitted_at.isoformat() if row.submitted_at else None,
            "latitude": float(row.latitude),
            "longitude": float(row.longitude),
        }
        for row in rows
        if row.latitude is not None and row.longitude is not None
    ]


@router.get("/{campaign_id}/geo-unit-at")
async def get_geo_unit_at_point(
    campaign_id: UUID,
    lat: float,
    lng: float,
    db: AsyncSession = Depends(get_db),
):
    # Determine campaign geo_unit type
    camp_result = await db.execute(
        text("SELECT geo_unit FROM campaigns WHERE id = :campaign_id"),
        {"campaign_id": str(campaign_id)},
    )
    camp_row = camp_result.fetchone()
    campaign_geo_unit = camp_row[0] if camp_row else "zip"

    if campaign_geo_unit == "h3_hex":
        h3_index = h3.latlng_to_cell(lat, lng, 5)
        result = await db.execute(
            text("SELECT id::text FROM geo_units WHERE unit_type = 'h3_hex' AND unit_id = :h3_index"),
            {"h3_index": h3_index},
        )
        row = result.fetchone()
        return {"geo_unit_id": row[0] if row else h3_index, "display_name": h3_index}

    result = await db.execute(
        text("""
            SELECT id::text, display_name
            FROM geo_units
            WHERE unit_type = :geo_unit
              AND ST_Contains(geometry, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326))
            LIMIT 1
        """),
        {"geo_unit": campaign_geo_unit, "lat": lat, "lng": lng},
    )
    row = result.fetchone()
    if not row:
        return {"geo_unit_id": None, "display_name": None}
    return {"geo_unit_id": row[0], "display_name": row[1]}


@router.post("/process")
async def process_contribution(payload: ContributionRequest, db: AsyncSession = Depends(get_db)):
    """
    Assigns the contribution to the correct geo_unit via point-in-polygon,
    then upserts territory_claims. Called by the Next.js server after the
    contribution row is already inserted via Supabase PostgREST.
    """
    result = await db.execute(
        text("""
            SELECT id FROM geo_units
            WHERE ST_Contains(geometry, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))
            AND unit_type = (SELECT geo_unit FROM campaigns WHERE id = :campaign_id)
            LIMIT 1
        """),
        {"lon": payload.longitude, "lat": payload.latitude, "campaign_id": str(payload.campaign_id)},
    )
    geo_unit_row = result.fetchone()

    if not geo_unit_row:
        raise HTTPException(status_code=422, detail="Location does not fall within any campaign geo unit")

    geo_unit_id = geo_unit_row[0]

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
