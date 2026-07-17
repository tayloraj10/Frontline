from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db

router = APIRouter(prefix="/campaigns", tags=["leaderboard"])


@router.get("/{campaign_id}/leaderboard")
async def get_campaign_leaderboard(campaign_id: UUID, db: AsyncSession = Depends(get_db)):
    totals_row = (
        await db.execute(
            text("""
                SELECT
                    COALESCE(SUM(value), 0)::float AS total_value,
                    COUNT(*)::int                   AS contribution_count
                FROM contributions
                WHERE campaign_id = :cid
            """),
            {"cid": str(campaign_id)},
        )
    ).fetchone()

    user_rows = (
        await db.execute(
            text("""
                SELECT
                    user_id::text,
                    COALESCE(SUM(value), 0)::float  AS total_value,
                    COUNT(*)::int                    AS contribution_count
                FROM contributions
                WHERE campaign_id = :cid AND user_id IS NOT NULL
                GROUP BY user_id
                ORDER BY total_value DESC
                LIMIT 20
            """),
            {"cid": str(campaign_id)},
        )
    ).fetchall()

    user_tracts = {
        row.claimed_by_user: row.tracts
        for row in (
            await db.execute(
                text("""
                    SELECT claimed_by_user::text, COUNT(*)::int AS tracts
                    FROM territory_claims
                    WHERE campaign_id = :cid AND claimed_by_user IS NOT NULL
                    GROUP BY claimed_by_user
                """),
                {"cid": str(campaign_id)},
            )
        ).fetchall()
    }

    group_rows = (
        await db.execute(
            text("""
                SELECT
                    group_id::text,
                    COALESCE(SUM(value), 0)::float  AS total_value,
                    COUNT(*)::int                    AS contribution_count
                FROM contributions
                WHERE campaign_id = :cid AND group_id IS NOT NULL
                GROUP BY group_id
                ORDER BY total_value DESC
                LIMIT 20
            """),
            {"cid": str(campaign_id)},
        )
    ).fetchall()

    group_tracts = {
        row.claimed_by_group: row.tracts
        for row in (
            await db.execute(
                text("""
                    SELECT claimed_by_group::text, COUNT(*)::int AS tracts
                    FROM territory_claims
                    WHERE campaign_id = :cid AND claimed_by_group IS NOT NULL
                    GROUP BY claimed_by_group
                """),
                {"cid": str(campaign_id)},
            )
        ).fetchall()
    }

    return {
        "total_value": totals_row.total_value,
        "contribution_count": totals_row.contribution_count,
        "users": [
            {
                "entity_id": r.user_id,
                "total_value": r.total_value,
                "contribution_count": r.contribution_count,
                "tracts_claimed": user_tracts.get(r.user_id, 0),
            }
            for r in user_rows
        ],
        "groups": [
            {
                "entity_id": r.group_id,
                "total_value": r.total_value,
                "contribution_count": r.contribution_count,
                "tracts_claimed": group_tracts.get(r.group_id, 0),
            }
            for r in group_rows
        ],
    }


@router.get("/{campaign_id}/leaderboard/range")
async def get_campaign_leaderboard_range(
    campaign_id: UUID,
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Per-campaign leaderboard scoped to an optional [start, end) submitted_at window —
    used for time-boxed promotions (e.g. a weekly cleanup contest) where the all-time
    /leaderboard endpoint isn't sufficient.
    """
    rows = (
        await db.execute(
            text("""
                SELECT
                    c.user_id::text,
                    p.username,
                    p.display_name,
                    p.avatar_url,
                    COALESCE(SUM(c.value), 0)::float                          AS total_value,
                    COUNT(*)::int                                             AS contribution_count,
                    COALESCE(SUM(cl.metrics_small_bags), 0)::int              AS small_bags,
                    COALESCE(SUM(cl.metrics_large_bags), 0)::int              AS large_bags,
                    COALESCE(SUM(cl.metrics_pounds), 0)::float                AS pounds,
                    COUNT(*) FILTER (
                        WHERE cl.image_urls IS NOT NULL AND array_length(cl.image_urls, 1) > 0
                    )::int                                                    AS photo_count
                FROM contributions c
                LEFT JOIN profiles p ON p.id = c.user_id
                LEFT JOIN cleanups cl ON cl.id = c.cleanup_id
                WHERE c.campaign_id = :cid
                  AND c.user_id IS NOT NULL
                  AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                GROUP BY c.user_id, p.username, p.display_name, p.avatar_url
                ORDER BY total_value DESC
            """),
            {"cid": str(campaign_id), "start": start, "end": end},
        )
    ).fetchall()

    return {
        "start": start.isoformat() if start else None,
        "end": end.isoformat() if end else None,
        "users": [
            {
                "user_id": r.user_id,
                "username": r.username,
                "display_name": r.display_name,
                "avatar_url": r.avatar_url,
                "total_value": r.total_value,
                "contribution_count": r.contribution_count,
                "small_bags": r.small_bags,
                "large_bags": r.large_bags,
                "pounds": r.pounds,
                "photo_count": r.photo_count,
            }
            for r in rows
        ],
    }


@router.get("/{campaign_id}/users/{user_id}/contributions/range")
async def get_user_contributions_range(
    campaign_id: UUID,
    user_id: UUID,
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Individual contributions (with cleanup images/metrics) for one user in a campaign,
    scoped to an optional [start, end) submitted_at window. Powers the admin verification
    page used to visually confirm a leaderboard entry before a prize payout."""
    rows = (
        await db.execute(
            text("""
                SELECT
                    c.id::text,
                    c.submitted_at,
                    c.value,
                    c.notes,
                    c.location_verified,
                    cl.image_urls,
                    cl.metrics_small_bags,
                    cl.metrics_large_bags,
                    cl.metrics_pounds,
                    cl.status
                FROM contributions c
                LEFT JOIN cleanups cl ON cl.id = c.cleanup_id
                WHERE c.campaign_id = :cid
                  AND c.user_id = :uid
                  AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                ORDER BY c.submitted_at DESC
            """),
            {"cid": str(campaign_id), "uid": str(user_id), "start": start, "end": end},
        )
    ).fetchall()

    return [
        {
            "id": r.id,
            "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
            "value": r.value,
            "notes": r.notes,
            "location_verified": r.location_verified,
            "image_urls": r.image_urls or [],
            "metrics_small_bags": r.metrics_small_bags,
            "metrics_large_bags": r.metrics_large_bags,
            "metrics_pounds": r.metrics_pounds,
            "status": r.status,
        }
        for r in rows
    ]


@router.get("/{campaign_id}/dethrone-leaderboard")
async def get_dethrone_leaderboard(campaign_id: UUID, db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            text("""
                SELECT
                    notes                   AS account,
                    COUNT(*)::int           AS unfollow_count
                FROM contributions
                WHERE campaign_id = :cid
                  AND notes IS NOT NULL
                  AND notes != ''
                GROUP BY notes
                ORDER BY unfollow_count DESC
                LIMIT 20
            """),
            {"cid": str(campaign_id)},
        )
    ).fetchall()

    return [{"account": r.account, "count": r.unfollow_count} for r in rows]
