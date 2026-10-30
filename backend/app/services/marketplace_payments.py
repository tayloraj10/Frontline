"""Money movement for Hire jobs on Stripe.

Model: the customer saves a card (Checkout setup mode). When a cleaner takes the job the card is
charged the full price into the platform balance (that is the hold; hold_status 'held'). On release
the cleaner's share is transferred to their Connect account and the platform keeps the fee. On
cancel or refund the charge is refunded. Each call carries an idempotency key per job so a retry
after a crash never double-charges or double-pays.

Everything is a no-op when STRIPE_SECRET_KEY is unset, so local dev and seeded demo jobs keep
working as status flags only.
"""

import logging
from uuid import UUID

import stripe
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services import connect
from app.services import payments as payments_service

logger = logging.getLogger(__name__)


class PaymentError(Exception):
    pass


def is_configured() -> bool:
    return bool(settings.stripe_secret_key)


def _client() -> stripe.StripeClient:
    return stripe.StripeClient(settings.stripe_secret_key)


async def _customer_id(db: AsyncSession, user_id: UUID) -> str | None:
    row = (await db.execute(text("SELECT stripe_customer_id FROM profiles WHERE id = :u"), {"u": user_id})).first()
    return row.stripe_customer_id if row else None


def _cards(customer_id: str) -> list:
    return list(_client().payment_methods.list(params={"customer": customer_id, "type": "card"}).data)


async def card_status(db: AsyncSession, user_id: UUID) -> dict:
    if not is_configured():
        return {"configured": False, "has_card": True}
    customer_id = await _customer_id(db, user_id)
    cards = _cards(customer_id) if customer_id else []
    if not cards:
        return {"configured": True, "has_card": False}
    card = cards[0].card
    return {"configured": True, "has_card": True, "brand": card.brand, "last4": card.last4}


async def create_card_setup_url(db: AsyncSession, user_id: UUID, return_path: str) -> str:
    if not is_configured():
        raise PaymentError("Payments are not configured.")
    customer_id = await payments_service.get_or_create_customer(db, "user", user_id, None, None)
    base = settings.frontend_url.rstrip("/")
    session = _client().checkout.sessions.create(
        params={
            "mode": "setup",
            "customer": customer_id,
            "currency": "usd",
            "payment_method_types": ["card"],
            "success_url": f"{base}{return_path}",
            "cancel_url": f"{base}{return_path}",
        }
    )
    if not session.url:
        raise PaymentError("Stripe did not return a checkout URL.")
    return session.url


async def charge_job(db: AsyncSession, job: dict) -> str | None:
    """Charges the customer's saved card for the job price. Returns the PaymentIntent id (None when
    payments are off). Raises PaymentError with a message safe to show."""
    if not is_configured():
        return None
    customer_id = await _customer_id(db, job["customer_id"])
    cards = _cards(customer_id) if customer_id else []
    if not cards:
        raise PaymentError("The person who posted this job has no payment card on file.")
    try:
        pi = _client().payment_intents.create(
            params={
                "amount": job["price_cents"],
                "currency": "usd",
                "customer": customer_id,
                "payment_method": cards[0].id,
                "off_session": True,
                "confirm": True,
                "description": f"Frontline Hire: {job['title']}"[:200],
                "transfer_group": f"job_{job['id']}",
                "metadata": {"job_id": str(job["id"])},
            },
            options={"idempotency_key": f"mk-charge-{job['id']}"},
        )
    except stripe.CardError as e:
        raise PaymentError("The customer's card was declined, so this job cannot be taken right now.") from e
    except stripe.StripeError as e:
        logger.exception("Stripe charge failed for job %s", job["id"])
        raise PaymentError("Payment could not be processed. Try again in a moment.") from e
    if pi.status != "succeeded":
        raise PaymentError("The customer's card needs extra verification, so this job cannot be taken right now.")
    return pi.id


async def pay_out(db: AsyncSession, job: dict) -> str | None:
    """Transfers the cleaner's share. Returns the transfer id, or None when there is nothing to move
    (payments off, or a job that was never charged through Stripe)."""
    if not is_configured() or not job.get("stripe_payment_intent_id"):
        return None
    if job.get("stripe_transfer_id"):
        return job["stripe_transfer_id"]
    row = (
        await db.execute(
            text("SELECT stripe_connect_account_id, payouts_enabled FROM cleaner_profiles WHERE user_id = :u"),
            {"u": job["cleaner_id"]},
        )
    ).first()
    if not row or not row.stripe_connect_account_id:
        raise PaymentError("The cleaner has not set up payouts yet.")
    payout = job["price_cents"] - (job["platform_fee_cents"] or 0)
    try:
        client = _client()
        charge = client.payment_intents.retrieve(job["stripe_payment_intent_id"]).latest_charge
        transfer = client.transfers.create(
            params={
                "amount": payout,
                "currency": "usd",
                "destination": row.stripe_connect_account_id,
                "source_transaction": charge,
                "transfer_group": f"job_{job['id']}",
                "metadata": {"job_id": str(job["id"])},
            },
            options={"idempotency_key": f"mk-transfer-{job['id']}"},
        )
    except stripe.StripeError as e:
        logger.exception("Stripe transfer failed for job %s", job["id"])
        raise PaymentError(f"Stripe could not send the payout: {getattr(e, 'user_message', None) or e}") from e
    return transfer.id


async def refund(job: dict) -> None:
    """Refunds the customer's charge in full. No-op when there was no Stripe charge."""
    if not is_configured() or not job.get("stripe_payment_intent_id"):
        return
    try:
        _client().refunds.create(
            params={"payment_intent": job["stripe_payment_intent_id"]},
            options={"idempotency_key": f"mk-refund-{job['id']}"},
        )
    except stripe.StripeError as e:
        logger.exception("Stripe refund failed for job %s", job["id"])
        raise PaymentError(f"Stripe could not refund the payment: {getattr(e, 'user_message', None) or e}") from e
