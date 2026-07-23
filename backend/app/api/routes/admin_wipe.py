from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.admin import wipe_cleanup_event
from app.core.config import settings
from app.db.database import get_db

router = APIRouter(prefix="/admin-wipe", tags=["admin-wipe"])


def _check_secret(x_admin_wipe_secret: str | None) -> None:
    if not settings.admin_wipe_secret:
        raise HTTPException(503, "Admin wipe endpoint is not configured (ADMIN_WIPE_SECRET unset).")
    if x_admin_wipe_secret != settings.admin_wipe_secret:
        raise HTTPException(403, "Invalid or missing wipe secret.")


@router.post("/cleanup-events/{cleanup_id}")
async def wipe_cleanup_event_data(
    cleanup_id: UUID,
    x_admin_wipe_secret: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    Narrow, secret-protected mirror of admin.py's cleanup-event wipe, mounted in every
    environment (including production) since the full admin router is excluded there.
    Called by the Next.js server route, which re-verifies the caller is an authenticated
    platform admin before forwarding here with the shared secret — the secret alone is not
    meant to be the only gate, just defense in depth against this URL being hit directly.
    """
    _check_secret(x_admin_wipe_secret)
    return await wipe_cleanup_event(db, cleanup_id)
