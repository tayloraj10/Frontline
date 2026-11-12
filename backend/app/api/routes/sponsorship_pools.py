from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, require_user
from app.core.rate_limit import limit_money, limit_writes
from app.db.database import get_db
from app.services import sponsorship_pools as pools

router = APIRouter(prefix="/sponsorship-pools", tags=["sponsorship-pools"])


class CreatePoolRequest(BaseModel):
    title: str
    message: str | None = None
    goal_cents: int
    payout_rule: dict
    cap_per_user_cents: int | None = None
    site_label: str
    site_latitude: float
    site_longitude: float
    site_radius_meters: int
    days: int | None = None


class ContributeRequest(BaseModel):
    amount_cents: int
    success_url: str
    cancel_url: str


def _wrap(e: pools.PoolError) -> HTTPException:
    return HTTPException(e.status_code, e.detail)


@router.get("")
async def list_pools(user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)):
    return await pools.list_pools(db, user.id)


@router.post("", dependencies=[Depends(limit_writes)])
async def create_pool(
    payload: CreatePoolRequest, user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)
):
    try:
        return await pools.create_pool(
            db, user.id, title=payload.title, message=payload.message, goal_cents=payload.goal_cents,
            payout_rule=payload.payout_rule, cap_per_user_cents=payload.cap_per_user_cents,
            site_label=payload.site_label, latitude=payload.site_latitude, longitude=payload.site_longitude,
            radius_meters=payload.site_radius_meters, days=payload.days,
        )
    except pools.PoolError as e:
        raise _wrap(e) from e


@router.get("/{pool_id}")
async def get_pool(pool_id: UUID, user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)):
    try:
        return await pools.get_pool(db, pool_id, user.id)
    except pools.PoolError as e:
        raise _wrap(e) from e


@router.post("/{pool_id}/contribute", dependencies=[Depends(limit_money)])
async def contribute(
    pool_id: UUID, payload: ContributeRequest,
    user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db),
):
    try:
        url = await pools.start_contribution(
            db, pool_id, user.id, payload.amount_cents, payload.success_url, payload.cancel_url
        )
    except pools.PoolError as e:
        raise _wrap(e) from e
    return {"url": url}


@router.post("/{pool_id}/cancel", dependencies=[Depends(limit_money)])
async def cancel(pool_id: UUID, user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)):
    try:
        await pools.cancel_pool(db, pool_id, user.id, user.is_admin)
    except pools.PoolError as e:
        raise _wrap(e) from e
    return {"ok": True}
