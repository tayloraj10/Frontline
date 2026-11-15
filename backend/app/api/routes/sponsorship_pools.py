from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, optional_user, require_user
from app.core.rate_limit import limit_money, limit_writes
from app.db.database import get_db
from app.services import sponsorship_pools as pools

router = APIRouter(prefix="/sponsorship-pools", tags=["sponsorship-pools"])


class CreatePoolRequest(BaseModel):
    title: str
    message: str | None = None
    goal_cents: int
    payout_rule: dict | None = None
    plan_kind: str = "rule"  # rule | group | vote | jobs
    group_id: UUID | None = None
    handoff_note: str | None = None
    handoff_date: str | None = None
    cap_per_user_cents: int | None = None
    model: str = "site"
    site_label: str | None = None
    site_latitude: float | None = None
    site_longitude: float | None = None
    site_radius_meters: int | None = None
    # group_area only: {kind: 'geo_units'|'circle'|'polygon', ...}, see build_area_geometry
    area: dict | None = None
    area_name: str | None = None
    days: int | None = None


class PlanRequest(BaseModel):
    kind: str = "rule"
    payout_rule: dict | None = None
    group_id: UUID | None = None
    note: str | None = None
    date: str | None = None


class PoolJobRequest(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(default="", max_length=2000)
    job_type: str
    size: Literal["small", "medium", "large"] | None = None
    hazards_ack: bool
    address_label: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    time_mode: Literal["specific", "window", "flexible"] = "flexible"
    starts_at: datetime | None = None
    window_start: datetime | None = None
    window_end: datetime | None = None
    flexible_days: int | None = None
    price_type: Literal["hourly", "fixed"] = "fixed"
    price_cents: int = Field(gt=0, le=1_000_000)
    radius_m: int | None = Field(default=None, ge=1)
    polygon: list[list[float]] | None = None
    photos: list[str] = Field(default_factory=list, max_length=4)
    bag_dropoff_ok: bool = False
    bag_dropoff_address: str | None = Field(default=None, max_length=300)
    bag_dropoff_note: str | None = Field(default=None, max_length=300)


class DisputeRequest(BaseModel):
    details: str = Field(min_length=3, max_length=2000)


class FreezeRequest(BaseModel):
    frozen: bool = True


class VoteRequest(BaseModel):
    choice: str


class HandoffRequest(BaseModel):
    accept: bool


class ExtendRequest(BaseModel):
    days: int = 30


class ContributeRequest(BaseModel):
    amount_cents: int
    success_url: str
    cancel_url: str


def _wrap(e: pools.PoolError) -> HTTPException:
    return HTTPException(e.status_code, e.detail)


@router.get("")
async def list_pools(user: CurrentUser | None = Depends(optional_user), db: AsyncSession = Depends(get_db)):
    """Public: logged-out visitors see open pools. Closed pools you took part in need an account."""
    return await pools.list_pools(db, user.id if user else None)


@router.post("", dependencies=[Depends(limit_writes)])
async def create_pool(
    payload: CreatePoolRequest, user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)
):
    try:
        return await pools.create_pool(
            db, user.id, title=payload.title, message=payload.message, goal_cents=payload.goal_cents,
            payout_rule=payload.payout_rule, cap_per_user_cents=None,
            model=payload.model, site_label=payload.site_label, latitude=payload.site_latitude,
            longitude=payload.site_longitude, radius_meters=payload.site_radius_meters,
            area=payload.area, area_name=payload.area_name, days=payload.days,
            plan_kind=payload.plan_kind, group_id=payload.group_id,
            handoff_note=payload.handoff_note, handoff_date=payload.handoff_date,
        )
    except pools.PoolError as e:
        raise _wrap(e) from e


@router.get("/groups")
async def search_groups(
    q: str = "", user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)
):
    """Groups a pool can be handed to. Registered before /{pool_id} so the path is not read as an id."""
    return await pools.search_groups(db, q)


@router.get("/{pool_id}")
async def get_pool(pool_id: UUID, user: CurrentUser | None = Depends(optional_user), db: AsyncSession = Depends(get_db)):
    try:
        return await pools.get_pool(db, pool_id, user.id if user else None)
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


@router.post("/{pool_id}/plan", dependencies=[Depends(limit_money)])
async def change_plan(
    pool_id: UUID, payload: PlanRequest,
    user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db),
):
    try:
        return await pools.change_payout_plan(
            db, pool_id, user.id, user.is_admin, payload.payout_rule,
            kind=payload.kind, group_id=payload.group_id, note=payload.note, date=payload.date,
        )
    except pools.PoolError as e:
        raise _wrap(e) from e


@router.post("/{pool_id}/run", dependencies=[Depends(limit_money)])
async def run_with_raised(
    pool_id: UUID, user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)
):
    try:
        return await pools.run_with_raised(db, pool_id, user.id, user.is_admin)
    except pools.PoolError as e:
        raise _wrap(e) from e


@router.post("/{pool_id}/extend", dependencies=[Depends(limit_money)])
async def extend(
    pool_id: UUID, payload: ExtendRequest,
    user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db),
):
    try:
        return await pools.extend_pool(db, pool_id, user.id, user.is_admin, payload.days)
    except pools.PoolError as e:
        raise _wrap(e) from e


@router.post("/{pool_id}/vote", dependencies=[Depends(limit_writes)])
async def vote(
    pool_id: UUID, payload: VoteRequest,
    user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db),
):
    try:
        return await pools.cast_vote(db, pool_id, user.id, payload.choice)
    except pools.PoolError as e:
        raise _wrap(e) from e


@router.post("/{pool_id}/handoff", dependencies=[Depends(limit_money)])
async def handoff(
    pool_id: UUID, payload: HandoffRequest,
    user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db),
):
    try:
        return await pools.respond_handoff(db, pool_id, user.id, payload.accept)
    except pools.PoolError as e:
        raise _wrap(e) from e


@router.post("/{pool_id}/jobs", dependencies=[Depends(limit_money)])
async def post_job(
    pool_id: UUID, payload: PoolJobRequest, user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)
):
    try:
        return await pools.post_job(db, pool_id, user.id, payload.model_dump())
    except pools.PoolError as e:
        raise _wrap(e) from e


@router.post("/{pool_id}/jobs/{job_id}/approve", dependencies=[Depends(limit_money)])
async def approve_job(
    pool_id: UUID, job_id: UUID, user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)
):
    try:
        return await pools.approve_job(db, pool_id, job_id, user.id, user.is_admin)
    except pools.PoolError as e:
        raise _wrap(e) from e


@router.post("/{pool_id}/jobs/{job_id}/dispute", dependencies=[Depends(limit_money)])
async def dispute_job(
    pool_id: UUID, job_id: UUID, payload: DisputeRequest,
    user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db),
):
    try:
        return await pools.dispute_job(db, pool_id, job_id, user.id, user.is_admin, payload.details)
    except pools.PoolError as e:
        raise _wrap(e) from e


@router.post("/{pool_id}/close", dependencies=[Depends(limit_money)])
async def close_pool(pool_id: UUID, user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)):
    try:
        return await pools.close_pool(db, pool_id, user.id, user.is_admin)
    except pools.PoolError as e:
        raise _wrap(e) from e


@router.post("/{pool_id}/freeze", dependencies=[Depends(limit_money)])
async def freeze_pool(
    pool_id: UUID, payload: FreezeRequest, user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)
):
    if not user.is_admin:
        raise HTTPException(403, "Admins only.")
    try:
        return await pools.set_frozen(db, pool_id, payload.frozen)
    except pools.PoolError as e:
        raise _wrap(e) from e
