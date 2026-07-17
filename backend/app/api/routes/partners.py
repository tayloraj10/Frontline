from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db

router = APIRouter(prefix="/partners", tags=["partners"])


class RedeemRequest(BaseModel):
    user_id: UUID


class AddBusinessAdminRequest(BaseModel):
    user_id: UUID


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
            SELECT o.id, o.business_id, o.title, o.code, o.redemption_mode, o.points_cost,
                   o.points_threshold, o.max_redemptions_per_user, o.max_total_redemptions,
                   o.status, o.starts_at, o.ends_at, b.status AS business_status, b.name AS business_name
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

    points_spent = float(offer.points_cost) if offer.redemption_mode == "spend" else 0
    if points_spent > 0:
        await db.execute(
            text("UPDATE profiles SET spendable_points = spendable_points - :spent WHERE id = :user_id"),
            {"spent": points_spent, "user_id": str(payload.user_id)},
        )

    insert_result = await db.execute(
        text("""
            INSERT INTO partner_redemptions
                (user_id, offer_id, business_id, code, points_spent)
            VALUES
                (:user_id, :offer_id, :business_id, :code, :points_spent)
            RETURNING id
        """),
        {
            "user_id": str(payload.user_id),
            "offer_id": str(offer_id),
            "business_id": str(offer.business_id),
            "code": offer.code,
            "points_spent": points_spent,
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
                SELECT pba.id, pba.user_id, p.username, u.email
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
        {"id": str(r.id), "user_id": str(r.user_id), "username": r.username, "email": r.email}
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
    await db.commit()

    if admin_row is None:
        raise HTTPException(status_code=409, detail="This user already administers this business")

    return {
        "id": str(admin_row.id),
        "user_id": str(user_row.id),
        "username": user_row.username,
        "email": user_row.email,
    }


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
