from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db

router = APIRouter(prefix="/campaigns", tags=["leaderboard"])

_GEO_STATS_INTERVALS = {"today": "day", "week": "week", "month": "month", "all": None}
_ZIP_UNIT_TYPES = ("zip", "uk_postcode_district")
_GEO_STATS_LEVELS = ("zip", "neighborhood", "borough")
_GEO_STATS_LEVEL_UNIT_TYPES = {"neighborhood": "nyc_neighborhood", "borough": "nyc_borough"}


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
                    c.user_id::text,
                    COALESCE(SUM(c.value), 0)::float             AS total_value,
                    COUNT(*)::int                                 AS contribution_count
                FROM contributions c
                WHERE c.campaign_id = :cid AND c.user_id IS NOT NULL
                GROUP BY c.user_id
                ORDER BY total_value DESC
                LIMIT 20
            """),
            {"cid": str(campaign_id)},
        )
    ).fetchall()

    # Bag/pound metrics live on the `cleanups` row, keyed by whichever of cleanup_id
    # (self-logged) or cleanup_event_id (organizer team-total split across attendees)
    # is set. A team-total event can have several attendee contribution rows pointing
    # at the same cleanup_event_id, so this dedupes to one event per user before
    # summing metrics — otherwise a split total gets multiplied by attendee count.
    user_bag_totals = {
        row.user_id: {"small_bags": row.small_bags, "large_bags": row.large_bags, "pounds": row.pounds}
        for row in (
            await db.execute(
                text("""
                    SELECT
                        dc.user_id::text,
                        COALESCE(SUM(cl.metrics_small_bags), 0)::int AS small_bags,
                        COALESCE(SUM(cl.metrics_large_bags), 0)::int AS large_bags,
                        COALESCE(SUM(cl.metrics_pounds), 0)::float   AS pounds
                    FROM (
                        SELECT DISTINCT user_id, COALESCE(cleanup_id, cleanup_event_id) AS cid
                        FROM contributions
                        WHERE campaign_id = :cid AND user_id IS NOT NULL
                          AND COALESCE(cleanup_id, cleanup_event_id) IS NOT NULL
                    ) dc
                    JOIN cleanups cl ON cl.id = dc.cid
                    GROUP BY dc.user_id
                """),
                {"cid": str(campaign_id)},
            )
        ).fetchall()
    }

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

    user_territory_types = {
        row.claimed_by_user: row.types
        for row in (
            await db.execute(
                text("""
                    SELECT tc.claimed_by_user::text, array_agg(DISTINCT gu.unit_type) AS types
                    FROM territory_claims tc
                    JOIN geo_units gu ON gu.id = tc.geo_unit_id
                    WHERE tc.campaign_id = :cid AND tc.claimed_by_user IS NOT NULL
                    GROUP BY tc.claimed_by_user
                """),
                {"cid": str(campaign_id)},
            )
        ).fetchall()
    }

    group_rows = (
        await db.execute(
            text("""
                SELECT
                    c.group_id::text,
                    g.name,
                    g.slug,
                    g.image_url AS logo_url,
                    COALESCE(SUM(c.value), 0)::float             AS total_value,
                    COUNT(*)::int                                 AS contribution_count
                FROM contributions c
                JOIN groups g ON g.id = c.group_id
                WHERE c.campaign_id = :cid AND c.group_id IS NOT NULL
                GROUP BY c.group_id, g.name, g.slug, g.image_url
                ORDER BY total_value DESC
                LIMIT 20
            """),
            {"cid": str(campaign_id)},
        )
    ).fetchall()

    group_bag_totals = {
        row.group_id: {"small_bags": row.small_bags, "large_bags": row.large_bags, "pounds": row.pounds}
        for row in (
            await db.execute(
                text("""
                    SELECT
                        dc.group_id::text,
                        COALESCE(SUM(cl.metrics_small_bags), 0)::int AS small_bags,
                        COALESCE(SUM(cl.metrics_large_bags), 0)::int AS large_bags,
                        COALESCE(SUM(cl.metrics_pounds), 0)::float   AS pounds
                    FROM (
                        SELECT DISTINCT group_id, COALESCE(cleanup_id, cleanup_event_id) AS cid
                        FROM contributions
                        WHERE campaign_id = :cid AND group_id IS NOT NULL
                          AND COALESCE(cleanup_id, cleanup_event_id) IS NOT NULL
                    ) dc
                    JOIN cleanups cl ON cl.id = dc.cid
                    GROUP BY dc.group_id
                """),
                {"cid": str(campaign_id)},
            )
        ).fetchall()
    }

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

    group_territory_types = {
        row.claimed_by_group: row.types
        for row in (
            await db.execute(
                text("""
                    SELECT tc.claimed_by_group::text, array_agg(DISTINCT gu.unit_type) AS types
                    FROM territory_claims tc
                    JOIN geo_units gu ON gu.id = tc.geo_unit_id
                    WHERE tc.campaign_id = :cid AND tc.claimed_by_group IS NOT NULL
                    GROUP BY tc.claimed_by_group
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
                "territory_types": user_territory_types.get(r.user_id, []),
                "small_bags": user_bag_totals.get(r.user_id, {}).get("small_bags", 0),
                "large_bags": user_bag_totals.get(r.user_id, {}).get("large_bags", 0),
                "pounds": user_bag_totals.get(r.user_id, {}).get("pounds", 0),
            }
            for r in user_rows
        ],
        "groups": [
            {
                "entity_id": r.group_id,
                "name": r.name,
                "slug": r.slug,
                "logo_url": r.logo_url,
                "total_value": r.total_value,
                "contribution_count": r.contribution_count,
                "tracts_claimed": group_tracts.get(r.group_id, 0),
                "territory_types": group_territory_types.get(r.group_id, []),
                "small_bags": group_bag_totals.get(r.group_id, {}).get("small_bags", 0),
                "large_bags": group_bag_totals.get(r.group_id, {}).get("large_bags", 0),
                "pounds": group_bag_totals.get(r.group_id, {}).get("pounds", 0),
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


def _interval_unit(interval: str) -> str | None:
    if interval not in _GEO_STATS_INTERVALS:
        raise HTTPException(400, f"Invalid interval: {interval}")
    return _GEO_STATS_INTERVALS[interval]


def _scope_filter(focus) -> tuple[str, dict]:
    if focus is None:
        return "", {}
    if focus.unit_type in _ZIP_UNIT_TYPES:
        return "AND c.geo_unit_id = :focus_id", {"focus_id": focus.id}
    return (
        """
            AND c.location IS NOT NULL
            AND ST_Contains((SELECT geometry FROM geo_units WHERE id = :focus_id), c.location::geometry)
        """,
        {"focus_id": focus.id},
    )


@router.get("/{campaign_id}/geo-stats")
async def get_campaign_geo_stats(
    campaign_id: UUID,
    interval: str = Query("all"),
    focus_geo_unit_id: UUID | None = Query(None),
    children_level: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Powers the Geo Stats explorer on the campaign Leaderboard page: an aggregate +
    top-individuals/top-groups breakdown for either the whole campaign or a single
    drilled-into geo unit (`focus_geo_unit_id`), plus an optional ranked list of child
    geo units (`children_level`) to drill further into.

    `zip`/`uk_postcode_district` units are scored directly via contributions.geo_unit_id
    (fast, exact). `neighborhood`/`borough` units are decorative overlays never assigned
    to contributions directly, so their totals are computed spatially via
    ST_Contains(unit.geometry, contribution.location) — contributions with no location
    point (route-only submissions) are excluded from neighborhood/borough aggregation.
    """
    interval_unit = _interval_unit(interval)
    if children_level is not None and children_level not in _GEO_STATS_LEVELS:
        raise HTTPException(400, f"Invalid children_level: {children_level}")

    start = None
    if interval_unit:
        start = (
            await db.execute(text("SELECT date_trunc(:unit, now()) AS start"), {"unit": interval_unit})
        ).fetchone().start

    focus = None
    if focus_geo_unit_id is not None:
        focus = (
            await db.execute(
                text("SELECT id::text, unit_type, unit_id, display_name FROM geo_units WHERE id = :id"),
                {"id": str(focus_geo_unit_id)},
            )
        ).fetchone()
        if not focus:
            raise HTTPException(404, f"Geo unit {focus_geo_unit_id} not found")

    scope_filter, scope_params = _scope_filter(focus)

    agg_row = (
        await db.execute(
            text(f"""
                SELECT
                    COALESCE(SUM(c.value), 0)::float AS total_value,
                    COUNT(*)::int                     AS contribution_count,
                    COUNT(DISTINCT c.user_id)::int     AS unique_contributors,
                    COUNT(DISTINCT c.group_id)::int    AS unique_groups
                FROM contributions c
                WHERE c.campaign_id = :cid
                  AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                  {scope_filter}
            """),
            {"cid": str(campaign_id), "start": start, **scope_params},
        )
    ).fetchone()

    # Bag/pound metrics scoped the same way as agg_row — see the dedup comment on
    # /leaderboard's user_bag_totals for why COALESCE(cleanup_id, cleanup_event_id) is
    # deduped before joining cleanups (a team-split event has one contribution row per
    # attendee, all pointing at the same cleanup_event_id).
    bag_row = (
        await db.execute(
            text(f"""
                SELECT
                    COALESCE(SUM(cl.metrics_small_bags), 0)::int AS small_bags,
                    COALESCE(SUM(cl.metrics_large_bags), 0)::int AS large_bags,
                    COALESCE(SUM(cl.metrics_pounds), 0)::float   AS pounds
                FROM (
                    SELECT DISTINCT COALESCE(c.cleanup_id, c.cleanup_event_id) AS cid
                    FROM contributions c
                    WHERE c.campaign_id = :cid
                      AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                      AND COALESCE(c.cleanup_id, c.cleanup_event_id) IS NOT NULL
                      {scope_filter}
                ) dc
                JOIN cleanups cl ON cl.id = dc.cid
            """),
            {"cid": str(campaign_id), "start": start, **scope_params},
        )
    ).fetchone()

    top_users = (
        await db.execute(
            text(f"""
                SELECT c.user_id::text, p.username, p.display_name, p.avatar_url,
                       COALESCE(SUM(c.value), 0)::float AS total_value,
                       COUNT(*)::int                     AS contribution_count
                FROM contributions c
                LEFT JOIN profiles p ON p.id = c.user_id
                WHERE c.campaign_id = :cid AND c.user_id IS NOT NULL
                  AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                  {scope_filter}
                GROUP BY c.user_id, p.username, p.display_name, p.avatar_url
                ORDER BY total_value DESC, contribution_count DESC
                LIMIT 10
            """),
            {"cid": str(campaign_id), "start": start, **scope_params},
        )
    ).fetchall()

    user_bag_totals = {
        row.user_id: {"small_bags": row.small_bags, "large_bags": row.large_bags, "pounds": row.pounds}
        for row in (
            await db.execute(
                text(f"""
                    SELECT
                        dc.user_id::text,
                        COALESCE(SUM(cl.metrics_small_bags), 0)::int AS small_bags,
                        COALESCE(SUM(cl.metrics_large_bags), 0)::int AS large_bags,
                        COALESCE(SUM(cl.metrics_pounds), 0)::float   AS pounds
                    FROM (
                        SELECT DISTINCT c.user_id, COALESCE(c.cleanup_id, c.cleanup_event_id) AS cid
                        FROM contributions c
                        WHERE c.campaign_id = :cid AND c.user_id IS NOT NULL
                          AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                          AND COALESCE(c.cleanup_id, c.cleanup_event_id) IS NOT NULL
                          {scope_filter}
                    ) dc
                    JOIN cleanups cl ON cl.id = dc.cid
                    GROUP BY dc.user_id
                """),
                {"cid": str(campaign_id), "start": start, **scope_params},
            )
        ).fetchall()
    }

    top_groups = (
        await db.execute(
            text(f"""
                SELECT c.group_id::text, g.name,
                       COALESCE(SUM(c.value), 0)::float AS total_value,
                       COUNT(*)::int                     AS contribution_count
                FROM contributions c
                LEFT JOIN groups g ON g.id = c.group_id
                WHERE c.campaign_id = :cid AND c.group_id IS NOT NULL
                  AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                  {scope_filter}
                GROUP BY c.group_id, g.name
                ORDER BY total_value DESC, contribution_count DESC
                LIMIT 10
            """),
            {"cid": str(campaign_id), "start": start, **scope_params},
        )
    ).fetchall()

    group_bag_totals = {
        row.group_id: {"small_bags": row.small_bags, "large_bags": row.large_bags, "pounds": row.pounds}
        for row in (
            await db.execute(
                text(f"""
                    SELECT
                        dc.group_id::text,
                        COALESCE(SUM(cl.metrics_small_bags), 0)::int AS small_bags,
                        COALESCE(SUM(cl.metrics_large_bags), 0)::int AS large_bags,
                        COALESCE(SUM(cl.metrics_pounds), 0)::float   AS pounds
                    FROM (
                        SELECT DISTINCT c.group_id, COALESCE(c.cleanup_id, c.cleanup_event_id) AS cid
                        FROM contributions c
                        WHERE c.campaign_id = :cid AND c.group_id IS NOT NULL
                          AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                          AND COALESCE(c.cleanup_id, c.cleanup_event_id) IS NOT NULL
                          {scope_filter}
                    ) dc
                    JOIN cleanups cl ON cl.id = dc.cid
                    GROUP BY dc.group_id
                """),
                {"cid": str(campaign_id), "start": start, **scope_params},
            )
        ).fetchall()
    }

    children = None
    child_bag_totals: dict[str, dict] = {}
    if children_level == "zip":
        children = (
            await db.execute(
                text("""
                    SELECT gu.id::text, gu.unit_type, gu.unit_id, gu.display_name,
                           COALESCE(SUM(c.value), 0)::float AS total_value,
                           COUNT(c.id)::int                  AS contribution_count,
                           COUNT(DISTINCT c.user_id)::int     AS unique_contributors,
                           COUNT(DISTINCT c.group_id)::int    AS unique_groups
                    FROM geo_units gu
                    JOIN contributions c ON c.geo_unit_id = gu.id AND c.campaign_id = :cid
                      AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                    WHERE gu.unit_type = ANY(:zip_types)
                      AND (
                        CAST(:focus_id AS uuid) IS NULL
                        OR ST_Contains((SELECT geometry FROM geo_units WHERE id = CAST(:focus_id AS uuid)), ST_Centroid(gu.geometry))
                      )
                    GROUP BY gu.id
                    ORDER BY total_value DESC, contribution_count DESC, gu.id
                    LIMIT 50
                """),
                {
                    "cid": str(campaign_id),
                    "start": start,
                    "zip_types": list(_ZIP_UNIT_TYPES),
                    "focus_id": focus.id if focus else None,
                },
            )
        ).fetchall()
        child_bag_totals = {
            row.geo_unit_id: {"small_bags": row.small_bags, "large_bags": row.large_bags, "pounds": row.pounds}
            for row in (
                await db.execute(
                    text("""
                        SELECT
                            dc.geo_unit_id::text,
                            COALESCE(SUM(cl.metrics_small_bags), 0)::int AS small_bags,
                            COALESCE(SUM(cl.metrics_large_bags), 0)::int AS large_bags,
                            COALESCE(SUM(cl.metrics_pounds), 0)::float   AS pounds
                        FROM (
                            SELECT DISTINCT c.geo_unit_id, COALESCE(c.cleanup_id, c.cleanup_event_id) AS cid
                            FROM contributions c
                            JOIN geo_units gu ON gu.id = c.geo_unit_id
                            WHERE c.campaign_id = :cid
                              AND gu.unit_type = ANY(:zip_types)
                              AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                              AND COALESCE(c.cleanup_id, c.cleanup_event_id) IS NOT NULL
                              AND (
                                CAST(:focus_id AS uuid) IS NULL
                                OR ST_Contains((SELECT geometry FROM geo_units WHERE id = CAST(:focus_id AS uuid)), ST_Centroid(gu.geometry))
                              )
                        ) dc
                        JOIN cleanups cl ON cl.id = dc.cid
                        GROUP BY dc.geo_unit_id
                    """),
                    {
                        "cid": str(campaign_id),
                        "start": start,
                        "zip_types": list(_ZIP_UNIT_TYPES),
                        "focus_id": focus.id if focus else None,
                    },
                )
            ).fetchall()
        }
    elif children_level in ("neighborhood", "borough"):
        children = (
            await db.execute(
                text("""
                    SELECT gu.id::text, gu.unit_type, gu.unit_id, gu.display_name,
                           COALESCE(SUM(c.value), 0)::float AS total_value,
                           COUNT(c.id)::int                  AS contribution_count,
                           COUNT(DISTINCT c.user_id)::int     AS unique_contributors,
                           COUNT(DISTINCT c.group_id)::int    AS unique_groups
                    FROM geo_units gu
                    LEFT JOIN contributions c ON c.campaign_id = :cid
                      AND c.location IS NOT NULL
                      AND ST_Contains(gu.geometry, c.location::geometry)
                      AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                    WHERE gu.unit_type = :level
                      AND (
                        CAST(:focus_id AS uuid) IS NULL
                        OR ST_Contains((SELECT geometry FROM geo_units WHERE id = CAST(:focus_id AS uuid)), ST_Centroid(gu.geometry))
                      )
                    GROUP BY gu.id
                    ORDER BY total_value DESC, contribution_count DESC, gu.id
                    LIMIT 50
                """),
                {
                    "cid": str(campaign_id),
                    "start": start,
                    "level": _GEO_STATS_LEVEL_UNIT_TYPES[children_level],
                    "focus_id": focus.id if focus else None,
                },
            )
        ).fetchall()
        child_bag_totals = {
            row.geo_unit_id: {"small_bags": row.small_bags, "large_bags": row.large_bags, "pounds": row.pounds}
            for row in (
                await db.execute(
                    text("""
                        WITH dc AS (
                            SELECT DISTINCT gu.id AS geo_unit_id, COALESCE(c.cleanup_id, c.cleanup_event_id) AS cid
                            FROM geo_units gu
                            JOIN contributions c ON c.campaign_id = :cid
                              AND c.location IS NOT NULL
                              AND ST_Contains(gu.geometry, c.location::geometry)
                              AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                            WHERE gu.unit_type = :level
                              AND COALESCE(c.cleanup_id, c.cleanup_event_id) IS NOT NULL
                              AND (
                                CAST(:focus_id AS uuid) IS NULL
                                OR ST_Contains((SELECT geometry FROM geo_units WHERE id = CAST(:focus_id AS uuid)), ST_Centroid(gu.geometry))
                              )
                        )
                        SELECT
                            dc.geo_unit_id::text,
                            COALESCE(SUM(cl.metrics_small_bags), 0)::int AS small_bags,
                            COALESCE(SUM(cl.metrics_large_bags), 0)::int AS large_bags,
                            COALESCE(SUM(cl.metrics_pounds), 0)::float   AS pounds
                        FROM dc
                        JOIN cleanups cl ON cl.id = dc.cid
                        GROUP BY dc.geo_unit_id
                    """),
                    {
                        "cid": str(campaign_id),
                        "start": start,
                        "level": _GEO_STATS_LEVEL_UNIT_TYPES[children_level],
                        "focus_id": focus.id if focus else None,
                    },
                )
            ).fetchall()
        }

    return {
        "interval": interval,
        "focus": (
            {
                "geo_unit_id": focus.id,
                "unit_type": focus.unit_type,
                "unit_id": focus.unit_id,
                "display_name": focus.display_name,
            }
            if focus
            else None
        ),
        "aggregate": {
            "total_value": agg_row.total_value,
            "contribution_count": agg_row.contribution_count,
            "unique_contributors": agg_row.unique_contributors,
            "unique_groups": agg_row.unique_groups,
            "small_bags": bag_row.small_bags,
            "large_bags": bag_row.large_bags,
            "pounds": bag_row.pounds,
        },
        "top_users": [
            {
                "user_id": r.user_id,
                "username": r.username,
                "display_name": r.display_name,
                "avatar_url": r.avatar_url,
                "total_value": r.total_value,
                "contribution_count": r.contribution_count,
                "small_bags": user_bag_totals.get(r.user_id, {}).get("small_bags", 0),
                "large_bags": user_bag_totals.get(r.user_id, {}).get("large_bags", 0),
                "pounds": user_bag_totals.get(r.user_id, {}).get("pounds", 0),
            }
            for r in top_users
        ],
        "top_groups": [
            {
                "group_id": r.group_id,
                "name": r.name,
                "total_value": r.total_value,
                "contribution_count": r.contribution_count,
                "small_bags": group_bag_totals.get(r.group_id, {}).get("small_bags", 0),
                "large_bags": group_bag_totals.get(r.group_id, {}).get("large_bags", 0),
                "pounds": group_bag_totals.get(r.group_id, {}).get("pounds", 0),
            }
            for r in top_groups
        ],
        "children": (
            [
                {
                    "geo_unit_id": r.id,
                    "unit_type": r.unit_type,
                    "unit_id": r.unit_id,
                    "display_name": r.display_name,
                    "total_value": r.total_value,
                    "contribution_count": r.contribution_count,
                    "unique_contributors": r.unique_contributors,
                    "unique_groups": r.unique_groups,
                    "small_bags": child_bag_totals.get(r.id, {}).get("small_bags", 0),
                    "large_bags": child_bag_totals.get(r.id, {}).get("large_bags", 0),
                    "pounds": child_bag_totals.get(r.id, {}).get("pounds", 0),
                }
                for r in children
            ]
            if children is not None
            else None
        ),
    }


@router.get("/{campaign_id}/geo-stats/trend")
async def get_campaign_geo_stats_trend(
    campaign_id: UUID,
    interval: str = Query("month"),
    focus_geo_unit_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Points trend, scoped the same way as geo-stats' `interval`/`focus_geo_unit_id` —
    powers the "pts" stat card's trend timeline visualization. Buckets hourly for
    `today` (a single day of daily buckets isn't a useful timeline) and daily
    otherwise; `all` spans back to the campaign's first contribution.
    """
    interval_unit = _interval_unit(interval)
    bucket_unit = "hour" if interval == "today" else "day"

    focus = None
    if focus_geo_unit_id is not None:
        focus = (
            await db.execute(
                text("SELECT id::text, unit_type FROM geo_units WHERE id = :id"),
                {"id": str(focus_geo_unit_id)},
            )
        ).fetchone()
        if not focus:
            raise HTTPException(404, f"Geo unit {focus_geo_unit_id} not found")

    start = None
    if interval_unit:
        start = (
            await db.execute(text("SELECT date_trunc(:unit, now()) AS start"), {"unit": interval_unit})
        ).fetchone().start
    else:
        start = (
            await db.execute(
                text("SELECT MIN(date_trunc('day', submitted_at)) AS start FROM contributions WHERE campaign_id = :cid"),
                {"cid": str(campaign_id)},
            )
        ).fetchone().start

    scope_filter, scope_params = _scope_filter(focus)

    rows = (
        await db.execute(
            text(f"""
                SELECT date_trunc(:bucket_unit, c.submitted_at) AS bucket,
                       COALESCE(SUM(c.value), 0)::float AS total_value
                FROM contributions c
                WHERE c.campaign_id = :cid
                  AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                  {scope_filter}
                GROUP BY bucket
                ORDER BY bucket
            """),
            {"cid": str(campaign_id), "bucket_unit": bucket_unit, "start": start, **scope_params},
        )
    ).fetchall()

    return {
        "granularity": bucket_unit,
        "range_start": start.isoformat() if start else None,
        "buckets": [{"date": r.bucket.isoformat(), "total_value": r.total_value} for r in rows],
    }


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
