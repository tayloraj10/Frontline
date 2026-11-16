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


FT_PER_M = 3.28084
SQM_PER_SQFT = 0.092903
SQM_PER_SQMI = 2_589_988.11

# Defaults match the seeded game_settings rows (migration 146), in the units admins see.
_LIMIT_DEFAULTS = {
    "marketplace_job_min_area_sqft": 500,
    "marketplace_job_max_area_sqmi": 0.1,
    "marketplace_pin_radius_min_ft": 25,
    "marketplace_pin_radius_max_ft": 1000,
    "marketplace_max_vertices": 60,
    "sponsored_area_min_sqft": 21528,
    "sponsored_area_max_sqmi": 2,
    "sponsored_max_geo_units": 10,
    "sponsored_circle_radius_min_ft": 100,
    "sponsored_circle_radius_max_ft": 1000,
}


def _ft_to_m(ft: float) -> int:
    # Rounded like the frontend so 25 ft is 8 m and 1000 ft is 305 m on both sides.
    return round(ft / FT_PER_M)


async def size_limits(db: AsyncSession) -> dict:
    """Admin-tunable size limits for drawn areas, pins and geo-unit picks, converted to meters / sq m."""
    s = {**_LIMIT_DEFAULTS, **await get_game_settings(db)}
    return {
        "job_min_area_sqm": s["marketplace_job_min_area_sqft"] * SQM_PER_SQFT,
        "job_max_area_sqm": s["marketplace_job_max_area_sqmi"] * SQM_PER_SQMI,
        "pin_radius_min_m": _ft_to_m(s["marketplace_pin_radius_min_ft"]),
        "pin_radius_max_m": _ft_to_m(s["marketplace_pin_radius_max_ft"]),
        "pin_radius_min_ft": int(s["marketplace_pin_radius_min_ft"]),
        "pin_radius_max_ft": int(s["marketplace_pin_radius_max_ft"]),
        "max_vertices": int(s["marketplace_max_vertices"]),
        "area_min_sqm": s["sponsored_area_min_sqft"] * SQM_PER_SQFT,
        "area_max_sqm": s["sponsored_area_max_sqmi"] * SQM_PER_SQMI,
        "area_max_sqmi": s["sponsored_area_max_sqmi"],
        "max_geo_units": int(s["sponsored_max_geo_units"]),
        "circle_radius_min_m": _ft_to_m(s["sponsored_circle_radius_min_ft"]),
        "circle_radius_max_m": _ft_to_m(s["sponsored_circle_radius_max_ft"]),
    }


async def retake_wait_hours(db: AsyncSession) -> int:
    """Hours to wait before taking the same job or site again (game_settings.retake_wait_hours). Shared by jobs and sites."""
    row = (await db.execute(text("SELECT value FROM game_settings WHERE key = 'retake_wait_hours'"))).first()
    return int(row[0]) if row else 24
