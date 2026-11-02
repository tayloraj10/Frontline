"""Earn payouts: moves an approved sponsorship allocation to the recipient's Stripe Connect account.

Mirrors Hire: the sponsor's money sits in the platform balance from Checkout, approval triggers a
transfer to the recipient's Express account. Group allocations are paid to the group's own payout account
(set up by a group admin); a group without a ready account cannot take group money.
"""

import logging
from uuid import UUID

import stripe
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services import connect

logger = logging.getLogger(__name__)


async def _tell(db: AsyncSession, user_id: UUID, kind: str, title: str, body: str, path: str, cta: str) -> None:
    from app.services.marketplace import _notify_safe

    await _notify_safe(db, user_id, kind, title, body, path, cta)


async def pay_allocation(db: AsyncSession, allocation_id: UUID) -> dict:
    """Idempotent: a paid allocation returns as is, and Stripe dedupes on the transfer key."""
    a = (
        await db.execute(
            text("""
                SELECT a.id, a.user_id, a.group_id, a.amount_cents, a.status, a.stripe_transfer_id,
                       s.stripe_payment_intent_id, s.site_label
                FROM sponsorship_allocations a JOIN sponsorships s ON s.id = a.sponsorship_id
                WHERE a.id = :id
            """),
            {"id": str(allocation_id)},
        )
    ).first()
    if a is None or a.status not in ("approved", "paid_out"):
        return {"status": "skipped"}
    if a.stripe_transfer_id or a.status == "paid_out":
        return {"status": "paid_out"}
    if not connect.is_configured():
        return {"status": "manual"}

    if a.user_id is None:
        account_id, ready = await connect.group_account_for(db, a.group_id)
    else:
        account_id, ready = await connect.account_for(db, a.user_id)
    if not account_id or not ready:
        await db.execute(
            text("UPDATE sponsorship_allocations SET payout_error = 'Recipient has not finished payout setup' WHERE id = :id"),
            {"id": str(a.id)},
        )
        await db.commit()
        if a.user_id is None:
            await _tell_group_admins(
                db, a.group_id, "earn_payout_setup_needed", "Set up your group payouts",
                f"${a.amount_cents / 100:.2f} for your group was approved. Add the payout account to receive it.",
            )
        else:
            await _tell(
                db, a.user_id, "earn_payout_setup_needed", "Set up payouts to get paid",
                f"Your ${a.amount_cents / 100:.2f} reward was approved. Add your bank details to receive it.",
                "/sponsorships", "Set up payouts",
            )
        return {"status": "awaiting_payout_setup"}

    try:
        client = stripe.StripeClient(settings.stripe_secret_key)
        params = {
            "amount": a.amount_cents,
            "currency": "usd",
            "destination": account_id,
            "transfer_group": f"allocation_{a.id}",
            "metadata": {"allocation_id": str(a.id)},
        }
        if a.stripe_payment_intent_id:
            params["source_transaction"] = client.payment_intents.retrieve(a.stripe_payment_intent_id).latest_charge
        transfer = client.transfers.create(params=params, options={"idempotency_key": f"earn-transfer-{a.id}"})
    except stripe.StripeError as e:
        logger.exception("Earn transfer failed for allocation %s", a.id)
        await db.execute(
            text("UPDATE sponsorship_allocations SET payout_error = :e WHERE id = :id"),
            {"e": str(getattr(e, "user_message", None) or e)[:300], "id": str(a.id)},
        )
        await db.commit()
        return {"status": "failed"}

    await db.execute(
        text("""
            UPDATE sponsorship_allocations
            SET status = 'paid_out', paid_out_at = now(), stripe_transfer_id = :t, payout_error = NULL
            WHERE id = :id AND status = 'approved'
        """),
        {"t": transfer.id, "id": str(a.id)},
    )
    await db.commit()
    if a.user_id is None:
        await _tell_group_admins(
            db, a.group_id, "earn_paid", "Your group got paid",
            f"${a.amount_cents / 100:.2f} for your group is on its way to the group payout account through Stripe.",
        )
    else:
        await _tell(
            db, a.user_id, "earn_paid", "You got paid",
            f"${a.amount_cents / 100:.2f} for your cleanup is on its way to your bank through Stripe.",
            "/sponsorships", "View earnings",
        )
    return {"status": "paid_out"}


async def _tell_group_admins(db: AsyncSession, group_id: UUID, kind: str, title: str, body: str) -> None:
    admins = (
        await db.execute(
            text("SELECT user_id FROM group_members WHERE group_id = :g AND role = 'admin'"), {"g": str(group_id)}
        )
    ).all()
    for r in admins:
        await _tell(db, r.user_id, kind, title, body, "/sponsorships", "Open Earn")


async def pay_waiting_group_allocations(db: AsyncSession, group_id: UUID) -> None:
    """Called once a group's account becomes ready: pays anything approved while it was not."""
    rows = (
        await db.execute(
            text("""
                SELECT id FROM sponsorship_allocations
                WHERE group_id = :g AND status = 'approved' AND stripe_transfer_id IS NULL
            """),
            {"g": str(group_id)},
        )
    ).all()
    for r in rows:
        await pay_allocation(db, r.id)
