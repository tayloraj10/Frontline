import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.upload import delete_r2_object
from app.db.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/groups", tags=["groups"])


class DeleteGroupRequest(BaseModel):
    requesting_user_id: UUID


async def _is_group_admin(db: AsyncSession, group_id: UUID, user_id: UUID) -> bool:
    row = (
        await db.execute(
            text("""
                SELECT 1 FROM group_members
                WHERE group_id = :group_id AND user_id = :user_id AND role = 'admin'
            """),
            {"group_id": str(group_id), "user_id": str(user_id)},
        )
    ).fetchone()
    return row is not None


async def _is_site_admin(db: AsyncSession, user_id: UUID) -> bool:
    row = (
        await db.execute(
            text("SELECT is_admin FROM profiles WHERE id = :user_id"),
            {"user_id": str(user_id)},
        )
    ).fetchone()
    return bool(row and row.is_admin)


@router.delete("/{group_id}")
async def delete_group(group_id: UUID, payload: DeleteGroupRequest, db: AsyncSession = Depends(get_db)):
    """
    Fully deletes a group: detaches its contributions (group_id -> NULL, preserving each
    user's point history), recomputes territory_claims for every geo unit it led (same
    top-group/top-user re-pick used by admin.py's wipe_cleanup_event), clears its
    leaderboard_entries rows, then deletes the group row itself. group_members and
    cleanup_event_cohosts cascade via FK; any past/cancelled hosted events get
    cleanups.group_id set to NULL via FK. Refuses to delete while the group has an active
    or upcoming hosted/co-hosted event, so attendees never lose a host out from under them.
    """
    group_row = (
        await db.execute(
            text("SELECT id, name, image_url FROM groups WHERE id = :id"),
            {"id": str(group_id)},
        )
    ).fetchone()
    if not group_row:
        raise HTTPException(404, f"No group found for id={group_id}")

    is_authorized = await _is_site_admin(db, payload.requesting_user_id) and await _is_group_admin(
        db, group_id, payload.requesting_user_id
    )
    if not is_authorized:
        raise HTTPException(403, "Only a site admin who is also an admin of this group can delete it.")

    blocking_events = (
        await db.execute(
            text("""
                SELECT id, title, scheduled_start
                FROM cleanups
                WHERE status != 'cancelled'
                  AND scheduled_end > NOW()
                  AND (
                    group_id = :group_id
                    OR id IN (SELECT cleanup_id FROM cleanup_event_cohosts WHERE group_id = :group_id)
                  )
                ORDER BY scheduled_start
            """),
            {"group_id": str(group_id)},
        )
    ).fetchall()
    if blocking_events:
        raise HTTPException(
            409,
            {
                "detail": "This group is hosting or co-hosting upcoming events. Reassign or cancel them before deleting the group.",
                "blocking_events": [
                    {"id": str(r.id), "title": r.title, "scheduled_start": r.scheduled_start.isoformat()}
                    for r in blocking_events
                ],
            },
        )

    affected = (
        await db.execute(
            text("""
                SELECT DISTINCT campaign_id, geo_unit_id
                FROM territory_claims
                WHERE claimed_by_group = :group_id
            """),
            {"group_id": str(group_id)},
        )
    ).fetchall()

    await db.execute(
        text("DELETE FROM leaderboard_entries WHERE entity_type = 'group' AND entity_id = :group_id"),
        {"group_id": str(group_id)},
    )

    await db.execute(
        text("UPDATE contributions SET group_id = NULL WHERE group_id = :group_id"),
        {"group_id": str(group_id)},
    )

    for campaign_id, geo_unit_id in affected:
        new_total = (
            await db.execute(
                text("""
                    SELECT COALESCE(SUM(value), 0) FROM contributions
                    WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
                """),
                {"campaign_id": str(campaign_id), "geo_unit_id": str(geo_unit_id)},
            )
        ).scalar()
        total = float(new_total)

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

    await db.execute(text("DELETE FROM groups WHERE id = :id"), {"id": str(group_id)})
    await db.commit()

    if group_row.image_url:
        try:
            delete_r2_object(group_row.image_url)
        except Exception:
            logger.exception("Failed to delete R2 logo for deleted group %s (%s)", group_id, group_row.image_url)

    return {"deleted": True, "group_id": str(group_id), "name": group_row.name}
