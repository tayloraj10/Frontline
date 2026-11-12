"""Pooled sponsored sites. One person starts a pool (a cleanup site, a payout rule, a goal and a
deadline); anyone can add money through Stripe Checkout. The platform holds the money. When paid
contributions reach the goal, the pool activates by creating ONE funded site sponsorship, so
claiming, payouts and refunds reuse the sponsorship machinery. A pool that misses its deadline
(or is cancelled by its creator) refunds every paid contribution.
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

import stripe
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services import sponsored_cleanups
from app.services.marketplace import _notify_safe
from app.services.game_settings import min_payment_cents

logger = logging.getLogger(__name__)


MAX_GOAL_CENTS = 500_000
MIN_CONTRIBUTION_CENTS = 500
POOL_DAYS_DEFAULT = 30
POOL_DAYS_MAX = 90


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
           p.site_label, ST_Y(p.site_location::geometry) AS site_latitude,
           ST_X(p.site_location::geometry) AS site_longitude, p.site_radius_meters,
           p.status, p.deadline, p.sponsorship_id, p.activated_at, p.created_at,
           COALESCE(pr.display_name, pr.username) AS creator_name,
           COALESCE((SELECT SUM(c.amount_cents) FROM sponsorship_pool_contributions c
                     WHERE c.pool_id = p.id AND c.status = 'paid'), 0)::int AS raised_cents,
           (SELECT COUNT(DISTINCT c.user_id) FROM sponsorship_pool_contributions c
             WHERE c.pool_id = p.id AND c.status = 'paid')::int AS contributor_count
    FROM sponsorship_pools p
    JOIN profiles pr ON pr.id = p.creator_id
"""


async def create_pool(
    db: AsyncSession,
    creator_id: UUID,
    *,
    title: str,
    message: str | None,
    goal_cents: int,
    payout_rule: dict,
    cap_per_user_cents: int | None,
    site_label: str,
    latitude: float,
    longitude: float,
    radius_meters: int,
    days: int | None,
) -> dict:
    title = (title or "").strip()
    if not 3 <= len(title) <= 80:
        raise PoolError(422, "Give the pool a title of 3 to 80 characters.")
    min_goal = await min_payment_cents(db)
    if not min_goal <= goal_cents <= MAX_GOAL_CENTS:
        raise PoolError(
            422, f"Goal must be between ${min_goal // 100} and ${MAX_GOAL_CENTS // 100}."
        )
    site_label = (site_label or "").strip()[:80]
    if not site_label:
        raise PoolError(422, "Pick a place for the cleanup site.")
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise PoolError(422, "Site coordinates are out of range.")
    message = (message or "").strip()[:500] or None
    try:
        sponsored_cleanups.validate_site_radius(radius_meters)
        rule = sponsored_cleanups.validate_payout_rule("site", payout_rule or {})
    except sponsored_cleanups.SponsoredError as e:
        raise PoolError(e.status_code, e.detail) from e
    if cap_per_user_cents is not None and cap_per_user_cents <= 0:
        raise PoolError(422, "Per-person cap must be positive.")
    window = min(max(days or POOL_DAYS_DEFAULT, 3), POOL_DAYS_MAX)
    row = (
        await db.execute(
            text("""
                INSERT INTO sponsorship_pools
                    (creator_id, title, message, goal_cents, payout_rule, cap_per_user_cents,
                     site_label, site_location, site_radius_meters, deadline)
                VALUES (:creator, :title, :message, :goal, CAST(:rule AS jsonb), :cap, :label,
                        ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :radius, :deadline)
                RETURNING id
            """),
            {
                "creator": str(creator_id), "title": title, "message": message, "goal": goal_cents,
                "rule": json.dumps(rule), "cap": cap_per_user_cents, "label": site_label,
                "lon": longitude, "lat": latitude, "radius": radius_meters,
                "deadline": datetime.now(timezone.utc) + timedelta(days=window),
            },
        )
    ).fetchone()
    await db.commit()
    return await get_pool(db, row.id, creator_id)


async def _refund_contributions(db: AsyncSession, pool_id: UUID) -> int:
    """Refund every paid contribution of a pool. Marks a row refunded only once Stripe accepts it,
    so a partial failure can be retried by calling this again."""
    rows = (
        await db.execute(
            text("""
                SELECT id, user_id, amount_cents, stripe_payment_intent_id
                FROM sponsorship_pool_contributions
                WHERE pool_id = :p AND status = 'paid'
            """),
            {"p": str(pool_id)},
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
    """Lazy expiry: runs whenever pools are read, so no scheduler is needed."""
    due = (
        await db.execute(
            text("""
                UPDATE sponsorship_pools SET status = 'expired'
                WHERE status = 'open' AND deadline < now()
                RETURNING id, creator_id, title
            """)
        )
    ).fetchall()
    await db.commit()
    for p in due:
        await _refund_contributions(db, p.id)
        await _notify_safe(
            db, p.creator_id, "sponsorship_pool_expired", "Your pool did not reach its goal",
            f"\"{p.title}\" closed and every contribution was refunded.", f"/fund/pools/{p.id}", "View",
        )


async def get_pool(db: AsyncSession, pool_id: UUID, viewer_id: UUID | None) -> dict:
    await expire_due_pools(db)
    row = (await db.execute(text(_POOL_SELECT + " WHERE p.id = :id"), {"id": str(pool_id)})).mappings().first()
    if row is None:
        raise PoolError(404, "Pool not found.")
    pool = dict(row)
    for k in ("id", "creator_id", "sponsorship_id"):
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
    return pool


async def list_pools(db: AsyncSession, viewer_id: UUID) -> dict:
    await expire_due_pools(db)
    open_rows = (
        await db.execute(
            text(_POOL_SELECT + " WHERE p.status = 'open' ORDER BY p.deadline ASC LIMIT 50")
        )
    ).mappings().all()
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
        for k in ("id", "creator_id", "sponsorship_id"):
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
                RETURNING pool_id, user_id, amount_cents
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
        await _refund_contributions(db, row.pool_id)
        return True
    await _notify_safe(
        db, row.user_id, "sponsorship_pool_thanks", "Thanks for chipping in",
        f"${row.amount_cents / 100:.2f} is held until the pool reaches its goal.",
        f"/fund/pools/{row.pool_id}", "View pool",
    )
    await _activate_if_funded(db, row.pool_id)
    return True


async def _activate_if_funded(db: AsyncSession, pool_id: UUID) -> None:
    """Flip an open pool to active and create its single funded site sponsorship, exactly once."""
    claimed = (
        await db.execute(
            text("""
                UPDATE sponsorship_pools p SET status = 'active', activated_at = now()
                WHERE p.id = :id AND p.status = 'open'
                  AND (SELECT COALESCE(SUM(c.amount_cents), 0) FROM sponsorship_pool_contributions c
                       WHERE c.pool_id = p.id AND c.status = 'paid') >= p.goal_cents
                RETURNING p.id, p.creator_id, p.title, p.message, p.payout_rule, p.cap_per_user_cents,
                          p.site_label, p.site_location, p.site_radius_meters,
                          (SELECT SUM(c.amount_cents) FROM sponsorship_pool_contributions c
                           WHERE c.pool_id = p.id AND c.status = 'paid')::int AS total_cents
            """),
            {"id": str(pool_id)},
        )
    ).fetchone()
    if claimed is None:
        await db.commit()
        return
    sponsorship = (
        await db.execute(
            text("""
                INSERT INTO sponsorships
                    (sponsor_type, sponsor_user_id, target_type, amount_cents, message, status,
                     model, payout_rule, cap_per_user_cents, remaining_cents, funded_at,
                     site_label, site_location, site_radius_meters)
                VALUES ('user', :creator, 'site', :amount, :message, 'funded',
                        'site', CAST(:rule AS jsonb), :cap, :amount, now(),
                        :label, (SELECT site_location FROM sponsorship_pools WHERE id = :pid), :radius)
                RETURNING id
            """),
            {
                "creator": str(claimed.creator_id), "amount": claimed.total_cents,
                "message": claimed.message or f"Community pool: {claimed.title}",
                "rule": json.dumps(claimed.payout_rule), "cap": claimed.cap_per_user_cents,
                "label": claimed.site_label, "pid": str(pool_id),
                "radius": claimed.site_radius_meters,
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
    for uid in donors:
        await _notify_safe(
            db, uid, "sponsorship_pool_funded", "Pool funded",
            f"\"{claimed.title}\" hit its goal and is now open for neighbors to claim.",
            f"/fund/pools/{pool_id}", "View pool",
        )


async def cancel_pool(db: AsyncSession, pool_id: UUID, user_id: UUID, is_admin: bool) -> None:
    row = (
        await db.execute(
            text("SELECT creator_id, status FROM sponsorship_pools WHERE id = :id"), {"id": str(pool_id)}
        )
    ).fetchone()
    if row is None:
        raise PoolError(404, "Pool not found.")
    if row.creator_id != user_id and not is_admin:
        raise PoolError(403, "Only the person who started the pool can cancel it.")
    if row.status != "open":
        raise PoolError(409, "Only an open pool can be cancelled.")
    await db.execute(
        text("UPDATE sponsorship_pools SET status = 'cancelled' WHERE id = :id AND status = 'open'"),
        {"id": str(pool_id)},
    )
    await db.commit()
    await _refund_contributions(db, pool_id)
