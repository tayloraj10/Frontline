import json
from uuid import UUID

import h3
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.groups import _is_site_admin
from app.db.database import AsyncSessionLocal, get_db
from app.services.game_settings import get_game_settings

router = APIRouter(prefix="/events", tags=["events"])


async def _require_site_admin(db: AsyncSession, viewer_user_id: UUID) -> None:
    if not await _is_site_admin(db, viewer_user_id):
        raise HTTPException(403, "Admin access required")


@router.get("/campaign/{campaign_id}/active-multiplier")
async def get_active_multiplier(
    campaign_id: UUID,
    lat: float,
    lng: float,
    db: AsyncSession = Depends(get_db),
):
    """
    Check whether a score_multiplier event is currently active at the given point.
    Mirrors the geo_unit resolution in contributions.py's /submit so the frontend can
    show the same multiplier before the user submits, not just after.
    """
    camp_result = await db.execute(
        text("SELECT geo_unit FROM campaigns WHERE id = :campaign_id"),
        {"campaign_id": str(campaign_id)},
    )
    camp_row = camp_result.fetchone()
    campaign_geo_unit = camp_row[0] if camp_row else None
    settings = await get_game_settings(db)

    geo_unit_id = None
    if campaign_geo_unit and "h3_hex" in campaign_geo_unit:
        h3_index = h3.latlng_to_cell(lat, lng, 3)
        geo_result = await db.execute(
            text("SELECT id::text FROM geo_units WHERE unit_type = 'h3_hex' AND unit_id = :h3_index"),
            {"h3_index": h3_index},
        )
        geo_row = geo_result.fetchone()
        geo_unit_id = geo_row[0] if geo_row else None
    elif campaign_geo_unit:
        geo_result = await db.execute(
            text("""
                SELECT id FROM geo_units
                WHERE ST_Contains(geometry, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))
                AND unit_type = ANY(:geo_unit)
                LIMIT 1
            """),
            {"lon": lng, "lat": lat, "geo_unit": campaign_geo_unit},
        )
        geo_row = geo_result.fetchone()
        geo_unit_id = str(geo_row[0]) if geo_row else None

    event_row = None
    if geo_unit_id:
        result = await db.execute(
            text("""
                SELECT effect_config, title FROM campaign_events ce
                WHERE campaign_id = :campaign_id
                  AND status = 'active'
                  AND (started_at IS NULL OR started_at <= NOW())
                  AND (ends_at IS NULL OR ends_at > NOW())
                  AND effect_config->>'type' = 'score_multiplier'
                  AND (
                    geo_unit_id = :geo_unit_id
                    OR EXISTS (
                      SELECT 1 FROM campaign_event_geo_units cegu
                      WHERE cegu.event_id = ce.id AND cegu.geo_unit_id = :geo_unit_id
                    )
                  )
                ORDER BY (effect_config->>'multiplier')::float DESC
                LIMIT 1
            """),
            {"campaign_id": str(campaign_id), "geo_unit_id": geo_unit_id},
        )
        event_row = result.fetchone()

    bonus_spot_result = await db.execute(
        text("""
            SELECT effect_config, title FROM campaign_events
            WHERE campaign_id = :campaign_id
              AND status = 'active'
              AND event_type = 'bonus_spot'
              AND (started_at IS NULL OR started_at <= NOW())
              AND (ends_at IS NULL OR ends_at > NOW())
              AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, radius_m)
            ORDER BY (effect_config->>'multiplier')::float DESC
            LIMIT 1
        """),
        {"campaign_id": str(campaign_id), "lon": lng, "lat": lat},
    )
    bonus_spot_row = bonus_spot_result.fetchone()

    event_multiplier = float((event_row[0] or {}).get("multiplier", settings.get("hotspot_multiplier", 1))) if event_row else 0.0
    bonus_spot_multiplier = float((bonus_spot_row[0] or {}).get("multiplier", settings.get("bonus_spot_multiplier", 1))) if bonus_spot_row else 0.0

    if not event_row and not bonus_spot_row:
        return {"active": False}

    if bonus_spot_multiplier >= event_multiplier and bonus_spot_row:
        return {"active": True, "multiplier": bonus_spot_multiplier, "title": bonus_spot_row[1], "kind": "bonus_spot"}

    return {"active": True, "multiplier": event_multiplier, "title": event_row[1], "kind": "event"}


@router.get("/campaign/{campaign_id}/bonus-spots")
async def get_bonus_spots(campaign_id: UUID, db: AsyncSession = Depends(get_db)):
    """Active bonus spots for the map layer -- point + radius, unlike the geo_unit-shaped
    events covered by /centroids."""
    result = await db.execute(
        text("""
            SELECT id, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
                   radius_m, effect_config, title, ends_at
            FROM campaign_events
            WHERE campaign_id = :campaign_id
              AND status = 'active'
              AND event_type = 'bonus_spot'
              AND (started_at IS NULL OR started_at <= NOW())
              AND (ends_at IS NULL OR ends_at > NOW())
        """),
        {"campaign_id": str(campaign_id)},
    )
    return [
        {
            "id": str(r.id),
            "lat": r.lat,
            "lng": r.lng,
            "radius_m": r.radius_m,
            "multiplier": float((r.effect_config or {}).get("multiplier", 1)),
            "title": r.title,
            "ends_at": r.ends_at.isoformat() if r.ends_at else None,
        }
        for r in result.fetchall()
    ]


class BonusSpotCreate(BaseModel):
    viewer_user_id: UUID
    lat: float
    lng: float
    radius_m: float | None = None
    duration_minutes: int | None = None
    multiplier: float | None = None
    title: str | None = None
    description: str | None = None
    source_problem_report_id: UUID | None = None


@router.post("/campaign/{campaign_id}/bonus-spot")
async def create_bonus_spot(
    campaign_id: UUID,
    payload: BonusSpotCreate,
    db: AsyncSession = Depends(get_db),
):
    """Admin-triggered spawn of a bonus spot -- a manual pin or a suggested
    problem_reports-backed point, with defaults for radius/duration/multiplier
    pulled from game_settings (see 088_bonus_spots.sql)."""
    await _require_site_admin(db, payload.viewer_user_id)
    settings = await get_game_settings(db)

    radius_m = round(payload.radius_m or settings.get("bonus_spot_default_radius_m", 182.88))
    duration_minutes = payload.duration_minutes or int(settings.get("bonus_spot_default_duration_minutes", 4320))
    multiplier = payload.multiplier or settings.get("bonus_spot_multiplier", 3)

    result = await db.execute(
        text("""
            INSERT INTO campaign_events
                (campaign_id, event_type, title, description, effect_config,
                 location, radius_m, source_problem_report_id, ends_at)
            VALUES
                (:campaign_id, 'bonus_spot', :title, :description, :effect_config,
                 ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :radius_m,
                 :source_problem_report_id, NOW() + (:duration_minutes * INTERVAL '1 minute'))
            RETURNING id, title, description, effect_config, status, started_at, ends_at, radius_m
        """),
        {
            "campaign_id": str(campaign_id),
            "title": payload.title or "Bonus Spot",
            "description": payload.description,
            "effect_config": json.dumps({"type": "score_multiplier", "multiplier": multiplier}),
            "lon": payload.lng,
            "lat": payload.lat,
            "radius_m": radius_m,
            "source_problem_report_id": str(payload.source_problem_report_id) if payload.source_problem_report_id else None,
            "duration_minutes": duration_minutes,
        },
    )
    row = result.fetchone()
    await db.commit()

    return {
        "id": str(row.id),
        "title": row.title,
        "description": row.description,
        "effect_config": row.effect_config,
        "status": row.status,
        "started_at": row.started_at.isoformat() if row.started_at else None,
        "ends_at": row.ends_at.isoformat() if row.ends_at else None,
        "radius_m": row.radius_m,
        "lat": payload.lat,
        "lng": payload.lng,
        "campaign_id": str(campaign_id),
    }


@router.get("/campaign/{campaign_id}/bonus-spot/suggest")
async def suggest_bonus_spot(
    campaign_id: UUID,
    viewer_user_id: UUID = Query(...),
    exclude_report_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Rank candidate problem_reports for an admin to spawn a bonus spot on, blending
    local report density (the has-trash signal Option A relies on) with proximity to a
    partner business (drives foot traffic to partners, borrowed as a ranking signal
    from business-proximity-cleanup-bonus-scoping-2026-08-14.md). Doesn't create
    anything -- the admin previews/re-rolls (pass the previous report_id as
    exclude_report_id) before calling POST .../bonus-spot to confirm."""
    await _require_site_admin(db, viewer_user_id)

    result = await db.execute(
        text("""
            WITH candidate AS (
                SELECT pr.id,
                       pr.location,
                       pr.severity,
                       pr.reported_at,
                       (
                         SELECT COUNT(*) FROM problem_reports pr2
                         WHERE pr2.campaign_id = pr.campaign_id
                           AND pr2.status IN ('open', 'verified')
                           AND pr2.id != pr.id
                           AND ST_DWithin(pr2.location, pr.location, 150)
                       ) AS nearby_report_count,
                       EXISTS (
                         SELECT 1 FROM partner_business_locations pbl
                         JOIN campaign_partner_businesses cpb ON cpb.business_id = pbl.business_id
                         WHERE cpb.campaign_id = pr.campaign_id
                           AND pbl.status = 'active'
                           AND ST_DWithin(
                                 pr.location,
                                 ST_SetSRID(ST_MakePoint(pbl.lng, pbl.lat), 4326)::geography,
                                 300
                               )
                       ) AS near_partner
                FROM problem_reports pr
                WHERE pr.campaign_id = :campaign_id
                  AND pr.status IN ('open', 'verified')
                  AND pr.severity IN ('medium', 'high')
                  AND pr.reported_at > NOW() - INTERVAL '30 days'
                  AND (CAST(:exclude_report_id AS uuid) IS NULL OR pr.id != CAST(:exclude_report_id AS uuid))
                  AND NOT EXISTS (
                    SELECT 1 FROM campaign_events ce
                    WHERE ce.source_problem_report_id = pr.id AND ce.status = 'active'
                  )
                ORDER BY nearby_report_count DESC, near_partner DESC, random()
                LIMIT 1
            ),
            -- Nudge the spot 15-40m off the report itself in a random direction so it
            -- doesn't render exactly on top of the report marker on the map, while
            -- staying well within the bonus spot's own claim radius.
            jittered AS (
                SELECT id, severity, reported_at, nearby_report_count, near_partner,
                       ST_Project(location, 15 + random() * 25, random() * 2 * pi()) AS point
                FROM candidate
            )
            SELECT id,
                   ST_Y(point::geometry) AS lat,
                   ST_X(point::geometry) AS lng,
                   severity,
                   reported_at,
                   nearby_report_count,
                   near_partner
            FROM jittered
        """),
        {
            "campaign_id": str(campaign_id),
            "exclude_report_id": str(exclude_report_id) if exclude_report_id else None,
        },
    )
    row = result.fetchone()
    if not row:
        return {"found": False}

    return {
        "found": True,
        "report_id": str(row.id),
        "lat": row.lat,
        "lng": row.lng,
        "severity": row.severity,
        "reported_at": row.reported_at.isoformat() if row.reported_at else None,
        "nearby_report_count": row.nearby_report_count,
        "near_partner": row.near_partner,
    }


@router.get("/campaign/{campaign_id}/map-context")
async def get_map_context(campaign_id: UUID, db: AsyncSession = Depends(get_db)):
    """Campaign-wide point layers (cleanups, trash reports, partners) for the
    simplified map shown in the bonus-spot admin picker -- same kind/point shape
    partners.py's radius-points uses for the radius-of-influence map, but without
    a distance filter since this covers the whole campaign, not one location."""
    cleanups_result = await db.execute(
        text("""
            SELECT id, 'cleanup' AS kind, ST_Y(location::geometry) AS lat,
                   ST_X(location::geometry) AS lng, title AS label
            FROM cleanups
            WHERE campaign_id = :campaign_id AND location IS NOT NULL AND status != 'cancelled'
            LIMIT 500
        """),
        {"campaign_id": str(campaign_id)},
    )
    reports_result = await db.execute(
        text("""
            SELECT id, 'trash_report' AS kind, ST_Y(location::geometry) AS lat,
                   ST_X(location::geometry) AS lng, NULL AS label
            FROM problem_reports
            WHERE campaign_id = :campaign_id AND location IS NOT NULL
              AND status IN ('open', 'verified')
            LIMIT 500
        """),
        {"campaign_id": str(campaign_id)},
    )
    partners_result = await db.execute(
        text("""
            SELECT pbl.id, 'partner' AS kind, pbl.lat, pbl.lng, pb.name AS label
            FROM partner_business_locations pbl
            JOIN campaign_partner_businesses cpb ON cpb.business_id = pbl.business_id
            JOIN partner_businesses pb ON pb.id = pbl.business_id
            WHERE cpb.campaign_id = :campaign_id AND pbl.status = 'active'
            LIMIT 500
        """),
        {"campaign_id": str(campaign_id)},
    )

    points = [
        {"id": str(r.id), "kind": r.kind, "lat": r.lat, "lng": r.lng, "label": r.label}
        for r in [*cleanups_result.fetchall(), *reports_result.fetchall(), *partners_result.fetchall()]
    ]
    return {"points": points}


@router.get("/campaign/{campaign_id}/centroids")
async def get_event_geo_centroids(campaign_id: UUID, db: AsyncSession = Depends(get_db)):
    """Return centroid lat/lng for each active event's geo_unit(s). Covers both the
    legacy single geo_unit_id column (trigger-created events) and the
    campaign_event_geo_units join table (admin-created multi-area events). Used by
    the map to place markers regardless of viewport."""
    result = await db.execute(
        text("""
            SELECT DISTINCT gu.id AS geo_unit_id,
                   ST_Y(ST_Centroid(gu.geometry::geometry)) AS centroid_lat,
                   ST_X(ST_Centroid(gu.geometry::geometry)) AS centroid_lng
            FROM campaign_events ce
            JOIN geo_units gu ON gu.id = ce.geo_unit_id
            WHERE ce.campaign_id = :campaign_id
              AND ce.status = 'active'
              AND (ce.started_at IS NULL OR ce.started_at <= NOW())
              AND ce.geo_unit_id IS NOT NULL

            UNION

            SELECT DISTINCT gu.id AS geo_unit_id,
                   ST_Y(ST_Centroid(gu.geometry::geometry)) AS centroid_lat,
                   ST_X(ST_Centroid(gu.geometry::geometry)) AS centroid_lng
            FROM campaign_events ce
            JOIN campaign_event_geo_units cegu ON cegu.event_id = ce.id
            JOIN geo_units gu ON gu.id = cegu.geo_unit_id
            WHERE ce.campaign_id = :campaign_id
              AND ce.status = 'active'
              AND (ce.started_at IS NULL OR ce.started_at <= NOW())
        """),
        {"campaign_id": str(campaign_id)},
    )
    return [
        {"geo_unit_id": str(r.geo_unit_id), "lat": r.centroid_lat, "lng": r.centroid_lng}
        for r in result.fetchall()
    ]


@router.post("/expire")
async def expire_events(db: AsyncSession = Depends(get_db)):
    """
    Marks active campaign_events as expired once their ends_at has passed.
    Intended to be called by a Railway cron or Cloud Run scheduler, same as POST /decay/run.
    """
    result = await db.execute(
        text("""
            UPDATE campaign_events
            SET status = 'expired',
                resolved_at = NOW()
            WHERE status = 'active'
            AND ends_at IS NOT NULL
            AND ends_at < NOW()
            RETURNING id, campaign_id
        """)
    )
    expired = result.fetchall()
    await db.commit()

    return {"expired_count": len(expired), "events": [{"id": str(r[0]), "campaign_id": str(r[1])} for r in expired]}


@router.post("/check-triggers/{campaign_id}")
async def check_event_triggers(
    campaign_id: UUID,
    background_tasks: BackgroundTasks,
):
    """Evaluate all active triggers for a campaign. Called after contributions are processed."""
    background_tasks.add_task(_evaluate_triggers, campaign_id)
    return {"status": "trigger evaluation queued"}


async def _evaluate_triggers(campaign_id: UUID):
    # Runs as a BackgroundTasks job, i.e. after the request's own DB session has
    # already been closed — must open its own session rather than reuse one.
    async with AsyncSessionLocal() as db:
        status_row = await db.execute(
            text("SELECT status FROM campaigns WHERE id = :campaign_id"),
            {"campaign_id": str(campaign_id)},
        )
        campaign = status_row.fetchone()
        if not campaign or campaign.status != "active":
            return

        triggers = await db.execute(
            text("""
                SELECT id, condition_type, condition_config, event_type, effect_config, cooldown_hours
                FROM event_triggers
                WHERE campaign_id = :campaign_id AND is_active = TRUE
            """),
            {"campaign_id": str(campaign_id)},
        )

        settings = await get_game_settings(db)

        for trigger in triggers.fetchall():
            if trigger.condition_type == "report_count":
                await _check_report_count_trigger(campaign_id, trigger, db, settings)
            elif trigger.condition_type == "threshold_reached":
                await _check_threshold_trigger(campaign_id, trigger, db, settings)
            elif trigger.condition_type == "time_elapsed":
                await _check_time_elapsed_trigger(campaign_id, trigger, db, settings)

        await db.commit()


async def _check_threshold_trigger(campaign_id: UUID, trigger, db: AsyncSession, settings: dict):
    """Fire an event when total campaign-wide or geo-unit contributions cross a threshold."""
    config = trigger.condition_config
    threshold = config.get("threshold", settings.get("threshold_reached_default", 1000))
    metric = config.get("metric", "total_value")  # 'total_value' | 'contribution_count'
    geo_unit_id = config.get("geo_unit_id")

    col = "total_value" if metric == "total_value" else "contribution_count"
    query_params: dict = {"campaign_id": str(campaign_id), "threshold": threshold}

    if geo_unit_id:
        query_params["geo_unit_id"] = geo_unit_id
        result = await db.execute(
            text(f"SELECT {col} FROM leaderboard_entries WHERE campaign_id = :campaign_id AND entity_type = 'campaign' LIMIT 1"),
            query_params,
        )
        # Fallback: aggregate from territory_claims for the specific geo unit
        result = await db.execute(
            text(f"SELECT total_value FROM territory_claims WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id"),
            query_params,
        )
        row = result.fetchone()
        current_value = float(row[0]) if row else 0
    else:
        result = await db.execute(
            text(f"SELECT COALESCE(SUM({col}), 0) FROM territory_claims WHERE campaign_id = :campaign_id"),
            query_params,
        )
        current_value = float(result.scalar() or 0)

    if current_value < threshold:
        return

    existing = await db.execute(
        text("""
            SELECT id FROM campaign_events
            WHERE campaign_id = :campaign_id
              AND trigger_id = :trigger_id
              AND status = 'active'
            LIMIT 1
        """),
        {"campaign_id": str(campaign_id), "trigger_id": str(trigger.id)},
    )
    if existing.fetchone():
        return

    threshold_duration_hours = int(settings.get("threshold_reached_event_duration_hours", 168))
    await db.execute(
        text("""
            INSERT INTO campaign_events
                (campaign_id, trigger_id, geo_unit_id, event_type, title, description, effect_config, ends_at)
            VALUES
                (:campaign_id, :trigger_id, :geo_unit_id, :event_type,
                 :title, :description, :effect_config, NOW() + (:duration_hours * INTERVAL '1 hour'))
        """),
        {
            "campaign_id": str(campaign_id),
            "trigger_id": str(trigger.id),
            "geo_unit_id": geo_unit_id,
            "event_type": trigger.event_type,
            "title": config.get("title", f"Milestone reached — {int(current_value):,} {metric.replace('_', ' ')}!"),
            "description": config.get("description", "A campaign milestone has been hit. Keep the momentum going!"),
            "effect_config": json.dumps(trigger.effect_config) if isinstance(trigger.effect_config, dict) else trigger.effect_config,
            "duration_hours": threshold_duration_hours,
        },
    )


async def _check_time_elapsed_trigger(campaign_id: UUID, trigger, db: AsyncSession, settings: dict):
    """Fire when the campaign has been running for at least elapsed_hours since it became active."""
    config = trigger.condition_config or {}
    elapsed_hours = config.get("elapsed_hours", settings.get("time_elapsed_default_hours", 24))

    result = await db.execute(
        text("""
            SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 AS hours_elapsed
            FROM campaigns WHERE id = :campaign_id
        """),
        {"campaign_id": str(campaign_id)},
    )
    row = result.fetchone()
    if not row or float(row[0]) < elapsed_hours:
        return

    existing = await db.execute(
        text("""
            SELECT id FROM campaign_events
            WHERE campaign_id = :campaign_id AND trigger_id = :trigger_id AND status = 'active'
            LIMIT 1
        """),
        {"campaign_id": str(campaign_id), "trigger_id": str(trigger.id)},
    )
    if existing.fetchone():
        return

    duration_hours = int(config.get("duration_hours", settings.get("time_elapsed_event_duration_hours_default", 48)))
    await db.execute(
        text("""
            INSERT INTO campaign_events
                (campaign_id, trigger_id, geo_unit_id, event_type, title, description, effect_config, ends_at)
            VALUES
                (:campaign_id, :trigger_id, NULL, :event_type, :title, :description, :effect_config,
                 NOW() + (:duration_hours * INTERVAL '1 hour'))
        """),
        {
            "campaign_id": str(campaign_id),
            "trigger_id": str(trigger.id),
            "event_type": trigger.event_type,
            "title": config.get("title", f"Time milestone — {int(elapsed_hours)}h in!"),
            "description": config.get("description", "A time-based campaign event has been triggered."),
            "effect_config": json.dumps(trigger.effect_config) if isinstance(trigger.effect_config, dict) else trigger.effect_config,
            "duration_hours": duration_hours,
        },
    )


async def _check_report_count_trigger(campaign_id: UUID, trigger, db: AsyncSession, settings: dict):
    config = trigger.condition_config
    threshold = config.get("threshold", settings.get("report_count_threshold_default", 5))
    geo_unit_id = config.get("geo_unit_id")

    query_params = {"campaign_id": str(campaign_id), "threshold": threshold}
    geo_filter = ""
    if geo_unit_id:
        geo_filter = "AND geo_unit_id = :geo_unit_id"
        query_params["geo_unit_id"] = geo_unit_id

    result = await db.execute(
        text(f"""
            SELECT geo_unit_id, COUNT(*) as report_count
            FROM problem_reports
            WHERE campaign_id = :campaign_id AND status = 'open'
            {geo_filter}
            GROUP BY geo_unit_id
            HAVING COUNT(*) >= :threshold
        """),
        query_params,
    )

    for row in result.fetchall():
        # Check cooldown — don't spawn duplicate active hotspots
        existing = await db.execute(
            text("""
                SELECT id FROM campaign_events
                WHERE campaign_id = :campaign_id
                AND geo_unit_id = :geo_unit_id
                AND event_type = :event_type
                AND status = 'active'
                LIMIT 1
            """),
            {"campaign_id": str(campaign_id), "geo_unit_id": str(row.geo_unit_id), "event_type": trigger.event_type},
        )
        if existing.fetchone():
            continue

        duration_hours = int(config.get("duration_hours", settings.get("hotspot_event_duration_hours", 72)))
        await db.execute(
            text("""
                INSERT INTO campaign_events (campaign_id, trigger_id, geo_unit_id, event_type, title, description, effect_config, ends_at)
                VALUES (:campaign_id, :trigger_id, :geo_unit_id, :event_type, :title, :description, :effect_config,
                        NOW() + (:duration_hours * INTERVAL '1 hour'))
            """),
            {
                "campaign_id": str(campaign_id),
                "trigger_id": str(trigger.id),
                "geo_unit_id": str(row.geo_unit_id),
                "event_type": trigger.event_type,
                "title": config.get("title", "Boss Event — Surge Needed!"),
                "description": config.get("description", "Reports have reached critical mass. Respond now!"),
                "effect_config": json.dumps(trigger.effect_config) if isinstance(trigger.effect_config, dict) else trigger.effect_config,
                "duration_hours": duration_hours,
            },
        )
