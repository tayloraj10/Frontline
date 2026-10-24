"""Paid cleaner marketplace (dev-docs/paid-cleaner-marketplace-scoping-2026-10-22.md).

Two directions on one booking core: direct bookings to a listed cleaner, and open jobs on a
board where cleaners take jobs at the posted price. No money moves yet: hold_status, stripe_* columns and the
auto-release timestamp are tracked so Stripe Connect can be wired in later without a schema
change. Visibility (payments gate plus marketplace_enabled) is enforced by the Next.js proxy.

Job lifecycle:
  requested (direct) / open (board) -> accepted -> in_progress -> completed
    -> confirmed (customer) or released (auto, after release_after) ; or disputed / cancelled
    / declined / expired.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

MAX_LISTING_PHOTOS = 4
JOB_TYPES = ["litter", "lot_cleanup", "sidewalk", "light_yard_work"]
JobStatus = Literal[
    "requested", "open", "accepted", "in_progress", "completed",
    "confirmed", "released", "declined", "cancelled", "expired", "disputed", "refunded",
]


class MarketplaceError(Exception):
    """Raised for rule violations; the route maps status to an HTTP code."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


async def _setting(db: AsyncSession, key: str, default: float) -> float:
    row = (await db.execute(text("SELECT value FROM game_settings WHERE key = :k"), {"k": key})).first()
    return float(row[0]) if row else default


# ---------------------------------------------------------------- agreements


async def current_agreement(db: AsyncSession, kind: str) -> dict:
    row = (
        await db.execute(
            text("SELECT id, kind, version, title, body FROM marketplace_agreements WHERE kind = :k AND is_current"),
            {"k": kind},
        )
    ).mappings().first()
    if not row:
        raise MarketplaceError("No current agreement is published.", 404)
    return dict(row)


async def has_accepted_current(db: AsyncSession, user_id: UUID, kind: str) -> bool:
    row = (
        await db.execute(
            text(
                """SELECT 1 FROM marketplace_agreement_acceptances a
                   JOIN marketplace_agreements g ON g.id = a.agreement_id
                   WHERE a.user_id = :u AND g.kind = :k AND g.is_current"""
            ),
            {"u": user_id, "k": kind},
        )
    ).first()
    return row is not None


async def accept_agreement(
    db: AsyncSession, user_id: UUID, kind: str, legal_name: str, is_adult: bool, ip: str | None, app_version: str | None
) -> dict:
    legal_name = legal_name.strip()
    if len(legal_name) < 3 or " " not in legal_name:
        raise MarketplaceError("Type your full legal name to accept.")
    if kind == "cleaner" and not is_adult:
        raise MarketplaceError("You must confirm you are at least 18 to become a cleaner.")
    agreement = await current_agreement(db, kind)
    await db.execute(
        text(
            """INSERT INTO marketplace_agreement_acceptances
                 (user_id, agreement_id, legal_name, is_adult, ip_address, app_version)
               VALUES (:u, :a, :n, :adult, :ip, :v)
               ON CONFLICT (user_id, agreement_id) DO NOTHING"""
        ),
        {"u": user_id, "a": agreement["id"], "n": legal_name, "adult": is_adult, "ip": ip, "v": app_version},
    )
    await db.commit()
    return {"kind": kind, "version": agreement["version"], "accepted": True}


# ------------------------------------------------------------ cleaner profile


async def my_status(db: AsyncSession, user_id: UUID) -> dict:
    profile = (
        await db.execute(text("SELECT * FROM cleaner_profiles WHERE user_id = :u"), {"u": user_id})
    ).mappings().first()
    return {
        "cleaner_profile": _plain(profile) if profile else None,
        "cleaner_agreement_accepted": await has_accepted_current(db, user_id, "cleaner"),
        "customer_terms_accepted": await has_accepted_current(db, user_id, "customer"),
        "job_types": JOB_TYPES,
    }


async def upsert_cleaner_profile(
    db: AsyncSession,
    user_id: UUID,
    *,
    headline: str,
    bio: str,
    services: list[str],
    rate_type: str,
    rate_cents: int | None,
    service_radius_km: int,
    latitude: float | None,
    longitude: float | None,
    area_label: str | None,
) -> dict:
    bad = [s for s in services if s not in JOB_TYPES]
    if bad:
        raise MarketplaceError(f"Unsupported service types: {', '.join(bad)}.")
    if not await has_accepted_current(db, user_id, "cleaner"):
        raise MarketplaceError("Accept the cleaner agreement before creating a listing.", 403)
    await db.execute(
        text(
            """INSERT INTO cleaner_profiles
                 (user_id, headline, bio, services, rate_type, rate_cents, service_radius_km, home_location, area_label, status)
               VALUES (:u, :h, :b, :s, :rt, :rc, :rad,
                       CASE WHEN CAST(:lat AS float8) IS NULL THEN NULL
                            ELSE ST_SetSRID(ST_MakePoint(CAST(:lng AS float8), CAST(:lat AS float8)), 4326)::geography END,
                       :al, 'active')
               ON CONFLICT (user_id) DO UPDATE SET
                 headline = EXCLUDED.headline, bio = EXCLUDED.bio, services = EXCLUDED.services,
                 rate_type = EXCLUDED.rate_type, rate_cents = EXCLUDED.rate_cents,
                 service_radius_km = EXCLUDED.service_radius_km, home_location = EXCLUDED.home_location,
                 area_label = EXCLUDED.area_label"""
        ),
        {
            "u": user_id, "h": headline.strip(), "b": bio.strip(), "s": services, "rt": rate_type,
            "rc": rate_cents, "rad": service_radius_km, "lat": latitude, "lng": longitude, "al": area_label,
        },
    )
    await db.commit()
    return (await my_status(db, user_id))["cleaner_profile"]


async def set_cleaner_status(db: AsyncSession, user_id: UUID, status: str) -> None:
    """Admin approval: pending_review -> active, or suspend/pause."""
    if status not in ("active", "paused", "suspended", "pending_review"):
        raise MarketplaceError("Invalid status.")
    res = await db.execute(
        text("UPDATE cleaner_profiles SET status = :s WHERE user_id = :u"), {"s": status, "u": user_id}
    )
    if res.rowcount == 0:
        raise MarketplaceError("Cleaner profile not found.", 404)
    await db.commit()


async def list_cleaners(
    db: AsyncSession, *, service: str | None, latitude: float | None, longitude: float | None, limit: int = 50
) -> list[dict]:
    rows = (
        await db.execute(
            text(
                """SELECT c.user_id, p.username, p.avatar_url, c.headline, c.services, c.rate_type, c.rate_cents,
                          c.service_radius_km, c.area_label, c.rating_avg, c.rating_count, c.jobs_completed,
                          CASE WHEN CAST(:lat AS float8) IS NOT NULL AND c.home_location IS NOT NULL
                               THEN ST_Distance(c.home_location,
                                    ST_SetSRID(ST_MakePoint(CAST(:lng AS float8), CAST(:lat AS float8)), 4326)::geography) / 1000.0
                          END AS distance_km
                   FROM cleaner_profiles c JOIN profiles p ON p.id = c.user_id
                   WHERE c.status = 'active'
                     AND (CAST(:svc AS text) IS NULL OR CAST(:svc AS text) = ANY(c.services))
                   ORDER BY distance_km NULLS LAST, c.rating_avg DESC NULLS LAST
                   LIMIT :lim"""
            ),
            {"svc": service, "lat": latitude, "lng": longitude, "lim": limit},
        )
    ).mappings().all()
    return [_plain(r) for r in rows]


async def get_cleaner(db: AsyncSession, cleaner_id: UUID) -> dict:
    row = (
        await db.execute(
            text(
                """SELECT c.user_id, p.username, p.avatar_url, c.headline, c.bio, c.services, c.rate_type,
                          c.rate_cents, c.service_radius_km, c.area_label, c.rating_avg, c.rating_count, c.jobs_completed
                   FROM cleaner_profiles c JOIN profiles p ON p.id = c.user_id
                   WHERE c.user_id = :u AND c.status = 'active'"""
            ),
            {"u": cleaner_id},
        )
    ).mappings().first()
    if not row:
        raise MarketplaceError("Cleaner not found.", 404)
    reviews = (
        await db.execute(
            text(
                """SELECT r.rating, r.comment, r.created_at, p.username
                   FROM marketplace_reviews r JOIN profiles p ON p.id = r.reviewer_id
                   WHERE r.reviewee_id = :u AND NOT r.removed ORDER BY r.created_at DESC LIMIT 20"""
            ),
            {"u": cleaner_id},
        )
    ).mappings().all()
    out = _plain(row)
    out["reviews"] = [_plain(r) for r in reviews]
    return out


# ----------------------------------------------------------------------- jobs


async def create_job(
    db: AsyncSession,
    customer_id: UUID,
    *,
    cleaner_id: UUID | None,
    title: str,
    description: str,
    job_type: str,
    size: str | None,
    hazards_ack: bool,
    address_label: str | None,
    latitude: float | None,
    longitude: float | None,
    time_mode: str,
    starts_at: datetime | None,
    window_start: datetime | None,
    window_end: datetime | None,
    flexible_days: int | None,
    price_type: str,
    price_cents: int,
    radius_m: int | None = None,
    polygon: list[list[float]] | None = None,
    photos: list[str] | None = None,
) -> dict:
    if job_type not in JOB_TYPES:
        raise MarketplaceError("That job type is not available yet.")
    if not hazards_ack:
        raise MarketplaceError("Confirm there are no hazardous materials or unsafe conditions at the site.")
    if not await has_accepted_current(db, customer_id, "customer"):
        raise MarketplaceError("Accept the customer terms before posting a job.", 403)
    if cleaner_id is not None:
        if cleaner_id == customer_id:
            raise MarketplaceError("You cannot book yourself.")
        ok = (
            await db.execute(
                text("SELECT 1 FROM cleaner_profiles WHERE user_id = :u AND status = 'active'"), {"u": cleaner_id}
            )
        ).first()
        if not ok:
            raise MarketplaceError("That cleaner is not available.", 404)
        if await _blocked(db, customer_id, cleaner_id):
            raise MarketplaceError("That cleaner is not available.", 404)

    wkt: str | None = None
    if polygon:
        if len(polygon) < 3 or any(len(v) != 2 for v in polygon):
            raise MarketplaceError("Draw an area with at least 3 points.")
        ring = [*polygon, polygon[0]] if polygon[0] != polygon[-1] else polygon
        wkt = "POLYGON((" + ",".join(f"{float(v[0])} {float(v[1])}" for v in ring) + "))"
        latitude = longitude = None  # the centroid is computed in SQL below
    elif latitude is None or longitude is None:
        raise MarketplaceError("Pick where the job is: search an address, drop a pin, or draw the area.")

    now = datetime.now(timezone.utc)
    expires_at: datetime | None = None
    if time_mode == "specific":
        if not starts_at or starts_at <= now:
            raise MarketplaceError("Pick a start time in the future.")
        expires_at = starts_at
    elif time_mode == "window":
        if not window_start or not window_end or window_end < window_start or window_end <= now:
            raise MarketplaceError("Pick a valid window in the future.")
        expires_at = window_end
    elif time_mode == "flexible":
        cap = int(await _setting(db, "marketplace_flexible_max_days", 14))
        if not flexible_days or flexible_days < 1:
            raise MarketplaceError("Pick how many days the job can wait.")
        flexible_days = min(flexible_days, cap)
        expires_at = now + timedelta(days=flexible_days)
    else:
        raise MarketplaceError("Invalid time option.")

    fee_pct = await _setting(db, "marketplace_platform_fee_percent", 10)
    fee_cents = int(round(price_cents * fee_pct / 100))
    origin = "direct" if cleaner_id else "board"
    status = "requested" if cleaner_id else "open"

    row = (
        await db.execute(
            text(
                """INSERT INTO marketplace_jobs
                     (customer_id, cleaner_id, origin, title, description, job_type, size, hazards_ack, address_label,
                      location, radius_m, area, time_mode, starts_at, window_start, window_end, flexible_days, expires_at,
                      price_type, price_cents, platform_fee_cents, status)
                   VALUES (:cu, :cl, :o, :t, :d, :jt, :sz, true, :al,
                           CASE WHEN CAST(:wkt AS text) IS NOT NULL
                                  THEN ST_Centroid(ST_GeogFromText('SRID=4326;' || CAST(:wkt AS text))::geometry)::geography
                                WHEN CAST(:lat AS float8) IS NULL THEN NULL
                                ELSE ST_SetSRID(ST_MakePoint(CAST(:lng AS float8), CAST(:lat AS float8)), 4326)::geography END,
                           :rm, CASE WHEN CAST(:wkt AS text) IS NULL THEN NULL
                                     ELSE ST_GeogFromText('SRID=4326;' || CAST(:wkt AS text)) END,
                           :tm, :ss, :ws, :we, :fd, :ex, :pt, :pc, :fee, :st)
                   RETURNING id"""
            ),
            {
                "cu": customer_id, "cl": cleaner_id, "o": origin, "t": title.strip(), "d": description.strip(),
                "jt": job_type, "sz": size, "al": address_label, "lat": latitude, "lng": longitude, "rm": radius_m, "wkt": wkt, "tm": time_mode,
                "ss": starts_at, "ws": window_start, "we": window_end, "fd": flexible_days, "ex": expires_at,
                "pt": price_type, "pc": price_cents, "fee": fee_cents, "st": status,
            },
        )
    ).first()
    for url in (photos or [])[:MAX_LISTING_PHOTOS]:
        await db.execute(
            text("INSERT INTO marketplace_job_photos (job_id, uploader_id, kind, url) VALUES (:j, :u, 'listing', :url)"),
            {"j": row[0], "u": customer_id, "url": url},
        )
    await db.commit()
    if origin == "board":
        try:
            await _notify_nearby_cleaners(db, row[0])
        except Exception:
            logger.exception("marketplace: nearby-cleaner notification failed for job %s", row[0])
    return await get_job(db, row[0], customer_id)


_JOB_COLS = """j.id, j.customer_id, j.cleaner_id, j.origin, j.title, j.description, j.job_type, j.size,
  j.address_label, j.time_mode, j.starts_at, j.window_start, j.window_end, j.flexible_days, j.scheduled_at,
  j.expires_at, j.price_type, j.price_cents, j.platform_fee_cents, j.status, j.hold_status, j.cancel_reason,
  j.accepted_at, j.started_at, j.completed_at, j.confirmed_at, j.release_after, j.created_at,
  cu.username AS customer_username, cl.username AS cleaner_username,
  j.radius_m, j.check_in_distance_m, j.finish_distance_m, j.location_flagged,
  CASE WHEN j.area IS NULL THEN NULL ELSE ST_AsGeoJSON(j.area::geometry)::json END AS area"""


async def get_job(db: AsyncSession, job_id: UUID, viewer_id: UUID, *, is_admin: bool = False) -> dict:
    row = (
        await db.execute(
            text(
                f"""SELECT {_JOB_COLS},
                           ST_Y(j.location::geometry) AS latitude, ST_X(j.location::geometry) AS longitude
                    FROM marketplace_jobs j
                    JOIN profiles cu ON cu.id = j.customer_id
                    LEFT JOIN profiles cl ON cl.id = j.cleaner_id
                    WHERE j.id = :id"""
            ),
            {"id": job_id},
        )
    ).mappings().first()
    if not row:
        raise MarketplaceError("Job not found.", 404)
    job = _plain(row)
    participant = viewer_id in (row["customer_id"], row["cleaner_id"])
    is_open_board = row["status"] == "open"
    if not (participant or is_admin or is_open_board):
        raise MarketplaceError("Job not found.", 404)
    # Exact address and coordinates stay private until a cleaner is assigned.
    if not (participant or is_admin):
        job["address_label"] = None
        job["latitude"] = None
        job["longitude"] = None
    job["viewer_role"] = (
        "customer" if viewer_id == row["customer_id"] else "cleaner" if viewer_id == row["cleaner_id"] else "viewer"
    )
    job["cleaner_payout_cents"] = row["price_cents"] - (row["platform_fee_cents"] or 0)
    flags = (
        await db.execute(
            text(
                """SELECT cleaner_id, suggested_price_cents, note FROM marketplace_price_flags
                   WHERE job_id = :id ORDER BY created_at"""
            ),
            {"id": job_id},
        )
    ).all()
    job["price_flag_count"] = len(flags) if viewer_id == row["customer_id"] or is_admin else 0
    job["price_flagged_by_me"] = any(f[0] == viewer_id for f in flags)
    if viewer_id == row["customer_id"]:
        sug = [f[1] for f in flags if f[1]]
        job["price_suggested_cents"] = max(sug) if sug else None
        job["price_flag_notes"] = [f[2] for f in flags if f[2]]
    job["listing_photos"] = [
        r[0]
        for r in (
            await db.execute(
                text("SELECT url FROM marketplace_job_photos WHERE job_id = :id AND kind = 'listing' ORDER BY created_at"),
                {"id": job_id},
            )
        ).all()
    ]
    return job


async def list_my_jobs(db: AsyncSession, user_id: UUID, role: Literal["customer", "cleaner"]) -> list[dict]:
    col = "customer_id" if role == "customer" else "cleaner_id"
    rows = (
        await db.execute(
            text(
                f"""SELECT {_JOB_COLS}
                    FROM marketplace_jobs j
                    JOIN profiles cu ON cu.id = j.customer_id
                    LEFT JOIN profiles cl ON cl.id = j.cleaner_id
                    WHERE j.{col} = :u ORDER BY j.created_at DESC LIMIT 100"""
            ),
            {"u": user_id},
        )
    ).mappings().all()
    return [_plain(r) for r in rows]


async def list_board(
    db: AsyncSession, user_id: UUID, *, time_mode: str | None, latitude: float | None, longitude: float | None
) -> list[dict]:
    await expire_stale_jobs(db)
    rows = (
        await db.execute(
            text(
                f"""SELECT {_JOB_COLS},
                           ROUND(ST_Y(j.location::geometry)::numeric, 3)::float8 AS latitude,
                           ROUND(ST_X(j.location::geometry)::numeric, 3)::float8 AS longitude,
                           CASE WHEN CAST(:lat AS float8) IS NOT NULL AND j.location IS NOT NULL
                                THEN ST_Distance(j.location,
                                     ST_SetSRID(ST_MakePoint(CAST(:lng AS float8), CAST(:lat AS float8)), 4326)::geography) / 1000.0
                           END AS distance_km
                    FROM marketplace_jobs j
                    JOIN profiles cu ON cu.id = j.customer_id
                    LEFT JOIN profiles cl ON cl.id = j.cleaner_id
                    WHERE j.status = 'open' AND j.customer_id <> :u
                      AND (CAST(:tm AS text) IS NULL OR j.time_mode = CAST(:tm AS text))
                      AND NOT EXISTS (SELECT 1 FROM marketplace_blocks b
                                      WHERE (b.blocker_id = :u AND b.blocked_id = j.customer_id)
                                         OR (b.blocker_id = j.customer_id AND b.blocked_id = :u))
                    ORDER BY distance_km NULLS LAST, j.created_at DESC LIMIT 100"""
            ),
            {"u": user_id, "tm": time_mode, "lat": latitude, "lng": longitude},
        )
    ).mappings().all()
    return [_plain(r) for r in rows]


async def expire_stale_jobs(db: AsyncSession) -> int:
    """Expire unclaimed jobs past their deadline and auto-release completed ones past the review window."""
    res = await db.execute(
        text(
            """UPDATE marketplace_jobs SET status = 'expired'
               WHERE status IN ('open', 'requested') AND expires_at IS NOT NULL AND expires_at < now()"""
        )
    )
    rel = await db.execute(
        text(
            """UPDATE marketplace_jobs SET status = 'released', hold_status = 'released', released_at = now()
               WHERE status = 'completed' AND release_after IS NOT NULL AND release_after < now()
               RETURNING id, cleaner_id, title"""
        )
    )
    released = rel.all()
    await db.commit()
    for jid, cid, title in released:
        await _bump_cleaner_jobs(db, cid)
        await db.commit()
        await _notify_safe(
            db, cid, "marketplace_job_paid", "Payment released",
            f"\"{title}\" was released automatically. Your payout is on its way.", f"/marketplace/jobs/{jid}", "View job",
        )
    return (res.rowcount or 0) + len(released)


async def _load_for_update(db: AsyncSession, job_id: UUID) -> dict:
    row = (
        await db.execute(text("SELECT * FROM marketplace_jobs WHERE id = :id FOR UPDATE"), {"id": job_id})
    ).mappings().first()
    if not row:
        raise MarketplaceError("Job not found.", 404)
    return dict(row)


async def _require_cleaner_ready(db: AsyncSession, user_id: UUID) -> None:
    if not await has_accepted_current(db, user_id, "cleaner"):
        raise MarketplaceError("Accept the current cleaner agreement before taking jobs.", 403)
    ok = (
        await db.execute(
            text("SELECT 1 FROM cleaner_profiles WHERE user_id = :u AND status = 'active'"), {"u": user_id}
        )
    ).first()
    if not ok:
        raise MarketplaceError("Your cleaner profile is not active yet.", 403)


async def accept_direct_job(db: AsyncSession, job_id: UUID, cleaner_id: UUID, safety_ack: bool) -> dict:
    job = await _load_for_update(db, job_id)
    if job["origin"] != "direct" or job["cleaner_id"] != cleaner_id or job["status"] != "requested":
        raise MarketplaceError("This request cannot be accepted.", 409)
    if not safety_ack:
        raise MarketplaceError("Confirm you checked the site and can do this safely.")
    await _require_cleaner_ready(db, cleaner_id)
    await db.execute(
        text(
            """UPDATE marketplace_jobs SET status = 'accepted', accepted_at = now(), safety_ack_at = now(),
                 hold_status = 'held' WHERE id = :id"""
        ),
        {"id": job_id},
    )
    await db.commit()
    return await get_job(db, job_id, cleaner_id)


async def decline_direct_job(db: AsyncSession, job_id: UUID, cleaner_id: UUID) -> dict:
    job = await _load_for_update(db, job_id)
    if job["cleaner_id"] != cleaner_id or job["status"] != "requested":
        raise MarketplaceError("This request cannot be declined.", 409)
    await db.execute(text("UPDATE marketplace_jobs SET status = 'declined' WHERE id = :id"), {"id": job_id})
    await db.commit()
    return await get_job(db, job_id, cleaner_id)


async def take_job(db: AsyncSession, job_id: UUID, cleaner_id: UUID, safety_ack: bool) -> dict:
    """A ready cleaner takes an open job at the posted price. First one in wins (row lock)."""
    job = await _load_for_update(db, job_id)
    if job["status"] != "open":
        raise MarketplaceError("This job is no longer open.", 409)
    if job["customer_id"] == cleaner_id:
        raise MarketplaceError("You cannot take your own job.")
    if await _blocked(db, cleaner_id, job["customer_id"]):
        raise MarketplaceError("Job not found.", 404)
    if not safety_ack:
        raise MarketplaceError("Confirm you checked the site and can do this safely.")
    await _require_cleaner_ready(db, cleaner_id)
    fee_pct = await _setting(db, "marketplace_platform_fee_percent", 10)
    fee = int(round(job["price_cents"] * fee_pct / 100))
    await db.execute(
        text(
            """UPDATE marketplace_jobs SET status = 'accepted', cleaner_id = :c, platform_fee_cents = :f,
                 accepted_at = now(), safety_ack_at = now(), hold_status = 'held' WHERE id = :j"""
        ),
        {"c": cleaner_id, "f": fee, "j": job_id},
    )
    await db.commit()
    await _notify_safe(
        db, job["customer_id"], "marketplace_job_taken", "A cleaner took your job",
        f"\"{job['title']}\" was taken at your price of ${job['price_cents'] / 100:,.0f}. Open it to see who is coming.",
        f"/marketplace/jobs/{job_id}", "View job",
    )
    return await get_job(db, job_id, cleaner_id)


async def flag_price(db: AsyncSession, job_id: UUID, cleaner_id: UUID, suggested_cents: int | None, note: str | None) -> dict:
    """A cleaner says the posted price is too low. The poster is told once, then sees a running count."""
    job = await _load_for_update(db, job_id)
    if job["status"] != "open":
        raise MarketplaceError("This job is no longer open.", 409)
    if job["customer_id"] == cleaner_id:
        raise MarketplaceError("You cannot flag your own job.")
    if await _blocked(db, cleaner_id, job["customer_id"]):
        raise MarketplaceError("Job not found.", 404)
    await _require_cleaner_ready(db, cleaner_id)
    await db.execute(
        text(
            """INSERT INTO marketplace_price_flags (job_id, cleaner_id, suggested_price_cents, note)
               VALUES (:j, :c, :s, :n)
               ON CONFLICT (job_id, cleaner_id) DO UPDATE SET suggested_price_cents = EXCLUDED.suggested_price_cents,
                 note = EXCLUDED.note"""
        ),
        {"j": job_id, "c": cleaner_id, "s": suggested_cents, "n": note},
    )
    count = (
        await db.execute(text("SELECT count(*) FROM marketplace_price_flags WHERE job_id = :j"), {"j": job_id})
    ).scalar_one()
    await db.commit()
    if count == 1:
        await _notify_safe(
            db, job["customer_id"], "marketplace_price_flag", "A cleaner says your price is low",
            f"\"{job['title']}\" has not been taken yet. A nearby cleaner flagged the price as too low. Raising it may get it picked up.",
            f"/marketplace/jobs/{job_id}", "Review price",
        )
    return {"ok": True, "flags": count}


async def update_price(db: AsyncSession, job_id: UUID, customer_id: UUID, price_cents: int) -> dict:
    """The poster changes the price of an open job. Existing flags are cleared so the count starts fresh."""
    job = await _load_for_update(db, job_id)
    if job["customer_id"] != customer_id:
        raise MarketplaceError("Job not found.", 404)
    if job["status"] != "open":
        raise MarketplaceError("The price can only change while the job is open.", 409)
    await db.execute(text("UPDATE marketplace_jobs SET price_cents = :p WHERE id = :j"), {"p": price_cents, "j": job_id})
    await db.execute(text("DELETE FROM marketplace_price_flags WHERE job_id = :j"), {"j": job_id})
    await db.commit()
    return await get_job(db, job_id, customer_id)


async def cancel_job(db: AsyncSession, job_id: UUID, user_id: UUID, reason: str | None) -> dict:
    job = await _load_for_update(db, job_id)
    if user_id not in (job["customer_id"], job["cleaner_id"]):
        raise MarketplaceError("Job not found.", 404)
    if job["status"] not in ("requested", "open", "accepted"):
        raise MarketplaceError("This job can no longer be cancelled.", 409)
    refunded = job["hold_status"] == "held"
    await db.execute(
        text(
            """UPDATE marketplace_jobs SET status = 'cancelled', cancelled_by = :u, cancel_reason = :r,
                 hold_status = CASE WHEN hold_status = 'held' THEN 'refunded' ELSE hold_status END WHERE id = :id"""
        ),
        {"u": user_id, "r": reason, "id": job_id},
    )
    await db.commit()
    out = await get_job(db, job_id, user_id)
    out["refunded"] = refunded
    return out


async def _transition(
    db: AsyncSession, job_id: UUID, user_id: UUID, *, role: str, from_status: str, set_sql: str, message: str
) -> dict:
    job = await _load_for_update(db, job_id)
    owner = job["cleaner_id"] if role == "cleaner" else job["customer_id"]
    if owner != user_id:
        raise MarketplaceError("Job not found.", 404)
    if job["status"] != from_status:
        raise MarketplaceError(message, 409)
    await db.execute(text(f"UPDATE marketplace_jobs SET {set_sql} WHERE id = :id"), {"id": job_id})
    await db.commit()
    return await get_job(db, job_id, user_id)


async def _site_distance(db: AsyncSession, job_id: UUID, lat: float, lng: float) -> int:
    """Meters outside the job site: 0 anywhere inside the drawn area or the pin's radius."""
    d = (
        await db.execute(
            text(
                """SELECT GREATEST(
                          ST_Distance(COALESCE(area, location), ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography)
                            - CASE WHEN area IS NULL THEN COALESCE(radius_m, 0) ELSE 0 END, 0)
                   FROM marketplace_jobs WHERE id = :id"""
            ),
            {"id": job_id, "lat": lat, "lng": lng},
        )
    ).scalar_one()
    return int(round(d))


async def _check_on_site(
    db: AsyncSession, job_id: UUID, lat: float | None, lng: float | None, override: bool, what: str
) -> tuple[int | None, bool]:
    """Returns (distance_m, flagged). Raises when the cleaner is too far away and has not used the override."""
    allowed = int(await _setting(db, "marketplace_site_radius_m", 150))
    if lat is None or lng is None:
        if not override:
            raise MarketplaceError(f"We need your location to {what}. Allow location access and try again.")
        return None, True
    dist = await _site_distance(db, job_id, lat, lng)
    if dist <= allowed:
        return dist, False
    if not override:
        raise MarketplaceError(
            f"You are about {dist} m from the job site. Get to the site to {what}, or use 'My location is wrong' if this is a mistake."
        )
    return dist, True


async def start_job(
    db: AsyncSession, job_id: UUID, cleaner_id: UUID, *, latitude: float | None = None, longitude: float | None = None,
    override: bool = False,
) -> dict:
    job = await _load_for_update(db, job_id)
    if job["cleaner_id"] != cleaner_id:
        raise MarketplaceError("Job not found.", 404)
    if job["status"] != "accepted":
        raise MarketplaceError("This job has not been accepted yet.", 409)
    before = (
        await db.execute(
            text("SELECT count(*) FROM marketplace_job_photos WHERE job_id = :id AND kind = 'before'"), {"id": job_id}
        )
    ).scalar_one()
    if before < 1:
        raise MarketplaceError("Take a before photo of the site first.")
    dist, flagged = await _check_on_site(db, job_id, latitude, longitude, override, "start")
    await db.execute(
        text(
            """UPDATE marketplace_jobs SET status = 'in_progress', started_at = now(), check_in_distance_m = :d,
                 location_flagged = location_flagged OR :f WHERE id = :id"""
        ),
        {"d": dist, "f": flagged, "id": job_id},
    )
    await db.commit()
    await _notify_safe(
        db, job["customer_id"], "marketplace_job_started", "Your cleaner has started",
        f"Work has started on \"{job['title']}\". You will be told when it is done.", f"/marketplace/jobs/{job_id}", "View job",
    )
    return await get_job(db, job_id, cleaner_id)


async def complete_job(
    db: AsyncSession, job_id: UUID, cleaner_id: UUID, *, latitude: float | None = None, longitude: float | None = None,
    override: bool = False,
) -> dict:
    days = int(await _setting(db, "marketplace_auto_release_days", 3))
    job = await _load_for_update(db, job_id)
    if job["cleaner_id"] != cleaner_id:
        raise MarketplaceError("Job not found.", 404)
    if job["status"] != "in_progress":
        raise MarketplaceError("Start the job before marking it complete.", 409)
    photos = (
        await db.execute(
            text("SELECT count(*) FROM marketplace_job_photos WHERE job_id = :id AND kind = 'after'"), {"id": job_id}
        )
    ).scalar_one()
    if photos < 1:
        raise MarketplaceError("Add at least one after photo before marking the job complete.")
    dist, flagged = await _check_on_site(db, job_id, latitude, longitude, override, "finish")
    await db.execute(
        text(
            """UPDATE marketplace_jobs SET status = 'completed', completed_at = now(), finish_distance_m = :d,
                 location_flagged = location_flagged OR :f,
                 release_after = now() + make_interval(days => :days) WHERE id = :id"""
        ),
        {"days": days, "d": dist, "f": flagged, "id": job_id},
    )
    await db.commit()
    await _notify_safe(
        db, job["customer_id"], "marketplace_job_completed", "Your job is done: please confirm",
        f"\"{job['title']}\" is finished. Check the photos, then confirm to release payment. It releases on its own in {days} days if you do nothing.",
        f"/marketplace/jobs/{job_id}", "Review and confirm",
    )
    return await get_job(db, job_id, cleaner_id)


async def confirm_job(db: AsyncSession, job_id: UUID, customer_id: UUID) -> dict:
    job = await _load_for_update(db, job_id)
    if job["customer_id"] != customer_id:
        raise MarketplaceError("Job not found.", 404)
    if job["status"] != "completed":
        raise MarketplaceError("The cleaner has not marked this job complete.", 409)
    await db.execute(
        text(
            """UPDATE marketplace_jobs SET status = 'confirmed', confirmed_at = now(),
                 hold_status = 'released', released_at = now() WHERE id = :id"""
        ),
        {"id": job_id},
    )
    await _bump_cleaner_jobs(db, job["cleaner_id"])
    await db.commit()
    await _notify_safe(
        db, job["cleaner_id"], "marketplace_job_paid", "Payment released",
        f"The customer confirmed \"{job['title']}\". Your payout is on its way.", f"/marketplace/jobs/{job_id}", "View job",
    )
    return await get_job(db, job_id, customer_id)


async def _bump_cleaner_jobs(db: AsyncSession, cleaner_id: UUID) -> None:
    await db.execute(
        text("UPDATE cleaner_profiles SET jobs_completed = jobs_completed + 1 WHERE user_id = :u"), {"u": cleaner_id}
    )


async def dispute_job(db: AsyncSession, job_id: UUID, user_id: UUID, details: str) -> dict:
    job = await _load_for_update(db, job_id)
    if user_id not in (job["customer_id"], job["cleaner_id"]):
        raise MarketplaceError("Job not found.", 404)
    if job["status"] not in ("accepted", "in_progress", "completed"):
        raise MarketplaceError("This job cannot be disputed now.", 409)
    other = job["cleaner_id"] if user_id == job["customer_id"] else job["customer_id"]
    await db.execute(
        text("UPDATE marketplace_jobs SET status = 'disputed', release_after = NULL WHERE id = :id"), {"id": job_id}
    )
    await db.execute(
        text(
            """INSERT INTO marketplace_reports (reporter_id, job_id, reported_user_id, kind, details)
               VALUES (:r, :j, :o, 'dispute', :d)"""
        ),
        {"r": user_id, "j": job_id, "o": other, "d": details},
    )
    await db.commit()
    return await get_job(db, job_id, user_id)


# ---------------------------------------------------------- messages, photos


async def _participant_job(db: AsyncSession, job_id: UUID, user_id: UUID) -> dict:
    row = (
        await db.execute(
            text("SELECT id, customer_id, cleaner_id, status FROM marketplace_jobs WHERE id = :id"), {"id": job_id}
        )
    ).mappings().first()
    if not row or user_id not in (row["customer_id"], row["cleaner_id"]):
        raise MarketplaceError("Job not found.", 404)
    return dict(row)


async def list_messages(db: AsyncSession, job_id: UUID, user_id: UUID) -> list[dict]:
    await _participant_job(db, job_id, user_id)
    rows = (
        await db.execute(
            text(
                """SELECT m.id, m.sender_id, p.username, m.body, m.created_at FROM marketplace_messages m
                   JOIN profiles p ON p.id = m.sender_id WHERE m.job_id = :j ORDER BY m.created_at"""
            ),
            {"j": job_id},
        )
    ).mappings().all()
    return [_plain(r) for r in rows]


async def post_message(db: AsyncSession, job_id: UUID, user_id: UUID, body: str) -> dict:
    job = await _participant_job(db, job_id, user_id)
    other = job["cleaner_id"] if user_id == job["customer_id"] else job["customer_id"]
    if other and await _blocked(db, user_id, other):
        raise MarketplaceError("You cannot message this person.", 403)
    body = body.strip()
    if not body:
        raise MarketplaceError("Message is empty.")
    await db.execute(
        text("INSERT INTO marketplace_messages (job_id, sender_id, body) VALUES (:j, :s, :b)"),
        {"j": job_id, "s": user_id, "b": body[:2000]},
    )
    await db.commit()
    return {"ok": True}


async def add_photo(
    db: AsyncSession, job_id: UUID, user_id: UUID, kind: str, url: str,
    latitude: float | None = None, longitude: float | None = None,
) -> dict:
    job = await _participant_job(db, job_id, user_id)
    if kind not in ("listing", "before", "after", "checkin", "dispute"):
        raise MarketplaceError("Invalid photo kind.")
    is_cleaner = job["cleaner_id"] == user_id
    if kind == "listing":
        if job["customer_id"] != user_id or job["status"] not in ("requested", "open"):
            raise MarketplaceError("Photos of the site can only be added while the job is open.", 409)
        n = (
            await db.execute(
                text("SELECT count(*) FROM marketplace_job_photos WHERE job_id = :j AND kind = 'listing'"), {"j": job_id}
            )
        ).scalar_one()
        if n >= MAX_LISTING_PHOTOS:
            raise MarketplaceError(f"You can add up to {MAX_LISTING_PHOTOS} photos.")
    elif kind in ("before", "after", "checkin"):
        if not is_cleaner:
            raise MarketplaceError("Only the cleaner can add this photo.", 403)
        if job["status"] != ("accepted" if kind == "before" else "in_progress"):
            raise MarketplaceError("Add before photos when you arrive and after photos while the job is in progress.", 409)
    distance = await _site_distance(db, job_id, latitude, longitude) if latitude is not None and longitude is not None else None
    await db.execute(
        text(
            """INSERT INTO marketplace_job_photos (job_id, uploader_id, kind, url, latitude, longitude, distance_m)
               VALUES (:j, :u, :k, :url, :lat, :lng, :d)"""
        ),
        {"j": job_id, "u": user_id, "k": kind, "url": url, "lat": latitude, "lng": longitude, "d": distance},
    )
    await db.commit()
    return {"ok": True}


async def list_photos(db: AsyncSession, job_id: UUID, user_id: UUID) -> list[dict]:
    await _participant_job(db, job_id, user_id)
    rows = (
        await db.execute(
            text("SELECT id, uploader_id, kind, url, distance_m, created_at FROM marketplace_job_photos WHERE job_id = :j ORDER BY created_at"),
            {"j": job_id},
        )
    ).mappings().all()
    return [_plain(r) for r in rows]


# -------------------------------------------------------------- reviews, safety


async def add_review(db: AsyncSession, job_id: UUID, reviewer_id: UUID, rating: int, comment: str | None) -> dict:
    job = await _participant_job(db, job_id, reviewer_id)
    if job["status"] not in ("confirmed", "released"):
        raise MarketplaceError("You can review once the job is finished.", 409)
    if not 1 <= rating <= 5:
        raise MarketplaceError("Rating must be 1 to 5.")
    reviewee = job["cleaner_id"] if reviewer_id == job["customer_id"] else job["customer_id"]
    try:
        await db.execute(
            text(
                """INSERT INTO marketplace_reviews (job_id, reviewer_id, reviewee_id, rating, comment)
                   VALUES (:j, :r, :e, :rt, :c)"""
            ),
            {"j": job_id, "r": reviewer_id, "e": reviewee, "rt": rating, "c": comment},
        )
    except Exception:
        await db.rollback()
        raise MarketplaceError("You already reviewed this job.", 409)
    if reviewee == job["cleaner_id"]:
        await db.execute(
            text(
                """UPDATE cleaner_profiles SET
                     rating_count = s.n, rating_avg = s.a
                   FROM (SELECT count(*) n, round(avg(rating)::numeric, 2) a FROM marketplace_reviews
                         WHERE reviewee_id = :e AND NOT removed) s
                   WHERE user_id = :e"""
            ),
            {"e": reviewee},
        )
    await db.commit()
    return {"ok": True}


async def create_report(
    db: AsyncSession, reporter_id: UUID, job_id: UUID | None, reported_user_id: UUID | None, kind: str, details: str
) -> dict:
    if kind not in ("safety", "abuse", "other"):
        raise MarketplaceError("Invalid report kind.")
    if not details.strip():
        raise MarketplaceError("Tell us what happened.")
    await db.execute(
        text(
            """INSERT INTO marketplace_reports (reporter_id, job_id, reported_user_id, kind, details)
               VALUES (:r, :j, :u, :k, :d)"""
        ),
        {"r": reporter_id, "j": job_id, "u": reported_user_id, "k": kind, "d": details.strip()},
    )
    await db.commit()
    return {"ok": True}


async def block_user(db: AsyncSession, blocker_id: UUID, blocked_id: UUID) -> dict:
    if blocker_id == blocked_id:
        raise MarketplaceError("You cannot block yourself.")
    await db.execute(
        text("INSERT INTO marketplace_blocks (blocker_id, blocked_id) VALUES (:a, :b) ON CONFLICT DO NOTHING"),
        {"a": blocker_id, "b": blocked_id},
    )
    await db.commit()
    return {"ok": True}


async def _blocked(db: AsyncSession, a: UUID, b: UUID) -> bool:
    row = (
        await db.execute(
            text(
                """SELECT 1 FROM marketplace_blocks
                   WHERE (blocker_id = :a AND blocked_id = :b) OR (blocker_id = :b AND blocked_id = :a)"""
            ),
            {"a": a, "b": b},
        )
    ).first()
    return row is not None


# ----------------------------------------------------------------------- admin


async def admin_overview(db: AsyncSession) -> dict:
    pending = (
        await db.execute(
            text(
                """SELECT c.user_id, p.username, c.headline, c.services, c.created_at FROM cleaner_profiles c
                   JOIN profiles p ON p.id = c.user_id WHERE c.status = 'pending_review' ORDER BY c.created_at"""
            )
        )
    ).mappings().all()
    reports = (
        await db.execute(
            text(
                """SELECT r.id, r.kind, r.details, r.job_id, r.created_at, rp.username AS reporter, ru.username AS reported
                   FROM marketplace_reports r JOIN profiles rp ON rp.id = r.reporter_id
                   LEFT JOIN profiles ru ON ru.id = r.reported_user_id
                   WHERE r.status = 'open' ORDER BY r.created_at"""
            )
        )
    ).mappings().all()
    held = (
        await db.execute(
            text(
                """SELECT count(*) n, coalesce(sum(price_cents), 0) total FROM marketplace_jobs WHERE hold_status = 'held'"""
            )
        )
    ).mappings().first()
    disputed = (
        await db.execute(
            text(
                """SELECT j.id, j.title, j.price_cents, j.created_at,
                          cu.username AS customer_username, cl.username AS cleaner_username,
                          (SELECT r.details FROM marketplace_reports r
                            WHERE r.job_id = j.id AND r.kind = 'dispute' ORDER BY r.created_at DESC LIMIT 1) AS details
                   FROM marketplace_jobs j JOIN profiles cu ON cu.id = j.customer_id
                   LEFT JOIN profiles cl ON cl.id = j.cleaner_id
                   WHERE j.status = 'disputed' ORDER BY j.created_at"""
            )
        )
    ).mappings().all()
    return {
        "pending_cleaners": [_plain(r) for r in pending],
        "disputed_jobs": [_plain(r) for r in disputed],
        "open_reports": [_plain(r) for r in reports],
        "held_jobs": held["n"],
        "held_cents": int(held["total"]),
    }


async def resolve_report(db: AsyncSession, report_id: UUID, admin_id: UUID, status: str, resolution: str | None) -> dict:
    if status not in ("resolved", "dismissed"):
        raise MarketplaceError("Invalid status.")
    res = await db.execute(
        text(
            """UPDATE marketplace_reports SET status = :s, resolution = :r, resolved_by = :a, resolved_at = now()
               WHERE id = :id AND status = 'open'"""
        ),
        {"s": status, "r": resolution, "a": admin_id, "id": report_id},
    )
    if res.rowcount == 0:
        raise MarketplaceError("Report not found.", 404)
    await db.commit()
    return {"ok": True}


async def admin_resolve_dispute(db: AsyncSession, job_id: UUID, outcome: Literal["release", "refund"]) -> dict:
    job = await _load_for_update(db, job_id)
    if job["status"] != "disputed":
        raise MarketplaceError("This job is not in dispute.", 409)
    if outcome == "release":
        await db.execute(
            text("UPDATE marketplace_jobs SET status = 'released', hold_status = 'released', released_at = now() WHERE id = :id"),
            {"id": job_id},
        )
        if job["cleaner_id"]:
            await _bump_cleaner_jobs(db, job["cleaner_id"])
    else:
        await db.execute(
            text("UPDATE marketplace_jobs SET status = 'refunded', hold_status = 'refunded' WHERE id = :id"),
            {"id": job_id},
        )
    await db.commit()
    return {"ok": True, "outcome": outcome}


# --------------------------------------------------------------------- helpers


def _plain(row) -> dict:
    """RowMapping to a JSON-friendly dict (UUIDs and datetimes to strings, Decimals to floats)."""
    out: dict = {}
    for k, v in dict(row).items():
        if isinstance(v, UUID):
            out[k] = str(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        elif hasattr(v, "quantize"):  # Decimal
            out[k] = float(v)
        elif k == "home_location":
            continue
        else:
            out[k] = v
    return out


async def _notify_safe(db: AsyncSession, user_id: UUID | None, kind: str, title: str, body: str, path: str, cta: str) -> None:
    """Lifecycle notifications must never fail the action that triggered them."""
    if not user_id:
        return
    try:
        await _notify(db, user_id, kind, title, body, path, cta)
    except Exception:
        logger.exception("marketplace: notification %s failed", kind)


async def _notify(db: AsyncSession, user_id: UUID, kind: str, title: str, body: str, path: str, cta: str) -> None:
    """In-app notification plus email. Inserting into user_notifications also fires the push trigger
    (migration 062 -> send-push edge function), so link_url doubles as the push deep link."""
    from app.core.config import settings
    from app.services.email import render_cta_button, send_email, wrap_email_html

    await db.execute(
        text("INSERT INTO user_notifications (user_id, type, title, body, link_url) VALUES (:u, :t, :ti, :b, :l)"),
        {"u": user_id, "t": kind, "ti": title, "b": body, "l": path},
    )
    await db.commit()
    email = (await db.execute(text("SELECT email FROM auth.users WHERE id = :u"), {"u": user_id})).scalar()
    if not email:
        return
    url = f"{settings.frontend_url}{path}"
    html = wrap_email_html(f"<h2 style=\"margin:0 0 12px\">{title}</h2><p>{body}</p><p>{render_cta_button(url, cta)}</p>")
    await send_email(db, to=[email], subject=title, html=html, kind=kind)


async def _notify_nearby_cleaners(db: AsyncSession, job_id: UUID, limit: int = 25) -> None:
    """Tell active cleaners who offer this service and whose area covers the job."""
    rows = (
        await db.execute(
            text(
                """SELECT c.user_id, j.title FROM marketplace_jobs j
                   JOIN cleaner_profiles c ON c.status = 'active' AND c.user_id <> j.customer_id
                        AND j.job_type = ANY(c.services)
                        AND c.home_location IS NOT NULL AND j.location IS NOT NULL
                        AND ST_DWithin(c.home_location, j.location, c.service_radius_km * 1000)
                   WHERE j.id = :j AND NOT EXISTS (
                     SELECT 1 FROM marketplace_blocks b
                     WHERE (b.blocker_id = c.user_id AND b.blocked_id = j.customer_id)
                        OR (b.blocker_id = j.customer_id AND b.blocked_id = c.user_id))
                   ORDER BY ST_Distance(c.home_location, j.location) LIMIT :lim"""
            ),
            {"j": job_id, "lim": limit},
        )
    ).all()
    for user_id, title in rows:
        await _notify(
            db, user_id, "marketplace_job", "New job near you", f"\"{title}\" was just posted in your area.",
            f"/marketplace/jobs/{job_id}", "View job",
        )
