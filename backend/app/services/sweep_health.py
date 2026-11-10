"""Heartbeat for the marketplace sweep cron. The cron endpoint records each run; any later request
that touches the marketplace checks the heartbeat and tells admins once if the cron has gone quiet."""

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

NAME = "marketplace_sweep"
STALE_AFTER_MIN = 45  # the cron runs every 15 minutes
REALERT_AFTER_H = 6


async def record_run(db: AsyncSession) -> None:
    await db.execute(
        text(
            """INSERT INTO service_heartbeats (name, last_run_at) VALUES (:n, now())
               ON CONFLICT (name) DO UPDATE SET last_run_at = now(), last_alert_at = NULL"""
        ),
        {"n": NAME},
    )
    await db.commit()


async def alert_if_stale(db: AsyncSession) -> None:
    """Notifies admins when the sweep has not run recently. Never raises."""
    from app.services.marketplace import _notify_admins

    try:
        row = (
            await db.execute(
                text(
                    """UPDATE service_heartbeats SET last_alert_at = now()
                       WHERE name = :n
                         AND last_run_at < now() - make_interval(mins => :m)
                         AND (last_alert_at IS NULL OR last_alert_at < now() - make_interval(hours => :h))
                       RETURNING extract(epoch FROM now() - last_run_at) / 60 AS minutes"""
                ),
                {"n": NAME, "m": STALE_AFTER_MIN, "h": REALERT_AFTER_H},
            )
        ).first()
        await db.commit()
        if row is None:
            return
        logger.error("marketplace sweep has not run for %d minutes", row.minutes)
        await _notify_admins(
            db, "payments_admin_alert", "Marketplace sweep has stopped",
            f"The scheduled sweep last ran {int(row.minutes)} minutes ago. Payments are not being auto-released. "
            "Check the Railway cron service and ADMIN_API_SECRET.",
            "/marketplace/admin",
        )
    except Exception:
        logger.exception("sweep health check failed")
