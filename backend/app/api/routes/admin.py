import asyncio
from functools import partial

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.database import get_db
from app.services import geo
from app.services.seeders import GEO_UNIT_SEEDERS, REGISTRY, GeoUnitType, StatesSeeder
from app.services.seeders.cleanup_rsvps import CleanupTestAttendeesSeeder
from app.services.seeders.demo_data import DemoDataSeeder, _uid as _demo_uid
from app.services.seeders.global_hexes import GlobalHexSeeder
from app.services.seeders.solarpunk_preseed import SolarpunkPreseedSeeder
from app.services.seeders.uk_postcode_districts import UkPostcodeDistrictSeeder
from app.services.seeders.zip_codes import ZipCodeSeeder

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/simplify-zipcodes")
async def simplify_zipcodes(tolerance: float = 0.001, precision: int = 4):
    """
    Convert and simplify backend/data/zipcode_data_simple.json →
    backend/data/us_zipcodes.geojson. CPU-bound; takes ~30–60s.
    Run this before POST /admin/seed when seeding zip_codes.
    """
    if not geo.RAW_ZIP_FILE.exists():
        raise HTTPException(
            404,
            f"Source file not found: {geo.RAW_ZIP_FILE}. "
            "Copy zipcode_data_simple.json to backend/data/.",
        )

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None,
            partial(geo.simplify_zipcodes, tolerance=tolerance, precision=precision),
        )
    except Exception as exc:
        raise HTTPException(500, f"Simplification failed: {exc}")

    return {
        "input_size_mb": round(result.input_size_mb, 1),
        "output_size_mb": round(result.output_size_mb, 1),
        "feature_count": result.feature_count,
        "skipped_count": result.skipped_count,
    }


@router.post("/simplify-uk-postcode-districts")
async def simplify_uk_postcode_districts(tolerance: float = 0.0001, precision: int = 5):
    """
    Convert and simplify backend/data/uk_postcode_districts.kml →
    backend/data/uk_postcode_districts.geojson. CPU-bound; takes a few seconds.
    Run this before POST /admin/load-geo-units/uk-postcode-districts.
    """
    if not geo.RAW_UK_POSTCODE_FILE.exists():
        raise HTTPException(
            404,
            f"Source file not found: {geo.RAW_UK_POSTCODE_FILE}. "
            "Copy uk_postcode_districts.kml to backend/data/.",
        )

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None,
            partial(geo.simplify_uk_postcode_districts, tolerance=tolerance, precision=precision),
        )
    except Exception as exc:
        raise HTTPException(500, f"Simplification failed: {exc}")

    return {
        "input_size_mb": round(result.input_size_mb, 1),
        "output_size_mb": round(result.output_size_mb, 1),
        "feature_count": result.feature_count,
        "skipped_count": result.skipped_count,
    }


@router.post("/simplify-nyc-neighborhoods")
async def simplify_nyc_neighborhoods(tolerance: float = 0.0001, precision: int = 5):
    """
    Convert and simplify backend/data/nyc_neighborhoods_raw.geojson →
    backend/data/nyc_neighborhoods.geojson. CPU-bound; takes a few seconds.
    Run this before POST /admin/geo-units/nyc_neighborhood/reload.
    """
    if not geo.RAW_NYC_NEIGHBORHOODS_FILE.exists():
        raise HTTPException(
            404,
            f"Source file not found: {geo.RAW_NYC_NEIGHBORHOODS_FILE}. "
            "Copy the NYC Open Data NTA GeoJSON export to backend/data/.",
        )

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None,
            partial(geo.simplify_nyc_neighborhoods, tolerance=tolerance, precision=precision),
        )
    except Exception as exc:
        raise HTTPException(500, f"Simplification failed: {exc}")

    return {
        "input_size_mb": round(result.input_size_mb, 1),
        "output_size_mb": round(result.output_size_mb, 1),
        "feature_count": result.feature_count,
        "skipped_count": result.skipped_count,
    }


@router.post("/seed")
async def run_all_seeds(wipe: bool = False, db: AsyncSession = Depends(get_db)):
    """Run all registered seeders with their default params. Pass wipe=true to wipe each seeder's data before re-seeding."""
    results = {}
    for name, seeder_cls in REGISTRY.items():
        try:
            params = {**seeder_cls.default_params, "wipe": wipe}
            result = await seeder_cls().run(db, params)
            results[name] = {
                "inserted": result.inserted,
                "skipped": result.skipped,
                "errors": result.errors[:20],
            }
        except Exception as exc:
            raise HTTPException(500, f"Seeder '{name}' failed: {exc}")
    return results


@router.post("/load-geo-units/zips")
async def load_geo_units_zips(db: AsyncSession = Depends(get_db)):
    """Load ZIP code boundaries into geo_units. Run POST /admin/simplify-zipcodes first."""
    try:
        result = await ZipCodeSeeder().run(db, {})
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(500, str(exc))
    return {"inserted": result.inserted, "skipped": result.skipped, "errors": result.errors[:20]}


@router.post("/load-geo-units/uk-postcode-districts")
async def load_geo_units_uk_postcode_districts(db: AsyncSession = Depends(get_db)):
    """Load UK postcode district boundaries into geo_units. Run POST /admin/simplify-uk-postcode-districts first."""
    try:
        result = await UkPostcodeDistrictSeeder().run(db, {})
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(500, str(exc))
    return {"inserted": result.inserted, "skipped": result.skipped, "errors": result.errors[:20]}


@router.post("/geo-units/{unit_type}/reload")
async def reload_geo_unit_type(unit_type: GeoUnitType, db: AsyncSession = Depends(get_db)):
    """
    Wipe and repopulate a single geographic boundary dataset in geo_units.
    Deletes every geo_units row matching the chosen unit_type, then re-runs
    that type's seeder from its source file. Other unit_types are untouched.
    For zip/uk_postcode_district, run the corresponding /admin/simplify-*
    endpoint first if the source GeoJSON hasn't been generated yet.
    """
    seeder_cls = GEO_UNIT_SEEDERS[unit_type]

    deleted = await db.execute(
        text("DELETE FROM geo_units WHERE unit_type = :unit_type"),
        {"unit_type": unit_type.value},
    )
    deleted_count = deleted.rowcount
    await db.commit()

    try:
        result = await seeder_cls().run(db, {})
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(500, str(exc))

    return {
        "unit_type": unit_type.value,
        "deleted": deleted_count,
        "inserted": result.inserted,
        "skipped": result.skipped,
        "errors": result.errors[:20],
    }


@router.post("/seed/demo-data")
async def seed_demo_data(wipe: bool = False, db: AsyncSession = Depends(get_db)):
    """Seed 10 demo users, 6 groups, and realistic activity for all 4 campaigns. Pass wipe=true to delete and re-create all demo data."""
    try:
        result = await DemoDataSeeder().run(db, {"wipe": wipe})
    except Exception as exc:
        raise HTTPException(500, f"Demo seeder failed: {exc}")
    return {"inserted": result.inserted, "skipped": result.skipped, "errors": result.errors[:20]}


@router.post("/seed/cleanup-attendees")
async def seed_cleanup_attendees(cleanup_id: str, db: AsyncSession = Depends(get_db)):
    """Seed a handful of test users as 'going' RSVPs on a specific cleanup event, for local testing."""
    try:
        result = await CleanupTestAttendeesSeeder().run(db, {"cleanup_id": cleanup_id})
    except Exception as exc:
        raise HTTPException(500, f"Cleanup attendees seeder failed: {exc}")
    return {"inserted": result.inserted, "skipped": result.skipped, "errors": result.errors[:20]}


@router.post("/load-geo-units/states")
async def load_geo_units_states(db: AsyncSession = Depends(get_db)):
    """Load US state boundaries into geo_units for the Road to Independence campaign."""
    try:
        result = await StatesSeeder().run(db, {})
    except Exception as exc:
        raise HTTPException(500, str(exc))
    return {"inserted": result.inserted, "skipped": result.skipped, "errors": result.errors[:20]}


@router.post("/seed/global-hexes")
async def seed_global_hexes(wipe: bool = False, db: AsyncSession = Depends(get_db)):
    """Seed geo_units for all ~41K H3 resolution-3 hexes globally. Pass wipe=true to drop and re-create all h3_hex rows (safe — never touches zip_code or state rows)."""
    try:
        result = await GlobalHexSeeder().run(db, {"wipe": wipe})
    except Exception as exc:
        raise HTTPException(500, f"Global hex seeder failed: {exc}")
    return {"inserted": result.inserted, "errors": result.errors[:20]}


@router.post("/seed/solarpunk-preseed")
async def seed_solarpunk_preseed(wipe: bool = False, db: AsyncSession = Depends(get_db)):
    """Pre-seed known solarpunk-aligned cities and regions with baseline bloom scores. Pass wipe=true to reset preseed territory_claims before re-seeding."""
    try:
        result = await SolarpunkPreseedSeeder().run(db, {"wipe": wipe})
    except Exception as exc:
        raise HTTPException(500, f"Solarpunk preseed failed: {exc}")
    return {"inserted": result.inserted, "skipped": result.skipped, "errors": result.errors[:20]}


@router.post("/wipe")
async def wipe_seed_data(db: AsyncSession = Depends(get_db)):
    """
    Delete demo/test data only while preserving campaigns, event_triggers, and geo_units.
    Only touches profiles (and their associated rows) whose auth email matches the demo
    seeder's pattern (*.demo@frontline.app) — real user accounts are never wiped.
    Preserves: campaigns, event_triggers, geo_units, and all non-demo user data.
    Wipes (demo users only): contributions, cleanups, territory_claims, leaderboard_entries,
           campaign_events, problem_reports, user_notifications, group_members, groups,
           profiles, and their Supabase auth users.
    Run POST /admin/seed/demo-data afterwards to restore demo users and activity.
    """
    # Only collect profile IDs belonging to demo/test accounts (matched via auth email)
    profile_rows = await db.execute(
        text("""
            SELECT p.id FROM profiles p
            JOIN auth.users u ON u.id = p.id
            WHERE u.email LIKE '%.demo@frontline.app'
        """)
    )
    profile_ids = [str(r[0]) for r in profile_rows.fetchall()]

    if not profile_ids:
        return {"wiped": {}, "auth_users_deleted": 0, "auth_errors": []}

    # Demo groups are any groups created by a demo user
    group_rows = await db.execute(
        text("SELECT id FROM groups WHERE created_by = ANY(:ids)"),
        {"ids": profile_ids},
    )
    group_ids = [str(r[0]) for r in group_rows.fetchall()]

    # Demo campaign_events come from the DemoDataSeeder's fixed boss/cascade events
    demo_event_ids = [
        _demo_uid("event_boss_chicago"),
        _demo_uid("event_boss_houston"),
        _demo_uid("event_road_surge"),
        _demo_uid("event_battle_stlouis"),
    ]

    counts: dict[str, int] = {}

    result = await db.execute(
        text("""
            DELETE FROM leaderboard_entries
            WHERE (entity_type = 'user' AND entity_id = ANY(:uids))
               OR (entity_type = 'group' AND entity_id = ANY(:gids))
        """),
        {"uids": profile_ids, "gids": group_ids},
    )
    counts["leaderboard_entries"] = result.rowcount

    result = await db.execute(
        text("DELETE FROM campaign_events WHERE id = ANY(:ids)"),
        {"ids": demo_event_ids},
    )
    counts["campaign_events"] = result.rowcount

    result = await db.execute(
        text("DELETE FROM contributions WHERE user_id = ANY(:ids)"),
        {"ids": profile_ids},
    )
    counts["contributions"] = result.rowcount

    result = await db.execute(
        text("DELETE FROM cleanups WHERE submitted_by_user_id = ANY(:ids)"),
        {"ids": profile_ids},
    )
    counts["cleanups"] = result.rowcount

    result = await db.execute(
        text("DELETE FROM problem_reports WHERE submitted_by_user_id = ANY(:ids)"),
        {"ids": profile_ids},
    )
    counts["problem_reports"] = result.rowcount

    result = await db.execute(
        text("DELETE FROM territory_claims WHERE claimed_by_user = ANY(:ids)"),
        {"ids": profile_ids},
    )
    counts["territory_claims"] = result.rowcount

    result = await db.execute(
        text("DELETE FROM user_notifications WHERE user_id = ANY(:ids)"),
        {"ids": profile_ids},
    )
    counts["user_notifications"] = result.rowcount

    result = await db.execute(
        text("DELETE FROM group_members WHERE user_id = ANY(:ids)"),
        {"ids": profile_ids},
    )
    counts["group_members"] = result.rowcount

    result = await db.execute(
        text("DELETE FROM groups WHERE id = ANY(:ids)"),
        {"ids": group_ids},
    )
    counts["groups"] = result.rowcount

    result = await db.execute(
        text("DELETE FROM profiles WHERE id = ANY(:ids)"),
        {"ids": profile_ids},
    )
    counts["profiles"] = result.rowcount

    await db.commit()

    # Delete auth users from Supabase
    auth_deleted = 0
    auth_errors: list[str] = []
    async with httpx.AsyncClient() as client:
        for uid in profile_ids:
            try:
                resp = await client.delete(
                    f"{settings.supabase_url}/auth/v1/admin/users/{uid}",
                    headers={
                        "apikey": settings.supabase_service_role_key,
                        "Authorization": f"Bearer {settings.supabase_service_role_key}",
                    },
                    timeout=10,
                )
                if resp.status_code in (200, 204):
                    auth_deleted += 1
                else:
                    auth_errors.append(f"{uid}: {resp.status_code}")
            except Exception as exc:
                auth_errors.append(f"{uid}: {exc}")

    return {
        "wiped": counts,
        "auth_users_deleted": auth_deleted,
        "auth_errors": auth_errors[:20],
    }


@router.post("/wipe-geo-unit")
async def wipe_geo_unit_data(unit_type: str, unit_id: str, db: AsyncSession = Depends(get_db)):
    """
    Delete all problem_reports, contributions, cleanups (including group events and
    routes, via is_group_event/route), territory_claims, and campaign_events tied to a
    single geo_unit (e.g. unit_type='zip', unit_id='10034') so it can be re-tested from a
    clean slate. cleanup_rsvps cascade-delete with their cleanup row. Leaves campaigns,
    geo_units, event_triggers, and every other geo_unit alone.
    """
    geo_row = await db.execute(
        text("SELECT id FROM geo_units WHERE unit_type = :unit_type AND unit_id = :unit_id"),
        {"unit_type": unit_type, "unit_id": unit_id},
    )
    geo_unit = geo_row.fetchone()
    if not geo_unit:
        raise HTTPException(404, f"No geo_unit found for unit_type={unit_type}, unit_id={unit_id}")
    geo_unit_id = str(geo_unit.id)

    counts: dict[str, int] = {}

    result = await db.execute(
        text("DELETE FROM contributions WHERE geo_unit_id = :id"), {"id": geo_unit_id}
    )
    counts["contributions"] = result.rowcount

    result = await db.execute(
        text("DELETE FROM problem_reports WHERE geo_unit_id = :id"), {"id": geo_unit_id}
    )
    counts["problem_reports"] = result.rowcount

    result = await db.execute(
        text("DELETE FROM cleanups WHERE geo_unit_id = :id"), {"id": geo_unit_id}
    )
    counts["cleanups"] = result.rowcount

    result = await db.execute(
        text("DELETE FROM territory_claims WHERE geo_unit_id = :id"), {"id": geo_unit_id}
    )
    counts["territory_claims"] = result.rowcount

    result = await db.execute(
        text("DELETE FROM campaign_event_geo_units WHERE geo_unit_id = :id"), {"id": geo_unit_id}
    )
    counts["campaign_event_geo_units"] = result.rowcount

    result = await db.execute(
        text("DELETE FROM campaign_events WHERE geo_unit_id = :id"), {"id": geo_unit_id}
    )
    counts["campaign_events"] = result.rowcount

    await db.commit()
    return {"geo_unit_id": geo_unit_id, "deleted": counts}


@router.get("/users/search")
async def search_users(q: str, db: AsyncSession = Depends(get_db)):
    """
    Looks up real accounts by username or email, for admin flows that need to grant
    something to a specific user (e.g. partner business-admin access) without relying on
    someone typing an exact email correctly. Joins through auth.users since email isn't
    exposed via RLS/PostgREST from the public schema.
    """
    query = q.strip()
    if len(query) < 2:
        return []

    rows = (
        await db.execute(
            text("""
                SELECT p.id, p.username, u.email
                FROM profiles p
                JOIN auth.users u ON u.id = p.id
                WHERE p.username ILIKE :pattern OR u.email ILIKE :pattern
                ORDER BY p.username
                LIMIT 10
            """),
            {"pattern": f"%{query}%"},
        )
    ).fetchall()

    return [{"id": str(r.id), "username": r.username, "email": r.email} for r in rows]


@router.post("/users/{user_id}/recompute-points")
async def recompute_user_points(user_id: str, db: AsyncSession = Depends(get_db)):
    """
    Recomputes profiles.points and spendable_points for one user from scratch, in case a
    bug or manual DB edit leaves either column out of sync with its source of truth
    (contributions, problem_reports, partner_redemptions). Reuses the same
    contribution_points() SQL function the earn-side triggers use (024_user_points.sql),
    so this always matches what the triggers would have produced.
    """
    profile_row = (
        await db.execute(text("SELECT id FROM profiles WHERE id = :id"), {"id": user_id})
    ).fetchone()
    if not profile_row:
        raise HTTPException(404, "User not found")

    before = (
        await db.execute(
            text("SELECT points, spendable_points FROM profiles WHERE id = :id"),
            {"id": user_id},
        )
    ).fetchone()

    contribution_total = (
        await db.execute(
            text("""
                SELECT COALESCE(SUM(contribution_points(contribution_type, value)), 0) AS total
                FROM contributions
                WHERE user_id = :id
            """),
            {"id": user_id},
        )
    ).scalar()

    report_total = (
        await db.execute(
            text("SELECT COUNT(*) FROM problem_reports WHERE submitted_by_user_id = :id"),
            {"id": user_id},
        )
    ).scalar()

    redeemed_total = (
        await db.execute(
            text("""
                SELECT COALESCE(SUM(points_spent), 0) FROM partner_redemptions WHERE user_id = :id
            """),
            {"id": user_id},
        )
    ).scalar()

    lifetime_points = contribution_total + report_total
    spendable_points = lifetime_points - redeemed_total

    await db.execute(
        text("UPDATE profiles SET points = :points, spendable_points = :spendable WHERE id = :id"),
        {"points": lifetime_points, "spendable": spendable_points, "id": user_id},
    )
    await db.commit()

    return {
        "user_id": user_id,
        "before": {"points": float(before.points), "spendable_points": float(before.spendable_points)},
        "after": {"points": float(lifetime_points), "spendable_points": float(spendable_points)},
    }

    return {"geo_unit_id": geo_unit_id, "unit_type": unit_type, "unit_id": unit_id, "wiped": counts}
