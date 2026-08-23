"""
Campaign-wide admin dashboard: rolls up every domain of Trash War activity (group and
individual cleanups, routes, points/contributions, trash reports, partners/offers/
redemptions) into one interactive view for site admins, plus a PDF export for funding
reports. All endpoints are gated to site admins (profiles.is_admin) via a required
viewer_user_id query param -- same workaround as admin.py/admin_prod.py, since FastAPI
has no auth of its own here (see master-backlog.md).

Aggregation SQL reuses the dedup-before-join CTE pattern from leaderboard.py's
/geo-stats and groups.py's _compute_group_stats: a team-split cleanup event can have
several contribution rows sharing one cleanup_id/cleanup_event_id (one per attendee),
so bag/pound/value totals dedup to one row per event before summing, to avoid
multiplying a split total by attendee count.
"""

import base64
import logging
from datetime import datetime, timezone
from io import BytesIO
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from jinja2 import Environment, BaseLoader
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.groups import _is_site_admin
from app.db.database import get_db
from app.services.stats_window import resolve_stats_window, trend_bucket_unit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/campaigns/{campaign_id}/dashboard", tags=["campaign-dashboard"])


async def _require_site_admin(db: AsyncSession, viewer_user_id: UUID) -> None:
    if not await _is_site_admin(db, viewer_user_id):
        raise HTTPException(403, "Admin access required")


def _window_params(campaign_id: UUID, start, end) -> dict:
    return {"campaign_id": str(campaign_id), "start": start, "end": end}


@router.get("/overview")
async def get_dashboard_overview(
    campaign_id: UUID,
    interval: str = Query("all"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    viewer_user_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    await _require_site_admin(db, viewer_user_id)
    start, end = await resolve_stats_window(db, interval, start_date, end_date)
    params = _window_params(campaign_id, start, end)

    # Points are NOT deduped by cleanup here -- unlike bags/pounds (which live once per
    # cleanups row, shared across a team-split event's attendees), each contributions row
    # is one specific user's actual point award, so summing them directly is correct (same
    # as leaderboard.py's /leaderboard aggregate). Deduping by cleanup_id/cleanup_event_id
    # would collapse every attendee but one down to a single row and badly undercount.
    contrib_row = (
        await db.execute(
            text("""
                SELECT COUNT(*)::int AS contribution_count,
                       COUNT(DISTINCT user_id)::int AS unique_participants,
                       COALESCE(SUM(value), 0)::float AS total_points
                FROM contributions c
                WHERE c.campaign_id = :campaign_id
                  AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
            """),
            params,
        )
    ).fetchone()

    cleanup_row = (
        await db.execute(
            text("""
                SELECT
                    COUNT(*) FILTER (WHERE is_group_event)::int AS group_cleanup_count,
                    COUNT(*) FILTER (WHERE NOT is_group_event)::int AS individual_cleanup_count,
                    COALESCE(SUM(metrics_small_bags), 0)::int AS total_small_bags,
                    COALESCE(SUM(metrics_large_bags), 0)::int AS total_large_bags,
                    COALESCE(SUM(metrics_pounds), 0)::float AS total_pounds
                FROM cleanups
                WHERE campaign_id = :campaign_id
                  AND (CAST(:start AS timestamptz) IS NULL OR created_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR created_at < :end)
            """),
            params,
        )
    ).fetchone()

    trash_row = (
        await db.execute(
            text("""
                SELECT
                    COUNT(*) FILTER (WHERE status IN ('open', 'scheduled', 'in_progress'))::int AS open_count,
                    COUNT(*) FILTER (WHERE status IN ('addressed', 'verified'))::int AS resolved_count,
                    COUNT(*)::int AS total_count
                FROM problem_reports
                WHERE campaign_id = :campaign_id
                  AND (CAST(:start AS timestamptz) IS NULL OR reported_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR reported_at < :end)
            """),
            params,
        )
    ).fetchone()

    partner_row = (
        await db.execute(
            text("""
                SELECT COUNT(DISTINCT pb.id)::int AS active_partner_count
                FROM partner_businesses pb
                JOIN campaign_partner_businesses cpb ON cpb.business_id = pb.id
                WHERE cpb.campaign_id = :campaign_id AND pb.status = 'active'
            """),
            {"campaign_id": str(campaign_id)},
        )
    ).fetchone()

    redemption_row = (
        await db.execute(
            text("""
                SELECT COUNT(*)::int AS redemption_count, COALESCE(SUM(pr.points_spent), 0)::int AS points_redeemed
                FROM partner_redemptions pr
                JOIN partner_offers po ON po.id = pr.offer_id
                JOIN campaign_partner_businesses cpb ON cpb.business_id = pr.business_id AND cpb.campaign_id = :campaign_id
                WHERE (CAST(:start AS timestamptz) IS NULL OR pr.redeemed_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR pr.redeemed_at < :end)
            """),
            params,
        )
    ).fetchone()

    return {
        "contribution_count": contrib_row.contribution_count,
        "unique_participants": contrib_row.unique_participants,
        "total_points": contrib_row.total_points,
        "group_cleanup_count": cleanup_row.group_cleanup_count,
        "individual_cleanup_count": cleanup_row.individual_cleanup_count,
        "total_small_bags": cleanup_row.total_small_bags,
        "total_large_bags": cleanup_row.total_large_bags,
        "total_pounds": cleanup_row.total_pounds,
        "trash_reports_open": trash_row.open_count,
        "trash_reports_resolved": trash_row.resolved_count,
        "trash_reports_total": trash_row.total_count,
        "active_partner_count": partner_row.active_partner_count,
        "redemption_count": redemption_row.redemption_count,
        "points_redeemed": redemption_row.points_redeemed,
    }


@router.get("/cleanups")
async def get_dashboard_cleanups(
    campaign_id: UUID,
    interval: str = Query("all"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    viewer_user_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    await _require_site_admin(db, viewer_user_id)
    start, end = await resolve_stats_window(db, interval, start_date, end_date)
    params = _window_params(campaign_id, start, end)
    bucket = trend_bucket_unit(start, end)

    trend_rows = (
        await db.execute(
            text(f"""
                SELECT date_trunc(:bucket, created_at) AS bucket,
                       COUNT(*) FILTER (WHERE is_group_event)::int AS group_count,
                       COUNT(*) FILTER (WHERE NOT is_group_event)::int AS individual_count
                FROM cleanups
                WHERE campaign_id = :campaign_id
                  AND (CAST(:start AS timestamptz) IS NULL OR created_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR created_at < :end)
                GROUP BY bucket
                ORDER BY bucket
            """),
            {**params, "bucket": bucket},
        )
    ).fetchall()

    top_groups_rows = (
        await db.execute(
            text("""
                SELECT g.id::text AS group_id, g.name,
                       COUNT(*)::int AS cleanup_count,
                       COALESCE(SUM(cl.metrics_small_bags), 0)::int AS small_bags,
                       COALESCE(SUM(cl.metrics_large_bags), 0)::int AS large_bags,
                       COALESCE(SUM(cl.metrics_pounds), 0)::float AS pounds
                FROM cleanups cl
                JOIN groups g ON g.id = cl.group_id
                WHERE cl.campaign_id = :campaign_id AND cl.is_group_event
                  AND (CAST(:start AS timestamptz) IS NULL OR cl.created_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR cl.created_at < :end)
                GROUP BY g.id, g.name
                ORDER BY cleanup_count DESC
                LIMIT 20
            """),
            params,
        )
    ).fetchall()

    rsvp_row = (
        await db.execute(
            text("""
                SELECT
                    COUNT(*)::int AS rsvp_count,
                    COUNT(*) FILTER (WHERE r.status = 'going')::int AS going_count,
                    COUNT(*) FILTER (WHERE r.checked_in_at IS NOT NULL)::int AS checked_in_count
                FROM cleanup_rsvps r
                JOIN cleanups cl ON cl.id = r.cleanup_id
                WHERE cl.campaign_id = :campaign_id
                  AND cl.is_group_event = true
                  AND (CAST(:start AS timestamptz) IS NULL OR cl.created_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR cl.created_at < :end)
            """),
            params,
        )
    ).fetchone()

    map_rows = (
        await db.execute(
            text("""
                SELECT ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude,
                       is_group_event, status
                FROM cleanups
                WHERE campaign_id = :campaign_id AND location IS NOT NULL
                  AND (CAST(:start AS timestamptz) IS NULL OR created_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR created_at < :end)
            """),
            params,
        )
    ).fetchall()

    return {
        "trend": [
            {"bucket": r.bucket.isoformat(), "group_count": r.group_count, "individual_count": r.individual_count}
            for r in trend_rows
        ],
        "top_groups": [
            {
                "group_id": r.group_id,
                "name": r.name,
                "cleanup_count": r.cleanup_count,
                "small_bags": r.small_bags,
                "large_bags": r.large_bags,
                "pounds": r.pounds,
            }
            for r in top_groups_rows
        ],
        "rsvp_count": rsvp_row.rsvp_count,
        "going_count": rsvp_row.going_count,
        "checked_in_count": rsvp_row.checked_in_count,
        "map_points": [
            {"latitude": r.latitude, "longitude": r.longitude, "is_group_event": r.is_group_event, "status": r.status}
            for r in map_rows
        ],
    }


@router.get("/routes")
async def get_dashboard_routes(
    campaign_id: UUID,
    interval: str = Query("all"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    viewer_user_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    await _require_site_admin(db, viewer_user_id)
    start, end = await resolve_stats_window(db, interval, start_date, end_date)
    params = _window_params(campaign_id, start, end)

    summary_row = (
        await db.execute(
            text("""
                SELECT COUNT(*)::int AS routed_cleanup_count,
                       COALESCE(SUM(ST_Length(route) / 1609.34), 0)::float AS total_distance_miles
                FROM cleanups
                WHERE campaign_id = :campaign_id AND route IS NOT NULL
                  AND (CAST(:start AS timestamptz) IS NULL OR created_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR created_at < :end)
            """),
            params,
        )
    ).fetchone()

    route_rows = (
        await db.execute(
            text("""
                SELECT id::text AS cleanup_id, title,
                       ST_AsGeoJSON(route)::text AS route_geojson,
                       (ST_Length(route) / 1609.34)::float AS distance_miles
                FROM cleanups
                WHERE campaign_id = :campaign_id AND route IS NOT NULL
                  AND (CAST(:start AS timestamptz) IS NULL OR created_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR created_at < :end)
                ORDER BY created_at DESC
                LIMIT 200
            """),
            params,
        )
    ).fetchall()

    return {
        "routed_cleanup_count": summary_row.routed_cleanup_count,
        "total_distance_miles": summary_row.total_distance_miles,
        "routes": [
            {
                "cleanup_id": r.cleanup_id,
                "title": r.title,
                "geojson": r.route_geojson,
                "distance_miles": r.distance_miles,
            }
            for r in route_rows
        ],
    }


@router.get("/contributions/breakdown")
async def get_dashboard_contributions_breakdown(
    campaign_id: UUID,
    interval: str = Query("all"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    viewer_user_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    await _require_site_admin(db, viewer_user_id)
    start, end = await resolve_stats_window(db, interval, start_date, end_date)
    params = _window_params(campaign_id, start, end)

    # See the no-dedup comment on /overview's contrib_row -- points are per-user, not
    # per-event, so they're summed directly rather than deduped by cleanup.
    type_rows = (
        await db.execute(
            text("""
                SELECT contribution_type, COUNT(*)::int AS count, COALESCE(SUM(value), 0)::float AS total_value
                FROM contributions c
                WHERE c.campaign_id = :campaign_id
                  AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                GROUP BY contribution_type
                ORDER BY total_value DESC
            """),
            params,
        )
    ).fetchall()

    top_contributors_rows = (
        await db.execute(
            text("""
                SELECT c.user_id::text AS user_id, p.username, p.display_name,
                       COUNT(*)::int AS contribution_count, COALESCE(SUM(c.value), 0)::float AS total_value
                FROM contributions c
                JOIN profiles p ON p.id = c.user_id
                WHERE c.campaign_id = :campaign_id
                  AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                GROUP BY c.user_id, p.username, p.display_name
                ORDER BY total_value DESC
                LIMIT 25
            """),
            params,
        )
    ).fetchall()

    return {
        "by_type": [{"contribution_type": r.contribution_type, "count": r.count, "total_value": r.total_value} for r in type_rows],
        "top_contributors": [
            {
                "user_id": r.user_id,
                "username": r.username,
                "display_name": r.display_name,
                "contribution_count": r.contribution_count,
                "total_value": r.total_value,
            }
            for r in top_contributors_rows
        ],
    }


@router.get("/contributions/trend")
async def get_dashboard_contributions_trend(
    campaign_id: UUID,
    interval: str = Query("all"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    viewer_user_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    await _require_site_admin(db, viewer_user_id)
    start, end = await resolve_stats_window(db, interval, start_date, end_date)
    params = _window_params(campaign_id, start, end)
    bucket = trend_bucket_unit(start, end)

    # See the no-dedup comment on /overview's contrib_row -- points are per-user, not
    # per-event, so they're summed directly rather than deduped by cleanup.
    rows = (
        await db.execute(
            text("""
                SELECT date_trunc(:bucket, submitted_at) AS bucket,
                       COUNT(*)::int AS count, COALESCE(SUM(value), 0)::float AS total_value
                FROM contributions c
                WHERE c.campaign_id = :campaign_id
                  AND (CAST(:start AS timestamptz) IS NULL OR c.submitted_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR c.submitted_at < :end)
                GROUP BY bucket
                ORDER BY bucket
            """),
            {**params, "bucket": bucket},
        )
    ).fetchall()

    return {"bucket_unit": bucket, "trend": [{"bucket": r.bucket.isoformat(), "count": r.count, "total_value": r.total_value} for r in rows]}


@router.get("/trash-reports")
async def get_dashboard_trash_reports(
    campaign_id: UUID,
    interval: str = Query("all"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    viewer_user_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    await _require_site_admin(db, viewer_user_id)
    start, end = await resolve_stats_window(db, interval, start_date, end_date)
    params = _window_params(campaign_id, start, end)

    status_rows = (
        await db.execute(
            text("""
                SELECT status, severity, COUNT(*)::int AS count
                FROM problem_reports
                WHERE campaign_id = :campaign_id
                  AND (CAST(:start AS timestamptz) IS NULL OR reported_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR reported_at < :end)
                GROUP BY status, severity
                ORDER BY status, severity
            """),
            params,
        )
    ).fetchall()

    resolution_row = (
        await db.execute(
            text("""
                SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - reported_at)) / 3600)::float AS avg_resolution_hours,
                       COUNT(*)::int AS resolved_count
                FROM problem_reports
                WHERE campaign_id = :campaign_id AND resolved_at IS NOT NULL
                  AND (CAST(:start AS timestamptz) IS NULL OR reported_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR reported_at < :end)
            """),
            params,
        )
    ).fetchone()

    map_rows = (
        await db.execute(
            text("""
                SELECT ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude, status, severity
                FROM problem_reports
                WHERE campaign_id = :campaign_id AND location IS NOT NULL
                  AND (CAST(:start AS timestamptz) IS NULL OR reported_at >= :start)
                  AND (CAST(:end AS timestamptz) IS NULL OR reported_at < :end)
            """),
            params,
        )
    ).fetchall()

    return {
        "by_status_severity": [{"status": r.status, "severity": r.severity, "count": r.count} for r in status_rows],
        "avg_resolution_hours": resolution_row.avg_resolution_hours,
        "resolved_count": resolution_row.resolved_count,
        "map_points": [{"latitude": r.latitude, "longitude": r.longitude, "status": r.status, "severity": r.severity} for r in map_rows],
    }


@router.get("/partners")
async def get_dashboard_partners(
    campaign_id: UUID,
    interval: str = Query("all"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    viewer_user_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    await _require_site_admin(db, viewer_user_id)
    start, end = await resolve_stats_window(db, interval, start_date, end_date)
    params = _window_params(campaign_id, start, end)

    business_rows = (
        await db.execute(
            text("""
                SELECT pb.id::text AS business_id, pb.name, pb.status,
                       COUNT(pr.id)::int AS redemption_count,
                       COALESCE(SUM(pr.points_spent), 0)::int AS points_redeemed
                FROM partner_businesses pb
                JOIN campaign_partner_businesses cpb ON cpb.business_id = pb.id AND cpb.campaign_id = :campaign_id
                LEFT JOIN partner_redemptions pr ON pr.business_id = pb.id
                    AND (CAST(:start AS timestamptz) IS NULL OR pr.redeemed_at >= :start)
                    AND (CAST(:end AS timestamptz) IS NULL OR pr.redeemed_at < :end)
                GROUP BY pb.id, pb.name, pb.status
                ORDER BY redemption_count DESC
            """),
            params,
        )
    ).fetchall()

    offer_rows = (
        await db.execute(
            text("""
                SELECT po.id::text AS offer_id, po.title, pb.name AS business_name, po.status,
                       COUNT(pr.id)::int AS redemption_count,
                       COALESCE(SUM(pr.points_spent), 0)::int AS points_redeemed
                FROM partner_offers po
                JOIN partner_businesses pb ON pb.id = po.business_id
                JOIN campaign_partner_businesses cpb ON cpb.business_id = pb.id AND cpb.campaign_id = :campaign_id
                LEFT JOIN partner_redemptions pr ON pr.offer_id = po.id
                    AND (CAST(:start AS timestamptz) IS NULL OR pr.redeemed_at >= :start)
                    AND (CAST(:end AS timestamptz) IS NULL OR pr.redeemed_at < :end)
                GROUP BY po.id, po.title, pb.name, po.status
                ORDER BY redemption_count DESC
                LIMIT 25
            """),
            params,
        )
    ).fetchall()

    bucket = trend_bucket_unit(start, end)
    # Fixed set from trend_bucket_unit()'s {"hour","day","week","month"} return values, never
    # user input -- safe to interpolate directly. Bound as an interval-typed *parameter*
    # (CAST(:step AS interval)), asyncpg's client-side codec demands a datetime.timedelta and
    # rejects a plain str with "'str' object has no attribute 'days'"; a timedelta can't
    # represent a calendar month either, so the interval literal is written directly into the
    # SQL text instead of parameterized.
    bucket_step_literal = {"hour": "1 hour", "day": "1 day", "week": "1 week", "month": "1 month"}[bucket]

    # Redemption counts alone tend to read as a flat, uninformative line (this campaign's
    # offer catalog is small, so weekly redemption counts sit at 1-2 the whole window) --
    # pairing it with a running "how many offers were live at this point" line gives useful
    # context (catalog growth vs. redemption activity) instead of one lonely flat series.
    # Bucketed as a continuous generate_series (unlike the other trend endpoints, which only
    # emit buckets with activity) so the offer-count line doesn't have gaps.
    trend_rows = (
        await db.execute(
            text(f"""
                WITH first_offer AS (
                    SELECT MIN(po.created_at) AS min_created
                    FROM partner_offers po
                    JOIN partner_businesses pb ON pb.id = po.business_id
                    JOIN campaign_partner_businesses cpb ON cpb.business_id = pb.id AND cpb.campaign_id = :campaign_id
                ),
                bounds AS (
                    SELECT date_trunc(:bucket, COALESCE(CAST(:start AS timestamptz), (SELECT min_created FROM first_offer), now())) AS start_ts,
                           COALESCE(CAST(:end AS timestamptz), now()) AS end_ts
                ),
                buckets AS (
                    SELECT generate_series(start_ts, end_ts, INTERVAL '{bucket_step_literal}') AS bucket
                    FROM bounds
                ),
                redemptions AS (
                    SELECT date_trunc(:bucket, pr.redeemed_at) AS bucket,
                           COUNT(*)::int AS redemption_count, COALESCE(SUM(pr.points_spent), 0)::int AS points_redeemed
                    FROM partner_redemptions pr
                    JOIN campaign_partner_businesses cpb ON cpb.business_id = pr.business_id AND cpb.campaign_id = :campaign_id
                    WHERE (CAST(:start AS timestamptz) IS NULL OR pr.redeemed_at >= :start)
                      AND (CAST(:end AS timestamptz) IS NULL OR pr.redeemed_at < :end)
                    GROUP BY bucket
                )
                SELECT b.bucket,
                       COALESCE(r.redemption_count, 0) AS redemption_count,
                       COALESCE(r.points_redeemed, 0) AS points_redeemed,
                       (
                           SELECT COUNT(*)::int
                           FROM partner_offers po
                           JOIN partner_businesses pb ON pb.id = po.business_id
                           JOIN campaign_partner_businesses cpb2 ON cpb2.business_id = pb.id AND cpb2.campaign_id = :campaign_id
                           WHERE po.status = 'active' AND po.starts_at <= b.bucket
                             AND (po.ends_at IS NULL OR po.ends_at >= b.bucket)
                       ) AS active_offer_count
                FROM buckets b
                LEFT JOIN redemptions r ON r.bucket = b.bucket
                ORDER BY b.bucket
            """),
            {**params, "bucket": bucket},
        )
    ).fetchall()

    return {
        "businesses": [
            {
                "business_id": r.business_id,
                "name": r.name,
                "status": r.status,
                "redemption_count": r.redemption_count,
                "points_redeemed": r.points_redeemed,
            }
            for r in business_rows
        ],
        "offers": [
            {
                "offer_id": r.offer_id,
                "title": r.title,
                "business_name": r.business_name,
                "status": r.status,
                "redemption_count": r.redemption_count,
                "points_redeemed": r.points_redeemed,
            }
            for r in offer_rows
        ],
        "trend": [
            {
                "bucket": r.bucket.isoformat(),
                "redemption_count": r.redemption_count,
                "points_redeemed": r.points_redeemed,
                "active_offer_count": r.active_offer_count,
            }
            for r in trend_rows
        ],
    }


_CHART_COLORS = {"emerald": "#10b981", "sky": "#0ea5e9", "amber": "#f59e0b", "zinc": "#71717a"}


def _make_charts(cleanups: dict, contrib_trend: dict, breakdown: dict, trash_reports: dict, partners: dict) -> dict[str, str]:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    def _to_data_uri(fig) -> str:
        buf = BytesIO()
        fig.savefig(buf, format="png", dpi=150, bbox_inches="tight")
        plt.close(fig)
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

    charts: dict[str, str] = {}
    palette = [_CHART_COLORS["emerald"], _CHART_COLORS["sky"], _CHART_COLORS["amber"], _CHART_COLORS["zinc"]]

    if cleanups["trend"]:
        buckets = [t["bucket"][:10] for t in cleanups["trend"]]
        group_counts = [t["group_count"] for t in cleanups["trend"]]
        individual_counts = [t["individual_count"] for t in cleanups["trend"]]
        fig, ax = plt.subplots(figsize=(6.5, 2.6))
        ax.bar(buckets, group_counts, label="Group events", color=_CHART_COLORS["emerald"])
        ax.bar(buckets, individual_counts, bottom=group_counts, label="Individual cleanups", color=_CHART_COLORS["sky"])
        ax.legend(fontsize=8, frameon=False)
        ax.tick_params(axis="x", rotation=45, labelsize=7)
        ax.tick_params(axis="y", labelsize=7)
        ax.spines[["top", "right"]].set_visible(False)
        fig.tight_layout()
        charts["cleanups_trend"] = _to_data_uri(fig)

    if contrib_trend["trend"]:
        buckets = [t["bucket"][:10] for t in contrib_trend["trend"]]
        values = [t["total_value"] for t in contrib_trend["trend"]]
        fig, ax = plt.subplots(figsize=(6.5, 2.6))
        ax.plot(buckets, values, color=_CHART_COLORS["emerald"], linewidth=2, marker="o", markersize=3)
        ax.fill_between(range(len(buckets)), values, color=_CHART_COLORS["emerald"], alpha=0.12)
        ax.tick_params(axis="x", rotation=45, labelsize=7)
        ax.tick_params(axis="y", labelsize=7)
        ax.spines[["top", "right"]].set_visible(False)
        fig.tight_layout()
        charts["contributions_trend"] = _to_data_uri(fig)

    if breakdown["by_type"]:
        types = [t["contribution_type"] for t in breakdown["by_type"]]
        values = [t["total_value"] for t in breakdown["by_type"]]
        fig, ax = plt.subplots(figsize=(6.5, max(1.8, 0.4 * len(types))))
        ax.barh(types, values, color=[palette[i % len(palette)] for i in range(len(types))])
        ax.invert_yaxis()
        ax.tick_params(labelsize=8)
        ax.spines[["top", "right"]].set_visible(False)
        fig.tight_layout()
        charts["contributions_breakdown"] = _to_data_uri(fig)

    status_counts: dict[str, int] = {}
    for r in trash_reports["by_status_severity"]:
        status_counts[r["status"]] = status_counts.get(r["status"], 0) + r["count"]
    if status_counts:
        labels = list(status_counts.keys())
        values = list(status_counts.values())
        fig, ax = plt.subplots(figsize=(3.6, 3.6))
        ax.pie(
            values,
            labels=labels,
            autopct="%1.0f%%",
            colors=[palette[i % len(palette)] for i in range(len(labels))],
            textprops={"fontsize": 8},
            wedgeprops={"width": 0.4},
        )
        fig.tight_layout()
        charts["trash_reports_status"] = _to_data_uri(fig)

    top_businesses = [b for b in partners["businesses"] if b["redemption_count"] > 0][:10]
    if top_businesses:
        names = [b["name"] for b in top_businesses]
        values = [b["redemption_count"] for b in top_businesses]
        fig, ax = plt.subplots(figsize=(6.5, max(1.8, 0.4 * len(names))))
        ax.barh(names, values, color=_CHART_COLORS["sky"])
        ax.invert_yaxis()
        ax.tick_params(labelsize=8)
        ax.spines[["top", "right"]].set_visible(False)
        fig.tight_layout()
        charts["partners_redemptions"] = _to_data_uri(fig)

    return charts


_PDF_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: letter; margin: 2cm 1.8cm; @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 9px; color: #71717a; } }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #18181b; font-size: 11px; }
  h1 { font-size: 24px; margin-bottom: 2px; }
  h2 { font-size: 15px; margin-top: 22px; margin-bottom: 8px; border-bottom: 2px solid #10b981; padding-bottom: 4px; }
  .subtitle { color: #52525b; font-size: 12px; margin-bottom: 2px; }
  .generated { color: #a1a1aa; font-size: 10px; margin-bottom: 18px; }
  .kpi-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 6px; }
  .kpi { border: 1px solid #d4d4d8; border-radius: 8px; padding: 8px 12px; width: 22%; box-sizing: border-box; }
  .kpi .label { font-size: 9px; color: #71717a; text-transform: uppercase; letter-spacing: 0.03em; }
  .kpi .value { font-size: 17px; font-weight: 700; }
  .kpi .sub { font-size: 9px; color: #71717a; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th, td { text-align: left; padding: 4px 6px; font-size: 10px; border-bottom: 1px solid #e4e4e7; }
  th { color: #71717a; font-weight: 600; text-transform: uppercase; font-size: 9px; }
  .cover { text-align: center; margin-top: 30%; }
  .cover h1 { font-size: 32px; }
  .cover .period { font-size: 13px; color: #52525b; margin-top: 10px; }
  .chart { max-width: 100%; margin: 4px 0 12px; }
  .chart-donut { max-width: 260px; margin: 4px auto 12px; display: block; }
</style>
</head>
<body>
  <div class="cover">
    <h1>{{ campaign_name }}</h1>
    <div class="subtitle">Campaign Activity Report</div>
    <div class="period">{{ period_label }}</div>
    <div class="generated">Generated {{ generated_at }}</div>
  </div>

  <div style="page-break-before: always;"></div>

  <h2>Overview</h2>
  <div class="kpi-grid">
    <div class="kpi"><div class="label">Total points</div><div class="value">{{ "{:,.0f}".format(overview.total_points) }}</div></div>
    <div class="kpi"><div class="label">Contributions</div><div class="value">{{ "{:,}".format(overview.contribution_count) }}</div></div>
    <div class="kpi"><div class="label">Unique participants</div><div class="value">{{ "{:,}".format(overview.unique_participants) }}</div></div>
    <div class="kpi"><div class="label">Cleanups</div><div class="value">{{ "{:,}".format(overview.group_cleanup_count + overview.individual_cleanup_count) }}</div>
      <div class="sub">{{ overview.group_cleanup_count }} group / {{ overview.individual_cleanup_count }} individual</div></div>
    <div class="kpi"><div class="label">Bags collected</div><div class="value">{{ "{:,}".format(overview.total_small_bags + overview.total_large_bags) }}</div>
      <div class="sub">{{ overview.total_small_bags }} small / {{ overview.total_large_bags }} large</div></div>
    <div class="kpi"><div class="label">Pounds collected</div><div class="value">{{ "{:,.0f}".format(overview.total_pounds) }}</div></div>
    <div class="kpi"><div class="label">Trash reports</div><div class="value">{{ "{:,}".format(overview.trash_reports_total) }}</div>
      <div class="sub">{{ overview.trash_reports_open }} open / {{ overview.trash_reports_resolved }} resolved</div></div>
    <div class="kpi"><div class="label">Partner redemptions</div><div class="value">{{ "{:,}".format(overview.redemption_count) }}</div>
      <div class="sub">{{ overview.active_partner_count }} active partners</div></div>
  </div>

  <h2>Cleanups</h2>
  <div class="kpi-grid">
    <div class="kpi"><div class="label">RSVPs</div><div class="value">{{ "{:,}".format(cleanups.rsvp_count) }}</div></div>
    <div class="kpi"><div class="label">Going</div><div class="value">{{ "{:,}".format(cleanups.going_count) }}</div></div>
    <div class="kpi"><div class="label">Checked in</div><div class="value">{{ "{:,}".format(cleanups.checked_in_count) }}</div></div>
  </div>
  {% if charts.cleanups_trend %}
  <img class="chart" src="{{ charts.cleanups_trend }}" alt="Cleanups over time" />
  {% endif %}
  {% if cleanups.top_groups %}
  <table>
    <tr><th>Group</th><th>Cleanups</th><th>Bags</th><th>Pounds</th></tr>
    {% for g in cleanups.top_groups[:15] %}
    <tr><td>{{ g.name }}</td><td>{{ g.cleanup_count }}</td><td>{{ g.small_bags + g.large_bags }}</td><td>{{ "{:,.0f}".format(g.pounds) }}</td></tr>
    {% endfor %}
  </table>
  {% endif %}

  <h2>Routes</h2>
  <div class="kpi-grid">
    <div class="kpi"><div class="label">Cleanups with a route</div><div class="value">{{ "{:,}".format(routes.routed_cleanup_count) }}</div></div>
    <div class="kpi"><div class="label">Total distance</div><div class="value">{{ "{:,.1f}".format(routes.total_distance_miles) }} mi</div></div>
  </div>

  <h2>Points &amp; Contributions</h2>
  {% if charts.contributions_trend %}
  <img class="chart" src="{{ charts.contributions_trend }}" alt="Points over time" />
  {% endif %}
  {% if charts.contributions_breakdown %}
  <img class="chart" src="{{ charts.contributions_breakdown }}" alt="Points by contribution type" />
  {% endif %}
  {% if breakdown.by_type %}
  <table>
    <tr><th>Contribution type</th><th>Count</th><th>Points</th></tr>
    {% for t in breakdown.by_type %}
    <tr><td>{{ t.contribution_type }}</td><td>{{ t.count }}</td><td>{{ "{:,.0f}".format(t.total_value) }}</td></tr>
    {% endfor %}
  </table>
  {% endif %}
  {% if breakdown.top_contributors %}
  <table>
    <tr><th>Top contributors</th><th>Points</th></tr>
    {% for c in breakdown.top_contributors[:15] %}
    <tr><td>{{ c.display_name or c.username or "Unknown" }}</td><td>{{ "{:,.0f}".format(c.total_value) }}</td></tr>
    {% endfor %}
  </table>
  {% endif %}

  <h2>Trash Reports</h2>
  <div class="kpi-grid">
    <div class="kpi"><div class="label">Resolved</div><div class="value">{{ "{:,}".format(trash_reports.resolved_count) }}</div></div>
    <div class="kpi"><div class="label">Avg. resolution time</div><div class="value">{{ "{:,.1f} hrs".format(trash_reports.avg_resolution_hours) if trash_reports.avg_resolution_hours is not none else "—" }}</div></div>
  </div>
  {% if charts.trash_reports_status %}
  <img class="chart-donut" src="{{ charts.trash_reports_status }}" alt="Trash reports by status" />
  {% endif %}
  {% if trash_reports.by_status_severity %}
  <table>
    <tr><th>Status</th><th>Severity</th><th>Count</th></tr>
    {% for r in trash_reports.by_status_severity %}
    <tr><td>{{ r.status }}</td><td>{{ r.severity }}</td><td>{{ r.count }}</td></tr>
    {% endfor %}
  </table>
  {% endif %}

  <h2>Partners, Offers &amp; Redemptions</h2>
  {% if charts.partners_redemptions %}
  <img class="chart" src="{{ charts.partners_redemptions }}" alt="Redemptions by business" />
  {% endif %}
  {% if partners.businesses %}
  <table>
    <tr><th>Business</th><th>Redemptions</th><th>Points redeemed</th></tr>
    {% for b in partners.businesses %}
    <tr><td>{{ b.name }}</td><td>{{ b.redemption_count }}</td><td>{{ "{:,.0f}".format(b.points_redeemed) }}</td></tr>
    {% endfor %}
  </table>
  {% endif %}
  {% if partners.offers %}
  <table>
    <tr><th>Offer</th><th>Business</th><th>Redemptions</th></tr>
    {% for o in partners.offers[:15] %}
    <tr><td>{{ o.title }}</td><td>{{ o.business_name }}</td><td>{{ o.redemption_count }}</td></tr>
    {% endfor %}
  </table>
  {% endif %}
</body>
</html>
"""


@router.get("/export.pdf")
async def export_dashboard_pdf(
    campaign_id: UUID,
    interval: str = Query("all"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    viewer_user_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    await _require_site_admin(db, viewer_user_id)

    try:
        from weasyprint import HTML
    except ImportError as exc:  # pragma: no cover
        raise HTTPException(500, "PDF export is not available on this server") from exc

    campaign_row = (
        await db.execute(text("SELECT title FROM campaigns WHERE id = :campaign_id"), {"campaign_id": str(campaign_id)})
    ).fetchone()
    if not campaign_row:
        raise HTTPException(404, "Campaign not found")

    overview = await get_dashboard_overview(campaign_id, interval, start_date, end_date, viewer_user_id, db)
    cleanups = await get_dashboard_cleanups(campaign_id, interval, start_date, end_date, viewer_user_id, db)
    routes = await get_dashboard_routes(campaign_id, interval, start_date, end_date, viewer_user_id, db)
    breakdown = await get_dashboard_contributions_breakdown(campaign_id, interval, start_date, end_date, viewer_user_id, db)
    contrib_trend = await get_dashboard_contributions_trend(campaign_id, interval, start_date, end_date, viewer_user_id, db)
    trash_reports = await get_dashboard_trash_reports(campaign_id, interval, start_date, end_date, viewer_user_id, db)
    partners = await get_dashboard_partners(campaign_id, interval, start_date, end_date, viewer_user_id, db)

    charts = _make_charts(cleanups, contrib_trend, breakdown, trash_reports, partners)

    def _fmt(d: datetime) -> str:
        return f"{d.strftime('%b')} {d.day}, {d.strftime('%Y')}"

    start, end = await resolve_stats_window(db, interval, start_date, end_date)
    if start and end:
        period_label = f"{_fmt(start)} – {_fmt(end)}"
    elif start:
        period_label = f"Since {_fmt(start)}"
    else:
        period_label = "All time"

    now_utc = datetime.now(timezone.utc)
    env = Environment(loader=BaseLoader(), autoescape=True)
    template = env.from_string(_PDF_TEMPLATE)
    html_str = template.render(
        campaign_name=campaign_row.title,
        period_label=period_label,
        generated_at=f"{_fmt(now_utc)} {now_utc.strftime('%H:%M')} UTC",
        overview=overview,
        cleanups=cleanups,
        routes=routes,
        breakdown=breakdown,
        trash_reports=trash_reports,
        partners=partners,
        charts=charts,
    )

    pdf_bytes = HTML(string=html_str).write_pdf()

    filename = f"{campaign_row.title.lower().replace(' ', '-')}-report-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
