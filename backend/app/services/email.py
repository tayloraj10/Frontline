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

_FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"


def render_group_logo(logo_url: Optional[str], group_name: Optional[str]) -> str:
    """Centered, fixed-size logo block for the top of an email — used consistently
    across templates so a group's branding never depends on the surrounding layout.
    Explicit width/height attributes (not just CSS) and display:block on the <img>
    itself, since several email clients (Outlook in particular) ignore CSS sizing on
    images without them and some ignore text-align on a parent when the child image
    isn't itself block-level, both of which can leave a "centered" logo mis-placed."""
    if not logo_url:
        return ""
    alt = group_name or "Group logo"
    return (
        f'<div style="text-align:center; margin-bottom:20px;">'
        f'<img src="{logo_url}" alt="{alt}" width="64" height="64" '
        f'style="display:block; margin:0 auto; width:64px; height:64px; border-radius:50%; object-fit:cover;">'
        f"</div>"
    )


def render_cta_button(href: str, label: str) -> str:
    """A tappable button instead of a bare text link, matching the CTA style used
    throughout the rest of the product's transactional surfaces."""
    return (
        f'<a href="{href}" style="display:inline-block; background-color:#18181b; color:#ffffff; '
        f'text-decoration:none; padding:11px 22px; border-radius:8px; font-weight:600; font-size:14px;">'
        f"{label}</a>"
    )


def wrap_email_html(content: str) -> str:
    """Wraps template-specific inner content in a full HTML document with a
    bulletproof table-based layout, since a bare fragment with no <html>/<body> and no
    explicit container width renders inconsistently across mail clients (fonts falling
    back to a client default serif, elements collapsing to their own width instead of
    the message column, etc.) rather than the intended centered card look."""
    return f"""<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background-color:#f4f4f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px; max-width:100%; background-color:#ffffff; border-radius:12px; font-family:{_FONT_STACK}; color:#18181b;">
            <tr>
              <td style="padding:32px 32px 8px 32px; font-size:15px; line-height:1.5;">
                {content}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 28px 32px;">
                <hr style="border:none; border-top:1px solid #e4e4e7; margin:16px 0;">
                <p style="font-size:12px; color:#a1a1aa; margin:0;">
                  Sent by Frontline because of activity on an event you're involved with.
                  Questions? Just reply to this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


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
