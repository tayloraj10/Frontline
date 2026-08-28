from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def is_group_admin(db: AsyncSession, group_id: UUID, user_id: UUID) -> bool:
    result = await db.execute(
        text("""
            SELECT 1 FROM group_members
            WHERE group_id = :group_id AND user_id = :user_id AND role = 'admin'
        """),
        {"group_id": str(group_id), "user_id": str(user_id)},
    )
    return result.fetchone() is not None


async def is_event_organizer(db: AsyncSession, cleanup_id: UUID, user_id: UUID) -> bool:
    result = await db.execute(
        text("""
            SELECT 1 FROM cleanup_rsvps
            WHERE cleanup_id = :cleanup_id AND user_id = :user_id AND is_organizer = true
        """),
        {"cleanup_id": str(cleanup_id), "user_id": str(user_id)},
    )
    return result.fetchone() is not None


async def is_any_cohost_admin(db: AsyncSession, cleanup_id: UUID, user_id: UUID) -> bool:
    result = await db.execute(
        text("""
            SELECT 1 FROM cleanup_event_cohosts h
            JOIN group_members gm ON gm.group_id = h.group_id
            WHERE h.cleanup_id = :cleanup_id AND gm.user_id = :user_id AND gm.role = 'admin'
        """),
        {"cleanup_id": str(cleanup_id), "user_id": str(user_id)},
    )
    return result.fetchone() is not None


async def can_manage_event(db: AsyncSession, group_id: UUID, cleanup_id: UUID, user_id: UUID) -> bool:
    """Group admins retain their existing blanket override, as do admins of any
    co-hosting group; real per-event organizers (the creator, or anyone an organizer
    has promoted) get the same powers without needing to be a group admin."""
    if await is_group_admin(db, group_id, user_id):
        return True
    if await is_event_organizer(db, cleanup_id, user_id):
        return True
    return await is_any_cohost_admin(db, cleanup_id, user_id)
