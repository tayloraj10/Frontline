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
    small_bags: int | None = None
    large_bags: int | None = None


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

    # Verify campaign is active and get its geo_unit type
    camp_result = await db.execute(
        text("SELECT geo_unit, status FROM campaigns WHERE id = :campaign_id"),
        {"campaign_id": str(payload.campaign_id)},
    )
    camp_row = camp_result.fetchone()
    if not camp_row:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if camp_row[1] != "active":
        raise HTTPException(status_code=403, detail="Campaign is not accepting contributions")
    campaign_geo_unit = camp_row[0]

    if has_location:
        if campaign_geo_unit and "h3_hex" in campaign_geo_unit:
            h3_index = h3.latlng_to_cell(payload.latitude, payload.longitude, 3)

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
                    AND unit_type = ANY(:geo_unit)
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

    # Apply active score_multiplier events (campaign-wide or geo-unit-scoped)
    effective_value = payload.value or 1
    if geo_unit_id:
        multiplier_result = await db.execute(
            text("""
                SELECT effect_config FROM campaign_events
                WHERE campaign_id = :campaign_id
                  AND status = 'active'
                  AND (geo_unit_id IS NULL OR geo_unit_id = :geo_unit_id)
                  AND (ends_at IS NULL OR ends_at > NOW())
                  AND effect_config->>'type' = 'score_multiplier'
                LIMIT 1
            """),
            {"campaign_id": str(payload.campaign_id), "geo_unit_id": geo_unit_id},
        )
        multiplier_row = multiplier_result.fetchone()
        if multiplier_row:
            multiplier = float((multiplier_row[0] or {}).get("multiplier", 1))
            effective_value = effective_value * multiplier

    cleanup_id = None
    if payload.contribution_type == "cleanup":
        cleanup_result = await db.execute(
            text("""
                INSERT INTO cleanups
                    (campaign_id, geo_unit_id, location, status, image_urls,
                     metrics_small_bags, metrics_large_bags, submitted_by_user_id, attended_user_ids)
                VALUES
                    (:campaign_id, :geo_unit_id,
                     CASE WHEN CAST(:lon AS double precision) IS NOT NULL AND CAST(:lat AS double precision) IS NOT NULL
                          THEN ST_SetSRID(ST_MakePoint(CAST(:lon AS double precision), CAST(:lat AS double precision)), 4326)::geography
                          ELSE NULL END,
                     'completed', :image_urls, :metrics_small_bags, :metrics_large_bags, :user_id, ARRAY[:user_id]::uuid[])
                RETURNING id
            """),
            {
                "campaign_id": str(payload.campaign_id),
                "geo_unit_id": geo_unit_id,
                "lon": payload.longitude,
                "lat": payload.latitude,
                "image_urls": [payload.photo_url] if payload.photo_url else [],
                "metrics_small_bags": payload.small_bags if payload.small_bags is not None else payload.value,
                "metrics_large_bags": payload.large_bags,
                "user_id": str(payload.user_id),
            },
        )
        cleanup_id = str(cleanup_result.scalar())

    if has_location:
        await db.execute(
            text("""
                INSERT INTO contributions
                    (campaign_id, user_id, group_id, geo_unit_id, contribution_type,
                     value, photo_url, location, location_verified, notes, cleanup_id)
                VALUES
                    (:campaign_id, :user_id, :group_id, :geo_unit_id, :contribution_type,
                     :value, :photo_url,
                     ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                     :location_verified, :notes, :cleanup_id)
            """),
            {
                "campaign_id": str(payload.campaign_id),
                "user_id": str(payload.user_id),
                "group_id": str(payload.group_id) if payload.group_id else None,
                "geo_unit_id": geo_unit_id,
                "contribution_type": payload.contribution_type,
                "value": effective_value,
                "photo_url": payload.photo_url,
                "lon": payload.longitude,
                "lat": payload.latitude,
                "location_verified": location_verified,
                "notes": payload.notes,
                "cleanup_id": cleanup_id,
            },
        )
    else:
        await db.execute(
            text("""
                INSERT INTO contributions
                    (campaign_id, user_id, group_id, geo_unit_id, contribution_type,
                     value, photo_url, location_verified, notes, cleanup_id)
                VALUES
                    (:campaign_id, :user_id, :group_id, NULL, :contribution_type,
                     :value, :photo_url, FALSE, :notes, :cleanup_id)
            """),
            {
                "campaign_id": str(payload.campaign_id),
                "user_id": str(payload.user_id),
                "group_id": str(payload.group_id) if payload.group_id else None,
                "contribution_type": payload.contribution_type,
                "value": effective_value,
                "photo_url": payload.photo_url,
                "notes": payload.notes,
                "cleanup_id": cleanup_id,
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
                    last_contribution_at = NOW(),
                    decay_starts_at = NULL,
                    updated_at = NOW()
            """),
            {
                "campaign_id": str(payload.campaign_id),
                "geo_unit_id": geo_unit_id,
                "user_id": str(payload.user_id),
                "group_id": str(payload.group_id) if payload.group_id else None,
                "value": effective_value,
            },
        )
        await db.execute(
            text("""
                WITH top_group AS (
                    SELECT group_id FROM contributions
                    WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
                      AND group_id IS NOT NULL
                    GROUP BY group_id ORDER BY SUM(value) DESC LIMIT 1
                ),
                top_user AS (
                    SELECT user_id FROM contributions
                    WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
                    GROUP BY user_id ORDER BY SUM(value) DESC LIMIT 1
                )
                UPDATE territory_claims SET
                    claimed_by_group = (SELECT group_id FROM top_group),
                    claimed_by_user  = (SELECT user_id  FROM top_user)
                WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
            """),
            {
                "campaign_id": str(payload.campaign_id),
                "geo_unit_id": geo_unit_id,
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


@router.get("/{campaign_id}/hex/{h3_index}/photos")
async def get_hex_photos(campaign_id: UUID, h3_index: str, db: AsyncSession = Depends(get_db)):
    """Return recent contributions with photos for a specific H3 hex in a campaign."""
    result = await db.execute(
        text("""
            SELECT c.photo_url, c.submitted_at, p.display_name, p.username
            FROM contributions c
            LEFT JOIN profiles p ON p.id = c.user_id
            WHERE c.campaign_id = :campaign_id
              AND c.photo_url IS NOT NULL
              AND c.geo_unit_id = (
                  SELECT id FROM geo_units
                  WHERE unit_type = 'h3_hex' AND unit_id = :h3_index
                  LIMIT 1
              )
            ORDER BY c.submitted_at DESC
            LIMIT 20
        """),
        {"campaign_id": str(campaign_id), "h3_index": h3_index},
    )
    rows = result.fetchall()
    return [
        {
            "photo_url": row.photo_url,
            "submitted_at": row.submitted_at.isoformat() if row.submitted_at else None,
            "display_name": row.display_name,
            "username": row.username,
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
    campaign_geo_unit = camp_row[0] if camp_row and camp_row[0] else ["zip"]

    if "h3_hex" in campaign_geo_unit:
        h3_index = h3.latlng_to_cell(lat, lng, 3)
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
            WHERE unit_type = ANY(:geo_unit)
              AND ST_Contains(geometry, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326))
            LIMIT 1
        """),
        {"geo_unit": campaign_geo_unit, "lat": lat, "lng": lng},
    )
    row = result.fetchone()
    if not row:
        return {"geo_unit_id": None, "display_name": None}
    return {"geo_unit_id": row[0], "display_name": row[1]}


@router.delete("/{contribution_id}")
async def delete_contribution(contribution_id: UUID, user_id: UUID, db: AsyncSession = Depends(get_db)):
    """Delete a user's own contribution and recalculate territory scores from remaining contributions."""
    result = await db.execute(
        text("SELECT campaign_id, geo_unit_id, user_id FROM contributions WHERE id = :id"),
        {"id": str(contribution_id)},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Contribution not found")

    campaign_id, geo_unit_id, owner_id = row

    if str(owner_id) != str(user_id):
        raise HTTPException(status_code=403, detail="Not authorized")

    await db.execute(
        text("DELETE FROM contributions WHERE id = :id"),
        {"id": str(contribution_id)},
    )

    total: float | None = None
    if geo_unit_id:
        new_total = await db.execute(
            text("""
                SELECT COALESCE(SUM(value), 0)
                FROM contributions
                WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
            """),
            {"campaign_id": str(campaign_id), "geo_unit_id": str(geo_unit_id)},
        )
        total = float(new_total.scalar())

        if total == 0:
            await db.execute(
                text("""
                    DELETE FROM territory_claims
                    WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
                """),
                {"campaign_id": str(campaign_id), "geo_unit_id": str(geo_unit_id)},
            )
        else:
            await db.execute(
                text("""
                    WITH top_group AS (
                        SELECT group_id FROM contributions
                        WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
                          AND group_id IS NOT NULL
                        GROUP BY group_id ORDER BY SUM(value) DESC LIMIT 1
                    ),
                    top_user AS (
                        SELECT user_id FROM contributions
                        WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
                        GROUP BY user_id ORDER BY SUM(value) DESC LIMIT 1
                    )
                    UPDATE territory_claims SET
                        total_value = :total,
                        claimed_by_group = (SELECT group_id FROM top_group),
                        claimed_by_user  = (SELECT user_id  FROM top_user),
                        updated_at = NOW()
                    WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
                """),
                {
                    "campaign_id": str(campaign_id),
                    "geo_unit_id": str(geo_unit_id),
                    "total": total,
                },
            )

    await db.commit()
    return {"deleted": True, "new_bloom_score": total}


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
            AND unit_type = ANY(SELECT unnest(geo_unit) FROM campaigns WHERE id = :campaign_id)
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
    await db.execute(
        text("""
            WITH top_group AS (
                SELECT group_id FROM contributions
                WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
                  AND group_id IS NOT NULL
                GROUP BY group_id ORDER BY SUM(value) DESC LIMIT 1
            ),
            top_user AS (
                SELECT user_id FROM contributions
                WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
                GROUP BY user_id ORDER BY SUM(value) DESC LIMIT 1
            )
            UPDATE territory_claims SET
                claimed_by_group = (SELECT group_id FROM top_group),
                claimed_by_user  = (SELECT user_id  FROM top_user)
            WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
        """),
        {
            "campaign_id": str(payload.campaign_id),
            "geo_unit_id": str(geo_unit_id),
        },
    )
    await db.commit()

    return {
        "geo_unit_id": str(geo_unit_id),
        "location_verified": within_range,
    }
