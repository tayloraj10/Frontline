from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services.admin_roles import ADMIN_ROLES, is_site_admin, list_roles

router = APIRouter(prefix="/admin/roles", tags=["admin-roles"])


class GrantRolesRequest(BaseModel):
    requesting_user_id: UUID
    target_user_id: UUID
    roles: list[str]

    @field_validator("roles")
    @classmethod
    def _valid_roles(cls, v: list[str]) -> list[str]:
        invalid = set(v) - set(ADMIN_ROLES)
        if invalid:
            raise ValueError(f"Unknown role(s): {', '.join(sorted(invalid))}")
        return v


@router.get("/{user_id}")
async def get_user_roles(user_id: UUID, requesting_user_id: UUID, db: AsyncSession = Depends(get_db)):
    if not await is_site_admin(db, requesting_user_id):
        raise HTTPException(status_code=403, detail="Only a site admin can view admin roles")
    return {"user_id": str(user_id), "roles": await list_roles(db, user_id)}


@router.post("")
async def grant_roles(payload: GrantRolesRequest, db: AsyncSession = Depends(get_db)):
    """Sets the target user's admin_roles to exactly the given set (upserts new ones,
    removes any not included) — the roles list from a multi-select is always the
    full desired state, not a delta."""
    if not await is_site_admin(db, payload.requesting_user_id):
        raise HTTPException(status_code=403, detail="Only a site admin can grant admin roles")

    target_result = await db.execute(
        text("SELECT 1 FROM profiles WHERE id = :id"), {"id": str(payload.target_user_id)}
    )
    if not target_result.fetchone():
        raise HTTPException(status_code=404, detail="User not found")

    await db.execute(
        text("""
            DELETE FROM admin_roles
            WHERE user_id = :user_id
              AND role != ALL(CAST(:roles AS text[]))
        """),
        {"user_id": str(payload.target_user_id), "roles": payload.roles},
    )
    for role in payload.roles:
        await db.execute(
            text("""
                INSERT INTO admin_roles (user_id, role, granted_by)
                VALUES (:user_id, :role, :granted_by)
                ON CONFLICT (user_id, role) DO NOTHING
            """),
            {
                "user_id": str(payload.target_user_id),
                "role": role,
                "granted_by": str(payload.requesting_user_id),
            },
        )
    await db.commit()

    return {"user_id": str(payload.target_user_id), "roles": payload.roles}


@router.delete("/{user_id}/{role}")
async def revoke_role(user_id: UUID, role: str, requesting_user_id: UUID, db: AsyncSession = Depends(get_db)):
    if not await is_site_admin(db, requesting_user_id):
        raise HTTPException(status_code=403, detail="Only a site admin can revoke admin roles")
    await db.execute(
        text("DELETE FROM admin_roles WHERE user_id = :user_id AND role = :role"),
        {"user_id": str(user_id), "role": role},
    )
    await db.commit()
    return {"revoked": True}
