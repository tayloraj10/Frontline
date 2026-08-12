import csv
import io
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.cleanup_events import CLEANUP_EVENT_GRACE_MINUTES_AFTER_FALLBACK
from app.api.routes.leaderboard import _GEO_STATS_LEVEL_UNIT_TYPES, _GEO_STATS_LEVELS, _ZIP_UNIT_TYPES, _scope_filter
from app.api.routes.upload import delete_r2_object
from app.db.database import get_db
from app.services.game_settings import get_game_settings
from app.services.stats_window import resolve_stats_window, trend_bucket_unit

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
            text("SELECT id, name, image_url, status FROM groups WHERE id = :id"),
            {"id": str(group_id)},
        )
    ).fetchone()
    if not group_row:
        raise HTTPException(404, f"No group found for id={group_id}")

    # A pending/rejected application has no group_members yet, so the usual
    # "site admin who is also a group admin" bar can never be cleared for it --
    # a site admin alone may delete those. Live (approved) groups still need both.
    is_authorized = await _is_site_admin(db, payload.requesting_user_id) and (
        group_row.status != "approved"
        or await _is_group_admin(db, group_id, payload.requesting_user_id)
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


async def _compute_group_stats(
    db: AsyncSession,
    group_id: UUID,
    interval: str,
    campaign_id: UUID | None,
    viewer_user_id: UUID | None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    """
    Deep-dive stats for a group's own page: aggregate + per-member contribution
    breakdown, one block per campaign the group has contributed to. Never blended
    across campaigns -- points/bags/pounds aren't comparable units, so a group
    active in two campaigns gets two separate blocks rather than one summed total.
    """
    group_row = (
        await db.execute(text("SELECT id FROM groups WHERE id = :id"), {"id": str(group_id)})
    ).fetchone()
    if not group_row:
        raise HTTPException(404, f"No group found for id={group_id}")

    is_member = False
    is_admin = False
    if viewer_user_id is not None:
        member_row = (
            await db.execute(
                text("SELECT role FROM group_members WHERE group_id = :gid AND user_id = :uid"),
                {"gid": str(group_id), "uid": str(viewer_user_id)},
            )
        ).fetchone()
        is_member = member_row is not None
        is_admin = bool(member_row and member_row.role == "admin")

    start, end = await resolve_stats_window(db, interval, start_date, end_date)

    campaign_filter = "AND c.campaign_id = :campaign_id" if campaign_id else ""
    list_params = {"gid": str(group_id), "start": start, "end": end}
    if campaign_id:
        list_params["campaign_id"] = str(campaign_id)

    campaign_rows = (
        await db.execute(
            text(f"""
                SELECT DISTINCT c.campaign_id::text, cam.title, cam.slug
                FROM contributions c
                JOIN campaigns cam ON cam.id = c.campaign_id
                WHERE c.group_id = :gid
                  AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                  {campaign_filter}
                ORDER BY cam.title
            """),
            list_params,
        )
    ).fetchall()

    campaigns = []
    for crow in campaign_rows:
        cparams = {"gid": str(group_id), "start": start, "end": end, "cid": crow.campaign_id}

        agg = (
            await db.execute(
                text("""
                    SELECT COALESCE(SUM(c.value), 0)::float AS total_value,
                           COUNT(*)::int                     AS contribution_count,
                           COUNT(DISTINCT c.user_id)::int     AS unique_contributors
                    FROM contributions c
                    WHERE c.group_id = :gid AND c.campaign_id = :cid
                      AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                      AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                """),
                cparams,
            )
        ).fetchone()

        # Dedup before joining cleanups, same as leaderboard.py's /geo-stats -- a
        # team-split event has one contribution row per attendee, all pointing at
        # the same cleanup_event_id, and summing metrics per-row would overcount.
        bag = (
            await db.execute(
                text("""
                    SELECT COALESCE(SUM(cl.metrics_small_bags), 0)::int AS small_bags,
                           COALESCE(SUM(cl.metrics_large_bags), 0)::int AS large_bags,
                           COALESCE(SUM(cl.metrics_pounds), 0)::float   AS pounds
                    FROM (
                        SELECT DISTINCT COALESCE(c.cleanup_id, c.cleanup_event_id) AS cid
                        FROM contributions c
                        WHERE c.group_id = :gid AND c.campaign_id = :cid
                          AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                          AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                          AND COALESCE(c.cleanup_id, c.cleanup_event_id) IS NOT NULL
                    ) dc
                    JOIN cleanups cl ON cl.id = dc.cid
                """),
                cparams,
            )
        ).fetchone()

        member_rows = (
            await db.execute(
                text("""
                    SELECT c.user_id::text, p.username, p.display_name, p.avatar_url,
                           COALESCE(SUM(c.value), 0)::float AS total_value,
                           COUNT(*)::int                     AS contribution_count
                    FROM contributions c
                    LEFT JOIN profiles p ON p.id = c.user_id
                    WHERE c.group_id = :gid AND c.campaign_id = :cid AND c.user_id IS NOT NULL
                      AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                      AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                    GROUP BY c.user_id, p.username, p.display_name, p.avatar_url
                    ORDER BY total_value DESC, contribution_count DESC
                """),
                cparams,
            )
        ).fetchall()

        member_bags = {
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
                            SELECT DISTINCT c.user_id, COALESCE(c.cleanup_id, c.cleanup_event_id) AS cid
                            FROM contributions c
                            WHERE c.group_id = :gid AND c.campaign_id = :cid AND c.user_id IS NOT NULL
                              AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                              AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                              AND COALESCE(c.cleanup_id, c.cleanup_event_id) IS NOT NULL
                        ) dc
                        JOIN cleanups cl ON cl.id = dc.cid
                        GROUP BY dc.user_id
                    """),
                    cparams,
                )
            ).fetchall()
        }

        campaigns.append({
            "campaign_id": crow.campaign_id,
            "campaign_name": crow.title,
            "campaign_slug": crow.slug,
            "aggregate": {
                "total_value": agg.total_value,
                "contribution_count": agg.contribution_count,
                "unique_contributors": agg.unique_contributors,
                "small_bags": bag.small_bags,
                "large_bags": bag.large_bags,
                "pounds": bag.pounds,
            },
            "members": [
                {
                    "user_id": r.user_id,
                    "username": r.username,
                    "display_name": r.display_name,
                    "avatar_url": r.avatar_url,
                    "total_value": r.total_value,
                    "contribution_count": r.contribution_count,
                    "small_bags": member_bags.get(r.user_id, {}).get("small_bags", 0),
                    "large_bags": member_bags.get(r.user_id, {}).get("large_bags", 0),
                    "pounds": member_bags.get(r.user_id, {}).get("pounds", 0),
                }
                for r in member_rows
            ],
        })

    return {
        "group_id": str(group_id),
        "interval": interval,
        "is_member": is_member,
        "is_admin": is_admin,
        "campaigns": campaigns,
    }


async def _group_contribution_points(
    db: AsyncSession,
    group_id: UUID,
    interval: str,
    campaign_id: UUID | None,
    user_id: UUID | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict]:
    """
    Deduped lat/lng points for a group's contributions, for the map-snapshot share
    feature and the admin deep-dive map. Team-split events (multiple contribution
    rows sharing one cleanup_id/cleanup_event_id) collapse to a single point, same
    dedup pattern as the bag/pound aggregates in _compute_group_stats.
    """
    start, end = await resolve_stats_window(db, interval, start_date, end_date)

    campaign_filter = "AND c.campaign_id = :campaign_id" if campaign_id else ""
    user_filter = "AND c.user_id = :user_id" if user_id else ""
    params = {"gid": str(group_id), "start": start, "end": end}
    if campaign_id:
        params["campaign_id"] = str(campaign_id)
    if user_id:
        params["user_id"] = str(user_id)

    rows = (
        await db.execute(
            text(f"""
                SELECT ST_Y(pts.location::geometry) AS latitude, ST_X(pts.location::geometry) AS longitude,
                       pts.geo_unit_id::text AS geo_unit_id
                FROM (
                    SELECT DISTINCT ON (COALESCE(c.cleanup_id::text, c.cleanup_event_id::text, c.id::text))
                        c.location, c.geo_unit_id
                    FROM contributions c
                    WHERE c.group_id = :gid AND c.location IS NOT NULL
                      AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                      AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                      {campaign_filter}
                      {user_filter}
                ) pts
            """),
            params,
        )
    ).fetchall()

    return [{"latitude": r.latitude, "longitude": r.longitude, "geo_unit_id": r.geo_unit_id} for r in rows]


async def _group_geo_children(
    db: AsyncSession,
    group_id: UUID,
    children_level: str,
    campaign_filter: str,
    base_params: dict,
    focus,
) -> list[dict]:
    """Zip or neighborhood/borough breakdown for a group, including each unit's centroid
    so callers can place a static label without a separate geometry lookup."""
    if children_level == "zip":
        rows = (
            await db.execute(
                text(f"""
                    SELECT gu.id::text, gu.unit_type, gu.unit_id, gu.display_name,
                           ST_Y(ST_Centroid(gu.geometry)) AS centroid_lat,
                           ST_X(ST_Centroid(gu.geometry)) AS centroid_lng,
                           COALESCE(SUM(c.value), 0)::float AS total_value,
                           COUNT(c.id)::int                  AS contribution_count,
                           COUNT(DISTINCT c.user_id)::int     AS unique_contributors
                    FROM geo_units gu
                    JOIN contributions c ON c.geo_unit_id = gu.id AND c.group_id = :gid
                      AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                      AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                      {campaign_filter}
                    WHERE gu.unit_type = ANY(:zip_types)
                      AND (
                        CAST(:focus_id AS uuid) IS NULL
                        OR ST_Contains((SELECT geometry FROM geo_units WHERE id = CAST(:focus_id AS uuid)), ST_Centroid(gu.geometry))
                      )
                    GROUP BY gu.id
                    ORDER BY total_value DESC, contribution_count DESC, gu.id
                    LIMIT 50
                """),
                {**base_params, "zip_types": list(_ZIP_UNIT_TYPES), "focus_id": focus.id if focus else None},
            )
        ).fetchall()
    elif children_level in ("neighborhood", "borough"):
        rows = (
            await db.execute(
                text(f"""
                    SELECT gu.id::text, gu.unit_type, gu.unit_id, gu.display_name,
                           ST_Y(ST_Centroid(gu.geometry)) AS centroid_lat,
                           ST_X(ST_Centroid(gu.geometry)) AS centroid_lng,
                           COALESCE(SUM(c.value), 0)::float AS total_value,
                           COUNT(c.id)::int                  AS contribution_count,
                           COUNT(DISTINCT c.user_id)::int     AS unique_contributors
                    FROM geo_units gu
                    LEFT JOIN contributions c ON c.group_id = :gid
                      AND c.location IS NOT NULL
                      AND ST_Contains(gu.geometry, c.location::geometry)
                      AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                      AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                      {campaign_filter}
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
                    **base_params,
                    "level": _GEO_STATS_LEVEL_UNIT_TYPES[children_level],
                    "focus_id": focus.id if focus else None,
                },
            )
        ).fetchall()
    else:
        raise HTTPException(400, f"Invalid children_level: {children_level}")

    return [
        {
            "geo_unit_id": r.id,
            "unit_type": r.unit_type,
            "unit_id": r.unit_id,
            "display_name": r.display_name,
            "centroid_lat": r.centroid_lat,
            "centroid_lng": r.centroid_lng,
            "total_value": r.total_value,
            "contribution_count": r.contribution_count,
            "unique_contributors": r.unique_contributors,
        }
        for r in rows
    ]


@router.get("/{group_id}/stats/geo-points")
async def get_group_geo_points(
    group_id: UUID,
    interval: str = Query("all"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    campaign_id: UUID | None = Query(None),
    user_id: UUID | None = Query(None),
    viewer_user_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Deduped contribution coordinates for a group -- powers the map-snapshot share card and the admin deep-dive map."""
    points = await _group_contribution_points(db, group_id, interval, campaign_id, user_id, start_date, end_date)
    return {"points": points}


@router.get("/{group_id}/stats/geo-breakdown")
async def get_group_geo_breakdown(
    group_id: UUID,
    interval: str = Query("all"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    campaign_id: UUID | None = Query(None),
    level: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Unfocused zip/neighborhood/borough breakdown with centroids, open to any member --
    powers the map-snapshot's choropleth mode options. No admin gate, mirrors geo-points."""
    if level not in _GEO_STATS_LEVELS:
        raise HTTPException(400, f"Invalid level: {level}")

    start, end = await resolve_stats_window(db, interval, start_date, end_date)

    campaign_filter = "AND c.campaign_id = :cid" if campaign_id else ""
    base_params = {"gid": str(group_id), "start": start, "end": end}
    if campaign_id:
        base_params["cid"] = str(campaign_id)

    children = await _group_geo_children(db, group_id, level, campaign_filter, base_params, None)
    return {"children": children}


_TYPE_LABELS = {"event": "Cleanup Events", "individual_log": "Individual Logs", "manual": "Manual Adjustments"}


@router.get("/{group_id}/stats/type-breakdown")
async def get_group_type_breakdown(
    group_id: UUID,
    interval: str = Query("all"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    campaign_id: UUID | None = Query(None),
    viewer_user_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Breakdown of a group's points by contribution type (cleanup event vs. individual
    log vs. manual adjustment) -- powers the admin deep-dive page's "By Type" slice."""
    if not await _is_group_admin(db, group_id, viewer_user_id):
        raise HTTPException(403, "Only a group admin can view this group's type breakdown.")

    start, end = await resolve_stats_window(db, interval, start_date, end_date)

    campaign_filter = "AND c.campaign_id = :cid" if campaign_id else ""
    base_params = {"gid": str(group_id), "start": start, "end": end}
    if campaign_id:
        base_params["cid"] = str(campaign_id)

    rows = (
        await db.execute(
            text(f"""
                SELECT
                    CASE
                        WHEN c.cleanup_event_id IS NOT NULL THEN 'event'
                        WHEN c.cleanup_id IS NOT NULL THEN 'individual_log'
                        ELSE 'manual'
                    END AS type_key,
                    COALESCE(SUM(c.value), 0)::float AS total_value
                FROM contributions c
                WHERE c.group_id = :gid
                  AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                  {campaign_filter}
                GROUP BY type_key
            """),
            base_params,
        )
    ).fetchall()

    children = [
        {"key": r.type_key, "label": _TYPE_LABELS.get(r.type_key, r.type_key), "total_value": r.total_value}
        for r in rows
        if r.total_value > 0
    ]
    return {"children": children}


@router.get("/{group_id}/stats/geo-stats")
async def get_group_geo_stats(
    group_id: UUID,
    interval: str = Query("all"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    campaign_id: UUID | None = Query(None),
    focus_geo_unit_id: UUID | None = Query(None),
    children_level: str | None = Query(None),
    viewer_user_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Group-scoped equivalent of campaigns/{id}/geo-stats -- powers the admin deep-dive
    page's borough/neighborhood/zip choropleth drilldown, restricted to this group's own
    contributions. Same _scope_filter/children_level mechanics as the campaign version,
    with `c.group_id = :gid` added as a mandatory extra predicate everywhere. Admin-only.
    """
    if not await _is_group_admin(db, group_id, viewer_user_id):
        raise HTTPException(403, "Only a group admin can view this group's geo stats.")
    if children_level is not None and children_level not in _GEO_STATS_LEVELS:
        raise HTTPException(400, f"Invalid children_level: {children_level}")

    start, end = await resolve_stats_window(db, interval, start_date, end_date)

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
    campaign_filter = "AND c.campaign_id = :cid" if campaign_id else ""
    base_params = {"gid": str(group_id), "start": start, "end": end, **scope_params}
    if campaign_id:
        base_params["cid"] = str(campaign_id)

    agg_row = (
        await db.execute(
            text(f"""
                SELECT
                    COALESCE(SUM(c.value), 0)::float AS total_value,
                    COUNT(*)::int                     AS contribution_count,
                    COUNT(DISTINCT c.user_id)::int     AS unique_contributors
                FROM contributions c
                WHERE c.group_id = :gid
                  AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                  {campaign_filter}
                  {scope_filter}
            """),
            base_params,
        )
    ).fetchone()

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
                    WHERE c.group_id = :gid
                      AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                      AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                      AND COALESCE(c.cleanup_id, c.cleanup_event_id) IS NOT NULL
                      {campaign_filter}
                      {scope_filter}
                ) dc
                JOIN cleanups cl ON cl.id = dc.cid
            """),
            base_params,
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
                WHERE c.group_id = :gid AND c.user_id IS NOT NULL
                  AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                  {campaign_filter}
                  {scope_filter}
                GROUP BY c.user_id, p.username, p.display_name, p.avatar_url
                ORDER BY total_value DESC, contribution_count DESC
                LIMIT 10
            """),
            base_params,
        )
    ).fetchall()

    children = None
    if children_level is not None:
        children = await _group_geo_children(
            db, group_id, children_level, campaign_filter, base_params, focus
        )

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
            }
            for r in top_users
        ],
        "children": children,
    }


@router.get("/{group_id}/stats/geo-stats/trend")
async def get_group_geo_stats_trend(
    group_id: UUID,
    interval: str = Query("month"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    campaign_id: UUID | None = Query(None),
    focus_geo_unit_id: UUID | None = Query(None),
    viewer_user_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Points trend for a group's geo-stats drilldown, scoped the same way as get_group_geo_stats. Admin-only."""
    if not await _is_group_admin(db, group_id, viewer_user_id):
        raise HTTPException(403, "Only a group admin can view this group's geo stats trend.")

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

    campaign_filter = "AND c.campaign_id = :cid" if campaign_id else ""
    base_params = {"gid": str(group_id)}
    if campaign_id:
        base_params["cid"] = str(campaign_id)

    start, end = await resolve_stats_window(db, interval, start_date, end_date)
    if start is None:
        start = (
            await db.execute(
                text(f"""
                    SELECT MIN(date_trunc('day', c.submitted_at)) AS start
                    FROM contributions c WHERE c.group_id = :gid {campaign_filter}
                """),
                base_params,
            )
        ).fetchone().start

    bucket_unit = trend_bucket_unit(start, end)
    scope_filter, scope_params = _scope_filter(focus)

    rows = (
        await db.execute(
            text(f"""
                SELECT date_trunc(:bucket_unit, c.submitted_at) AS bucket,
                       COALESCE(SUM(c.value), 0)::float AS total_value
                FROM contributions c
                WHERE c.group_id = :gid
                  AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                  {campaign_filter}
                  {scope_filter}
                GROUP BY bucket
                ORDER BY bucket
            """),
            {**base_params, "bucket_unit": bucket_unit, "start": start, "end": end, **scope_params},
        )
    ).fetchall()

    return {
        "granularity": bucket_unit,
        "range_start": start.isoformat() if start else None,
        "buckets": [{"date": r.bucket.isoformat(), "total_value": r.total_value} for r in rows],
    }


async def _group_stats_events_rows(
    db: AsyncSession,
    group_id: UUID,
    interval: str,
    campaign_id: UUID | None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict]:
    """Hosted/co-hosted cleanup events for a group within the selected time range. Mirrors
    cleanup_events.py's GET /group/{group_id} shape but scoped to `interval` (against
    scheduled_start) and optionally `campaign_id`."""
    start, end = await resolve_stats_window(db, interval, start_date, end_date)

    campaign_filter = "AND c.campaign_id = :cid" if campaign_id else ""
    params = {"group_id": str(group_id), "start": start, "end": end}
    if campaign_id:
        params["cid"] = str(campaign_id)

    settings = await get_game_settings(db)
    grace_after = settings.get("cleanup_event_grace_minutes_after", CLEANUP_EVENT_GRACE_MINUTES_AFTER_FALLBACK)
    params["grace_after"] = grace_after

    rows = (
        await db.execute(
            text(f"""
                SELECT c.id, c.title, c.description, c.scheduled_start, c.scheduled_end,
                       c.status, c.image_urls, c.max_attendees,
                       ST_Y(c.location::geometry) AS latitude, ST_X(c.location::geometry) AS longitude,
                       (COALESCE(c.scheduled_end, c.scheduled_start) IS NOT NULL
                            AND COALESCE(c.scheduled_end, c.scheduled_start) < NOW()) AS is_past,
                       (c.scheduled_start IS NOT NULL
                            AND c.scheduled_start < NOW()
                            AND COALESCE(c.scheduled_end, c.scheduled_start)
                                + (:grace_after * INTERVAL '1 minute') >= NOW()) AS is_ongoing,
                       (SELECT COUNT(*) FROM cleanup_rsvps r WHERE r.cleanup_id = c.id AND r.status = 'going') AS going_count,
                       (c.group_id != :group_id) AS is_cohosted
                FROM cleanups c
                WHERE (c.group_id = :group_id
                       OR EXISTS (SELECT 1 FROM cleanup_event_cohosts h WHERE h.cleanup_id = c.id AND h.group_id = :group_id))
                  AND c.is_group_event = true
                  AND c.location IS NOT NULL
                  AND (CAST(:start AS timestamptz) IS NULL OR c.scheduled_start >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR c.scheduled_start < :end)
                  {campaign_filter}
                ORDER BY c.scheduled_start ASC NULLS LAST
            """),
            params,
        )
    ).fetchall()

    return [
        {
            "id": str(r.id),
            "title": r.title,
            "description": r.description,
            "scheduled_start": r.scheduled_start.isoformat() if r.scheduled_start else None,
            "scheduled_end": r.scheduled_end.isoformat() if r.scheduled_end else None,
            "status": r.status,
            "image_url": r.image_urls[0] if r.image_urls else None,
            "lat": r.latitude,
            "lng": r.longitude,
            "max_attendees": r.max_attendees,
            "going_count": r.going_count,
            "is_past": r.is_past,
            "is_ongoing": r.is_ongoing,
            "is_cohosted": r.is_cohosted,
        }
        for r in rows
    ]


@router.get("/{group_id}/stats/events")
async def get_group_stats_events(
    group_id: UUID,
    interval: str = Query("all"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    campaign_id: UUID | None = Query(None),
    viewer_user_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Feeds the admin deep-dive page's summary events/cleanups map. Admin-only, unlike the
    public group-page version, since it's paired with the rest of the admin stats surface.
    """
    if not await _is_group_admin(db, group_id, viewer_user_id):
        raise HTTPException(403, "Only a group admin can view this group's event stats.")
    return await _group_stats_events_rows(db, group_id, interval, campaign_id, start_date, end_date)


@router.get("/{group_id}/stats/events-summary")
async def get_group_stats_events_summary(
    group_id: UUID,
    interval: str = Query("all"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    campaign_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Open to any member -- powers the map-snapshot's 'activity map' mode. No admin gate,
    mirrors geo-points."""
    return await _group_stats_events_rows(db, group_id, interval, campaign_id, start_date, end_date)


@router.get("/{group_id}/stats")
async def get_group_stats(
    group_id: UUID,
    interval: str = Query("all"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    campaign_id: UUID | None = Query(None),
    viewer_user_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Powers the group data portal's stats view: /groups/[slug]/stats."""
    return await _compute_group_stats(db, group_id, interval, campaign_id, viewer_user_id, start_date, end_date)


async def _compute_group_trend(
    db: AsyncSession,
    group_id: UUID,
    interval: str,
    campaign_id: UUID,
    user_id: UUID | None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    """
    Bucketed points/logs/bags/pounds trend for a group (optionally scoped to one
    member), powering the admin deep-dive page's trend chart. Bucket granularity is
    picked from the resolved window's span (see trend_bucket_unit), and for "all"
    (or any open-ended window) the range starts at the group's first contribution
    in this campaign.
    """
    start, end = await resolve_stats_window(db, interval, start_date, end_date)
    bucket_unit = trend_bucket_unit(start, end)

    user_filter = "AND c.user_id = :uid" if user_id else ""
    base_params = {"gid": str(group_id), "cid": str(campaign_id)}
    if user_id:
        base_params["uid"] = str(user_id)

    if start is None:
        start = (
            await db.execute(
                text(f"""
                    SELECT MIN(date_trunc('day', c.submitted_at)) AS start
                    FROM contributions c
                    WHERE c.group_id = :gid AND c.campaign_id = :cid {user_filter}
                """),
                base_params,
            )
        ).fetchone().start

    params = {**base_params, "bucket_unit": bucket_unit, "start": start, "end": end}

    value_rows = (
        await db.execute(
            text(f"""
                SELECT date_trunc(:bucket_unit, c.submitted_at) AS bucket,
                       COALESCE(SUM(c.value), 0)::float AS total_value,
                       COUNT(*)::int AS contribution_count
                FROM contributions c
                WHERE c.group_id = :gid AND c.campaign_id = :cid {user_filter}
                  AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                GROUP BY bucket
                ORDER BY bucket
            """),
            params,
        )
    ).fetchall()

    bag_rows = (
        await db.execute(
            text(f"""
                SELECT date_trunc(:bucket_unit, dc.submitted_at) AS bucket,
                       COALESCE(SUM(cl.metrics_small_bags), 0)::int AS small_bags,
                       COALESCE(SUM(cl.metrics_large_bags), 0)::int AS large_bags,
                       COALESCE(SUM(cl.metrics_pounds), 0)::float AS pounds
                FROM (
                    SELECT DISTINCT ON (COALESCE(c.cleanup_id::text, c.cleanup_event_id::text))
                        COALESCE(c.cleanup_id, c.cleanup_event_id) AS cid, c.submitted_at
                    FROM contributions c
                    WHERE c.group_id = :gid AND c.campaign_id = :cid {user_filter}
                      AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                      AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                      AND COALESCE(c.cleanup_id, c.cleanup_event_id) IS NOT NULL
                ) dc
                JOIN cleanups cl ON cl.id = dc.cid
                GROUP BY bucket
                ORDER BY bucket
            """),
            params,
        )
    ).fetchall()

    buckets: dict = {}
    for r in value_rows:
        buckets[r.bucket] = {
            "date": r.bucket.isoformat(),
            "total_value": r.total_value,
            "contribution_count": r.contribution_count,
            "small_bags": 0,
            "large_bags": 0,
            "pounds": 0.0,
        }
    for r in bag_rows:
        entry = buckets.setdefault(
            r.bucket,
            {"date": r.bucket.isoformat(), "total_value": 0.0, "contribution_count": 0, "small_bags": 0, "large_bags": 0, "pounds": 0.0},
        )
        entry["small_bags"] = r.small_bags
        entry["large_bags"] = r.large_bags
        entry["pounds"] = r.pounds

    return {
        "granularity": bucket_unit,
        "range_start": start.isoformat() if start else None,
        "buckets": [buckets[k] for k in sorted(buckets.keys())],
    }


@router.get("/{group_id}/stats/trend")
async def get_group_stats_trend(
    group_id: UUID,
    campaign_id: UUID = Query(...),
    interval: str = Query("month"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    user_id: UUID | None = Query(None),
    viewer_user_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Bucketed trend for the admin deep-dive page -- admin-only, campaign-scoped, optionally per-member."""
    if not await _is_group_admin(db, group_id, viewer_user_id):
        raise HTTPException(403, "Only a group admin can view this group's deep-dive trend.")
    return await _compute_group_trend(db, group_id, interval, campaign_id, user_id, start_date, end_date)


@router.get("/{group_id}/stats/members/{user_id}/activity")
async def get_group_member_activity(
    group_id: UUID,
    user_id: UUID,
    campaign_id: UUID = Query(...),
    interval: str = Query("month"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    limit: int = Query(25, le=100),
    viewer_user_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Recent raw contribution log for one member -- admin-only deep-dive tool. Not deduped:
    each row is a contribution that member personally logged, including team-split events."""
    if not await _is_group_admin(db, group_id, viewer_user_id):
        raise HTTPException(403, "Only a group admin can view a member's activity log.")
    start, end = await resolve_stats_window(db, interval, start_date, end_date)

    rows = (
        await db.execute(
            text("""
                SELECT c.id::text, c.submitted_at, c.value, c.photo_url, c.notes,
                       COALESCE(cl.metrics_small_bags, 0)::int AS small_bags,
                       COALESCE(cl.metrics_large_bags, 0)::int AS large_bags,
                       COALESCE(cl.metrics_pounds, 0)::float   AS pounds
                FROM contributions c
                LEFT JOIN cleanups cl ON cl.id = COALESCE(c.cleanup_id, c.cleanup_event_id)
                WHERE c.group_id = :gid AND c.campaign_id = :cid AND c.user_id = :uid
                  AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                ORDER BY c.submitted_at DESC
                LIMIT :limit
            """),
            {"gid": str(group_id), "cid": str(campaign_id), "uid": str(user_id), "start": start, "end": end, "limit": limit},
        )
    ).fetchall()

    return [
        {
            "id": r.id,
            "submitted_at": r.submitted_at.isoformat(),
            "value": r.value,
            "photo_url": r.photo_url,
            "notes": r.notes,
            "small_bags": r.small_bags,
            "large_bags": r.large_bags,
            "pounds": r.pounds,
        }
        for r in rows
    ]


@router.get("/{group_id}/stats/export.csv")
async def export_group_stats_csv(
    group_id: UUID,
    interval: str = Query("all"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    campaign_id: UUID | None = Query(None),
    viewer_user_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """CSV export of the group stats view -- admin-only, per the group data portal scoping doc."""
    if not await _is_group_admin(db, group_id, viewer_user_id):
        raise HTTPException(403, "Only a group admin can export this group's stats.")

    data = await _compute_group_stats(db, group_id, interval, campaign_id, viewer_user_id, start_date, end_date)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "campaign", "user_id", "username", "display_name",
        "total_value", "contribution_count", "small_bags", "large_bags", "pounds",
    ])
    for camp in data["campaigns"]:
        for m in camp["members"]:
            writer.writerow([
                camp["campaign_name"], m["user_id"], m["username"], m["display_name"],
                m["total_value"], m["contribution_count"], m["small_bags"], m["large_bags"], m["pounds"],
            ])

    filename = f"group-{group_id}-stats-{interval}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{group_id}/stats/export.xlsx")
async def export_group_stats_xlsx(
    group_id: UUID,
    interval: str = Query("all"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    campaign_id: UUID | None = Query(None),
    viewer_user_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Excel export of the group stats view -- admin-only, same shape as the CSV export."""
    if not await _is_group_admin(db, group_id, viewer_user_id):
        raise HTTPException(403, "Only a group admin can export this group's stats.")

    data = await _compute_group_stats(db, group_id, interval, campaign_id, viewer_user_id, start_date, end_date)

    wb = Workbook()
    ws = wb.active
    ws.title = "Group Stats"
    ws.append([
        "campaign", "user_id", "username", "display_name",
        "total_value", "contribution_count", "small_bags", "large_bags", "pounds",
    ])
    for camp in data["campaigns"]:
        for m in camp["members"]:
            ws.append([
                camp["campaign_name"], str(m["user_id"]), m["username"], m["display_name"],
                m["total_value"], m["contribution_count"], m["small_bags"], m["large_bags"], m["pounds"],
            ])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"group-{group_id}-stats-{interval}.xlsx"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
