"""Stripe one-time Checkout plumbing for sponsorships (payments use case 3 in
dev-docs/payments-scoping-2026-08-20.md), funding-only scope: a sponsor (individual user
or partner business) pays to fund a specific cleanup event or a geo area. No Stripe
Connect / payout rails here -- money collected sits with the platform. "released" is a
manual admin-tracked status flag (see release_sponsorship), not a real transfer out,
until Connect + legal/tax review happens.

Admin-only for now (see app/api/routes/sponsorships.py) -- same dual-gate pattern
(is_admin + shared secret) as subscriptions, until this is deliberately opened up.
"""

import json
import logging
from typing import Literal
from uuid import UUID

import stripe
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services import payments as payments_service

logger = logging.getLogger(__name__)

SponsorType = Literal["user", "business"]
TargetType = Literal["cleanup_event", "geo_unit", "general", "site", "area", "group"]
Model = Literal["general", "site", "group_area", "group_support"]


def _client() -> stripe.StripeClient:
    if not settings.stripe_secret_key:
        raise RuntimeError("STRIPE_SECRET_KEY is not configured.")
    return stripe.StripeClient(settings.stripe_secret_key)


async def create_sponsorship_checkout_session(
    db: AsyncSession,
    *,
    sponsor_type: SponsorType,
    sponsor_user_id: UUID | None,
    sponsor_business_id: UUID | None,
    target_type: TargetType,
    target_cleanup_id: UUID | None,
    target_geo_unit_id: UUID | None,
    amount_cents: int,
    message: str | None,
    success_url: str,
    cancel_url: str,
    model: Model = "general",
    payout_rule: dict | None = None,
    cap_per_user_cents: int | None = None,
    site_label: str | None = None,
    site_latitude: float | None = None,
    site_longitude: float | None = None,
    site_radius_meters: int | None = None,
    area_wkt: str | None = None,
    area_source: str | None = None,
    area_name: str | None = None,
    target_group_id: UUID | None = None,
) -> str:
    if amount_cents <= 0:
        raise ValueError("amount_cents must be positive")

    group_name = None
    if target_type == "group":
        group_name = await _assert_group_accepts_sponsors(db, target_group_id)

    target_name = (
        site_label or "Sponsored site"
        if target_type == "site"
        else area_name or "Sponsored area"
        if target_type == "area"
        else f"Support {group_name}"
        if target_type == "group"
        else await _target_display_name(db, target_type, target_cleanup_id, target_geo_unit_id)
    )

    row = (
        await db.execute(
            text("""
                INSERT INTO sponsorships
                    (sponsor_type, sponsor_user_id, sponsor_business_id,
                     target_type, target_cleanup_id, target_geo_unit_id, target_group_id,
                     amount_cents, message, status,
                     model, payout_rule, cap_per_user_cents,
                     site_label, site_location, site_radius_meters,
                     area_geometry, area_source, area_name)
                VALUES
                    (:sponsor_type, :sponsor_user_id, :sponsor_business_id,
                     :target_type, :target_cleanup_id, :target_geo_unit_id, :target_group_id,
                     :amount_cents, :message, 'pending_funding',
                     :model, CAST(:payout_rule AS jsonb), :cap_per_user_cents,
                     :site_label,
                     CASE WHEN CAST(:site_lat AS double precision) IS NULL THEN NULL
                          ELSE ST_SetSRID(ST_MakePoint(CAST(:site_lon AS double precision),
                                                       CAST(:site_lat AS double precision)), 4326)::geography END,
                     :site_radius_meters,
                     CASE WHEN CAST(:area_wkt AS text) IS NULL THEN NULL
                          ELSE ST_GeomFromEWKT(CAST(:area_wkt AS text)) END,
                     :area_source, :area_name)
                RETURNING id
            """),
            {
                "sponsor_type": sponsor_type,
                "sponsor_user_id": str(sponsor_user_id) if sponsor_user_id else None,
                "sponsor_business_id": str(sponsor_business_id) if sponsor_business_id else None,
                "target_type": target_type,
                "target_cleanup_id": str(target_cleanup_id) if target_cleanup_id else None,
                "target_geo_unit_id": str(target_geo_unit_id) if target_geo_unit_id else None,
                "target_group_id": str(target_group_id) if target_group_id else None,
                "amount_cents": amount_cents,
                "message": message,
                "model": model,
                "payout_rule": json.dumps(payout_rule) if payout_rule else None,
                "cap_per_user_cents": cap_per_user_cents,
                "site_label": site_label,
                "site_lat": site_latitude,
                "site_lon": site_longitude,
                "site_radius_meters": site_radius_meters,
                "area_wkt": area_wkt,
                "area_source": area_source,
                "area_name": area_name,
            },
        )
    ).fetchone()
    sponsorship_id = row.id
    await db.commit()

    client = _client()
    session = client.checkout.sessions.create(
        params={
            "mode": "payment",
            "line_items": [
                {
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": amount_cents,
                        "product_data": {
                            "name": f"Sponsorship: {target_name}",
                            "description": message or None,
                        },
                    },
                    "quantity": 1,
                }
            ],
            "success_url": success_url,
            "cancel_url": cancel_url,
            "metadata": {"sponsorship_id": str(sponsorship_id)},
            "payment_intent_data": {"metadata": {"sponsorship_id": str(sponsorship_id)}},
        }
    )
    if not session.url:
        raise RuntimeError("Stripe did not return a Checkout Session URL.")

    await db.execute(
        text("UPDATE sponsorships SET stripe_checkout_session_id = :sid WHERE id = :id"),
        {"sid": session.id, "id": str(sponsorship_id)},
    )
    await db.commit()
    return session.url


async def _assert_group_accepts_sponsors(db: AsyncSession, group_id: UUID | None) -> str:
    """A group can be sponsored directly only while it has Frontline Plus and has opted in.
    Returns the group name for the Stripe line item."""
    if group_id is None:
        raise ValueError("target_group_id is required for a group sponsorship")
    row = (
        await db.execute(
            text("SELECT name, open_to_sponsors, status FROM groups WHERE id = :id"), {"id": str(group_id)}
        )
    ).fetchone()
    if row is None or row.status != "approved":
        raise ValueError("This group is not available for sponsorship")
    if not row.open_to_sponsors or not await payments_service.has_premium(db, "group", group_id):
        raise ValueError("This group is not accepting sponsors right now")
    return row.name


async def _target_display_name(
    db: AsyncSession, target_type: TargetType, cleanup_id: UUID | None, geo_unit_id: UUID | None
) -> str:
    if target_type == "general":
        return "Frontline's general fund"
    if target_type == "cleanup_event":
        row = (
            await db.execute(text("SELECT title FROM cleanups WHERE id = :id"), {"id": str(cleanup_id)})
        ).fetchone()
        if row is None:
            raise ValueError(f"cleanup {cleanup_id} not found")
        return row.title
    row = (
        await db.execute(
            text("SELECT display_name, unit_id FROM geo_units WHERE id = :id"), {"id": str(geo_unit_id)}
        )
    ).fetchone()
    if row is None:
        raise ValueError(f"geo_unit {geo_unit_id} not found")
    return row.display_name or row.unit_id


async def mark_funded_from_checkout_session(db: AsyncSession, session: dict) -> None:
    """Called from the Stripe webhook on checkout.session.completed for mode=payment
    sessions. Marks the sponsorship funded and stores the payment intent id."""
    sponsorship_id = (session.get("metadata") or {}).get("sponsorship_id")
    if not sponsorship_id:
        logger.warning("Checkout session %s (payment mode) has no sponsorship_id metadata", session.get("id"))
        return

    funded = (
        await db.execute(
            text("""
            UPDATE sponsorships
            SET status = 'funded',
                funded_at = now(),
                remaining_cents = amount_cents,
                stripe_payment_intent_id = :payment_intent_id,
                stripe_customer_id = :customer_id
            WHERE id = :id AND status = 'pending_funding'
            RETURNING model, target_group_id, amount_cents
        """),
            {
                "id": sponsorship_id,
                "payment_intent_id": session.get("payment_intent"),
                "customer_id": session.get("customer"),
            },
        )
    ).fetchone()

    # Direct group support has no claim or event to wait for: the whole amount is owed to
    # the group, so queue one allocation. It still goes through admin review and the manual
    # payout flag like every other allocation.
    if funded is not None and funded.model == "group_support" and funded.target_group_id:
        await db.execute(
            text("""
                INSERT INTO sponsorship_allocations (sponsorship_id, group_id, amount_cents, is_direct)
                VALUES (:sid, :gid, :amount, true)
            """),
            {"sid": sponsorship_id, "gid": str(funded.target_group_id), "amount": funded.amount_cents},
        )
    await db.commit()


async def mark_refunded_from_payment_intent(db: AsyncSession, payment_intent_id: str) -> None:
    await db.execute(
        text("""
            UPDATE sponsorships
            SET status = 'refunded'
            WHERE stripe_payment_intent_id = :pi AND status IN ('funded', 'released', 'exhausted')
        """),
        {"pi": payment_intent_id},
    )
    await db.commit()


async def release_sponsorship(db: AsyncSession, sponsorship_id: UUID, released_by: UUID) -> bool:
    """Manually flips a funded sponsorship to 'released' -- an administrative record
    that fulfillment was verified out-of-band, NOT a real payout (no Connect yet)."""
    result = await db.execute(
        text("""
            UPDATE sponsorships
            SET status = 'released', released_at = now(), released_by = :released_by
            WHERE id = :id AND status = 'funded'
            RETURNING id
        """),
        {"id": str(sponsorship_id), "released_by": str(released_by)},
    )
    await db.commit()
    return result.fetchone() is not None


async def list_sponsorships(db: AsyncSession, status: str | None = None) -> list[dict]:
    query = """
        SELECT
            s.id, s.sponsor_type, s.sponsor_user_id, s.sponsor_business_id,
            s.target_type, s.target_cleanup_id, s.target_geo_unit_id,
            s.amount_cents, s.currency, s.message, s.status,
            s.released_at, s.created_at,
            s.model, s.payout_rule, s.remaining_cents, s.site_label, s.area_name,
            s.target_group_id, tg.name AS target_group_name,
            up.display_name AS sponsor_user_name,
            pb.name AS sponsor_business_name,
            c.title AS target_cleanup_title,
            gu.display_name AS target_geo_unit_name
        FROM sponsorships s
        LEFT JOIN profiles up ON up.id = s.sponsor_user_id
        LEFT JOIN partner_businesses pb ON pb.id = s.sponsor_business_id
        LEFT JOIN cleanups c ON c.id = s.target_cleanup_id
        LEFT JOIN geo_units gu ON gu.id = s.target_geo_unit_id
        LEFT JOIN groups tg ON tg.id = s.target_group_id
        WHERE (CAST(:status AS text) IS NULL OR s.status = CAST(:status AS text))
        ORDER BY s.created_at DESC
        LIMIT 200
    """
    rows = (await db.execute(text(query), {"status": status})).mappings().all()
    return [dict(r) for r in rows]
