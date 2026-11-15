"""Pooled sponsorships. One person starts a pool (a cleanup site or a group area, a payout rule, a
goal and a deadline); anyone can add money through Stripe Checkout. The platform holds the money.
When paid contributions reach the goal, the pool activates by creating ONE funded sponsorship (a
site or a group area, with any payout rule the sponsor flow allows), so
claiming, payouts and refunds reuse the sponsorship machinery. A pool that misses its deadline
(or is cancelled by its creator) is not refunded automatically: it moves to "goal_missed" and the
starter chooses to run it with what was raised, extend the deadline, or cancel and refund.
"""

import json
import logging
from datetime import date as date_type, datetime, timedelta, timezone
from uuid import UUID

import stripe
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services import connect, sponsored_cleanups
from app.services.marketplace import _notify_safe
from app.services.game_settings import min_payment_cents

logger = logging.getLogger(__name__)


MAX_GOAL_CENTS = 500_000
MIN_CONTRIBUTION_CENTS = 500
POOL_DAYS_DEFAULT = 30
POOL_DAYS_MAX = 90
MISSED_DAYS = 14  # how long a pool that missed its goal (or whose hand-off fell through) waits for the starter before refunding
HANDOFF_DAYS = 7  # how long a group admin has to accept a hand-off
VOTE_DAYS = 7  # how long contributors have to vote
# What contributors can vote for, in tie-break order.
VOTE_CHOICES = {"site": ["flat", "bag"], "group_area": ["flat", "split"]}


class PoolError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _client() -> stripe.StripeClient:
    if not settings.stripe_secret_key:
        raise PoolError(503, "Payments are not configured.")
    return stripe.StripeClient(settings.stripe_secret_key)


_POOL_SELECT = """
    SELECT p.id, p.creator_id, p.title, p.message, p.goal_cents, p.payout_rule, p.cap_per_user_cents,
           p.model, p.area_name, p.area_source,
           p.site_label, ST_Y(p.site_location::geometry) AS site_latitude,
           ST_X(p.site_location::geometry) AS site_longitude, p.site_radius_meters,
           ST_Y(ST_PointOnSurface(COALESCE(p.area_geometry, p.site_location::geometry))) AS center_latitude,
           ST_X(ST_PointOnSurface(COALESCE(p.area_geometry, p.site_location::geometry))) AS center_longitude,
           CASE WHEN p.area_geometry IS NULL THEN NULL
                ELSE ST_AsGeoJSON(ST_SimplifyPreserveTopology(p.area_geometry, 0.0003))::json END AS area_geojson,
           p.status, p.deadline, p.missed_deadline, p.sponsorship_id, p.activated_at, p.created_at,
           p.plan_kind, p.jobs_frozen, p.jobs_deadline, p.closed_at, p.handoff_group_id, p.handoff_note, p.handoff_date, p.handoff_deadline, p.vote_deadline,
           (SELECT g.name FROM groups g WHERE g.id = p.handoff_group_id) AS handoff_group_name,
           (SELECT g.slug FROM groups g WHERE g.id = p.handoff_group_id) AS handoff_group_slug,
           COALESCE(pr.display_name, pr.username) AS creator_name,
           COALESCE((SELECT SUM(c.amount_cents) FROM sponsorship_pool_contributions c
                     WHERE c.pool_id = p.id AND c.status = 'paid'), 0)::int AS raised_cents,
           (SELECT COUNT(DISTINCT c.user_id) FROM sponsorship_pool_contributions c
             WHERE c.pool_id = p.id AND c.status = 'paid')::int AS contributor_count
    FROM sponsorship_pools p
    JOIN profiles pr ON pr.id = p.creator_id
"""


def _parse_date(value: str | None) -> date_type | None:
    if not value:
        return None
    try:
        return date_type.fromisoformat(value[:10])
    except ValueError as e:
        raise PoolError(422, "That date is not valid.") from e


async def _validate_plan(db, model, kind, payout_rule, group_id, goal_cents):
    """Check a plan and return (rule or None, group id or None). A vote plan has no rule until the
    vote ends; a group plan carries a default per-cleanup rule for the group."""
    if kind not in ("rule", "group", "vote", "jobs"):
        raise PoolError(422, "Pick how the money will be used.")
    if kind in ("vote", "jobs"):
        return None, None
    rule_in = payout_rule or None
    if kind == "group":
        if model != "group_area":
            raise PoolError(422, "Only an area can be handed to a group.")
        if not group_id:
            raise PoolError(422, "Pick a group.")
        found = (await db.execute(text("SELECT 1 FROM groups WHERE id = :g"), {"g": str(group_id)})).fetchone()
        if found is None:
            raise PoolError(404, "Group not found.")
        rule_in = rule_in or {"type": "flat_per_cleanup", "amount_cents": max(100, goal_cents // 10)}
    try:
        rule = sponsored_cleanups.validate_payout_rule(model, rule_in or {})
    except sponsored_cleanups.SponsoredError as e:
        raise PoolError(e.status_code, e.detail) from e
    return rule, (group_id if kind == "group" else None)


def _vote_rule(model: str, choice: str, total_cents: int) -> dict:
    """The preset payout rule a vote choice stands for, sized to the money raised."""
    rule = {
        "flat": {"type": "flat_per_cleanup", "amount_cents": max(100, total_cents // 10)},
        "bag": {"type": "per_bag", "cents_per_bag": max(100, total_cents // 50), "max_bags": 10},
        "split": {"type": "equal_split", "amount_cents": max(100, total_cents // 20)},
    }[choice]
    return sponsored_cleanups.validate_payout_rule(model, rule)


async def _vote_counts(db: AsyncSession, pool_id: UUID, model: str) -> list[dict]:
    rows = (
        await db.execute(
            text("SELECT choice, COUNT(*)::int AS n FROM sponsorship_pool_votes WHERE pool_id = :p GROUP BY choice"),
            {"p": str(pool_id)},
        )
    ).fetchall()
    n = {r.choice: r.n for r in rows}
    return [{"choice": c, "votes": n.get(c, 0)} for c in VOTE_CHOICES[model]]


async def _group_admin_ids(db: AsyncSession, group_id: UUID) -> list[UUID]:
    return list(
        (
            await db.execute(
                text("SELECT user_id FROM group_members WHERE group_id = :g AND role = 'admin'"), {"g": str(group_id)}
            )
        ).scalars().all()
    )


async def _is_admin_of(db: AsyncSession, group_id: UUID | None, user_id: UUID) -> bool:
    if not group_id:
        return False
    return user_id in await _group_admin_ids(db, group_id)


async def create_pool(
    db: AsyncSession,
    creator_id: UUID,
    *,
    title: str,
    message: str | None,
    goal_cents: int,
    payout_rule: dict,
    cap_per_user_cents: int | None,
    model: str = "site",
    site_label: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    radius_meters: int | None = None,
    area: dict | None = None,
    area_name: str | None = None,
    days: int | None = None,
    plan_kind: str = "rule",
    group_id: UUID | None = None,
    handoff_note: str | None = None,
    handoff_date: str | None = None,
) -> dict:
    title = (title or "").strip()
    if not 3 <= len(title) <= 80:
        raise PoolError(422, "Give the pool a title of 3 to 80 characters.")
    min_goal = await min_payment_cents(db)
    if not min_goal <= goal_cents <= MAX_GOAL_CENTS:
        raise PoolError(
            422, f"Goal must be between ${min_goal // 100} and ${MAX_GOAL_CENTS // 100}."
        )
    if model not in ("site", "group_area"):
        raise PoolError(422, "A pool funds a cleanup site or a group area.")
    message = (message or "").strip()[:500] or None
    site_label = (site_label or "").strip()[:80] or None
    area_wkt = area_source = None
    rule, handoff_group = await _validate_plan(db, model, plan_kind, payout_rule, group_id, goal_cents)
    handoff_note = (handoff_note or "").strip()[:200] or None
    hdate = _parse_date(handoff_date)
    try:
        if model == "site":
            if not site_label:
                raise PoolError(422, "Pick a place for the cleanup site.")
            if latitude is None or longitude is None or not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
                raise PoolError(422, "Site coordinates are out of range.")
            await sponsored_cleanups.validate_site_radius(db, radius_meters or 0)
        else:
            area_wkt, area_source, default_name = await sponsored_cleanups.build_area_geometry(db, area or {})
            area_name = (area_name or "").strip()[:80] or default_name
    except sponsored_cleanups.SponsoredError as e:
        raise PoolError(e.status_code, e.detail) from e
    if cap_per_user_cents is not None and cap_per_user_cents <= 0:
        raise PoolError(422, "Per-person cap must be positive.")
    window = min(max(days or POOL_DAYS_DEFAULT, 3), POOL_DAYS_MAX)
    row = (
        await db.execute(
            text("""
                INSERT INTO sponsorship_pools
                    (creator_id, title, message, goal_cents, payout_rule, cap_per_user_cents, model,
                     site_label, site_location, site_radius_meters,
                     area_geometry, area_source, area_name, deadline,
                     plan_kind, handoff_group_id, handoff_note, handoff_date)
                VALUES (:creator, :title, :message, :goal, CAST(:rule AS jsonb), :cap, :model, :label,
                        CASE WHEN CAST(:model AS text) = 'site'
                             THEN ST_SetSRID(ST_MakePoint(CAST(:lon AS double precision),
                                                          CAST(:lat AS double precision)), 4326)::geography
                             ELSE NULL END,
                        CAST(:radius AS integer),
                        CASE WHEN CAST(:area_wkt AS text) IS NULL THEN NULL
                             ELSE ST_GeomFromEWKT(CAST(:area_wkt AS text)) END,
                        :area_source, :area_name, :deadline,
                        :plan_kind, CAST(:hgroup AS uuid), :hnote, CAST(:hdate AS date))
                RETURNING id
            """),
            {
                "creator": str(creator_id), "title": title, "message": message, "goal": goal_cents,
                "rule": json.dumps(rule) if rule else None, "cap": cap_per_user_cents, "model": model,
                "plan_kind": plan_kind, "hgroup": str(handoff_group) if handoff_group else None,
                "hnote": handoff_note if plan_kind == "group" else None,
                "hdate": hdate if plan_kind == "group" else None,
                "label": site_label if model == "site" else None,
                "lon": longitude, "lat": latitude,
                "radius": radius_meters if model == "site" else None,
                "area_wkt": area_wkt, "area_source": area_source,
                "area_name": area_name if model == "group_area" else None,
                "deadline": datetime.now(timezone.utc) + timedelta(days=window),
            },
        )
    ).fetchone()
    await db.commit()
    return await get_pool(db, row.id, creator_id)


async def _refund_contributions(db: AsyncSession, pool_id: UUID, only_id: str | None = None) -> int:
    """Refund every paid contribution of a pool. Marks a row refunded only once Stripe accepts it,
    so a partial failure can be retried by calling this again."""
    rows = (
        await db.execute(
            text("""
                SELECT id, user_id, amount_cents, stripe_payment_intent_id
                FROM sponsorship_pool_contributions
                WHERE pool_id = :p AND status = 'paid' AND (CAST(:only AS uuid) IS NULL OR id = CAST(:only AS uuid))
            """),
            {"p": str(pool_id), "only": only_id},
        )
    ).fetchall()
    done = 0
    for r in rows:
        try:
            if r.stripe_payment_intent_id:
                _client().refunds.create(
                    params={"payment_intent": r.stripe_payment_intent_id},
                    options={"idempotency_key": f"pool-refund-{r.id}"},
                )
            await db.execute(
                text("""
                    UPDATE sponsorship_pool_contributions
                    SET status = 'refunded', refunded_at = now() WHERE id = :id
                """),
                {"id": str(r.id)},
            )
            await db.commit()
            done += 1
            await _notify_safe(
                db, r.user_id, "sponsorship_pool_refunded", "Pool refunded",
                f"${r.amount_cents / 100:.2f} is on its way back to your card.", "/fund", "Open",
            )
        except Exception:
            await db.rollback()
            logger.exception("sponsorship pool: refund failed for contribution %s", r.id)
    return done


async def expire_due_pools(db: AsyncSession) -> None:
    """Lazy expiry: runs whenever pools are read, so no scheduler is needed.

    An open pool past its deadline that raised nothing just closes. One with money in it waits in
    'goal_missed' for the starter; if they do nothing for MISSED_DAYS, it expires and refunds."""
    await db.execute(
        text("""
            UPDATE sponsorship_pools p
            SET status = 'goal_missed', missed_deadline = now() + make_interval(days => :days)
            WHERE p.status = 'open' AND p.deadline < now()
              AND EXISTS (SELECT 1 FROM sponsorship_pool_contributions c
                          WHERE c.pool_id = p.id AND c.status = 'paid')
        """),
        {"days": MISSED_DAYS},
    )
    due = (
        await db.execute(
            text("""
                UPDATE sponsorship_pools SET status = 'expired'
                WHERE (status = 'open' AND deadline < now())
                   OR (status IN ('goal_missed', 'choosing') AND missed_deadline < now())
                RETURNING id, creator_id, title
            """)
        )
    ).fetchall()
    await db.commit()
    for p in due:
        await _refund_contributions(db, p.id)
        await _notify_safe(
            db, p.creator_id, "sponsorship_pool_expired", "Your pool closed",
            f"\"{p.title}\" closed and every contribution was refunded.", f"/fund/pools/{p.id}", "View",
        )
    await _resolve_handoffs(db)
    await _resolve_votes(db)
    await _expire_jobs_pools(db)


async def _resolve_handoffs(db: AsyncSession) -> None:
    """A hand-off nobody accepted in HANDOFF_DAYS goes back to the starter to choose again."""
    rows = (
        await db.execute(
            text("""
                UPDATE sponsorship_pools
                SET status = 'choosing', handoff_group_id = NULL,
                    missed_deadline = now() + make_interval(days => :d)
                WHERE status = 'handoff' AND handoff_deadline < now()
                RETURNING id, creator_id, title
            """),
            {"d": MISSED_DAYS},
        )
    ).fetchall()
    await db.commit()
    for p in rows:
        await _notify_safe(
            db, p.creator_id, "sponsorship_pool_handoff_lapsed", "The group did not accept",
            f"Nobody accepted the hand-off for \"{p.title}\". Pick another plan to put the money to work.",
            f"/fund/pools/{p.id}", "Choose a plan",
        )


async def _resolve_votes(db: AsyncSession) -> None:
    """Close votes that ran out. The most-voted choice wins (ties go to the listed order); no votes
    at all refunds everyone."""
    due = (
        await db.execute(
            text("SELECT id, model, creator_id, title FROM sponsorship_pools WHERE status = 'voting' AND vote_deadline < now()")
        )
    ).fetchall()
    for p in due:
        counts = await _vote_counts(db, p.id, p.model)
        if sum(c["votes"] for c in counts) == 0:
            res = await db.execute(
                text("UPDATE sponsorship_pools SET status = 'expired' WHERE id = :id AND status = 'voting'"),
                {"id": str(p.id)},
            )
            await db.commit()
            if res.rowcount:
                await _refund_contributions(db, p.id)
                await _notify_safe(
                    db, p.creator_id, "sponsorship_pool_expired", "Your pool closed",
                    f"Nobody voted on \"{p.title}\", so every contribution was refunded.", f"/fund/pools/{p.id}", "View",
                )
            continue
        winner = max(counts, key=lambda c: c["votes"])["choice"]  # max keeps the first of equals
        raised = (
            await db.execute(
                text("SELECT COALESCE(SUM(amount_cents), 0)::int FROM sponsorship_pool_contributions WHERE pool_id = :p AND status = 'paid'"),
                {"p": str(p.id)},
            )
        ).scalar_one()
        rule = _vote_rule(p.model, winner, raised)
        claimed = (
            await db.execute(
                text("""
                    UPDATE sponsorship_pools p
                    SET status = 'active', payout_rule = CAST(:r AS jsonb)
                    WHERE p.id = :id AND p.status = 'voting'
                """ + _CLAIM_RETURNING),
                {"id": str(p.id), "r": json.dumps(rule)},
            )
        ).fetchone()
        if claimed is None:
            await db.rollback()
            continue
        await _build_sponsorship(db, claimed, p.id)


async def get_pool(db: AsyncSession, pool_id: UUID, viewer_id: UUID | None) -> dict:
    await expire_due_pools(db)
    row = (await db.execute(text(_POOL_SELECT + " WHERE p.id = :id"), {"id": str(pool_id)})).mappings().first()
    if row is None:
        raise PoolError(404, "Pool not found.")
    pool = dict(row)
    for k in ("id", "creator_id", "sponsorship_id", "handoff_group_id"):
        pool[k] = str(pool[k]) if pool[k] else None
    contributors = (
        await db.execute(
            text("""
                SELECT COALESCE(pr.display_name, pr.username) AS name, pr.avatar_url,
                       SUM(c.amount_cents)::int AS amount_cents
                FROM sponsorship_pool_contributions c JOIN profiles pr ON pr.id = c.user_id
                WHERE c.pool_id = :id AND c.status = 'paid'
                GROUP BY pr.id ORDER BY SUM(c.amount_cents) DESC LIMIT 25
            """),
            {"id": str(pool_id)},
        )
    ).mappings().all()
    pool["contributors"] = [dict(c) for c in contributors]
    mine = 0
    if viewer_id:
        mine = (
            await db.execute(
                text("""
                    SELECT COALESCE(SUM(amount_cents), 0)::int FROM sponsorship_pool_contributions
                    WHERE pool_id = :id AND user_id = :u AND status = 'paid'
                """),
                {"id": str(pool_id), "u": str(viewer_id)},
            )
        ).scalar_one()
    pool["my_contribution_cents"] = mine
    pool["is_creator"] = bool(viewer_id) and pool["creator_id"] == str(viewer_id)
    pool["can_respond_handoff"] = bool(
        viewer_id and pool["status"] == "handoff" and await _is_admin_of(db, UUID(pool["handoff_group_id"]), viewer_id)
    )
    if pool["plan_kind"] == "jobs" and pool["status"] in ("active", "closed"):
        await _jobs_view(db, pool, pool_id, viewer_id, mine > 0)
    if pool["plan_kind"] == "vote" and pool["status"] in ("voting", "active"):
        counts = await _vote_counts(db, pool_id, pool["model"])
        pool["vote_options"] = [
            {**c, "rule": _vote_rule(pool["model"], c["choice"], max(pool["raised_cents"], 100))} for c in counts
        ]
        my_vote = None
        if viewer_id:
            my_vote = (
                await db.execute(
                    text("SELECT choice FROM sponsorship_pool_votes WHERE pool_id = :p AND user_id = :u"),
                    {"p": str(pool_id), "u": str(viewer_id)},
                )
            ).scalar_one_or_none()
        pool["my_vote"] = my_vote
        pool["can_vote"] = pool["status"] == "voting" and mine > 0
    return pool


async def list_pools(db: AsyncSession, viewer_id: UUID | None) -> dict:
    await expire_due_pools(db)
    open_rows = (
        await db.execute(
            text(_POOL_SELECT + " WHERE p.status = 'open' ORDER BY p.deadline ASC LIMIT 50")
        )
    ).mappings().all()
    mine_rows = []
    if viewer_id:
        mine_rows = (
            await db.execute(
                text(
                    _POOL_SELECT
                    + """ WHERE p.status <> 'open' AND (p.creator_id = :u OR EXISTS (
                            SELECT 1 FROM sponsorship_pool_contributions c
                            WHERE c.pool_id = p.id AND c.user_id = :u AND c.status IN ('paid', 'refunded')))
                          ORDER BY p.created_at DESC LIMIT 20"""
                ),
                {"u": str(viewer_id)},
            )
        ).mappings().all()

    def clean(r):
        d = dict(r)
        for k in ("id", "creator_id", "sponsorship_id", "handoff_group_id"):
            d[k] = str(d[k]) if d[k] else None
        return d

    return {"open": [clean(r) for r in open_rows], "closed": [clean(r) for r in mine_rows]}


async def start_contribution(
    db: AsyncSession, pool_id: UUID, user_id: UUID, amount_cents: int, success_url: str, cancel_url: str
) -> str:
    await expire_due_pools(db)
    pool = (await db.execute(text(_POOL_SELECT + " WHERE p.id = :id"), {"id": str(pool_id)})).mappings().first()
    if pool is None:
        raise PoolError(404, "Pool not found.")
    if pool["status"] != "open":
        raise PoolError(409, "This pool is no longer taking contributions.")
    remaining = pool["goal_cents"] - pool["raised_cents"]
    if remaining <= 0:
        raise PoolError(409, "This pool already reached its goal.")
    if amount_cents < MIN_CONTRIBUTION_CENTS:
        raise PoolError(422, f"The minimum contribution is ${MIN_CONTRIBUTION_CENTS // 100}.")
    # Never collect more than the pool still needs (the last contributor tops it off exactly).
    amount_cents = min(amount_cents, remaining)
    row = (
        await db.execute(
            text("""
                INSERT INTO sponsorship_pool_contributions (pool_id, user_id, amount_cents)
                VALUES (:p, :u, :a) RETURNING id
            """),
            {"p": str(pool_id), "u": str(user_id), "a": amount_cents},
        )
    ).fetchone()
    await db.commit()
    meta = {"pool_contribution_id": str(row.id), "pool_id": str(pool_id)}
    try:
        session = _client().checkout.sessions.create(
            params={
                "mode": "payment",
                "line_items": [{
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": amount_cents,
                        "product_data": {
                            "name": f"Pooled sponsorship: {pool['title']}",
                            "description": "Held until the goal is met. Refunded in full if it is not.",
                        },
                    },
                    "quantity": 1,
                }],
                "success_url": success_url,
                "cancel_url": cancel_url,
                "metadata": meta,
                "payment_intent_data": {"metadata": meta},
            }
        )
    except stripe.StripeError as e:
        await db.execute(text("DELETE FROM sponsorship_pool_contributions WHERE id = :id"), {"id": str(row.id)})
        await db.commit()
        raise PoolError(400, str(e)) from e
    if not session.url:
        raise PoolError(502, "Stripe did not return a checkout link.")
    await db.execute(
        text("UPDATE sponsorship_pool_contributions SET stripe_checkout_session_id = :s WHERE id = :id"),
        {"s": session.id, "id": str(row.id)},
    )
    await db.commit()
    return session.url


async def mark_contribution_paid(db: AsyncSession, session: dict) -> bool:
    """Webhook hook (checkout.session.completed, mode=payment). Returns True when the session
    belonged to a pool contribution, whether or not it changed anything."""
    contribution_id = (session.get("metadata") or {}).get("pool_contribution_id")
    if not contribution_id:
        return False
    row = (
        await db.execute(
            text("""
                UPDATE sponsorship_pool_contributions
                SET status = 'paid', paid_at = now(), stripe_payment_intent_id = :pi
                WHERE id = :id AND status = 'pending'
                RETURNING id, pool_id, user_id, amount_cents
            """),
            {"id": contribution_id, "pi": session.get("payment_intent")},
        )
    ).fetchone()
    await db.commit()
    if row is None:
        return True
    pool = (
        await db.execute(
            text("SELECT status FROM sponsorship_pools WHERE id = :p"), {"p": str(row.pool_id)}
        )
    ).fetchone()
    if pool is None or pool.status != "open":
        # Paid after the pool closed: give it straight back.
        if pool is not None and pool.status in ("expired", "cancelled"):
            await _refund_contributions(db, row.pool_id)
        else:
            await _refund_contributions(db, row.pool_id, only_id=str(row.id))
        return True
    await _notify_safe(
        db, row.user_id, "sponsorship_pool_thanks", "Thanks for chipping in",
        f"${row.amount_cents / 100:.2f} is held until the pool reaches its goal.",
        f"/fund/pools/{row.pool_id}", "View pool",
    )
    await _activate_if_funded(db, row.pool_id)
    return True


_CLAIM_RETURNING = """
    RETURNING p.id, p.creator_id, p.title, p.message, p.payout_rule, p.cap_per_user_cents,
              p.model, p.area_source, p.area_name, p.plan_kind, p.handoff_group_id, p.status AS new_status,
              p.site_label, p.site_location, p.site_radius_meters,
              (SELECT SUM(c.amount_cents) FROM sponsorship_pool_contributions c
               WHERE c.pool_id = p.id AND c.status = 'paid')::int AS total_cents
"""


async def _activate_if_funded(db: AsyncSession, pool_id: UUID) -> None:
    """When paid contributions reach the goal, move the pool on according to its plan."""
    await _advance(db, pool_id, "open", require_goal=True)


async def _advance(db: AsyncSession, pool_id: UUID, from_status: str, *, require_goal: bool):
    """Move a pool that has its money on to what its plan says, exactly once: a rule plan activates
    a funded sponsorship, a group plan waits for the group's admin, a vote plan opens the vote."""
    goal = (
        """ AND (SELECT COALESCE(SUM(c.amount_cents), 0) FROM sponsorship_pool_contributions c
                WHERE c.pool_id = p.id AND c.status = 'paid') >= p.goal_cents"""
        if require_goal
        else ""
    )
    claimed = (
        await db.execute(
            text("""
                UPDATE sponsorship_pools p
                SET status = CASE p.plan_kind WHEN 'rule' THEN 'active' WHEN 'jobs' THEN 'active' WHEN 'group' THEN 'handoff' ELSE 'voting' END,
                    activated_at = now(), missed_deadline = NULL,
                    jobs_deadline = CASE WHEN p.plan_kind = 'jobs' THEN now() + make_interval(days => :jd) END,
                    handoff_deadline = CASE WHEN p.plan_kind = 'group' THEN now() + make_interval(days => :hd) END,
                    vote_deadline = CASE WHEN p.plan_kind = 'vote' THEN now() + make_interval(days => :vd) END
                WHERE p.id = :id AND p.status = :from_status
            """ + goal + _CLAIM_RETURNING),
            {"id": str(pool_id), "from_status": from_status, "hd": HANDOFF_DAYS, "vd": VOTE_DAYS, "jd": JOBS_DAYS},
        )
    ).fetchone()
    if claimed is None:
        await db.commit()
        return None
    if claimed.new_status == "active" and claimed.plan_kind == "jobs":
        await db.commit()
        donors = (
            await db.execute(
                text("SELECT DISTINCT user_id FROM sponsorship_pool_contributions WHERE pool_id = :p AND status = 'paid'"),
                {"p": str(pool_id)},
            )
        ).scalars().all()
        for uid in donors:
            await _notify_safe(
                db, uid, "sponsorship_pool_funded", "Pool funded",
                f"\"{claimed.title}\" is funded. The starter will post cleaning jobs paid from it, and you approve the finished work.",
                f"/fund/pools/{pool_id}", "View pool",
            )
    elif claimed.new_status == "active":
        await _build_sponsorship(db, claimed, pool_id)
    elif claimed.new_status == "handoff":
        await db.commit()
        for uid in await _group_admin_ids(db, claimed.handoff_group_id):
            await _notify_safe(
                db, uid, "sponsorship_pool_handoff", "A funded cleanup area is offered to your group",
                f"\"{claimed.title}\" raised the money and wants your group to run it. You have {HANDOFF_DAYS} days to accept or decline.",
                f"/fund/pools/{pool_id}", "Review",
            )
    else:
        await db.commit()
        donors = (
            await db.execute(
                text("SELECT DISTINCT user_id FROM sponsorship_pool_contributions WHERE pool_id = :p AND status = 'paid'"),
                {"p": str(pool_id)},
            )
        ).scalars().all()
        for uid in donors:
            await _notify_safe(
                db, uid, "sponsorship_pool_vote", "Vote on how the money is used",
                f"\"{claimed.title}\" is funded. Contributors have {VOTE_DAYS} days to vote.",
                f"/fund/pools/{pool_id}", "Vote",
            )
    return claimed


async def _build_sponsorship(db: AsyncSession, claimed, pool_id: UUID) -> None:
    """Create the single funded sponsorship for a pool that has a payout rule, then tell donors."""
    directed = claimed.handoff_group_id if claimed.plan_kind == "group" else None
    sponsorship = (
        await db.execute(
            text("""
                INSERT INTO sponsorships
                    (sponsor_type, sponsor_user_id, target_type, amount_cents, message, status,
                     model, payout_rule, cap_per_user_cents, remaining_cents, funded_at,
                     site_label, site_location, site_radius_meters,
                     area_geometry, area_source, area_name, directed_group_id)
                VALUES ('user', :creator, :target_type, :amount, :message, 'funded',
                        :model, CAST(:rule AS jsonb), :cap, :amount, now(),
                        :label, (SELECT site_location FROM sponsorship_pools WHERE id = :pid), :radius,
                        (SELECT area_geometry FROM sponsorship_pools WHERE id = :pid), :area_source, :area_name,
                        CAST(:directed AS uuid))
                RETURNING id
            """),
            {
                "creator": str(claimed.creator_id), "amount": claimed.total_cents,
                "message": claimed.message or f"Community pool: {claimed.title}",
                "rule": json.dumps(claimed.payout_rule), "cap": claimed.cap_per_user_cents,
                "label": claimed.site_label, "pid": str(pool_id),
                "radius": claimed.site_radius_meters, "model": claimed.model,
                "target_type": "area" if claimed.model == "group_area" else "site",
                "area_source": claimed.area_source, "area_name": claimed.area_name,
                "directed": str(directed) if directed else None,
            },
        )
    ).fetchone()
    await db.execute(
        text("UPDATE sponsorship_pools SET sponsorship_id = :s WHERE id = :p"),
        {"s": str(sponsorship.id), "p": str(pool_id)},
    )
    await db.commit()
    donors = (
        await db.execute(
            text("""
                SELECT DISTINCT user_id FROM sponsorship_pool_contributions
                WHERE pool_id = :p AND status = 'paid'
            """),
            {"p": str(pool_id)},
        )
    ).scalars().all()
    body = (
        f"\"{claimed.title}\" hit its goal and was accepted by its group."
        if directed
        else f"\"{claimed.title}\" is funded and now open for neighbors to claim."
    )
    for uid in donors:
        await _notify_safe(db, uid, "sponsorship_pool_funded", "Pool funded", body, f"/fund/pools/{pool_id}", "View pool")


async def _creator_row(db: AsyncSession, pool_id: UUID, user_id: UUID, is_admin: bool, what: str):
    row = (
        await db.execute(
            text("SELECT creator_id, status, model, sponsorship_id, plan_kind, goal_cents FROM sponsorship_pools WHERE id = :id"),
            {"id": str(pool_id)},
        )
    ).fetchone()
    if row is None:
        raise PoolError(404, "Pool not found.")
    if row.creator_id != user_id and not is_admin:
        raise PoolError(403, f"Only the person who started the pool can {what}.")
    return row


async def cancel_pool(db: AsyncSession, pool_id: UUID, user_id: UUID, is_admin: bool) -> None:
    row = await _creator_row(db, pool_id, user_id, is_admin, "cancel it")
    if row.status not in ("open", "goal_missed", "choosing", "handoff"):
        raise PoolError(409, "This pool can no longer be cancelled.")
    await db.execute(
        text("UPDATE sponsorship_pools SET status = 'cancelled' WHERE id = :id AND status IN ('open', 'goal_missed', 'choosing', 'handoff')"),
        {"id": str(pool_id)},
    )
    await db.commit()
    await _refund_contributions(db, pool_id)


async def run_with_raised(db: AsyncSession, pool_id: UUID, user_id: UUID, is_admin: bool) -> dict:
    """A pool that missed its goal: the starter goes ahead with whatever was raised."""
    await _creator_row(db, pool_id, user_id, is_admin, "go ahead with it")
    if await _advance(db, pool_id, "goal_missed", require_goal=False) is None:
        raise PoolError(409, "This pool did not miss its goal.")
    return await get_pool(db, pool_id, user_id)


async def extend_pool(db: AsyncSession, pool_id: UUID, user_id: UUID, is_admin: bool, days: int) -> dict:
    """A pool that missed its goal: reopen it for more contributions."""
    await _creator_row(db, pool_id, user_id, is_admin, "extend it")
    window = min(max(days or POOL_DAYS_DEFAULT, 3), POOL_DAYS_MAX)
    res = await db.execute(
        text("""
            UPDATE sponsorship_pools
            SET status = 'open', missed_deadline = NULL, deadline = now() + make_interval(days => :d)
            WHERE id = :id AND status = 'goal_missed'
        """),
        {"id": str(pool_id), "d": window},
    )
    if res.rowcount == 0:
        await db.rollback()
        raise PoolError(409, "This pool did not miss its goal.")
    await db.commit()
    return await get_pool(db, pool_id, user_id)


async def change_payout_plan(
    db: AsyncSession, pool_id: UUID, user_id: UUID, is_admin: bool, payout_rule: dict | None,
    *, kind: str = "rule", group_id: UUID | None = None, note: str | None = None, date: str | None = None,
) -> dict:
    """Starter (or an admin) changes how the money will be used. Allowed while the pool is raising,
    after a missed goal, after a hand-off fell through ('choosing', which then moves on), and after
    it is funded as long as nothing was paid out. A chosen vote cannot be changed."""
    row = await _creator_row(db, pool_id, user_id, is_admin, "change the plan")
    if row.plan_kind == "vote" and row.status in ("voting", "active"):
        raise PoolError(409, "A contributor vote cannot be changed once it has started.")
    if row.status == "handoff":
        raise PoolError(409, "This pool is waiting on a group to accept it. If they decline or do not answer, you can choose again.")
    if row.status not in ("open", "goal_missed", "choosing", "active"):
        raise PoolError(409, "This pool is closed, so its plan cannot change.")
    if row.plan_kind == "jobs" and row.status == "active":
        raise PoolError(409, "A jobs budget cannot be changed once it is funded. Close it to refund what is left.")
    if row.status == "active" and (kind != "rule" or row.plan_kind != "rule"):
        raise PoolError(409, "A funded pool can only switch between payout amounts.")
    rule, group = await _validate_plan(db, row.model, kind, payout_rule, group_id, row.goal_cents)
    if row.status == "active":
        spent = (
            await db.execute(
                text("SELECT amount_cents <> remaining_cents AS spent FROM sponsorships WHERE id = :s"),
                {"s": str(row.sponsorship_id)},
            )
        ).scalar_one_or_none()
        if spent is None or spent:
            raise PoolError(409, "Money has already been paid out, so the plan can no longer change.")
        await db.execute(
            text("UPDATE sponsorships SET payout_rule = CAST(:r AS jsonb) WHERE id = :s"),
            {"r": json.dumps(rule), "s": str(row.sponsorship_id)},
        )
    await db.execute(
        text("""
            UPDATE sponsorship_pools
            SET payout_rule = CAST(:r AS jsonb), plan_kind = :k, handoff_group_id = CAST(:g AS uuid),
                handoff_note = :n, handoff_date = CAST(:d AS date)
            WHERE id = :id
        """),
        {
            "r": json.dumps(rule) if rule else None, "k": kind, "g": str(group) if group else None,
            "n": (note or "").strip()[:200] or None if kind == "group" else None,
            "d": _parse_date(date) if kind == "group" else None, "id": str(pool_id),
        },
    )
    await db.commit()
    if row.status == "choosing":
        await _advance(db, pool_id, "choosing", require_goal=False)
    return await get_pool(db, pool_id, user_id)


async def search_groups(db: AsyncSession, q: str) -> list[dict]:
    """Groups to offer a funded area to: name search, newest first, a short list."""
    rows = (
        await db.execute(
            text("""
                SELECT g.id, g.name, g.slug,
                       (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id)::int AS member_count
                FROM groups g
                WHERE (:q = '' OR g.name ILIKE '%' || :q || '%')
                ORDER BY g.featured DESC NULLS LAST, member_count DESC, g.name
                LIMIT 20
            """),
            {"q": (q or "").strip()[:60]},
        )
    ).fetchall()
    return [{"id": str(r.id), "name": r.name, "slug": r.slug, "member_count": r.member_count} for r in rows]


async def respond_handoff(db: AsyncSession, pool_id: UUID, user_id: UUID, accept: bool) -> dict:
    """A group admin accepts or declines a pool handed to their group."""
    row = (
        await db.execute(
            text("SELECT status, handoff_group_id, creator_id, title FROM sponsorship_pools WHERE id = :id"),
            {"id": str(pool_id)},
        )
    ).fetchone()
    if row is None:
        raise PoolError(404, "Pool not found.")
    if row.status != "handoff":
        raise PoolError(409, "This pool is not waiting on a group.")
    if not await _is_admin_of(db, row.handoff_group_id, user_id):
        raise PoolError(403, "Only an admin of that group can answer this.")
    if accept:
        if not await connect.group_payouts_ready(db, row.handoff_group_id):
            raise PoolError(409, "Your group needs a payout account before it can accept. Add one on the group page first.")
        claimed = (
            await db.execute(
                text("""
                    UPDATE sponsorship_pools p SET status = 'active', handoff_deadline = NULL
                    WHERE p.id = :id AND p.status = 'handoff'
                """ + _CLAIM_RETURNING),
                {"id": str(pool_id)},
            )
        ).fetchone()
        if claimed is None:
            await db.rollback()
            raise PoolError(409, "This pool is not waiting on a group.")
        await _build_sponsorship(db, claimed, pool_id)
        await _notify_safe(
            db, row.creator_id, "sponsorship_pool_handoff_accepted", "Your group accepted",
            f"The group accepted \"{row.title}\" and can now host cleanups on it.", f"/fund/pools/{pool_id}", "View",
        )
    else:
        res = await db.execute(
            text("""
                UPDATE sponsorship_pools
                SET status = 'choosing', handoff_group_id = NULL, handoff_deadline = NULL,
                    missed_deadline = now() + make_interval(days => :d)
                WHERE id = :id AND status = 'handoff'
            """),
            {"id": str(pool_id), "d": MISSED_DAYS},
        )
        await db.commit()
        if res.rowcount:
            await _notify_safe(
                db, row.creator_id, "sponsorship_pool_handoff_declined", "The group declined",
                f"The group declined \"{row.title}\". Pick another plan to put the money to work.",
                f"/fund/pools/{pool_id}", "Choose a plan",
            )
    return await get_pool(db, pool_id, user_id)


async def cast_vote(db: AsyncSession, pool_id: UUID, user_id: UUID, choice: str) -> dict:
    """One contributor, one vote. A vote can be changed until the vote closes."""
    await expire_due_pools(db)
    pool = (
        await db.execute(
            text("SELECT status, model, vote_deadline FROM sponsorship_pools WHERE id = :id"), {"id": str(pool_id)}
        )
    ).fetchone()
    if pool is None:
        raise PoolError(404, "Pool not found.")
    if pool.status != "voting":
        raise PoolError(409, "This pool is not taking votes.")
    if choice not in VOTE_CHOICES[pool.model]:
        raise PoolError(422, "That is not one of the choices.")
    paid = (
        await db.execute(
            text("SELECT 1 FROM sponsorship_pool_contributions WHERE pool_id = :p AND user_id = :u AND status = 'paid' LIMIT 1"),
            {"p": str(pool_id), "u": str(user_id)},
        )
    ).fetchone()
    if paid is None:
        raise PoolError(403, "Only people who chipped in can vote.")
    await db.execute(
        text("""
            INSERT INTO sponsorship_pool_votes (pool_id, user_id, choice) VALUES (:p, :u, :c)
            ON CONFLICT (pool_id, user_id) DO UPDATE SET choice = EXCLUDED.choice
        """),
        {"p": str(pool_id), "u": str(user_id), "c": choice},
    )
    await db.commit()
    return await get_pool(db, pool_id, user_id)


# ------------------------------------------------------------------ jobs budget

JOBS_DAYS = 90  # how long a jobs-budget pool can post work before it closes and refunds what is left
_DEAD_JOB = ("cancelled", "expired", "refunded", "declined")
_LIVE_JOB = ("accepted", "in_progress", "completed", "disputed")


async def _balance(db: AsyncSession, pool_id: UUID) -> dict:
    """Raised, committed to jobs (anything not cancelled, expired or refunded) and what is left."""
    row = (
        await db.execute(
            text("""
                SELECT COALESCE((SELECT SUM(c.amount_cents) FROM sponsorship_pool_contributions c
                                 WHERE c.pool_id = :p AND c.status = 'paid'), 0)::int AS raised,
                       COALESCE((SELECT SUM(j.price_cents) FROM marketplace_jobs j
                                 WHERE j.pool_id = :p AND j.status <> ALL(CAST(:dead AS text[]))), 0)::int AS committed
            """),
            {"p": str(pool_id), "dead": list(_DEAD_JOB)},
        )
    ).fetchone()
    return {"raised_cents": row.raised, "committed_cents": row.committed, "balance_cents": row.raised - row.committed}


async def _is_contributor(db: AsyncSession, pool_id: UUID, user_id: UUID) -> bool:
    return (
        await db.execute(
            text("SELECT 1 FROM sponsorship_pool_contributions WHERE pool_id = :p AND user_id = :u AND status = 'paid' LIMIT 1"),
            {"p": str(pool_id), "u": str(user_id)},
        )
    ).fetchone() is not None


async def post_job(db: AsyncSession, pool_id: UUID, user_id: UUID, fields: dict) -> dict:
    """The starter posts a cleaning job paid from the pool. It goes on the board; the cleaner is paid
    from the pool when a contributor approves the work (or the usual auto-release passes)."""
    from app.services import marketplace

    row = (
        await db.execute(
            text("SELECT creator_id, status, plan_kind, jobs_frozen, jobs_deadline, model FROM sponsorship_pools WHERE id = :id FOR UPDATE"),
            {"id": str(pool_id)},
        )
    ).fetchone()
    if row is None:
        raise PoolError(404, "Pool not found.")
    if row.creator_id != user_id:
        raise PoolError(403, "Only the person who started the pool can post jobs.")
    if row.plan_kind != "jobs" or row.status != "active":
        raise PoolError(409, "This pool is not open for jobs.")
    if row.jobs_frozen:
        raise PoolError(409, "Posting jobs is paused on this pool.")
    price = int(fields.get("price_cents") or 0)
    floor = await min_payment_cents(db)
    if price < floor:
        raise PoolError(422, f"A job must pay at least ${floor / 100:.0f}.")
    bal = await _balance(db, pool_id)
    if price > bal["balance_cents"]:
        raise PoolError(422, f"Only ${bal['balance_cents'] / 100:.2f} is left in this pool.")
    lat, lon = fields.get("latitude"), fields.get("longitude")
    poly = fields.get("polygon")
    if (lat is None or lon is None) and poly:
        lon = sum(p[0] for p in poly) / len(poly)  # a drawn area: check its middle sits inside the pool
        lat = sum(p[1] for p in poly) / len(poly)
    if lat is None or lon is None:
        raise PoolError(422, "Drop a pin for the job location.")
    inside = (
        await db.execute(
            text("""
                SELECT CASE WHEN p.model = 'site'
                            THEN ST_DWithin(p.site_location, pt.g, COALESCE(p.site_radius_meters, 0) + 50)
                            ELSE ST_Intersects(p.area_geometry, pt.g::geometry) END
                FROM sponsorship_pools p,
                     LATERAL (SELECT ST_SetSRID(ST_MakePoint(CAST(:lon AS double precision), CAST(:lat AS double precision)), 4326)::geography AS g) pt
                WHERE p.id = :id
            """),
            {"id": str(pool_id), "lon": lon, "lat": lat},
        )
    ).scalar_one_or_none()
    if not inside:
        raise PoolError(422, "A pool job has to be inside the pool's cleanup site or area.")
    fields = {k: v for k, v in fields.items() if k not in ("cleaner_id", "pool_id")}
    try:
        job = await marketplace.create_job(db, user_id, cleaner_id=None, pool_id=pool_id, **fields)
    except marketplace.MarketplaceError as e:
        await db.rollback()
        raise PoolError(e.status, e.message) from e
    return job


async def _contributor_gate(db: AsyncSession, pool_id: UUID, job_id: UUID, user_id: UUID, is_admin: bool):
    row = (
        await db.execute(
            text("SELECT status, jobs_frozen FROM sponsorship_pools p WHERE p.id = :p AND EXISTS "
                 "(SELECT 1 FROM marketplace_jobs j WHERE j.id = :j AND j.pool_id = p.id)"),
            {"p": str(pool_id), "j": str(job_id)},
        )
    ).fetchone()
    if row is None:
        raise PoolError(404, "Job not found.")
    if not is_admin and not await _is_contributor(db, pool_id, user_id):
        raise PoolError(403, "Only people who chipped in can review the work.")
    return row


async def approve_job(db: AsyncSession, pool_id: UUID, job_id: UUID, user_id: UUID, is_admin: bool) -> dict:
    from app.services import marketplace

    row = await _contributor_gate(db, pool_id, job_id, user_id, is_admin)
    if row.jobs_frozen:
        raise PoolError(409, "This pool is paused, so payouts are on hold.")
    try:
        return await marketplace.approve_pool_job(db, job_id, user_id)
    except marketplace.MarketplaceError as e:
        raise PoolError(e.status, e.message) from e


async def dispute_job(db: AsyncSession, pool_id: UUID, job_id: UUID, user_id: UUID, is_admin: bool, details: str) -> dict:
    from app.services import marketplace

    await _contributor_gate(db, pool_id, job_id, user_id, is_admin)
    try:
        return await marketplace.dispute_job(db, job_id, user_id, details, as_contributor=True)
    except marketplace.MarketplaceError as e:
        raise PoolError(e.status, e.message) from e


async def set_frozen(db: AsyncSession, pool_id: UUID, frozen: bool) -> dict:
    """Admin only (the route checks): stop new jobs, takes and payouts while something is looked into."""
    res = await db.execute(
        text("UPDATE sponsorship_pools SET jobs_frozen = :f WHERE id = :id AND plan_kind = 'jobs' AND status = 'active'"),
        {"f": frozen, "id": str(pool_id)},
    )
    await db.commit()
    if res.rowcount == 0:
        raise PoolError(409, "This pool has no jobs budget to freeze.")
    return await get_pool(db, pool_id, None)


async def _close_jobs_pool(db: AsyncSession, pool_id: UUID) -> int:
    """Close a jobs pool: cancel unclaimed jobs, refund what is left pro rata. Refuses while work is
    in flight. Returns how many contributions got money back."""
    row = (
        await db.execute(
            text("SELECT status, plan_kind, title, creator_id FROM sponsorship_pools WHERE id = :id FOR UPDATE"),
            {"id": str(pool_id)},
        )
    ).fetchone()
    if row is None:
        raise PoolError(404, "Pool not found.")
    if row.plan_kind != "jobs" or row.status != "active":
        raise PoolError(409, "This pool cannot be closed.")
    live = (
        await db.execute(
            text("SELECT count(*) FROM marketplace_jobs WHERE pool_id = :p AND status = ANY(CAST(:live AS text[]))"),
            {"p": str(pool_id), "live": list(_LIVE_JOB)},
        )
    ).scalar_one()
    if live:
        raise PoolError(409, "Some jobs are still being worked on or waiting for approval. Finish those first.")
    await db.execute(
        text("UPDATE marketplace_jobs SET status = 'cancelled', cancel_reason = 'The pool closed' "
             "WHERE pool_id = :p AND status IN ('open', 'requested')"),
        {"p": str(pool_id)},
    )
    await db.execute(
        text("UPDATE sponsorship_pools SET status = 'closed', closed_at = now() WHERE id = :id"), {"id": str(pool_id)}
    )
    await db.commit()
    bal = await _balance(db, pool_id)
    refunded = 0
    if bal["balance_cents"] > 0 and bal["raised_cents"] > 0:
        rows = (
            await db.execute(
                text("""
                    SELECT id, user_id, amount_cents, refunded_cents, stripe_payment_intent_id
                    FROM sponsorship_pool_contributions WHERE pool_id = :p AND status = 'paid'
                """),
                {"p": str(pool_id)},
            )
        ).fetchall()
        for r in rows:
            share = (r.amount_cents * bal["balance_cents"]) // bal["raised_cents"] - r.refunded_cents
            if share < 1:
                continue
            try:
                if r.stripe_payment_intent_id:
                    _client().refunds.create(
                        params={"payment_intent": r.stripe_payment_intent_id, "amount": share},
                        options={"idempotency_key": f"pool-close-{r.id}-{share}"},
                    )
                await db.execute(
                    text("UPDATE sponsorship_pool_contributions SET refunded_cents = refunded_cents + :s WHERE id = :id"),
                    {"s": share, "id": str(r.id)},
                )
                await db.commit()
                refunded += 1
                await _notify_safe(
                    db, r.user_id, "sponsorship_pool_refunded", "Unspent money returned",
                    f"${share / 100:.2f} of your contribution to \"{row.title}\" was not needed and is on its way back.",
                    f"/fund/pools/{pool_id}", "View pool",
                )
            except Exception:
                await db.rollback()
                logger.exception("sponsorship pool: close refund failed for contribution %s", r.id)
    return refunded


async def close_pool(db: AsyncSession, pool_id: UUID, user_id: UUID, is_admin: bool) -> dict:
    await _creator_row(db, pool_id, user_id, is_admin, "close it")
    await _close_jobs_pool(db, pool_id)
    return await get_pool(db, pool_id, user_id)


async def _expire_jobs_pools(db: AsyncSession) -> None:
    due = (
        await db.execute(
            text("SELECT id FROM sponsorship_pools WHERE status = 'active' AND plan_kind = 'jobs' AND jobs_deadline < now()")
        )
    ).scalars().all()
    for pid in due:
        try:
            await _close_jobs_pool(db, pid)
        except PoolError:
            await db.rollback()  # work still in flight: try again on a later read


async def _jobs_view(db: AsyncSession, pool: dict, pool_id: UUID, viewer_id: UUID | None, is_contributor: bool) -> None:
    """Money left, and the jobs (title, price, state, after photos) for the people who funded or run it."""
    bal = await _balance(db, pool_id)
    pool.update(bal)
    pool["jobs_frozen"] = bool(pool.get("jobs_frozen"))
    can_see = pool["is_creator"] or is_contributor
    pool["jobs"] = []
    pool["can_approve"] = bool(viewer_id) and is_contributor and not pool["is_creator"] and not pool["jobs_frozen"]
    if not can_see:
        return
    rows = (
        await db.execute(
            text("""
                SELECT j.id, j.title, j.price_cents, j.status, j.created_at, j.completed_at, j.release_after,
                       COALESCE(cl.display_name, cl.username) AS cleaner_name,
                       COALESCE((SELECT json_agg(ph.url ORDER BY ph.created_at) FROM marketplace_job_photos ph
                                 WHERE ph.job_id = j.id AND ph.kind = 'after'), '[]'::json) AS after_photos
                FROM marketplace_jobs j LEFT JOIN profiles cl ON cl.id = j.cleaner_id
                WHERE j.pool_id = :p ORDER BY j.created_at DESC LIMIT 100
            """),
            {"p": str(pool_id)},
        )
    ).mappings().all()
    pool["jobs"] = [{**dict(r), "id": str(r["id"])} for r in rows]
