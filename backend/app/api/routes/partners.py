from datetime import datetime, timedelta, timezone
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.database import get_db
from app.services.email import send_email, format_event_datetime, wrap_email_html, render_cta_button
from app.services.event_permissions import can_manage_event
from app.services.game_settings import get_game_settings

router = APIRouter(prefix="/partners", tags=["partners"])

RADIUS_TIER_DEFAULTS = {"block": 91.44, "neighborhood": 396.24, "wide": 1524.0}
RADIUS_TIER_SETTING_KEYS = {
    "block": "radius_tier_block_meters",
    "neighborhood": "radius_tier_neighborhood_meters",
    "wide": "radius_tier_wide_meters",
}


class RedeemRequest(BaseModel):
    user_id: UUID
    location_id: Optional[UUID] = None
    cleanup_id: Optional[UUID] = None


# How long after a cleanup event's (effective) end time an attendee can still redeem an
# event-eligible offer for free. Effective end falls back to start + 2 hours when no
# scheduled_end is set, matching the check-in window default shown in the event form.
EVENT_OFFER_REDEMPTION_WINDOW = timedelta(hours=4)
EVENT_CHECKIN_DEFAULT_DURATION = timedelta(hours=2)


class NotifyEventAttachmentRequest(BaseModel):
    organizer_user_id: UUID


class AddBusinessAdminRequest(BaseModel):
    user_id: UUID


class UpdateBusinessAdminRequest(BaseModel):
    business_only: bool


async def _is_business_admin(db: AsyncSession, business_id: UUID, user_id: UUID) -> bool:
    row = (
        await db.execute(
            text("SELECT 1 FROM partner_business_admins WHERE business_id = :bid AND user_id = :uid"),
            {"bid": str(business_id), "uid": str(user_id)},
        )
    ).fetchone()
    return row is not None


@router.post("/offers/{offer_id}/redeem")
async def redeem_offer(
    offer_id: UUID,
    payload: RedeemRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Atomically redeem a partner offer for points: verifies the offer/business are live,
    checks the user's balance, per-user redemption cap, and offer-wide total redemption cap,
    deducts points for 'spend' offers, and records the ledger row with the offer's shared code.
    Runs entirely inside one DB transaction on the backend's direct Postgres connection, which
    bypasses RLS — this is the endpoint partner_redemptions_select's policy comment says
    redemption logic "belongs in a backend endpoint, not a direct insert."
    """
    offer_result = await db.execute(
        text("""
            SELECT o.id, o.business_id, o.location_id, o.title, o.code, o.redemption_mode, o.points_cost,
                   o.points_threshold, o.max_redemptions_per_user, o.max_total_redemptions,
                   o.status, o.starts_at, o.ends_at, o.event_eligible,
                   b.status AS business_status, b.name AS business_name
            FROM partner_offers o
            JOIN partner_businesses b ON b.id = o.business_id
            WHERE o.id = :offer_id
        """),
        {"offer_id": str(offer_id)},
    )
    offer = offer_result.fetchone()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    if offer.status != "active" or offer.business_status != "active":
        raise HTTPException(status_code=409, detail="This offer is not currently available")

    if offer.location_id is not None:
        if payload.location_id is not None and payload.location_id != offer.location_id:
            raise HTTPException(status_code=400, detail="This offer is only valid at a specific location")
        location_status_result = await db.execute(
            text("SELECT status FROM partner_business_locations WHERE id = :location_id"),
            {"location_id": str(offer.location_id)},
        )
        location_row = location_status_result.fetchone()
        if not location_row or location_row.status != "active":
            raise HTTPException(status_code=409, detail="This offer's location is no longer available")
        redemption_location_id = offer.location_id
    else:
        locations_result = await db.execute(
            text("SELECT id FROM partner_business_locations WHERE business_id = :business_id AND status = 'active'"),
            {"business_id": str(offer.business_id)},
        )
        location_ids = [row.id for row in locations_result.fetchall()]
        if payload.location_id is not None:
            if payload.location_id not in location_ids:
                raise HTTPException(status_code=400, detail="That location doesn't belong to this business")
            redemption_location_id = payload.location_id
        elif len(location_ids) == 1:
            redemption_location_id = location_ids[0]
        elif len(location_ids) == 0:
            redemption_location_id = None
        else:
            raise HTTPException(status_code=400, detail="This business has multiple locations — pick one to redeem at")

    now_result = await db.execute(text("SELECT now()"))
    now = now_result.scalar()
    if offer.starts_at and offer.starts_at > now:
        raise HTTPException(status_code=409, detail="This offer hasn't started yet")
    if offer.ends_at and offer.ends_at <= now:
        raise HTTPException(status_code=409, detail="This offer has ended")

    points_result = await db.execute(
        text("SELECT spendable_points FROM profiles WHERE id = :user_id FOR UPDATE"),
        {"user_id": str(payload.user_id)},
    )
    points_row = points_result.fetchone()
    if not points_row:
        raise HTTPException(status_code=404, detail="User not found")
    current_points = float(points_row.spendable_points)

    event_redemption = False
    if offer.event_eligible and payload.cleanup_id is not None:
        event_result = await db.execute(
            text("""
                SELECT c.scheduled_start, c.scheduled_end, r.checked_in_at, ceo.max_redemptions
                FROM cleanup_event_offers ceo
                JOIN cleanups c ON c.id = ceo.cleanup_id
                LEFT JOIN cleanup_rsvps r ON r.cleanup_id = ceo.cleanup_id AND r.user_id = :user_id
                WHERE ceo.cleanup_id = :cleanup_id AND ceo.offer_id = :offer_id
            """),
            {"cleanup_id": str(payload.cleanup_id), "offer_id": str(offer_id), "user_id": str(payload.user_id)},
        )
        event_row = event_result.fetchone()
        if not event_row:
            raise HTTPException(status_code=400, detail="This offer isn't linked to that event")
        if event_row.checked_in_at is None:
            raise HTTPException(status_code=409, detail="You need to check in to this event to redeem this offer")
        effective_end = event_row.scheduled_end or (event_row.scheduled_start + EVENT_CHECKIN_DEFAULT_DURATION)
        if now > effective_end + EVENT_OFFER_REDEMPTION_WINDOW:
            raise HTTPException(status_code=409, detail="The redemption window for this event offer has passed")
        event_redemption = True
        event_max_redemptions = event_row.max_redemptions

    if not event_redemption:
        if offer.redemption_mode == "event_only":
            raise HTTPException(status_code=409, detail="This offer can only be redeemed by checking in to an event it's attached to")
        if offer.redemption_mode == "spend":
            if current_points < float(offer.points_cost):
                raise HTTPException(status_code=409, detail="Not enough points to redeem this offer")
        else:
            if current_points < float(offer.points_threshold):
                raise HTTPException(status_code=409, detail="You haven't reached the points threshold for this offer")

    if offer.max_redemptions_per_user is not None:
        count_result = await db.execute(
            text("""
                SELECT COUNT(*) FROM partner_redemptions
                WHERE user_id = :user_id AND offer_id = :offer_id
            """),
            {"user_id": str(payload.user_id), "offer_id": str(offer_id)},
        )
        if count_result.scalar() >= offer.max_redemptions_per_user:
            raise HTTPException(status_code=409, detail="You've already redeemed this offer the maximum number of times")

    await db.execute(
        text("SELECT id FROM partner_offers WHERE id = :offer_id FOR UPDATE"),
        {"offer_id": str(offer_id)},
    )
    if offer.max_total_redemptions is not None:
        total_result = await db.execute(
            text("SELECT COUNT(*) FROM partner_redemptions WHERE offer_id = :offer_id"),
            {"offer_id": str(offer_id)},
        )
        if total_result.scalar() >= offer.max_total_redemptions:
            raise HTTPException(status_code=409, detail="This offer has reached its redemption limit")

    if event_redemption and event_max_redemptions is not None:
        event_count_result = await db.execute(
            text("SELECT COUNT(*) FROM partner_redemptions WHERE offer_id = :offer_id AND cleanup_id = :cleanup_id"),
            {"offer_id": str(offer_id), "cleanup_id": str(payload.cleanup_id)},
        )
        if event_count_result.scalar() >= event_max_redemptions:
            raise HTTPException(status_code=409, detail="This offer has reached its redemption limit for this event")

    points_spent = float(offer.points_cost) if (not event_redemption and offer.redemption_mode == "spend") else 0
    if points_spent > 0:
        await db.execute(
            text("UPDATE profiles SET spendable_points = spendable_points - :spent WHERE id = :user_id"),
            {"spent": points_spent, "user_id": str(payload.user_id)},
        )

    insert_result = await db.execute(
        text("""
            INSERT INTO partner_redemptions
                (user_id, offer_id, business_id, location_id, code, points_spent, cleanup_id)
            VALUES
                (:user_id, :offer_id, :business_id, :location_id, :code, :points_spent, :cleanup_id)
            RETURNING id
        """),
        {
            "user_id": str(payload.user_id),
            "offer_id": str(offer_id),
            "business_id": str(offer.business_id),
            "location_id": str(redemption_location_id) if redemption_location_id else None,
            "code": offer.code,
            "points_spent": points_spent,
            "cleanup_id": str(payload.cleanup_id) if event_redemption else None,
        },
    )
    redemption_id = insert_result.scalar()

    await db.commit()

    return {
        "id": str(redemption_id),
        "code": offer.code,
        "offer_title": offer.title,
        "business_name": offer.business_name,
        "points_spent": points_spent,
    }


@router.get("/offers/{offer_id}/redemptions/me")
async def get_my_redemptions(
    offer_id: UUID,
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """A user's past redemptions of one offer, including the code they got — partner_redemptions
    isn't readable via RLS beyond the user's own rows, but this endpoint lets the redeem page
    look up "already redeemed, your code is X" using the backend's direct connection."""
    rows = (
        await db.execute(
            text("""
                SELECT id, points_spent, redeemed_at, code, used_at
                FROM partner_redemptions
                WHERE offer_id = :offer_id AND user_id = :user_id
                ORDER BY redeemed_at DESC
            """),
            {"offer_id": str(offer_id), "user_id": str(user_id)},
        )
    ).fetchall()

    return [
        {
            "id": str(r.id),
            "code": r.code,
            "points_spent": r.points_spent,
            "redeemed_at": r.redeemed_at.isoformat() if r.redeemed_at else None,
            "used_at": r.used_at.isoformat() if r.used_at else None,
        }
        for r in rows
    ]


@router.post("/redemptions/{redemption_id}/mark-used")
async def mark_redemption_used(
    redemption_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Merchant-facing consume step: tapped on the customer's phone at the register so a
    redemption's proof screen can't be honored twice. Idempotent-safe — 409s if already used."""
    row_result = await db.execute(
        text("SELECT used_at FROM partner_redemptions WHERE id = :id FOR UPDATE"),
        {"id": str(redemption_id)},
    )
    row = row_result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Redemption not found")
    if row.used_at is not None:
        raise HTTPException(status_code=409, detail="This redemption has already been used")

    update_result = await db.execute(
        text("""
            UPDATE partner_redemptions SET used_at = now()
            WHERE id = :id
            RETURNING used_at
        """),
        {"id": str(redemption_id)},
    )
    used_at = update_result.scalar()
    await db.commit()

    return {"used_at": used_at.isoformat() if used_at else None}


@router.post("/offers/{offer_id}/events/{cleanup_id}/notify-attachment")
async def notify_event_offer_attachment(
    offer_id: UUID,
    cleanup_id: UUID,
    payload: NotifyEventAttachmentRequest,
    db: AsyncSession = Depends(get_db),
):
    """Emails a business's admins when an organizer attaches their offer to a cleanup
    event, CC'ing the organizer. Called by the frontend right after its own direct-Supabase
    insert into cleanup_event_offers succeeds — this endpoint only sends the notification
    and never itself creates the attachment, since email needs auth.users + Resend, both
    only reachable from the backend. A failed send never surfaces as an error to the
    organizer (send_email swallows and logs it); the attachment itself already succeeded.
    Requires payload.organizer_user_id to actually be able to manage this event (same
    check as the attendee-reminder endpoints), since this is otherwise an unauthenticated
    way to spam a business's admins and to probe/CC an arbitrary user's email."""
    row = (
        await db.execute(
            text("""
                SELECT ceo.id AS attachment_id, ceo.max_redemptions,
                       o.title AS offer_title, o.description AS offer_description,
                       b.id AS business_id, b.name AS business_name,
                       c.title AS cleanup_title, c.scheduled_start,
                       c.group_id AS group_id,
                       g.name AS group_name
                FROM cleanup_event_offers ceo
                JOIN partner_offers o ON o.id = ceo.offer_id
                JOIN partner_businesses b ON b.id = o.business_id
                JOIN cleanups c ON c.id = ceo.cleanup_id
                LEFT JOIN groups g ON g.id = c.group_id
                WHERE ceo.offer_id = :offer_id AND ceo.cleanup_id = :cleanup_id
            """),
            {"offer_id": str(offer_id), "cleanup_id": str(cleanup_id)},
        )
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="No such offer attachment for that event")

    if not await can_manage_event(db, row.group_id, cleanup_id, payload.organizer_user_id):
        raise HTTPException(status_code=403, detail="Not authorized to manage this event")

    admin_rows = (
        await db.execute(
            text("""
                SELECT u.email FROM partner_business_admins pba
                JOIN auth.users u ON u.id = pba.user_id
                WHERE pba.business_id = :business_id
            """),
            {"business_id": str(row.business_id)},
        )
    ).fetchall()
    admin_emails = [r.email for r in admin_rows if r.email]

    organizer_row = (
        await db.execute(
            text("SELECT p.username, u.email FROM profiles p JOIN auth.users u ON u.id = p.id WHERE p.id = :user_id"),
            {"user_id": str(payload.organizer_user_id)},
        )
    ).fetchone()

    if not admin_emails:
        return {"sent": False, "reason": "This business has no admins with an email on file"}

    game_settings = await get_game_settings(db)
    if not game_settings.get("email_partner_coordination_enabled"):
        return {"sent": False, "reason": "Partner coordination emails are disabled"}

    event_link = f"{settings.frontend_url}/cleanup-events/{cleanup_id}"
    limit_line = (
        f"<p>This offer is capped at {row.max_redemptions} redemption(s) for this event.</p>"
        if row.max_redemptions is not None
        else ""
    )
    when_line = format_event_datetime(row.scheduled_start) if row.scheduled_start else "TBD"
    html = wrap_email_html(f"""
        <p>Your offer <strong>{row.offer_title}</strong> has been attached to an upcoming cleanup event{f" hosted by {row.group_name}" if row.group_name else ""}:</p>
        <p><strong>{row.cleanup_title}</strong><br>{when_line}</p>
        {limit_line}
        <p>Attendees who check in to this event will be able to redeem it for free.</p>
        <p>Feel free to coordinate details here.</p>
        <p style="margin-top:24px;">{render_cta_button(event_link, "View the event")}</p>
    """)

    sent = await send_email(
        db,
        to=admin_emails,
        cc=[organizer_row.email] if organizer_row and organizer_row.email else [],
        subject=f"Your offer was attached to \"{row.cleanup_title}\"",
        html=html,
        kind="event_offer_attached",
        related_id=row.attachment_id,
    )

    return {"sent": sent}


@router.delete("/offers/{offer_id}/events/{cleanup_id}")
async def remove_event_offer_attachment(
    offer_id: UUID,
    cleanup_id: UUID,
    organizer_user_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Detaches an event-eligible offer from a cleanup event. Goes through the backend
    (rather than a direct client-side Supabase delete, the way attachment is created)
    because cleanup_event_offers' RLS delete policy only recognizes group admins, while
    an event's actual organizer (or a co-hosting group's admin) should be able to manage
    offers on their own event too -- same can_manage_event check as the attendee-reminder
    endpoints."""
    row = (
        await db.execute(
            text("SELECT group_id FROM cleanups WHERE id = :cleanup_id"),
            {"cleanup_id": str(cleanup_id)},
        )
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Cleanup event not found")

    if not await can_manage_event(db, row.group_id, cleanup_id, organizer_user_id):
        raise HTTPException(status_code=403, detail="Not authorized to manage this event")

    await db.execute(
        text("DELETE FROM cleanup_event_offers WHERE cleanup_id = :cleanup_id AND offer_id = :offer_id"),
        {"cleanup_id": str(cleanup_id), "offer_id": str(offer_id)},
    )
    await db.commit()
    return {"status": "removed"}


@router.get("/businesses/{business_id}/admins")
async def list_business_admins(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Looks up admin emails via auth.users, which RLS/PostgREST can't see from the
    public schema — this runs over the backend's direct Postgres connection instead."""
    rows = (
        await db.execute(
            text("""
                SELECT pba.id, pba.user_id, p.username, p.is_business_only, u.email
                FROM partner_business_admins pba
                JOIN profiles p ON p.id = pba.user_id
                JOIN auth.users u ON u.id = pba.user_id
                WHERE pba.business_id = :business_id
                ORDER BY pba.created_at
            """),
            {"business_id": str(business_id)},
        )
    ).fetchall()

    return [
        {
            "id": str(r.id),
            "user_id": str(r.user_id),
            "username": r.username,
            "email": r.email,
            "business_only": r.is_business_only,
        }
        for r in rows
    ]


@router.post("/businesses/{business_id}/admins")
async def add_business_admin(
    business_id: UUID,
    payload: AddBusinessAdminRequest,
    db: AsyncSession = Depends(get_db),
):
    """Grants a user self-service access to one partner business. Takes a user_id
    resolved via GET /admin/users/search (a real-account lookup), rather than a
    free-typed email, so access can only be granted to an actual registered user."""
    business_result = await db.execute(
        text("SELECT id FROM partner_businesses WHERE id = :business_id"),
        {"business_id": str(business_id)},
    )
    if not business_result.fetchone():
        raise HTTPException(status_code=404, detail="Business not found")

    user_result = await db.execute(
        text("SELECT p.id, p.username, u.email FROM profiles p JOIN auth.users u ON u.id = p.id WHERE p.id = :user_id"),
        {"user_id": str(payload.user_id)},
    )
    user_row = user_result.fetchone()
    if not user_row:
        raise HTTPException(status_code=404, detail="No account found for that user")

    insert_result = await db.execute(
        text("""
            INSERT INTO partner_business_admins (business_id, user_id)
            VALUES (:business_id, :user_id)
            ON CONFLICT (business_id, user_id) DO NOTHING
            RETURNING id
        """),
        {"business_id": str(business_id), "user_id": str(user_row.id)},
    )
    admin_row = insert_result.fetchone()

    if admin_row is None:
        await db.rollback()
        raise HTTPException(status_code=409, detail="This user already administers this business")

    await db.commit()

    return {
        "id": str(admin_row.id),
        "user_id": str(user_row.id),
        "username": user_row.username,
        "email": user_row.email,
        "business_only": False,
    }


@router.patch("/businesses/{business_id}/admins/{admin_id}")
async def update_business_admin(
    business_id: UUID,
    admin_id: UUID,
    payload: UpdateBusinessAdminRequest,
    db: AsyncSession = Depends(get_db),
):
    """Toggles whether this admin's account is business-only (redirected straight to
    their dashboard on login, with the main app nav de-emphasized)."""
    result = await db.execute(
        text("""
            UPDATE profiles SET is_business_only = :business_only
            WHERE id = (
                SELECT user_id FROM partner_business_admins
                WHERE id = :admin_id AND business_id = :business_id
            )
            RETURNING id
        """),
        {"business_only": payload.business_only, "admin_id": str(admin_id), "business_id": str(business_id)},
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Business admin not found")
    await db.commit()

    return {"business_only": payload.business_only}


@router.delete("/businesses/{business_id}/admins/{admin_id}")
async def remove_business_admin(
    business_id: UUID,
    admin_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("DELETE FROM partner_business_admins WHERE id = :admin_id AND business_id = :business_id"),
        {"admin_id": str(admin_id), "business_id": str(business_id)},
    )
    await db.commit()
    return {"status": "removed"}


@router.get("/radius-tiers")
async def get_radius_tiers(db: AsyncSession = Depends(get_db)):
    """Admin-configurable meters for each radius-of-influence tier, for the frontend to
    render alongside the block/neighborhood/wide toggle (feet/meters, both units)."""
    settings = await get_game_settings(db)
    return {
        tier: settings.get(key, RADIUS_TIER_DEFAULTS[tier])
        for tier, key in RADIUS_TIER_SETTING_KEYS.items()
    }


@router.get("/businesses/{business_id}/locations/{location_id}/radius-stats")
async def get_radius_stats(
    business_id: UUID,
    location_id: UUID,
    viewer_user_id: UUID,
    radius_tier: str = Query("neighborhood", pattern="^(block|neighborhood|wide)$"),
    db: AsyncSession = Depends(get_db),
):
    """Business-facing view of on-the-ground campaign activity near one of its locations,
    e.g. 'here's the cleaner area you're now part of' for a Trash War-linked business."""
    if not await _is_business_admin(db, business_id, viewer_user_id):
        raise HTTPException(status_code=403, detail="You don't administer this business")

    location_result = await db.execute(
        text("""
            SELECT id, lat, lng, created_at
            FROM partner_business_locations
            WHERE id = :location_id AND business_id = :business_id
        """),
        {"location_id": str(location_id), "business_id": str(business_id)},
    )
    location = location_result.fetchone()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    if location.lat is None or location.lng is None:
        raise HTTPException(status_code=409, detail="This location doesn't have coordinates set")

    settings = await get_game_settings(db)
    radius_meters = settings.get(
        RADIUS_TIER_SETTING_KEYS[radius_tier], RADIUS_TIER_DEFAULTS[radius_tier]
    )

    campaigns_result = await db.execute(
        text("""
            SELECT c.id, c.title, c.slug, c.starts_at, c.created_at
            FROM campaign_partner_businesses cpb
            JOIN campaigns c ON c.id = cpb.campaign_id
            WHERE cpb.business_id = :business_id
        """),
        {"business_id": str(business_id)},
    )
    campaigns = campaigns_result.fetchall()

    now = datetime.now(timezone.utc)
    campaign_blocks = []
    for campaign in campaigns:
        # contribution_count counts distinct cleanup actions, not raw contribution rows.
        # log-team-total splits one event's total into one contributions row per attendee
        # (same cleanup_event_id, cleanup_id NULL) so a plain COUNT(*) would show a single
        # 6-attendee event as "6 cleanups" instead of 1. Collapsing to
        # COALESCE(cleanup_event_id, cleanup_id, id) counts each event once regardless of
        # attendee count, while still counting distinct self-logged/log-for-attendee
        # cleanups (each has its own cleanup_id) and standalone contributions individually.
        local_result = await db.execute(
            text("""
                SELECT COUNT(DISTINCT COALESCE(c.cleanup_event_id::text, c.cleanup_id::text, c.id::text))::int AS contribution_count,
                       COALESCE(SUM(c.value),0)::float AS total_value,
                       COUNT(DISTINCT c.user_id)::int AS unique_contributors
                FROM contributions c
                WHERE c.campaign_id = :campaign_id AND c.location IS NOT NULL
                  AND ST_DWithin(
                        c.location,
                        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                        :radius_meters
                      )
            """),
            {"campaign_id": str(campaign.id), "lng": location.lng, "lat": location.lat, "radius_meters": radius_meters},
        )
        local = local_result.fetchone()

        local_trash_result = await db.execute(
            text("""
                SELECT COUNT(*)::int AS trash_report_count
                FROM problem_reports pr
                WHERE pr.campaign_id = :campaign_id AND pr.location IS NOT NULL
                  AND ST_DWithin(
                        pr.location,
                        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                        :radius_meters
                      )
            """),
            {"campaign_id": str(campaign.id), "lng": location.lng, "lat": location.lat, "radius_meters": radius_meters},
        )
        local_trash_report_count = local_trash_result.scalar_one()

        citywide_result = await db.execute(
            text("""
                SELECT COUNT(DISTINCT COALESCE(c.cleanup_event_id::text, c.cleanup_id::text, c.id::text))::int AS contribution_count,
                       COALESCE(SUM(c.value),0)::float AS total_value,
                       COUNT(DISTINCT c.user_id)::int AS unique_contributors
                FROM contributions c
                WHERE c.campaign_id = :campaign_id
            """),
            {"campaign_id": str(campaign.id)},
        )
        citywide = citywide_result.fetchone()

        citywide_trash_result = await db.execute(
            text("SELECT COUNT(*)::int AS trash_report_count FROM problem_reports pr WHERE pr.campaign_id = :campaign_id"),
            {"campaign_id": str(campaign.id)},
        )
        citywide_trash_report_count = citywide_trash_result.scalar_one()

        floor_state = None
        if local.contribution_count == 0:
            location_is_new = location.created_at is not None and (now - location.created_at) <= timedelta(days=7)
            campaign_started = campaign.starts_at or campaign.created_at
            campaign_is_new = campaign_started is not None and (now - campaign_started) <= timedelta(days=14)
            if location_is_new or campaign_is_new:
                floor_state = "building"

        campaign_blocks.append({
            "campaign_id": str(campaign.id),
            "campaign_name": campaign.title,
            "campaign_slug": campaign.slug,
            "local": {
                "contribution_count": local.contribution_count,
                "total_value": local.total_value,
                "unique_contributors": local.unique_contributors,
                "trash_report_count": local_trash_report_count,
            },
            "citywide": {
                "contribution_count": citywide.contribution_count,
                "total_value": citywide.total_value,
                "unique_contributors": citywide.unique_contributors,
                "trash_report_count": citywide_trash_report_count,
            },
            "floor_state": floor_state,
        })

    return {
        "location_id": str(location_id),
        "radius_tier": radius_tier,
        "radius_meters": radius_meters,
        "campaigns": campaign_blocks,
    }


@router.get("/businesses/{business_id}/locations/{location_id}/radius-points")
async def get_radius_points(
    business_id: UUID,
    location_id: UUID,
    campaign_id: UUID,
    viewer_user_id: UUID,
    radius_tier: str = Query("neighborhood", pattern="^(block|neighborhood|wide)$"),
    db: AsyncSession = Depends(get_db),
):
    """Contribution point geometries within a radius tier around a business location, for
    the radar-style map view (mirrors the campaign-wide contribution dots on the Trash War map,
    but scoped to this business's radius instead of the whole campaign)."""
    if not await _is_business_admin(db, business_id, viewer_user_id):
        raise HTTPException(status_code=403, detail="You don't administer this business")

    location_result = await db.execute(
        text("""
            SELECT lat, lng FROM partner_business_locations
            WHERE id = :location_id AND business_id = :business_id
        """),
        {"location_id": str(location_id), "business_id": str(business_id)},
    )
    location = location_result.fetchone()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    if location.lat is None or location.lng is None:
        raise HTTPException(status_code=409, detail="This location doesn't have coordinates set")

    linked_result = await db.execute(
        text("SELECT 1 FROM campaign_partner_businesses WHERE business_id = :bid AND campaign_id = :cid"),
        {"bid": str(business_id), "cid": str(campaign_id)},
    )
    if not linked_result.fetchone():
        raise HTTPException(status_code=404, detail="Campaign isn't linked to this business")

    settings = await get_game_settings(db)
    radius_meters = settings.get(
        RADIUS_TIER_SETTING_KEYS[radius_tier], RADIUS_TIER_DEFAULTS[radius_tier]
    )

    points_result = await db.execute(
        text("""
            SELECT c.id,
                   CASE WHEN c.cleanup_event_id IS NOT NULL THEN 'group_event' ELSE 'contribution' END AS kind,
                   ST_Y(c.location::geometry) AS lat, ST_X(c.location::geometry) AS lng
            FROM contributions c
            WHERE c.campaign_id = :campaign_id AND c.location IS NOT NULL
              AND ST_DWithin(
                    c.location,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                    :radius_meters
                  )
            LIMIT 500
        """),
        {"campaign_id": str(campaign_id), "lng": location.lng, "lat": location.lat, "radius_meters": radius_meters},
    )
    points = points_result.fetchall()

    cleanup_points_result = await db.execute(
        text("""
            SELECT cl.id, 'cleanup_event' AS kind,
                   ST_Y(cl.location::geometry) AS lat, ST_X(cl.location::geometry) AS lng
            FROM cleanups cl
            WHERE cl.campaign_id = :campaign_id AND cl.location IS NOT NULL AND cl.status != 'cancelled'
              AND ST_DWithin(
                    cl.location,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                    :radius_meters
                  )
            LIMIT 200
        """),
        {"campaign_id": str(campaign_id), "lng": location.lng, "lat": location.lat, "radius_meters": radius_meters},
    )
    cleanup_points = cleanup_points_result.fetchall()

    report_points_result = await db.execute(
        text("""
            SELECT pr.id, 'trash_report' AS kind,
                   ST_Y(pr.location::geometry) AS lat, ST_X(pr.location::geometry) AS lng
            FROM problem_reports pr
            WHERE pr.campaign_id = :campaign_id AND pr.location IS NOT NULL
              AND ST_DWithin(
                    pr.location,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                    :radius_meters
                  )
            LIMIT 200
        """),
        {"campaign_id": str(campaign_id), "lng": location.lng, "lat": location.lat, "radius_meters": radius_meters},
    )
    report_points = report_points_result.fetchall()

    return {
        "center": {"lat": location.lat, "lng": location.lng},
        "radius_meters": radius_meters,
        "points": [
            {"id": str(p.id), "lat": p.lat, "lng": p.lng, "kind": p.kind}
            for p in [*points, *cleanup_points, *report_points]
        ],
    }


@router.get("/businesses/{business_id}/locations/{location_id}/tier-activity")
async def get_tier_activity(
    business_id: UUID,
    location_id: UUID,
    viewer_user_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Activity counts (contributions, cleanup events, and trash reports) within each radius
    tier (summed across all linked campaigns), so the frontend can hide a tier that has little/no
    activity instead of implying a dead area. Cleanup events count on their own location even with
    zero attributed contributions yet, so a scheduled/imminent event still surfaces the tier."""
    if not await _is_business_admin(db, business_id, viewer_user_id):
        raise HTTPException(status_code=403, detail="You don't administer this business")

    location_result = await db.execute(
        text("""
            SELECT lat, lng FROM partner_business_locations
            WHERE id = :location_id AND business_id = :business_id
        """),
        {"location_id": str(location_id), "business_id": str(business_id)},
    )
    location = location_result.fetchone()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    if location.lat is None or location.lng is None:
        raise HTTPException(status_code=409, detail="This location doesn't have coordinates set")

    settings = await get_game_settings(db)
    tier_meters = {
        tier: settings.get(key, RADIUS_TIER_DEFAULTS[tier])
        for tier, key in RADIUS_TIER_SETTING_KEYS.items()
    }

    campaign_ids_result = await db.execute(
        text("SELECT campaign_id FROM campaign_partner_businesses WHERE business_id = :business_id"),
        {"business_id": str(business_id)},
    )
    campaign_ids = [str(row.campaign_id) for row in campaign_ids_result.fetchall()]
    if not campaign_ids:
        return {tier: 0 for tier in RADIUS_TIER_DEFAULTS}

    counts_result = await db.execute(
        text("""
            WITH origin AS (
                SELECT ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography AS pt
            )
            SELECT
                COUNT(*) FILTER (WHERE dist <= :block_m)::int AS block_count,
                COUNT(*) FILTER (WHERE dist <= :neighborhood_m)::int AS neighborhood_count,
                COUNT(*) FILTER (WHERE dist <= :wide_m)::int AS wide_count
            FROM (
                SELECT ST_Distance(c.location, origin.pt) AS dist
                FROM contributions c, origin
                WHERE c.campaign_id = ANY(:campaign_ids) AND c.location IS NOT NULL
                  AND ST_DWithin(c.location, origin.pt, :wide_m)
                UNION ALL
                SELECT ST_Distance(cl.location, origin.pt) AS dist
                FROM cleanups cl, origin
                WHERE cl.campaign_id = ANY(:campaign_ids) AND cl.location IS NOT NULL
                  AND cl.status != 'cancelled'
                  AND ST_DWithin(cl.location, origin.pt, :wide_m)
                UNION ALL
                SELECT ST_Distance(pr.location, origin.pt) AS dist
                FROM problem_reports pr, origin
                WHERE pr.campaign_id = ANY(:campaign_ids) AND pr.location IS NOT NULL
                  AND ST_DWithin(pr.location, origin.pt, :wide_m)
            ) sub
        """),
        {
            "campaign_ids": campaign_ids,
            "lng": location.lng,
            "lat": location.lat,
            "block_m": tier_meters["block"],
            "neighborhood_m": tier_meters["neighborhood"],
            "wide_m": tier_meters["wide"],
        },
    )
    counts = counts_result.fetchone()
    return {
        "block": counts.block_count,
        "neighborhood": counts.neighborhood_count,
        "wide": counts.wide_count,
    }


@router.get("/businesses/{business_id}/redemptions")
async def get_business_redemptions(
    business_id: UUID,
    viewer_user_id: UUID,
    offer_id: Optional[UUID] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Who redeemed what and when, for a business's own dashboard. Deliberately a JOIN
    (not LEFT JOIN) on partner_offers so an expired offer's title still shows up in
    historical redemption records instead of disappearing behind RLS's expired-offer gate."""
    if not await _is_business_admin(db, business_id, viewer_user_id):
        raise HTTPException(status_code=403, detail="You don't administer this business")

    rows = (
        await db.execute(
            text("""
                SELECT r.id, r.redeemed_at, r.used_at, r.points_spent,
                       r.offer_id, o.title AS offer_title,
                       r.user_id, p.username, p.display_name, p.avatar_url,
                       r.location_id, l.label AS location_label,
                       COUNT(*) OVER() AS total_count
                FROM partner_redemptions r
                JOIN partner_offers o ON o.id = r.offer_id
                LEFT JOIN profiles p ON p.id = r.user_id
                LEFT JOIN partner_business_locations l ON l.id = r.location_id
                WHERE r.business_id = :business_id
                  AND (CAST(:offer_id AS uuid) IS NULL OR r.offer_id = CAST(:offer_id AS uuid))
                ORDER BY r.redeemed_at DESC
                LIMIT :limit OFFSET :offset
            """),
            {
                "business_id": str(business_id),
                "offer_id": str(offer_id) if offer_id else None,
                "limit": limit,
                "offset": offset,
            },
        )
    ).fetchall()

    total_count = rows[0].total_count if rows else 0

    return {
        "total_count": total_count,
        "redemptions": [
            {
                "id": str(r.id),
                "redeemed_at": r.redeemed_at.isoformat() if r.redeemed_at else None,
                "used_at": r.used_at.isoformat() if r.used_at else None,
                "points_spent": r.points_spent,
                "offer_id": str(r.offer_id),
                "offer_title": r.offer_title,
                "user_id": str(r.user_id) if r.user_id else None,
                "username": r.username,
                "display_name": r.display_name,
                "avatar_url": r.avatar_url,
                "location_id": str(r.location_id) if r.location_id else None,
                "location_label": r.location_label,
            }
            for r in rows
        ],
    }
