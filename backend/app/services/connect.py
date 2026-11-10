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
from app.services.stripe_return import stripe_return_url

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
            "refresh_url": stripe_return_url(base, "/marketplace/become-a-cleaner", "payouts=refresh"),
            "return_url": stripe_return_url(base, "/marketplace/become-a-cleaner", "payouts=return"),
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
    args = {"r": _account_ready(account), "a": account.get("id")}
    await db.execute(text("UPDATE cleaner_profiles SET payouts_enabled = :r WHERE stripe_connect_account_id = :a"), args)
    await db.execute(text("UPDATE payout_accounts SET payouts_enabled = :r WHERE stripe_connect_account_id = :a"), args)
    group = (
        await db.execute(
            text("UPDATE group_payout_accounts SET payouts_enabled = :r WHERE stripe_connect_account_id = :a RETURNING group_id"),
            args,
        )
    ).first()
    await db.commit()
    if group and args["r"]:
        from app.services import earn_payouts

        await earn_payouts.pay_waiting_group_allocations(db, group.group_id)


# ---------------------------------------------------------------------------
# Earn recipients: any user can hold a Connect account. A cleaner's existing account is reused so one
# person never ends up with two.
# ---------------------------------------------------------------------------


async def account_for(db: AsyncSession, user_id: UUID):
    """(account_id, payouts_enabled) for this user from either table, or (None, False)."""
    for table in ("cleaner_profiles", "payout_accounts"):
        row = (
            await db.execute(
                text(f"SELECT stripe_connect_account_id AS a, payouts_enabled AS r FROM {table} WHERE user_id = :u"),
                {"u": user_id},
            )
        ).first()
        if row and row.a:
            return row.a, bool(row.r)
    return None, False


async def create_payout_onboarding_link(db: AsyncSession, user_id: UUID, email: str | None, return_path: str) -> dict:
    client = _client()
    account_id, _ = await account_for(db, user_id)
    if not account_id:
        account = client.accounts.create(
            params={
                "type": "express",
                "country": "US",
                "email": email or None,
                "capabilities": {"transfers": {"requested": True}},
                "metadata": {"user_id": str(user_id)},
            },
            options={"idempotency_key": f"earn-acct-{user_id}"},
        )
        account_id = account.id
        await db.execute(
            text("""
                INSERT INTO payout_accounts (user_id, stripe_connect_account_id) VALUES (:u, :a)
                ON CONFLICT (user_id) DO UPDATE SET stripe_connect_account_id = EXCLUDED.stripe_connect_account_id
            """),
            {"u": user_id, "a": account_id},
        )
        await db.commit()
    base = settings.frontend_url.rstrip("/")
    link = client.account_links.create(
        params={
            "account": account_id,
            "type": "account_onboarding",
            "refresh_url": stripe_return_url(base, return_path, "payouts=refresh"),
            "return_url": stripe_return_url(base, return_path, "payouts=return"),
        }
    )
    return {"url": link.url}


async def refresh_payout_status(db: AsyncSession, user_id: UUID) -> dict:
    account_id, was_ready = await account_for(db, user_id)
    if not account_id:
        return {"payouts_enabled": False, "has_account": False}
    ready = _account_ready(_client().accounts.retrieve(account_id).to_dict())
    if ready != was_ready:
        args = {"r": ready, "a": account_id}
        await db.execute(text("UPDATE cleaner_profiles SET payouts_enabled = :r WHERE stripe_connect_account_id = :a"), args)
        await db.execute(text("UPDATE payout_accounts SET payouts_enabled = :r WHERE stripe_connect_account_id = :a"), args)
        await db.commit()
    return {"payouts_enabled": ready, "has_account": True}


async def create_dashboard_link(db: AsyncSession, user_id: UUID) -> dict:
    """One-time link to the Stripe Express dashboard (balance, payouts, bank details)."""
    account_id, ready = await account_for(db, user_id)
    if not account_id or not ready:
        raise ConnectError("Set up payouts first.", 409)
    try:
        return {"url": _client().accounts.login_links.create(account_id).url}
    except stripe.StripeError:
        raise ConnectError("Could not open Stripe right now. Try again in a moment.", 502)


# ---------------------------------------------------------------------------
# Group payout accounts: one Connect account per group, set up by any of its admins. Group sponsorship
# money is paid here, so a group without a ready account cannot take group money.
# ---------------------------------------------------------------------------


async def group_account_for(db: AsyncSession, group_id: UUID):
    """(account_id, payouts_enabled) for this group, or (None, False)."""
    row = (
        await db.execute(
            text("SELECT stripe_connect_account_id AS a, payouts_enabled AS r FROM group_payout_accounts WHERE group_id = :g"),
            {"g": group_id},
        )
    ).first()
    if row and row.a:
        return row.a, bool(row.r)
    return None, False


async def group_payouts_ready(db: AsyncSession, group_id: UUID) -> bool:
    """True when the group can be paid. With Stripe unconfigured (local dev) payouts are manual, so it never blocks."""
    if not is_configured():
        return True
    return (await group_account_for(db, group_id))[1]


async def create_group_onboarding_link(
    db: AsyncSession, group_id: UUID, user_id: UUID, email: str | None, return_path: str
) -> dict:
    client = _client()
    account_id, _ = await group_account_for(db, group_id)
    if not account_id:
        account = client.accounts.create(
            params={
                "type": "express",
                "country": "US",
                "email": email or None,
                "capabilities": {"transfers": {"requested": True}},
                "metadata": {"group_id": str(group_id), "set_up_by": str(user_id)},
            },
            options={"idempotency_key": f"group-acct-{group_id}"},
        )
        account_id = account.id
        await db.execute(
            text("""
                INSERT INTO group_payout_accounts (group_id, stripe_connect_account_id, set_up_by) VALUES (:g, :a, :u)
                ON CONFLICT (group_id) DO NOTHING
            """),
            {"g": group_id, "a": account_id, "u": user_id},
        )
        await db.commit()
    base = settings.frontend_url.rstrip("/")
    link = client.account_links.create(
        params={
            "account": account_id,
            "type": "account_onboarding",
            "refresh_url": stripe_return_url(base, return_path, "payouts=refresh"),
            "return_url": stripe_return_url(base, return_path, "payouts=return"),
        }
    )
    return {"url": link.url}


async def refresh_group_status(db: AsyncSession, group_id: UUID) -> dict:
    account_id, was_ready = await group_account_for(db, group_id)
    if not account_id:
        return {"payouts_enabled": False, "has_account": False}
    ready = _account_ready(_client().accounts.retrieve(account_id).to_dict())
    if ready != was_ready:
        await db.execute(
            text("UPDATE group_payout_accounts SET payouts_enabled = :r WHERE group_id = :g"), {"r": ready, "g": group_id}
        )
        await db.commit()
    if ready:
        from app.services import earn_payouts

        await earn_payouts.pay_waiting_group_allocations(db, group_id)
    return {"payouts_enabled": ready, "has_account": True}


async def create_group_dashboard_link(db: AsyncSession, group_id: UUID) -> dict:
    account_id, ready = await group_account_for(db, group_id)
    if not account_id or not ready:
        raise ConnectError("Set up payouts first.", 409)
    try:
        return {"url": _client().accounts.login_links.create(account_id).url}
    except stripe.StripeError:
        raise ConnectError("Could not open Stripe right now. Try again in a moment.", 502)
