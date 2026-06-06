"""
Demo data seeder: populates realistic activity for all 3 campaigns.
Idempotent via deterministic UUIDs — safe to re-run.
"""

import json
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

from .base import Seeder, SeedResult

DEMO_NS = uuid.UUID("12345678-1234-5678-1234-567812345678")

TRASH_WAR_ID = "00000000-0000-0000-0000-000000000001"
TOUCH_GRASS_ID = "00000000-0000-0000-0000-000000000002"
ROAD_ID = "00000000-0000-0000-0000-000000000003"
BRAINROT_ID = "00000000-0000-0000-0000-000000000004"


def _uid(key: str) -> str:
    return str(uuid.uuid5(DEMO_NS, key))


def _ts(days_back: float, hour: int = 12) -> datetime:
    """days_back=2 → 2 days ago; days_back=-7 → 7 days from now."""
    dt = datetime.now(timezone.utc) - timedelta(days=days_back)
    return dt.replace(hour=hour, minute=0, second=0, microsecond=0)


_USERS = [
    {"key": "marcus",  "username": "marcus_w",  "name": "Marcus Washington", "email": "marcus.demo@frontline.app"},
    {"key": "sarah",   "username": "sarah_k",   "name": "Sarah Kim",         "email": "sarah.demo@frontline.app"},
    {"key": "jordan",  "username": "jordan_r",  "name": "Jordan Rivera",     "email": "jordan.demo@frontline.app"},
    {"key": "priya",   "username": "priya_n",   "name": "Priya Nair",        "email": "priya.demo@frontline.app"},
    {"key": "tyler",   "username": "tyler_m",   "name": "Tyler Mitchell",    "email": "tyler.demo@frontline.app"},
    {"key": "maya",    "username": "maya_j",    "name": "Maya Johnson",      "email": "maya.demo@frontline.app"},
    {"key": "alex",    "username": "alex_c",    "name": "Alex Chen",         "email": "alex.demo@frontline.app"},
    {"key": "destiny", "username": "destiny_p", "name": "Destiny Parker",   "email": "destiny.demo@frontline.app"},
    {"key": "sam",     "username": "sam_o",     "name": "Sam O'Brien",      "email": "sam.demo@frontline.app"},
    {"key": "olivia",  "username": "olivia_t",  "name": "Olivia Torres",    "email": "olivia.demo@frontline.app"},
]

_GROUPS = [
    {"key": "ccc", "name": "Clean Cities Collective", "slug": "clean-cities-collective",
     "description": "Urban cleanup crews across America's largest cities.", "creator": "marcus"},
    {"key": "gcc", "name": "Gulf Coast Crew",          "slug": "gulf-coast-crew",
     "description": "Fighting coastal pollution from Texas to Florida.",     "creator": "jordan"},
    {"key": "ms",  "name": "Midwest Sweepers",         "slug": "midwest-sweepers",
     "description": "Keeping the heartland clean, one neighborhood at a time.", "creator": "tyler"},
    {"key": "tb",  "name": "Trail Blazers",            "slug": "trail-blazers",
     "description": "Outdoor adventurers logging nature photos from coast to coast.", "creator": "sarah"},
    {"key": "ivu", "name": "Independent Voters United","slug": "independent-voters-united",
     "description": "Registering as Independent to break the partisan gridlock.", "creator": "sam"},
    {"key": "ddc", "name": "Digital Detox Collective", "slug": "digital-detox-collective",
     "description": "Culling our feeds one unfollow at a time.", "creator": "priya"},
]

# (user_key, group_key, role)
_MEMBERSHIPS = [
    ("marcus",  "ccc", "admin"), ("priya",   "ccc", "member"),
    ("sam",     "ccc", "member"), ("alex",   "ccc", "member"),
    ("jordan",  "gcc", "admin"), ("destiny", "gcc", "member"),
    ("tyler",   "ms",  "admin"), ("maya",    "ms",  "member"),
    ("sarah",   "tb",  "admin"), ("olivia",  "tb",  "member"),
    ("sam",     "ivu", "admin"), ("tyler",   "ivu", "member"),
    ("priya",   "ivu", "member"), ("alex",   "ivu", "member"),
    ("destiny", "ivu", "member"),
    ("priya",   "ddc", "admin"), ("sam",     "ddc", "member"),
    ("maya",    "ddc", "member"), ("olivia",  "ddc", "member"),
    ("alex",    "ddc", "member"),
]

# (user_key, group_key_or_None, zip_code, lat, lng, bags, days_back, hour)
_TRASH = [
    # New York 10001
    ("priya",   "ccc",  "10001",  40.7484,  -73.9967,  8,  2.0,  9),
    ("priya",   "ccc",  "10001",  40.7484,  -73.9967,  5,  1.0, 14),
    ("sam",     "ccc",  "10001",  40.7484,  -73.9967,  3,  0.5, 10),
    # Chicago 60601
    ("marcus",  "ccc",  "60601",  41.8829,  -87.6236, 12,  3.0,  8),
    ("marcus",  "ccc",  "60601",  41.8829,  -87.6236,  7,  1.5, 16),
    ("tyler",   "ms",   "60601",  41.8829,  -87.6236,  4,  2.0, 11),
    # Los Angeles 90012
    ("alex",    "ccc",  "90012",  34.0584, -118.2427,  6,  5.0, 10),
    ("olivia",   None,  "90012",  34.0584, -118.2427,  4,  3.0, 15),
    # Houston 77002
    ("destiny", "gcc",  "77002",  29.7538,  -95.3678,  9,  4.0,  9),
    ("jordan",  "gcc",  "77002",  29.7538,  -95.3678, 11,  2.0, 13),
    # Atlanta 30303
    ("maya",    "ms",   "30303",  33.7536,  -84.3911,  7,  6.0,  8),
    ("marcus",   None,  "30303",  33.7536,  -84.3911,  3,  4.0, 11),
    # Seattle 98104
    ("sarah",   "tb",   "98104",  47.6005, -122.3342, 10,  7.0,  9),
    ("sam",     "ccc",  "98104",  47.6005, -122.3342,  5,  3.0, 14),
    # Phoenix 85003
    ("tyler",   "ms",   "85003",  33.4501, -112.0671,  8,  8.0, 10),
    ("alex",     None,  "85003",  33.4501, -112.0671,  6,  5.0, 16),
    # Denver 80203
    ("tyler",   "ms",   "80203",  39.7294, -104.9834, 14, 10.0,  8),
    ("maya",    "ms",   "80203",  39.7294, -104.9834,  9,  6.0, 15),
    # Miami 33132
    ("jordan",  "gcc",  "33132",  25.7743,  -80.1938, 15, 12.0,  9),
    ("destiny", "gcc",  "33132",  25.7743,  -80.1938,  6,  8.0, 14),
    # Philadelphia 19103
    ("sam",     "ccc",  "19103",  39.9498,  -75.1726, 11,  9.0, 10),
    ("priya",   "ccc",  "19103",  39.9498,  -75.1726,  4,  5.0, 11),
    # Dallas 75202
    ("destiny", "gcc",  "75202",  32.7747,  -96.7972,  8, 11.0,  8),
    ("marcus",   None,  "75202",  32.7747,  -96.7972,  5,  7.0, 13),
    # Portland 97204
    ("sarah",   "tb",   "97204",  45.5154, -122.6783,  9, 14.0,  9),
    ("olivia",  "tb",   "97204",  45.5154, -122.6783,  4, 10.0, 15),
    # Minneapolis 55403
    ("tyler",   "ms",   "55403",  44.9707,  -93.2855, 13, 15.0,  8),
    ("maya",    "ms",   "55403",  44.9707,  -93.2855,  8, 12.0, 14),
    # Boston 02108
    ("sam",     "ccc",  "02108",  42.3587,  -71.0647,  7, 16.0, 10),
    ("alex",    "ccc",  "02108",  42.3587,  -71.0647,  5, 13.0, 15),
    # San Francisco 94103
    ("alex",    "ccc",  "94103",  37.7727, -122.4099, 11, 18.0,  9),
    ("olivia",   None,  "94103",  37.7727, -122.4099,  6, 14.0, 16),
    # San Antonio 78205
    ("jordan",  "gcc",  "78205",  29.4241,  -98.4936,  9, 20.0,  8),
    ("destiny", "gcc",  "78205",  29.4241,  -98.4936,  7, 17.0, 13),
    # Detroit 48226
    ("marcus",  "ccc",  "48226",  42.3314,  -83.0457, 10, 22.0,  9),
]

# (user_key, group_key_or_None, lat, lng, photo_seed, days_back, hour, notes)
_GRASS = [
    ("sarah",  "tb",   40.7851,  -73.9683,  10,  1.0, 10, "Central Park — golden hour walk"),
    ("olivia", "tb",   37.7694, -122.4862,  20,  2.0, 11, "Golden Gate Park"),
    ("alex",    None,  41.8762,  -87.6197,  30,  1.5,  9, "Grant Park lunch break"),
    ("maya",   "ms",   33.7878,  -84.3741,  40,  3.0, 14, "Piedmont Park afternoon run"),
    ("sarah",  "tb",   45.5051, -122.6750,  50,  2.0,  8, "Forest Park morning hike"),
    ("tyler",  "ms",   40.3428, -105.6836,  60,  4.0,  7, "Rocky Mountain NP summit"),
    ("priya",   None,  42.3601,  -71.0589,  70,  1.0, 15, "Boston Common"),
    ("marcus",  None,  33.4484, -112.0740,  80,  5.0,  6, "South Mountain sunrise"),
    ("jordan",  None,  25.9312,  -80.1283,  90,  2.5,  9, "Oleta River State Park"),
    ("destiny", None,  29.7173,  -95.3904, 100,  3.0,  8, "Hermann Park"),
    ("olivia", "tb",   36.0544, -112.1401, 110,  7.0,  7, "Grand Canyon North Rim"),
    ("sarah",  "tb",   47.8021, -123.6044, 120,  8.0,  9, "Olympic NP — Hoh Rainforest"),
    ("tyler",   None,  35.6532,  -83.5070, 130,  6.0, 10, "Smokies on a clear day"),
    ("alex",   "ccc",  37.7755, -119.5383, 140,  9.0,  8, "Yosemite Valley"),
    ("sam",     None,  44.3386,  -68.2733, 150, 10.0, 11, "Acadia NP — Cadillac Mountain"),
    ("maya",    None,  25.2866,  -80.8987, 160,  4.0,  7, "Everglades kayak"),
    ("priya",   None,  48.1351,   11.5820, 170, 14.0, 14, "English Garden, Munich"),
    ("jordan",  None, -33.8688,  151.2093, 180, 20.0,  9, "Royal Botanic Garden, Sydney"),
    ("marcus",  None,  35.6762,  139.6503, 190, 25.0,  8, "Shinjuku Gyoen, Tokyo"),
    ("olivia", "tb",   44.9429, -123.0351, 200, 11.0,  9, "Silver Falls State Park"),
    ("sarah",  "tb",   63.3334, -150.5007, 210, 30.0, 11, "Denali — Reflection Pond"),
    ("tyler",  "ms",   43.0731,  -89.4012, 220,  5.0, 10, "UW Arboretum, Madison"),
    ("alex",    None,  39.7392, -104.9903, 230,  3.0, 16, "Washington Park"),
    ("sam",    "ccc",  38.5816, -121.4944, 240, 12.0,  8, "American River Parkway"),
    ("destiny", None,  32.7341, -117.1441, 250,  6.0,  9, "Balboa Park sunset"),
]

# (user_key, group_key, state_fips, lat, lng, registrations, days_back, hour)
_ROAD = [
    ("sam",    "ivu", "06",  38.5816, -121.4944, 5, 1.0, 10),
    ("priya",  "ivu", "06",  37.7749, -122.4194, 3, 2.0, 14),
    ("tyler",  "ivu", "06",  34.0522, -118.2437, 4, 3.0,  9),
    ("alex",   "ivu", "48",  30.2672,  -97.7431, 6, 1.0, 11),
    ("destiny","ivu", "48",  29.7604,  -95.3698, 4, 2.0, 14),
    ("sam",    "ivu", "48",  32.7767,  -96.7970, 3, 4.0,  9),
    ("priya",  "ivu", "12",  25.7617,  -80.1918, 5, 1.5, 10),
    ("tyler",  "ivu", "12",  28.5421,  -81.3790, 4, 3.0, 11),
    ("alex",   "ivu", "36",  40.7128,  -74.0060, 6, 1.0,  9),
    ("sam",    "ivu", "36",  42.6526,  -73.7562, 3, 2.0, 14),
    ("priya",  "ivu", "42",  39.9526,  -75.1652, 4, 2.5, 10),
    ("sam",    "ivu", "42",  40.4406,  -79.9959, 3, 4.0,  9),
    ("tyler",  "ivu", "39",  39.9612,  -82.9988, 5, 2.0, 11),
    ("alex",   "ivu", "39",  41.4995,  -81.6954, 3, 4.0, 14),
    ("sam",    "ivu", "17",  41.8781,  -87.6298, 4, 3.0,  9),
    ("priya",  "ivu", "17",  39.7817,  -89.6501, 3, 5.0, 11),
    ("destiny","ivu", "13",  33.7490,  -84.3880, 5, 2.0, 10),
    ("alex",   "ivu", "13",  31.5785,  -84.1557, 3, 3.0, 14),
    ("tyler",  "ivu", "37",  35.7796,  -78.6382, 4, 2.0,  9),
    ("sam",    "ivu", "37",  35.2271,  -80.8431, 3, 4.0, 11),
    ("priya",  "ivu", "26",  42.3314,  -83.0458, 4, 3.0, 10),
    ("alex",   "ivu", "26",  42.7335,  -84.5555, 3, 5.0, 14),
    ("sam",    "ivu", "34",  40.2171,  -74.7429, 4, 1.5,  9),
    ("tyler",  "ivu", "51",  37.5407,  -77.4360, 4, 2.0, 10),
    ("destiny","ivu", "51",  38.8976,  -77.0366, 3, 3.0, 14),
    ("alex",   "ivu", "53",  47.0379, -122.9007, 5, 1.0,  9),
    ("sam",    "ivu", "53",  47.6062, -122.3321, 3, 2.0, 11),
    ("priya",  "ivu", "04",  33.4484, -112.0740, 5, 2.0, 10),
    ("tyler",  "ivu", "08",  39.7392, -104.9903, 5, 1.0,  9),
    ("alex",   "ivu", "08",  40.0150, -105.2705, 3, 3.0, 11),
    ("sam",    "ivu", "27",  44.9537,  -93.0900, 4, 3.0, 10),
    ("destiny","ivu", "47",  36.1627,  -86.7816, 4, 4.0, 14),
    ("priya",  "ivu", "29",  38.5767,  -92.1735, 3, 5.0,  9),
    ("tyler",  "ivu", "55",  43.0731,  -89.4012, 4, 4.0, 10),
    ("alex",   "ivu", "41",  45.5051, -122.6750, 4, 2.0,  9),
    ("sam",    "ivu", "32",  39.1638, -119.7674, 3, 3.0, 11),
    ("priya",  "ivu", "49",  40.7608, -111.8910, 4, 2.0, 10),
    ("tyler",  "ivu", "18",  39.7684,  -86.1581, 3, 5.0, 14),
    ("destiny","ivu", "20",  39.0473,  -95.6752, 3, 6.0,  9),
    ("alex",   "ivu", "35",  35.6870, -105.9378, 4, 5.0, 10),
    ("sam",    "ivu", "19",  41.5868,  -93.6250, 3, 7.0, 11),
    ("priya",  "ivu", "40",  35.4676,  -97.5164, 3, 6.0,  9),
    ("tyler",  "ivu", "05",  34.7465,  -92.2896, 3, 8.0, 10),
    ("destiny","ivu", "28",  32.2988,  -90.1848, 3, 9.0, 14),
    ("alex",   "ivu", "01",  32.3617,  -86.2792, 3, 10.0, 9),
]


# (user_key, group_key_or_None, lat, lng, account_handle, days_back, hour)
_BRAINROT = [
    # @DailyRage — most unfollowed (5 times)
    ("sam",     "ddc",  40.7128,  -74.0060, "@DailyRage",      1.0, 10),
    ("tyler",    None,  41.8781,  -87.6298, "@DailyRage",      2.0, 14),
    ("destiny",  None,  38.8951,  -77.0369, "@DailyRage",      3.0, 10),
    ("priya",   "ddc",  39.7392, -104.9903, "@DailyRage",      5.0, 15),
    ("sam",      None,  35.6762,  139.6503, "@DailyRage",     12.0, 10),
    # @AngryPundit — 4 times
    ("sam",     "ddc",  42.3601,  -71.0589, "@AngryPundit",    2.0, 10),
    ("jordan",   None,  48.8566,    2.3522, "@AngryPundit",    8.0,  9),
    ("alex",     None,  35.2271,  -80.8431, "@AngryPundit",    4.0,  9),
    ("maya",     None,  44.9537,  -93.0900, "@AngryPundit",    5.0,  8),
    # @ViralSlop — 4 times
    ("priya",   "ddc",  37.7749, -122.4194, "@ViralSlop",      1.5,  9),
    ("sarah",    None,  45.5051, -122.6750, "@ViralSlop",      3.0,  9),
    ("olivia",  "ddc",  51.5074,   -0.1278, "@ViralSlop",      7.0, 14),
    ("marcus",   None, -23.5505,  -46.6333, "@ViralSlop",     14.0, 10),
    # @OutrageEngine — 3 times
    ("jordan",   None,  39.9526,  -75.1652, "@OutrageEngine",  2.5, 11),
    ("maya",    "ddc",  44.9537,  -93.0900, "@OutrageEngine",  5.0,  8),
    ("tyler",    None,  43.6532,  -79.3832, "@OutrageEngine",  9.0, 11),
    # @CloutChaser99 — 3 times
    ("alex",     None,  34.0522, -118.2437, "@CloutChaser99",  1.0, 11),
    ("tyler",    None,  30.2672,  -97.7431, "@CloutChaser99",  3.0, 12),
    ("sarah",    None,  52.5200,   13.4050, "@CloutChaser99", 10.0, 11),
    # @RageHour — 3 times
    ("marcus",   None,  29.7604,  -95.3698, "@RageHour",       3.0,  9),
    ("alex",     None,  32.7767,  -96.7970, "@RageHour",       6.0, 11),
    ("priya",    None, -33.8688,  151.2093, "@RageHour",      15.0,  9),
    # @ContentFarm42 — 2 times
    ("olivia",  "ddc",  25.7617,  -80.1918, "@ContentFarm42",  4.0,  8),
    ("destiny",  None,  19.4326,  -99.1332, "@ContentFarm42", 11.0,  8),
]


class DemoDataSeeder(Seeder):
    default_params: dict = {}

    async def run(self, db: AsyncSession, params: dict) -> SeedResult:
        result = SeedResult()

        # 1. Auth users (via Supabase admin API)
        user_ids = await self._create_auth_users(result)

        # 2. Profiles
        for u in _USERS:
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
                result.inserted += 1
            except Exception as exc:
                result.errors.append(f"profile {u['key']}: {exc}")

        # 3. Groups
        group_ids: dict[str, str] = {}
        for g in _GROUPS:
            gid = _uid(f"group_{g['key']}")
            group_ids[g["key"]] = gid
            creator_id = user_ids.get(g["creator"])
            try:
                await db.execute(
                    text("""
                        INSERT INTO groups (id, name, slug, description, created_by)
                        VALUES (:id, :name, :slug, :desc, :creator)
                        ON CONFLICT (slug) DO UPDATE SET
                            name = EXCLUDED.name, description = EXCLUDED.description
                    """),
                    {"id": gid, "name": g["name"], "slug": g["slug"],
                     "desc": g["description"], "creator": creator_id},
                )
                result.inserted += 1
            except Exception as exc:
                result.errors.append(f"group {g['key']}: {exc}")

        # 4. Memberships
        for user_key, group_key, role in _MEMBERSHIPS:
            uid = user_ids.get(user_key)
            gid = group_ids.get(group_key)
            if not uid or not gid:
                continue
            try:
                await db.execute(
                    text("""
                        INSERT INTO group_members (id, group_id, user_id, role)
                        VALUES (:id, :gid, :uid, :role)
                        ON CONFLICT (group_id, user_id) DO NOTHING
                    """),
                    {"id": _uid(f"mem_{user_key}_{group_key}"), "gid": gid, "uid": uid, "role": role},
                )
            except Exception as exc:
                result.errors.append(f"membership {user_key}/{group_key}: {exc}")

        # 5. Look up geo units
        zip_geos = await self._lookup_geo_units(db, "zip", [r[2] for r in _TRASH])
        state_geos = await self._lookup_geo_units(db, "state", [r[2] for r in _ROAD])

        # 6. Trash War contributions
        trash_claims: dict[str, dict] = {}
        for i, (ukey, gkey, zip_code, lat, lng, bags, d_back, hour) in enumerate(_TRASH):
            uid = user_ids.get(ukey)
            gid = group_ids.get(gkey) if gkey else None
            if not uid:
                continue
            geo_id = zip_geos.get(zip_code)
            ts = _ts(d_back, hour)
            try:
                await db.execute(
                    text("""
                        INSERT INTO contributions
                            (id, campaign_id, user_id, group_id, geo_unit_id,
                             contribution_type, value, location, location_verified, submitted_at)
                        VALUES
                            (:id, :cid, :uid, :gid, :geo_id,
                             'cleanup', :value,
                             ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                             :verified, :ts)
                        ON CONFLICT (id) DO NOTHING
                    """),
                    {"id": _uid(f"trash_{i}"), "cid": TRASH_WAR_ID, "uid": uid, "gid": gid,
                     "geo_id": geo_id, "value": bags, "lng": lng, "lat": lat,
                     "verified": geo_id is not None, "ts": ts},
                )
                result.inserted += 1
            except Exception as exc:
                result.errors.append(f"trash contrib {i}: {exc}")
                continue

            if geo_id:
                self._track_claim(trash_claims, geo_id, bags, uid, gid, d_back, ts)

        # 7. Touch Grass contributions
        for i, (ukey, gkey, lat, lng, photo_seed, d_back, hour, notes) in enumerate(_GRASS):
            uid = user_ids.get(ukey)
            gid = group_ids.get(gkey) if gkey else None
            if not uid:
                continue
            try:
                await db.execute(
                    text("""
                        INSERT INTO contributions
                            (id, campaign_id, user_id, group_id, contribution_type, value,
                             photo_url, location, location_verified, notes, submitted_at)
                        VALUES
                            (:id, :cid, :uid, :gid, 'photo', 1,
                             :photo_url,
                             ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                             TRUE, :notes, :ts)
                        ON CONFLICT (id) DO NOTHING
                    """),
                    {"id": _uid(f"grass_{i}"), "cid": TOUCH_GRASS_ID, "uid": uid, "gid": gid,
                     "photo_url": f"https://picsum.photos/seed/{photo_seed}/800/600",
                     "lng": lng, "lat": lat, "notes": notes, "ts": _ts(d_back, hour)},
                )
                result.inserted += 1
            except Exception as exc:
                result.errors.append(f"grass contrib {i}: {exc}")

        # 8. Road to Independence contributions
        road_claims: dict[str, dict] = {}
        for i, (ukey, gkey, fips, lat, lng, regs, d_back, hour) in enumerate(_ROAD):
            uid = user_ids.get(ukey)
            gid = group_ids.get(gkey) if gkey else None
            if not uid:
                continue
            geo_id = state_geos.get(fips)
            ts = _ts(d_back, hour)
            try:
                await db.execute(
                    text("""
                        INSERT INTO contributions
                            (id, campaign_id, user_id, group_id, geo_unit_id,
                             contribution_type, value, location, location_verified, submitted_at)
                        VALUES
                            (:id, :cid, :uid, :gid, :geo_id,
                             'civic_action', :value,
                             ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                             :verified, :ts)
                        ON CONFLICT (id) DO NOTHING
                    """),
                    {"id": _uid(f"road_{i}"), "cid": ROAD_ID, "uid": uid, "gid": gid,
                     "geo_id": geo_id, "value": regs, "lng": lng, "lat": lat,
                     "verified": geo_id is not None, "ts": ts},
                )
                result.inserted += 1
            except Exception as exc:
                result.errors.append(f"road contrib {i}: {exc}")
                continue

            if geo_id:
                self._track_claim(road_claims, geo_id, regs, uid, gid, d_back, ts)

        # 9. Territory claims
        for geo_id, claim in trash_claims.items():
            try:
                await db.execute(
                    text("""
                        INSERT INTO territory_claims
                            (campaign_id, geo_unit_id, claimed_by_user, claimed_by_group,
                             total_value, last_contribution_at)
                        VALUES (:cid, :geo_id, :uid, :gid, :val, :ts)
                        ON CONFLICT (campaign_id, geo_unit_id) DO UPDATE SET
                            total_value = EXCLUDED.total_value,
                            claimed_by_user = EXCLUDED.claimed_by_user,
                            claimed_by_group = EXCLUDED.claimed_by_group,
                            last_contribution_at = EXCLUDED.last_contribution_at,
                            updated_at = NOW()
                    """),
                    {"cid": TRASH_WAR_ID, "geo_id": geo_id, "uid": claim["uid"],
                     "gid": claim["gid"], "val": claim["total"], "ts": claim["ts"]},
                )
            except Exception as exc:
                result.errors.append(f"trash claim {geo_id}: {exc}")

        for geo_id, claim in road_claims.items():
            try:
                await db.execute(
                    text("""
                        INSERT INTO territory_claims
                            (campaign_id, geo_unit_id, claimed_by_user, claimed_by_group,
                             total_value, last_contribution_at)
                        VALUES (:cid, :geo_id, :uid, :gid, :val, :ts)
                        ON CONFLICT (campaign_id, geo_unit_id) DO UPDATE SET
                            total_value = EXCLUDED.total_value,
                            claimed_by_user = EXCLUDED.claimed_by_user,
                            claimed_by_group = EXCLUDED.claimed_by_group,
                            last_contribution_at = EXCLUDED.last_contribution_at,
                            updated_at = NOW()
                    """),
                    {"cid": ROAD_ID, "geo_id": geo_id, "uid": claim["uid"],
                     "gid": claim["gid"], "val": claim["total"], "ts": claim["ts"]},
                )
            except Exception as exc:
                result.errors.append(f"road claim {geo_id}: {exc}")

        # 9b. BRAINROT contributions (heatmap — account handle stored in notes)
        for i, (ukey, gkey, lat, lng, handle, d_back, hour) in enumerate(_BRAINROT):
            uid = user_ids.get(ukey)
            gid = group_ids.get(gkey) if gkey else None
            if not uid:
                continue
            try:
                await db.execute(
                    text("""
                        INSERT INTO contributions
                            (id, campaign_id, user_id, group_id, contribution_type, value,
                             location, location_verified, notes, submitted_at)
                        VALUES
                            (:id, :cid, :uid, :gid, 'unfollow', 1,
                             ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                             TRUE, :notes, :ts)
                        ON CONFLICT (id) DO NOTHING
                    """),
                    {"id": _uid(f"brainrot_{i}"), "cid": BRAINROT_ID, "uid": uid, "gid": gid,
                     "lng": lng, "lat": lat, "notes": handle, "ts": _ts(d_back, hour)},
                )
                result.inserted += 1
            except Exception as exc:
                result.errors.append(f"brainrot contrib {i}: {exc}")

        # 10. Campaign events
        chicago_geo = zip_geos.get("60601")
        houston_geo = zip_geos.get("77002")
        events = [
            {
                "id": _uid("event_boss_chicago"),
                "cid": TRASH_WAR_ID,
                "geo_id": chicago_geo,
                "etype": "boss_spawn",
                "title": "Boss Event: Downtown Chicago Hotspot",
                "desc": "A surge of illegal dumping near the Loop. Responders needed — every bag counts double.",
                "effect": json.dumps({"multiplier": 2.0, "duration_hours": 72}),
                "ends_at": _ts(-7, 12),
            },
            {
                "id": _uid("event_boss_houston"),
                "cid": TRASH_WAR_ID,
                "geo_id": houston_geo,
                "etype": "boss_spawn",
                "title": "Boss Event: Bayou City Cleanup",
                "desc": "Heavy rains pushed debris into Buffalo Bayou. Emergency cleanup needed now.",
                "effect": json.dumps({"multiplier": 1.5, "duration_hours": 48}),
                "ends_at": _ts(-5, 18),
            },
            {
                "id": _uid("event_road_surge"),
                "cid": ROAD_ID,
                "geo_id": None,
                "etype": "cascade_unlock",
                "title": "Independence Wave — 3 States Flipped",
                "desc": "Florida, Texas, and California have all crossed 10 independent registrations. The wave is building.",
                "effect": json.dumps({"bonus_registrations": 50}),
                "ends_at": _ts(-14, 12),
            },
        ]
        for ev in events:
            try:
                await db.execute(
                    text("""
                        INSERT INTO campaign_events
                            (id, campaign_id, geo_unit_id, event_type, title, description,
                             effect_config, ends_at)
                        VALUES
                            (:id, :cid, :geo_id, :etype, :title, :desc,
                             CAST(:effect AS jsonb), :ends_at)
                        ON CONFLICT (id) DO NOTHING
                    """),
                    ev,
                )
                result.inserted += 1
            except Exception as exc:
                result.errors.append(f"event {ev['id']}: {exc}")

        await db.commit()
        return result

    @staticmethod
    def _track_claim(
        claims: dict, geo_id: str, value: float,
        uid: str, gid: str | None, d_back: float, ts: str,
    ) -> None:
        if geo_id not in claims:
            claims[geo_id] = {"total": value, "uid": uid, "gid": gid, "d_back": d_back, "ts": ts}
        else:
            claims[geo_id]["total"] += value
            if d_back < claims[geo_id]["d_back"]:
                claims[geo_id].update(uid=uid, gid=gid, d_back=d_back, ts=ts)

    async def _create_auth_users(self, result: SeedResult) -> dict[str, str]:
        user_ids: dict[str, str] = {}
        async with httpx.AsyncClient() as client:
            for u in _USERS:
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
                            "password": "DemoUser2024!",
                            "email_confirm": True,
                            "user_metadata": {
                                "username": u["username"],
                                "full_name": u["name"],
                            },
                        },
                        timeout=15,
                    )
                    if resp.status_code in (200, 201):
                        user_ids[u["key"]] = uid
                        result.inserted += 1
                    elif resp.status_code in (409, 422):
                        user_ids[u["key"]] = uid
                        result.skipped += 1
                    else:
                        result.errors.append(f"auth user {u['key']}: HTTP {resp.status_code}")
                except Exception as exc:
                    result.errors.append(f"auth user {u['key']}: {exc}")
        return user_ids

    async def _lookup_geo_units(
        self, db: AsyncSession, unit_type: str, unit_ids: list[str]
    ) -> dict[str, str]:
        unique = list(set(unit_ids))
        if not unique:
            return {}
        rows = await db.execute(
            text("""
                SELECT unit_id, id::text
                FROM geo_units
                WHERE unit_type = :unit_type AND unit_id = ANY(:ids)
            """),
            {"unit_type": unit_type, "ids": unique},
        )
        return {row.unit_id: row.id for row in rows.fetchall()}
