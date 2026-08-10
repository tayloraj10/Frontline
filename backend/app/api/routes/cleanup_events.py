import json
import secrets
from datetime import datetime, timedelta
from typing import Literal
from uuid import UUID

import h3
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator, model_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services.contribution_scoring import record_contribution
from app.services.game_settings import get_game_settings

router = APIRouter(prefix="/cleanup-events", tags=["cleanup-events"])

# Separate router (same file, distinct prefix) for cleanup routes — a polyline
# alternative to a single point, usable by individuals, groups, and group events.
routes_router = APIRouter(prefix="/cleanup-routes", tags=["cleanup-routes"])

# How early/late a check-in may be relative to the event's own schedule. Sourced from the
# admin-editable `cleanup_event_grace_minutes_before`/`_after` game_settings rows (fallbacks
# below are only used if those rows are somehow missing). Proximity is likewise the
# admin-editable `cleanup_event_proximity_meters` game_settings row.
CLEANUP_EVENT_GRACE_MINUTES_BEFORE_FALLBACK = 30
CLEANUP_EVENT_GRACE_MINUTES_AFTER_FALLBACK = 120

# How long after an event's window closes a submission still counts as "on time" rather
# than late. Sourced from the admin-editable `cleanup_event_late_submission_hours` row.
CLEANUP_EVENT_LATE_SUBMISSION_HOURS_FALLBACK = 2

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
    address_line1: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    image_url: str | None = None
    max_attendees: int | None = None
    external_link: str | None = None
    route: dict | None = None
    cohost_group_ids: list[UUID] = []
    logging_mode: Literal["organizer_total", "individual"] = "organizer_total"

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

    @model_validator(mode="after")
    def _end_after_start(self) -> "CreateCleanupEventRequest":
        if self.scheduled_end is not None and self.scheduled_end <= self.scheduled_start:
            raise ValueError("The event's end time can't be before its start time.")
        return self


class PatchCleanupEventRequest(BaseModel):
    organizer_user_id: UUID
    title: str | None = None
    description: str | None = None
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None
    address_line1: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    image_url: str | None = None
    status: str | None = None
    max_attendees: int | None = None
    external_link: str | None = None
    route: dict | None = None
    clear_route: bool = False
    cohost_group_ids: list[UUID] | None = None
    logging_mode: Literal["organizer_total", "individual"] | None = None

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


class OrganizerCheckInRequest(BaseModel):
    organizer_user_id: UUID
    attendee_user_id: UUID


class AddEventPhotosRequest(BaseModel):
    user_id: UUID
    photo_urls: list[str]

    @field_validator("photo_urls")
    @classmethod
    def _non_empty(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("photo_urls must not be empty")
        return v


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
    also_check_in: bool = False

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


async def _is_any_cohost_admin(db: AsyncSession, cleanup_id: UUID, user_id: UUID) -> bool:
    result = await db.execute(
        text("""
            SELECT 1 FROM cleanup_event_cohosts h
            JOIN group_members gm ON gm.group_id = h.group_id
            WHERE h.cleanup_id = :cleanup_id AND gm.user_id = :user_id AND gm.role = 'admin'
        """),
        {"cleanup_id": str(cleanup_id), "user_id": str(user_id)},
    )
    return result.fetchone() is not None


async def _can_manage_event(db: AsyncSession, group_id: UUID, cleanup_id: UUID, user_id: UUID) -> bool:
    """Group admins retain their existing blanket override, as do admins of any
    co-hosting group; real per-event organizers (the creator, or anyone an organizer
    has promoted) get the same powers without needing to be a group admin."""
    if await _is_group_admin(db, group_id, user_id):
        return True
    if await _is_event_organizer(db, cleanup_id, user_id):
        return True
    return await _is_any_cohost_admin(db, cleanup_id, user_id)


async def _group_for_credit(db: AsyncSession, primary_group_id: UUID, cleanup_id: UUID, user_id: UUID) -> UUID:
    """For a co-hosted event, credit lands on whichever host group (primary or
    co-host) the attendee actually belongs to, preferring the primary host if they
    belong to more than one. Falls back to the primary host if they belong to none —
    identical to today's behavior for non-co-hosted events."""
    result = await db.execute(
        text("""
            SELECT gm.group_id FROM group_members gm
            WHERE gm.user_id = :user_id
              AND gm.group_id = ANY(
                ARRAY[CAST(:primary_group_id AS uuid)] ||
                COALESCE(
                    (SELECT array_agg(group_id) FROM cleanup_event_cohosts WHERE cleanup_id = :cleanup_id),
                    ARRAY[]::uuid[]
                )
              )
            ORDER BY (gm.group_id = CAST(:primary_group_id AS uuid)) DESC
            LIMIT 1
        """),
        {"user_id": str(user_id), "primary_group_id": str(primary_group_id), "cleanup_id": str(cleanup_id)},
    )
    row = result.fetchone()
    return row.group_id if row else primary_group_id


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
    settings = await get_game_settings(db)
    grace_after = settings.get("cleanup_event_grace_minutes_after", CLEANUP_EVENT_GRACE_MINUTES_AFTER_FALLBACK)
    result = await db.execute(
        text("""
            SELECT c.id, c.title, c.description, c.scheduled_start, c.scheduled_end,
                   c.status, c.image_urls, c.logging_mode,
                   ST_Y(c.location::geometry) AS latitude, ST_X(c.location::geometry) AS longitude,
                   g.id AS group_id, g.name AS group_name, g.slug AS group_slug, g.image_url AS group_logo_url,
                   (COALESCE(c.scheduled_end, c.scheduled_start) + (:grace_after * INTERVAL '1 minute') < NOW()) AS is_past,
                   COALESCE(bags.total_small_bags, 0) AS total_small_bags,
                   COALESCE(bags.total_large_bags, 0) AS total_large_bags,
                   COALESCE(cohosts.cohost_groups, '[]'::json) AS cohost_groups
            FROM cleanups c
            JOIN groups g ON g.id = c.group_id
            LEFT JOIN LATERAL (
                SELECT SUM(cl.metrics_small_bags) AS total_small_bags, SUM(cl.metrics_large_bags) AS total_large_bags
                FROM contributions co
                JOIN cleanups cl ON cl.id = co.cleanup_id
                WHERE co.cleanup_event_id = c.id
            ) bags ON true
            LEFT JOIN LATERAL (
                SELECT json_agg(json_build_object(
                    'group_id', hg.id, 'group_name', hg.name,
                    'group_slug', hg.slug, 'group_logo_url', hg.image_url
                )) AS cohost_groups
                FROM cleanup_event_cohosts h
                JOIN groups hg ON hg.id = h.group_id
                WHERE h.cleanup_id = c.id
            ) cohosts ON true
            WHERE c.campaign_id = :campaign_id
              AND c.is_group_event = true
              AND c.status IN ('scheduled', 'in_progress')
              AND c.location IS NOT NULL
              AND (
                COALESCE(c.scheduled_end, c.scheduled_start) IS NULL
                OR COALESCE(c.scheduled_end, c.scheduled_start) + (:grace_after * INTERVAL '1 minute') + INTERVAL '1 day' > NOW()
              )
            ORDER BY c.scheduled_start ASC NULLS LAST
        """),
        {"campaign_id": str(campaign_id), "grace_after": grace_after},
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
            "logging_mode": r.logging_mode,
            "lat": r.latitude,
            "lng": r.longitude,
            "group_id": str(r.group_id),
            "group_name": r.group_name,
            "group_slug": r.group_slug,
            "group_logo_url": r.group_logo_url,
            "is_past": r.is_past,
            "total_small_bags": r.total_small_bags,
            "total_large_bags": r.total_large_bags,
            "cohost_groups": r.cohost_groups,
        }
        for r in rows
    ]


@router.get("/group/{group_id}")
async def list_group_cleanup_events(group_id: UUID, db: AsyncSession = Depends(get_db)):
    """Cleanup events hosted by a group, for the group page — everyone gets both
    upcoming and past/cancelled events (the latter for the "Event History" section).
    is_past is computed in SQL against NOW() so it's correct regardless of server
    timezone handling."""
    settings = await get_game_settings(db)
    grace_after = settings.get("cleanup_event_grace_minutes_after", CLEANUP_EVENT_GRACE_MINUTES_AFTER_FALLBACK)
    result = await db.execute(
        text("""
            SELECT c.id, c.title, c.description, c.scheduled_start, c.scheduled_end,
                   c.status, c.image_urls, c.max_attendees,
                   ST_Y(c.location::geometry) AS latitude, ST_X(c.location::geometry) AS longitude,
                   (COALESCE(c.scheduled_end, c.scheduled_start) IS NOT NULL
                        AND COALESCE(c.scheduled_end, c.scheduled_start) < NOW()) AS is_past,
                   (c.scheduled_start IS NOT NULL
                        AND c.scheduled_start < NOW()
                        AND COALESCE(c.scheduled_end, c.scheduled_start)
                            + (:grace_after * INTERVAL '1 minute') >= NOW()) AS is_ongoing,
                   (SELECT COUNT(*) FROM cleanup_rsvps r WHERE r.cleanup_id = c.id AND r.status = 'going') AS going_count,
                   (c.group_id != :group_id) AS is_cohosted
            FROM cleanups c
            WHERE (c.group_id = :group_id
                   OR EXISTS (SELECT 1 FROM cleanup_event_cohosts h WHERE h.cleanup_id = c.id AND h.group_id = :group_id))
              AND c.is_group_event = true
              AND c.location IS NOT NULL
            ORDER BY c.scheduled_start ASC NULLS LAST
        """),
        {"group_id": str(group_id), "grace_after": grace_after},
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
            "is_cohosted": r.is_cohosted,
        }
        for r in rows
    ]
    return events


@router.get("/{cleanup_id}")
async def get_cleanup_event(cleanup_id: UUID, viewer_user_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    """Single event detail for the RSVP/check-in page. join_code is only included
    when the viewer is a group admin, mirroring the omission in the list endpoint."""
    settings = await get_game_settings(db)
    result = await db.execute(
        text("""
            SELECT c.id, c.campaign_id, cam.slug AS campaign_slug, c.title, c.description,
                   c.scheduled_start, c.scheduled_end, c.status, c.image_urls, c.join_code,
                   c.max_attendees, c.external_link, c.logging_mode,
                   c.address_line1, c.city, c.state, c.postal_code, c.country,
                   c.metrics_small_bags, c.metrics_large_bags, c.metrics_pounds,
                   ST_Y(c.location::geometry) AS latitude, ST_X(c.location::geometry) AS longitude,
                   ST_AsGeoJSON(c.route)::json AS route,
                   ST_AsGeoJSON(ST_Buffer(c.route::geography, :radius))::json AS route_buffer,
                   g.id AS group_id, g.name AS group_name, g.slug AS group_slug, g.image_url AS group_logo_url,
                   COALESCE(cohosts.cohost_groups, '[]'::json) AS cohost_groups
            FROM cleanups c
            JOIN groups g ON g.id = c.group_id
            JOIN campaigns cam ON cam.id = c.campaign_id
            LEFT JOIN LATERAL (
                SELECT json_agg(json_build_object(
                    'group_id', hg.id, 'group_name', hg.name,
                    'group_slug', hg.slug, 'group_logo_url', hg.image_url
                )) AS cohost_groups
                FROM cleanup_event_cohosts h
                JOIN groups hg ON hg.id = h.group_id
                WHERE h.cleanup_id = c.id
            ) cohosts ON true
            WHERE c.id = :id AND c.is_group_event = true
        """),
        {"id": str(cleanup_id), "radius": settings.get("cleanup_event_proximity_meters", 150.0)},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Cleanup event not found")

    is_organizer = bool(viewer_user_id) and await _can_manage_event(db, row.group_id, cleanup_id, viewer_user_id)

    rsvp_result = await db.execute(
        text("""
            SELECT r.user_id, p.username, p.display_name, p.avatar_url, r.status, r.checked_in_at, r.is_organizer
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
                   array_agg(cl.id) FILTER (WHERE cl.image_urls IS NOT NULL AND cardinality(cl.image_urls) > 0) AS cleanup_ids,
                   array_agg(cl.image_urls) FILTER (WHERE cl.image_urls IS NOT NULL AND cardinality(cl.image_urls) > 0) AS image_url_arrays
            FROM contributions co
            JOIN cleanups cl ON cl.id = co.cleanup_id
            WHERE co.cleanup_event_id = :id
            GROUP BY co.user_id
        """),
        {"id": str(cleanup_id)},
    )
    bags_by_user = {}
    all_photos: list[dict] = []
    for r in bags_by_user_result.fetchall():
        photos = [
            {"url": url, "content_type": "cleanup_log_photo", "content_id": str(cleanup_row_id)}
            for cleanup_row_id, arr in zip(r.cleanup_ids or [], r.image_url_arrays or [])
            for url in arr
        ]
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
    # credit happened." Pull each attendee's points directly from contributions, split by
    # contribution_type, so the UI can tell check-in credit apart from team-total credit
    # instead of lumping both into one number (they used to be indistinguishable once the
    # page reloads, since neither has bags/pounds attached).
    points_by_user_result = await db.execute(
        text("""
            SELECT user_id, contribution_type, SUM(value) AS points
            FROM contributions
            WHERE cleanup_event_id = :id
            GROUP BY user_id, contribution_type
        """),
        {"id": str(cleanup_id)},
    )
    checkin_points_by_user: dict[str, float] = {}
    team_total_points_by_user: dict[str, float] = {}
    for r in points_by_user_result.fetchall():
        target = checkin_points_by_user if r.contribution_type == "cleanup_event_checkin" else team_total_points_by_user
        target[str(r.user_id)] = target.get(str(r.user_id), 0.0) + float(r.points)
    points_by_user = {
        uid: checkin_points_by_user.get(uid, 0.0) + team_total_points_by_user.get(uid, 0.0)
        for uid in set(checkin_points_by_user) | set(team_total_points_by_user)
    }

    # Photo-only adds (no bags/pounds/points attached) — kept separate from the
    # contribution-derived photos above since they don't belong to any attendee's bag
    # breakdown, just the flat event-wide gallery.
    event_photos_result = await db.execute(
        text("SELECT id, photo_url FROM cleanup_event_photos WHERE cleanup_id = :id ORDER BY created_at ASC"),
        {"id": str(cleanup_id)},
    )
    all_photos.extend(
        {"url": r.photo_url, "content_type": "cleanup_event_photo", "content_id": str(r.id)}
        for r in event_photos_result.fetchall()
    )

    # A submission counts as "late" once it lands more than cleanup_event_late_submission_hours
    # after the event's window closes — unrestricted (submissions are never blocked), just flagged.
    late_submission_hours = settings.get(
        "cleanup_event_late_submission_hours", CLEANUP_EVENT_LATE_SUBMISSION_HOURS_FALLBACK
    )
    late_cutoff = (row.scheduled_end or row.scheduled_start) + timedelta(hours=late_submission_hours) \
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
            "avatar_url": r.avatar_url,
            "status": r.status,
            "checked_in_at": r.checked_in_at.isoformat() if r.checked_in_at else None,
            "is_organizer": r.is_organizer,
            "small_bags": user_bags["small_bags"],
            "large_bags": user_bags["large_bags"],
            "pounds": user_bags["pounds"],
            "photos": user_bags["photos"],
            "points": points_by_user.get(str(r.user_id), 0.0),
            "checkin_points": checkin_points_by_user.get(str(r.user_id), 0.0),
            "team_total_points": team_total_points_by_user.get(str(r.user_id), 0.0),
            "is_late": bool(contributed_at and late_cutoff and contributed_at > late_cutoff),
            # True only for credit from self-log / "log for them" (both create their own
            # cleanups row, which is how they land in bags_by_user). Team-total credit never
            # gets a cleanups row and is NOT reflected here, because it's always wiped and
            # re-split on the next log-team-total submission — so an attendee currently
            # credited only via team-total is still eligible to be re-included next time,
            # even though their cleanup_rsvps.contribution_id is non-NULL right now.
            "has_individual_contribution": str(r.user_id) in bags_by_user,
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
        row.scheduled_start - timedelta(
            minutes=settings.get("cleanup_event_grace_minutes_before", CLEANUP_EVENT_GRACE_MINUTES_BEFORE_FALLBACK)
        )
        if row.scheduled_start else None
    )
    window_end_base = row.scheduled_end or row.scheduled_start
    check_in_window_end = (
        window_end_base + timedelta(
            minutes=settings.get("cleanup_event_grace_minutes_after", CLEANUP_EVENT_GRACE_MINUTES_AFTER_FALLBACK)
        )
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
        "address_line1": row.address_line1,
        "city": row.city,
        "state": row.state,
        "postal_code": row.postal_code,
        "country": row.country,
        "route": row.route,
        "route_buffer": row.route_buffer,
        "group_id": str(row.group_id),
        "group_name": row.group_name,
        "group_slug": row.group_slug,
        "group_logo_url": row.group_logo_url,
        "cohost_groups": row.cohost_groups,
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
        "logging_mode": row.logging_mode,
        "check_in_window_start": check_in_window_start.isoformat() if check_in_window_start else None,
        "check_in_window_end": check_in_window_end.isoformat() if check_in_window_end else None,
        "check_in_radius_meters": settings.get("cleanup_event_proximity_meters", 150.0),
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
                 title, description, location,
                 address_line1, city, state, postal_code, country,
                 route, scheduled_start, scheduled_end,
                 status, image_urls, submitted_by_user_id, max_attendees, external_link, logging_mode)
            VALUES
                (:campaign_id, :geo_unit_id, :group_id, true, :join_code,
                 :title, :description,
                 ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                 :address_line1, :city, :state, :postal_code, :country,
                 CASE WHEN CAST(:route AS text) IS NOT NULL
                      THEN ST_GeomFromGeoJSON(CAST(:route AS text))::geography
                      ELSE NULL END,
                 :scheduled_start, :scheduled_end,
                 'scheduled', :image_urls, :organizer_user_id, :max_attendees, :external_link, :logging_mode)
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
            "address_line1": payload.address_line1,
            "city": payload.city,
            "state": payload.state,
            "postal_code": payload.postal_code,
            "country": payload.country,
            "route": json.dumps(payload.route) if payload.route is not None else None,
            "scheduled_start": payload.scheduled_start,
            "scheduled_end": payload.scheduled_end,
            "image_urls": [payload.image_url] if payload.image_url else [],
            "organizer_user_id": str(payload.organizer_user_id),
            "max_attendees": payload.max_attendees,
            "external_link": payload.external_link,
            "logging_mode": payload.logging_mode,
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

    # Unrestricted for now: the primary host can add any group as a co-host without
    # that group's consent. TODO: future iteration should require the target group's
    # own admin to accept before it's attached (invite/accept flow).
    cohost_group_ids = {str(g) for g in payload.cohost_group_ids if str(g) != str(payload.group_id)}
    for cohost_group_id in cohost_group_ids:
        await db.execute(
            text("INSERT INTO cleanup_event_cohosts (cleanup_id, group_id) VALUES (:cleanup_id, :group_id)"),
            {"cleanup_id": str(row.id), "group_id": cohost_group_id},
        )

    await db.commit()

    return {"id": str(row.id), "join_code": row.join_code, "geo_unit_id": geo_unit_id}


@router.patch("/{cleanup_id}")
async def patch_cleanup_event(cleanup_id: UUID, payload: PatchCleanupEventRequest, db: AsyncSession = Depends(get_db)):
    event = await _get_event_or_404(db, cleanup_id)

    if not await _can_manage_event(db, event.group_id, cleanup_id, payload.organizer_user_id):
        raise HTTPException(status_code=403, detail="Only a group admin or event organizer can edit this event")

    if payload.cohost_group_ids is not None and not await _is_group_admin(db, event.group_id, payload.organizer_user_id):
        raise HTTPException(status_code=403, detail="Only the primary host group's admins can manage co-hosts")

    effective_start = payload.scheduled_start or event.scheduled_start
    effective_end = payload.scheduled_end or event.scheduled_end
    if effective_end is not None and effective_start is not None and effective_end <= effective_start:
        raise HTTPException(status_code=400, detail="The event's end time can't be before its start time.")

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
                logging_mode = COALESCE(:logging_mode, logging_mode),
                geo_unit_id = CASE WHEN :has_new_location THEN CAST(:geo_unit_id AS uuid) ELSE geo_unit_id END,
                location = CASE WHEN :has_new_location
                                THEN ST_SetSRID(ST_MakePoint(CAST(:lon AS double precision), CAST(:lat AS double precision)), 4326)::geography
                                ELSE location END,
                address_line1 = COALESCE(:address_line1, address_line1),
                city = COALESCE(:city, city),
                state = COALESCE(:state, state),
                postal_code = COALESCE(:postal_code, postal_code),
                country = COALESCE(:country, country),
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
            "address_line1": payload.address_line1,
            "city": payload.city,
            "state": payload.state,
            "postal_code": payload.postal_code,
            "country": payload.country,
            "max_attendees": payload.max_attendees,
            "external_link": payload.external_link,
            "logging_mode": payload.logging_mode,
            "route": json.dumps(payload.route) if payload.route is not None else None,
            "clear_route": payload.clear_route,
        },
    )

    if payload.cohost_group_ids is not None:
        await db.execute(
            text("DELETE FROM cleanup_event_cohosts WHERE cleanup_id = :cleanup_id"),
            {"cleanup_id": str(cleanup_id)},
        )
        cohost_group_ids = {str(g) for g in payload.cohost_group_ids if str(g) != str(event.group_id)}
        for cohost_group_id in cohost_group_ids:
            await db.execute(
                text("INSERT INTO cleanup_event_cohosts (cleanup_id, group_id) VALUES (:cleanup_id, :group_id)"),
                {"cleanup_id": str(cleanup_id), "group_id": cohost_group_id},
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


@router.post("/{cleanup_id}/photos")
async def add_event_photos(cleanup_id: UUID, payload: AddEventPhotosRequest, db: AsyncSession = Depends(get_db)):
    """Photo-only add to an event's gallery — no bags/pounds/points, no contribution
    row. Distinct from the log-for-attendee/log-team-total/self-log paths, which all
    attach photos as a side effect of logging a contribution."""
    await _get_event_or_404(db, cleanup_id)

    await db.execute(
        text("""
            INSERT INTO cleanup_event_photos (cleanup_id, user_id, photo_url)
            SELECT :cleanup_id, :user_id, url FROM unnest(CAST(:photo_urls AS text[])) AS url
        """),
        {"cleanup_id": str(cleanup_id), "user_id": str(payload.user_id), "photo_urls": payload.photo_urls},
    )
    await db.commit()

    return {"added": len(payload.photo_urls)}


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
    settings = await get_game_settings(db)
    grace_before = settings.get("cleanup_event_grace_minutes_before", CLEANUP_EVENT_GRACE_MINUTES_BEFORE_FALLBACK)
    grace_after = settings.get("cleanup_event_grace_minutes_after", CLEANUP_EVENT_GRACE_MINUTES_AFTER_FALLBACK)
    window_start = event.scheduled_start - timedelta(minutes=grace_before) if event.scheduled_start else None
    window_end_base = event.scheduled_end or event.scheduled_start
    window_end = window_end_base + timedelta(minutes=grace_after) if window_end_base else None

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
                "threshold": settings.get("cleanup_event_proximity_meters", 150.0),
                "id": str(cleanup_id),
            },
        )
        if not prox_result.scalar():
            raise HTTPException(status_code=403, detail="You're too far from the event location to check in")

    # Only the first check-in for this attendee should award points — re-checking in
    # (e.g. a retry, or the organizer checking in someone who already self-checked-in)
    # must not re-credit them. A separate SELECT-then-INSERT would race under concurrent
    # requests (both could read "not checked in yet" before either commits), so
    # "was this the first check-in" is derived from the upsert itself: `just_checked_in`
    # is true only when checked_in_at was NULL before this statement, and the unique
    # index on (cleanup_id, user_id) serializes concurrent upserts of the same row.
    result = await db.execute(
        text("""
            WITH ts AS (SELECT NOW() AS now_val)
            INSERT INTO cleanup_rsvps (cleanup_id, user_id, status, checked_in_at)
            SELECT :cleanup_id, :user_id, 'going', now_val FROM ts
            ON CONFLICT (cleanup_id, user_id) DO UPDATE SET
                checked_in_at = COALESCE(cleanup_rsvps.checked_in_at, (SELECT now_val FROM ts)),
                updated_at = (SELECT now_val FROM ts)
            RETURNING id, checked_in_at, (checked_in_at = (SELECT now_val FROM ts)) AS just_checked_in
        """),
        {"cleanup_id": str(cleanup_id), "user_id": str(payload.user_id)},
    )
    row = result.fetchone()

    points_awarded = 0.0
    if row.just_checked_in:
        points_awarded = settings.get("cleanup_event_checkin_value", 5)
        credit_group_id = await _group_for_credit(db, event.group_id, cleanup_id, payload.user_id)
        await record_contribution(
            db,
            user_id=payload.user_id,
            campaign_id=event.campaign_id,
            group_id=credit_group_id,
            geo_unit_id=None,
            cleanup_id=None,
            cleanup_event_id=str(cleanup_id),
            contribution_type="cleanup_event_checkin",
            value=points_awarded,
            apply_multiplier=False,
        )

    await db.commit()

    return {"id": str(row.id), "checked_in_at": row.checked_in_at.isoformat(), "points_awarded": points_awarded}


@router.post("/{cleanup_id}/organizer-check-in")
async def organizer_check_in_attendee(cleanup_id: UUID, payload: OrganizerCheckInRequest, db: AsyncSession = Depends(get_db)):
    """Lets an organizer manually check an attendee in — e.g. they forgot their phone,
    have a dead battery, or are outside the self-check-in proximity/time window but the
    organizer can vouch for them in person. Bypasses the join-code/GPS-proximity/window
    checks that gate self-check-in, since the organizer is the verification here."""
    event = await _get_event_or_404(db, cleanup_id)

    if not await _can_manage_event(db, event.group_id, cleanup_id, payload.organizer_user_id):
        raise HTTPException(status_code=403, detail="Only a group admin or event organizer can check in an attendee")

    # See check_in_to_cleanup_event for why "was this the first check-in" is derived
    # from the upsert's RETURNING instead of a separate SELECT-then-INSERT.
    result = await db.execute(
        text("""
            WITH ts AS (SELECT NOW() AS now_val)
            INSERT INTO cleanup_rsvps (cleanup_id, user_id, status, checked_in_at)
            SELECT :cleanup_id, :user_id, 'going', now_val FROM ts
            ON CONFLICT (cleanup_id, user_id) DO UPDATE SET
                checked_in_at = COALESCE(cleanup_rsvps.checked_in_at, (SELECT now_val FROM ts)),
                updated_at = (SELECT now_val FROM ts)
            RETURNING id, checked_in_at, (checked_in_at = (SELECT now_val FROM ts)) AS just_checked_in
        """),
        {"cleanup_id": str(cleanup_id), "user_id": str(payload.attendee_user_id)},
    )
    row = result.fetchone()

    points_awarded = 0.0
    if row.just_checked_in:
        settings = await get_game_settings(db)
        points_awarded = settings.get("cleanup_event_checkin_value", 5)
        credit_group_id = await _group_for_credit(db, event.group_id, cleanup_id, payload.attendee_user_id)
        await record_contribution(
            db,
            user_id=payload.attendee_user_id,
            campaign_id=event.campaign_id,
            group_id=credit_group_id,
            geo_unit_id=None,
            cleanup_id=None,
            cleanup_event_id=str(cleanup_id),
            contribution_type="cleanup_event_checkin",
            value=points_awarded,
            apply_multiplier=False,
            recorded_by_user_id=payload.organizer_user_id,
        )

    await db.commit()

    return {"id": str(row.id), "checked_in_at": row.checked_in_at.isoformat(), "points_awarded": points_awarded}


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

    settings = await get_game_settings(db)

    # Pounds and bags are two ways of estimating the same haul (see log-team-total) —
    # both are always saved to the attendee's cleanups row below for the event's record,
    # but only the organizer-selected scoring_method determines points, so switching
    # methods in the UI doesn't silently drop the other field's value.
    if payload.scoring_method == "pounds":
        value = (payload.pounds or 0) * settings.get("pound_value", 0.5)
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

    credit_group_id = await _group_for_credit(db, event.group_id, cleanup_id, payload.attendee_user_id)

    recorded = await record_contribution(
        db,
        user_id=payload.attendee_user_id,
        campaign_id=event.campaign_id,
        group_id=credit_group_id,
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
    actually showed up.

    Each submission represents the event's full total, not a delta: any contributions
    previously credited by this endpoint for this event are wiped first (their
    territory-claim value reversed and their `cleanup_rsvps.contribution_id` cleared so
    they re-enter the eligible pool), then the new total is split fresh across everyone
    currently eligible — including attendees added or checked in since the last log.
    Attendees credited via a different path (self-logged, or `log-for-attendee`) are
    untouched, since they carry their own `cleanup_id` and are never targeted by the
    wipe below.

    `attendee_pool: "going"` credits everyone who RSVP'd going, not just people who
    formally checked in — that's an unverified pool (no proximity check, no organizer
    vouch), so it never checks anyone in or awards check-in points on its own. An
    organizer can opt into also checking in (and awarding the check-in bonus to) anyone
    in that pool who isn't already checked in via `also_check_in=True`, which is an
    explicit attendance attestation on top of just logging a total. `attendee_pool:
    "checked_in"` is already a verified pool, so this always applies to it."""
    event = await _get_event_or_404(db, cleanup_id)

    if not await _can_manage_event(db, event.group_id, cleanup_id, payload.organizer_user_id):
        raise HTTPException(status_code=403, detail="Only a group admin or event organizer can log a team total")

    settings = await get_game_settings(db)

    if payload.scoring_method == "pounds":
        total_value = (payload.pounds or 0) * settings.get("pound_value", 0.5)
    else:
        total_value = (payload.small_bags or 0) * settings.get("small_bag_value", 1) + (
            payload.large_bags or 0
        ) * settings.get("large_bag_value", 3)

    overrides = {str(k): v for k, v in (payload.overrides or {}).items()}
    override_total = sum(overrides.values())
    if override_total > total_value:
        raise HTTPException(status_code=400, detail="Overrides can't exceed the event total")

    # Wipe prior team-total credit for this event before re-splitting. These rows are
    # uniquely identifiable as cleanup_id IS NULL (team-total credit never gets its own
    # cleanups row, unlike self-logs and log-for-attendee) + cleanup_event_id = this event.
    prior_result = await db.execute(
        text("""
            SELECT id, user_id, value FROM contributions
            WHERE cleanup_event_id = :cleanup_id AND cleanup_id IS NULL AND contribution_type = 'cleanup'
        """),
        {"cleanup_id": str(cleanup_id)},
    )
    prior_rows = prior_result.fetchall()
    if prior_rows:
        prior_value_sum = sum(float(r.value) for r in prior_rows)
        await db.execute(
            text("DELETE FROM contributions WHERE id = ANY(:ids)"),
            {"ids": [str(r.id) for r in prior_rows]},
        )
        await db.execute(
            text("""
                UPDATE cleanup_rsvps SET contribution_id = NULL, updated_at = NOW()
                WHERE cleanup_id = :cleanup_id AND user_id = ANY(:user_ids)
            """),
            {"cleanup_id": str(cleanup_id), "user_ids": [str(r.user_id) for r in prior_rows]},
        )
        if event.geo_unit_id and prior_value_sum:
            await db.execute(
                text("""
                    UPDATE territory_claims SET total_value = total_value - :v, updated_at = NOW()
                    WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
                """),
                {"campaign_id": str(event.campaign_id), "geo_unit_id": event.geo_unit_id, "v": prior_value_sum},
            )

    pool_query = """
        SELECT user_id, checked_in_at FROM cleanup_rsvps
        WHERE cleanup_id = :cleanup_id AND status = 'going' AND contribution_id IS NULL
    """
    if payload.attendee_pool == "checked_in":
        pool_query += " AND checked_in_at IS NOT NULL"
    pool_result = await db.execute(text(pool_query), {"cleanup_id": str(cleanup_id)})
    pool_rows = pool_result.fetchall()
    pool = [str(r.user_id) for r in pool_rows]
    # The "checked_in" pool is already a verified attendance signal, so it always checks
    # people in. The "going" pool is just an RSVP with no attendance verification, so it
    # only checks people in (and awards the check-in bonus) if the organizer explicitly
    # opts in via also_check_in — otherwise a no-show who RSVP'd would get marked
    # checked-in and paid the check-in bonus for doing nothing.
    should_check_in = payload.attendee_pool == "checked_in" or payload.also_check_in
    not_yet_checked_in = (
        {str(r.user_id) for r in pool_rows if r.checked_in_at is None} if should_check_in else set()
    )

    # Nothing has been committed yet (the wipe above is still pending on this session), so
    # bailing out here just discards it — the prior log stays intact. Without this check, an
    # organizer re-logging with an empty pool (e.g. "checked in" selected but nobody's
    # currently checked in) would wipe the previous credit and silently award the new total
    # to no one.
    if not pool:
        raise HTTPException(
            status_code=400,
            detail="No eligible attendees in the selected pool. Nobody would be credited, "
            "so the previous log has been left as-is.",
        )

    missing_overrides = set(overrides) - set(pool)
    if missing_overrides:
        raise HTTPException(status_code=400, detail=f"Not eligible attendees: {sorted(missing_overrides)}")

    # The submitted total is the event's new full total, not an increment, so these
    # columns are set outright rather than accumulated.
    await db.execute(
        text("""
            UPDATE cleanups SET
                metrics_small_bags = :sb,
                metrics_large_bags = :lb,
                metrics_pounds = :lbs
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

    checkin_value = settings.get("cleanup_event_checkin_value", 5)
    newly_checked_in_count = 0

    for user_id in pool:
        share = round(overrides.get(user_id, split_value) * 2) / 2
        credit_group_id = await _group_for_credit(db, event.group_id, cleanup_id, UUID(user_id))
        recorded = await record_contribution(
            db,
            user_id=user_id,
            campaign_id=event.campaign_id,
            group_id=credit_group_id,
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

        if user_id in not_yet_checked_in:
            newly_checked_in_count += 1
            await record_contribution(
                db,
                user_id=user_id,
                campaign_id=event.campaign_id,
                group_id=credit_group_id,
                geo_unit_id=None,
                cleanup_id=None,
                cleanup_event_id=str(cleanup_id),
                contribution_type="cleanup_event_checkin",
                value=checkin_value,
                apply_multiplier=False,
            )

        await db.execute(
            text("""
                INSERT INTO cleanup_rsvps (cleanup_id, user_id, status, checked_in_at, contribution_id)
                VALUES (
                    :cleanup_id, :user_id, 'going',
                    CASE WHEN :should_check_in THEN NOW() ELSE NULL END,
                    :contribution_id
                )
                ON CONFLICT (cleanup_id, user_id) DO UPDATE SET
                    checked_in_at = COALESCE(cleanup_rsvps.checked_in_at, EXCLUDED.checked_in_at),
                    contribution_id = EXCLUDED.contribution_id,
                    updated_at = NOW()
            """),
            {
                "cleanup_id": str(cleanup_id),
                "user_id": user_id,
                "contribution_id": recorded.contribution_id,
                "should_check_in": should_check_in,
            },
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

    return {
        "credited_count": len(pool),
        "total_value": total_value,
        "per_attendee_value": split_value,
        "newly_checked_in_count": newly_checked_in_count,
    }


@router.get("/{cleanup_id}/team-total-logs")
async def get_team_total_logs(cleanup_id: UUID, db: AsyncSession = Depends(get_db)):
    """History of every log-team-total submission for this event, newest first. Each
    submission wipes and fully re-splits credit (see log_team_total's docstring), so only
    the most recent entry reflects who's currently credited — earlier entries are kept as
    an audit trail of superseded totals, not still-standing credit."""
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
    event-linked routes only) a buffered corridor polygon for the check-in zone display.

    Ad-hoc (non-event) routes never expire here. Group-event routes must pass the same
    status/expiry filter as list_campaign_cleanup_events's point markers, otherwise an
    event's route would keep being returned after its point-marker counterpart aged out —
    the frontend derives its "is this an event route" styling/expiry purely from whether
    the id is still present in that events list, so a route left behind here silently
    renders forever as if it were a plain ad-hoc route instead of disappearing."""
    settings = await get_game_settings(db)
    grace_after = settings.get("cleanup_event_grace_minutes_after", CLEANUP_EVENT_GRACE_MINUTES_AFTER_FALLBACK)
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
            WHERE c.campaign_id = :campaign_id
              AND c.route IS NOT NULL
              AND (
                NOT c.is_group_event
                OR (
                    c.status IN ('scheduled', 'in_progress')
                    AND (
                        COALESCE(c.scheduled_end, c.scheduled_start) IS NULL
                        OR COALESCE(c.scheduled_end, c.scheduled_start)
                            + (:grace_after * INTERVAL '1 minute') + INTERVAL '1 day' > NOW()
                    )
                )
              )
            ORDER BY c.created_at DESC
            LIMIT 500
        """),
        {
            "campaign_id": str(campaign_id),
            "radius": settings.get("cleanup_event_proximity_meters", 150.0),
            "grace_after": grace_after,
        },
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
