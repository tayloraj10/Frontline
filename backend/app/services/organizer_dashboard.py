from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.cleanup_events import CLEANUP_EVENT_GRACE_MINUTES_AFTER_FALLBACK
from app.services.game_settings import get_game_settings

# An event's check-in window has closed (COALESCE(scheduled_end, scheduled_start) plus
# grace) but no metrics were ever attached to it -- neither on the event row itself
# (team-total logging) nor via a contribution tied to the event (self-logs / log-for-
# attendee), nor via an attendee's cleanup_rsvps.contribution_id link.
_EVENTS_MISSING_METRICS_SQL = """
    SELECT c.id, c.title, c.scheduled_start, c.scheduled_end
    FROM cleanups c
    WHERE c.group_id = :group_id
      AND c.is_group_event = true
      AND COALESCE(c.scheduled_end, c.scheduled_start) + (:grace_after * INTERVAL '1 minute') < NOW()
      AND COALESCE(c.metrics_small_bags, 0) = 0
      AND COALESCE(c.metrics_large_bags, 0) = 0
      AND COALESCE(c.metrics_pounds, 0) = 0
      AND NOT EXISTS (SELECT 1 FROM contributions co WHERE co.cleanup_event_id = c.id)
      AND NOT EXISTS (
          SELECT 1 FROM cleanup_rsvps r WHERE r.cleanup_id = c.id AND r.contribution_id IS NOT NULL
      )
    ORDER BY c.scheduled_start ASC
"""

_NEEDS_EVENT_NUDGE_SQL = """
    SELECT (
        NOT EXISTS (
            SELECT 1 FROM cleanups c
            WHERE c.group_id = :group_id AND c.is_group_event = true
              AND c.status = 'scheduled' AND c.scheduled_start > NOW()
        )
        AND (
            NOT EXISTS (
                SELECT 1 FROM cleanups c
                WHERE c.group_id = :group_id AND c.is_group_event = true
            )
            OR (
                SELECT MAX(COALESCE(c.scheduled_end, c.scheduled_start))
                FROM cleanups c
                WHERE c.group_id = :group_id AND c.is_group_event = true
            ) < NOW() - INTERVAL '7 days'
        )
    ) AS needs_event_nudge
"""


async def get_pending_organizer_items(db: AsyncSession, group_id: UUID) -> dict:
    settings = await get_game_settings(db)
    grace_after = settings.get("cleanup_event_grace_minutes_after", CLEANUP_EVENT_GRACE_MINUTES_AFTER_FALLBACK)

    nudge_row = (
        await db.execute(text(_NEEDS_EVENT_NUDGE_SQL), {"group_id": str(group_id)})
    ).fetchone()
    needs_event_nudge = bool(nudge_row.needs_event_nudge)

    missing_rows = (
        await db.execute(
            text(_EVENTS_MISSING_METRICS_SQL),
            {"group_id": str(group_id), "grace_after": grace_after},
        )
    ).fetchall()

    return {
        "needs_event_nudge": needs_event_nudge,
        "events_missing_metrics": [
            {
                "id": str(r.id),
                "title": r.title,
                "scheduled_start": r.scheduled_start.isoformat() if r.scheduled_start else None,
                "scheduled_end": r.scheduled_end.isoformat() if r.scheduled_end else None,
            }
            for r in missing_rows
        ],
    }


async def user_has_pending_organizer_items(db: AsyncSession, user_id: UUID) -> bool:
    settings = await get_game_settings(db)
    grace_after = settings.get("cleanup_event_grace_minutes_after", CLEANUP_EVENT_GRACE_MINUTES_AFTER_FALLBACK)

    row = (
        await db.execute(
            text(f"""
                SELECT 1
                FROM group_members gm
                WHERE gm.user_id = :user_id AND gm.role = 'admin'
                  AND (
                      NOT EXISTS (
                          SELECT 1 FROM cleanups c
                          WHERE c.group_id = gm.group_id AND c.is_group_event = true
                            AND c.status = 'scheduled' AND c.scheduled_start > NOW()
                      )
                      AND (
                          NOT EXISTS (
                              SELECT 1 FROM cleanups c
                              WHERE c.group_id = gm.group_id AND c.is_group_event = true
                          )
                          OR (
                              SELECT MAX(COALESCE(c.scheduled_end, c.scheduled_start))
                              FROM cleanups c
                              WHERE c.group_id = gm.group_id AND c.is_group_event = true
                          ) < NOW() - INTERVAL '7 days'
                      )
                      OR EXISTS ({_EVENTS_MISSING_METRICS_SQL.replace(":group_id", "gm.group_id")})
                  )
                LIMIT 1
            """),
            {"user_id": str(user_id), "grace_after": grace_after},
        )
    ).fetchone()
    return row is not None
