"""
Test attendees seeder: RSVPs a handful of deterministic demo users to a
specific cleanup event, for local testing of attendee-list features
(organizer badge/promote/demote, etc). Idempotent via deterministic UUIDs.
"""

import uuid

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

from .base import Seeder, SeedResult

TEST_NS = uuid.UUID("87654321-4321-8765-4321-876543218765")

_TEST_USERS = [
    {"key": "riley", "username": "riley_test", "name": "Riley Fontaine", "email": "riley.test@frontline.app"},
    {"key": "quinn", "username": "quinn_test", "name": "Quinn Abara", "email": "quinn.test@frontline.app"},
    {"key": "casey", "username": "casey_test", "name": "Casey Delgado", "email": "casey.test@frontline.app"},
    {"key": "morgan", "username": "morgan_test", "name": "Morgan Iyer", "email": "morgan.test@frontline.app"},
]


def _uid(key: str) -> str:
    return str(uuid.uuid5(TEST_NS, key))


class CleanupTestAttendeesSeeder(Seeder):
    default_params: dict = {"cleanup_id": None}

    async def run(self, db: AsyncSession, params: dict) -> SeedResult:
        result = SeedResult()
        cleanup_id = params.get("cleanup_id")
        if not cleanup_id:
            result.errors.append("cleanup_id param is required")
            return result

        row = (
            await db.execute(
                text("SELECT group_id FROM cleanups WHERE id = :id"),
                {"id": cleanup_id},
            )
        ).first()
        if not row:
            result.errors.append(f"cleanup {cleanup_id} not found")
            return result
        group_id = row.group_id

        user_ids: dict[str, str] = {}
        async with httpx.AsyncClient() as client:
            for u in _TEST_USERS:
                uid = _uid(f"user_{u['key']}")
                try:
                    resp = await client.post(
                        f"{settings.supabase_url}/auth/v1/admin/users",
                        headers={
                            "apikey": settings.supabase_service_role_key,
                            "Authorization": f"Bearer {settings.supabase_service_role_key}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "id": uid,
                            "email": u["email"],
                            "password": "TestUser2024!",
                            "email_confirm": True,
                            "user_metadata": {"username": u["username"], "full_name": u["name"]},
                        },
                        timeout=15,
                    )
                    if resp.status_code in (200, 201, 409, 422):
                        user_ids[u["key"]] = uid
                    else:
                        result.errors.append(f"auth user {u['key']}: HTTP {resp.status_code}")
                except Exception as exc:
                    result.errors.append(f"auth user {u['key']}: {exc}")

        for u in _TEST_USERS:
            uid = user_ids.get(u["key"])
            if not uid:
                continue
            try:
                await db.execute(
                    text("""
                        INSERT INTO profiles (id, username, display_name)
                        VALUES (:id, :username, :name)
                        ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name
                    """),
                    {"id": uid, "username": u["username"], "name": u["name"]},
                )
                await db.execute(
                    text("""
                        INSERT INTO group_members (id, group_id, user_id, role)
                        VALUES (:id, :gid, :uid, 'member')
                        ON CONFLICT (group_id, user_id) DO NOTHING
                    """),
                    {"id": _uid(f"mem_{u['key']}"), "gid": group_id, "uid": uid},
                )
                await db.execute(
                    text("""
                        INSERT INTO cleanup_rsvps (id, cleanup_id, user_id, status)
                        VALUES (:id, :cleanup_id, :uid, 'going')
                        ON CONFLICT (cleanup_id, user_id) DO NOTHING
                    """),
                    {"id": _uid(f"rsvp_{u['key']}"), "cleanup_id": cleanup_id, "uid": uid},
                )
                result.inserted += 1
            except Exception as exc:
                result.errors.append(f"attendee {u['key']}: {exc}")

        await db.commit()
        return result
