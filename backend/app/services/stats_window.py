from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

STATS_INTERVALS = {"today": "day", "week": "week", "month": "month", "all": None}


async def resolve_stats_window(
    db: AsyncSession, interval: str, start_date: str | None = None, end_date: str | None = None
) -> tuple[datetime | None, datetime | None]:
    """
    Resolves an interval + optional explicit calendar-day range into (start, end) UTC bounds
    for a `col >= start AND (end IS NULL OR col < end)` filter.

    Explicit start_date/end_date (YYYY-MM-DD, inclusive) take priority over `interval`, letting
    callers jump to any past day/week/month rather than only "the current one" -- end is
    exclusive (end_date + 1 day) so the picked end day is fully included.

    With no explicit dates, falls back to the legacy behavior: `interval` resolved via
    date_trunc(unit, now()), open-ended through "now" (end=None). "all" has neither bound.
    """
    if interval not in STATS_INTERVALS:
        raise HTTPException(400, f"Invalid interval: {interval}")

    if start_date or end_date:
        if not start_date or not end_date:
            raise HTTPException(400, "start_date and end_date must both be provided together")
        try:
            start_day = date.fromisoformat(start_date)
            end_day = date.fromisoformat(end_date)
        except ValueError:
            raise HTTPException(400, "start_date/end_date must be in YYYY-MM-DD format")
        if end_day < start_day:
            raise HTTPException(400, "end_date must not be before start_date")
        start = datetime(start_day.year, start_day.month, start_day.day, tzinfo=timezone.utc)
        end = datetime(end_day.year, end_day.month, end_day.day, tzinfo=timezone.utc) + timedelta(days=1)
        return start, end

    interval_unit = STATS_INTERVALS[interval]
    if not interval_unit:
        return None, None

    start = (
        await db.execute(text("SELECT date_trunc(:unit, now()) AS start"), {"unit": interval_unit})
    ).fetchone().start
    return start, None


def trend_bucket_unit(start: datetime | None, end: datetime | None) -> str:
    """
    Picks a trend-chart bucket granularity from the resolved window's span, so a custom
    range from a single day to several years doesn't return too many or too few points.
    `end` defaults to "now" when the window is open-ended (interval's implicit upper bound).
    """
    if start is None:
        return "day"
    span = (end or datetime.now(timezone.utc)) - start
    if span <= timedelta(days=2):
        return "hour"
    if span <= timedelta(weeks=10):
        return "day"
    if span <= timedelta(days=548):
        return "week"
    return "month"
