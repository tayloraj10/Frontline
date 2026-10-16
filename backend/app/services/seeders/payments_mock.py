import json
import uuid

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

from .base import Seeder, SeedResult

MOCK_NS = uuid.UUID("5b0c3a52-6f1e-4d0b-9a77-3d2a7c1e9f10")
MOCK_PREFIX_PATTERN = "mock\\_%"


FREE_USER = {"key": "free_user", "email": "freeuser@example.com", "username": "freeuser", "name": "Free User", "password": "password"}


def _uid(key: str) -> str:
    return str(uuid.uuid5(MOCK_NS, key))


class PaymentsMockSeeder(Seeder):
    """Local-only payments v2 test data. Marks one existing user and one existing group as
    Frontline Plus subscribers and (optionally) creates funded sponsorships, all with
    'mock_' Stripe ids so they never touch Stripe and can be removed cleanly.

    Params: username, group_slug, sponsor_username (defaults to username), site_lat/site_lon
    (adds a funded site sponsorship), geo_unit_id (adds a funded group-area sponsorship),
    create_free_user (adds a login 'freeuser' / password 'password' with no Plus subscription, for seeing the
    non-member experience), remove (deletes everything this seeder created, including that user)."""

    default_params: dict = {}

    async def run(self, db: AsyncSession, params: dict) -> SeedResult:
        result = SeedResult()
        if params.get("remove"):
            await self._remove(db, result)
            await self._remove_free_user(result)
            await db.commit()
            return result

        if params.get("create_free_user"):
            await self._add_free_user(db, result)

        username = params.get("username")
        group_slug = params.get("group_slug")
        user_id = await self._lookup(db, "SELECT id FROM profiles WHERE username = :v", username)
        group_id = await self._lookup(db, "SELECT id FROM groups WHERE slug = :v", group_slug)
        if username and not user_id:
            result.errors.append(f"user '{username}' not found")
        if group_slug and not group_id:
            result.errors.append(f"group '{group_slug}' not found")

        for owner_type, owner_id in (("user", user_id), ("group", group_id)):
            if owner_id:
                await self._add_subscription(db, result, owner_type, owner_id)

        wants_sponsorship = params.get("site_lat") is not None or bool(params.get("geo_unit_id"))
        sponsor_name = params.get("sponsor_username") or username
        sponsor_id = await self._lookup(db, "SELECT id FROM profiles WHERE username = :v", sponsor_name)
        if wants_sponsorship and not sponsor_id:
            result.errors.append("a sponsor user is required to seed sponsorships (username or sponsor_username)")
        elif sponsor_id:
            if params.get("site_lat") is not None and params.get("site_lon") is not None:
                await self._add_site(db, result, sponsor_id, float(params["site_lat"]), float(params["site_lon"]))
            if params.get("geo_unit_id"):
                await self._add_group_area(db, result, sponsor_id, str(params["geo_unit_id"]))

        await db.commit()
        return result

    @staticmethod
    async def _lookup(db: AsyncSession, sql: str, value: str | None) -> str | None:
        if not value:
            return None
        row = (await db.execute(text(sql), {"v": value})).first()
        return str(row[0]) if row else None

    @staticmethod
    async def _add_subscription(db: AsyncSession, result: SeedResult, owner_type: str, owner_id: str) -> None:
        res = await db.execute(
            text("""
                INSERT INTO subscriptions (owner_type, owner_id, stripe_customer_id, stripe_subscription_id,
                                           stripe_price_id, status, current_period_end)
                VALUES (:ot, :oid, 'mock_customer', :sid, 'mock_price', 'active', now() + interval '1 month')
                ON CONFLICT (stripe_subscription_id) DO NOTHING
            """),
            {"ot": owner_type, "oid": owner_id, "sid": f"mock_sub_{owner_type}_{owner_id}"},
        )
        if res.rowcount:
            result.inserted += 1
        else:
            result.skipped += 1

    @staticmethod
    async def _add_site(db: AsyncSession, result: SeedResult, sponsor_id: str, lat: float, lon: float) -> None:
        rule = {"type": "flat_per_cleanup", "amount_cents": 1000}
        res = await db.execute(
            text("""
                INSERT INTO sponsorships (id, sponsor_type, sponsor_user_id, target_type, amount_cents, message,
                                          status, stripe_checkout_session_id, model, payout_rule,
                                          remaining_cents, site_label, site_location, site_radius_meters)
                VALUES (:id, 'user', :sponsor, 'site', 5000, 'Mock sponsored site for testing', 'funded',
                        :session, 'site', CAST(:rule AS jsonb), 5000, 'Mock sponsored site',
                        ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, 100)
                ON CONFLICT (id) DO NOTHING
            """),
            {"id": _uid(f"site_{lat}_{lon}"), "sponsor": sponsor_id, "session": f"mock_session_site_{lat}_{lon}",
             "rule": json.dumps(rule), "lat": lat, "lon": lon},
        )
        if res.rowcount:
            result.inserted += 1
        else:
            result.skipped += 1

    @staticmethod
    async def _add_group_area(db: AsyncSession, result: SeedResult, sponsor_id: str, geo_unit_id: str) -> None:
        rule = {"type": "flat_per_cleanup", "amount_cents": 2500}
        res = await db.execute(
            text("""
                INSERT INTO sponsorships (id, sponsor_type, sponsor_user_id, target_type, target_geo_unit_id,
                                          amount_cents, message, status, stripe_checkout_session_id, model,
                                          payout_rule, remaining_cents, area_geometry, area_name, area_source)
                SELECT :id, 'user', :sponsor, 'geo_unit', gu.id, 10000, 'Mock sponsored area for testing',
                       'funded', :session, 'group_area', CAST(:rule AS jsonb), 10000, gu.geometry,
                       COALESCE(gu.display_name, gu.unit_id), 'geo_units'
                FROM geo_units gu WHERE gu.id = :geo
                ON CONFLICT (id) DO NOTHING
            """),
            {"id": _uid(f"area_{geo_unit_id}"), "sponsor": sponsor_id, "geo": geo_unit_id,
             "session": f"mock_session_area_{geo_unit_id}", "rule": json.dumps(rule)},
        )
        if res.rowcount:
            result.inserted += 1
        else:
            result.skipped += 1

    @staticmethod
    async def _add_free_user(db: AsyncSession, result: SeedResult) -> None:
        uid = _uid(FREE_USER["key"])
        headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{settings.supabase_url}/auth/v1/admin/users",
                    headers=headers,
                    json={
                        "id": uid,
                        "email": FREE_USER["email"],
                        "password": FREE_USER["password"],
                        "email_confirm": True,
                        "user_metadata": {"username": FREE_USER["username"], "full_name": FREE_USER["name"]},
                    },
                    timeout=15,
                )
            if resp.status_code not in (200, 201, 409, 422):
                result.errors.append(f"free user auth: HTTP {resp.status_code} {resp.text[:200]}")
                return
        except Exception as exc:
            result.errors.append(f"free user auth: {exc}")
            return
        await db.execute(
            text("""
                INSERT INTO profiles (id, username, display_name)
                VALUES (:id, :username, :name)
                ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name
            """),
            {"id": uid, "username": FREE_USER["username"], "name": FREE_USER["name"]},
        )
        result.inserted += 1

    @staticmethod
    async def _remove_free_user(result: SeedResult) -> None:
        try:
            async with httpx.AsyncClient() as client:
                await client.delete(
                    f"{settings.supabase_url}/auth/v1/admin/users/{_uid(FREE_USER['key'])}",
                    headers={
                        "apikey": settings.supabase_service_role_key,
                        "Authorization": f"Bearer {settings.supabase_service_role_key}",
                    },
                    timeout=15,
                )
        except Exception as exc:
            result.errors.append(f"free user removal: {exc}")

    @staticmethod
    async def _remove(db: AsyncSession, result: SeedResult) -> None:
        ids = "SELECT id FROM sponsorships WHERE stripe_checkout_session_id LIKE :pat"
        args = {"pat": MOCK_PREFIX_PATTERN}
        await db.execute(text(f"UPDATE cleanups SET sponsorship_id = NULL WHERE sponsorship_id IN ({ids})"), args)
        await db.execute(text(f"DELETE FROM sponsorship_allocations WHERE sponsorship_id IN ({ids})"), args)
        spons = await db.execute(text("DELETE FROM sponsorships WHERE stripe_checkout_session_id LIKE :pat"), args)
        subs = await db.execute(text("DELETE FROM subscriptions WHERE stripe_subscription_id LIKE :pat"), args)
        result.skipped = (spons.rowcount or 0) + (subs.rowcount or 0)
