from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, model_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import limit_money, limit_writes
from app.core.auth import CurrentUser, require_admin, require_user
from app.db.database import get_db
from app.services import connect, earn_payouts, sponsored_cleanups
from app.services import sponsorships as sponsorships_service

router = APIRouter(prefix="/sponsorships", tags=["sponsorships"])


class CreateSponsorshipCheckoutRequest(BaseModel):
    sponsor_type: sponsorships_service.SponsorType
    sponsor_user_id: UUID | None = None
    sponsor_business_id: UUID | None = None
    target_type: sponsorships_service.TargetType
    target_cleanup_id: UUID | None = None
    target_geo_unit_id: UUID | None = None
    amount_cents: int
    message: str | None = None
    success_url: str
    cancel_url: str
    model: sponsorships_service.Model = "general"
    payout_rule: dict | None = None
    cap_per_user_cents: int | None = None
    site_label: str | None = None
    site_latitude: float | None = None
    site_longitude: float | None = None
    site_radius_meters: int | None = None
    # group_area only: {kind: 'geo_units'|'circle'|'polygon', ...}, see build_area_geometry
    area: dict | None = None
    area_name: str | None = None
    # group_support only: the group being sponsored directly
    target_group_id: UUID | None = None

    @model_validator(mode="after")
    def _check_one_of(self):
        if self.sponsor_type == "user" and not self.sponsor_user_id:
            raise ValueError("sponsor_user_id is required when sponsor_type is 'user'")
        if self.sponsor_type == "business" and not self.sponsor_business_id:
            raise ValueError("sponsor_business_id is required when sponsor_type is 'business'")
        if self.target_type == "cleanup_event" and not self.target_cleanup_id:
            raise ValueError("target_cleanup_id is required when target_type is 'cleanup_event'")
        if self.target_type == "geo_unit" and not self.target_geo_unit_id:
            raise ValueError("target_geo_unit_id is required when target_type is 'geo_unit'")
        if self.model == "site":
            if self.target_type != "site":
                raise ValueError("site model requires target_type 'site'")
            if self.site_latitude is None or self.site_longitude is None or not self.site_radius_meters:
                raise ValueError("site sponsorships need site_latitude, site_longitude and site_radius_meters")
            if not self.site_label:
                raise ValueError("site sponsorships need a site_label")
        if self.model == "group_area":
            if self.target_type != "area":
                raise ValueError("group_area model requires target_type 'area'")
            if not self.area:
                raise ValueError("group_area sponsorships need an area")
        if self.target_type == "area" and self.model != "group_area":
            raise ValueError("target_type 'area' requires the group_area model")
        if self.target_type == "site" and self.model != "site":
            raise ValueError("target_type 'site' requires the site model")
        if self.model == "group_support" or self.target_type == "group":
            if self.model != "group_support" or self.target_type != "group":
                raise ValueError("group sponsorships need model and target_type 'group_support' / 'group'")
            if not self.target_group_id:
                raise ValueError("target_group_id is required for a group sponsorship")
        if self.model in ("site", "group_area") and not self.payout_rule:
            raise ValueError("payout_rule is required for site and group_area sponsorships")
        return self


async def _is_business_member(db: AsyncSession, user_id: UUID, business_id: UUID | None) -> bool:
    row = await db.execute(
        text(
            """
            SELECT 1 FROM partner_businesses b
            WHERE b.id = :bid AND b.status = 'active'
              AND (b.created_by = :uid
                   OR EXISTS (SELECT 1 FROM partner_business_admins a
                              WHERE a.business_id = b.id AND a.user_id = :uid))
            """
        ),
        {"bid": business_id, "uid": user_id},
    )
    return row.first() is not None


@router.post("/checkout-session", dependencies=[Depends(limit_money)])
async def create_checkout_session(
    payload: CreateSponsorshipCheckoutRequest,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    # The sponsor is the signed-in user, or an active business they created or administer.
    if payload.sponsor_type == "business":
        if not await _is_business_member(db, user.id, payload.sponsor_business_id):
            raise HTTPException(403, "You can only sponsor as a business you belong to.")
        sponsor_user_id = None
    else:
        sponsor_user_id = user.id
    payout_rule = None
    area_wkt = area_source = area_default_name = None
    try:
        if payload.model in ("site", "group_area"):
            payout_rule = sponsored_cleanups.validate_payout_rule(payload.model, payload.payout_rule or {})
        if payload.model == "site":
            sponsored_cleanups.validate_site_radius(payload.site_radius_meters or 0)
        if payload.model == "group_area":
            area_wkt, area_source, area_default_name = await sponsored_cleanups.build_area_geometry(
                db, payload.area or {}
            )
    except sponsored_cleanups.SponsoredError as e:
        raise HTTPException(e.status_code, e.detail) from e
    try:
        url = await sponsorships_service.create_sponsorship_checkout_session(
            db,
            sponsor_type=payload.sponsor_type,
            sponsor_user_id=sponsor_user_id,
            sponsor_business_id=payload.sponsor_business_id,
            target_type=payload.target_type,
            target_cleanup_id=payload.target_cleanup_id,
            target_geo_unit_id=payload.target_geo_unit_id,
            amount_cents=payload.amount_cents,
            message=payload.message,
            success_url=payload.success_url,
            cancel_url=payload.cancel_url,
            model=payload.model,
            payout_rule=payout_rule,
            cap_per_user_cents=payload.cap_per_user_cents,
            site_label=payload.site_label,
            site_latitude=payload.site_latitude,
            site_longitude=payload.site_longitude,
            site_radius_meters=payload.site_radius_meters,
            area_wkt=area_wkt,
            area_source=area_source,
            area_name=(payload.area_name or "").strip()[:80] or area_default_name,
            target_group_id=payload.target_group_id,
        )
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    except (RuntimeError, stripe.StripeError) as e:
        raise HTTPException(400, str(e)) from e
    return {"url": url}


@router.get("")
async def list_sponsorships(
    status: str | None = None,
    user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return {"sponsorships": await sponsorships_service.list_sponsorships(db, status)}


@router.post("/{sponsorship_id}/release", dependencies=[Depends(limit_money)])
async def release_sponsorship(
    sponsorship_id: UUID,
    user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    ok = await sponsorships_service.release_sponsorship(db, sponsorship_id, user.id)
    if not ok:
        raise HTTPException(404, "Sponsorship not found or not in 'funded' status.")
    return {"released": True}


def _raise(e: sponsored_cleanups.SponsoredError):
    raise HTTPException(e.status_code, e.detail) from e


@router.get("/sites")
async def list_sites(
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    return {"sites": await sponsored_cleanups.list_sites(db, user.id)}


@router.get("/my-limits")
async def my_limits(
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    return await sponsored_cleanups.daily_limit_status(db, user.id)


@router.get("/map")
async def map_features(
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    return await sponsored_cleanups.list_map_features(db)


@router.get("/group-areas")
async def list_group_areas(
    group_id: UUID | None = None,
    lat: float | None = None,
    lng: float | None = None,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    return {"areas": await sponsored_cleanups.list_group_areas(db, group_id, lat, lng)}


class SiteClaimRequest(BaseModel):
    latitude: float
    longitude: float


class SitePhotoRequest(SiteClaimRequest):
    photo_url: str
    bags: int | None = None


@router.post("/{sponsorship_id}/claim", dependencies=[Depends(limit_writes)])
async def claim_site(
    sponsorship_id: UUID,
    payload: SiteClaimRequest,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await sponsored_cleanups.claim_site(
            db, sponsorship_id, user.id, payload.latitude, payload.longitude
        )
    except sponsored_cleanups.SponsoredError as e:
        _raise(e)


@router.post("/{sponsorship_id}/claim/before-photo", dependencies=[Depends(limit_writes)])
async def site_before_photo(
    sponsorship_id: UUID,
    payload: SitePhotoRequest,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await sponsored_cleanups.submit_before_photo(
            db, sponsorship_id, user.id, payload.photo_url, payload.latitude, payload.longitude
        )
    except sponsored_cleanups.SponsoredError as e:
        _raise(e)


@router.post("/{sponsorship_id}/claim/after-photo", dependencies=[Depends(limit_writes)])
async def site_after_photo(
    sponsorship_id: UUID,
    payload: SitePhotoRequest,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await sponsored_cleanups.submit_after_photo(
            db, sponsorship_id, user.id, payload.photo_url, payload.latitude, payload.longitude, payload.bags
        )
    except sponsored_cleanups.SponsoredError as e:
        _raise(e)


@router.post("/{sponsorship_id}/claim/release", dependencies=[Depends(limit_writes)])
async def site_release(
    sponsorship_id: UUID,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await sponsored_cleanups.release_claim(db, sponsorship_id, user.id)
    except sponsored_cleanups.SponsoredError as e:
        _raise(e)


@router.get("/allocations")
async def list_allocations(
    status: str | None = None,
    user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return {"allocations": await sponsored_cleanups.list_allocations(db, status)}


class ReviewAllocationRequest(BaseModel):
    approve: bool
    reject_reason: str | None = None


@router.post("/allocations/{allocation_id}/review", dependencies=[Depends(limit_money)])
async def review_allocation(
    allocation_id: UUID,
    payload: ReviewAllocationRequest,
    user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await sponsored_cleanups.review_allocation(
            db, allocation_id, user.id, payload.approve, payload.reject_reason
        )
    except sponsored_cleanups.SponsoredError as e:
        _raise(e)


@router.post("/allocations/{allocation_id}/paid-out", dependencies=[Depends(limit_money)])
async def mark_paid_out(
    allocation_id: UUID,
    user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await sponsored_cleanups.mark_paid_out(db, allocation_id, user.id)
    except sponsored_cleanups.SponsoredError as e:
        _raise(e)


@router.post("/allocations/{allocation_id}/pay", dependencies=[Depends(limit_money)])
async def pay_allocation(
    allocation_id: UUID,
    user: CurrentUser = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Retry the Stripe transfer for an approved allocation (e.g. after the recipient finishes setup)."""
    return await earn_payouts.pay_allocation(db, allocation_id)


@router.get("/payouts/status")
async def payout_status(user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)):
    try:
        return await connect.refresh_payout_status(db, user.id)
    except connect.ConnectError as e:
        raise HTTPException(e.status, str(e))


@router.post("/payouts/onboard", dependencies=[Depends(limit_money)])
async def payout_onboard(user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)):
    try:
        return await connect.create_payout_onboarding_link(db, user.id, user.email, "/sponsorships")
    except connect.ConnectError as e:
        raise HTTPException(e.status, str(e))
    except stripe.StripeError:
        raise HTTPException(502, "Could not open payout setup right now. Try again in a moment.")


@router.post("/payouts/dashboard", dependencies=[Depends(limit_money)])
async def payout_dashboard(user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)):
    try:
        return await connect.create_dashboard_link(db, user.id)
    except connect.ConnectError as e:
        raise HTTPException(e.status, str(e))


# ---------------------------------------------------------------------------
# Group payout accounts: any admin of the group sets up where the group's money goes.
# ---------------------------------------------------------------------------


async def _group_admin(group_id: UUID, user: CurrentUser, db: AsyncSession) -> None:
    from app.services.event_permissions import is_group_admin

    if not await is_group_admin(db, group_id, user.id):
        raise HTTPException(403, "Only a group admin can manage group payouts.")


@router.get("/groups/{group_id}/payouts/status")
async def group_payout_status(group_id: UUID, user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)):
    await _group_admin(group_id, user, db)
    try:
        return await connect.refresh_group_status(db, group_id)
    except connect.ConnectError as e:
        raise HTTPException(e.status, str(e))


class GroupPayoutOnboard(BaseModel):
    return_path: str = "/groups"


@router.post("/groups/{group_id}/payouts/onboard", dependencies=[Depends(limit_money)])
async def group_payout_onboard(
    group_id: UUID,
    payload: GroupPayoutOnboard,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    await _group_admin(group_id, user, db)
    # Only same-site paths: this is where Stripe sends the admin back to.
    path = payload.return_path if payload.return_path.startswith("/") and not payload.return_path.startswith("//") else "/groups"
    try:
        return await connect.create_group_onboarding_link(db, group_id, user.id, user.email, path)
    except connect.ConnectError as e:
        raise HTTPException(e.status, str(e))
    except stripe.StripeError:
        raise HTTPException(502, "Could not open payout setup right now. Try again in a moment.")


@router.post("/groups/{group_id}/payouts/dashboard", dependencies=[Depends(limit_money)])
async def group_payout_dashboard(group_id: UUID, user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)):
    await _group_admin(group_id, user, db)
    try:
        return await connect.create_group_dashboard_link(db, group_id)
    except connect.ConnectError as e:
        raise HTTPException(e.status, str(e))
