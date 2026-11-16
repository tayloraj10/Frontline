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

from app.services import connect
from app.services import earning_limits
from app.services import payments as payments_service
from app.services.game_settings import get_game_settings, retake_wait_hours, size_limits


class SponsoredError(Exception):
    """Business-rule failure carrying the HTTP status the route should return."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


PAYOUT_RULE_TYPES = ("flat_per_cleanup", "per_bag", "equal_split")

# SQL fragments for when a funded pool is visible. Needs the :early_hours bind.
#   public_at  when it opens to everyone: the sponsor's start date, or funded_at plus the Plus lead
#   early_from when Plus members first see it: the lead window before public_at, never before funding
# Before early_from nobody but the sponsor sees it. A window of 0 hours means no Plus lead at all.
_PUBLIC_AT_SQL = "GREATEST(s.funded_at, COALESCE(s.starts_at, s.funded_at + make_interval(hours => :early_hours)))"
_EARLY_FROM_SQL = f"GREATEST(s.funded_at, {_PUBLIC_AT_SQL} - make_interval(hours => :early_hours))"
_VISIBILITY_COLS = f"{_PUBLIC_AT_SQL} AS public_at, {_EARLY_FROM_SQL} AS early_from"


async def _early_hours(db: AsyncSession) -> int:
    settings = await get_game_settings(db)
    return max(0, int(settings.get("plus_early_access_hours", 48)))


def _is_visible(r, mine: bool) -> bool:
    """A scheduled pool stays hidden from everyone but its sponsor until the Plus lead window opens."""
    return mine or r["early_from"] <= datetime.now(timezone.utc)


def _early_fields(public_at, early_from, plus: bool) -> dict:
    """Visibility state for a pool row. 'early_access_locked' is true only for a viewer without Plus
    while the Plus-only window is open. 'scheduled' is true before the window opens (sponsor only)."""
    now = datetime.now(timezone.utc)
    scheduled = early_from > now
    in_window = early_from <= now < public_at
    return {
        "early_access": in_window,
        "early_access_until": public_at.isoformat() if in_window else None,
        "early_access_locked": in_window and not plus,
        "scheduled": scheduled,
        "opens_at": public_at.isoformat() if scheduled else None,
        "plus_opens_at": early_from.isoformat() if scheduled else None,
    }


MAX_MIN_LARGE_BAGS = 20


def min_large_bags(rule: dict) -> int:
    """Rules saved before this requirement existed count as the default of one large bag."""
    return max(1, int(rule.get("min_large_bags") or 1))


def validate_payout_rule(model: str, rule: dict) -> dict:
    """Normalize a sponsor-chosen payout rule. Site pools pay a user per verified cleanup
    (flat or per bag); group pools can also split equally among verified attendees."""
    rule_type = rule.get("type")
    if rule_type not in PAYOUT_RULE_TYPES:
        raise SponsoredError(422, f"payout_rule.type must be one of {', '.join(PAYOUT_RULE_TYPES)}")
    if rule_type == "equal_split" and model != "group_area":
        raise SponsoredError(422, "equal_split is only available for group sponsored areas")
    # The least a cleanup must collect to be paid: this many large bags (default 1). Stops
    # token cleanups that technically touch a site but do not clean it.
    min_large = min(MAX_MIN_LARGE_BAGS, max(1, int(rule.get("min_large_bags") or 1)))
    if rule_type in ("flat_per_cleanup", "equal_split"):
        amount = int(rule.get("amount_cents") or 0)
        if amount <= 0:
            raise SponsoredError(422, "payout_rule.amount_cents must be positive")
        out = {"type": rule_type, "amount_cents": amount, "min_large_bags": min_large}
        if rule_type == "flat_per_cleanup" and model == "site" and rule.get("one_winner") is True:
            # "One cleaner gets it all": paid in full to the first approved cleanup, exempt from
            # the once-a-day rule and the weekly ceiling.
            out["one_winner"] = True
        return out
    per_bag = int(rule.get("cents_per_bag") or 0)
    if per_bag <= 0:
        raise SponsoredError(422, "payout_rule.cents_per_bag must be positive")
    max_bags = int(rule.get("max_bags") or 10)
    return {
        "type": "per_bag",
        "cents_per_bag": per_bag,
        "max_bags": min(100, max(1, max_bags)),
        "min_large_bags": min_large,
    }


def _rule_amount(rule: dict, bags: int | None) -> int:
    if rule["type"] == "per_bag":
        bag_count = max(0, min(int(bags or 0), int(rule.get("max_bags", 10))))
        return bag_count * int(rule["cents_per_bag"])
    return int(rule["amount_cents"])


# Limits on sponsor-defined shapes. Keep a sponsored area to a neighborhood-sized place.
# All size limits (pin radius, circle radius, vertices, area, geo units) are game_settings, see size_limits().
# Boundary types a sponsor can combine into an area: the ones Trash War places events in.
ALLOWED_GEO_UNIT_TYPES = [
    "nyc_neighborhood",
    "chicago_neighborhood",
    "la_neighborhood",
    "philadelphia_neighborhood",
    "zip",
    "uk_postcode_district",
]


async def validate_site_radius(db: AsyncSession, radius_m: int) -> None:
    lim = await size_limits(db)
    if not lim["pin_radius_min_m"] <= radius_m <= lim["pin_radius_max_m"]:
        raise SponsoredError(
            422, f"Site radius must be between {lim['pin_radius_min_ft']} and {lim['pin_radius_max_ft']} feet"
        )


def _check_coord(lon: float, lat: float) -> None:
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        raise SponsoredError(422, "Area coordinates are out of range")


async def build_area_geometry(db: AsyncSession, area: dict) -> tuple[str, str, str | None]:
    """Normalize a sponsor-defined area into (EWKT MultiPolygon, source, default name).
    `area` is one of {kind: 'geo_units', geo_unit_ids}, {kind: 'circle', latitude, longitude,
    radius_meters} or {kind: 'polygon', coordinates: [[lon, lat], ...]}. Everything is
    validated here (the client only hints): vertex count, valid non-self-intersecting
    shape, and area within the admin size limits."""
    lim = await size_limits(db)
    kind = area.get("kind")
    default_name: str | None = None
    if kind == "geo_units":
        ids = list(dict.fromkeys(str(i) for i in (area.get("geo_unit_ids") or [])))
        if not ids:
            raise SponsoredError(422, "Pick at least one area")
        if len(ids) > lim["max_geo_units"]:
            raise SponsoredError(422, f"Pick at most {lim['max_geo_units']} areas")
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
        if not lim["circle_radius_min_m"] <= radius <= lim["circle_radius_max_m"]:
            raise SponsoredError(
                422,
                f"Area radius must be between {round(lim['circle_radius_min_m'] * 3.28084)} and "
                f"{round(lim['circle_radius_max_m'] * 3.28084)} feet",
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
        if len(coords) > lim["max_vertices"]:
            raise SponsoredError(422, f"Use at most {lim['max_vertices']} points")
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
        if sqm < lim["area_min_sqm"] - 1:
            raise SponsoredError(422, "That area is too small. Make it bigger")
        if sqm > lim["area_max_sqm"] + 1:
            raise SponsoredError(422, f"That area is too large (limit {lim['area_max_sqmi']:g} sq mi)")
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
    fallback_radius = (await get_game_settings(db)).get("sponsored_claim_proximity_meters", 152.0)
    viewer_plus = bool(user_id and await payments_service.has_premium(db, "user", user_id))
    rows = (
        await db.execute(
            text(f"""
                SELECT s.id, s.site_label, s.message, s.payout_rule, s.remaining_cents,
                       s.cap_per_user_cents, s.site_radius_meters, s.open_to_additions,
                       {_VISIBILITY_COLS},
                       ST_Y(s.site_location::geometry) AS latitude,
                       ST_X(s.site_location::geometry) AS longitude,
                       cl.id AS claim_id, cl.user_id AS claim_user_id, cl.status AS claim_status,
                       cl.before_deadline_at, cl.after_deadline_at, cl.before_submitted_at,
                       COALESCE(s.sponsor_user_id, (SELECT b.created_by FROM partner_businesses b
                                                    WHERE b.id = s.sponsor_business_id)) AS sponsor_uid,
                       (s.sponsor_user_id = :uid
                         OR EXISTS (SELECT 1 FROM partner_businesses b
                                    WHERE b.id = s.sponsor_business_id
                                      AND (b.created_by = :uid
                                           OR EXISTS (SELECT 1 FROM partner_business_admins a
                                                      WHERE a.business_id = b.id AND a.user_id = :uid)))) AS is_mine
                FROM sponsorships s
                LEFT JOIN sponsorship_site_claims cl
                  ON cl.sponsorship_id = s.id AND cl.status IN ('claimed', 'in_progress')
                WHERE s.model = 'site' AND s.status = 'funded' AND s.remaining_cents > 0
                  AND s.topup_of IS NULL
                ORDER BY s.created_at DESC
                LIMIT 200
            """),
            {"early_hours": early_hours, "uid": user_id},
        )
    ).mappings().all()
    # Sites this person gave up in the last 24 hours, so the page can say when they can claim again.
    wait_h = await retake_wait_hours(db)
    frozen: dict[str, str] = {}
    frozen_done: set[str] = set()
    if user_id:
        for fr in (
            await db.execute(
                text("""
                    SELECT sponsorship_id, max(COALESCE(ended_at, after_submitted_at, claimed_at)) + make_interval(hours => :w) AS until,
                           (array_agg(status ORDER BY COALESCE(ended_at, after_submitted_at, claimed_at) DESC))[1] AS last_status
                    FROM sponsorship_site_claims
                    WHERE user_id = :u AND status IN ('released', 'expired', 'submitted')
                      AND COALESCE(ended_at, after_submitted_at, claimed_at) > now() - make_interval(hours => :w)
                    GROUP BY sponsorship_id
                """),
                {"u": str(user_id), "w": wait_h},
            )
        ).all():
            frozen[str(fr[0])] = fr[1].isoformat()
            if fr[2] == "submitted":
                frozen_done.add(str(fr[0]))
    claim_photos = await list_claim_photos(
        db, [str(r["claim_id"]) for r in rows if r["claim_id"] and user_id and str(r["claim_user_id"]) == str(user_id)]
    )
    out = []
    for r in rows:
        mine = bool(user_id and r["claim_user_id"] and str(r["claim_user_id"]) == str(user_id))
        if not _is_visible(r, mine or bool(r["is_mine"])):
            continue
        out.append(
            {
                "id": str(r["id"]),
                "label": r["site_label"],
                "message": r["message"],
                "payout_rule": r["payout_rule"],
                "remaining_cents": r["remaining_cents"],
                "cap_per_user_cents": r["cap_per_user_cents"],
                "open_to_additions": r["open_to_additions"],
                "retake_at": frozen.get(str(r["id"])),
                "retake_reason": "done" if str(r["id"]) in frozen_done else "gave_up",
                "radius_meters": max(r["site_radius_meters"] or 0, fallback_radius),
                "latitude": r["latitude"],
                "longitude": r["longitude"],
                "available": r["claim_id"] is None,
                **_early_fields(r["public_at"], r["early_from"], viewer_plus or mine),
                "claimed_by_me": mine,
                "is_mine": bool(r["is_mine"]),
                "my_claim": (
                    {
                        "id": str(r["claim_id"]),
                        "status": r["claim_status"],
                        "before_deadline_at": r["before_deadline_at"].isoformat() if r["before_deadline_at"] else None,
                        "after_deadline_at": r["after_deadline_at"].isoformat() if r["after_deadline_at"] else None,
                        "started_at": r["before_submitted_at"].isoformat() if r["before_submitted_at"] else None,
                        "sponsor_id": str(r["sponsor_uid"]) if r["sponsor_uid"] and str(r["sponsor_uid"]) != str(user_id) else None,
                        "photos": claim_photos.get(str(r["claim_id"]), []),
                    }
                    if mine
                    else None
                ),
            }
        )
    return out


async def list_map_features(db: AsyncSession, user_id: UUID | None = None) -> dict:
    """Funded pools with money left, shaped for the map: sites are points, group areas are
    simplified geo unit polygons. One read per map load, no per-move queries."""
    fallback_radius = (await get_game_settings(db)).get("sponsored_claim_proximity_meters", 152.0)
    early_hours = await _early_hours(db)
    viewer_plus = bool(user_id and await payments_service.has_premium(db, "user", user_id))
    sites = (
        await db.execute(
            text(f"""
                SELECT s.id, s.site_label, s.remaining_cents, s.payout_rule, s.site_radius_meters, s.open_to_additions,
                       {_VISIBILITY_COLS},
                       ST_Y(s.site_location::geometry) AS latitude,
                       ST_X(s.site_location::geometry) AS longitude,
                       (s.sponsor_user_id = :uid
                            OR EXISTS (SELECT 1 FROM partner_businesses b
                                       WHERE b.id = s.sponsor_business_id
                                         AND (b.created_by = :uid
                                              OR EXISTS (SELECT 1 FROM partner_business_admins a
                                                         WHERE a.business_id = b.id AND a.user_id = :uid)))) AS is_mine,
                       (SELECT pp.id FROM sponsorship_pools pp WHERE pp.sponsorship_id = s.id) AS pool_id,
                       EXISTS (SELECT 1 FROM sponsorship_site_claims cl
                               WHERE cl.sponsorship_id = s.id AND cl.status IN ('claimed', 'in_progress')) AS held
                FROM sponsorships s
                WHERE s.model = 'site' AND s.status = 'funded' AND s.remaining_cents > 0
                  AND s.site_location IS NOT NULL AND s.topup_of IS NULL
                ORDER BY s.created_at DESC
                LIMIT 200
            """),
            {"uid": user_id, "early_hours": early_hours},
        )
    ).mappings().all()
    areas = (
        await db.execute(
            text(f"""
                SELECT s.id, s.payout_rule, s.remaining_cents, s.area_name, s.open_to_additions,
                       (SELECT pp.id FROM sponsorship_pools pp WHERE pp.sponsorship_id = s.id) AS pool_id,
                       {_VISIBILITY_COLS},
                       (s.sponsor_user_id = :uid
                            OR EXISTS (SELECT 1 FROM partner_businesses b
                                       WHERE b.id = s.sponsor_business_id
                                         AND (b.created_by = :uid
                                              OR EXISTS (SELECT 1 FROM partner_business_admins a
                                                         WHERE a.business_id = b.id AND a.user_id = :uid)))) AS is_mine,
                       ST_AsGeoJSON(ST_SimplifyPreserveTopology(s.area_geometry, 0.0003)) AS geojson
                FROM sponsorships s
                WHERE s.model = 'group_area' AND s.status = 'funded' AND s.remaining_cents > 0
                  AND s.area_geometry IS NOT NULL AND s.topup_of IS NULL
                ORDER BY s.created_at DESC
                LIMIT 100
            """),
            {"uid": user_id, "early_hours": early_hours},
        )
    ).mappings().all()
    pools = (
        await db.execute(
            text("""
                SELECT p.id, p.title, p.model, p.goal_cents, p.payout_rule, p.deadline,
                       COALESCE(p.area_name, p.site_label) AS place,
                       COALESCE((SELECT SUM(c.amount_cents) FROM sponsorship_pool_contributions c
                                 WHERE c.pool_id = p.id AND c.status = 'paid'), 0)::int AS raised_cents,
                       ST_Y(ST_PointOnSurface(COALESCE(p.area_geometry, p.site_location::geometry))) AS latitude,
                       ST_X(ST_PointOnSurface(COALESCE(p.area_geometry, p.site_location::geometry))) AS longitude,
                       CASE WHEN p.area_geometry IS NULL THEN NULL
                            ELSE ST_AsGeoJSON(ST_SimplifyPreserveTopology(p.area_geometry, 0.0003)) END AS geojson
                FROM sponsorship_pools p
                WHERE p.status = 'open' AND p.deadline > now()
                ORDER BY p.created_at DESC
                LIMIT 100
            """)
        )
    ).mappings().all()
    return {
        "pools": [
            {
                "id": str(r["id"]),
                "title": r["title"],
                "place": r["place"],
                "model": r["model"],
                "goal_cents": r["goal_cents"],
                "raised_cents": r["raised_cents"],
                "payout_rule": r["payout_rule"],
                "deadline": r["deadline"].isoformat() if r["deadline"] else None,
                "latitude": r["latitude"],
                "longitude": r["longitude"],
                "geometry": json.loads(r["geojson"]) if r["geojson"] else None,
            }
            for r in pools
        ],
        "sites": [
            {
                "id": str(r["id"]),
                "label": r["site_label"],
                "remaining_cents": r["remaining_cents"],
                "payout_rule": r["payout_rule"],
                "radius_meters": max(r["site_radius_meters"] or 0, fallback_radius),
                "latitude": r["latitude"],
                "longitude": r["longitude"],
                "available": not r["held"],
                "pool_id": str(r["pool_id"]) if r["pool_id"] else None,
                "open_to_additions": r["open_to_additions"],
                "is_mine": bool(r["is_mine"]),
                **_early_fields(r["public_at"], r["early_from"], viewer_plus or bool(r["is_mine"])),
            }
            for r in sites
            if _is_visible(r, bool(r["is_mine"]))
        ],
        "areas": [
            {
                "id": str(r["id"]),
                "area_name": r["area_name"],
                "pool_id": str(r["pool_id"]) if r["pool_id"] else None,
                "open_to_additions": r["open_to_additions"],
                "remaining_cents": r["remaining_cents"],
                "payout_rule": r["payout_rule"],
                "is_mine": bool(r["is_mine"]),
                "geometry": json.loads(r["geojson"]),
                **_early_fields(r["public_at"], r["early_from"], viewer_plus or bool(r["is_mine"])),
            }
            for r in areas
            if _is_visible(r, bool(r["is_mine"]))
        ],
    }


async def list_group_areas(
    db: AsyncSession,
    group_id: UUID | None = None,
    lat: float | None = None,
    lon: float | None = None,
    user_id: UUID | None = None,
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
                SELECT s.id, s.payout_rule, s.remaining_cents, s.message, s.area_name, s.open_to_additions,
                       {_VISIBILITY_COLS},
                       ST_Y(ST_PointOnSurface(s.area_geometry)) AS latitude,
                       ST_X(ST_PointOnSurface(s.area_geometry)) AS longitude,
                       CASE WHEN s.area_geometry IS NULL THEN NULL
                            ELSE ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_GeometryN(ST_Multi(s.area_geometry), 1), 0.0003)) END AS geojson,
                       (s.sponsor_user_id = :uid
                         OR EXISTS (SELECT 1 FROM partner_businesses b
                                    WHERE b.id = s.sponsor_business_id
                                      AND (b.created_by = :uid
                                           OR EXISTS (SELECT 1 FROM partner_business_admins a
                                                      WHERE a.business_id = b.id AND a.user_id = :uid)))) AS is_mine
                FROM sponsorships s
                WHERE s.model = 'group_area' AND s.status = 'funded' AND s.remaining_cents > 0
                  AND (s.directed_group_id IS NULL OR s.directed_group_id = CAST(:gid AS uuid))
                  AND (NOT :located OR (s.area_geometry IS NOT NULL AND ST_Intersects(
                        s.area_geometry, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))))
                ORDER BY s.created_at DESC
                LIMIT 200
            """),
            {"early_hours": early_hours, "located": located, "lat": lat or 0, "lon": lon or 0, "uid": user_id,
             "gid": str(group_id) if group_id else None},
        )
    ).mappings().all()
    out = []
    for r in rows:
        if not _is_visible(r, bool(r["is_mine"])):
            continue
        available = await _pool_available_cents(db, r["id"], group_id, include_holds=True)
        out.append(
            {
                "id": str(r["id"]),
                "area_name": r["area_name"],
                "latitude": r["latitude"],
                "longitude": r["longitude"],
                "geojson": json.loads(r["geojson"]) if r["geojson"] else None,
                "open_to_additions": r["open_to_additions"],
                "message": r["message"],
                "payout_rule": r["payout_rule"],
                "remaining_cents": r["remaining_cents"],
                "available_cents": available,
                "is_mine": bool(r["is_mine"]),
                **_early_fields(r["public_at"], r["early_from"], group_plus),
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
                RETURNING user_id, sponsorship_id
            """)
        )
    ).fetchall()
    if not expired:
        return
    await db.commit()
    from app.services.marketplace import _notify_safe

    wait_h = await retake_wait_hours(db)
    for row in expired:
        await _notify_safe(
            db, row.user_id, "claim_expired", "You lost a site",
            "You ran out of time on a sponsored site, so it went back on the board. "
            f"You can take it again after {wait_h} hours. This is not a strike.",
            f"/earn/sites/{row.sponsorship_id}", "View site", email=False,
        )


async def _assert_near_site(
    db: AsyncSession, sponsorship_id: UUID, lat: float | None, lon: float | None, override: bool = False
) -> bool:
    """Server-side proximity re-check against the site point, never the client's own math.
    Returns True when the person was not verified on site but used the override, so the claim is
    flagged for admin review (same as marketplace jobs)."""
    if lat is None or lon is None:
        if override:
            return True
        raise SponsoredError(422, "Turn on location so we can confirm you are at the site.")
    settings = await get_game_settings(db)
    row = (
        await db.execute(
            text("""
                SELECT ST_DWithin(
                    s.site_location,
                    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                    CAST(GREATEST(COALESCE(s.site_radius_meters, 0), :fallback) AS double precision)
                )
                FROM sponsorships s
                WHERE s.id = :id AND s.model = 'site'
            """),
            {
                "id": str(sponsorship_id),
                "lat": lat,
                "lon": lon,
                "fallback": settings.get("sponsored_claim_proximity_meters", 152.0),
            },
        )
    ).fetchone()
    if row is None:
        raise SponsoredError(404, "Sponsored site not found")
    if not row[0]:
        if override:
            return True
        raise SponsoredError(403, "You need to be at the sponsored site to do this")
    return False


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


async def pool_holds_cents(db: AsyncSession, sponsorship_id: UUID, exclude_group_id: UUID | None = None) -> int:
    """Money held back for upcoming events on this pool. Each group holds the lesser of its events'
    maximum payouts and what its weekly ceiling still allows, so one crew cannot lock the whole pool
    by scheduling many events. A group's own holds are left out when asking on its behalf: its own
    ceiling already limits it."""
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
    total = 0
    for gid, wanted in per_group.items():
        remaining = (await earning_limits.group_weekly_status(db, UUID(gid)))["remaining_cents"]
        total += max(0, min(wanted, remaining))
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
    row = (
        await db.execute(
            text(f"""
                SELECT {_VISIBILITY_COLS} FROM sponsorships s
                WHERE s.id = :id AND s.funded_at IS NOT NULL
            """),
            {"id": str(sponsorship_id), "early_hours": early_hours},
        )
    ).mappings().first()
    if row is None:
        return
    now = datetime.now(timezone.utc)
    if row["early_from"] > now:
        raise SponsoredError(403, "This one has not opened yet.")
    in_window = row["early_from"] <= now < row["public_at"]
    if in_window and not await payments_service.has_premium(db, owner_type, owner_id):
        raise SponsoredError(403, "This one is open to Frontline Plus members first. It opens to everyone soon.")


async def _assert_claim_allowed(
    db: AsyncSession, sponsorship_id: UUID, user_id: UUID, tz_name: str | None
) -> None:
    """Fraud and fairness checks before a site claim: not your own site, not over the weekly
    ceiling, and (for multi-use sites) only once per local day per site."""
    row = (
        await db.execute(
            text("SELECT sponsor_user_id, payout_rule FROM sponsorships WHERE id = :id"), {"id": str(sponsorship_id)}
        )
    ).fetchone()
    if row is None:
        return
    if row.sponsor_user_id is not None and row.sponsor_user_id == user_id:
        raise SponsoredError(403, "You can't claim a site you sponsored yourself.")
    busy_job = (
        await db.execute(
            text("SELECT 1 FROM marketplace_jobs WHERE cleaner_id = :u AND status IN ('accepted', 'in_progress') LIMIT 1"),
            {"u": str(user_id)},
        )
    ).first()
    if busy_job:
        raise SponsoredError(409, "You already have an active job. Finish it or cancel it before claiming a site.")
    wait_h = await retake_wait_hours(db)
    froze = (
        await db.execute(
            text("""
                SELECT ended_at + make_interval(hours => :w) AS until FROM sponsorship_site_claims
                WHERE sponsorship_id = :sid AND user_id = :u AND status IN ('released', 'expired')
                  AND ended_at > now() - make_interval(hours => :w)
                ORDER BY ended_at DESC LIMIT 1
            """),
            {"sid": str(sponsorship_id), "u": str(user_id), "w": wait_h},
        )
    ).fetchone()
    if froze:
        mins = max(1, int((froze.until - datetime.now(timezone.utc)).total_seconds() // 60))
        h, m = divmod(mins, 60)
        left = f"{h} hr {m} min" if h and m else f"{h} hr" if h else f"{m} min"
        raise SponsoredError(409, f"You gave this site up recently. You can claim it again in {left}, or pick another site.")
    if row.payout_rule.get("one_winner"):
        return
    if await earning_limits.is_locked(db, user_id):
        raise SponsoredError(403, earning_limits.LOCKED_MESSAGE)
    # Same 24 hour wait as giving a site up: one paid cleanup per person per site per day.
    done = (
        await db.execute(
            text("""
                SELECT max(COALESCE(ended_at, after_submitted_at, claimed_at)) + make_interval(hours => :w) AS until
                FROM sponsorship_site_claims
                WHERE sponsorship_id = :sid AND user_id = :u AND status = 'submitted'
                  AND COALESCE(ended_at, after_submitted_at, claimed_at) > now() - make_interval(hours => :w)
            """),
            {"sid": str(sponsorship_id), "u": str(user_id), "w": wait_h},
        )
    ).fetchone()
    if done and done.until:
        mins = max(1, int((done.until - datetime.now(timezone.utc)).total_seconds() // 60))
        h, m = divmod(mins, 60)
        left = f"{h} hr {m} min" if h and m else f"{h} hr" if h else f"{m} min"
        raise SponsoredError(409, f"You already cleaned this site today. You can claim it again in {left}, or pick another site.")


async def claim_site(
    db: AsyncSession, sponsorship_id: UUID, user_id: UUID, lat: float | None, lon: float | None, tz_name: str | None = None
) -> dict:
    # No proximity check at claim: like jobs, the claimer gets a travel window (before_deadline_at) to get
    # there. Being on site is enforced when the before and after photos are submitted.
    await _expire_all_stale(db)
    await _assert_claim_allowed(db, sponsorship_id, user_id, tz_name)
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
                    "window": int(settings.get("marketplace_arrive_minutes", 60)),
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


async def _record_claim_photo(
    db: AsyncSession, sponsorship_id: UUID, user_id: UUID, kind: str, url: str,
    lat: float | None, lon: float | None, late: bool,
) -> None:
    await db.execute(
        text("""
            INSERT INTO sponsorship_claim_photos (claim_id, uploader_id, kind, url, latitude, longitude, late)
            SELECT id, user_id, :kind, :url, :lat, :lon, :late FROM sponsorship_site_claims
            WHERE sponsorship_id = :sid AND user_id = :uid
            ORDER BY created_at DESC LIMIT 1
        """),
        {"kind": kind, "url": url, "lat": lat, "lon": lon, "late": late, "sid": str(sponsorship_id), "uid": str(user_id)},
    )


async def add_more_photo(
    db: AsyncSession, sponsorship_id: UUID, user_id: UUID, kind: str, photo_url: str, lat: float | None, lon: float | None,
    override: bool = False,
) -> dict:
    """Extra before/after photos. Once the work is submitted (awaiting review) they are flagged as added
    later so the reviewer can tell."""
    if kind not in ("before", "after"):
        raise SponsoredError(422, "Invalid photo kind")
    claim = (
        await db.execute(
            text("""SELECT id, status FROM sponsorship_site_claims
                    WHERE sponsorship_id = :sid AND user_id = :uid ORDER BY created_at DESC LIMIT 1"""),
            {"sid": str(sponsorship_id), "uid": str(user_id)},
        )
    ).fetchone()
    if claim is None or claim.status not in ("in_progress", "submitted"):
        raise SponsoredError(409, "You can add photos while the cleanup is in progress or waiting for review.")
    if claim.status == "submitted":
        pending = (
            await db.execute(
                text("SELECT 1 FROM sponsorship_allocations WHERE claim_id = :c AND status = 'pending_review'"),
                {"c": str(claim.id)},
            )
        ).fetchone()
        if pending is None:
            raise SponsoredError(409, "This cleanup has already been reviewed.")
    await _assert_near_site(db, sponsorship_id, lat, lon, override)
    await _record_claim_photo(db, sponsorship_id, user_id, kind, photo_url, lat, lon, late=claim.status == "submitted")
    await db.commit()
    return {"ok": True}


async def add_claim_track_points(db: AsyncSession, sponsorship_id: UUID, user_id: UUID, points: list[dict]) -> dict:
    """Route points from the claimant's device while the cleanup is in progress. Re-sent points are ignored."""
    claim = (
        await db.execute(
            text("""SELECT id, status FROM sponsorship_site_claims
                    WHERE sponsorship_id = :sid AND user_id = :uid ORDER BY created_at DESC LIMIT 1"""),
            {"sid": str(sponsorship_id), "uid": str(user_id)},
        )
    ).fetchone()
    if claim is None:
        raise SponsoredError(404, "Claim not found")
    if claim.status != "in_progress":
        raise SponsoredError(409, "Route points are only recorded while the cleanup is in progress.")
    for p in points[:200]:
        await db.execute(
            text("""INSERT INTO sponsorship_claim_track_points (claim_id, user_id, latitude, longitude, accuracy_m, recorded_at)
                    VALUES (:c, :u, :lat, :lng, :acc, :at) ON CONFLICT (claim_id, recorded_at) DO NOTHING"""),
            {"c": str(claim.id), "u": str(user_id), "lat": p["latitude"], "lng": p["longitude"],
             "acc": p.get("accuracy"), "at": p["recorded_at"]},
        )
    await db.commit()
    n = (
        await db.execute(text("SELECT count(*) FROM sponsorship_claim_track_points WHERE claim_id = :c"), {"c": str(claim.id)})
    ).scalar_one()
    return {"points": n}


def _haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    from math import asin, cos, radians, sin, sqrt

    dlat, dlng = radians(b[0] - a[0]), radians(b[1] - a[1])
    h = sin(dlat / 2) ** 2 + cos(radians(a[0])) * cos(radians(b[0])) * sin(dlng / 2) ** 2
    return 2 * 6371000 * asin(sqrt(h))


async def get_claim_track(db: AsyncSession, claim_id: UUID) -> dict:
    """Admin review: the recorded route plus where each photo was taken."""
    flags = (
        await db.execute(
            text("SELECT track_flagged, track_flag_reason FROM sponsorship_site_claims WHERE id = :c"),
            {"c": str(claim_id)},
        )
    ).first()
    rows = (
        await db.execute(
            text("""SELECT latitude, longitude, accuracy_m, recorded_at FROM sponsorship_claim_track_points
                    WHERE claim_id = :c ORDER BY recorded_at LIMIT 5000"""),
            {"c": str(claim_id)},
        )
    ).mappings().all()
    pts = [
        {"latitude": r["latitude"], "longitude": r["longitude"], "accuracy_m": r["accuracy_m"], "recorded_at": r["recorded_at"].isoformat()}
        for r in rows
    ]
    shots = (
        await db.execute(
            text("""SELECT kind, latitude, longitude, created_at FROM sponsorship_claim_photos
                    WHERE claim_id = :c AND deleted_at IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
                    ORDER BY created_at"""),
            {"c": str(claim_id)},
        )
    ).mappings().all()
    dist = sum(_haversine_m((a["latitude"], a["longitude"]), (b["latitude"], b["longitude"])) for a, b in zip(pts, pts[1:]))
    return {
        "points": pts,
        "distance_m": round(dist),
        "photos": [{"kind": r["kind"], "latitude": r["latitude"], "longitude": r["longitude"], "created_at": r["created_at"].isoformat()} for r in shots],
        "track_flagged": bool(flags.track_flagged) if flags else False,
        "track_flag_reason": flags.track_flag_reason if flags else None,
    }


async def delete_claim_photo(db: AsyncSession, sponsorship_id: UUID, user_id: UUID, photo_id: UUID) -> dict:
    row = (
        await db.execute(
            text("""
                UPDATE sponsorship_claim_photos p SET deleted_at = now(), deleted_by = :uid
                FROM sponsorship_site_claims c
                WHERE p.id = :pid AND p.claim_id = c.id AND c.sponsorship_id = :sid AND c.user_id = :uid
                  AND p.uploader_id = :uid AND p.deleted_at IS NULL
                  AND (c.status = 'in_progress' OR EXISTS (
                        SELECT 1 FROM sponsorship_allocations a WHERE a.claim_id = c.id AND a.status = 'pending_review'))
                RETURNING p.id
            """),
            {"pid": str(photo_id), "sid": str(sponsorship_id), "uid": str(user_id)},
        )
    ).fetchone()
    await db.commit()
    if row is None:
        raise SponsoredError(404, "Photo not found or can no longer be changed")
    return {"ok": True}


async def list_claim_photos(db: AsyncSession, claim_ids: list[str]) -> dict[str, list[dict]]:
    if not claim_ids:
        return {}
    rows = (
        await db.execute(
            text("""SELECT id, claim_id, kind, url, late, created_at, deleted_at
                    FROM sponsorship_claim_photos WHERE claim_id = ANY(CAST(:ids AS uuid[])) ORDER BY created_at"""),
            {"ids": claim_ids},
        )
    ).mappings().all()
    out: dict[str, list[dict]] = {}
    for r in rows:
        out.setdefault(str(r["claim_id"]), []).append(
            {"id": str(r["id"]), "kind": r["kind"], "url": r["url"], "late": r["late"],
             "created_at": r["created_at"].isoformat(),
             "deleted_at": r["deleted_at"].isoformat() if r["deleted_at"] else None}
        )
    return out


async def list_my_claims(db: AsyncSession, user_id: UUID) -> list[dict]:
    """The caller's finished-but-unreviewed cleanups, so they can add photos if a reviewer asks."""
    rows = (
        await db.execute(
            text("""
                SELECT c.id AS claim_id, c.sponsorship_id, s.site_label, a.status AS allocation_status, a.amount_cents
                FROM sponsorship_site_claims c
                JOIN sponsorships s ON s.id = c.sponsorship_id
                JOIN sponsorship_allocations a ON a.claim_id = c.id
                WHERE c.user_id = :u AND c.status = 'submitted' AND a.status = 'pending_review'
                ORDER BY c.created_at DESC LIMIT 20
            """),
            {"u": str(user_id)},
        )
    ).mappings().all()
    photos = await list_claim_photos(db, [str(r["claim_id"]) for r in rows])
    return [
        {"claim_id": str(r["claim_id"]), "sponsorship_id": str(r["sponsorship_id"]), "label": r["site_label"],
         "amount_cents": r["amount_cents"], "photos": photos.get(str(r["claim_id"]), [])}
        for r in rows
    ]


async def claim_result(db: AsyncSession, sponsorship_id: UUID, user_id: UUID) -> dict | None:
    """The caller's latest finished claim on a site: waiting for review, or what they earned.
    Only shown for two weeks so the page does not carry old news forever."""
    r = (
        await db.execute(
            text("""
                SELECT a.status, a.amount_cents, a.paid_out_at
                FROM sponsorship_site_claims c
                JOIN sponsorship_allocations a ON a.claim_id = c.id
                WHERE c.sponsorship_id = :sid AND c.user_id = :u AND c.status = 'submitted'
                  AND c.after_submitted_at > now() - interval '14 days'
                ORDER BY c.after_submitted_at DESC LIMIT 1
            """),
            {"sid": str(sponsorship_id), "u": str(user_id)},
        )
    ).mappings().first()
    if not r:
        return None
    return {"status": r["status"], "amount_cents": r["amount_cents"],
            "paid_out_at": r["paid_out_at"].isoformat() if r["paid_out_at"] else None}


async def submit_before_photo(
    db: AsyncSession,
    sponsorship_id: UUID,
    user_id: UUID,
    photo_url: str,
    lat: float | None,
    lon: float | None,
    override: bool = False,
    reason: str | None = None,
) -> dict:
    await _expire_all_stale(db)
    flagged = await _assert_near_site(db, sponsorship_id, lat, lon, override)
    settings = await get_game_settings(db)
    row = (
        await db.execute(
            text("""
                UPDATE sponsorship_site_claims
                SET status = 'in_progress',
                    before_photo_url = :photo_url,
                    before_location = CASE WHEN CAST(:lat AS double precision) IS NULL THEN NULL
                        ELSE ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography END,
                    before_submitted_at = now(),
                    location_flagged = location_flagged OR :flagged,
                    location_flag_reason = CASE WHEN :flagged THEN :reason ELSE location_flag_reason END,
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
                "flagged": flagged,
                "reason": (reason or "").strip()[:300] or None,
                "window": int(settings.get("sponsored_claim_work_window_minutes", 120)),
            },
        )
    ).fetchone()
    if row is None:
        await db.commit()  # keep the expiry side effects
        raise SponsoredError(409, "Claim is not active or has expired")
    await _record_claim_photo(db, sponsorship_id, user_id, "before", photo_url, lat, lon, late=False)
    await db.commit()
    return {"status": "in_progress", "after_deadline_at": row.after_deadline_at.isoformat(), "flagged": flagged}


async def extend_claim(db: AsyncSession, sponsorship_id: UUID, user_id: UUID) -> dict:
    """Add time to the cleanup window, so a big site does not cut people off. Capped from the start time."""
    await _expire_all_stale(db)
    settings = await get_game_settings(db)
    add = int(settings.get("sponsored_claim_extend_minutes", 60))
    cap = int(settings.get("sponsored_claim_max_total_minutes", 360))
    row = (
        await db.execute(
            text("""
                UPDATE sponsorship_site_claims
                SET after_deadline_at = LEAST(after_deadline_at + make_interval(mins => :add),
                                              before_submitted_at + make_interval(mins => :cap))
                WHERE sponsorship_id = :id AND user_id = :user_id
                  AND status = 'in_progress' AND after_deadline_at > now()
                  AND after_deadline_at < before_submitted_at + make_interval(mins => :cap)
                RETURNING after_deadline_at
            """),
            {"id": str(sponsorship_id), "user_id": str(user_id), "add": add, "cap": cap},
        )
    ).fetchone()
    await db.commit()
    if row is None:
        raise SponsoredError(409, "You cannot add more time to this site. It may be at the longest allowed time, or no longer active.")
    return {"after_deadline_at": row.after_deadline_at.isoformat()}


async def submit_after_photo(
    db: AsyncSession,
    sponsorship_id: UUID,
    user_id: UUID,
    photo_url: str,
    lat: float | None,
    lon: float | None,
    bags: int | None,
    override: bool = False,
    reason: str | None = None,
    bags_ack: bool = False,
    track_override: bool = False,
    track_reason: str | None = None,
) -> dict:
    """Finish the claim and queue a pending_review allocation sized by the payout rule,
    trimmed to what the pool has left."""
    await _expire_all_stale(db)
    flagged = await _assert_near_site(db, sponsorship_id, lat, lon, override)
    if not bags_ack:
        raise SponsoredError(422, "Confirm that all the bags are in your finished photo before you submit.")

    rule_row = (
        await db.execute(text("SELECT payout_rule FROM sponsorships WHERE id = :id"), {"id": str(sponsorship_id)})
    ).fetchone()
    if rule_row is not None:
        needed = min_large_bags(rule_row.payout_rule)
        if not bags or bags < needed:
            # Checked before the claim closes, so the cleaner can fix the count and resubmit.
            raise SponsoredError(
                422,
                f"This site needs at least {needed} large bag{'' if needed == 1 else 's'} collected "
                "to be paid. Enter how many large bags you filled.",
            )

    # Route tracking is required, but a dead phone must never strand a cleaner without pay: with too few
    # points they can finish through the override, which flags the claim for admin review.
    min_pts = int((await get_game_settings(db)).get("marketplace_min_track_points", 3))
    pts = (
        await db.execute(
            text("""SELECT count(*) FROM sponsorship_claim_track_points t
                    JOIN sponsorship_site_claims c ON c.id = t.claim_id
                    WHERE c.sponsorship_id = :id AND c.user_id = :u AND c.status = 'in_progress'"""),
            {"id": str(sponsorship_id), "u": str(user_id)},
        )
    ).scalar_one()
    track_flagged = pts < min_pts
    if track_flagged and not track_override:
        raise SponsoredError(
            422,
            "We did not record your route for this site. Keep the app open while you work. "
            "If your phone or signal failed, you can finish anyway and we will review it.",
        )

    claim = (
        await db.execute(
            text("""
                UPDATE sponsorship_site_claims
                SET status = 'submitted',
                    after_photo_url = :photo_url,
                    after_location = CASE WHEN CAST(:lat AS double precision) IS NULL THEN NULL
                        ELSE ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography END,
                    after_submitted_at = now(),
                    location_flagged = location_flagged OR :flagged,
                    location_flag_reason = CASE WHEN :flagged THEN COALESCE(:reason, location_flag_reason)
                        ELSE location_flag_reason END,
                    track_flagged = :tf, track_flag_reason = :tr,
                    bags_ack_at = now(), bags_count = :bags,
                    ended_at = now()
                WHERE sponsorship_id = :id AND user_id = :user_id
                  AND status = 'in_progress' AND after_deadline_at > now()
                RETURNING id
            """),
            {
                "id": str(sponsorship_id), "user_id": str(user_id), "photo_url": photo_url, "lat": lat, "lon": lon,
                "flagged": flagged, "reason": (reason or "").strip()[:300] or None,
                "tf": track_flagged, "tr": ((track_reason or "").strip()[:300] or None) if track_flagged else None,
                "bags": max(0, min(int(bags or 0), 500)),
            },
        )
    ).fetchone()
    if claim is None:
        await db.commit()
        raise SponsoredError(409, "Claim is not active or has expired")
    await _record_claim_photo(db, sponsorship_id, user_id, "after", photo_url, lat, lon, late=False)

    pool = (
        await db.execute(
            text("SELECT payout_rule FROM sponsorships WHERE id = :id"),
            {"id": str(sponsorship_id)},
        )
    ).fetchone()
    # No per-person or per-day dollar cap: the payout is the rule's amount, trimmed to what the
    # pool has left. Once a day and the weekly ceiling are checked when the claim is made.
    amount = _rule_amount(pool.payout_rule, bags)
    amount = min(amount, await _pool_available_cents(db, sponsorship_id))

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
    if allocation_id:
        from app.services.marketplace import _notify_admins, _notify_safe

        await _notify_safe(
            db, user_id, "earn_submitted", "Cleanup submitted",
            "Your cleanup is waiting for review. You will hear back once it is checked.", "/earn", "Open Earn", email=False,
        )
        await _notify_admins(
            db, "earn_review_needed", "Cleanup waiting for review",
            f"A sponsored cleanup for ${amount / 100:.2f} needs review.", "/earn", email=False,
        )
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
    """Kept under its old name for the /my-limits route: the weekly earning ceiling status."""
    return await earning_limits.weekly_status(db, user_id)


async def validate_event_pool(
    db: AsyncSession,
    sponsorship_id: UUID,
    group_id: UUID,
    lat: float,
    lon: float,
    scheduled_start: datetime | None = None,
    tz_name: str | None = None,
) -> None:
    """An event can only attach to a funded group-area pool, and must sit inside its area."""
    row = (
        await db.execute(
            text("""
                SELECT s.model, s.status, s.remaining_cents, s.directed_group_id,
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
    if row.directed_group_id is not None and row.directed_group_id != group_id:
        raise SponsoredError(403, "This sponsored area was handed to a specific group.")
    if not row.inside:
        raise SponsoredError(422, "The event location is outside the sponsored area")
    await _assert_early_access(db, sponsorship_id, "group", group_id)
    if not await connect.group_payouts_ready(db, group_id):
        raise SponsoredError(
            409, "Your group needs a payout account before it can host a sponsored event. A group admin can add one on the group page."
        )
    # First come, first reserved: other groups' upcoming events hold money back, and a group that
    # has already earned its cap on this pool cannot take another slot.
    if await _pool_available_cents(db, sponsorship_id, group_id, include_holds=True) <= 0:
        raise SponsoredError(
            409, "All of this pool's money is reserved by other upcoming events. Check back if one is cancelled."
        )
    if (await earning_limits.group_weekly_status(db, group_id))["locked"]:
        raise SponsoredError(409, earning_limits.GROUP_LOCKED_MESSAGE)
    await _assert_group_once_per_day(db, sponsorship_id, group_id, scheduled_start, tz_name)


async def _assert_group_once_per_day(
    db: AsyncSession, sponsorship_id: UUID, group_id: UUID, start: datetime | None, tz_name: str | None
) -> None:
    """A group can hold one event per sponsored area per local calendar day."""
    if start is None:
        return
    day_start, day_end = earning_limits.local_day_bounds_utc(start, tz_name)
    clash = (
        await db.execute(
            text("""
                SELECT 1 FROM cleanups
                WHERE sponsorship_id = :sid AND group_id = :gid AND status = ANY(:statuses)
                  AND scheduled_start >= :d0 AND scheduled_start < :d1
                LIMIT 1
            """),
            {"sid": str(sponsorship_id), "gid": str(group_id), "statuses": list(HOLD_STATUSES), "d0": day_start, "d1": day_end},
        )
    ).fetchone()
    if clash:
        raise SponsoredError(409, "Your group already has an event on this sponsored area that day. A group can earn from an area once a day.")


async def queue_group_allocation(db: AsyncSession, cleanup_id: UUID, attendee_count: int) -> dict | None:
    """Called after an organizer logs a team total for an event tied to a group-area pool.
    Queues (or refreshes) one pending_review allocation paying the host group. Re-logging
    replaces a pending allocation; an approved or paid one is never touched. Does not commit."""
    ev = (
        await db.execute(
            text("""
                SELECT group_id, sponsorship_id,
                       COALESCE(metrics_small_bags, 0) + COALESCE(metrics_large_bags, 0) AS bags,
                       COALESCE(metrics_large_bags, 0) AS large_bags
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
    if int(ev.large_bags) < min_large_bags(rule):
        return None  # not enough collected to earn from this area
    amount = _rule_amount(rule, int(ev.bags))
    if rule["type"] == "equal_split":
        amount *= max(0, attendee_count)
    amount = min(amount, await _pool_available_cents(db, ev.sponsorship_id, ev.group_id, include_holds=True))

    # A sponsor cannot pay themselves through a group they created.
    self_paid = (
        await db.execute(
            text("""
                SELECT 1 FROM sponsorships s JOIN groups g ON g.id = :gid
                WHERE s.id = :sid AND s.sponsor_user_id IS NOT NULL AND s.sponsor_user_id = g.created_by
            """),
            {"sid": str(ev.sponsorship_id), "gid": str(ev.group_id)},
        )
    ).fetchone()
    if self_paid:
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
                       a.reviewed_at, a.reject_reason, a.paid_out_at, a.payout_error, a.stripe_transfer_id,
                       a.user_id, p.display_name AS user_name, p.username,
                       a.group_id, g.name AS group_name,
                       a.is_direct, s.site_label, s.model, s.remaining_cents,
                       cl.before_photo_url, cl.after_photo_url, a.claim_id,
                       cl.location_flagged, cl.location_flag_reason, cl.track_flagged, cl.track_flag_reason,
                       cl.bags_count,
                       ROUND(ST_Distance(s.site_location, cl.before_location))::int AS before_distance_m,
                       ROUND(ST_Distance(s.site_location, cl.after_location))::int AS after_distance_m,
                       ST_Y(s.site_location::geometry) AS site_lat, ST_X(s.site_location::geometry) AS site_lng,
                       ST_Y(cl.before_location::geometry) AS before_lat, ST_X(cl.before_location::geometry) AS before_lng,
                       ST_Y(cl.after_location::geometry) AS after_lat, ST_X(cl.after_location::geometry) AS after_lng,
                       ROUND(EXTRACT(EPOCH FROM (cl.after_submitted_at - cl.before_submitted_at)) / 60)::int AS minutes_on_site,
                       EXTRACT(EPOCH FROM (now() - p.created_at)) / 86400 AS account_age_days,
                       (SELECT COUNT(*) FROM sponsorship_allocations o
                         WHERE o.user_id = a.user_id AND o.sponsorship_id = a.sponsorship_id
                           AND o.status <> 'rejected' AND o.id <> a.id
                           AND o.created_at > a.created_at - interval '30 days') AS repeat_same_site,
                       (SELECT COUNT(DISTINCT o.sponsorship_id) FROM sponsorship_allocations o
                         JOIN sponsorships os ON os.id = o.sponsorship_id
                         WHERE o.user_id = a.user_id AND o.status <> 'rejected' AND o.sponsorship_id <> a.sponsorship_id
                           AND o.created_at BETWEEN a.created_at - interval '24 hours' AND a.created_at + interval '24 hours'
                           AND ((s.sponsor_user_id IS NOT NULL AND os.sponsor_user_id = s.sponsor_user_id)
                             OR (s.sponsor_business_id IS NOT NULL AND os.sponsor_business_id = s.sponsor_business_id))
                       ) AS back_to_back_same_sponsor
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
    new_days = float((await get_game_settings(db)).get("fraud_new_account_days", 7))
    out = []
    for r in rows:
        d = dict(r)
        age = d.pop("account_age_days", None)
        repeat = int(d.pop("repeat_same_site") or 0)
        b2b = int(d.pop("back_to_back_same_sponsor") or 0)
        flags = []
        if d.get("location_flagged"):
            why = d.get("location_flag_reason")
            flags.append("Location override: not verified at the site" + (f" ({why})" if why else ""))
        if d.get("track_flagged"):
            why = d.get("track_flag_reason")
            flags.append("No route recorded" + (f" ({why})" if why else ""))
        if age is not None and float(age) < new_days:
            flags.append(f"New account ({int(float(age))} days old)")
        if repeat >= 2:
            flags.append(f"Paid {repeat + 1} times from this site in 30 days")
        if b2b:
            flags.append(f"Also paid from {b2b} other site{'s' if b2b != 1 else ''} by the same sponsor within a day")
        out.append({**d, "id": str(r["id"]), "sponsorship_id": str(r["sponsorship_id"]), "fraud_flags": flags})
    by_claim = await list_claim_photos(db, [str(r["claim_id"]) for r in rows if r["claim_id"]])
    for o, r in zip(out, rows):
        o["claim_id"] = str(r["claim_id"]) if r["claim_id"] else None
        o["photos"] = by_claim.get(o["claim_id"] or "", [])
    return out


async def _tell_recipient(db: AsyncSession, allocation_id: UUID, kind: str, title: str, body: str) -> None:
    from app.services.marketplace import _notify_safe

    uid = (
        await db.execute(text("SELECT user_id FROM sponsorship_allocations WHERE id = :id"), {"id": str(allocation_id)})
    ).scalar()
    if uid:
        await _notify_safe(db, uid, kind, title, body, "/earn", "Open Earn")


async def _tell_sponsor_of_cleanup(db: AsyncSession, sponsorship_id: UUID, amount_cents: int) -> None:
    """Let the sponsor know their money did something, and when the pool runs dry."""
    from app.services.marketplace import _notify_safe

    s = (
        await db.execute(
            text("SELECT sponsor_user_id, site_label, area_name, status FROM sponsorships WHERE id = :id"),
            {"id": str(sponsorship_id)},
        )
    ).first()
    if s is None or not s.sponsor_user_id:
        return
    place = s.site_label or s.area_name or "your sponsorship"
    if s.status == "exhausted":
        await _notify_safe(
            db, s.sponsor_user_id, "sponsorship_exhausted", "Your sponsorship is fully used",
            f"Every dollar of {place} has gone to cleanups. Thank you. You can add more any time.", "/earn", "Open Earn",
        )
    else:
        await _notify_safe(
            db, s.sponsor_user_id, "sponsorship_cleanup_approved", "A cleanup you sponsored got done",
            f"${amount_cents / 100:.2f} from {place} paid for an approved cleanup.", "/earn", "Open Earn", email=False,
        )


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
        await _tell_recipient(
            db, allocation_id, "earn_rejected", "Reward not approved",
            reject_reason or "Your cleanup did not pass review.",
        )
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
    from app.services import earn_payouts

    await _tell_recipient(db, allocation_id, "earn_approved", "Reward approved", "Your cleanup was approved.")
    await _tell_sponsor_of_cleanup(db, alloc.sponsorship_id, alloc.amount_cents)
    paid = await earn_payouts.pay_allocation(db, allocation_id)
    return {"status": paid["status"] if paid["status"] == "paid_out" else "approved", "payout": paid["status"]}


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
    await _tell_recipient(db, allocation_id, "earn_paid", "You got paid", "Your reward was paid out. Thanks for cleaning up.")
    return {"status": "paid_out"}


def encode_rule(rule: dict) -> str:
    return json.dumps(rule)
