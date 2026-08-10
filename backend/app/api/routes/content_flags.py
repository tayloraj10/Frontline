from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services.game_settings import get_game_settings

router = APIRouter(prefix="/content-flags", tags=["content-flags"])

CONTENT_TYPES = {"contribution_photo", "cleanup_log_photo", "cleanup_event_photo", "avatar"}


class FlagContentRequest(BaseModel):
    content_type: str
    content_id: UUID
    photo_url: str
    user_id: UUID
    reason: str | None = None


async def _hide_contribution_photo(db: AsyncSession, content_id: UUID, photo_url: str) -> bool:
    result = await db.execute(
        text("""
            UPDATE contributions SET photo_url = NULL
            WHERE id = :id AND photo_url = :photo_url
            RETURNING id
        """),
        {"id": str(content_id), "photo_url": photo_url},
    )
    return result.fetchone() is not None


async def _hide_cleanup_log_photo(db: AsyncSession, content_id: UUID, photo_url: str) -> bool:
    result = await db.execute(
        text("""
            UPDATE cleanups SET image_urls = array_remove(image_urls, :photo_url)
            WHERE id = :id AND :photo_url = ANY(image_urls)
            RETURNING id
        """),
        {"id": str(content_id), "photo_url": photo_url},
    )
    return result.fetchone() is not None


async def _hide_cleanup_event_photo(db: AsyncSession, content_id: UUID, photo_url: str) -> bool:
    result = await db.execute(
        text("""
            DELETE FROM cleanup_event_photos
            WHERE id = :id AND photo_url = :photo_url
            RETURNING id
        """),
        {"id": str(content_id), "photo_url": photo_url},
    )
    return result.fetchone() is not None


async def _hide_avatar(db: AsyncSession, content_id: UUID, photo_url: str) -> bool:
    result = await db.execute(
        text("""
            UPDATE profiles SET avatar_url = NULL
            WHERE id = :id AND avatar_url = :photo_url
            RETURNING id
        """),
        {"id": str(content_id), "photo_url": photo_url},
    )
    return result.fetchone() is not None


_HIDE_HANDLERS = {
    "contribution_photo": _hide_contribution_photo,
    "cleanup_log_photo": _hide_cleanup_log_photo,
    "cleanup_event_photo": _hide_cleanup_event_photo,
    "avatar": _hide_avatar,
}


@router.post("")
async def flag_content(payload: FlagContentRequest, db: AsyncSession = Depends(get_db)):
    """Report a user-generated photo (contribution photo, cleanup log/gallery photo, or
    avatar) as objectionable. Once flag_auto_hide_threshold distinct users have flagged
    the same photo, it's automatically removed from wherever it's displayed."""
    if payload.content_type not in CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid content_type")

    await db.execute(
        text("""
            INSERT INTO content_flags (content_type, content_id, photo_url, flagged_by_user_id, reason)
            VALUES (:content_type, :content_id, :photo_url, :user_id, :reason)
            ON CONFLICT (content_type, content_id, photo_url, flagged_by_user_id) DO NOTHING
        """),
        {
            "content_type": payload.content_type,
            "content_id": str(payload.content_id),
            "photo_url": payload.photo_url,
            "user_id": str(payload.user_id),
            "reason": payload.reason,
        },
    )

    count_result = await db.execute(
        text("""
            SELECT COUNT(*) FROM content_flags
            WHERE content_type = :content_type AND content_id = :content_id AND photo_url = :photo_url
        """),
        {
            "content_type": payload.content_type,
            "content_id": str(payload.content_id),
            "photo_url": payload.photo_url,
        },
    )
    flag_count = count_result.scalar() or 0
    settings = await get_game_settings(db)

    auto_hidden = False
    if flag_count >= settings.get("flag_auto_hide_threshold", 3):
        auto_hidden = await _HIDE_HANDLERS[payload.content_type](db, payload.content_id, payload.photo_url)

    await db.commit()
    return {"flag_count": flag_count, "auto_hidden": auto_hidden}
