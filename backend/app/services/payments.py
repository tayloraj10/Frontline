"""Stripe Billing/Checkout plumbing for subscriptions (payments use case 1 in
dev-docs/payments-scoping-2026-08-20.md). No Connect/payout rails live here -- those
(challenge payouts, sponsorships) are separately-scoped, unbuilt use cases.

Admin-only for now (see app/api/routes/payments.py): there's no premium feature to gate
yet, so nothing here is meant to be reachable by a non-admin user.
"""

import logging
from typing import Literal
from uuid import UUID

import stripe
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

logger = logging.getLogger(__name__)

OwnerType = Literal["user", "group"]


def _client() -> stripe.StripeClient:
    if not settings.stripe_secret_key:
        raise RuntimeError("STRIPE_SECRET_KEY is not configured.")
    return stripe.StripeClient(settings.stripe_secret_key)


async def _owner_table(owner_type: OwnerType) -> str:
    return "profiles" if owner_type == "user" else "groups"


async def get_or_create_customer(
    db: AsyncSession, owner_type: OwnerType, owner_id: UUID, email: str | None, name: str | None
) -> str:
    """Returns the Stripe Customer id for this owner, creating one (and persisting it)
    the first time. profiles/groups.stripe_customer_id is the cache; Stripe is the
    source of truth for everything else about the customer."""
    table = await _owner_table(owner_type)
    row = (
        await db.execute(
            text(f"SELECT stripe_customer_id FROM {table} WHERE id = :id"),
            {"id": str(owner_id)},
        )
    ).fetchone()
    if row is None:
        raise ValueError(f"{owner_type} {owner_id} not found")
    if row.stripe_customer_id:
        return row.stripe_customer_id

    client = _client()
    customer = client.customers.create(
        params={
            "email": email or None,
            "name": name or None,
            "metadata": {"owner_type": owner_type, "owner_id": str(owner_id)},
        }
    )
    await db.execute(
        text(f"UPDATE {table} SET stripe_customer_id = :cid WHERE id = :id"),
        {"cid": customer.id, "id": str(owner_id)},
    )
    await db.commit()
    return customer.id


def price_id_for(owner_type: OwnerType) -> str:
    price_id = settings.stripe_price_id_individual if owner_type == "user" else settings.stripe_price_id_group
    if not price_id:
        raise RuntimeError(
            f"No Stripe price configured for owner_type={owner_type} "
            f"(set STRIPE_PRICE_ID_{'INDIVIDUAL' if owner_type == 'user' else 'GROUP'})."
        )
    return price_id


def create_checkout_session(
    *, customer_id: str, owner_type: OwnerType, owner_id: UUID, success_url: str, cancel_url: str
) -> str:
    client = _client()
    session = client.checkout.sessions.create(
        params={
            "mode": "subscription",
            "customer": customer_id,
            "line_items": [{"price": price_id_for(owner_type), "quantity": 1}],
            "success_url": success_url,
            "cancel_url": cancel_url,
            "metadata": {"owner_type": owner_type, "owner_id": str(owner_id)},
            "subscription_data": {"metadata": {"owner_type": owner_type, "owner_id": str(owner_id)}},
        }
    )
    if not session.url:
        raise RuntimeError("Stripe did not return a Checkout Session URL.")
    return session.url


def create_portal_session(*, customer_id: str, return_url: str) -> str:
    client = _client()
    session = client.billing_portal.sessions.create(params={"customer": customer_id, "return_url": return_url})
    return session.url


async def record_webhook_event_once(db: AsyncSession, event_id: str, event_type: str) -> bool:
    """Records a Stripe webhook event id, returning True the first time it's seen and
    False on any retried delivery (Stripe delivers at-least-once, including retrying
    2xx-acknowledged events it didn't get a fast-enough response for)."""
    result = await db.execute(
        text("""
            INSERT INTO stripe_webhook_events (id, type)
            VALUES (:id, :type)
            ON CONFLICT (id) DO NOTHING
            RETURNING id
        """),
        {"id": event_id, "type": event_type},
    )
    await db.commit()
    return result.fetchone() is not None


async def has_premium(db: AsyncSession, owner_type: OwnerType, owner_id: UUID) -> bool:
    row = (
        await db.execute(
            text("""
                SELECT 1 FROM subscriptions
                WHERE owner_type = :owner_type AND owner_id = :owner_id
                  AND status IN ('active', 'trialing')
            """),
            {"owner_type": owner_type, "owner_id": str(owner_id)},
        )
    ).fetchone()
    return row is not None


async def upsert_subscription_from_stripe(db: AsyncSession, subscription: dict) -> None:
    """Upserts a `subscriptions` row from a Stripe Subscription object (as delivered on
    checkout.session.completed via expansion, or customer.subscription.* webhooks
    directly). Keyed on stripe_subscription_id; owner_type/owner_id come from the
    subscription's metadata, set at Checkout time in create_checkout_session."""
    metadata = subscription.get("metadata") or {}
    owner_type = metadata.get("owner_type")
    owner_id = metadata.get("owner_id")
    if owner_type not in ("user", "group") or not owner_id:
        logger.warning("Stripe subscription %s has no owner metadata, skipping upsert", subscription.get("id"))
        return

    items = (subscription.get("items") or {}).get("data") or []
    price_id = items[0]["price"]["id"] if items else ""
    current_period_end = items[0].get("current_period_end") if items else None

    await db.execute(
        text("""
            INSERT INTO subscriptions
                (owner_type, owner_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
                 status, current_period_end, cancel_at_period_end, updated_at)
            VALUES
                (:owner_type, :owner_id, :customer_id, :subscription_id, :price_id,
                 :status, to_timestamp(:current_period_end), :cancel_at_period_end, now())
            ON CONFLICT (stripe_subscription_id) DO UPDATE SET
                stripe_price_id = EXCLUDED.stripe_price_id,
                status = EXCLUDED.status,
                current_period_end = EXCLUDED.current_period_end,
                cancel_at_period_end = EXCLUDED.cancel_at_period_end,
                updated_at = now()
        """),
        {
            "owner_type": owner_type,
            "owner_id": owner_id,
            "customer_id": subscription.get("customer"),
            "subscription_id": subscription.get("id"),
            "price_id": price_id,
            "status": subscription.get("status"),
            "current_period_end": current_period_end,
            "cancel_at_period_end": bool(subscription.get("cancel_at_period_end")),
        },
    )
    await db.commit()
