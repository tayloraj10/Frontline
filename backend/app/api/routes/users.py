from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services import payments as payments_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/search")
async def search_users(
    q: str = Query(..., min_length=0),
    limit: int = Query(10, ge=1, le=25),
    db: AsyncSession = Depends(get_db),
):
    """Search profiles by username/display_name — used e.g. to let an event organizer
    find and add an attendee who never RSVP'd. Requires at least 2 characters to avoid
    scanning on every keystroke."""
    query = q.strip()
    if len(query) < 2:
        return []

    rows = (
        await db.execute(
            text("""
                SELECT id::text, username, display_name, avatar_url
                FROM profiles
                WHERE username ILIKE :prefix OR display_name ILIKE :prefix
                   OR username ILIKE :contains OR display_name ILIKE :contains
                ORDER BY
                    (username ILIKE :prefix OR display_name ILIKE :prefix) DESC,
                    username ASC
                LIMIT :limit
            """),
            {"prefix": f"{query}%", "contains": f"%{query}%", "limit": limit},
        )
    ).fetchall()

    return [
        {
            "id": r.id,
            "username": r.username,
            "display_name": r.display_name,
            "avatar_url": r.avatar_url,
        }
        for r in rows
    ]


@router.get("/{user_id}/premium-insights")
async def get_user_premium_insights(
    user_id: UUID,
    viewer_user_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Personal impact analytics -- premium feature (dev-docs/payments-scoping-2026-08-20.md).
    Only the profile owner or a site admin may view it, and only once that user has an
    active subscription (has_premium)."""
    if viewer_user_id != user_id:
        is_admin_row = (
            await db.execute(text("SELECT is_admin FROM profiles WHERE id = :id"), {"id": str(viewer_user_id)})
        ).fetchone()
        if not is_admin_row or not is_admin_row.is_admin:
            raise HTTPException(403, "Only this user or a site admin can view these insights.")

    if not await payments_service.has_premium(db, "user", user_id):
        raise HTTPException(402, "This account doesn't have an active premium subscription.")

    dow_rows = (
        await db.execute(
            text("""
                SELECT EXTRACT(DOW FROM c.submitted_at)::int AS dow,
                       COALESCE(SUM(c.value), 0)::float AS total_value,
                       COUNT(*)::int AS contribution_count
                FROM contributions c
                WHERE c.user_id = :uid
                GROUP BY dow
                ORDER BY dow
            """),
            {"uid": str(user_id)},
        )
    ).fetchall()
    dow_by_index = {r.dow: r for r in dow_rows}
    dow_labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    day_of_week = [
        {
            "dow": i,
            "label": dow_labels[i],
            "total_value": dow_by_index[i].total_value if i in dow_by_index else 0.0,
            "contribution_count": dow_by_index[i].contribution_count if i in dow_by_index else 0,
        }
        for i in range(7)
    ]

    monthly_trend = (
        await db.execute(
            text("""
                SELECT date_trunc('month', c.submitted_at)::date AS month,
                       COALESCE(SUM(c.value), 0)::float AS total_value,
                       COUNT(*)::int AS contribution_count
                FROM contributions c
                WHERE c.user_id = :uid AND c.submitted_at >= now() - interval '6 months'
                GROUP BY month
                ORDER BY month
            """),
            {"uid": str(user_id)},
        )
    ).fetchall()

    top_geo_units = (
        await db.execute(
            text("""
                SELECT gu.id AS geo_unit_id, gu.display_name,
                       COALESCE(SUM(c.value), 0)::float AS total_value,
                       COUNT(*)::int AS contribution_count
                FROM contributions c
                JOIN geo_units gu ON gu.id = c.geo_unit_id
                WHERE c.user_id = :uid
                GROUP BY gu.id, gu.display_name
                ORDER BY total_value DESC
                LIMIT 5
            """),
            {"uid": str(user_id)},
        )
    ).fetchall()

    return {
        "day_of_week": day_of_week,
        "monthly_trend": [
            {
                "month": r.month.isoformat(),
                "total_value": r.total_value,
                "contribution_count": r.contribution_count,
            }
            for r in monthly_trend
        ],
        "top_geo_units": [
            {
                "geo_unit_id": str(r.geo_unit_id),
                "display_name": r.display_name,
                "total_value": r.total_value,
                "contribution_count": r.contribution_count,
            }
            for r in top_geo_units
        ],
    }
