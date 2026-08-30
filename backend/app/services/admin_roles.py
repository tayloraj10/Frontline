from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

ADMIN_ROLES = ("group_approver", "business_approver", "event_manager")


async def has_admin_role(db: AsyncSession, user_id: UUID, role: str) -> bool:
    """True if the user is a full site admin (implicitly holds every scoped role) or
    holds the specific scoped role in admin_roles."""
    row = (
        await db.execute(
            text("""
                SELECT 1
                FROM profiles p
                WHERE p.id = :user_id
                  AND (
                    p.is_admin = true
                    OR EXISTS (
                        SELECT 1 FROM admin_roles ar
                        WHERE ar.user_id = p.id AND ar.role = :role
                    )
                  )
            """),
            {"user_id": str(user_id), "role": role},
        )
    ).fetchone()
    return row is not None


async def is_site_admin(db: AsyncSession, user_id: UUID) -> bool:
    row = (
        await db.execute(
            text("SELECT is_admin FROM profiles WHERE id = :user_id"),
            {"user_id": str(user_id)},
        )
    ).fetchone()
    return bool(row and row.is_admin)


async def list_roles(db: AsyncSession, user_id: UUID) -> list[str]:
    result = await db.execute(
        text("SELECT role FROM admin_roles WHERE user_id = :user_id ORDER BY role"),
        {"user_id": str(user_id)},
    )
    return [row.role for row in result.fetchall()]
