"""Sponsored cleanups (payments v2, dev-docs/payments-v2-scoping-2026-10-15.md).

A funded sponsorship is a pool of money tied to a place and a payout rule. Workers claim a
'site' sponsorship (proximity + before photo + timed window, modeled on problem report
claims), submit an after photo, and that creates a 'pending_review' allocation. An admin
approves or rejects it. Nothing here moves real money: 'paid_out' is a manual flag.

Everything is reached through the admin-secret gated routes in
app/api/routes/sponsored_cleanups.py, so it stays admin-only until launch.
"""

import json
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import payments as payments_service
from app.services.game_settings import get_game_settings


class SponsoredError(Exception):
    """Business-rule failure carrying the HTTP status the route should return."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


PAYOUT_RULE_TYPES = ("flat_per_cleanup", "per_bag", "equal_split")

# SQL fragment: when a funded pool opens to everyone. Plus members get the window before it.
# Needs the :early_hours bind; a window of 0 hours means no early access at all.
_EARLY_UNTIL_SQL = "(s.funded_at + make_interval(hours => :early_hours))"


async def _early_hours(db: AsyncSession) -> int:
    settings = await get_game_settings(db)
    return max(0, int(settings.get("plus_early_access_hours", 48)))


def _early_fields(early_until, plus: bool) -> dict:
    """Early access state for a pool row. 'early_access_locked' is true only for a viewer
    without Plus while the window is still open."""
    in_window = early_until is not None and early_until > datetime.now(timezone.utc)
    return {
        "early_access": in_window,
        "early_access_until": early_until.isoformat() if in_window else None,
        "early_access_locked": in_window and not plus,
    }


def validate_payout_rule(model: str, rule: dict) -> dict:
    """Normalize a sponsor-chosen payout rule. Site pools pay a user per verified cleanup
    (flat or per bag); group pools can also split equally among verified attendees."""
    rule_type = rule.get("type")
    if rule_type not in PAYOUT_RULE_TYPES:
        raise SponsoredError(422, f"payout_rule.type must be one of {', '.join(PAYOUT_RULE_TYPES)}")
    if rule_type == "equal_split" and model != "group_area":
        raise SponsoredError(422, "equal_split is only available for group sponsored areas")
    if rule_type in ("flat_per_cleanup", "equal_split"):
        amount = int(rule.get("amount_cents") or 0)
        if amount <= 0:
            raise SponsoredError(422, "payout_rule.amount_cents must be positive")
        return {"type": rule_type, "amount_cents": amount}
    per_bag = int(rule.get("cents_per_bag") or 0)
    if per_bag <= 0:
        raise SponsoredError(422, "payout_rule.cents_per_bag must be positive")
    max_bags = int(rule.get("max_bags") or 10)
    return {"type": "per_bag", "cents_per_bag": per_bag, "max_bags": min(100, max(1, max_bags))}


def _rule_amount(rule: dict, bags: int | None) -> int:
    if rule["type"] == "per_bag":
        bag_count = max(0, min(int(bags or 0), int(rule.get("max_bags", 10))))
        return bag_count * int(rule["cents_per_bag"])
    return int(rule["amount_cents"])


# Limits on sponsor-defined shapes. Keep a sponsored area to a neighborhood-sized place.
MAX_SITE_RADIUS_M = 500
MIN_SITE_RADIUS_M = 10
MIN_CIRCLE_RADIUS_M = 50
MAX_CIRCLE_RADIUS_M = 1500
MAX_GEO_UNITS = 10
# Boundary types a sponsor can combine into an area: the ones Trash War places events in.
ALLOWED_GEO_UNIT_TYPES = [
    "nyc_neighborhood",
    "chicago_neighborhood",
    "la_neighborhood",
    "philadelphia_neighborhood",
    "zip",
    "uk_postcode_district",
]
MAX_POLYGON_VERTICES = 60
MIN_AREA_SQM = 2_000
MAX_AREA_SQM = 5_000_000


def validate_site_radius(radius_m: int) -> None:
    if not MIN_SITE_RADIUS_M <= radius_m <= MAX_SITE_RADIUS_M:
        raise SponsoredError(422, f"Site radius must be between {MIN_SITE_RADIUS_M} and {MAX_SITE_RADIUS_M} meters")


def _check_coord(lon: float, lat: float) -> None:
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        raise SponsoredError(422, "Area coordinates are out of range")


async def build_area_geometry(db: AsyncSession, area: dict) -> tuple[str, str, str | None]:
    """Normalize a sponsor-defined area into (EWKT MultiPolygon, source, default name).
    `area` is one of {kind: 'geo_units', geo_unit_ids}, {kind: 'circle', latitude, longitude,
    radius_meters} or {kind: 'polygon', coordinates: [[lon, lat], ...]}. Everything is
    validated here (the client only hints): vertex count, valid non-self-intersecting
    shape, and area between MIN_AREA_SQM and MAX_AREA_SQM."""
    kind = area.get("kind")
    default_name: str | None = None
    if kind == "geo_units":
        ids = list(dict.fromkeys(str(i) for i in (area.get("geo_unit_ids") or [])))
        if not ids:
            raise SponsoredError(422, "Pick at least one area")
        if len(ids) > MAX_GEO_UNITS:
            raise SponsoredError(422, f"Pick at most {MAX_GEO_UNITS} areas")
        row = (
            await db.execute(
                text("""
                    SELECT count(*) AS n,
                           ST_AsEWKT(ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Union(geometry)), 3))) AS wkt,
                           string_agg(COALESCE(display_name, unit_id), ', ' ORDER BY display_name) AS names
                    FROM geo_units WHERE id = ANY(CAST(:ids AS uuid[])) AND geometry IS NOT NULL
                      AND unit_type = ANY(CAST(:types AS text[]))
                """),
                {"ids": ids, "types": ALLOWED_GEO_UNIT_TYPES},
            )
        ).fetchone()
        if row is None or row.n != len(ids):
            raise SponsoredError(422, "One of the selected areas was not found or cannot be sponsored")
        wkt, source = row.wkt, "geo_units"
        default_name = row.names if len(ids) <= 2 else f"{len(ids)} areas"
    elif kind == "circle":
        lat, lon = float(area.get("latitude")), float(area.get("longitude"))
        radius = int(area.get("radius_meters") or 0)
        _check_coord(lon, lat)
        if not MIN_CIRCLE_RADIUS_M <= radius <= MAX_CIRCLE_RADIUS_M:
            raise SponsoredError(
                422, f"Area radius must be between {MIN_CIRCLE_RADIUS_M} and {MAX_CIRCLE_RADIUS_M} meters"
            )
        wkt = (
            await db.execute(
                text("""
                    SELECT ST_AsEWKT(ST_Multi(ST_Buffer(
                        ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :r, 24)::geometry))
                """),
                {"lat": lat, "lon": lon, "r": radius},
            )
        ).scalar()
        source = "circle"
    elif kind == "polygon":
        coords = area.get("coordinates") or []
        if len(coords) > 1 and coords[0] == coords[-1]:
            coords = coords[:-1]
        if len(coords) < 3:
            raise SponsoredError(422, "Draw at least 3 points")
        if len(coords) > MAX_POLYGON_VERTICES:
            raise SponsoredError(422, f"Use at most {MAX_POLYGON_VERTICES} points")
        for pt in coords:
            _check_coord(float(pt[0]), float(pt[1]))
        ring = ", ".join(f"{float(p[0])} {float(p[1])}" for p in coords + [coords[0]])
        row = (
            await db.execute(
                text("""
                    SELECT ST_IsValid(g) AS valid, ST_AsEWKT(ST_Multi(g)) AS wkt
                    FROM (SELECT ST_GeomFromText(CAST(:wkt AS text), 4326) AS g) t
                """),
                {"wkt": f"POLYGON(({ring}))"},
            )
        ).fetchone()
        if not row.valid:
            raise SponsoredError(422, "The drawn area crosses over itself. Redraw it without crossing lines")
        wkt, source = row.wkt, "polygon"
    else:
        raise SponsoredError(422, "area.kind must be geo_units, circle or polygon")

    sqm = (
        await db.execute(
            text("SELECT ST_Area(ST_GeomFromEWKT(CAST(:w AS text))::geography)"), {"w": wkt}
        )
    ).scalar() or 0
    # Geo units are admin-curated, so only shapes the sponsor drew are bounded by size.
    if source != "geo_units":
        if sqm < MIN_AREA_SQM:
            raise SponsoredError(422, "That area is too small. Make it bigger")
        if sqm > MAX_AREA_SQM:
            raise SponsoredError(422, f"That area is too large (limit {MAX_AREA_SQM / 1_000_000:g} sq km)")
    return wkt, source, default_name


# ---------------------------------------------------------------------------
# Browsing sites
# ---------------------------------------------------------------------------


async def list_sites(db: AsyncSession, user_id: UUID | None = None) -> list[dict]:
    """Funded site pools with money left. 'claimed_by_me' lets the UI show a resume state;
    'available' is false while someone else holds a live claim."""
    await _expire_all_stale(db)
    await db.commit()
    early_hours = await _early_hours(db)
    fallback_radius = (await get_game_settings(db)).get("sponsored_claim_proximity_meters", 100.0)
    viewer_plus = bool(user_id and await payments_service.has_premium(db, "user", user_id))
    rows = (
        await db.execute(
            text(f"""
                SELECT s.id, s.site_label, s.message, s.payout_rule, s.remaining_cents,
                       s.cap_per_user_cents, s.site_radius_meters,
                       CASE WHEN :early_hours > 0 THEN {_EARLY_UNTIL_SQL} END AS early_until,
                       ST_Y(s.site_location::geometry) AS latitude,
                       ST_X(s.site_location::geometry) AS longitude,
                       cl.id AS claim_id, cl.user_id AS claim_user_id, cl.status AS claim_status,
                       cl.before_deadline_at, cl.after_deadline_at
                FROM sponsorships s
                LEFT JOIN sponsorship_site_claims cl
                  ON cl.sponsorship_id = s.id AND cl.status IN ('claimed', 'in_progress')
                WHERE s.model = 'site' AND s.status = 'funded' AND s.remaining_cents > 0
                ORDER BY s.created_at DESC
                LIMIT 200
            """),
            {"early_hours": early_hours},
        )
    ).mappings().all()
    out = []
    for r in rows:
        mine = bool(user_id and r["claim_user_id"] and str(r["claim_user_id"]) == str(user_id))
        out.append(
            {
                "id": str(r["id"]),
                "label": r["site_label"],
                "message": r["message"],
                "payout_rule": r["payout_rule"],
                "remaining_cents": r["remaining_cents"],
                "cap_per_user_cents": r["cap_per_user_cents"],
                "radius_meters": r["site_radius_meters"] or fallback_radius,
                "latitude": r["latitude"],
                "longitude": r["longitude"],
                "available": r["claim_id"] is None,
                **_early_fields(r["early_until"], viewer_plus or mine),
                "claimed_by_me": mine,
                "my_claim": (
                    {
                        "id": str(r["claim_id"]),
                        "status": r["claim_status"],
                        "before_deadline_at": r["before_deadline_at"].isoformat() if r["before_deadline_at"] else None,
                        "after_deadline_at": r["after_deadline_at"].isoformat() if r["after_deadline_at"] else None,
                    }
                    if mine
                    else None
                ),
            }
        )
    return out


async def list_map_features(db: AsyncSession) -> dict:
    """Funded pools with money left, shaped for the map: sites are points, group areas are
    simplified geo unit polygons. One read per map load, no per-move queries."""
    fallback_radius = (await get_game_settings(db)).get("sponsored_claim_proximity_meters", 100.0)
    sites = (
        await db.execute(
            text("""
                SELECT s.id, s.site_label, s.remaining_cents, s.payout_rule, s.site_radius_meters,
                       ST_Y(s.site_location::geometry) AS latitude,
                       ST_X(s.site_location::geometry) AS longitude,
                       EXISTS (SELECT 1 FROM sponsorship_site_claims cl
                               WHERE cl.sponsorship_id = s.id AND cl.status IN ('claimed', 'in_progress')) AS held
                FROM sponsorships s
                WHERE s.model = 'site' AND s.status = 'funded' AND s.remaining_cents > 0
                  AND s.site_location IS NOT NULL
                ORDER BY s.created_at DESC
                LIMIT 200
            """)
        )
    ).mappings().all()
    areas = (
        await db.execute(
            text("""
                SELECT s.id, s.payout_rule, s.remaining_cents, s.area_name,
                       ST_AsGeoJSON(ST_SimplifyPreserveTopology(s.area_geometry, 0.0003)) AS geojson
                FROM sponsorships s
                WHERE s.model = 'group_area' AND s.status = 'funded' AND s.remaining_cents > 0
                  AND s.area_geometry IS NOT NULL
                ORDER BY s.created_at DESC
                LIMIT 100
            """)
        )
    ).mappings().all()
    return {
        "sites": [
            {
                "id": str(r["id"]),
                "label": r["site_label"],
                "remaining_cents": r["remaining_cents"],
                "payout_rule": r["payout_rule"],
                "radius_meters": r["site_radius_meters"] or fallback_radius,
                "latitude": r["latitude"],
                "longitude": r["longitude"],
                "available": not r["held"],
            }
            for r in sites
        ],
        "areas": [
            {
                "id": str(r["id"]),
                "area_name": r["area_name"],
                "remaining_cents": r["remaining_cents"],
                "payout_rule": r["payout_rule"],
                "geometry": json.loads(r["geojson"]),
            }
            for r in areas
        ],
    }


async def list_group_areas(
    db: AsyncSession, group_id: UUID | None = None, lat: float | None = None, lon: float | None = None
) -> list[dict]:
    """Funded group-area pools a group can pick when creating an event. Pools still inside
    their Plus early access window come back locked unless the hosting group has Plus. With a
    location, only pools whose area contains it come back. `available_cents` is what is left once
    other groups' upcoming events have reserved their share."""
    early_hours = await _early_hours(db)
    group_plus = bool(group_id and await payments_service.has_premium(db, "group", group_id))
    located = lat is not None and lon is not None
    rows = (
        await db.execute(
            text(f"""
                SELECT s.id, s.payout_rule, s.remaining_cents, s.message, s.area_name,
                       CASE WHEN :early_hours > 0 THEN {_EARLY_UNTIL_SQL} END AS early_until
                FROM sponsorships s
                WHERE s.model = 'group_area' AND s.status = 'funded' AND s.remaining_cents > 0
                  AND (NOT :located OR (s.area_geometry IS NOT NULL AND ST_Intersects(
                        s.area_geometry, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))))
                ORDER BY s.created_at DESC
                LIMIT 200
            """),
            {"early_hours": early_hours, "located": located, "lat": lat or 0, "lon": lon or 0},
        )
    ).mappings().all()
    out = []
    for r in rows:
        available = await _pool_available_cents(db, r["id"], group_id, include_holds=True)
        out.append(
            {
                "id": str(r["id"]),
                "area_name": r["area_name"],
                "message": r["message"],
                "payout_rule": r["payout_rule"],
                "remaining_cents": r["remaining_cents"],
                "available_cents": available,
                **_early_fields(r["early_until"], group_plus),
            }
        )
    return out


# ---------------------------------------------------------------------------
# Claim flow
# ---------------------------------------------------------------------------


async def _expire_all_stale(db: AsyncSession) -> None:
    """Reopen sites whose claim ran past its window and notify the claimant. Checked on
    every claim read/write instead of via cron, same idea as problem report claims."""
    expired = (
        await db.execute(
            text("""
                UPDATE sponsorship_site_claims
                SET status = 'expired', ended_at = now()
                WHERE (status = 'claimed' AND before_deadline_at < now())
                   OR (status = 'in_progress' AND after_deadline_at < now())
                RETURNING user_id
            """)
        )
    ).fetchall()
    for row in expired:
        await db.execute(
            text("""
                INSERT INTO user_notifications (user_id, type, title, body, link_url)
                VALUES (:user_id, 'claim_expired', 'Your site claim expired',
                        'A sponsored site you claimed reopened: someone else can pick it up now.',
                        '/impact')
            """),
            {"user_id": str(row.user_id)},
        )


async def _assert_near_site(db: AsyncSession, sponsorship_id: UUID, lat: float, lon: float) -> None:
    """Server-side proximity re-check against the site point, never the client's own math."""
    settings = await get_game_settings(db)
    row = (
        await db.execute(
            text("""
                SELECT ST_DWithin(
                    s.site_location,
                    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                    CAST(COALESCE(s.site_radius_meters, :fallback) AS double precision)
                )
                FROM sponsorships s
                WHERE s.id = :id AND s.model = 'site'
            """),
            {
                "id": str(sponsorship_id),
                "lat": lat,
                "lon": lon,
                "fallback": settings.get("sponsored_claim_proximity_meters", 100.0),
            },
        )
    ).fetchone()
    if row is None:
        raise SponsoredError(404, "Sponsored site not found")
    if not row[0]:
        raise SponsoredError(403, "You need to be at the sponsored site to do this")


# An upcoming event attached to a group-area pool holds back money for its group, so a rival group
# cannot get its event verified first and drain the pool. Holds end when the event is cancelled,
# logged (the real allocation takes over) or this long after it was due without being logged.
HOLD_GRACE_DAYS = 7
HOLD_STATUSES = ("open", "scheduled", "in_progress")
# Used to size the hold for an equal split when the event has no attendee limit.
DEFAULT_SPLIT_ATTENDEES = 10


def _max_event_payout(rule: dict, max_attendees: int | None) -> int:
    """The most one event could be paid under a rule, before the per-group cap."""
    if rule["type"] == "per_bag":
        return int(rule["cents_per_bag"]) * int(rule.get("max_bags", 10))
    if rule["type"] == "equal_split":
        return int(rule["amount_cents"]) * int(max_attendees or DEFAULT_SPLIT_ATTENDEES)
    return int(rule["amount_cents"])


async def _group_cap_cents(db: AsyncSession, group_id: UUID, settings: dict | None = None) -> int:
    settings = settings if settings is not None else await get_game_settings(db)
    plus = await payments_service.has_premium(db, "group", group_id)
    boost = max(1.0, float(settings.get("plus_earning_cap_multiplier", 2))) if plus else 1.0
    return _usd_to_cents(settings, "sponsored_default_cap_per_group_usd", 100, boost)


async def pool_holds_cents(db: AsyncSession, sponsorship_id: UUID, exclude_group_id: UUID | None = None) -> int:
    """Money held back for upcoming events on this pool. Each group holds the lesser of its events'
    maximum payouts and what its per-group cap still allows, so one crew cannot lock the whole pool
    by scheduling many events. A group's own holds are left out when asking on its behalf: its own
    cap already limits it."""
    rows = (
        await db.execute(
            text("""
                SELECT c.group_id, c.max_attendees, s.payout_rule
                FROM cleanups c
                JOIN sponsorships s ON s.id = c.sponsorship_id
                WHERE c.sponsorship_id = :sid AND c.group_id IS NOT NULL
                  AND c.status = ANY(:statuses)
                  AND COALESCE(c.scheduled_end, c.scheduled_start, now()) > now() - make_interval(days => :grace)
                  AND (CAST(:exclude AS uuid) IS NULL OR c.group_id <> CAST(:exclude AS uuid))
            """),
            {
                "sid": str(sponsorship_id),
                "statuses": list(HOLD_STATUSES),
                "grace": HOLD_GRACE_DAYS,
                "exclude": str(exclude_group_id) if exclude_group_id else None,
            },
        )
    ).mappings().all()
    if not rows:
        return 0
    per_group: dict[str, int] = {}
    for r in rows:
        gid = str(r["group_id"])
        per_group[gid] = per_group.get(gid, 0) + _max_event_payout(r["payout_rule"], r["max_attendees"])
    settings = await get_game_settings(db)
    total = 0
    for gid, wanted in per_group.items():
        earned = (
            await db.execute(
                text("""
                    SELECT COALESCE(SUM(amount_cents), 0) FROM sponsorship_allocations
                    WHERE sponsorship_id = :sid AND group_id = :gid AND status <> 'rejected'
                """),
                {"sid": str(sponsorship_id), "gid": gid},
            )
        ).scalar()
        cap = await _group_cap_cents(db, UUID(gid), settings)
        total += max(0, min(wanted, cap - int(earned)))
    return total


async def _pool_available_cents(
    db: AsyncSession, sponsorship_id: UUID, for_group_id: UUID | None = None, include_holds: bool = False
) -> int:
    """remaining_cents minus allocations already queued for review, so a pool can't be
    over-promised by claims racing each other before an admin approves. With include_holds,
    money reserved for other groups' upcoming events is taken off too."""
    row = (
        await db.execute(
            text("""
                SELECT s.remaining_cents - COALESCE((
                    SELECT SUM(a.amount_cents) FROM sponsorship_allocations a
                    WHERE a.sponsorship_id = s.id AND a.status = 'pending_review'
                ), 0) AS available
                FROM sponsorships s WHERE s.id = :id AND s.status = 'funded'
            """),
            {"id": str(sponsorship_id)},
        )
    ).fetchone()
    available = int(row.available) if row and row.available is not None else 0
    if include_holds and available > 0:
        available -= await pool_holds_cents(db, sponsorship_id, for_group_id)
    return max(0, available)


async def _assert_early_access(db: AsyncSession, sponsorship_id: UUID, owner_type: str, owner_id: UUID) -> None:
    """While a pool is inside its Plus early access window, only a Plus member (the user for
    a site, the hosting group for a group area) may take it."""
    early_hours = await _early_hours(db)
    if early_hours <= 0:
        return
    in_window = (
        await db.execute(
            text(f"""
                SELECT {_EARLY_UNTIL_SQL} > now() FROM sponsorships s
                WHERE s.id = :id AND s.funded_at IS NOT NULL
            """),
            {"id": str(sponsorship_id), "early_hours": early_hours},
        )
    ).scalar()
    if in_window and not await payments_service.has_premium(db, owner_type, owner_id):
        raise SponsoredError(403, "This one is open to Frontline Plus members first. It opens to everyone soon.")


async def claim_site(db: AsyncSession, sponsorship_id: UUID, user_id: UUID, lat: float, lon: float) -> dict:
    await _expire_all_stale(db)
    await _assert_near_site(db, sponsorship_id, lat, lon)
    if await _pool_available_cents(db, sponsorship_id) <= 0:
        raise SponsoredError(409, "This site has no funds left to claim")
    await _assert_early_access(db, sponsorship_id, "user", user_id)

    settings = await get_game_settings(db)
    try:
        row = (
            await db.execute(
                text("""
                    INSERT INTO sponsorship_site_claims (sponsorship_id, user_id, before_deadline_at)
                    SELECT s.id, :user_id, now() + make_interval(mins => :window)
                    FROM sponsorships s
                    WHERE s.id = :id AND s.model = 'site' AND s.status = 'funded'
                    RETURNING id, before_deadline_at
                """),
                {
                    "id": str(sponsorship_id),
                    "user_id": str(user_id),
                    "window": int(settings.get("sponsored_claim_before_window_minutes", 30)),
                },
            )
        ).fetchone()
    except Exception as e:  # unique-index violation: site or user already holds a live claim
        await db.rollback()
        if "one_live" in str(e):
            raise SponsoredError(409, "This site is already claimed, or you already have an active claim") from e
        raise
    if row is None:
        raise SponsoredError(404, "Sponsored site not found or not funded")
    await db.commit()
    return {"claim_id": str(row.id), "status": "claimed", "before_deadline_at": row.before_deadline_at.isoformat()}


async def submit_before_photo(
    db: AsyncSession, sponsorship_id: UUID, user_id: UUID, photo_url: str, lat: float, lon: float
) -> dict:
    await _expire_all_stale(db)
    await _assert_near_site(db, sponsorship_id, lat, lon)
    settings = await get_game_settings(db)
    row = (
        await db.execute(
            text("""
                UPDATE sponsorship_site_claims
                SET status = 'in_progress',
                    before_photo_url = :photo_url,
                    before_location = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                    before_submitted_at = now(),
                    after_deadline_at = now() + make_interval(mins => :window)
                WHERE sponsorship_id = :id AND user_id = :user_id
                  AND status = 'claimed' AND before_deadline_at > now()
                RETURNING after_deadline_at
            """),
            {
                "id": str(sponsorship_id),
                "user_id": str(user_id),
                "photo_url": photo_url,
                "lat": lat,
                "lon": lon,
                "window": int(settings.get("sponsored_claim_work_window_minutes", 120)),
            },
        )
    ).fetchone()
    if row is None:
        await db.commit()  # keep the expiry side effects
        raise SponsoredError(409, "Claim is not active or has expired")
    await db.commit()
    return {"status": "in_progress", "after_deadline_at": row.after_deadline_at.isoformat()}


async def submit_after_photo(
    db: AsyncSession,
    sponsorship_id: UUID,
    user_id: UUID,
    photo_url: str,
    lat: float,
    lon: float,
    bags: int | None,
) -> dict:
    """Finish the claim and queue a pending_review allocation sized by the payout rule,
    trimmed to the per-user pool cap, the daily cap and what the pool has left."""
    await _expire_all_stale(db)
    await _assert_near_site(db, sponsorship_id, lat, lon)

    rule_row = (
        await db.execute(text("SELECT payout_rule FROM sponsorships WHERE id = :id"), {"id": str(sponsorship_id)})
    ).fetchone()
    if rule_row is not None and rule_row.payout_rule.get("type") == "per_bag" and not (bags and bags > 0):
        # Checked before the claim closes, so the cleaner can fix the count and resubmit.
        raise SponsoredError(422, "Enter how many bags you collected. This site pays per bag.")

    claim = (
        await db.execute(
            text("""
                UPDATE sponsorship_site_claims
                SET status = 'submitted',
                    after_photo_url = :photo_url,
                    after_location = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                    after_submitted_at = now(),
                    ended_at = now()
                WHERE sponsorship_id = :id AND user_id = :user_id
                  AND status = 'in_progress' AND after_deadline_at > now()
                RETURNING id
            """),
            {"id": str(sponsorship_id), "user_id": str(user_id), "photo_url": photo_url, "lat": lat, "lon": lon},
        )
    ).fetchone()
    if claim is None:
        await db.commit()
        raise SponsoredError(409, "Claim is not active or has expired")

    pool = (
        await db.execute(
            text("SELECT payout_rule, cap_per_user_cents FROM sponsorships WHERE id = :id"),
            {"id": str(sponsorship_id)},
        )
    ).fetchone()
    settings = await get_game_settings(db)
    amount = _rule_amount(pool.payout_rule, bags)
    amount = min(amount, await _pool_available_cents(db, sponsorship_id))

    # Frontline Plus members can earn more: the multiplier lifts the default pool cap and the
    # daily cap, but never a cap the sponsor set explicitly on their own pool.
    plus = await payments_service.has_premium(db, "user", user_id)
    boost = max(1.0, float(settings.get("plus_earning_cap_multiplier", 2))) if plus else 1.0
    default_pool_cap = _usd_to_cents(settings, "sponsored_default_cap_per_user_usd", 25, boost)
    pool_cap = pool.cap_per_user_cents or default_pool_cap
    earned_pool = (
        await db.execute(
            text("""
                SELECT COALESCE(SUM(amount_cents), 0) FROM sponsorship_allocations
                WHERE sponsorship_id = :id AND user_id = :user_id AND status <> 'rejected'
            """),
            {"id": str(sponsorship_id), "user_id": str(user_id)},
        )
    ).scalar()
    earned_today = (
        await db.execute(
            text("""
                SELECT COALESCE(SUM(amount_cents), 0) FROM sponsorship_allocations
                WHERE user_id = :user_id AND status <> 'rejected' AND created_at >= date_trunc('day', now())
            """),
            {"user_id": str(user_id)},
        )
    ).scalar()
    daily_cap = _usd_to_cents(settings, "sponsored_daily_cap_per_user_usd", 50, boost)
    amount = min(amount, pool_cap - int(earned_pool), daily_cap - int(earned_today))

    allocation_id = None
    if amount > 0:
        allocation_id = (
            await db.execute(
                text("""
                    INSERT INTO sponsorship_allocations (sponsorship_id, user_id, claim_id, amount_cents)
                    VALUES (:id, :user_id, :claim_id, :amount)
                    RETURNING id
                """),
                {"id": str(sponsorship_id), "user_id": str(user_id), "claim_id": str(claim.id), "amount": amount},
            )
        ).scalar()
    await db.commit()
    return {
        "status": "submitted",
        "allocation_id": str(allocation_id) if allocation_id else None,
        "amount_cents": max(amount, 0),
        "capped": amount <= 0,
        "bags_paid": min(int(bags or 0), int(pool.payout_rule.get("max_bags", 10)))
        if pool.payout_rule.get("type") == "per_bag"
        else None,
    }


def _usd_to_cents(settings: dict, key: str, default_usd: float, boost: float = 1.0) -> int:
    """Admin settings hold dollars; the rest of the money code works in cents."""
    return int(round(float(settings.get(key, default_usd)) * 100 * boost))


async def daily_limit_status(db: AsyncSession, user_id: UUID) -> dict:
    """What a person can still be credited today across all sponsorships (resets at midnight UTC)."""
    settings = await get_game_settings(db)
    plus = await payments_service.has_premium(db, "user", user_id)
    boost = max(1.0, float(settings.get("plus_earning_cap_multiplier", 2))) if plus else 1.0
    limit = _usd_to_cents(settings, "sponsored_daily_cap_per_user_usd", 50, boost)
    earned = (
        await db.execute(
            text("""
                SELECT COALESCE(SUM(amount_cents), 0) FROM sponsorship_allocations
                WHERE user_id = :user_id AND status <> 'rejected' AND created_at >= date_trunc('day', now())
            """),
            {"user_id": str(user_id)},
        )
    ).scalar()
    return {
        "limit_cents": limit,
        "earned_today_cents": int(earned),
        "remaining_cents": max(0, limit - int(earned)),
        "is_plus": plus,
        "plus_limit_cents": _usd_to_cents(settings, "sponsored_daily_cap_per_user_usd", 50, max(1.0, float(settings.get("plus_earning_cap_multiplier", 2)))),
    }


async def validate_event_pool(
    db: AsyncSession, sponsorship_id: UUID, group_id: UUID, lat: float, lon: float
) -> None:
    """An event can only attach to a funded group-area pool, and must sit inside its area."""
    row = (
        await db.execute(
            text("""
                SELECT s.model, s.status, s.remaining_cents,
                       (s.area_geometry IS NULL OR ST_Intersects(
                           s.area_geometry,
                           ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
                       )) AS inside
                FROM sponsorships s
                WHERE s.id = :id
            """),
            {"id": str(sponsorship_id), "lat": lat, "lon": lon},
        )
    ).fetchone()
    if row is None or row.model != "group_area":
        raise SponsoredError(404, "Sponsored area not found")
    if row.status != "funded" or (row.remaining_cents or 0) <= 0:
        raise SponsoredError(409, "This sponsored area has no funds left")
    if not row.inside:
        raise SponsoredError(422, "The event location is outside the sponsored area")
    await _assert_early_access(db, sponsorship_id, "group", group_id)
    # First come, first reserved: other groups' upcoming events hold money back, and a group that
    # has already earned its cap on this pool cannot take another slot.
    if await _pool_available_cents(db, sponsorship_id, group_id, include_holds=True) <= 0:
        raise SponsoredError(
            409, "All of this pool's money is reserved by other upcoming events. Check back if one is cancelled."
        )
    earned = (
        await db.execute(
            text("""
                SELECT COALESCE(SUM(amount_cents), 0) FROM sponsorship_allocations
                WHERE sponsorship_id = :sid AND group_id = :gid AND status <> 'rejected'
            """),
            {"sid": str(sponsorship_id), "gid": str(group_id)},
        )
    ).scalar()
    if int(earned) >= await _group_cap_cents(db, group_id):
        raise SponsoredError(409, "Your group has already earned the most it can from this pool")


async def queue_group_allocation(db: AsyncSession, cleanup_id: UUID, attendee_count: int) -> dict | None:
    """Called after an organizer logs a team total for an event tied to a group-area pool.
    Queues (or refreshes) one pending_review allocation paying the host group. Re-logging
    replaces a pending allocation; an approved or paid one is never touched. Does not commit."""
    ev = (
        await db.execute(
            text("""
                SELECT group_id, sponsorship_id,
                       COALESCE(metrics_small_bags, 0) + COALESCE(metrics_large_bags, 0) AS bags
                FROM cleanups WHERE id = :id
            """),
            {"id": str(cleanup_id)},
        )
    ).fetchone()
    if ev is None or ev.sponsorship_id is None or ev.group_id is None:
        return None

    existing = (
        await db.execute(
            text("""
                SELECT id, status FROM sponsorship_allocations
                WHERE cleanup_id = :id AND status <> 'rejected'
            """),
            {"id": str(cleanup_id)},
        )
    ).fetchone()
    if existing is not None and existing.status != "pending_review":
        return None
    if existing is not None:
        await db.execute(text("DELETE FROM sponsorship_allocations WHERE id = :id"), {"id": str(existing.id)})

    pool = (
        await db.execute(
            text("SELECT payout_rule FROM sponsorships WHERE id = :id AND model = 'group_area'"),
            {"id": str(ev.sponsorship_id)},
        )
    ).fetchone()
    if pool is None:
        return None
    rule = pool.payout_rule
    amount = _rule_amount(rule, int(ev.bags))
    if rule["type"] == "equal_split":
        amount *= max(0, attendee_count)
    amount = min(amount, await _pool_available_cents(db, ev.sponsorship_id, ev.group_id, include_holds=True))

    # Per-group cap on one pool so a single crew cannot drain it. Plus groups get the Plus
    # multiplier. Any pending allocation for this event was deleted above, so the total
    # counts only this group's other events on the pool.
    settings = await get_game_settings(db)
    group_plus = await payments_service.has_premium(db, "group", ev.group_id)
    boost = max(1.0, float(settings.get("plus_earning_cap_multiplier", 2))) if group_plus else 1.0
    group_cap = _usd_to_cents(settings, "sponsored_default_cap_per_group_usd", 100, boost)
    earned_by_group = (
        await db.execute(
            text("""
                SELECT COALESCE(SUM(amount_cents), 0) FROM sponsorship_allocations
                WHERE sponsorship_id = :sid AND group_id = :gid AND status <> 'rejected'
            """),
            {"sid": str(ev.sponsorship_id), "gid": str(ev.group_id)},
        )
    ).scalar()
    amount = min(amount, group_cap - int(earned_by_group))
    if amount <= 0:
        return None

    allocation_id = (
        await db.execute(
            text("""
                INSERT INTO sponsorship_allocations (sponsorship_id, group_id, cleanup_id, amount_cents)
                VALUES (:sid, :gid, :cid, :amount) RETURNING id
            """),
            {"sid": str(ev.sponsorship_id), "gid": str(ev.group_id), "cid": str(cleanup_id), "amount": amount},
        )
    ).scalar()
    return {"allocation_id": str(allocation_id), "amount_cents": amount}


async def release_claim(db: AsyncSession, sponsorship_id: UUID, user_id: UUID) -> dict:
    await _expire_all_stale(db)
    row = (
        await db.execute(
            text("""
                UPDATE sponsorship_site_claims
                SET status = 'released', ended_at = now()
                WHERE sponsorship_id = :id AND user_id = :user_id AND status IN ('claimed', 'in_progress')
                RETURNING id
            """),
            {"id": str(sponsorship_id), "user_id": str(user_id)},
        )
    ).fetchone()
    await db.commit()
    if row is None:
        raise SponsoredError(409, "You don't have an active claim on this site")
    return {"status": "released"}


# ---------------------------------------------------------------------------
# Admin review and payout bookkeeping
# ---------------------------------------------------------------------------


async def list_allocations(db: AsyncSession, status: str | None = None) -> list[dict]:
    rows = (
        await db.execute(
            text("""
                SELECT a.id, a.sponsorship_id, a.amount_cents, a.status, a.created_at,
                       a.reviewed_at, a.reject_reason, a.paid_out_at,
                       a.user_id, p.display_name AS user_name, p.username,
                       a.group_id, g.name AS group_name,
                       a.is_direct, s.site_label, s.model, s.remaining_cents,
                       cl.before_photo_url, cl.after_photo_url
                FROM sponsorship_allocations a
                JOIN sponsorships s ON s.id = a.sponsorship_id
                LEFT JOIN profiles p ON p.id = a.user_id
                LEFT JOIN groups g ON g.id = a.group_id
                LEFT JOIN sponsorship_site_claims cl ON cl.id = a.claim_id
                WHERE (CAST(:status AS text) IS NULL OR a.status = CAST(:status AS text))
                ORDER BY a.created_at DESC
                LIMIT 200
            """),
            {"status": status},
        )
    ).mappings().all()
    return [
        {**dict(r), "id": str(r["id"]), "sponsorship_id": str(r["sponsorship_id"])} for r in rows
    ]


async def review_allocation(
    db: AsyncSession, allocation_id: UUID, reviewer_id: UUID, approve: bool, reject_reason: str | None
) -> dict:
    """Approve locks the sponsorship row first so two approvals can never push the pool
    below zero; approving decrements remaining_cents and flips an emptied pool to exhausted."""
    alloc = (
        await db.execute(
            text("SELECT sponsorship_id, amount_cents, status FROM sponsorship_allocations WHERE id = :id"),
            {"id": str(allocation_id)},
        )
    ).fetchone()
    if alloc is None:
        raise SponsoredError(404, "Allocation not found")

    if not approve:
        result = await db.execute(
            text("""
                UPDATE sponsorship_allocations
                SET status = 'rejected', reviewed_by = :reviewer, reviewed_at = now(), reject_reason = :reason
                WHERE id = :id AND status = 'pending_review'
                RETURNING id
            """),
            {"id": str(allocation_id), "reviewer": str(reviewer_id), "reason": reject_reason},
        )
        if result.fetchone() is None:
            raise SponsoredError(409, "Allocation is not pending review")
        await db.commit()
        return {"status": "rejected"}

    pool = (
        await db.execute(
            text("SELECT remaining_cents FROM sponsorships WHERE id = :id FOR UPDATE"),
            {"id": str(alloc.sponsorship_id)},
        )
    ).fetchone()
    if alloc.status != "pending_review":
        await db.rollback()
        raise SponsoredError(409, "Allocation is not pending review")
    if pool is None or pool.remaining_cents < alloc.amount_cents:
        await db.rollback()
        raise SponsoredError(409, "Sponsorship pool does not have enough left to approve this")

    await db.execute(
        text("""
            UPDATE sponsorship_allocations
            SET status = 'approved', reviewed_by = :reviewer, reviewed_at = now()
            WHERE id = :id
        """),
        {"id": str(allocation_id), "reviewer": str(reviewer_id)},
    )
    await db.execute(
        text("""
            UPDATE sponsorships
            SET remaining_cents = remaining_cents - :amount,
                status = CASE WHEN remaining_cents - :amount <= 0 THEN 'exhausted' ELSE status END
            WHERE id = :id
        """),
        {"id": str(alloc.sponsorship_id), "amount": alloc.amount_cents},
    )
    await db.commit()
    return {"status": "approved"}


async def mark_paid_out(db: AsyncSession, allocation_id: UUID, admin_id: UUID) -> dict:
    """Manual bookkeeping only: records that an admin paid this out-of-band."""
    row = (
        await db.execute(
            text("""
                UPDATE sponsorship_allocations
                SET status = 'paid_out', paid_out_at = now(), paid_out_by = :admin
                WHERE id = :id AND status = 'approved'
                RETURNING id
            """),
            {"id": str(allocation_id), "admin": str(admin_id)},
        )
    ).fetchone()
    await db.commit()
    if row is None:
        raise SponsoredError(409, "Allocation is not approved")
    return {"status": "paid_out"}


def encode_rule(rule: dict) -> str:
    return json.dumps(rule)
