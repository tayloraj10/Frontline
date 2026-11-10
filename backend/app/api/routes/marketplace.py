from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import limit_money, limit_writes
from app.core.auth import CurrentUser, require_service, require_user
from app.db.database import get_db
from app.services import connect
from app.services.admin_roles import is_site_admin
from app.services import marketplace as svc
from app.services import sweep_health
from app.services import marketplace_payments as mp

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


class Actor(BaseModel):
    user_id: UUID
    is_admin: bool = False


async def actor(user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)) -> Actor:
    """Identity comes from the verified Supabase token (core/auth.py), never from caller-supplied
    headers. Admin status is read from the database on every request."""
    return Actor(user_id=user.id, is_admin=await is_site_admin(db, user.id))


def admin_only(a: Actor = Depends(actor)) -> Actor:
    if not a.is_admin:
        raise HTTPException(403, "Admin only.")
    return a


def _wrap(exc: svc.MarketplaceError) -> HTTPException:
    return HTTPException(exc.status, exc.message)


# ------------------------------------------------------------------ agreements


@router.get("/agreements/{kind}")
async def get_agreement(kind: Literal["cleaner", "customer"], a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.current_agreement(db, kind)
    except svc.MarketplaceError as e:
        raise _wrap(e)


class AcceptAgreement(BaseModel):
    kind: Literal["cleaner", "customer"]
    legal_name: str
    is_adult: bool = False
    app_version: str | None = None


@router.post("/agreements/accept", dependencies=[Depends(limit_writes)])
async def accept_agreement(
    body: AcceptAgreement, request: Request, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)
):
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else None)
    try:
        return await svc.accept_agreement(db, a.user_id, body.kind, body.legal_name, body.is_adult, ip, body.app_version)
    except svc.MarketplaceError as e:
        raise _wrap(e)


# ------------------------------------------------------------ cleaner profiles


@router.get("/me")
async def me(a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    return await svc.my_status(db, a.user_id)


@router.get("/payments/card")
async def card(a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await mp.card_status(db, a.user_id)
    except mp.PaymentError as e:
        raise HTTPException(502, str(e))


class CardSetupIn(BaseModel):
    return_path: str = Field(default="/marketplace/post", max_length=200)


@router.post("/payments/card/setup", dependencies=[Depends(limit_money)])
async def card_setup(body: CardSetupIn, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    ok = body.return_path.startswith("/marketplace") and "//" not in body.return_path
    path = body.return_path if ok else "/marketplace/post"
    try:
        return {"url": await mp.create_card_setup_url(db, a.user_id, path)}
    except mp.PaymentError as e:
        raise HTTPException(502, str(e))


@router.post("/payouts/onboard", dependencies=[Depends(limit_money)])
async def payouts_onboard(a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await connect.create_onboarding_link(db, a.user_id, None)
    except connect.ConnectError as e:
        raise HTTPException(e.status, str(e))


@router.get("/payouts/status")
async def payouts_status(a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await connect.refresh_status(db, a.user_id)
    except connect.ConnectError as e:
        raise HTTPException(e.status, str(e))


class CleanerProfileIn(BaseModel):
    headline: str = Field(max_length=120)
    bio: str = Field(default="", max_length=2000)
    services: list[str]
    rate_type: Literal["hourly", "fixed"] = "hourly"
    rate_cents: int | None = Field(default=None, gt=0)
    service_radius_km: int = Field(default=10, ge=1, le=100)
    latitude: float | None = None
    longitude: float | None = None
    area_label: str | None = None


@router.put("/cleaner-profile", dependencies=[Depends(limit_writes)])
async def put_cleaner_profile(body: CleanerProfileIn, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.upsert_cleaner_profile(db, a.user_id, **body.model_dump())
    except svc.MarketplaceError as e:
        raise _wrap(e)


@router.get("/cleaners")
async def cleaners(
    service: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    a: Actor = Depends(actor),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_cleaners(db, service=service, latitude=latitude, longitude=longitude)


@router.get("/cleaners/{cleaner_id}")
async def cleaner(cleaner_id: UUID, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.get_cleaner(db, cleaner_id)
    except svc.MarketplaceError as e:
        raise _wrap(e)


# ------------------------------------------------------------------------ jobs


class JobIn(BaseModel):
    cleaner_id: UUID | None = None  # set = direct booking request, unset = post to the board
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(default="", max_length=2000)
    job_type: str
    size: Literal["small", "medium", "large"] | None = None
    hazards_ack: bool
    address_label: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    time_mode: Literal["specific", "window", "flexible"] = "window"
    starts_at: datetime | None = None
    window_start: datetime | None = None
    window_end: datetime | None = None
    flexible_days: int | None = None
    price_type: Literal["hourly", "fixed"] = "fixed"
    price_cents: int = Field(gt=0, le=1_000_000)
    radius_m: int | None = Field(default=None, ge=10, le=5000)
    polygon: list[list[float]] | None = None  # [[lng, lat], ...] drawn area
    photos: list[str] = Field(default_factory=list, max_length=4)  # photos of the site, uploaded first


@router.get("/pricing")
async def pricing(a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    return await svc.pricing(db)


@router.post("/jobs", dependencies=[Depends(limit_money)])
async def create_job(body: JobIn, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.create_job(db, a.user_id, **body.model_dump())
    except svc.MarketplaceError as e:
        raise _wrap(e)


@router.post("/sweep", dependencies=[Depends(require_service)])
async def sweep(db: AsyncSession = Depends(get_db)):
    """Expires unclaimed jobs past their deadline and auto-releases completed jobs past the
    review window. Called every 15 minutes by a Railway cron (scripts/run_marketplace_sweep.py).
    Time-based and idempotent, but it moves money, so it requires the service secret."""
    await sweep_health.record_run(db)
    return {"changed": await svc.expire_stale_jobs(db)}


@router.get("/jobs")
async def my_jobs(role: Literal["customer", "cleaner"] = "customer", a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    await sweep_health.alert_if_stale(db)
    await svc.expire_stale_jobs(db)
    return await svc.list_my_jobs(db, a.user_id, role)


@router.get("/jobs/summary")
async def my_jobs_summary(role: Literal["customer", "cleaner"] = "customer", a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    return await svc.job_money_summary(db, a.user_id, role)


@router.get("/board/pins")
async def board_pins(
    time_mode: Literal["specific", "window", "flexible"] | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    job_type: str | None = None,
    a: Actor = Depends(actor),
    db: AsyncSession = Depends(get_db),
):
    return await svc.board_pins(
        db, a.user_id, time_mode=time_mode, latitude=latitude, longitude=longitude, job_type=job_type
    )


@router.get("/board")
async def board(
    time_mode: Literal["specific", "window", "flexible"] | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    job_type: str | None = None,
    limit: int = 20,
    offset: int = 0,
    a: Actor = Depends(actor),
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_board(
        db, a.user_id, time_mode=time_mode, latitude=latitude, longitude=longitude,
        job_type=job_type, limit=limit, offset=offset,
    )


@router.get("/jobs/{job_id}")
async def job(job_id: UUID, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.get_job(db, job_id, a.user_id, is_admin=a.is_admin)
    except svc.MarketplaceError as e:
        raise _wrap(e)


class SafetyAck(BaseModel):
    safety_ack: bool = False


@router.post("/jobs/{job_id}/accept", dependencies=[Depends(limit_money)])
async def accept_job(job_id: UUID, body: SafetyAck, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.accept_direct_job(db, job_id, a.user_id, body.safety_ack)
    except svc.MarketplaceError as e:
        raise _wrap(e)


@router.post("/jobs/{job_id}/decline", dependencies=[Depends(limit_writes)])
async def decline_job(job_id: UUID, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.decline_direct_job(db, job_id, a.user_id)
    except svc.MarketplaceError as e:
        raise _wrap(e)


@router.post("/jobs/{job_id}/take", dependencies=[Depends(limit_money)])
async def take_job(job_id: UUID, body: SafetyAck, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.take_job(db, job_id, a.user_id, body.safety_ack)
    except svc.MarketplaceError as e:
        raise _wrap(e)


class PriceFlagIn(BaseModel):
    suggested_price_cents: int | None = Field(default=None, gt=0, le=1_000_000)
    note: str | None = Field(default=None, max_length=300)


@router.post("/jobs/{job_id}/price-flag", dependencies=[Depends(limit_writes)])
async def flag_price(job_id: UUID, body: PriceFlagIn, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.flag_price(db, job_id, a.user_id, body.suggested_price_cents, body.note)
    except svc.MarketplaceError as e:
        raise _wrap(e)


class PriceIn(BaseModel):
    price_cents: int = Field(gt=0, le=1_000_000)


@router.post("/jobs/{job_id}/price", dependencies=[Depends(limit_money)])
async def update_price(job_id: UUID, body: PriceIn, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.update_price(db, job_id, a.user_id, body.price_cents)
    except svc.MarketplaceError as e:
        raise _wrap(e)


class CancelIn(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


@router.post("/jobs/{job_id}/cancel", dependencies=[Depends(limit_money)])
async def cancel_job(job_id: UUID, body: CancelIn, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.cancel_job(db, job_id, a.user_id, body.reason)
    except svc.MarketplaceError as e:
        raise _wrap(e)


class SiteCheckIn(BaseModel):
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    override: bool = False  # "my location is wrong": proceed anyway, flagged for review


@router.post("/jobs/{job_id}/start", dependencies=[Depends(limit_writes)])
async def start_job(job_id: UUID, body: SiteCheckIn, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.start_job(db, job_id, a.user_id, latitude=body.latitude, longitude=body.longitude, override=body.override)
    except svc.MarketplaceError as e:
        raise _wrap(e)


@router.post("/jobs/{job_id}/complete", dependencies=[Depends(limit_writes)])
async def complete_job(job_id: UUID, body: SiteCheckIn, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.complete_job(db, job_id, a.user_id, latitude=body.latitude, longitude=body.longitude, override=body.override)
    except svc.MarketplaceError as e:
        raise _wrap(e)


@router.post("/jobs/{job_id}/confirm", dependencies=[Depends(limit_money)])
async def confirm_job(job_id: UUID, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.confirm_job(db, job_id, a.user_id)
    except svc.MarketplaceError as e:
        raise _wrap(e)


class DisputeIn(BaseModel):
    details: str = Field(min_length=3, max_length=2000)


@router.post("/jobs/{job_id}/dispute", dependencies=[Depends(limit_money)])
async def dispute_job(job_id: UUID, body: DisputeIn, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.dispute_job(db, job_id, a.user_id, body.details)
    except svc.MarketplaceError as e:
        raise _wrap(e)


# ------------------------------------------------------- messages, photos, reviews


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


@router.get("/jobs/{job_id}/messages")
async def messages(job_id: UUID, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.list_messages(db, job_id, a.user_id)
    except svc.MarketplaceError as e:
        raise _wrap(e)


@router.post("/jobs/{job_id}/messages", dependencies=[Depends(limit_writes)])
async def post_message(job_id: UUID, body: MessageIn, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.post_message(db, job_id, a.user_id, body.body)
    except svc.MarketplaceError as e:
        raise _wrap(e)


class PhotoIn(BaseModel):
    kind: Literal["listing", "before", "after", "checkin", "dispute"]
    url: str = Field(min_length=5, max_length=1000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


@router.get("/jobs/{job_id}/photos")
async def photos(job_id: UUID, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.list_photos(db, job_id, a.user_id)
    except svc.MarketplaceError as e:
        raise _wrap(e)


@router.post("/jobs/{job_id}/photos", dependencies=[Depends(limit_writes)])
async def add_photo(job_id: UUID, body: PhotoIn, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.add_photo(db, job_id, a.user_id, body.kind, body.url, body.latitude, body.longitude)
    except svc.MarketplaceError as e:
        raise _wrap(e)


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=1000)


@router.post("/jobs/{job_id}/review", dependencies=[Depends(limit_writes)])
async def review(job_id: UUID, body: ReviewIn, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.add_review(db, job_id, a.user_id, body.rating, body.comment)
    except svc.MarketplaceError as e:
        raise _wrap(e)


# ---------------------------------------------------------------- safety, admin


class ReportIn(BaseModel):
    job_id: UUID | None = None
    reported_user_id: UUID | None = None
    kind: Literal["safety", "abuse", "other"] = "other"
    details: str = Field(min_length=3, max_length=2000)


@router.post("/reports", dependencies=[Depends(limit_writes)])
async def report(body: ReportIn, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.create_report(db, a.user_id, body.job_id, body.reported_user_id, body.kind, body.details)
    except svc.MarketplaceError as e:
        raise _wrap(e)


class BlockIn(BaseModel):
    user_id: UUID


@router.post("/blocks", dependencies=[Depends(limit_writes)])
async def block(body: BlockIn, a: Actor = Depends(actor), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.block_user(db, a.user_id, body.user_id)
    except svc.MarketplaceError as e:
        raise _wrap(e)


@router.get("/admin/overview")
async def admin_overview(a: Actor = Depends(admin_only), db: AsyncSession = Depends(get_db)):
    return await svc.admin_overview(db)


@router.get("/admin/jobs/{job_id}/messages")
async def admin_job_messages(job_id: UUID, a: Actor = Depends(admin_only), db: AsyncSession = Depends(get_db)):
    return await svc.admin_job_messages(db, job_id)


@router.post("/admin/messages/{message_id}/review", dependencies=[Depends(limit_writes)])
async def admin_review_message(message_id: UUID, a: Actor = Depends(admin_only), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.admin_review_message(db, message_id)
    except svc.MarketplaceError as e:
        raise _wrap(e)


class CleanerStatusIn(BaseModel):
    status: Literal["active", "paused", "suspended", "pending_review"]


@router.post("/admin/cleaners/{cleaner_id}/status", dependencies=[Depends(limit_writes)])
async def admin_cleaner_status(
    cleaner_id: UUID, body: CleanerStatusIn, a: Actor = Depends(admin_only), db: AsyncSession = Depends(get_db)
):
    try:
        await svc.set_cleaner_status(db, cleaner_id, body.status)
        return {"ok": True}
    except svc.MarketplaceError as e:
        raise _wrap(e)


class ResolveReportIn(BaseModel):
    status: Literal["resolved", "dismissed"]
    resolution: str | None = Field(default=None, max_length=1000)


@router.post("/admin/reports/{report_id}/resolve", dependencies=[Depends(limit_writes)])
async def admin_resolve_report(
    report_id: UUID, body: ResolveReportIn, a: Actor = Depends(admin_only), db: AsyncSession = Depends(get_db)
):
    try:
        return await svc.resolve_report(db, report_id, a.user_id, body.status, body.resolution)
    except svc.MarketplaceError as e:
        raise _wrap(e)


@router.post("/admin/jobs/{job_id}/release", dependencies=[Depends(limit_money)])
async def admin_release(job_id: UUID, a: Actor = Depends(admin_only), db: AsyncSession = Depends(get_db)):
    try:
        return await svc.admin_release_job(db, job_id)
    except svc.MarketplaceError as e:
        raise _wrap(e)


class ResolveDisputeIn(BaseModel):
    outcome: Literal["release", "refund"]


@router.post("/admin/jobs/{job_id}/resolve-dispute", dependencies=[Depends(limit_money)])
async def admin_resolve_dispute(
    job_id: UUID, body: ResolveDisputeIn, a: Actor = Depends(admin_only), db: AsyncSession = Depends(get_db)
):
    try:
        return await svc.admin_resolve_dispute(db, job_id, body.outcome)
    except svc.MarketplaceError as e:
        raise _wrap(e)
