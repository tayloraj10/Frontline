from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def get_game_settings(db: AsyncSession) -> dict[str, float]:
    """Fetch all admin-editable game-balance settings as a flat {key: value} dict."""
    result = await db.execute(text("SELECT key, value FROM game_settings"))
    return {row[0]: float(row[1]) for row in result.fetchall()}
