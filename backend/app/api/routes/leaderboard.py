from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db

router = APIRouter(prefix="/campaigns", tags=["leaderboard"])


@router.get("/{campaign_id}/leaderboard")
async def get_campaign_leaderboard(campaign_id: UUID, db: AsyncSession = Depends(get_db)):
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
