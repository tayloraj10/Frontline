from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db

router = APIRouter(prefix="/events", tags=["events"])


@router.post("/check-triggers/{campaign_id}")
async def check_event_triggers(
    campaign_id: UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Evaluate all active triggers for a campaign. Called after contributions are processed."""
    background_tasks.add_task(_evaluate_triggers, campaign_id, db)
    return {"status": "trigger evaluation queued"}


async def _evaluate_triggers(campaign_id: UUID, db: AsyncSession):
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

    await db.commit()


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
        # Check cooldown — don't spawn duplicate active boss events
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

        await db.execute(
            text("""
                INSERT INTO campaign_events (campaign_id, trigger_id, geo_unit_id, event_type, title, description, effect_config, ends_at)
                VALUES (:campaign_id, :trigger_id, :geo_unit_id, :event_type, :title, :description, :effect_config, NOW() + INTERVAL '72 hours')
            """),
            {
                "campaign_id": str(campaign_id),
                "trigger_id": str(trigger.id),
                "geo_unit_id": str(row.geo_unit_id),
                "event_type": trigger.event_type,
                "title": "Trash Boss Event — Surge Needed!",
                "description": f"Reports have reached critical mass. Clean it up in 72 hours for bonus XP!",
                "effect_config": trigger.effect_config,
            },
        )
