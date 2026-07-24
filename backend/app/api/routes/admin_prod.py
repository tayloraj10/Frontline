from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.admin import search_users_by_username_or_email, wipe_cleanup_event
from app.core.config import settings
from app.db.database import get_db

router = APIRouter(prefix="/admin-prod", tags=["admin-prod"])


def _check_secret(x_admin_api_secret: str | None) -> None:
    """
    Narrow, secret-protected mirror of select admin.py endpoints, mounted in every
    environment (including production) since the full admin router is excluded there.
    Called by Next.js server routes, which re-verify the caller is an authenticated
    platform admin before forwarding here with the shared secret — the secret alone is
    not meant to be the only gate, just defense in depth against these URLs being hit
    directly.
    """
    if not settings.admin_api_secret:
        raise HTTPException(503, "Admin endpoint is not configured (ADMIN_API_SECRET unset).")
    if x_admin_api_secret != settings.admin_api_secret:
        raise HTTPException(403, "Invalid or missing admin API secret.")


@router.get("/users")
async def search_users(
    q: str,
    x_admin_api_secret: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _check_secret(x_admin_api_secret)
    return await search_users_by_username_or_email(db, q)


@router.post("/cleanup-events/{cleanup_id}")
async def wipe_cleanup_event_data(
    cleanup_id: UUID,
    x_admin_api_secret: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _check_secret(x_admin_api_secret)
    return await wipe_cleanup_event(db, cleanup_id)
