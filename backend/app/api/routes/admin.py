import asyncio
from functools import partial
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.content_flags import _HIDE_HANDLERS
from app.api.routes.tiles import reset_adjacency_cache, reset_tile_cache
from app.core.config import settings
from app.db.database import get_db
from app.services import geo
from app.services.game_settings import get_game_settings as get_game_balance_settings
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


@router.post("/simplify-nyc-boroughs")
async def simplify_nyc_boroughs(tolerance: float = 0.0001, precision: int = 5):
    """
    Convert and simplify backend/data/nyc_boroughs_raw.geojson →
    backend/data/nyc_boroughs.geojson. CPU-bound; takes under a second (5 features).
    Run this before POST /admin/geo-units/nyc_borough/reload.
    """
    if not geo.RAW_NYC_BOROUGHS_FILE.exists():
        raise HTTPException(
            404,
            f"Source file not found: {geo.RAW_NYC_BOROUGHS_FILE}. "
            "Copy the NYC Open Data Borough Boundaries GeoJSON export to backend/data/.",
        )

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None,
            partial(geo.simplify_nyc_boroughs, tolerance=tolerance, precision=precision),
        )
    except Exception as exc:
        raise HTTPException(500, f"Simplification failed: {exc}")

    return {
        "input_size_mb": round(result.input_size_mb, 1),
        "output_size_mb": round(result.output_size_mb, 1),
        "feature_count": result.feature_count,
        "skipped_count": result.skipped_count,
    }


@router.post("/simplify-cities")
async def simplify_cities(tolerance: float = 0.0002, precision: int = 5):
    """
    Convert and simplify backend/data/cities_raw.geojson → backend/data/cities.geojson.
    CPU-bound; takes under a second (4 features: NYC, Philadelphia, Chicago, LA).
    Run this before POST /admin/geo-units/city/reload.
    """
    if not geo.RAW_CITIES_FILE.exists():
        raise HTTPException(
            404,
            f"Source file not found: {geo.RAW_CITIES_FILE}. "
            "Fetch city-limits polygons from the Census TIGERweb Incorporated Places "
            "layer (queried by GEOID) and save the combined GeoJSON to backend/data/.",
        )

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None,
            partial(geo.simplify_cities, tolerance=tolerance, precision=precision),
        )
    except Exception as exc:
        raise HTTPException(500, f"Simplification failed: {exc}")

    return {
        "input_size_mb": round(result.input_size_mb, 1),
        "output_size_mb": round(result.output_size_mb, 1),
        "feature_count": result.feature_count,
        "skipped_count": result.skipped_count,
    }


@router.post("/simplify-philadelphia-neighborhoods")
async def simplify_philadelphia_neighborhoods(tolerance: float = 0.0001, precision: int = 5):
    """
    Convert and simplify backend/data/philadelphia_neighborhoods_raw.geojson →
    backend/data/philadelphia_neighborhoods.geojson. CPU-bound; takes a few seconds.
    Run this before POST /admin/geo-units/philadelphia_neighborhood/reload.
    """
    if not geo.RAW_PHILADELPHIA_NEIGHBORHOODS_FILE.exists():
        raise HTTPException(
            404,
            f"Source file not found: {geo.RAW_PHILADELPHIA_NEIGHBORHOODS_FILE}. "
            "Copy the OpenDataPhilly Philadelphia Neighborhoods GeoJSON export to backend/data/.",
        )

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None,
            partial(geo.simplify_philadelphia_neighborhoods, tolerance=tolerance, precision=precision),
        )
    except Exception as exc:
        raise HTTPException(500, f"Simplification failed: {exc}")

    return {
        "input_size_mb": round(result.input_size_mb, 1),
        "output_size_mb": round(result.output_size_mb, 1),
        "feature_count": result.feature_count,
        "skipped_count": result.skipped_count,
    }


@router.post("/simplify-chicago-neighborhoods")
async def simplify_chicago_neighborhoods(tolerance: float = 0.0001, precision: int = 5):
    """
    Convert and simplify backend/data/chicago_neighborhoods_raw.geojson →
    backend/data/chicago_neighborhoods.geojson. CPU-bound; takes a few seconds.
    Run this before POST /admin/geo-units/chicago_neighborhood/reload.
    """
    if not geo.RAW_CHICAGO_NEIGHBORHOODS_FILE.exists():
        raise HTTPException(
            404,
            f"Source file not found: {geo.RAW_CHICAGO_NEIGHBORHOODS_FILE}. "
            "Fetch the Chicago Data Portal Boundaries - Neighborhoods dataset (bbvz-uum9) "
            "via its v3 query API and save the combined GeoJSON to backend/data/.",
        )

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None,
            partial(geo.simplify_chicago_neighborhoods, tolerance=tolerance, precision=precision),
        )
    except Exception as exc:
        raise HTTPException(500, f"Simplification failed: {exc}")

    return {
        "input_size_mb": round(result.input_size_mb, 1),
        "output_size_mb": round(result.output_size_mb, 1),
        "feature_count": result.feature_count,
        "skipped_count": result.skipped_count,
    }


@router.post("/simplify-la-neighborhoods")
async def simplify_la_neighborhoods(tolerance: float = 0.0001, precision: int = 5):
    """
    Convert and simplify backend/data/la_neighborhoods_raw.geojson →
    backend/data/la_neighborhoods.geojson. CPU-bound; takes a few seconds.
    Run this before POST /admin/geo-units/la_neighborhood/reload.
    """
    if not geo.RAW_LA_NEIGHBORHOODS_FILE.exists():
        raise HTTPException(
            404,
            f"Source file not found: {geo.RAW_LA_NEIGHBORHOODS_FILE}. "
            "Copy the LA Times Mapping L.A. neighborhood boundaries GeoJSON export to backend/data/.",
        )

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None,
            partial(geo.simplify_la_neighborhoods, tolerance=tolerance, precision=precision),
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

    reset_adjacency_cache(unit_type.value)
    reset_tile_cache(unit_type.value)

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


@router.post("/cleanup-events/{cleanup_id}/wipe")
async def wipe_cleanup_event_data(cleanup_id: UUID, db: AsyncSession = Depends(get_db)):
    """
    Reverses everything a cleanup event's logging has produced, so an organizer can start
    fresh (e.g. a bad individual log before log-team-total existed, followed by a
    log-team-total run that only partially covers the group). Deletes every contribution
    tied to the event (cleanup_id or cleanup_event_id), recomputes territory_claims for
    each affected geo_unit from whatever contributions remain (or removes the claim row if
    none do), deletes the event's team-total audit log rows, and resets the event's own
    aggregate metrics to 0. profiles.points/spendable_points self-correct via the
    contributions INSERT/DELETE trigger. cleanup_rsvps.contribution_id auto-nulls via FK,
    making attendees eligible again for a fresh log-team-total run. Does not delete the
    cleanups row itself or its RSVPs.

    Dev/local only — this router is excluded in production (see main.py). For prod, use
    POST /api/admin-prod/cleanup-events/{cleanup_id} in admin_prod.py instead.
    """
    return await wipe_cleanup_event(db, cleanup_id)


async def wipe_cleanup_event(db: AsyncSession, cleanup_id: UUID) -> dict:
    cleanup_row = (
        await db.execute(text("SELECT id FROM cleanups WHERE id = :id"), {"id": str(cleanup_id)})
    ).fetchone()
    if not cleanup_row:
        raise HTTPException(404, f"No cleanup event found for id={cleanup_id}")

    affected = (
        await db.execute(
            text("""
                SELECT DISTINCT campaign_id, geo_unit_id
                FROM contributions
                WHERE (cleanup_id = :id OR cleanup_event_id = :id) AND geo_unit_id IS NOT NULL
            """),
            {"id": str(cleanup_id)},
        )
    ).fetchall()

    result = await db.execute(
        text("DELETE FROM contributions WHERE cleanup_id = :id OR cleanup_event_id = :id"),
        {"id": str(cleanup_id)},
    )
    contributions_deleted = result.rowcount

    territory_claims_updated = 0
    territory_claims_deleted = 0
    for campaign_id, geo_unit_id in affected:
        new_total = (
            await db.execute(
                text("""
                    SELECT COALESCE(SUM(value), 0) FROM contributions
                    WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
                """),
                {"campaign_id": str(campaign_id), "geo_unit_id": str(geo_unit_id)},
            )
        ).scalar()
        total = float(new_total)

        if total == 0:
            result = await db.execute(
                text("""
                    DELETE FROM territory_claims
                    WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
                """),
                {"campaign_id": str(campaign_id), "geo_unit_id": str(geo_unit_id)},
            )
            territory_claims_deleted += result.rowcount
        else:
            result = await db.execute(
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
                {
                    "campaign_id": str(campaign_id),
                    "geo_unit_id": str(geo_unit_id),
                    "total": total,
                },
            )
            territory_claims_updated += result.rowcount

    result = await db.execute(
        text("DELETE FROM cleanup_team_total_logs WHERE cleanup_id = :id"), {"id": str(cleanup_id)}
    )
    team_total_logs_deleted = result.rowcount

    await db.execute(
        text("""
            UPDATE cleanups
            SET metrics_small_bags = 0, metrics_large_bags = 0, metrics_pounds = 0
            WHERE id = :id
        """),
        {"id": str(cleanup_id)},
    )

    await db.commit()
    return {
        "cleanup_id": str(cleanup_id),
        "contributions_deleted": contributions_deleted,
        "territory_claims_updated": territory_claims_updated,
        "territory_claims_deleted": territory_claims_deleted,
        "team_total_logs_deleted": team_total_logs_deleted,
    }


@router.get("/users/search")
async def search_users(q: str, db: AsyncSession = Depends(get_db)):
    """
    Looks up real accounts by username or email, for admin flows that need to grant
    something to a specific user (e.g. partner business-admin access) without relying on
    someone typing an exact email correctly. Also mounted in production via
    admin_prod.py, which is a secret-protected mirror of this route since this router
    is dev-only.
    """
    return await search_users_by_username_or_email(db, q)


async def search_users_by_username_or_email(db: AsyncSession, q: str) -> list[dict]:
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

    game_settings = await get_game_balance_settings(db)

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

    lifetime_points = contribution_total + report_total * game_settings.get("trash_report_value", 1)
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


@router.get("/campaigns/{campaign_id}/spendable-points-impact")
async def preview_campaign_spendable_points_toggle(
    campaign_id: str, enabled: bool, db: AsyncSession = Depends(get_db)
):
    return await preview_campaign_spendable_points_impact(db, campaign_id, enabled)


async def preview_campaign_spendable_points_impact(db: AsyncSession, campaign_id: str, enabled: bool) -> dict:
    """
    Dry-run preview for flipping campaigns.counts_toward_spendable_points: shows what every
    affected user's spendable_points balance would eventually become under the proposed
    value, without persisting anything. "Affected" = has a contribution or problem_report
    tied to this campaign, since only those users' balances could possibly change. Toggling
    the flag itself does not apply these changes — an admin must separately run the global
    "recompute all balances" action (see recompute_all_points below) to actually persist and
    notify. This preview exists purely to inform that decision ahead of time.
    """
    campaign_row = (
        await db.execute(
            text("SELECT id, slug, title, counts_toward_spendable_points FROM campaigns WHERE id = :id"),
            {"id": campaign_id},
        )
    ).fetchone()
    if not campaign_row:
        raise HTTPException(404, "Campaign not found")

    game_settings = await get_game_balance_settings(db)

    rows = (
        await db.execute(
            text("""
                WITH effective_campaigns AS (
                    SELECT id FROM campaigns
                    WHERE (counts_toward_spendable_points AND id != :campaign_id)
                       OR (id = :campaign_id AND :enabled)
                ),
                affected_users AS (
                    SELECT DISTINCT user_id AS id FROM contributions
                    WHERE campaign_id = :campaign_id AND user_id IS NOT NULL
                    UNION
                    SELECT DISTINCT submitted_by_user_id AS id FROM problem_reports
                    WHERE campaign_id = :campaign_id AND submitted_by_user_id IS NOT NULL
                ),
                computed AS (
                    SELECT
                        p.id,
                        p.username,
                        p.points AS current_points,
                        p.points AS new_points,
                        p.spendable_points AS current_spendable_points,
                        COALESCE(c.total, 0) + COALESCE(r.total, 0) - COALESCE(rd.total, 0) AS new_spendable_points
                    FROM affected_users au
                    JOIN profiles p ON p.id = au.id
                    LEFT JOIN (
                        SELECT co.user_id, SUM(contribution_points(co.contribution_type, co.value)) AS total
                        FROM contributions co
                        WHERE co.campaign_id IN (SELECT id FROM effective_campaigns)
                        GROUP BY co.user_id
                    ) c ON c.user_id = p.id
                    LEFT JOIN (
                        SELECT pr.submitted_by_user_id AS user_id, COUNT(*) * CAST(:trash_report_value AS numeric) AS total
                        FROM problem_reports pr
                        WHERE pr.campaign_id IN (SELECT id FROM effective_campaigns)
                        GROUP BY pr.submitted_by_user_id
                    ) r ON r.user_id = p.id
                    LEFT JOIN (
                        SELECT user_id, SUM(points_spent) AS total FROM partner_redemptions GROUP BY user_id
                    ) rd ON rd.user_id = p.id
                )
                -- Lifetime "points" is never affected by this toggle (only spendable_points
                -- is), so new_points always equals current_points here; the column exists
                -- purely so this preview reads the same shape as the recompute-all preview.
                SELECT * FROM computed
                WHERE new_spendable_points IS DISTINCT FROM current_spendable_points
                ORDER BY username
            """),
            {
                "campaign_id": campaign_id,
                "enabled": enabled,
                "trash_report_value": game_settings.get("trash_report_value", 1),
            },
        )
    ).fetchall()

    return {
        "campaign": {
            "id": str(campaign_row.id),
            "slug": campaign_row.slug,
            "title": campaign_row.title,
            "currently_enabled": campaign_row.counts_toward_spendable_points,
        },
        "users": [
            {
                "id": str(r.id),
                "username": r.username,
                "current_points": float(r.current_points),
                "new_points": float(r.new_points),
                "current_spendable_points": float(r.current_spendable_points),
                "new_spendable_points": float(r.new_spendable_points),
            }
            for r in rows
        ],
    }


@router.post("/campaigns/{campaign_id}/spendable-points-toggle")
async def apply_campaign_spendable_points_toggle(
    campaign_id: str, enabled: bool, db: AsyncSession = Depends(get_db)
):
    return await toggle_campaign_spendable_points(db, campaign_id, enabled)


async def toggle_campaign_spendable_points(db: AsyncSession, campaign_id: str, enabled: bool) -> dict:
    """
    Flips campaigns.counts_toward_spendable_points only. Does NOT touch any user's stored
    points/spendable_points and does NOT notify anyone — this just changes which campaigns
    are counted going forward. Balances are left stale (out of sync with the new flag) until
    an admin explicitly runs the "recompute all balances" action below, which is the only
    thing that actually mutates profiles.points/spendable_points and notifies affected users.
    Decoupling these two steps means flipping a flag can never surprise a user with an
    immediate, unreviewed balance change or notification.
    """
    campaign_row = (
        await db.execute(text("SELECT id FROM campaigns WHERE id = :id"), {"id": campaign_id})
    ).fetchone()
    if not campaign_row:
        raise HTTPException(404, "Campaign not found")

    await db.execute(
        text("UPDATE campaigns SET counts_toward_spendable_points = :enabled WHERE id = :id"),
        {"enabled": enabled, "id": campaign_id},
    )
    await db.commit()

    return {"campaign_id": campaign_id, "counts_toward_spendable_points": enabled}


async def _notify_points_changes(db: AsyncSession, changes: list[dict]) -> None:
    """
    Inserts a user_notifications row for each user whose points and/or spendable_points
    actually changed as a result of an admin recompute/toggle action. No-op for entries
    where nothing moved. `changes` entries may omit either points or spendable_points
    keys if that action doesn't touch that field.
    """
    rows_to_insert = []
    for c in changes:
        parts = []
        if "old_points" in c and c["old_points"] != c["new_points"]:
            parts.append(f"points {c['old_points']:g} → {c['new_points']:g}")
        if "old_spendable_points" in c and c["old_spendable_points"] != c["new_spendable_points"]:
            parts.append(f"spendable points {c['old_spendable_points']:g} → {c['new_spendable_points']:g}")
        if not parts:
            continue
        rows_to_insert.append({
            "user_id": c["user_id"],
            "title": "Your points balance was adjusted",
            "body": "; ".join(parts) + ".",
        })

    if not rows_to_insert:
        return

    await db.execute(
        text("""
            INSERT INTO user_notifications (user_id, type, title, body)
            VALUES (:user_id, 'points_adjusted', :title, :body)
        """),
        rows_to_insert,
    )


_POINTS_RECOMPUTE_TOTALS_CTE = """
    contrib_totals AS (
        SELECT
            co.user_id AS id,
            SUM(contribution_points(co.contribution_type, co.value)) AS lifetime_total,
            SUM(contribution_points(co.contribution_type, co.value))
                FILTER (WHERE ca.counts_toward_spendable_points) AS spendable_total
        FROM contributions co
        JOIN campaigns ca ON ca.id = co.campaign_id
        WHERE co.user_id IS NOT NULL
        GROUP BY co.user_id
    ),
    report_totals AS (
        SELECT
            pr.submitted_by_user_id AS id,
            COUNT(*) * CAST(:trash_report_value AS numeric) AS lifetime_total,
            COUNT(*) FILTER (WHERE ca.counts_toward_spendable_points) * CAST(:trash_report_value AS numeric) AS spendable_total
        FROM problem_reports pr
        JOIN campaigns ca ON ca.id = pr.campaign_id
        WHERE pr.submitted_by_user_id IS NOT NULL
        GROUP BY pr.submitted_by_user_id
    ),
    redeemed AS (
        SELECT user_id AS id, SUM(points_spent) AS total FROM partner_redemptions GROUP BY user_id
    )
"""


@router.get("/points/recompute-impact")
async def preview_points_recompute(db: AsyncSession = Depends(get_db)):
    return await preview_points_recompute_impact(db)


async def preview_points_recompute_impact(db: AsyncSession) -> dict:
    """
    Dry-run preview for recomputing every user's lifetime `points` and `spendable_points`
    from scratch off their current contributions/problem_reports/partner_redemptions,
    discarding whatever is currently stored. This only re-sums existing contribution
    values — it does not change any contribution's stored `value` (see dev-backlog #8 for
    that separate, unscoped problem). Useful after toggling which campaigns count toward
    spendable_points, or as a general drift-correction sweep. Only returns users whose
    recomputed totals differ from what's currently stored.
    """
    game_settings = await get_game_balance_settings(db)
    rows = (
        await db.execute(
            text(f"""
                WITH {_POINTS_RECOMPUTE_TOTALS_CTE}
                SELECT
                    p.id,
                    p.username,
                    p.points AS current_points,
                    p.spendable_points AS current_spendable_points,
                    COALESCE(c.lifetime_total, 0) + COALESCE(r.lifetime_total, 0) AS new_points,
                    COALESCE(c.spendable_total, 0) + COALESCE(r.spendable_total, 0) - COALESCE(rd.total, 0) AS new_spendable_points
                FROM profiles p
                LEFT JOIN contrib_totals c ON c.id = p.id
                LEFT JOIN report_totals r ON r.id = p.id
                LEFT JOIN redeemed rd ON rd.id = p.id
                WHERE p.points IS DISTINCT FROM (COALESCE(c.lifetime_total, 0) + COALESCE(r.lifetime_total, 0))
                   OR p.spendable_points IS DISTINCT FROM (COALESCE(c.spendable_total, 0) + COALESCE(r.spendable_total, 0) - COALESCE(rd.total, 0))
                ORDER BY p.username
            """),
            {"trash_report_value": game_settings.get("trash_report_value", 1)},
        )
    ).fetchall()

    return {
        "users": [
            {
                "id": str(r.id),
                "username": r.username,
                "current_points": float(r.current_points),
                "new_points": float(r.new_points),
                "current_spendable_points": float(r.current_spendable_points),
                "new_spendable_points": float(r.new_spendable_points),
            }
            for r in rows
        ],
    }


@router.post("/points/recompute")
async def apply_points_recompute(db: AsyncSession = Depends(get_db)):
    return await recompute_all_points(db)


async def recompute_all_points(db: AsyncSession) -> dict:
    """
    Persists the recompute previewed above: every user's points/spendable_points are
    overwritten with a from-scratch resum of their current contributions/reports/
    redemptions. Notifies any user whose balance actually changes.
    """
    game_settings = await get_game_balance_settings(db)
    updated = (
        await db.execute(
            text(f"""
                WITH {_POINTS_RECOMPUTE_TOTALS_CTE},
                old_vals AS (
                    SELECT id, points, spendable_points FROM profiles
                )
                UPDATE profiles p
                SET
                    points = COALESCE(c.lifetime_total, 0) + COALESCE(r.lifetime_total, 0),
                    spendable_points = COALESCE(c.spendable_total, 0) + COALESCE(r.spendable_total, 0) - COALESCE(rd.total, 0)
                FROM old_vals ov
                LEFT JOIN contrib_totals c ON c.id = ov.id
                LEFT JOIN report_totals r ON r.id = ov.id
                LEFT JOIN redeemed rd ON rd.id = ov.id
                WHERE p.id = ov.id
                RETURNING
                    p.id,
                    ov.points AS old_points,
                    p.points AS new_points,
                    ov.spendable_points AS old_spendable_points,
                    p.spendable_points AS new_spendable_points
            """),
            {"trash_report_value": game_settings.get("trash_report_value", 1)},
        )
    ).fetchall()

    changes = [
        {
            "user_id": str(r.id),
            "old_points": float(r.old_points),
            "new_points": float(r.new_points),
            "old_spendable_points": float(r.old_spendable_points),
            "new_spendable_points": float(r.new_spendable_points),
        }
        for r in updated
    ]
    await _notify_points_changes(db, changes)
    await db.commit()

    changed = [
        c for c in changes
        if c["old_points"] != c["new_points"] or c["old_spendable_points"] != c["new_spendable_points"]
    ]
    return {"users_checked": len(changes), "users_changed": len(changed)}


@router.get("/content-flags/queue")
async def get_content_flags_queue(db: AsyncSession = Depends(get_db)):
    return await list_content_flags_queue(db)


def _map_link(campaign_slug, lat, lng) -> dict | None:
    if not campaign_slug or lat is None or lng is None:
        return None
    return {"campaign_slug": campaign_slug, "lat": lat, "lng": lng}


def _content_flag_context(r) -> dict:
    if r.content_type == "avatar":
        return {
            "label": r.avatar_display_name or (f"@{r.avatar_username}" if r.avatar_username else "Deleted user"),
            "user_id": str(r.content_id),
            "username": r.avatar_username,
            "map_link": None,
        }
    if r.content_type == "contribution_photo":
        who = r.contribution_display_name or (f"@{r.contribution_username}" if r.contribution_username else "Unknown user")
        return {
            "label": f"Contribution by {who}" + (f" · {r.contribution_campaign_title}" if r.contribution_campaign_title else ""),
            "user_id": str(r.contribution_user_id) if r.contribution_user_id else None,
            "username": r.contribution_username,
            "map_link": _map_link(r.contribution_campaign_slug, r.contribution_lat, r.contribution_lng),
        }
    if r.content_type == "cleanup_log_photo":
        return {
            "label": (r.cleanup_log_title or "Cleanup") + (f" · {r.cleanup_log_group_name}" if r.cleanup_log_group_name else ""),
            "user_id": None,
            "username": None,
            "map_link": _map_link(r.cleanup_log_campaign_slug, r.cleanup_log_lat, r.cleanup_log_lng),
        }
    if r.content_type == "cleanup_event_photo":
        who = r.cleanup_event_display_name or (f"@{r.cleanup_event_username}" if r.cleanup_event_username else "Unknown user")
        return {
            "label": f"Uploaded by {who} · {r.cleanup_event_cleanup_title or 'Cleanup'}"
            + (f" ({r.cleanup_event_group_name})" if r.cleanup_event_group_name else ""),
            "user_id": str(r.cleanup_event_user_id) if r.cleanup_event_user_id else None,
            "username": r.cleanup_event_username,
            "map_link": _map_link(r.cleanup_event_campaign_slug, r.cleanup_event_lat, r.cleanup_event_lng),
        }
    return {"label": None, "user_id": None, "username": None, "map_link": None}


def _problem_report_flag_context(r) -> dict:
    who = r.reporter_display_name or (f"@{r.reporter_username}" if r.reporter_username else "Unknown user")
    return {
        "label": f"Trash report by {who}" + (f" · {r.campaign_title}" if r.campaign_title else ""),
        "user_id": str(r.reporter_id) if r.reporter_id else None,
        "username": r.reporter_username,
        "map_link": _map_link(r.campaign_slug, r.report_lat, r.report_lng),
    }


async def _fetch_problem_report_flags_unresolved(db: AsyncSession) -> list[dict]:
    rows = (
        await db.execute(
            text("""
                SELECT
                    pr.id AS report_id,
                    pr.image_urls,
                    pr.severity,
                    pr.status,
                    pr.submitted_by_user_id AS reporter_id,
                    reporter.username AS reporter_username,
                    reporter.display_name AS reporter_display_name,
                    camp.title AS campaign_title,
                    camp.slug AS campaign_slug,
                    ST_Y(pr.location::geometry) AS report_lat,
                    ST_X(pr.location::geometry) AS report_lng,
                    COUNT(*) AS flag_count,
                    array_remove(array_agg(DISTINCT prf.reason), NULL) AS reasons,
                    MIN(prf.created_at) AS first_flagged_at,
                    MAX(prf.created_at) AS last_flagged_at
                FROM problem_report_flags prf
                JOIN problem_reports pr ON pr.id = prf.report_id
                LEFT JOIN profiles reporter ON reporter.id = pr.submitted_by_user_id
                LEFT JOIN campaigns camp ON camp.id = pr.campaign_id
                WHERE prf.resolved_at IS NULL
                GROUP BY pr.id, pr.image_urls, pr.severity, pr.status, pr.submitted_by_user_id,
                    reporter.username, reporter.display_name, camp.title, camp.slug, pr.location
            """)
        )
    ).fetchall()

    return [
        {
            "content_type": "problem_report",
            "content_id": str(r.report_id),
            "photo_url": r.image_urls[0] if r.image_urls else None,
            "flag_count": r.flag_count,
            "reasons": r.reasons,
            "first_flagged_at": r.first_flagged_at.isoformat(),
            "last_flagged_at": r.last_flagged_at.isoformat(),
            "context": _problem_report_flag_context(r),
        }
        for r in rows
    ]


async def _fetch_problem_report_flags_resolved(db: AsyncSession, limit: int) -> list[dict]:
    rows = (
        await db.execute(
            text("""
                WITH queue AS (
                    SELECT
                        report_id,
                        resolution,
                        resolved_by,
                        COUNT(*) AS flag_count,
                        array_remove(array_agg(DISTINCT reason), NULL) AS reasons,
                        MIN(created_at) AS first_flagged_at,
                        MAX(created_at) AS last_flagged_at,
                        MAX(resolved_at) AS resolved_at
                    FROM problem_report_flags
                    WHERE resolved_at IS NOT NULL
                    GROUP BY report_id, resolution, resolved_by
                )
                SELECT
                    q.*,
                    pr.image_urls,
                    pr.severity,
                    pr.status,
                    pr.submitted_by_user_id AS reporter_id,
                    reporter.username AS reporter_username,
                    reporter.display_name AS reporter_display_name,
                    camp.title AS campaign_title,
                    camp.slug AS campaign_slug,
                    ST_Y(pr.location::geometry) AS report_lat,
                    ST_X(pr.location::geometry) AS report_lng,
                    admin_p.username AS resolved_by_username,
                    admin_p.display_name AS resolved_by_display_name
                FROM queue q
                JOIN problem_reports pr ON pr.id = q.report_id
                LEFT JOIN profiles reporter ON reporter.id = pr.submitted_by_user_id
                LEFT JOIN campaigns camp ON camp.id = pr.campaign_id
                LEFT JOIN profiles admin_p ON admin_p.id = q.resolved_by
                ORDER BY q.resolved_at DESC
                LIMIT :limit
            """),
            {"limit": limit},
        )
    ).fetchall()

    return [
        {
            "content_type": "problem_report",
            "content_id": str(r.report_id),
            "photo_url": r.image_urls[0] if r.image_urls else None,
            "flag_count": r.flag_count,
            "reasons": r.reasons,
            "first_flagged_at": r.first_flagged_at.isoformat(),
            "last_flagged_at": r.last_flagged_at.isoformat(),
            "context": _problem_report_flag_context(r),
            "resolution": r.resolution,
            "resolved_at": r.resolved_at.isoformat(),
            "resolved_by": {
                "user_id": str(r.resolved_by) if r.resolved_by else None,
                "label": r.resolved_by_display_name or (f"@{r.resolved_by_username}" if r.resolved_by_username else "Unknown admin"),
            },
        }
        for r in rows
    ]


async def list_content_flags_queue(db: AsyncSession) -> list[dict]:
    """
    Groups unresolved content_flags rows by the photo they target, so an admin sees one
    entry per flagged photo (with its flag count and reasons) rather than one row per flag.
    Also joins in enough context about the parent object -- whose avatar it is, who
    submitted the contribution/cleanup, which cleanup/group it belongs to -- so the queue
    is actionable without an admin having to go look the object up themselves. Flagged trash
    reports (problem_report_flags) are merged into the same list rather than a separate
    section, since from an admin's perspective they're all just "things users flagged".
    """
    rows = (
        await db.execute(
            text("""
                WITH queue AS (
                    SELECT
                        content_type,
                        content_id,
                        photo_url,
                        COUNT(*) AS flag_count,
                        array_remove(array_agg(DISTINCT reason), NULL) AS reasons,
                        MIN(created_at) AS first_flagged_at,
                        MAX(created_at) AS last_flagged_at
                    FROM content_flags
                    WHERE resolved_at IS NULL
                    GROUP BY content_type, content_id, photo_url
                )
                SELECT
                    q.*,
                    av.username AS avatar_username,
                    av.display_name AS avatar_display_name,
                    contrib_p.id AS contribution_user_id,
                    contrib_p.username AS contribution_username,
                    contrib_p.display_name AS contribution_display_name,
                    contrib_camp.title AS contribution_campaign_title,
                    contrib_camp.slug AS contribution_campaign_slug,
                    ST_Y(contrib.location::geometry) AS contribution_lat,
                    ST_X(contrib.location::geometry) AS contribution_lng,
                    cl_direct.title AS cleanup_log_title,
                    cl_direct_g.name AS cleanup_log_group_name,
                    cl_direct_camp.slug AS cleanup_log_campaign_slug,
                    ST_Y(cl_direct.location::geometry) AS cleanup_log_lat,
                    ST_X(cl_direct.location::geometry) AS cleanup_log_lng,
                    cep_p.id AS cleanup_event_user_id,
                    cep_p.username AS cleanup_event_username,
                    cep_p.display_name AS cleanup_event_display_name,
                    cep_cl.title AS cleanup_event_cleanup_title,
                    cep_g.name AS cleanup_event_group_name,
                    cep_camp.slug AS cleanup_event_campaign_slug,
                    ST_Y(cep_cl.location::geometry) AS cleanup_event_lat,
                    ST_X(cep_cl.location::geometry) AS cleanup_event_lng
                FROM queue q
                LEFT JOIN profiles av ON q.content_type = 'avatar' AND av.id = q.content_id
                LEFT JOIN contributions contrib ON q.content_type = 'contribution_photo' AND contrib.id = q.content_id
                LEFT JOIN profiles contrib_p ON contrib_p.id = contrib.user_id
                LEFT JOIN campaigns contrib_camp ON contrib_camp.id = contrib.campaign_id
                LEFT JOIN cleanups cl_direct ON q.content_type = 'cleanup_log_photo' AND cl_direct.id = q.content_id
                LEFT JOIN groups cl_direct_g ON cl_direct_g.id = cl_direct.group_id
                LEFT JOIN campaigns cl_direct_camp ON cl_direct_camp.id = cl_direct.campaign_id
                LEFT JOIN cleanup_event_photos cep ON q.content_type = 'cleanup_event_photo' AND cep.id = q.content_id
                LEFT JOIN profiles cep_p ON cep_p.id = cep.user_id
                LEFT JOIN cleanups cep_cl ON cep_cl.id = cep.cleanup_id
                LEFT JOIN groups cep_g ON cep_g.id = cep_cl.group_id
                LEFT JOIN campaigns cep_camp ON cep_camp.id = cep_cl.campaign_id
                ORDER BY q.last_flagged_at DESC
            """)
        )
    ).fetchall()

    photo_flags = [
        {
            "content_type": r.content_type,
            "content_id": str(r.content_id),
            "photo_url": r.photo_url,
            "flag_count": r.flag_count,
            "reasons": r.reasons,
            "first_flagged_at": r.first_flagged_at.isoformat(),
            "last_flagged_at": r.last_flagged_at.isoformat(),
            "context": _content_flag_context(r),
        }
        for r in rows
    ]
    report_flags = await _fetch_problem_report_flags_unresolved(db)
    return sorted(photo_flags + report_flags, key=lambda x: x["last_flagged_at"], reverse=True)


@router.get("/content-flags/history")
async def get_content_flags_history(db: AsyncSession = Depends(get_db)):
    return await list_resolved_content_flags(db)


async def list_resolved_content_flags(db: AsyncSession, limit: int = 50) -> list[dict]:
    """
    Same shape as list_content_flags_queue, but for already-resolved reports, most recently
    resolved first, capped at `limit` since this is a history view rather than an actionable
    queue. Also surfaces which admin resolved it and how.
    """
    rows = (
        await db.execute(
            text("""
                WITH queue AS (
                    SELECT
                        content_type,
                        content_id,
                        photo_url,
                        resolution,
                        resolved_by,
                        COUNT(*) AS flag_count,
                        array_remove(array_agg(DISTINCT reason), NULL) AS reasons,
                        MIN(created_at) AS first_flagged_at,
                        MAX(created_at) AS last_flagged_at,
                        MAX(resolved_at) AS resolved_at
                    FROM content_flags
                    WHERE resolved_at IS NOT NULL
                    GROUP BY content_type, content_id, photo_url, resolution, resolved_by
                )
                SELECT
                    q.*,
                    admin_p.username AS resolved_by_username,
                    admin_p.display_name AS resolved_by_display_name,
                    av.username AS avatar_username,
                    av.display_name AS avatar_display_name,
                    contrib_p.id AS contribution_user_id,
                    contrib_p.username AS contribution_username,
                    contrib_p.display_name AS contribution_display_name,
                    contrib_camp.title AS contribution_campaign_title,
                    contrib_camp.slug AS contribution_campaign_slug,
                    ST_Y(contrib.location::geometry) AS contribution_lat,
                    ST_X(contrib.location::geometry) AS contribution_lng,
                    cl_direct.title AS cleanup_log_title,
                    cl_direct_g.name AS cleanup_log_group_name,
                    cl_direct_camp.slug AS cleanup_log_campaign_slug,
                    ST_Y(cl_direct.location::geometry) AS cleanup_log_lat,
                    ST_X(cl_direct.location::geometry) AS cleanup_log_lng,
                    cep_p.id AS cleanup_event_user_id,
                    cep_p.username AS cleanup_event_username,
                    cep_p.display_name AS cleanup_event_display_name,
                    cep_cl.title AS cleanup_event_cleanup_title,
                    cep_g.name AS cleanup_event_group_name,
                    cep_camp.slug AS cleanup_event_campaign_slug,
                    ST_Y(cep_cl.location::geometry) AS cleanup_event_lat,
                    ST_X(cep_cl.location::geometry) AS cleanup_event_lng
                FROM queue q
                LEFT JOIN profiles admin_p ON admin_p.id = q.resolved_by
                LEFT JOIN profiles av ON q.content_type = 'avatar' AND av.id = q.content_id
                LEFT JOIN contributions contrib ON q.content_type = 'contribution_photo' AND contrib.id = q.content_id
                LEFT JOIN profiles contrib_p ON contrib_p.id = contrib.user_id
                LEFT JOIN campaigns contrib_camp ON contrib_camp.id = contrib.campaign_id
                LEFT JOIN cleanups cl_direct ON q.content_type = 'cleanup_log_photo' AND cl_direct.id = q.content_id
                LEFT JOIN groups cl_direct_g ON cl_direct_g.id = cl_direct.group_id
                LEFT JOIN campaigns cl_direct_camp ON cl_direct_camp.id = cl_direct.campaign_id
                LEFT JOIN cleanup_event_photos cep ON q.content_type = 'cleanup_event_photo' AND cep.id = q.content_id
                LEFT JOIN profiles cep_p ON cep_p.id = cep.user_id
                LEFT JOIN cleanups cep_cl ON cep_cl.id = cep.cleanup_id
                LEFT JOIN groups cep_g ON cep_g.id = cep_cl.group_id
                LEFT JOIN campaigns cep_camp ON cep_camp.id = cep_cl.campaign_id
                ORDER BY q.resolved_at DESC
                LIMIT :limit
            """),
            {"limit": limit},
        )
    ).fetchall()

    photo_flags = [
        {
            "content_type": r.content_type,
            "content_id": str(r.content_id),
            "photo_url": r.photo_url,
            "flag_count": r.flag_count,
            "reasons": r.reasons,
            "first_flagged_at": r.first_flagged_at.isoformat(),
            "last_flagged_at": r.last_flagged_at.isoformat(),
            "context": _content_flag_context(r),
            "resolution": r.resolution,
            "resolved_at": r.resolved_at.isoformat(),
            "resolved_by": {
                "user_id": str(r.resolved_by) if r.resolved_by else None,
                "label": r.resolved_by_display_name or (f"@{r.resolved_by_username}" if r.resolved_by_username else "Unknown admin"),
            },
        }
        for r in rows
    ]
    report_flags = await _fetch_problem_report_flags_resolved(db, limit)
    merged = sorted(photo_flags + report_flags, key=lambda x: x["resolved_at"], reverse=True)
    return merged[:limit]


@router.get("/blocked-users")
async def get_blocked_users(db: AsyncSession = Depends(get_db), limit: int = 100):
    return await list_blocked_users(db, limit)


async def list_blocked_users(db: AsyncSession, limit: int = 100) -> list[dict]:
    rows = (
        await db.execute(
            text("""
                SELECT
                    b.id,
                    b.reason,
                    b.created_at,
                    blocker.id AS blocker_id,
                    blocker.username AS blocker_username,
                    blocker.display_name AS blocker_display_name,
                    blocked.id AS blocked_id,
                    blocked.username AS blocked_username,
                    blocked.display_name AS blocked_display_name
                FROM blocked_users b
                JOIN profiles blocker ON blocker.id = b.blocker_id
                JOIN profiles blocked ON blocked.id = b.blocked_id
                ORDER BY b.created_at DESC
                LIMIT :limit
            """),
            {"limit": limit},
        )
    ).fetchall()

    return [
        {
            "id": str(r.id),
            "reason": r.reason,
            "created_at": r.created_at.isoformat(),
            "blocker": {
                "id": str(r.blocker_id),
                "username": r.blocker_username,
                "display_name": r.blocker_display_name,
            },
            "blocked": {
                "id": str(r.blocked_id),
                "username": r.blocked_username,
                "display_name": r.blocked_display_name,
            },
        }
        for r in rows
    ]


class ResolveContentFlagRequest(BaseModel):
    content_type: str
    content_id: UUID
    photo_url: str
    resolution: str
    admin_id: UUID


@router.post("/content-flags/resolve")
async def post_resolve_content_flag(payload: ResolveContentFlagRequest, db: AsyncSession = Depends(get_db)):
    return await resolve_content_flag_group(
        db, payload.content_type, payload.content_id, payload.photo_url, payload.resolution, payload.admin_id
    )


async def _resolve_problem_report_flag_group(
    db: AsyncSession, report_id: UUID, resolution: str, admin_id: UUID
) -> dict:
    hidden = False
    if resolution == "hide":
        hide_result = await db.execute(
            text("""
                UPDATE problem_reports
                SET status = 'flagged'
                WHERE id = :report_id AND status IN ('open', 'scheduled', 'in_progress')
                RETURNING claimed_by_user_id, campaign_id
            """),
            {"report_id": str(report_id)},
        )
        hide_row = hide_result.fetchone()
        hidden = hide_row is not None
        if hide_row and hide_row[0]:
            await db.execute(
                text("""
                    INSERT INTO user_notifications (user_id, type, title, body, campaign_id, campaign_slug)
                    SELECT :user_id, 'claim_expired', 'Report pulled from the map',
                           'The trash report you claimed was flagged as inaccurate by other users and removed from the map — your claim has been released.',
                           :campaign_id, camps.slug
                    FROM campaigns camps WHERE camps.id = :campaign_id
                """),
                {"user_id": str(hide_row[0]), "campaign_id": str(hide_row[1])},
            )

    result = await db.execute(
        text("""
            UPDATE problem_report_flags
            SET resolved_at = NOW(), resolved_by = :admin_id, resolution = :resolution
            WHERE report_id = :report_id AND resolved_at IS NULL
            RETURNING id
        """),
        {
            "admin_id": str(admin_id),
            "resolution": "hidden" if resolution == "hide" else "dismissed",
            "report_id": str(report_id),
        },
    )
    resolved_count = len(result.fetchall())
    await db.commit()
    return {"resolved_count": resolved_count, "hidden": hidden}


async def resolve_content_flag_group(
    db: AsyncSession, content_type: str, content_id: UUID, photo_url: str, resolution: str, admin_id: UUID
) -> dict:
    """
    Marks every unresolved content_flags row for this (content_type, content_id, photo_url)
    as resolved. resolution='hide' removes the photo from wherever it's displayed (reusing
    content_flags.py's auto-hide handlers); resolution='dismiss' leaves the photo up and just
    clears the queue entry.

    content_type='problem_report' is handled separately, since a trash report's photo is
    required (can't be nulled out) -- "hide" there means pulling the report off the map
    (status -> 'flagged', releasing any active claim) the same way flag_problem_report's
    auto-hide branch already does, not removing a photo.
    """
    if resolution not in {"hide", "dismiss"}:
        raise HTTPException(400, "resolution must be 'hide' or 'dismiss'")

    if content_type == "problem_report":
        return await _resolve_problem_report_flag_group(db, content_id, resolution, admin_id)

    if content_type not in _HIDE_HANDLERS:
        raise HTTPException(400, "Invalid content_type")

    hidden = False
    if resolution == "hide":
        hidden = await _HIDE_HANDLERS[content_type](db, content_id, photo_url)

    result = await db.execute(
        text("""
            UPDATE content_flags
            SET resolved_at = NOW(), resolved_by = :admin_id, resolution = :resolution
            WHERE content_type = :content_type AND content_id = :content_id AND photo_url = :photo_url
                AND resolved_at IS NULL
            RETURNING id
        """),
        {
            "admin_id": str(admin_id),
            "resolution": "hidden" if resolution == "hide" else "dismissed",
            "content_type": content_type,
            "content_id": str(content_id),
            "photo_url": photo_url,
        },
    )
    resolved_count = len(result.fetchall())
    await db.commit()
    return {"resolved_count": resolved_count, "hidden": hidden}
