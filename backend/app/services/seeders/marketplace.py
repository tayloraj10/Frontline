import uuid

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

from .base import Seeder, SeedResult

NS = uuid.UUID("7e2d9c14-3b8a-4f61-a5d0-2c91e6b04f38")


def _uid(key: str) -> str:
    return str(uuid.uuid5(NS, key))


CUSTOMERS = [
    {"key": "mk_cust_maria", "username": "mk_maria", "name": "Maria Lopez"},
    {"key": "mk_cust_devon", "username": "mk_devon", "name": "Devon Price"},
    {"key": "mk_cust_priya", "username": "mk_priya", "name": "Priya Shah"},
]
CLEANERS = [
    {"key": "mk_clean_jamal", "username": "mk_jamal", "name": "Jamal Carter", "headline": "Weekend lot and sidewalk crew",
     "services": ["lot_cleanup", "sidewalk", "litter"], "rate_type": "hourly", "rate_cents": 2500, "radius_km": 15,
     "lat": 40.7282, "lng": -73.9442, "area": "Brooklyn", "rating": 4.9, "count": 23, "done": 31},
    {"key": "mk_clean_sofia", "username": "mk_sofia", "name": "Sofia Reyes", "headline": "Yard work and litter pickup",
     "services": ["light_yard_work", "litter"], "rate_type": "hourly", "rate_cents": 2200, "radius_km": 10,
     "lat": 40.7484, "lng": -73.9857, "area": "Midtown, Manhattan", "rating": 4.7, "count": 11, "done": 14},
    {"key": "mk_clean_theo", "username": "mk_theo", "name": "Theo Nguyen", "headline": "Fast, careful, and reliable",
     "services": ["sidewalk", "light_yard_work"], "rate_type": "fixed", "rate_cents": 6000, "radius_km": 20,
     "lat": 40.7678, "lng": -73.8231, "area": "Queens", "rating": None, "count": 0, "done": 0},
]

# (key, customer, title, type, size, price_cents, price_type, time_mode, lat, lng, address, radius_m, area_polygon_wkt)
JOBS = [
    ("j1", "mk_cust_maria", "Clear litter from the Bedford Ave corner lot", "lot_cleanup", "medium", 12000, "fixed", "flexible",
     40.7203, -73.9571, "Bedford Ave, Brooklyn", 60, None),
    ("j2", "mk_cust_devon", "Sweep and bag leaves on my block", "sidewalk", "small", 4500, "fixed", "specific",
     40.6782, -73.9442, "Franklin Ave, Brooklyn", None, None),
    ("j3", "mk_cust_priya", "Overgrown front yard needs cutting back", "light_yard_work", "medium", 3000, "hourly", "window",
     40.7614, -73.9776, "W 54th St, Manhattan", None, None),
    ("j4", "mk_cust_maria", "Pick up trash along the park fence", "litter", "large", 9000, "fixed", "flexible",
     40.7295, -73.9965, "Washington Sq, Manhattan", None,
     "POLYGON((-73.9985 40.7290, -73.9945 40.7290, -73.9945 40.7315, -73.9985 40.7315, -73.9985 40.7290))"),
    ("j5", "mk_cust_devon", "Vacant lot behind the laundromat", "lot_cleanup", "large", 25000, "fixed", "window",
     40.7506, -73.8710, "Roosevelt Ave, Queens", 120, None),
    ("j6", "mk_cust_priya", "Quick sidewalk litter sweep", "sidewalk", "small", 2800, "fixed", "flexible",
     40.7440, -73.9100, "Skillman Ave, Queens", None, None),
    # j7 is turned into an accepted job below, so the arrive / finish / payout flow can be tried as mk_jamal
    ("j7", "mk_cust_maria", "Clean up the corner by the bus stop (accepted)", "litter", "small", 6000, "fixed", "flexible",
     40.7282, -73.9442, "Manhattan Ave, Brooklyn", 80, None),
]

JOBS += [
    ("j8", "mk_cust_devon", "Bag the litter along the community garden fence (in progress)", "litter", "medium", 7500, "fixed", "flexible",
     40.7282, -73.9442, "Graham Ave, Brooklyn", 80, None),
    ("j9", "mk_cust_priya", "Weed and tidy the tree pit row (done, waiting on you)", "light_yard_work", "small", 5000, "fixed", "flexible",
     40.7282, -73.9442, "Lorimer St, Brooklyn", 60, None),
    ("j10", "mk_cust_maria", "Clear the loading dock lot (location mismatch)", "lot_cleanup", "medium", 14000, "fixed", "flexible",
     40.7484, -73.9857, "W 36th St, Manhattan", 70, None),
    ("j11", "mk_cust_devon", "Sweep the stoop and sidewalk (paid, reviewed)", "sidewalk", "small", 4000, "fixed", "flexible",
     40.7282, -73.9442, "Driggs Ave, Brooklyn", 50, None),
    ("j12", "mk_cust_priya", "Big weekend lot cleanup (price flagged as low)", "lot_cleanup", "large", 6000, "fixed", "flexible",
     40.7550, -73.9200, "Broadway, Queens", 120, None),
]

# job key -> sample site photos shown on the listing
LISTING_PHOTOS = {
    "j1": ["lot1", "lot2"],
    "j5": ["lot3", "lot4", "lot5"],
    "j12": ["lot6", "lot7"],
    "j7": ["street1"],
}


def photo_url(name: str) -> str:
    return f"https://picsum.photos/seed/frontline-{name}/640/480"


class MarketplaceSeeder(Seeder):
    """Local Hire page test data: fake customers, active cleaners and open jobs around NYC, plus one job in each stage of the take / arrive / finish / pay flow.
    All seeded logins use password 'password'. Params: remove (deletes everything this seeder created)."""

    default_params: dict = {}

    async def run(self, db: AsyncSession, params: dict) -> SeedResult:
        result = SeedResult()
        if params.get("remove"):
            await self._remove(db, result)
            await db.commit()
            return result

        for u in CUSTOMERS + CLEANERS:
            await self._add_user(db, result, u)
        for c in CLEANERS:
            await self._add_cleaner(db, result, c)
        for j in JOBS:
            await self._add_job(db, result, j)
        await self._add_flow_states(db, result)
        await db.commit()
        return result

    @staticmethod
    def _headers() -> dict:
        return {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Content-Type": "application/json",
        }

    async def _add_user(self, db: AsyncSession, result: SeedResult, u: dict) -> None:
        uid = _uid(u["key"])
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{settings.supabase_url}/auth/v1/admin/users",
                    headers=self._headers(),
                    json={
                        "id": uid,
                        "email": f"{u['username']}@example.com",
                        "password": "password",
                        "email_confirm": True,
                        "user_metadata": {"username": u["username"], "full_name": u["name"]},
                    },
                    timeout=15,
                )
            if resp.status_code not in (200, 201, 409, 422):
                result.errors.append(f"{u['username']} auth: HTTP {resp.status_code} {resp.text[:200]}")
                return
        except Exception as exc:
            result.errors.append(f"{u['username']} auth: {exc}")
            return
        await db.execute(
            text("""INSERT INTO profiles (id, username, display_name) VALUES (:id, :un, :n)
                    ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name"""),
            {"id": uid, "un": u["username"], "n": u["name"]},
        )
        result.inserted += 1

    @staticmethod
    async def _add_cleaner(db: AsyncSession, result: SeedResult, c: dict) -> None:
        res = await db.execute(
            text("""
                INSERT INTO cleaner_profiles (user_id, headline, bio, services, rate_type, rate_cents, service_radius_km,
                                              home_location, area_label, status, rating_avg, rating_count, jobs_completed)
                VALUES (:id, :h, :bio, :svc, :rt, :rc, :rad, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                        :area, 'active', :ra, :rn, :jc)
                ON CONFLICT (user_id) DO NOTHING
            """),
            {"id": _uid(c["key"]), "h": c["headline"], "bio": "Seeded test cleaner.", "svc": c["services"], "rt": c["rate_type"],
             "rc": c["rate_cents"], "rad": c["radius_km"], "lat": c["lat"], "lng": c["lng"], "area": c["area"],
             "ra": c["rating"], "rn": c["count"], "jc": c["done"]},
        )
        result.inserted += res.rowcount or 0

    @staticmethod
    async def _add_job(db: AsyncSession, result: SeedResult, j: tuple) -> None:
        key, cust, title, jtype, size, price, ptype, tmode, lat, lng, addr, radius, poly = j
        res = await db.execute(
            text("""
                INSERT INTO marketplace_jobs (id, customer_id, origin, title, description, job_type, size, hazards_ack, address_label,
                                              location, radius_m, area, time_mode, starts_at, window_start, window_end, flexible_days,
                                              expires_at, price_type, price_cents, status)
                VALUES (:id, :cust, 'board', :title, 'Seeded test job.', :jt, :size, true, :addr,
                        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :rad,
                        CASE WHEN CAST(:poly AS text) IS NULL THEN NULL ELSE ST_GeogFromText('SRID=4326;' || CAST(:poly AS text)) END,
                        :tm,
                        CASE WHEN :tm = 'specific' THEN now() + interval '3 days' END,
                        CASE WHEN :tm = 'window' THEN now() + interval '2 days' END,
                        CASE WHEN :tm = 'window' THEN now() + interval '6 days' END,
                        CASE WHEN :tm = 'flexible' THEN 14 END,
                        now() + interval '14 days', :pt, :price, 'open')
                ON CONFLICT (id) DO NOTHING
            """),
            {"id": _uid(f"job_{key}"), "cust": _uid(cust), "title": title, "jt": jtype, "size": size, "addr": addr, "lat": lat,
             "lng": lng, "rad": radius, "poly": poly, "tm": tmode, "pt": ptype, "price": price},
        )
        result.inserted += res.rowcount or 0

    @staticmethod
    async def _photo(db: AsyncSession, result: SeedResult, job: str, uploader: str, kind: str, name: str,
                     dist: int | None = None, lat: float | None = None, lng: float | None = None) -> None:
        res = await db.execute(
            text("""INSERT INTO marketplace_job_photos (job_id, uploader_id, kind, url, latitude, longitude, distance_m)
                    SELECT :j, :u, :k, :url, :lat, :lng, :d
                    WHERE NOT EXISTS (SELECT 1 FROM marketplace_job_photos WHERE job_id = :j AND kind = :k AND url = :url)"""),
            {"j": _uid(f"job_{job}"), "u": _uid(uploader), "k": kind, "url": photo_url(name), "lat": lat, "lng": lng, "d": dist},
        )
        result.inserted += res.rowcount or 0

    async def _add_flow_states(self, db: AsyncSession, result: SeedResult) -> None:
        jamal, sofia = "mk_clean_jamal", "mk_clean_sofia"
        for job, names in LISTING_PHOTOS.items():
            cust = next(j[1] for j in JOBS if j[0] == job)
            for n in names:
                await self._photo(db, result, job, cust, "listing", n)

        # Move jobs along the flow. Only jobs still open move, so reseeding never rewinds real activity.
        moves = [
            ("j7", jamal, "accepted", ""),
            ("j8", jamal, "in_progress", "started_at = now() - interval '40 minutes', check_in_distance_m = 22,"),
            ("j9", jamal, "completed",
             "started_at = now() - interval '3 hours', completed_at = now() - interval '20 minutes', "
             "check_in_distance_m = 14, finish_distance_m = 31,"),
            ("j10", sofia, "completed",
             "started_at = now() - interval '5 hours', completed_at = now() - interval '2 hours', "
             "check_in_distance_m = 12, finish_distance_m = 880, location_flagged = true,"),
            ("j11", jamal, "released",
             "started_at = now() - interval '4 days', completed_at = now() - interval '4 days' + interval '2 hours', "
             "check_in_distance_m = 9, finish_distance_m = 18, confirmed_at = now() - interval '3 days', released_at = now() - interval '3 days',"),
        ]
        for job, cleaner, status, extra in moves:
            hold = "released" if status == "released" else "held"
            extra_sql = ", " + extra.strip().rstrip(",") if extra else ""
            await db.execute(
                text(f"""UPDATE marketplace_jobs SET status = :st, cleaner_id = :c, hold_status = :h,
                           platform_fee_cents = round(price_cents * 0.10), accepted_at = now() - interval '1 day',
                           safety_ack_at = now() - interval '1 day'{extra_sql}
                         WHERE id = :j AND status = 'open'"""),
                {"st": status, "c": _uid(cleaner), "h": hold, "j": _uid(f"job_{job}")},
            )

        # Cleaner photos, each with where it was taken
        lat, lng = 40.7282, -73.9442
        await self._photo(db, result, "j8", jamal, "before", "before1", 22, lat, lng)
        await self._photo(db, result, "j9", jamal, "before", "before2", 14, lat, lng)
        await self._photo(db, result, "j9", jamal, "after", "after2", 31, lat, lng)
        await self._photo(db, result, "j10", sofia, "before", "before3", 12, 40.7484, -73.9857)
        await self._photo(db, result, "j10", sofia, "after", "after3", 880, 40.7561, -73.9760)
        await self._photo(db, result, "j11", jamal, "before", "before4", 9, lat, lng)
        await self._photo(db, result, "j11", jamal, "after", "after4", 18, lat, lng)

        await db.execute(
            text("""INSERT INTO marketplace_reviews (job_id, reviewer_id, reviewee_id, rating, comment) VALUES
                      (:j, :cu, :cl, 5, 'Showed up on time and the block looks great.'),
                      (:j, :cl, :cu, 5, 'Clear instructions and paid right away.')
                    ON CONFLICT (job_id, reviewer_id) DO NOTHING"""),
            {"j": _uid("job_j11"), "cu": _uid("mk_cust_devon"), "cl": _uid(jamal)},
        )

        # Price flags on j12 so the poster side shows the "too low" signal
        await db.execute(
            text("""INSERT INTO marketplace_price_flags (job_id, cleaner_id, suggested_price_cents, note) VALUES
                      (:j, :a, 12000, 'Two people needed for a lot this size.'),
                      (:j, :b, 10000, NULL)
                    ON CONFLICT (job_id, cleaner_id) DO NOTHING"""),
            {"j": _uid("job_j12"), "a": _uid(jamal), "b": _uid(sofia)},
        )

    async def _remove(self, db: AsyncSession, result: SeedResult) -> None:
        ids = [_uid(u["key"]) for u in CUSTOMERS + CLEANERS]
        arg = {"ids": ids}
        any_ids = "= ANY(CAST(:ids AS uuid[]))"
        await db.execute(text(f"DELETE FROM marketplace_reports WHERE reporter_id {any_ids} OR reported_user_id {any_ids}"), arg)
        jobs = await db.execute(text(f"DELETE FROM marketplace_jobs WHERE customer_id {any_ids}"), arg)
        await db.execute(text(f"DELETE FROM cleaner_profiles WHERE user_id {any_ids}"), arg)
        await db.execute(text(f"DELETE FROM user_notifications WHERE user_id {any_ids}"), arg)
        result.skipped = jobs.rowcount or 0
        try:
            async with httpx.AsyncClient() as client:
                for uid in ids:
                    await client.delete(f"{settings.supabase_url}/auth/v1/admin/users/{uid}", headers=self._headers(), timeout=15)
        except Exception as exc:
            result.errors.append(f"user removal: {exc}")
