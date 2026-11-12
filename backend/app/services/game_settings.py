from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def get_game_settings(db: AsyncSession) -> dict[str, float]:
    """Fetch all admin-editable game-balance settings as a flat {key: value} dict."""
    result = await db.execute(text("SELECT key, value FROM game_settings"))
    return {row[0]: float(row[1]) for row in result.fetchall()}


DEFAULT_MIN_PAYMENT_CENTS = 1500


async def min_payment_cents(db: AsyncSession) -> int:
    """Global floor for a Hire job price or a sponsorship amount, in cents (game_settings.min_payment_cents)."""
    row = (await db.execute(text("SELECT value FROM game_settings WHERE key = 'min_payment_cents'"))).first()
    return int(row[0]) if row else DEFAULT_MIN_PAYMENT_CENTS


def min_payment_message(min_cents: int, what: str) -> str:
    return f"The minimum {what} is ${min_cents / 100:,.0f}."
