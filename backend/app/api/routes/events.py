import json
from uuid import UUID

import h3
from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import AsyncSessionLocal, get_db

router = APIRouter(prefix="/events", tags=["events"])


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

    if not geo_unit_id:
        return {"active": False}

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
    row = result.fetchone()
    if not row:
        return {"active": False}

    effect_config = row[0] or {}
    return {
        "active": True,
        "multiplier": float(effect_config.get("multiplier", 1)),
        "title": row[1],
    }


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

        for trigger in triggers.fetchall():
            if trigger.condition_type == "report_count":
                await _check_report_count_trigger(campaign_id, trigger, db)
            elif trigger.condition_type == "threshold_reached":
                await _check_threshold_trigger(campaign_id, trigger, db)
            elif trigger.condition_type == "time_elapsed":
                await _check_time_elapsed_trigger(campaign_id, trigger, db)

        await db.commit()


async def _check_threshold_trigger(campaign_id: UUID, trigger, db: AsyncSession):
    """Fire an event when total campaign-wide or geo-unit contributions cross a threshold."""
    config = trigger.condition_config
    threshold = config.get("threshold", 1000)
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

    await db.execute(
        text("""
            INSERT INTO campaign_events
                (campaign_id, trigger_id, geo_unit_id, event_type, title, description, effect_config, ends_at)
            VALUES
                (:campaign_id, :trigger_id, :geo_unit_id, :event_type,
                 :title, :description, :effect_config, NOW() + INTERVAL '7 days')
        """),
        {
            "campaign_id": str(campaign_id),
            "trigger_id": str(trigger.id),
            "geo_unit_id": geo_unit_id,
            "event_type": trigger.event_type,
            "title": config.get("title", f"Milestone reached — {int(current_value):,} {metric.replace('_', ' ')}!"),
            "description": config.get("description", "A campaign milestone has been hit. Keep the momentum going!"),
            "effect_config": json.dumps(trigger.effect_config) if isinstance(trigger.effect_config, dict) else trigger.effect_config,
        },
    )


async def _check_time_elapsed_trigger(campaign_id: UUID, trigger, db: AsyncSession):
    """Fire when the campaign has been running for at least elapsed_hours since it became active."""
    config = trigger.condition_config or {}
    elapsed_hours = config.get("elapsed_hours", 24)

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

    duration_hours = int(config.get("duration_hours", 48))
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


async def _check_report_count_trigger(campaign_id: UUID, trigger, db: AsyncSession):
    config = trigger.condition_config
    threshold = config.get("threshold", 5)
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

        duration_hours = int(config.get("duration_hours", 72))
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
