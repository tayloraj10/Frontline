"""Weekly earning ceiling and local-day helpers.

Everything a person earns through the app (marketplace jobs and sponsored sites) counts toward
one rolling 7 day ceiling. Crossing it never claws money back: the payout that crosses it is
paid through normal review, and the person just cannot take new work until they are back under.
"""

from datetime import datetime, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import payments as payments_service
from app.services.game_settings import get_game_settings

DEFAULT_CEILING_USD = 200
DEFAULT_PLUS_CEILING_USD = 500
LOCKED_MESSAGE = (
    "You have reached the weekly earning limit. You can take new jobs and claim sites again once "
    "your earnings from the last 7 days drop back under it."
)


def local_midnight_utc(tz_name: str | None) -> datetime:
    """Start of the current day in the given IANA timezone, as UTC. Falls back to UTC midnight."""
    tz = timezone.utc
    if tz_name:
        try:
            tz = ZoneInfo(tz_name)
        except (ZoneInfoNotFoundError, ValueError):
            tz = timezone.utc
    now = datetime.now(tz)
    return now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)


def local_day_bounds_utc(moment: datetime, tz_name: str | None) -> tuple[datetime, datetime]:
    """[start, end) of the local calendar day containing `moment`, as UTC. Naive moments are read as UTC."""
    tz = timezone.utc
    if tz_name:
        try:
            tz = ZoneInfo(tz_name)
        except (ZoneInfoNotFoundError, ValueError):
            tz = timezone.utc
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    local = moment.astimezone(tz)
    start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    end = (start.replace(tzinfo=None) + timedelta(days=1)).replace(tzinfo=tz)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


async def weekly_earned_breakdown(db: AsyncSession, user_id: UUID) -> dict[str, int]:
    """Last 7 days split into verified (approved or paid), waiting for review, and jobs still in progress.

    A sponsored site only has an amount once the after photo is submitted, so an unfinished claim is not
    counted until then. Rejected allocations never count.
    """
    spons = (
        await db.execute(
            text("""
                SELECT
                  COALESCE(SUM(amount_cents) FILTER (WHERE status IN ('approved', 'paid_out')), 0),
                  COALESCE(SUM(amount_cents) FILTER (WHERE status = 'pending_review'), 0)
                FROM sponsorship_allocations
                WHERE user_id = :u AND status <> 'rejected' AND created_at > now() - interval '7 days'
            """),
            {"u": str(user_id)},
        )
    ).one()
    jobs = (
        await db.execute(
            text("""
                WITH j AS (
                  SELECT status, price_cents - CASE WHEN fee_on_top THEN 0 ELSE COALESCE(platform_fee_cents, 0) END AS pay
                  FROM marketplace_jobs
                  WHERE cleaner_id = :u AND accepted_at > now() - interval '7 days'
                    AND status IN ('accepted', 'in_progress', 'completed', 'confirmed', 'released')
                )
                SELECT
                  COALESCE(SUM(pay) FILTER (WHERE status IN ('confirmed', 'released')), 0),
                  COALESCE(SUM(pay) FILTER (WHERE status = 'completed'), 0),
                  COALESCE(SUM(pay) FILTER (WHERE status IN ('accepted', 'in_progress')), 0)
                FROM j
            """),
            {"u": str(user_id)},
        )
    ).one()
    return {
        "verified_cents": int(spons[0]) + int(jobs[0]),
        "pending_review_cents": int(spons[1]) + int(jobs[1]),
        "in_progress_cents": int(jobs[2]),
    }


async def weekly_earned_cents(db: AsyncSession, user_id: UUID) -> int:
    """Everything counted against the weekly ceiling: verified, awaiting review and in progress."""
    return sum((await weekly_earned_breakdown(db, user_id)).values())


async def weekly_status(db: AsyncSession, user_id: UUID) -> dict:
    settings = await get_game_settings(db)
    plus = await payments_service.has_premium(db, "user", user_id)
    base = int(round(float(settings.get("earning_weekly_ceiling_usd", DEFAULT_CEILING_USD)) * 100))
    plus_limit = max(base, int(round(float(settings.get("earning_weekly_ceiling_plus_usd", DEFAULT_PLUS_CEILING_USD)) * 100)))
    limit = plus_limit if plus else base
    parts = await weekly_earned_breakdown(db, user_id)
    earned = sum(parts.values())
    return {
        "limit_cents": limit,
        "earned_week_cents": earned,
        **parts,
        "remaining_cents": max(0, limit - earned),
        "locked": earned >= limit,
        "is_plus": plus,
        "plus_limit_cents": plus_limit,
    }


async def is_locked(db: AsyncSession, user_id: UUID) -> bool:
    return (await weekly_status(db, user_id))["locked"]


DEFAULT_GROUP_CEILING_USD = 500
DEFAULT_GROUP_PLUS_CEILING_USD = 1000
GROUP_LOCKED_MESSAGE = (
    "Your group has reached its weekly earning limit, so it can't host new sponsored events until "
    "its earnings from the last 7 days drop back under it."
)


async def group_weekly_earned_cents(db: AsyncSession, group_id: UUID) -> int:
    """Event-based sponsored allocations (not rejected) paid to the group over the last 7 days. Direct gifts do not count."""
    return int(
        (
            await db.execute(
                text("""
                    SELECT COALESCE(SUM(amount_cents), 0) FROM sponsorship_allocations
                    WHERE group_id = :g AND status <> 'rejected' AND NOT is_direct AND created_at > now() - interval '7 days'
                """),
                {"g": str(group_id)},
            )
        ).scalar()
    )


async def group_weekly_status(db: AsyncSession, group_id: UUID) -> dict:
    settings = await get_game_settings(db)
    plus = await payments_service.has_premium(db, "group", group_id)
    base = int(round(float(settings.get("earning_weekly_ceiling_group_usd", DEFAULT_GROUP_CEILING_USD)) * 100))
    plus_limit = max(
        base, int(round(float(settings.get("earning_weekly_ceiling_group_plus_usd", DEFAULT_GROUP_PLUS_CEILING_USD)) * 100))
    )
    limit = plus_limit if plus else base
    earned = await group_weekly_earned_cents(db, group_id)
    return {
        "limit_cents": limit,
        "earned_week_cents": earned,
        "remaining_cents": max(0, limit - earned),
        "locked": earned >= limit,
        "is_plus": plus,
        "plus_limit_cents": plus_limit,
    }
