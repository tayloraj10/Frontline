from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.database import get_db
from app.services import sponsorships as sponsorships_service

router = APIRouter(prefix="/sponsorships", tags=["sponsorships"])


def _check_secret(x_admin_api_secret: str | None) -> None:
    """Same shared-secret defense-in-depth as payments.py: the Next.js server route
    re-verifies the caller is an authenticated site admin before forwarding here.
    Funding-only scope (dev-docs/payments-scoping-2026-08-20.md) -- no payout/Connect
    endpoints here, and everything stays admin-only until this is ready to launch."""
    if not settings.admin_api_secret:
        raise HTTPException(503, "Admin endpoint is not configured (ADMIN_API_SECRET unset).")
    if x_admin_api_secret != settings.admin_api_secret:
        raise HTTPException(403, "Invalid or missing admin API secret.")


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
        return self


@router.post("/checkout-session")
async def create_checkout_session(
    payload: CreateSponsorshipCheckoutRequest,
    x_admin_api_secret: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _check_secret(x_admin_api_secret)
    try:
        url = await sponsorships_service.create_sponsorship_checkout_session(
            db,
            sponsor_type=payload.sponsor_type,
            sponsor_user_id=payload.sponsor_user_id,
            sponsor_business_id=payload.sponsor_business_id,
            target_type=payload.target_type,
            target_cleanup_id=payload.target_cleanup_id,
            target_geo_unit_id=payload.target_geo_unit_id,
            amount_cents=payload.amount_cents,
            message=payload.message,
            success_url=payload.success_url,
            cancel_url=payload.cancel_url,
        )
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    except (RuntimeError, stripe.StripeError) as e:
        raise HTTPException(400, str(e)) from e
    return {"url": url}


@router.get("")
async def list_sponsorships(
    status: str | None = None,
    x_admin_api_secret: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _check_secret(x_admin_api_secret)
    return {"sponsorships": await sponsorships_service.list_sponsorships(db, status)}


class ReleaseSponsorshipRequest(BaseModel):
    released_by: UUID


@router.post("/{sponsorship_id}/release")
async def release_sponsorship(
    sponsorship_id: UUID,
    payload: ReleaseSponsorshipRequest,
    x_admin_api_secret: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _check_secret(x_admin_api_secret)
    ok = await sponsorships_service.release_sponsorship(db, sponsorship_id, payload.released_by)
    if not ok:
        raise HTTPException(404, "Sponsorship not found or not in 'funded' status.")
    return {"released": True}
