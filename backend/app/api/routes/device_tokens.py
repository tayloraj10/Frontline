from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db

router = APIRouter(prefix="/device-tokens", tags=["device-tokens"])


class DeviceTokenRequest(BaseModel):
    user_id: UUID
    token: str
    platform: str  # 'ios' | 'android'


@router.post("/register")
async def register_device_token(payload: DeviceTokenRequest, db: AsyncSession = Depends(get_db)):
    """Upsert a device's FCM registration token, called on login and app-foreground.
    A token is unique per device, not per user — re-registering under a different
    user (e.g. account switch on the same device) reassigns ownership rather than
    erroring, since the old owner no longer wants pushes on that device anyway."""
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
