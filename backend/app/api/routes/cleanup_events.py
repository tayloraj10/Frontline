import json
import secrets
from datetime import datetime, timedelta
from typing import Literal
from uuid import UUID

import h3
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services.contribution_scoring import LARGE_BAG_VALUE, POUND_VALUE, SMALL_BAG_VALUE, record_contribution

router = APIRouter(prefix="/cleanup-events", tags=["cleanup-events"])

# Separate router (same file, distinct prefix) for cleanup routes — a polyline
# alternative to a single point, usable by individuals, groups, and group events.
routes_router = APIRouter(prefix="/cleanup-routes", tags=["cleanup-routes"])

# How close (and how early/late) a check-in may be relative to the event's own location
# and schedule. Named alongside contributions.py's HOTSPOT_PROXIMITY_METERS_* constants.
CLEANUP_EVENT_PROXIMITY_METERS = 150.0
CLEANUP_EVENT_GRACE_MINUTES_BEFORE = 30
CLEANUP_EVENT_GRACE_MINUTES_AFTER = 120

# Excludes visually ambiguous characters (0/O, 1/I/L) since join codes are read off a
# phone screen or shouted across a parking lot.
JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
JOIN_CODE_LENGTH = 6


class CreateCleanupEventRequest(BaseModel):
    campaign_id: UUID
    group_id: UUID
    organizer_user_id: UUID
    title: str
    description: str | None = None
    scheduled_start: datetime
    scheduled_end: datetime | None = None
    latitude: float
    longitude: float
    image_url: str | None = None
    max_attendees: int | None = None
    external_link: str | None = None
    route: dict | None = None

    @field_validator("max_attendees")
    @classmethod
    def _positive_capacity(cls, v: int | None) -> int | None:
        if v is not None and v < 1:
            raise ValueError("max_attendees must be at least 1")
        return v

    @field_validator("external_link")
    @classmethod
    def _valid_link(cls, v: str | None) -> str | None:
        if v is not None and not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("external_link must start with http:// or https://")
        return v

    @field_validator("route")
    @classmethod
    def _valid_linestring(cls, v: dict | None) -> dict | None:
        if v is None:
            return v
        if v.get("type") != "LineString":
            raise ValueError("route must be a GeoJSON LineString")
        coords = v.get("coordinates")
        if not isinstance(coords, list) or len(coords) < 2:
            raise ValueError("route must have at least 2 coordinates")
        return v


class PatchCleanupEventRequest(BaseModel):
    organizer_user_id: UUID
    title: str | None = None
    description: str | None = None
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None
    image_url: str | None = None
    status: str | None = None
    max_attendees: int | None = None
    external_link: str | None = None
    route: dict | None = None
    clear_route: bool = False

    @field_validator("external_link")
    @classmethod
    def _valid_link(cls, v: str | None) -> str | None:
        if v is not None and not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("external_link must start with http:// or https://")
        return v

    @field_validator("route")
    @classmethod
    def _valid_linestring(cls, v: dict | None) -> dict | None:
        if v is None:
            return v
        if v.get("type") != "LineString":
            raise ValueError("route must be a GeoJSON LineString")
        coords = v.get("coordinates")
        if not isinstance(coords, list) or len(coords) < 2:
            raise ValueError("route must have at least 2 coordinates")
        return v


class RsvpRequest(BaseModel):
    user_id: UUID
    status: str = "going"

    @field_validator("status")
    @classmethod
    def _valid_status(cls, v: str) -> str:
        if v not in ("going", "maybe", "cancelled"):
            raise ValueError("status must be one of: going, maybe, cancelled")
        return v


class CheckInRequest(BaseModel):
    user_id: UUID
    join_code: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class OrganizerRoleRequest(BaseModel):
    organizer_user_id: UUID
    target_user_id: UUID


class LogForAttendeeRequest(BaseModel):
    organizer_user_id: UUID
    attendee_user_id: UUID
    small_bags: int | None = None
    large_bags: int | None = None
    pounds: float | None = None
    scoring_method: Literal["bags", "pounds"] = "bags"
    photo_urls: list[str] | None = None

    @field_validator("small_bags", "large_bags", "pounds")
    @classmethod
    def _non_negative(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError("must be non-negative")
        return v


class LogTeamTotalRequest(BaseModel):
    organizer_user_id: UUID
    small_bags: int | None = None
    large_bags: int | None = None
    pounds: float | None = None
    photo_urls: list[str] | None = None
    attendee_pool: Literal["checked_in", "going"] = "checked_in"
    scoring_method: Literal["bags", "pounds"] = "bags"
    overrides: dict[UUID, float] | None = None

    @field_validator("small_bags", "large_bags", "pounds")
    @classmethod
    def _non_negative(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError("must be non-negative")
        return v

    @field_validator("overrides")
    @classmethod
    def _overrides_non_negative(cls, v: dict[UUID, float] | None) -> dict[UUID, float] | None:
        if v is not None and any(share < 0 for share in v.values()):
            raise ValueError("override values must be non-negative")
        return v


async def _is_group_admin(db: AsyncSession, group_id: UUID, user_id: UUID) -> bool:
    result = await db.execute(
        text("""
            SELECT 1 FROM group_members
            WHERE group_id = :group_id AND user_id = :user_id AND role = 'admin'
        """),
        {"group_id": str(group_id), "user_id": str(user_id)},
    )
    return result.fetchone() is not None


async def _is_event_organizer(db: AsyncSession, cleanup_id: UUID, user_id: UUID) -> bool:
    result = await db.execute(
        text("""
            SELECT 1 FROM cleanup_rsvps
            WHERE cleanup_id = :cleanup_id AND user_id = :user_id AND is_organizer = true
        """),
        {"cleanup_id": str(cleanup_id), "user_id": str(user_id)},
    )
    return result.fetchone() is not None


async def _can_manage_event(db: AsyncSession, group_id: UUID, cleanup_id: UUID, user_id: UUID) -> bool:
    """Group admins retain their existing blanket override; real per-event
    organizers (the creator, or anyone an organizer has promoted) get the same
    powers without needing to be a group admin."""
    return await _is_group_admin(db, group_id, user_id) or await _is_event_organizer(db, cleanup_id, user_id)


async def _generate_join_code(db: AsyncSession) -> str:
    for _ in range(10):
        code = "".join(secrets.choice(JOIN_CODE_ALPHABET) for _ in range(JOIN_CODE_LENGTH))
        exists = await db.execute(text("SELECT 1 FROM cleanups WHERE join_code = :code"), {"code": code})
        if not exists.fetchone():
            return code
    raise HTTPException(status_code=500, detail="Could not generate a unique join code, please retry")


async def _resolve_geo_unit_id(db: AsyncSession, campaign_id: UUID, lat: float, lng: float) -> str | None:
    """Same point-in-polygon / H3 resolution POST /contributions/submit uses, so a
    group event's location lands in the same geo_unit a submission there would."""
    camp_result = await db.execute(
        text("SELECT geo_unit FROM campaigns WHERE id = :campaign_id"),
        {"campaign_id": str(campaign_id)},
    )
    camp_row = camp_result.fetchone()
    campaign_geo_unit = camp_row[0] if camp_row and camp_row[0] else None

    if campaign_geo_unit and "h3_hex" in campaign_geo_unit:
        h3_index = h3.latlng_to_cell(lat, lng, 3)
        result = await db.execute(
            text("SELECT id::text FROM geo_units WHERE unit_type = 'h3_hex' AND unit_id = :h3_index"),
            {"h3_index": h3_index},
        )
        row = result.fetchone()
        return row[0] if row else None

    result = await db.execute(
        text("""
            SELECT id::text FROM geo_units
            WHERE ST_Contains(geometry, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))
            AND unit_type = ANY(:geo_unit)
            LIMIT 1
        """),
        {"lon": lng, "lat": lat, "geo_unit": campaign_geo_unit},
    )
    row = result.fetchone()
    return row[0] if row else None


async def _get_event_or_404(db: AsyncSession, cleanup_id: UUID):
    result = await db.execute(
        text("""
            SELECT id, campaign_id, group_id, geo_unit_id::text AS geo_unit_id, join_code,
                   scheduled_start, scheduled_end, max_attendees, external_link,
                   submitted_by_user_id,
                   ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
            FROM cleanups
            WHERE id = :id AND is_group_event = true
        """),
        {"id": str(cleanup_id)},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Cleanup event not found")
    return row


@router.get("/campaign/{campaign_id}")
async def list_campaign_cleanup_events(campaign_id: UUID, db: AsyncSession = Depends(get_db)):
    """Group-hosted cleanup events for a campaign, with the hosting group's profile
    joined in for map markers. Fetched via FastAPI rather than Supabase directly
    since `location` is a PostGIS geography column. join_code is intentionally
    omitted here (it's a check-in secret, not public data)."""
    # is_past mirrors the check-in window's own close time (scheduled end, or
    # scheduled_start if no end was given, plus the same after-event grace period) rather
    # than the simpler group-page is_past — a marker shouldn't grey out while attendees
    # can still check in. Markers disappear entirely a day after that.
    result = await db.execute(
        text(f"""
            SELECT c.id, c.title, c.description, c.scheduled_start, c.scheduled_end,
                   c.status, c.image_urls,
                   ST_Y(c.location::geometry) AS latitude, ST_X(c.location::geometry) AS longitude,
                   g.id AS group_id, g.name AS group_name, g.slug AS group_slug, g.image_url AS group_logo_url,
                   (COALESCE(c.scheduled_end, c.scheduled_start) + INTERVAL '{CLEANUP_EVENT_GRACE_MINUTES_AFTER} minutes' < NOW()) AS is_past,
                   COALESCE(bags.total_small_bags, 0) AS total_small_bags,
                   COALESCE(bags.total_large_bags, 0) AS total_large_bags
            FROM cleanups c
            JOIN groups g ON g.id = c.group_id
            LEFT JOIN LATERAL (
                SELECT SUM(cl.metrics_small_bags) AS total_small_bags, SUM(cl.metrics_large_bags) AS total_large_bags
                FROM contributions co
                JOIN cleanups cl ON cl.id = co.cleanup_id
                WHERE co.cleanup_event_id = c.id
            ) bags ON true
            WHERE c.campaign_id = :campaign_id
              AND c.is_group_event = true
              AND c.status IN ('scheduled', 'in_progress')
              AND c.location IS NOT NULL
              AND (
                COALESCE(c.scheduled_end, c.scheduled_start) IS NULL
                OR COALESCE(c.scheduled_end, c.scheduled_start) + INTERVAL '{CLEANUP_EVENT_GRACE_MINUTES_AFTER} minutes' + INTERVAL '1 day' > NOW()
              )
            ORDER BY c.scheduled_start ASC NULLS LAST
        """),
        {"campaign_id": str(campaign_id)},
    )
    rows = result.fetchall()
    return [
        {
            "id": str(r.id),
            "title": r.title,
            "description": r.description,
            "scheduled_start": r.scheduled_start.isoformat() if r.scheduled_start else None,
            "scheduled_end": r.scheduled_end.isoformat() if r.scheduled_end else None,
            "status": r.status,
            "image_url": r.image_urls[0] if r.image_urls else None,
            "lat": r.latitude,
            "lng": r.longitude,
            "group_id": str(r.group_id),
            "group_name": r.group_name,
            "group_slug": r.group_slug,
            "group_logo_url": r.group_logo_url,
            "is_past": r.is_past,
            "total_small_bags": r.total_small_bags,
            "total_large_bags": r.total_large_bags,
        }
        for r in rows
    ]


@router.get("/group/{group_id}")
async def list_group_cleanup_events(group_id: UUID, viewer_user_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    """Cleanup events hosted by a group, for the group page. Non-admins only see
    upcoming (non-past, non-cancelled) events; group admins also get past/cancelled
    events for a full history view. is_past is computed in SQL against NOW() so it's
    correct regardless of server timezone handling."""
    is_admin = bool(viewer_user_id) and await _is_group_admin(db, group_id, viewer_user_id)

    result = await db.execute(
        text(f"""
            SELECT c.id, c.title, c.description, c.scheduled_start, c.scheduled_end,
                   c.status, c.image_urls, c.max_attendees,
                   ST_Y(c.location::geometry) AS latitude, ST_X(c.location::geometry) AS longitude,
                   (COALESCE(c.scheduled_end, c.scheduled_start) IS NOT NULL
                        AND COALESCE(c.scheduled_end, c.scheduled_start) < NOW()) AS is_past,
                   (c.scheduled_start IS NOT NULL
                        AND c.scheduled_start < NOW()
                        AND COALESCE(c.scheduled_end, c.scheduled_start)
                            + INTERVAL '{CLEANUP_EVENT_GRACE_MINUTES_AFTER} minutes' >= NOW()) AS is_ongoing,
                   (SELECT COUNT(*) FROM cleanup_rsvps r WHERE r.cleanup_id = c.id AND r.status = 'going') AS going_count
            FROM cleanups c
            WHERE c.group_id = :group_id
              AND c.is_group_event = true
              AND c.location IS NOT NULL
            ORDER BY c.scheduled_start ASC NULLS LAST
        """),
        {"group_id": str(group_id)},
    )
    rows = result.fetchall()

    events = [
        {
            "id": str(r.id),
            "title": r.title,
            "description": r.description,
            "scheduled_start": r.scheduled_start.isoformat() if r.scheduled_start else None,
            "scheduled_end": r.scheduled_end.isoformat() if r.scheduled_end else None,
            "status": r.status,
            "image_url": r.image_urls[0] if r.image_urls else None,
            "lat": r.latitude,
            "lng": r.longitude,
            "max_attendees": r.max_attendees,
            "going_count": r.going_count,
            "is_past": r.is_past,
            "is_ongoing": r.is_ongoing,
        }
        for r in rows
        if is_admin or (not r.is_past and r.status != "cancelled")
    ]
    return events


@router.get("/{cleanup_id}")
async def get_cleanup_event(cleanup_id: UUID, viewer_user_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    """Single event detail for the RSVP/check-in page. join_code is only included
    when the viewer is a group admin, mirroring the omission in the list endpoint."""
    result = await db.execute(
        text("""
            SELECT c.id, c.campaign_id, cam.slug AS campaign_slug, c.title, c.description,
                   c.scheduled_start, c.scheduled_end, c.status, c.image_urls, c.join_code,
                   c.max_attendees, c.external_link,
                   c.metrics_small_bags, c.metrics_large_bags, c.metrics_pounds,
                   ST_Y(c.location::geometry) AS latitude, ST_X(c.location::geometry) AS longitude,
                   ST_AsGeoJSON(c.route)::json AS route,
                   ST_AsGeoJSON(ST_Buffer(c.route::geography, :radius))::json AS route_buffer,
                   g.id AS group_id, g.name AS group_name, g.slug AS group_slug, g.image_url AS group_logo_url
            FROM cleanups c
            JOIN groups g ON g.id = c.group_id
            JOIN campaigns cam ON cam.id = c.campaign_id
            WHERE c.id = :id AND c.is_group_event = true
        """),
        {"id": str(cleanup_id), "radius": CLEANUP_EVENT_PROXIMITY_METERS},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Cleanup event not found")

    is_organizer = bool(viewer_user_id) and await _can_manage_event(db, row.group_id, cleanup_id, viewer_user_id)

    rsvp_result = await db.execute(
        text("""
            SELECT r.user_id, p.username, p.display_name, r.status, r.checked_in_at, r.is_organizer
            FROM cleanup_rsvps r
            JOIN profiles p ON p.id = r.user_id
            WHERE r.cleanup_id = :id
            ORDER BY r.created_at ASC
        """),
        {"id": str(cleanup_id)},
    )
    # Aggregated directly off contributions.cleanup_event_id rather than through
    # cleanup_rsvps.contribution_id — that FK only ever holds the attendee's most recent
    # submission (each resubmit overwrites it), so going through it silently dropped
    # every earlier submission's bags/pounds/photos for anyone who logged more than once.
    bags_by_user_result = await db.execute(
        text("""
            SELECT co.user_id,
                   COALESCE(SUM(cl.metrics_small_bags), 0) AS small_bags,
                   COALESCE(SUM(cl.metrics_large_bags), 0) AS large_bags,
                   COALESCE(SUM(cl.metrics_pounds), 0) AS pounds,
                   MAX(co.submitted_at) AS contributed_at,
                   array_agg(cl.image_urls) FILTER (WHERE cl.image_urls IS NOT NULL AND cardinality(cl.image_urls) > 0) AS image_url_arrays
            FROM contributions co
            JOIN cleanups cl ON cl.id = co.cleanup_id
            WHERE co.cleanup_event_id = :id
            GROUP BY co.user_id
        """),
        {"id": str(cleanup_id)},
    )
    bags_by_user = {}
    all_photos: list[str] = []
    for r in bags_by_user_result.fetchall():
        photos = [url for arr in (r.image_url_arrays or []) for url in arr]
        all_photos.extend(photos)
        bags_by_user[str(r.user_id)] = {
            "small_bags": r.small_bags,
            "large_bags": r.large_bags,
            "pounds": float(r.pounds) if r.pounds is not None else 0,
            "contributed_at": r.contributed_at,
            "photos": photos,
        }

    # Team-total credits have no dedicated cleanups row (cleanup_id is NULL, see
    # log_team_total) so they never match the join above and show as 0/0/0 bags —
    # honest, since we don't know their individual bag breakdown, but it reads as "no
    # credit happened." Pull each attendee's total points directly from contributions so
    # the UI can show something even when bags/pounds are all zero.
    points_by_user_result = await db.execute(
        text("""
            SELECT user_id, SUM(value) AS points
            FROM contributions
            WHERE cleanup_event_id = :id
            GROUP BY user_id
        """),
        {"id": str(cleanup_id)},
    )
    points_by_user = {str(r.user_id): float(r.points) for r in points_by_user_result.fetchall()}

    # A submission counts as "late" once it lands more than 24h after the event's
    # window closes — unrestricted (submissions are never blocked), just flagged.
    late_cutoff = (row.scheduled_end or row.scheduled_start) + timedelta(hours=24) \
        if (row.scheduled_end or row.scheduled_start) else None

    viewer_rsvp = None
    rsvps = []
    for r in rsvp_result.fetchall():
        user_bags = bags_by_user.get(
            str(r.user_id), {"small_bags": 0, "large_bags": 0, "pounds": 0, "contributed_at": None, "photos": []}
        )
        contributed_at = user_bags["contributed_at"]
        entry = {
            "user_id": str(r.user_id),
            "username": r.username,
            "display_name": r.display_name,
            "status": r.status,
            "checked_in_at": r.checked_in_at.isoformat() if r.checked_in_at else None,
            "is_organizer": r.is_organizer,
            "small_bags": user_bags["small_bags"],
            "large_bags": user_bags["large_bags"],
            "pounds": user_bags["pounds"],
            "photos": user_bags["photos"],
            "points": points_by_user.get(str(r.user_id), 0.0),
            "is_late": bool(contributed_at and late_cutoff and contributed_at > late_cutoff),
        }
        rsvps.append(entry)
        if viewer_user_id and str(r.user_id) == str(viewer_user_id):
            viewer_rsvp = entry

    going_count = sum(1 for r in rsvps if r["status"] == "going")

    # Includes the event's own metrics_* columns, which accumulate organizer-logged
    # team totals (see log_team_total) that aren't attributed to any single attendee's
    # contribution row and so wouldn't otherwise be reflected in the per-user sums.
    total_small_bags = sum(v["small_bags"] for v in bags_by_user.values()) + (row.metrics_small_bags or 0)
    total_large_bags = sum(v["large_bags"] for v in bags_by_user.values()) + (row.metrics_large_bags or 0)
    total_pounds = sum(v["pounds"] for v in bags_by_user.values()) + float(row.metrics_pounds or 0)

    check_in_window_start = (
        row.scheduled_start - timedelta(minutes=CLEANUP_EVENT_GRACE_MINUTES_BEFORE)
        if row.scheduled_start else None
    )
    window_end_base = row.scheduled_end or row.scheduled_start
    check_in_window_end = (
        window_end_base + timedelta(minutes=CLEANUP_EVENT_GRACE_MINUTES_AFTER)
        if window_end_base else None
    )

    return {
        "id": str(row.id),
        "campaign_id": str(row.campaign_id),
        "campaign_slug": row.campaign_slug,
        "title": row.title,
        "description": row.description,
        "scheduled_start": row.scheduled_start.isoformat() if row.scheduled_start else None,
        "scheduled_end": row.scheduled_end.isoformat() if row.scheduled_end else None,
        "status": row.status,
        "image_url": row.image_urls[0] if row.image_urls else None,
        "lat": row.latitude,
        "lng": row.longitude,
        "route": row.route,
        "route_buffer": row.route_buffer,
        "group_id": str(row.group_id),
        "group_name": row.group_name,
        "group_slug": row.group_slug,
        "group_logo_url": row.group_logo_url,
        "join_code": row.join_code if is_organizer else None,
        "is_organizer": is_organizer,
        "rsvps": rsvps,
        "viewer_rsvp": viewer_rsvp,
        "max_attendees": row.max_attendees,
        "going_count": going_count,
        "is_full": row.max_attendees is not None and going_count >= row.max_attendees,
        "total_small_bags": total_small_bags,
        "total_large_bags": total_large_bags,
        "total_pounds": total_pounds,
        "photos": all_photos,
        "external_link": row.external_link,
        "check_in_window_start": check_in_window_start.isoformat() if check_in_window_start else None,
        "check_in_window_end": check_in_window_end.isoformat() if check_in_window_end else None,
        "check_in_radius_meters": CLEANUP_EVENT_PROXIMITY_METERS,
    }


@router.post("")
async def create_cleanup_event(payload: CreateCleanupEventRequest, db: AsyncSession = Depends(get_db)):
    if not await _is_group_admin(db, payload.group_id, payload.organizer_user_id):
        raise HTTPException(status_code=403, detail="Only a group admin can create an event for this group")

    camp_result = await db.execute(
        text("SELECT status FROM campaigns WHERE id = :campaign_id"),
        {"campaign_id": str(payload.campaign_id)},
    )
    camp_row = camp_result.fetchone()
    if not camp_row:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if camp_row[0] != "active":
        raise HTTPException(status_code=403, detail="Campaign is not accepting new events")

    geo_unit_id = await _resolve_geo_unit_id(db, payload.campaign_id, payload.latitude, payload.longitude)
    join_code = await _generate_join_code(db)

    result = await db.execute(
        text("""
            INSERT INTO cleanups
                (campaign_id, geo_unit_id, group_id, is_group_event, join_code,
                 title, description, location, route, scheduled_start, scheduled_end,
                 status, image_urls, submitted_by_user_id, max_attendees, external_link)
            VALUES
                (:campaign_id, :geo_unit_id, :group_id, true, :join_code,
                 :title, :description,
                 ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                 CASE WHEN CAST(:route AS text) IS NOT NULL
                      THEN ST_GeomFromGeoJSON(CAST(:route AS text))::geography
                      ELSE NULL END,
                 :scheduled_start, :scheduled_end,
                 'scheduled', :image_urls, :organizer_user_id, :max_attendees, :external_link)
            RETURNING id, join_code
        """),
        {
            "campaign_id": str(payload.campaign_id),
            "geo_unit_id": geo_unit_id,
            "group_id": str(payload.group_id),
            "join_code": join_code,
            "title": payload.title,
            "description": payload.description,
            "lon": payload.longitude,
            "lat": payload.latitude,
            "route": json.dumps(payload.route) if payload.route is not None else None,
            "scheduled_start": payload.scheduled_start,
            "scheduled_end": payload.scheduled_end,
            "image_urls": [payload.image_url] if payload.image_url else [],
            "organizer_user_id": str(payload.organizer_user_id),
            "max_attendees": payload.max_attendees,
            "external_link": payload.external_link,
        },
    )
    row = result.fetchone()

    await db.execute(
        text("""
            INSERT INTO cleanup_rsvps (cleanup_id, user_id, status, is_organizer)
            VALUES (:cleanup_id, :organizer_user_id, 'going', true)
        """),
        {"cleanup_id": str(row.id), "organizer_user_id": str(payload.organizer_user_id)},
    )
    await db.commit()

    return {"id": str(row.id), "join_code": row.join_code, "geo_unit_id": geo_unit_id}


@router.patch("/{cleanup_id}")
async def patch_cleanup_event(cleanup_id: UUID, payload: PatchCleanupEventRequest, db: AsyncSession = Depends(get_db)):
    event = await _get_event_or_404(db, cleanup_id)

    if not await _can_manage_event(db, event.group_id, cleanup_id, payload.organizer_user_id):
        raise HTTPException(status_code=403, detail="Only a group admin or event organizer can edit this event")

    has_new_location = payload.latitude is not None and payload.longitude is not None
    geo_unit_id = event.geo_unit_id
    if has_new_location:
        geo_unit_id = await _resolve_geo_unit_id(db, event.campaign_id, payload.latitude, payload.longitude)

    await db.execute(
        text("""
            UPDATE cleanups SET
                title = COALESCE(:title, title),
                description = COALESCE(:description, description),
                scheduled_start = COALESCE(:scheduled_start, scheduled_start),
                scheduled_end = COALESCE(:scheduled_end, scheduled_end),
                status = COALESCE(:status, status),
                image_urls = CASE WHEN CAST(:image_url AS text) IS NOT NULL THEN ARRAY[CAST(:image_url AS text)]::text[] ELSE image_urls END,
                max_attendees = COALESCE(:max_attendees, max_attendees),
                external_link = COALESCE(:external_link, external_link),
                geo_unit_id = CASE WHEN :has_new_location THEN CAST(:geo_unit_id AS uuid) ELSE geo_unit_id END,
                location = CASE WHEN :has_new_location
                                THEN ST_SetSRID(ST_MakePoint(CAST(:lon AS double precision), CAST(:lat AS double precision)), 4326)::geography
                                ELSE location END,
                route = CASE WHEN CAST(:route AS text) IS NOT NULL
                              THEN ST_GeomFromGeoJSON(CAST(:route AS text))::geography
                              WHEN :clear_route THEN NULL
                              ELSE route END,
                updated_at = NOW()
            WHERE id = :id
        """),
        {
            "id": str(cleanup_id),
            "title": payload.title,
            "description": payload.description,
            "scheduled_start": payload.scheduled_start,
            "scheduled_end": payload.scheduled_end,
            "status": payload.status,
            "image_url": payload.image_url,
            "has_new_location": has_new_location,
            "geo_unit_id": geo_unit_id,
            "lon": payload.longitude,
            "lat": payload.latitude,
            "max_attendees": payload.max_attendees,
            "external_link": payload.external_link,
            "route": json.dumps(payload.route) if payload.route is not None else None,
            "clear_route": payload.clear_route,
        },
    )
    await db.commit()

    return {"id": str(cleanup_id), "updated": True}


@router.post("/{cleanup_id}/rsvp")
async def rsvp_to_cleanup_event(cleanup_id: UUID, payload: RsvpRequest, db: AsyncSession = Depends(get_db)):
    event = await _get_event_or_404(db, cleanup_id)

    if payload.status == "going" and event.max_attendees is not None:
        # Locks the cleanups row for the rest of this transaction so two concurrent
        # RSVPs can't both read the same under-capacity count and both squeeze in.
        await db.execute(text("SELECT 1 FROM cleanups WHERE id = :id FOR UPDATE"), {"id": str(cleanup_id)})
        count_result = await db.execute(
            text("""
                SELECT COUNT(*) FROM cleanup_rsvps
                WHERE cleanup_id = :cleanup_id AND status = 'going' AND user_id != :user_id
            """),
            {"cleanup_id": str(cleanup_id), "user_id": str(payload.user_id)},
        )
        going_count = count_result.scalar() or 0
        if going_count >= event.max_attendees:
            raise HTTPException(status_code=409, detail="This event is full")

    result = await db.execute(
        text("""
            INSERT INTO cleanup_rsvps (cleanup_id, user_id, status)
            VALUES (:cleanup_id, :user_id, :status)
            ON CONFLICT (cleanup_id, user_id) DO UPDATE SET
                status = EXCLUDED.status,
                updated_at = NOW()
            RETURNING id, status, checked_in_at
        """),
        {"cleanup_id": str(cleanup_id), "user_id": str(payload.user_id), "status": payload.status},
    )
    row = result.fetchone()
    await db.commit()

    return {
        "id": str(row.id),
        "status": row.status,
        "checked_in_at": row.checked_in_at.isoformat() if row.checked_in_at else None,
    }


@router.post("/{cleanup_id}/check-in")
async def check_in_to_cleanup_event(cleanup_id: UUID, payload: CheckInRequest, db: AsyncSession = Depends(get_db)):
    event = await _get_event_or_404(db, cleanup_id)

    if payload.join_code:
        if payload.join_code.strip().upper() != (event.join_code or ""):
            raise HTTPException(status_code=403, detail="Invalid join code")
    else:
        has_location = payload.latitude is not None and payload.longitude is not None
        if not has_location:
            raise HTTPException(status_code=400, detail="Provide a join_code or your current location to check in")
        if event.latitude is None or event.longitude is None:
            raise HTTPException(status_code=409, detail="This event has no location set")

    # The check-in window applies to both paths — join code only exempts the caller
    # from the proximity check (it's the paper-signup/GPS-unreliable fallback), not
    # from checking in at the right time.
    window_start = event.scheduled_start - timedelta(minutes=CLEANUP_EVENT_GRACE_MINUTES_BEFORE) if event.scheduled_start else None
    window_end_base = event.scheduled_end or event.scheduled_start
    window_end = window_end_base + timedelta(minutes=CLEANUP_EVENT_GRACE_MINUTES_AFTER) if window_end_base else None

    now_result = await db.execute(text("SELECT now()"))
    now = now_result.scalar()
    if (window_start and now < window_start) or (window_end and now > window_end):
        raise HTTPException(status_code=403, detail="Check-in is only available around the event's check-in window")

    if not payload.join_code:
        prox_result = await db.execute(
            text("""
                SELECT ST_DWithin(
                    location,
                    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                    :threshold
                ) FROM cleanups WHERE id = :id
            """),
            {
                "lon": payload.longitude,
                "lat": payload.latitude,
                "threshold": CLEANUP_EVENT_PROXIMITY_METERS,
                "id": str(cleanup_id),
            },
        )
        if not prox_result.scalar():
            raise HTTPException(status_code=403, detail="You're too far from the event location to check in")

    result = await db.execute(
        text("""
            INSERT INTO cleanup_rsvps (cleanup_id, user_id, status, checked_in_at)
            VALUES (:cleanup_id, :user_id, 'going', NOW())
            ON CONFLICT (cleanup_id, user_id) DO UPDATE SET
                checked_in_at = NOW(),
                updated_at = NOW()
            RETURNING id, checked_in_at
        """),
        {"cleanup_id": str(cleanup_id), "user_id": str(payload.user_id)},
    )
    row = result.fetchone()
    await db.commit()

    return {"id": str(row.id), "checked_in_at": row.checked_in_at.isoformat()}


@router.post("/{cleanup_id}/log-for-attendee")
async def log_for_attendee(cleanup_id: UUID, payload: LogForAttendeeRequest, db: AsyncSession = Depends(get_db)):
    """Organizer-logged contribution for an attendee who forgot to self-log. No score
    multiplier applies (see record_contribution's apply_multiplier=False), and
    recorded_by_user_id preserves an audit trail of who logged it.

    Creates its own dedicated `cleanups` row for this attendee (mirroring the self-log
    path in contributions.py) rather than reusing the event's own row as `cleanup_id` —
    reusing the shared event row meant every attendee logged this way displayed the
    event row's own (empty) metrics/photos instead of their own, and multiple attendees
    sharing that one row's empty `image_urls` array crashed the RSVP-list query's
    `array_agg` (Postgres can't accumulate multiple empty arrays)."""
    event = await _get_event_or_404(db, cleanup_id)

    if not await _can_manage_event(db, event.group_id, cleanup_id, payload.organizer_user_id):
        raise HTTPException(status_code=403, detail="Only a group admin or event organizer can log a contribution for an attendee")

    # Pounds and bags are two ways of estimating the same haul (see log-team-total) —
    # both are always saved to the attendee's cleanups row below for the event's record,
    # but only the organizer-selected scoring_method determines points, so switching
    # methods in the UI doesn't silently drop the other field's value.
    if payload.scoring_method == "pounds":
        value = (payload.pounds or 0) * POUND_VALUE
        small_bags = None
        large_bags = None
    else:
        value = None
        small_bags = payload.small_bags
        large_bags = payload.large_bags

    image_urls = payload.photo_urls or []
    cleanup_result = await db.execute(
        text("""
            INSERT INTO cleanups
                (campaign_id, geo_unit_id, location, status, image_urls,
                 metrics_small_bags, metrics_large_bags, metrics_pounds,
                 submitted_by_user_id, attended_user_ids)
            VALUES
                (:campaign_id, :geo_unit_id,
                 CASE WHEN CAST(:lon AS double precision) IS NOT NULL AND CAST(:lat AS double precision) IS NOT NULL
                      THEN ST_SetSRID(ST_MakePoint(CAST(:lon AS double precision), CAST(:lat AS double precision)), 4326)::geography
                      ELSE NULL END,
                 'completed', :image_urls, :small_bags, :large_bags, :pounds,
                 :attendee_user_id, ARRAY[:attendee_user_id]::uuid[])
            RETURNING id
        """),
        {
            "campaign_id": str(event.campaign_id),
            "geo_unit_id": event.geo_unit_id,
            "lon": event.longitude,
            "lat": event.latitude,
            "image_urls": image_urls,
            "small_bags": payload.small_bags,
            "large_bags": payload.large_bags,
            "pounds": payload.pounds,
            "attendee_user_id": str(payload.attendee_user_id),
        },
    )
    attendee_cleanup_id = str(cleanup_result.scalar())

    recorded = await record_contribution(
        db,
        user_id=payload.attendee_user_id,
        campaign_id=event.campaign_id,
        group_id=event.group_id,
        geo_unit_id=event.geo_unit_id,
        cleanup_id=attendee_cleanup_id,
        contribution_type="cleanup",
        value=value,
        small_bags=small_bags,
        large_bags=large_bags,
        photo_url=payload.photo_urls[0] if payload.photo_urls else None,
        latitude=event.latitude,
        longitude=event.longitude,
        location_verified=True,
        recorded_by_user_id=payload.organizer_user_id,
        apply_multiplier=False,
        cleanup_event_id=str(cleanup_id),
        allow_explicit_value=True,
    )

    await db.execute(
        text("""
            INSERT INTO cleanup_rsvps (cleanup_id, user_id, status, checked_in_at, contribution_id)
            VALUES (:cleanup_id, :user_id, 'going', NOW(), :contribution_id)
            ON CONFLICT (cleanup_id, user_id) DO UPDATE SET
                checked_in_at = COALESCE(cleanup_rsvps.checked_in_at, EXCLUDED.checked_in_at),
                contribution_id = EXCLUDED.contribution_id,
                updated_at = NOW()
        """),
        {
            "cleanup_id": str(cleanup_id),
            "user_id": str(payload.attendee_user_id),
            "contribution_id": recorded.contribution_id,
        },
    )
    await db.commit()

    return {"contribution_id": recorded.contribution_id, "value": recorded.value}


@router.post("/{cleanup_id}/log-team-total")
async def log_team_total(cleanup_id: UUID, payload: LogTeamTotalRequest, db: AsyncSession = Depends(get_db)):
    """Organizer-logged total for the whole event, split as individual credit across
    attendees. Each attendee gets their own contribution row under their own user_id
    (not one lump sum under the organizer), so territory credit lands on whoever
    actually showed up. Re-runnable: only attendees without an existing contribution_id
    are considered, so a later top-up call won't double-credit anyone already logged
    (by this or any other logging path)."""
    event = await _get_event_or_404(db, cleanup_id)

    if not await _can_manage_event(db, event.group_id, cleanup_id, payload.organizer_user_id):
        raise HTTPException(status_code=403, detail="Only a group admin or event organizer can log a team total")

    if payload.scoring_method == "pounds":
        total_value = (payload.pounds or 0) * POUND_VALUE
    else:
        total_value = (payload.small_bags or 0) * SMALL_BAG_VALUE + (payload.large_bags or 0) * LARGE_BAG_VALUE

    overrides = {str(k): v for k, v in (payload.overrides or {}).items()}
    override_total = sum(overrides.values())
    if override_total > total_value:
        raise HTTPException(status_code=400, detail="Overrides can't exceed the event total")

    pool_query = """
        SELECT user_id FROM cleanup_rsvps
        WHERE cleanup_id = :cleanup_id AND status = 'going' AND contribution_id IS NULL
    """
    if payload.attendee_pool == "checked_in":
        pool_query += " AND checked_in_at IS NOT NULL"
    pool_result = await db.execute(text(pool_query), {"cleanup_id": str(cleanup_id)})
    pool = [str(r.user_id) for r in pool_result.fetchall()]

    missing_overrides = set(overrides) - set(pool)
    if missing_overrides:
        raise HTTPException(status_code=400, detail=f"Not eligible attendees: {sorted(missing_overrides)}")

    await db.execute(
        text("""
            UPDATE cleanups SET
                metrics_small_bags = COALESCE(metrics_small_bags, 0) + :sb,
                metrics_large_bags = COALESCE(metrics_large_bags, 0) + :lb,
                metrics_pounds = COALESCE(metrics_pounds, 0) + :lbs
            WHERE id = :id
        """),
        {
            "id": str(cleanup_id),
            "sb": payload.small_bags or 0,
            "lb": payload.large_bags or 0,
            "lbs": payload.pounds or 0,
        },
    )

    remaining_pool = [u for u in pool if u not in overrides]
    split_value = (total_value - override_total) / len(remaining_pool) if remaining_pool else 0
    # Points are awarded in whole/half increments, not raw division remainders.
    split_value = round(split_value * 2) / 2

    for user_id in pool:
        share = round(overrides.get(user_id, split_value) * 2) / 2
        recorded = await record_contribution(
            db,
            user_id=user_id,
            campaign_id=event.campaign_id,
            group_id=event.group_id,
            geo_unit_id=event.geo_unit_id,
            cleanup_id=None,
            contribution_type="cleanup",
            value=share,
            small_bags=None,
            large_bags=None,
            photo_url=payload.photo_urls[0] if payload.photo_urls else None,
            latitude=event.latitude,
            longitude=event.longitude,
            location_verified=True,
            recorded_by_user_id=payload.organizer_user_id,
            apply_multiplier=False,
            cleanup_event_id=str(cleanup_id),
            allow_explicit_value=True,
        )
        await db.execute(
            text("""
                INSERT INTO cleanup_rsvps (cleanup_id, user_id, status, checked_in_at, contribution_id)
                VALUES (:cleanup_id, :user_id, 'going', NOW(), :contribution_id)
                ON CONFLICT (cleanup_id, user_id) DO UPDATE SET
                    checked_in_at = COALESCE(cleanup_rsvps.checked_in_at, EXCLUDED.checked_in_at),
                    contribution_id = EXCLUDED.contribution_id,
                    updated_at = NOW()
            """),
            {"cleanup_id": str(cleanup_id), "user_id": user_id, "contribution_id": recorded.contribution_id},
        )

    await db.execute(
        text("""
            INSERT INTO cleanup_team_total_logs
                (cleanup_id, organizer_user_id, scoring_method, small_bags, large_bags, pounds,
                 total_value, credited_count)
            VALUES
                (:cleanup_id, :organizer_user_id, :scoring_method, :small_bags, :large_bags, :pounds,
                 :total_value, :credited_count)
        """),
        {
            "cleanup_id": str(cleanup_id),
            "organizer_user_id": str(payload.organizer_user_id),
            "scoring_method": payload.scoring_method,
            "small_bags": payload.small_bags,
            "large_bags": payload.large_bags,
            "pounds": payload.pounds,
            "total_value": total_value,
            "credited_count": len(pool),
        },
    )

    await db.commit()

    return {"credited_count": len(pool), "total_value": total_value, "per_attendee_value": split_value}


@router.get("/{cleanup_id}/team-total-logs")
async def get_team_total_logs(cleanup_id: UUID, db: AsyncSession = Depends(get_db)):
    """History of every log-team-total submission for this event, newest first. Each entry
    only credited attendees who didn't already have a contribution at the time (see
    log_team_total's docstring) — this list makes that repeat-run behavior visible to
    organizers instead of it being a silent surprise."""
    result = await db.execute(
        text("""
            SELECT l.id, l.organizer_user_id, p.display_name AS organizer_display_name,
                   p.username AS organizer_username, l.scoring_method, l.small_bags,
                   l.large_bags, l.pounds, l.total_value, l.credited_count, l.created_at
            FROM cleanup_team_total_logs l
            LEFT JOIN profiles p ON p.id = l.organizer_user_id
            WHERE l.cleanup_id = :cleanup_id
            ORDER BY l.created_at DESC
        """),
        {"cleanup_id": str(cleanup_id)},
    )
    return [
        {
            "id": str(row.id),
            "organizer_user_id": str(row.organizer_user_id) if row.organizer_user_id else None,
            "organizer_name": row.organizer_display_name or row.organizer_username or "Unknown",
            "scoring_method": row.scoring_method,
            "small_bags": row.small_bags,
            "large_bags": row.large_bags,
            "pounds": float(row.pounds) if row.pounds is not None else None,
            "total_value": float(row.total_value),
            "credited_count": row.credited_count,
            "created_at": row.created_at.isoformat(),
        }
        for row in result.fetchall()
    ]


@router.post("/{cleanup_id}/organizers")
async def promote_organizer(cleanup_id: UUID, payload: OrganizerRoleRequest, db: AsyncSession = Depends(get_db)):
    event = await _get_event_or_404(db, cleanup_id)

    if not await _can_manage_event(db, event.group_id, cleanup_id, payload.organizer_user_id):
        raise HTTPException(status_code=403, detail="Only a group admin or event organizer can promote co-organizers")

    result = await db.execute(
        text("""
            UPDATE cleanup_rsvps SET is_organizer = true, updated_at = NOW()
            WHERE cleanup_id = :cleanup_id AND user_id = :target_user_id
            RETURNING id
        """),
        {"cleanup_id": str(cleanup_id), "target_user_id": str(payload.target_user_id)},
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="That user must RSVP to the event before becoming an organizer")
    await db.commit()

    return {"cleanup_id": str(cleanup_id), "user_id": str(payload.target_user_id), "is_organizer": True}


@router.delete("/{cleanup_id}/organizers/{user_id}")
async def demote_organizer(cleanup_id: UUID, user_id: UUID, payload: OrganizerRoleRequest, db: AsyncSession = Depends(get_db)):
    event = await _get_event_or_404(db, cleanup_id)

    if not await _can_manage_event(db, event.group_id, cleanup_id, payload.organizer_user_id):
        raise HTTPException(status_code=403, detail="Only a group admin or event organizer can remove co-organizers")

    if event.submitted_by_user_id is not None and str(event.submitted_by_user_id) == str(user_id):
        raise HTTPException(status_code=400, detail="The event's creator can't be removed as organizer")

    await db.execute(
        text("""
            UPDATE cleanup_rsvps SET is_organizer = false, updated_at = NOW()
            WHERE cleanup_id = :cleanup_id AND user_id = :user_id
        """),
        {"cleanup_id": str(cleanup_id), "user_id": str(user_id)},
    )
    await db.commit()

    return {"cleanup_id": str(cleanup_id), "user_id": str(user_id), "is_organizer": False}


class IntersectingGeoUnitsRequest(BaseModel):
    campaign_id: UUID
    route: dict

    @field_validator("route")
    @classmethod
    def _valid_linestring(cls, v: dict) -> dict:
        if v.get("type") != "LineString":
            raise ValueError("route must be a GeoJSON LineString")
        coords = v.get("coordinates")
        if not isinstance(coords, list) or len(coords) < 2:
            raise ValueError("route must have at least 2 coordinates")
        return v


@routes_router.post("/intersecting-geo-units")
async def get_intersecting_geo_units(payload: IntersectingGeoUnitsRequest, db: AsyncSession = Depends(get_db)):
    """Returns the geo_units (e.g. zips) a drawn route crosses, scoped to the campaign's
    geo_unit types, for the client to offer as a single-zip crediting choice. Re-run
    server-side (never trust the client) when the route is actually submitted."""
    camp_result = await db.execute(
        text("SELECT geo_unit FROM campaigns WHERE id = :campaign_id"),
        {"campaign_id": str(payload.campaign_id)},
    )
    camp_row = camp_result.fetchone()
    if not camp_row:
        raise HTTPException(status_code=404, detail="Campaign not found")
    campaign_geo_unit = camp_row[0] if camp_row[0] else ["zip"]

    result = await db.execute(
        text("""
            SELECT
                gu.id::text, gu.unit_id, gu.display_name,
                em.multiplier, em.title
            FROM geo_units gu
            LEFT JOIN LATERAL (
                SELECT (ce.effect_config->>'multiplier')::float AS multiplier, ce.title
                FROM campaign_events ce
                WHERE ce.campaign_id = :campaign_id
                  AND ce.status = 'active'
                  AND (ce.started_at IS NULL OR ce.started_at <= NOW())
                  AND (ce.ends_at IS NULL OR ce.ends_at > NOW())
                  AND ce.effect_config->>'type' = 'score_multiplier'
                  AND (
                    ce.geo_unit_id = gu.id
                    OR EXISTS (
                      SELECT 1 FROM campaign_event_geo_units cegu
                      WHERE cegu.event_id = ce.id AND cegu.geo_unit_id = gu.id
                    )
                  )
                ORDER BY (ce.effect_config->>'multiplier')::float DESC
                LIMIT 1
            ) em ON true
            WHERE gu.unit_type = ANY(:geo_unit)
              AND ST_Intersects(gu.geometry, ST_GeomFromGeoJSON(:route))
            ORDER BY gu.display_name
        """),
        {"campaign_id": str(payload.campaign_id), "geo_unit": campaign_geo_unit, "route": json.dumps(payload.route)},
    )
    return [
        {
            "geo_unit_id": row[0],
            "unit_id": row[1],
            "display_name": row[2],
            "active_multiplier": {"multiplier": row[3], "title": row[4]} if row[3] is not None else None,
        }
        for row in result.fetchall()
    ]


@routes_router.get("/campaign/{campaign_id}")
async def list_campaign_cleanup_routes(campaign_id: UUID, db: AsyncSession = Depends(get_db)):
    """All drawn routes (individual, group, or pre-planned group-event) for a campaign's
    map layer — geometry plus enough group info to badge the marker with a logo, and (for
    event-linked routes only) a buffered corridor polygon for the check-in zone display."""
    result = await db.execute(
        text("""
            SELECT
                c.id, ST_AsGeoJSON(c.route)::json AS route,
                c.group_id, g.name AS group_name, g.image_url AS group_logo_url,
                CASE WHEN c.is_group_event
                    THEN ST_AsGeoJSON(ST_Buffer(c.route::geography, :radius))::json
                    ELSE NULL
                END AS buffer
            FROM cleanups c
            LEFT JOIN groups g ON g.id = c.group_id
            WHERE c.campaign_id = :campaign_id AND c.route IS NOT NULL
            ORDER BY c.created_at DESC
            LIMIT 500
        """),
        {"campaign_id": str(campaign_id), "radius": CLEANUP_EVENT_PROXIMITY_METERS},
    )
    return [
        {
            "id": str(row.id),
            "route": row.route,
            "group_id": str(row.group_id) if row.group_id else None,
            "group_name": row.group_name,
            "group_logo_url": row.group_logo_url,
            "buffer": row.buffer,
        }
        for row in result.fetchall()
    ]


@routes_router.get("/{cleanup_id}")
async def get_cleanup_route(cleanup_id: UUID, db: AsyncSession = Depends(get_db)):
    """Shareable detail view for a single route-based cleanup submission."""
    result = await db.execute(
        text("""
            SELECT
                c.id, c.campaign_id, c.group_id, c.status, c.image_urls,
                c.metrics_small_bags, c.metrics_large_bags, c.metrics_pounds,
                c.created_at, c.submitted_by_user_id,
                ST_AsGeoJSON(c.route)::json AS route,
                gu.display_name AS geo_unit_display_name,
                p.username, p.display_name AS user_display_name, p.avatar_url,
                cam.title AS campaign_title, cam.slug AS campaign_slug,
                g.name AS group_name, g.slug AS group_slug, g.image_url AS group_logo_url
            FROM cleanups c
            LEFT JOIN geo_units gu ON gu.id = c.geo_unit_id
            LEFT JOIN profiles p ON p.id = c.submitted_by_user_id
            LEFT JOIN campaigns cam ON cam.id = c.campaign_id
            LEFT JOIN groups g ON g.id = c.group_id
            WHERE c.id = :id AND c.route IS NOT NULL
        """),
        {"id": str(cleanup_id)},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Cleanup route not found")

    return {
        "id": str(row.id),
        "campaign_id": str(row.campaign_id),
        "campaign_title": row.campaign_title,
        "campaign_slug": row.campaign_slug,
        "group_id": str(row.group_id) if row.group_id else None,
        "group_name": row.group_name,
        "group_slug": row.group_slug,
        "group_logo_url": row.group_logo_url,
        "status": row.status,
        "image_urls": row.image_urls,
        "metrics_small_bags": row.metrics_small_bags,
        "metrics_large_bags": row.metrics_large_bags,
        "metrics_pounds": float(row.metrics_pounds) if row.metrics_pounds is not None else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "route": row.route,
        "geo_unit_display_name": row.geo_unit_display_name,
        "submitted_by": {
            "user_id": str(row.submitted_by_user_id) if row.submitted_by_user_id else None,
            "username": row.username,
            "display_name": row.user_display_name,
            "avatar_url": row.avatar_url,
        },
    }
