from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.upload import delete_r2_objects_batch
from app.core.config import settings
from app.db.database import get_db

router = APIRouter(prefix="/account", tags=["account"])


@router.delete("/{user_id}")
async def delete_account(user_id: UUID, db: AsyncSession = Depends(get_db)):
    """
    Fully delete a user's account: hard-deletes personal-only records (contributions,
    their own cleanups, redemptions, event photos, notifications, device tokens — the
    latter two and others cascade automatically once auth.users is deleted below),
    anonymizes shared/community content they created (groups, problem reports,
    group-organized cleanups) by nulling their attribution rather than deleting it so
    other members/coordination aren't disrupted, then deletes the Supabase auth user
    (which cascades the profiles row and everything still CASCADE-linked to it).

    Idempotent: if the auth-admin delete below fails, the DB-side work already committed
    is safe to no-op on retry (profiles row still exists until that call succeeds), so a
    client can safely retry this same call after a failure.
    """
    exists = await db.execute(text("SELECT 1 FROM profiles WHERE id = :id"), {"id": str(user_id)})
    if not exists.fetchone():
        raise HTTPException(status_code=404, detail="Account not found")

    uid = str(user_id)

    avatar_row = await db.execute(text("SELECT avatar_url FROM profiles WHERE id = :id"), {"id": uid})
    avatar_url = avatar_row.scalar()

    contrib_rows = await db.execute(
        text("SELECT id, photo_url, cleanup_id, campaign_id, geo_unit_id FROM contributions WHERE user_id = :id"),
        {"id": uid},
    )
    contributions = contrib_rows.fetchall()
    contrib_photo_urls = [r.photo_url for r in contributions if r.photo_url]
    cleanup_ids = sorted({str(r.cleanup_id) for r in contributions if r.cleanup_id})
    geo_pairs = sorted({(str(r.campaign_id), str(r.geo_unit_id)) for r in contributions if r.geo_unit_id})

    cleanup_image_urls: list[str] = []
    if cleanup_ids:
        cleanup_rows = await db.execute(
            text("SELECT image_urls FROM cleanups WHERE id = ANY(:ids)"), {"ids": cleanup_ids}
        )
        for row in cleanup_rows.fetchall():
            cleanup_image_urls.extend(row.image_urls or [])

    photo_rows = await db.execute(
        text("SELECT photo_url FROM cleanup_event_photos WHERE user_id = :id"), {"id": uid}
    )
    event_photo_urls = [r.photo_url for r in photo_rows.fetchall() if r.photo_url]

    try:
        await db.execute(text("DELETE FROM cleanup_event_photos WHERE user_id = :id"), {"id": uid})
        await db.execute(text("DELETE FROM partner_redemptions WHERE user_id = :id"), {"id": uid})
        await db.execute(
            text("""
                UPDATE partner_offer_codes
                SET claimed_by = NULL, status = 'available', claimed_at = NULL
                WHERE claimed_by = :id
            """),
            {"id": uid},
        )

        await db.execute(text("DELETE FROM contributions WHERE user_id = :id"), {"id": uid})
        if cleanup_ids:
            await db.execute(text("DELETE FROM cleanups WHERE id = ANY(:ids)"), {"ids": cleanup_ids})

        for campaign_id, geo_unit_id in geo_pairs:
            new_total = await db.execute(
                text("""
                    SELECT COALESCE(SUM(value), 0) FROM contributions
                    WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
                """),
                {"campaign_id": campaign_id, "geo_unit_id": geo_unit_id},
            )
            total = float(new_total.scalar())
            if total == 0:
                await db.execute(
                    text("DELETE FROM territory_claims WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id"),
                    {"campaign_id": campaign_id, "geo_unit_id": geo_unit_id},
                )
            else:
                await db.execute(
                    text("""
                        WITH top_group AS (
                            SELECT group_id FROM contributions
                            WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
                              AND group_id IS NOT NULL
                            GROUP BY group_id ORDER BY SUM(value) DESC LIMIT 1
                        ),
                        top_user AS (
                            SELECT user_id FROM contributions
                            WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
                            GROUP BY user_id ORDER BY SUM(value) DESC LIMIT 1
                        )
                        UPDATE territory_claims SET
                            total_value = :total,
                            claimed_by_group = (SELECT group_id FROM top_group),
                            claimed_by_user  = (SELECT user_id  FROM top_user),
                            updated_at = NOW()
                        WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
                    """),
                    {"campaign_id": campaign_id, "geo_unit_id": geo_unit_id, "total": total},
                )

        await db.execute(
            text("UPDATE cleanups SET submitted_by_user_id = NULL WHERE submitted_by_user_id = :id"), {"id": uid}
        )
        await db.execute(
            text("""
                UPDATE problem_reports
                SET reported_by = NULL, claimed_by_user_id = NULL, resolved_by_user_id = NULL, submitted_by_user_id = NULL
                WHERE reported_by = :id OR claimed_by_user_id = :id OR resolved_by_user_id = :id OR submitted_by_user_id = :id
            """),
            {"id": uid},
        )
        await db.execute(text("UPDATE groups SET created_by = NULL WHERE created_by = :id"), {"id": uid})
        await db.execute(
            text("UPDATE cleanup_team_total_logs SET organizer_user_id = NULL WHERE organizer_user_id = :id"),
            {"id": uid},
        )
        await db.execute(text("UPDATE content_flags SET resolved_by = NULL WHERE resolved_by = :id"), {"id": uid})
        await db.execute(
            text("UPDATE problem_report_flags SET resolved_by = NULL WHERE resolved_by = :id"), {"id": uid}
        )
        await db.execute(text("UPDATE game_settings SET updated_by = NULL WHERE updated_by = :id"), {"id": uid})

        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete account data. Please try again.")

    r2_keys = [u for u in [avatar_url, *contrib_photo_urls, *cleanup_image_urls, *event_photo_urls] if u]
    r2_errors = delete_r2_objects_batch(r2_keys) if r2_keys else []

    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{settings.supabase_url}/auth/v1/admin/users/{uid}",
            headers={
                "apikey": settings.supabase_service_role_key,
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
            },
            timeout=10,
        )
    if resp.status_code not in (200, 204):
        raise HTTPException(status_code=500, detail=f"Account data deleted but auth removal failed ({resp.status_code}). Please retry.")

    return {"deleted": True, "r2_errors": r2_errors}


@router.get("/{user_id}/export")
async def export_account_data(user_id: UUID, db: AsyncSession = Depends(get_db)):
    """Read-only export of all data tied to a user, returned as a downloadable JSON file."""
    uid = str(user_id)

    profile_row = await db.execute(
        text("SELECT id, username, display_name, avatar_url, bio, total_contributions, created_at FROM profiles WHERE id = :id"),
        {"id": uid},
    )
    profile = profile_row.mappings().fetchone()
    if not profile:
        raise HTTPException(status_code=404, detail="Account not found")

    def rows_to_dicts(result) -> list[dict]:
        return [_jsonify(dict(r)) for r in result.mappings().fetchall()]

    contributions = await db.execute(
        text("""
            SELECT id, campaign_id, group_id, geo_unit_id, contribution_type, value, photo_url,
                   ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude,
                   location_verified, notes, submitted_at, validated_at
            FROM contributions WHERE user_id = :id
        """),
        {"id": uid},
    )
    cleanups = await db.execute(
        text("""
            SELECT id, campaign_id, geo_unit_id, title, description, status, image_urls,
                   metrics_small_bags, metrics_large_bags, metrics_pounds, created_at
            FROM cleanups WHERE submitted_by_user_id = :id
        """),
        {"id": uid},
    )
    cleanup_event_photos = await db.execute(
        text("SELECT id, cleanup_id, photo_url, created_at FROM cleanup_event_photos WHERE user_id = :id"),
        {"id": uid},
    )
    problem_reports = await db.execute(
        text("""
            SELECT id, campaign_id, severity, status, reported_at
            FROM problem_reports
            WHERE reported_by = :id OR claimed_by_user_id = :id OR resolved_by_user_id = :id OR submitted_by_user_id = :id
        """),
        {"id": uid},
    )
    group_memberships = await db.execute(
        text("""
            SELECT gm.group_id, g.name AS group_name, gm.role, gm.joined_at
            FROM group_members gm JOIN groups g ON g.id = gm.group_id
            WHERE gm.user_id = :id
        """),
        {"id": uid},
    )
    groups_created = await db.execute(
        text("SELECT id, name, slug, description, created_at FROM groups WHERE created_by = :id"), {"id": uid}
    )
    territory_claims = await db.execute(
        text("SELECT campaign_id, geo_unit_id, total_value, last_contribution_at FROM territory_claims WHERE claimed_by_user = :id"),
        {"id": uid},
    )
    partner_redemptions = await db.execute(
        text("SELECT offer_id, business_id, points_spent, redeemed_at FROM partner_redemptions WHERE user_id = :id"),
        {"id": uid},
    )
    user_notifications = await db.execute(
        text("SELECT id, type, created_at FROM user_notifications WHERE user_id = :id"), {"id": uid}
    )
    device_tokens = await db.execute(text("SELECT token, platform, created_at FROM device_tokens WHERE user_id = :id"), {"id": uid})
    cleanup_rsvps = await db.execute(
        text("SELECT cleanup_id, status, checked_in_at, created_at FROM cleanup_rsvps WHERE user_id = :id"), {"id": uid}
    )

    device_token_rows = [_jsonify(dict(r)) for r in device_tokens.mappings().fetchall()]
    for row in device_token_rows:
        if row.get("token"):
            row["token"] = f"...{row['token'][-6:]}"

    export = {
        "profile": _jsonify(dict(profile)),
        "contributions": rows_to_dicts(contributions),
        "cleanups_organized": rows_to_dicts(cleanups),
        "cleanup_event_photos": rows_to_dicts(cleanup_event_photos),
        "problem_reports": rows_to_dicts(problem_reports),
        "group_memberships": rows_to_dicts(group_memberships),
        "groups_created": rows_to_dicts(groups_created),
        "territory_claims": rows_to_dicts(territory_claims),
        "partner_redemptions": rows_to_dicts(partner_redemptions),
        "user_notifications": rows_to_dicts(user_notifications),
        "device_tokens": device_token_rows,
        "cleanup_rsvps": rows_to_dicts(cleanup_rsvps),
    }

    import json

    return Response(
        content=json.dumps(export, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="frontline-account-export.json"'},
    )


def _jsonify(d: dict) -> dict:
    import datetime
    import decimal
    import uuid as uuid_mod

    out = {}
    for k, v in d.items():
        if isinstance(v, (uuid_mod.UUID,)):
            out[k] = str(v)
        elif isinstance(v, decimal.Decimal):
            out[k] = float(v)
        elif isinstance(v, (datetime.datetime, datetime.date)):
            out[k] = v.isoformat()
        elif isinstance(v, list):
            out[k] = [str(x) if isinstance(x, uuid_mod.UUID) else x for x in v]
        else:
            out[k] = v
    return out
