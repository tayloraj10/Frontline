import logging
from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.database import get_db
from app.services import payments as payments_service
from app.services import sponsorships as sponsorships_service

router = APIRouter(prefix="/payments", tags=["payments"])
logger = logging.getLogger(__name__)


def _check_secret(x_admin_api_secret: str | None) -> None:
    """Same shared-secret defense-in-depth as admin_prod.py: the Next.js server route
    re-verifies the caller is an authenticated site admin before forwarding here.
    Every endpoint in this file (except the Stripe webhook) is admin-only -- there's no
    premium feature to gate yet, so nothing is meant to be reachable by a normal user."""
    if not settings.admin_api_secret:
        raise HTTPException(503, "Admin endpoint is not configured (ADMIN_API_SECRET unset).")
    if x_admin_api_secret != settings.admin_api_secret:
        raise HTTPException(403, "Invalid or missing admin API secret.")


class CheckoutSessionRequest(BaseModel):
    owner_type: payments_service.OwnerType
    owner_id: UUID
    success_url: str
    cancel_url: str


class PortalSessionRequest(BaseModel):
    owner_type: payments_service.OwnerType
    owner_id: UUID
    return_url: str


@router.post("/checkout-session")
async def create_checkout_session(
    payload: CheckoutSessionRequest,
    x_admin_api_secret: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _check_secret(x_admin_api_secret)

    table = "profiles" if payload.owner_type == "user" else "groups"
    name_col = "display_name" if payload.owner_type == "user" else "name"
    row = (
        await db.execute(
            text(f"SELECT {name_col} AS name FROM {table} WHERE id = :id"),
            {"id": str(payload.owner_id)},
        )
    ).fetchone()
    if row is None:
        raise HTTPException(404, f"{payload.owner_type} not found")

    try:
        # profiles has no email column locally (it lives in auth.users) -- Stripe
        # Checkout will prompt for email itself since the Customer has none on file.
        customer_id = await payments_service.get_or_create_customer(
            db, payload.owner_type, payload.owner_id, None, row.name
        )
        url = payments_service.create_checkout_session(
            customer_id=customer_id,
            owner_type=payload.owner_type,
            owner_id=payload.owner_id,
            success_url=payload.success_url,
            cancel_url=payload.cancel_url,
        )
    except (RuntimeError, stripe.StripeError) as e:
        raise HTTPException(400, str(e)) from e
    return {"url": url}


@router.post("/portal-session")
async def create_portal_session(
    payload: PortalSessionRequest,
    x_admin_api_secret: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _check_secret(x_admin_api_secret)

    table = "profiles" if payload.owner_type == "user" else "groups"
    row = (
        await db.execute(
            text(f"SELECT stripe_customer_id FROM {table} WHERE id = :id"),
            {"id": str(payload.owner_id)},
        )
    ).fetchone()
    if row is None or not row.stripe_customer_id:
        raise HTTPException(404, "No Stripe customer for this owner yet -- start a checkout session first.")

    try:
        url = payments_service.create_portal_session(
            customer_id=row.stripe_customer_id, return_url=payload.return_url
        )
    except (RuntimeError, stripe.StripeError) as e:
        raise HTTPException(400, str(e)) from e
    return {"url": url}


@router.get("/entitlement")
async def get_entitlement(
    owner_type: payments_service.OwnerType,
    owner_id: UUID,
    x_admin_api_secret: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _check_secret(x_admin_api_secret)
    return {"has_premium": await payments_service.has_premium(db, owner_type, owner_id)}


@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request, stripe_signature: str | None = Header(default=None, alias="stripe-signature"), db: AsyncSession = Depends(get_db)):
    """Called directly by Stripe, not through the Next.js admin proxy -- verified via
    Stripe's signature scheme instead of the shared admin secret."""
    if not settings.stripe_webhook_secret:
        raise HTTPException(503, "Webhook endpoint is not configured (STRIPE_WEBHOOK_SECRET unset).")

    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(payload, stripe_signature, settings.stripe_webhook_secret)
    except (ValueError, stripe.SignatureVerificationError) as e:
        raise HTTPException(400, f"Invalid Stripe webhook payload: {e}") from e

    if not await payments_service.record_webhook_event_once(db, event["id"], event["type"]):
        logger.info("Ignoring duplicate Stripe webhook delivery %s (%s)", event["id"], event["type"])
        return {"received": True, "duplicate": True}

    event_type = event["type"]
    obj = event["data"]["object"]

    if event_type == "checkout.session.completed":
        mode = obj.get("mode")
        if mode == "subscription" and obj.get("subscription"):
            client = stripe.StripeClient(settings.stripe_secret_key)
            subscription = client.subscriptions.retrieve(obj["subscription"])
            await payments_service.upsert_subscription_from_stripe(db, subscription.to_dict())
        elif mode == "payment":
            await sponsorships_service.mark_funded_from_checkout_session(db, obj)
    elif event_type in ("customer.subscription.updated", "customer.subscription.deleted"):
        await payments_service.upsert_subscription_from_stripe(db, obj)
    elif event_type == "invoice.payment_failed":
        logger.warning(
            "Stripe invoice payment failed: invoice=%s customer=%s subscription=%s",
            obj.get("id"), obj.get("customer"), obj.get("subscription"),
        )
    elif event_type == "charge.refunded":
        payment_intent_id = obj.get("payment_intent")
        if payment_intent_id:
            await sponsorships_service.mark_refunded_from_payment_intent(db, payment_intent_id)

    return {"received": True}
