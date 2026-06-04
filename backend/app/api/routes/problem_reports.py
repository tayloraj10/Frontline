from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db

router = APIRouter(prefix="/problem-reports", tags=["problem-reports"])


class ProblemReportRequest(BaseModel):
    campaign_id: UUID
    reported_by: UUID
    photo_url: str
    latitude: float
    longitude: float
    severity: str = "medium"


@router.post("")
async def submit_problem_report(payload: ProblemReportRequest, db: AsyncSession = Depends(get_db)):
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

    await db.execute(
        text("""
            INSERT INTO problem_reports (campaign_id, geo_unit_id, reported_by, photo_url, location, severity)
            VALUES (:campaign_id, :geo_unit_id, :reported_by, :photo_url,
                    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :severity)
        """),
        {
            "campaign_id": str(payload.campaign_id),
            "geo_unit_id": geo_unit_id,
            "reported_by": str(payload.reported_by),
            "photo_url": payload.photo_url,
            "lon": payload.longitude,
            "lat": payload.latitude,
            "severity": payload.severity,
        },
    )

    # Check report_count triggers for this campaign/geo_unit
    if geo_unit_id:
        await _check_report_triggers(payload.campaign_id, geo_unit_id, db)

    await db.commit()
    return {"geo_unit_id": geo_unit_id, "status": "submitted"}


async def _check_report_triggers(campaign_id: UUID, geo_unit_id: str, db: AsyncSession):
    count_result = await db.execute(
        text("""
            SELECT COUNT(*) FROM problem_reports
            WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id AND status = 'open'
        """),
        {"campaign_id": str(campaign_id), "geo_unit_id": geo_unit_id},
    )
    report_count = count_result.scalar() or 0

    triggers = await db.execute(
        text("""
            SELECT id, condition_config, event_type, effect_config
            FROM event_triggers
            WHERE campaign_id = :campaign_id AND condition_type = 'report_count' AND is_active = TRUE
        """),
        {"campaign_id": str(campaign_id)},
    )

    for trigger in triggers.fetchall():
        threshold = (trigger.condition_config or {}).get("threshold", 5)
        if report_count < threshold:
            continue

        existing = await db.execute(
            text("""
                SELECT id FROM campaign_events
                WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
                AND event_type = :event_type AND status = 'active'
                LIMIT 1
            """),
            {"campaign_id": str(campaign_id), "geo_unit_id": geo_unit_id, "event_type": trigger.event_type},
        )
        if existing.fetchone():
            continue

        await db.execute(
            text("""
                INSERT INTO campaign_events
                    (campaign_id, trigger_id, geo_unit_id, event_type, title, description, effect_config, ends_at)
                VALUES
                    (:campaign_id, :trigger_id, :geo_unit_id, :event_type, :title, :description, :effect_config,
                     NOW() + INTERVAL '72 hours')
            """),
            {
                "campaign_id": str(campaign_id),
                "trigger_id": str(trigger.id),
                "geo_unit_id": geo_unit_id,
                "event_type": trigger.event_type,
                "title": "Trash Boss Event — Surge Needed!",
                "description": "Reports have reached critical mass. Clean it up in 72 hours for bonus XP!",
                "effect_config": trigger.effect_config,
            },
        )
