"""Admin emails, two flavors, both sent to every site admin who has not opted out.

Weekly summary (Mondays): the full stats picture for the past 7 days. render_weekly_html.
Daily action list: very short, only the queues that currently have something waiting on an admin,
skipped entirely when every queue is empty. render_daily_html.

build_digest gathers every number for a window of `days`; both emails read from it. The send_*
functions are called by secret protected cron routes (scripts/run_daily_emails.py).
"""

import logging
from datetime import datetime, timedelta, timezone
from html import escape

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.email import render_cta_button, send_email, wrap_email_html
from app.services import sweep_health

logger = logging.getLogger(__name__)

DAILY_KIND = "admin_daily_digest"
WEEKLY_KIND = "admin_weekly_digest"
FOOTER = "Sent by Frontline because you are a site admin."


async def _scalar(db: AsyncSession, sql: str, **params) -> int:
    return int((await db.execute(text(sql), params)).scalar() or 0)


async def _flagged(db: AsyncSession, content_type: str) -> int:
    """Distinct photos of one type that have unresolved flags (one admin decision per photo)."""
    return await _scalar(
        db,
        """SELECT count(*) FROM (SELECT DISTINCT content_id, photo_url FROM content_flags
           WHERE resolved_at IS NULL AND content_type = :t) q""",
        t=content_type,
    )


async def build_digest(db: AsyncSession, days: int) -> dict:
    """Numbers for both emails. Activity style counts cover the last `days`; queue style counts
    (pending, flagged, unpaid and so on) are always the current state."""
    # Imported here: admin.py is a heavy router module and this avoids an import cycle at startup.
    from app.api.routes.admin import get_recent_activity_snapshot

    snapshot = await get_recent_activity_snapshot(db, days)
    w = {"d": days}

    oldest = (
        await db.execute(
            text(
                """SELECT extract(epoch FROM now() - min(created_at)) / 3600 AS hours
                   FROM sponsorship_allocations WHERE status = 'pending_review'"""
            )
        )
    ).scalar()

    reviewed = (
        await db.execute(
            text(
                """SELECT
                     count(*) FILTER (WHERE status IN ('approved', 'paid_out') AND reviewed_by IS NULL) AS auto_approved,
                     count(*) FILTER (WHERE status IN ('approved', 'paid_out') AND reviewed_by IS NOT NULL) AS manual_approved,
                     count(*) FILTER (WHERE status = 'rejected') AS rejected
                   FROM sponsorship_allocations
                   WHERE reviewed_at > now() - make_interval(days => :d)"""
            ),
            w,
        )
    ).one()

    hb = (
        await db.execute(
            text(
                """SELECT extract(epoch FROM now() - last_run_at) / 60 AS minutes
                   FROM service_heartbeats WHERE name = :n"""
            ),
            {"n": sweep_health.NAME},
        )
    ).first()
    sweep_minutes = float(hb.minutes) if hb and hb.minutes is not None else None

    cleanups = (
        await db.execute(
            text(
                """SELECT count(*) AS n,
                          coalesce(sum(metrics_small_bags), 0) AS small_bags,
                          coalesce(sum(metrics_large_bags), 0) AS large_bags,
                          coalesce(sum(metrics_pounds), 0) AS pounds
                   FROM cleanups WHERE status = 'completed' AND updated_at > now() - make_interval(days => :d)"""
            ),
            w,
        )
    ).one()

    held = (
        await db.execute(
            text(
                """SELECT count(*) AS n, coalesce(sum(price_cents), 0) AS total
                   FROM marketplace_jobs WHERE hold_status = 'held'"""
            )
        )
    ).one()

    return {
        "days": days,
        "activity": {
            "signups": snapshot["signups"]["count"],
            "groups": snapshot["groups"]["count"],
            "events_created": snapshot["events"]["created_count"],
            "contributions": snapshot["contributions"]["count"],
            "contribution_points": snapshot["contributions"]["total_points"],
        },
        "approvals": {
            "pending": await _scalar(db, "SELECT count(*) FROM sponsorship_allocations WHERE status = 'pending_review'"),
            "oldest_pending_hours": float(oldest) if oldest is not None else None,
            "auto_approved": reviewed.auto_approved,
            "manual_approved": reviewed.manual_approved,
            "rejected": reviewed.rejected,
        },
        "community": {
            "groups_pending": snapshot["groups"]["pending_count"],
            "partners_pending": snapshot["partners"]["pending_count"],
            "flagged_avatars": await _flagged(db, "avatar"),
            "flagged_contribution_photos": await _flagged(db, "contribution_photo"),
            "flagged_cleanup_photos": await _flagged(db, "cleanup_log_photo")
            + await _flagged(db, "cleanup_event_photo"),
            "flagged_trash_reports": await _scalar(
                db, "SELECT count(DISTINCT report_id) FROM problem_report_flags WHERE resolved_at IS NULL"
            ),
            "new_user_blocks": await _scalar(
                db, "SELECT count(*) FROM blocked_users WHERE created_at > now() - make_interval(days => :d)", **w
            ),
        },
        "trash": {
            "cleanups": cleanups.n,
            "small_bags": int(cleanups.small_bags),
            "large_bags": int(cleanups.large_bags),
            "pounds": float(cleanups.pounds),
            "new_reports": await _scalar(
                db, "SELECT count(*) FROM problem_reports WHERE reported_at > now() - make_interval(days => :d)", **w
            ),
            "cleaned_up": await _scalar(
                db, "SELECT count(*) FROM problem_reports WHERE resolved_at > now() - make_interval(days => :d)", **w
            ),
            "open_now": await _scalar(
                db, "SELECT count(*) FROM problem_reports WHERE status IN ('open', 'scheduled', 'in_progress')"
            ),
            "claimed_now": await _scalar(
                db,
                "SELECT count(*) FROM problem_reports WHERE claimed_by_user_id IS NOT NULL AND resolved_at IS NULL "
                "AND status NOT IN ('flagged', 'cancelled')",
            ),
            "auto_hidden": await _scalar(db, "SELECT count(*) FROM problem_reports WHERE status = 'flagged'"),
        },
        "tasks": {
            "open_reports": await _scalar(db, "SELECT count(*) FROM marketplace_reports WHERE status = 'open'"),
            "flagged_messages": await _scalar(
                db, "SELECT count(*) FROM marketplace_messages WHERE flag_reason IS NOT NULL AND reviewed_at IS NULL"
            ),
            "suspended_cleaners": await _scalar(db, "SELECT count(*) FROM cleaner_profiles WHERE status = 'suspended'"),
            "unpaid_allocations": await _scalar(db, "SELECT count(*) FROM sponsorship_allocations WHERE status = 'approved'"),
            "failed_payouts": await _scalar(
                db,
                """SELECT (SELECT count(*) FROM sponsorship_allocations WHERE payout_error IS NOT NULL AND status <> 'paid_out')
                        + (SELECT count(*) FROM marketplace_jobs WHERE payment_error IS NOT NULL
                           AND status NOT IN ('released', 'refunded', 'cancelled', 'expired', 'declined'))""",
            ),
            "sweep_stale_minutes": int(sweep_minutes) if sweep_minutes is not None and sweep_minutes > sweep_health.STALE_AFTER_MIN else None,
        },
        "partners": {
            "new": snapshot["partners"]["count"],
            "new_offers": snapshot["offers"]["count"],
            "redemptions": snapshot["redemptions"]["count"],
            "redemption_points": snapshot["redemptions"]["total_points"],
        },
        "marketplace": {
            "new_jobs": await _scalar(
                db, "SELECT count(*) FROM marketplace_jobs WHERE created_at > now() - make_interval(days => :d)", **w
            ),
            "jobs_completed": await _scalar(
                db, "SELECT count(*) FROM marketplace_jobs WHERE completed_at > now() - make_interval(days => :d)", **w
            ),
            "new_cleaners": await _scalar(
                db, "SELECT count(*) FROM cleaner_profiles WHERE created_at > now() - make_interval(days => :d)", **w
            ),
            "cleaner_applications": await _scalar(
                db, "SELECT count(*) FROM cleaner_profiles WHERE status = 'pending_review'"
            ),
            "disputed_jobs": await _scalar(db, "SELECT count(*) FROM marketplace_jobs WHERE status = 'disputed'"),
            "safety_reports": await _scalar(
                db, "SELECT count(*) FROM marketplace_reports WHERE status = 'open' AND kind = 'safety'"
            ),
            "held_jobs": held.n,
            "held_cents": int(held.total),
            "awaiting_release": await _scalar(db, "SELECT count(*) FROM marketplace_jobs WHERE status = 'completed'"),
            "overdue_release": await _scalar(
                db, "SELECT count(*) FROM marketplace_jobs WHERE status = 'completed' AND release_after < now()"
            ),
            "new_strikes": await _scalar(
                db, "SELECT count(*) FROM marketplace_strikes WHERE created_at > now() - make_interval(days => :d)", **w
            ),
        },
    }


# --------------------------------------------------------------------------- helpers


def _row(label: str, value: object, warn: bool = False) -> str:
    color = "#b45309" if warn else "#18181b"
    return (
        f'<tr><td style="padding:4px 12px 4px 0; color:#71717a;">{escape(label)}</td>'
        f'<td style="padding:4px 0; font-weight:bold; color:{color};">{escape(str(value))}</td></tr>'
    )


def _table(rows: list[str]) -> str:
    return f'<table role="presentation" style="border-collapse:collapse; margin:4px 0 16px;">{"".join(rows)}</table>'


def _age(hours: float | None) -> str:
    if hours is None:
        return "none waiting"
    return f"{hours:.0f}h" if hours < 48 else f"{hours / 24:.0f}d"


def _money(cents: int) -> str:
    return f"${cents / 100:,.2f}"


def _date_range(days: int) -> str:
    """e.g. 'Nov 1 to Nov 8, 2026' for the window ending now (UTC, matching the 12:00 UTC send)."""
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    fmt = lambda d: f"{d:%b} {d.day}"
    return f"{fmt(start)} to {fmt(end)}, {end.year}" if start.year == end.year else f"{fmt(start)}, {start.year} to {fmt(end)}, {end.year}"


_H3 = 'style="margin:16px 0 4px; font-size:14px;"'


def _open_admin_cta() -> str:
    return f'<p>{render_cta_button(f"{settings.frontend_url}/admin", "Open admin")}</p>'


# --------------------------------------------------------------------------- daily action list


def action_items(d: dict) -> list[tuple[str, str]]:
    """The short list for the daily email: only queues that currently need an admin."""
    ap, c, t, m, tr = d["approvals"], d["community"], d["tasks"], d["marketplace"], d["trash"]
    items: list[tuple[str, str]] = []

    def add(label: str, n: int) -> None:
        if n:
            items.append((label, str(n)))

    add("Groups pending approval", c["groups_pending"])
    add("Partners pending approval", c["partners_pending"])
    add("Flagged avatars", c["flagged_avatars"])
    add("Flagged contribution photos", c["flagged_contribution_photos"])
    add("Flagged cleanup photos", c["flagged_cleanup_photos"])
    add("Flagged trash reports", c["flagged_trash_reports"])
    add("Trash reports auto hidden after flags", tr["auto_hidden"])
    add("Cleaner applications to review", m["cleaner_applications"])
    add("Disputed jobs", m["disputed_jobs"])
    add("Open marketplace reports", t["open_reports"])
    add("Open safety reports", m["safety_reports"])
    add("Flagged chat messages", t["flagged_messages"])
    add("Marketplace jobs past release date", m["overdue_release"])
    if ap["pending"]:
        items.append(("Sponsored work waiting for review", f'{ap["pending"]} (oldest {_age(ap["oldest_pending_hours"])})'))
    add("Approved sponsored work not yet paid", t["unpaid_allocations"])
    add("Failed or errored payouts", t["failed_payouts"])
    if t["sweep_stale_minutes"] is not None:
        items.append(("Marketplace sweep", f'stopped {t["sweep_stale_minutes"]} min ago'))
    return items


def render_daily_html(items: list[tuple[str, str]]) -> str:
    rows = _table([_row(label, value, warn=True) for label, value in items])
    return wrap_email_html(f"""
        <h2 style="margin:0 0 4px;">Waiting on you</h2>
        <p style="margin:0 0 8px; color:#71717a;">Admin items that need attention today</p>
        {rows}
        {_open_admin_cta()}
        <p style="font-size:12px; color:#a1a1aa;">Turn admin emails off in Settings, Account.</p>
    """, footer=FOOTER)


# --------------------------------------------------------------------------- weekly summary


def needs_attention(d: dict) -> bool:
    """The weekly send is skipped only when every number is zero (never in practice, but cheap)."""
    ap = d["approvals"]
    approvals = ap["pending"] or ap["auto_approved"] or ap["manual_approved"] or ap["rejected"]
    others = any(v for key in ("activity", "community", "trash", "tasks", "partners", "marketplace") for v in d[key].values())
    return bool(approvals or others)


def render_weekly_html(d: dict) -> str:
    a, ap, t, pa, m = d["activity"], d["approvals"], d["tasks"], d["partners"], d["marketplace"]
    c, tr = d["community"], d["trash"]
    pts = int(a["contribution_points"])
    activity = _table([
        _row("New signups", a["signups"]),
        _row("New groups", a["groups"]),
        _row("Events created", a["events_created"]),
        _row("Contributions", f'{a["contributions"]} ({pts} pts)'),
    ])
    trash = _table([
        _row("Cleanups completed", tr["cleanups"]),
        _row("Bags collected", f'{tr["small_bags"]} small, {tr["large_bags"]} large'),
        _row("Pounds collected", f'{tr["pounds"]:,.1f}'),
        _row("New trash reports", tr["new_reports"]),
        _row("Cleaned up", tr["cleaned_up"]),
        _row("Open now", tr["open_now"]),
        _row("Claimed, not yet cleaned", tr["claimed_now"]),
        _row("Auto hidden after flags", tr["auto_hidden"], warn=tr["auto_hidden"] > 0),
    ])
    partners = _table([
        _row("New partners", pa["new"]),
        _row("New offers", pa["new_offers"]),
        _row("Redemptions", f'{pa["redemptions"]} ({int(pa["redemption_points"])} pts)'),
    ])
    sweep = f'stopped {t["sweep_stale_minutes"]} min ago' if t["sweep_stale_minutes"] is not None else "healthy"
    marketplace = _table([
        _row("New jobs", m["new_jobs"]),
        _row("Jobs completed", m["jobs_completed"]),
        _row("New cleaner profiles", m["new_cleaners"]),
        _row("New strikes", m["new_strikes"], warn=m["new_strikes"] > 0),
        _row("Funds held in escrow", f'{m["held_jobs"]} jobs ({_money(m["held_cents"])})'),
        _row("Completed, awaiting release", m["awaiting_release"]),
        _row("Suspended cleaners", t["suspended_cleaners"]),
        _row("Marketplace sweep", sweep, warn=t["sweep_stale_minutes"] is not None),
    ])
    earn = _table([
        _row("Auto approved", ap["auto_approved"]),
        _row("Manually approved", ap["manual_approved"]),
        _row("Rejected", ap["rejected"]),
    ])
    moderation = _table([
        _row("New user blocks", c["new_user_blocks"]),
    ])
    queue = action_items(d)
    waiting = (
        _table([_row(label, value, warn=True) for label, value in queue])
        if queue
        else '<p style="margin:4px 0 16px; color:#71717a;">Nothing waiting on an admin.</p>'
    )
    return wrap_email_html(f"""
        <h2 style="margin:0 0 4px;">Frontline weekly summary</h2>
        <p style="margin:0 0 8px; color:#71717a;">{_date_range(d["days"])}</p>
        <h3 {_H3}>Waiting on you right now</h3>{waiting}
        <h3 {_H3}>Activity</h3>{activity}
        <h3 {_H3}>Trash War</h3>{trash}
        <h3 {_H3}>Partners</h3>{partners}
        <h3 {_H3}>Marketplace</h3>{marketplace}
        <h3 {_H3}>Earn sponsored work</h3>{earn}
        <h3 {_H3}>Moderation</h3>{moderation}
        {_open_admin_cta()}
        <p style="font-size:12px; color:#a1a1aa;">Turn admin emails off in Settings, Account.</p>
    """, footer=FOOTER)


# --------------------------------------------------------------------------- sending


async def _admin_emails(db: AsyncSession) -> list[str]:
    rows = (
        await db.execute(
            text(
                """SELECT u.email FROM profiles p JOIN auth.users u ON u.id = p.id
                   WHERE p.is_admin AND NOT p.admin_daily_email_opt_out AND u.email IS NOT NULL"""
            )
        )
    ).fetchall()
    return [r.email for r in rows]


async def _send_each(db: AsyncSession, emails: list[str], subject: str, html: str, kind: str) -> dict:
    sent = 0
    # One message per admin so addresses stay private and one bad address cannot block the rest.
    for email in emails:
        if await send_email(db, to=[email], subject=subject, html=html, kind=kind):
            sent += 1
    return {"sent": sent, "admins": len(emails)}


async def send_daily_digest(db: AsyncSession) -> dict:
    items = action_items(await build_digest(db, 1))
    if not items:
        return {"sent": 0, "reason": "nothing waiting on an admin"}
    return await _send_each(db, await _admin_emails(db), "Frontline: admin items waiting", render_daily_html(items), DAILY_KIND)


async def send_weekly_digest(db: AsyncSession) -> dict:
    digest = await build_digest(db, 7)
    if not needs_attention(digest):
        return {"sent": 0, "reason": "nothing to report"}
    return await _send_each(db, await _admin_emails(db), "Frontline weekly summary", render_weekly_html(digest), WEEKLY_KIND)
