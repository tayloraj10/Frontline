import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

logger = logging.getLogger(__name__)


def format_event_datetime(dt: datetime) -> str:
    """Format a datetime like 'August 27, 2026 at 2:30 PM' without relying on
    the %-d / %-I strftime flags, which only exist on Unix and raise ValueError
    on Windows (used for local dev)."""
    hour_12 = dt.hour % 12 or 12
    return f"{dt.strftime('%B')} {dt.day}, {dt.strftime('%Y')} at {hour_12}:{dt.strftime('%M %p')}"

RESEND_API_URL = "https://api.resend.com/emails"
DEFAULT_FROM = "Frontline <notifications@frontlinemaps.com>"
SUPPORT_EMAIL = "frontlinemapsapp@gmail.com"


async def send_email(
    db: AsyncSession,
    *,
    to: list[str],
    subject: str,
    html: str,
    kind: str,
    cc: Optional[list[str]] = None,
    bcc: Optional[list[str]] = None,
    related_id: Optional[UUID] = None,
) -> bool:
    """Sends one email via Resend and logs the attempt to emails_sent regardless
    of outcome. Every send is BCC'd to SUPPORT_EMAIL (in addition to any caller-supplied
    `bcc`, e.g. a multi-recipient blast where addresses shouldn't be visible to each
    other in `to`) and Reply-To'd there too, so replies land somewhere a person actually
    reads them, since notifications@frontlinemaps.com is unmonitored.

    Returns True on a confirmed send, False otherwise (never raises) — a failed
    notification email should never break the caller's primary request.
    """
    cc = cc or []
    all_bcc = [*(bcc or []), SUPPORT_EMAIL]
    status = "sent"
    error: Optional[str] = None

    if not settings.resend_api_key:
        status = "failed"
        error = "RESEND_API_KEY not configured"
        logger.warning("send_email skipped (%s): no RESEND_API_KEY configured", kind)
    else:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    RESEND_API_URL,
                    headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                    json={
                        "from": DEFAULT_FROM,
                        "to": to,
                        "cc": cc,
                        "bcc": all_bcc,
                        "reply_to": SUPPORT_EMAIL,
                        "subject": subject,
                        "html": html,
                    },
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            status = "failed"
            error = str(exc)
            logger.warning("send_email failed (%s): %s", kind, error)

    await db.execute(
        text("""
            INSERT INTO emails_sent (kind, to_emails, cc_emails, bcc_emails, subject, related_id, status, error)
            VALUES (:kind, :to_emails, :cc_emails, :bcc_emails, :subject, :related_id, :status, :error)
        """),
        {
            "kind": kind,
            "to_emails": to,
            "cc_emails": cc,
            "bcc_emails": all_bcc,
            "subject": subject,
            "related_id": str(related_id) if related_id else None,
            "status": status,
            "error": error,
        },
    )
    await db.commit()

    return status == "sent"
