from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.database import get_db

router = APIRouter(prefix="/device-tokens", tags=["device-tokens"])


class DeviceTokenRequest(BaseModel):
    user_id: UUID
    token: str
    platform: str  # 'ios' | 'android'


async def _require_matching_user(user_id: UUID, authorization: str | None) -> None:
    """Verifies the caller's Supabase access token belongs to user_id, so a
    client can't register a device token — and hijack that user's future push
    notifications — under an arbitrary victim user_id it happens to know."""
    if not authorization:
        raise HTTPException(status_code=401, detail="missing Authorization header")
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={"apikey": settings.supabase_service_role_key, "Authorization": authorization},
            timeout=10,
        )
    if resp.status_code != 200 or resp.json().get("id") != str(user_id):
        raise HTTPException(status_code=403, detail="user_id does not match authenticated user")


@router.post("/register")
async def register_device_token(
    payload: DeviceTokenRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
):
    """Upsert a device's FCM registration token, called on login and app-foreground.
    A token is unique per device, not per user — re-registering under a different
    user (e.g. account switch on the same device) reassigns ownership rather than
    erroring, since the old owner no longer wants pushes on that device anyway."""
    await _require_matching_user(payload.user_id, authorization)
    await db.execute(
        text("""
            INSERT INTO device_tokens (user_id, token, platform, last_seen_at)
            VALUES (:user_id, :token, :platform, NOW())
            ON CONFLICT (token) DO UPDATE SET
                user_id = EXCLUDED.user_id,
                platform = EXCLUDED.platform,
                last_seen_at = NOW()
        """),
        {"user_id": str(payload.user_id), "token": payload.token, "platform": payload.platform},
    )
    await db.commit()
    return {"registered": True}
