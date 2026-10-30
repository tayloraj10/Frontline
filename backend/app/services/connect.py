"""Stripe Connect Express plumbing for cleaner payouts (Hire marketplace).

Cleaners onboard through a Stripe-hosted flow, so identity checks and bank details never touch
our app. cleaner_profiles.stripe_connect_account_id is the link; payouts_enabled mirrors whether
Stripe says the account can receive transfers.
"""

import logging
from uuid import UUID

import stripe
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

logger = logging.getLogger(__name__)


class ConnectError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def is_configured() -> bool:
    return bool(settings.stripe_secret_key)


def _client() -> stripe.StripeClient:
    if not settings.stripe_secret_key:
        raise ConnectError("Payments are not configured.", 503)
    return stripe.StripeClient(settings.stripe_secret_key)


def _account_ready(account) -> bool:
    return bool(account.get("payouts_enabled") and account.get("details_submitted"))


async def _profile(db: AsyncSession, user_id: UUID):
    row = (
        await db.execute(
            text("SELECT stripe_connect_account_id, payouts_enabled FROM cleaner_profiles WHERE user_id = :u"),
            {"u": user_id},
        )
    ).first()
    if row is None:
        raise ConnectError("Create your cleaner profile first.", 409)
    return row


async def create_onboarding_link(db: AsyncSession, user_id: UUID, email: str | None) -> dict:
    """Creates the Express account the first time, then returns a fresh hosted onboarding link
    (links are single-use, so a new one is made on every call)."""
    profile = await _profile(db, user_id)
    client = _client()
    account_id = profile.stripe_connect_account_id
    if not account_id:
        account = client.accounts.create(
            params={
                "type": "express",
                "country": "US",
                "email": email or None,
                "capabilities": {"transfers": {"requested": True}},
                "metadata": {"user_id": str(user_id)},
            }
        )
        account_id = account.id
        await db.execute(
            text("UPDATE cleaner_profiles SET stripe_connect_account_id = :a WHERE user_id = :u"),
            {"a": account_id, "u": user_id},
        )
        await db.commit()
    base = settings.frontend_url.rstrip("/")
    link = client.account_links.create(
        params={
            "account": account_id,
            "type": "account_onboarding",
            "refresh_url": f"{base}/marketplace/become-a-cleaner?payouts=refresh",
            "return_url": f"{base}/marketplace/become-a-cleaner?payouts=return",
        }
    )
    return {"url": link.url}


async def refresh_status(db: AsyncSession, user_id: UUID) -> dict:
    """Asks Stripe for the current state of this cleaner's account and caches payouts_enabled."""
    profile = await _profile(db, user_id)
    if not profile.stripe_connect_account_id:
        return {"payouts_enabled": False, "has_account": False}
    account = _client().accounts.retrieve(profile.stripe_connect_account_id).to_dict()
    ready = _account_ready(account)
    if ready != bool(profile.payouts_enabled):
        await db.execute(text("UPDATE cleaner_profiles SET payouts_enabled = :r WHERE user_id = :u"), {"r": ready, "u": user_id})
        await db.commit()
    return {"payouts_enabled": ready, "has_account": True}


async def sync_account_from_webhook(db: AsyncSession, account: dict) -> None:
    """account.updated: keep payouts_enabled in step with Stripe."""
    await db.execute(
        text("UPDATE cleaner_profiles SET payouts_enabled = :r WHERE stripe_connect_account_id = :a"),
        {"r": _account_ready(account), "a": account.get("id")},
    )
    await db.commit()
