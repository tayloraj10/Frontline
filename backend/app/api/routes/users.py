from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services.organizer_dashboard import user_has_pending_organizer_items

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me/has-pending-organizer-items")
async def get_has_pending_organizer_items(
    viewer_user_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Feeds the /groups nav pulse -- true if the viewer admins any group with an
    overdue event nudge or an event missing logged metrics."""
    return {"has_pending_items": await user_has_pending_organizer_items(db, viewer_user_id)}


@router.get("/search")
async def search_users(
    q: str = Query(..., min_length=0),
    limit: int = Query(10, ge=1, le=25),
    db: AsyncSession = Depends(get_db),
):
    """Search profiles by username/display_name — used e.g. to let an event organizer
    find and add an attendee who never RSVP'd. Requires at least 2 characters to avoid
    scanning on every keystroke."""
    query = q.strip()
    if len(query) < 2:
        return []

    rows = (
        await db.execute(
            text("""
                SELECT id::text, username, display_name, avatar_url
                FROM profiles
                WHERE username ILIKE :prefix OR display_name ILIKE :prefix
                   OR username ILIKE :contains OR display_name ILIKE :contains
                ORDER BY
                    (username ILIKE :prefix OR display_name ILIKE :prefix) DESC,
                    username ASC
                LIMIT :limit
            """),
            {"prefix": f"{query}%", "contains": f"%{query}%", "limit": limit},
        )
    ).fetchall()

    return [
        {
            "id": r.id,
            "username": r.username,
            "display_name": r.display_name,
            "avatar_url": r.avatar_url,
        }
        for r in rows
    ]
