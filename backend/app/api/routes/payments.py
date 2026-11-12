import logging
from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import limit_money, limit_writes
from app.core.auth import CurrentUser, require_user
from app.core.config import settings
from app.db.database import get_db
from app.services import connect as connect_service
from app.services.admin_roles import is_site_admin
from app.services import impact as impact_service
from app.services import payments as payments_service
from app.services import sponsorships as sponsorships_service
from app.services import sponsorship_pools as sponsorship_pools_service

router = APIRouter(prefix="/payments", tags=["payments"])
logger = logging.getLogger(__name__)


async def _is_owner(db: AsyncSession, user: CurrentUser, owner_type: str, owner_id: UUID) -> bool:
    """True for the owner themselves, an admin of the group, or a site admin."""
    if owner_type == "user":
        ok = owner_id == user.id
    else:
        row = await db.execute(
            text("SELECT 1 FROM group_members WHERE group_id = :gid AND user_id = :uid AND role = 'admin'"),
            {"gid": str(owner_id), "uid": str(user.id)},
        )
        ok = row.first() is not None
    return ok or await is_site_admin(db, user.id)


async def _require_owner(db: AsyncSession, user: CurrentUser, owner_type: str, owner_id: UUID) -> None:
    if not await _is_owner(db, user, owner_type, owner_id):
        raise HTTPException(403, "You do not manage this account.")


class CheckoutSessionRequest(BaseModel):
    owner_type: payments_service.OwnerType
    owner_id: UUID
    success_url: str
    cancel_url: str


class PortalSessionRequest(BaseModel):
    owner_type: payments_service.OwnerType
    owner_id: UUID
    return_url: str


@router.post("/checkout-session", dependencies=[Depends(limit_money)])
async def create_checkout_session(
    payload: CheckoutSessionRequest,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_owner(db, user, payload.owner_type, payload.owner_id)

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


@router.post("/portal-session", dependencies=[Depends(limit_money)])
async def create_portal_session(
    payload: PortalSessionRequest,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_owner(db, user, payload.owner_type, payload.owner_id)

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
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    summary = await payments_service.get_subscription_summary(db, owner_type, owner_id)
    if await _is_owner(db, user, owner_type, owner_id):
        return summary
    # Plus flair is public on profiles and groups; billing detail is not.
    return {"has_premium": summary["has_premium"]}


@router.get("/plus-groups")
async def get_plus_groups(
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Ids of groups with an active Plus subscription, for list-page flair."""
    rows = await db.execute(
        text("SELECT owner_id::text AS id FROM subscriptions WHERE owner_type = 'group' AND status IN ('active', 'trialing')")
    )
    return {"group_ids": [r.id for r in rows]}


@router.get("/impact-summary")
async def get_impact_summary(
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate-only data for the Impact & Funding page. Admin-gated for now, like the
    rest of this file; the Next.js route enforces the payments visibility toggle."""
    return await impact_service.get_impact_summary(db)


@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request, stripe_signature: str | None = Header(default=None, alias="stripe-signature"), db: AsyncSession = Depends(get_db)):
    """Called directly by Stripe, not through the Next.js admin proxy -- verified via
    Stripe's signature scheme instead of the shared admin secret."""
    if not settings.stripe_webhook_secret:
        raise HTTPException(503, "Webhook endpoint is not configured (STRIPE_WEBHOOK_SECRET unset).")

    payload = await request.body()
    # Connected-account events (account.updated) come from a second Stripe destination with its own secret.
    secrets = [s for s in (settings.stripe_webhook_secret, settings.stripe_connect_webhook_secret) if s]
    event = None
    for i, secret in enumerate(secrets):
        try:
            event = stripe.Webhook.construct_event(payload, stripe_signature, secret)
            break
        except (ValueError, stripe.SignatureVerificationError) as e:
            if i == len(secrets) - 1:
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
            if not await sponsorship_pools_service.mark_contribution_paid(db, obj):
                await sponsorships_service.mark_funded_from_checkout_session(db, obj)
    elif event_type in ("customer.subscription.updated", "customer.subscription.deleted"):
        await payments_service.upsert_subscription_from_stripe(db, obj)
    elif event_type == "invoice.payment_failed":
        logger.warning(
            "Stripe invoice payment failed: invoice=%s customer=%s subscription=%s",
            obj.get("id"), obj.get("customer"), obj.get("subscription"),
        )
    elif event_type == "account.updated":
        await connect_service.sync_account_from_webhook(db, obj)
    elif event_type == "charge.refunded":
        payment_intent_id = obj.get("payment_intent")
        if payment_intent_id:
            await sponsorships_service.mark_refunded_from_payment_intent(db, payment_intent_id)
    elif event_type in ("charge.dispute.created", "transfer.reversed"):
        # A chargeback or a clawed-back payout needs a human: money may already have left.
        from app.services.marketplace import _notify_admins

        what = "Chargeback opened" if event_type == "charge.dispute.created" else "Payout reversed"
        ref = obj.get("payment_intent") or obj.get("id")
        amount = (obj.get("amount") or 0) / 100
        logger.error("Stripe %s: object=%s ref=%s amount=%.2f", event_type, obj.get("id"), ref, amount)
        await _notify_admins(
            db, "payments_admin_alert", f"{what}: ${amount:.2f}",
            f"Stripe reference {ref}. Review it in the Stripe dashboard before any related payout moves.",
            "/admin",
        )

    return {"received": True}
