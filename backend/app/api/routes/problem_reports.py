from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db

router = APIRouter(prefix="/problem-reports", tags=["problem-reports"])

# "Claim-a-report" challenge mode timers/rewards (Trash War backlog item #3).
# Arrival + before-photo window is flat regardless of severity; the after-photo
# (clean-up) window scales with severity since more severe sites take longer to clear.
CLAIM_BEFORE_WINDOW_MINUTES = 30
CLAIM_AFTER_WINDOW_MINUTES = {"low": 20, "medium": 30, "high": 45}
CLAIM_RECLAIM_COOLDOWN_MINUTES = 15
CLAIM_CHALLENGE_MULTIPLIER = 1.5
FLAG_AUTO_HIDE_THRESHOLD = 3

# Same proximity convention as HOTSPOT_PROXIMITY_METERS_UK/US in contributions.py (and the
# REPORT_CLAIM_RADIUS_METERS_* circle already drawn on the map) — reused here so a claim's
# before/after photo has to be submitted from roughly the same spot a plain in-range cleanup
# would require, with enough slack for a report pin that isn't pixel-perfect.
CLAIM_PROXIMITY_METERS_UK = 100.0
CLAIM_PROXIMITY_METERS_US = 91.44  # 300 ft


class ProblemReportRequest(BaseModel):
    campaign_id: UUID
    submitted_by_user_id: UUID
    photo_url: str
    latitude: float
    longitude: float
    severity: str = "medium"


class ClaimRequest(BaseModel):
    user_id: UUID


class ClaimPhotoRequest(BaseModel):
    user_id: UUID
    photo_url: str
    latitude: float
    longitude: float


class ClaimReleaseRequest(BaseModel):
    user_id: UUID


class FlagReportRequest(BaseModel):
    user_id: UUID
    reason: str | None = None


async def _assert_within_claim_radius(report_id: UUID, lat: float, lon: float, db: AsyncSession) -> None:
    """Re-verify proximity server-side rather than trusting the client's own distance
    calculation, mirroring the existing hotspot-resolve proximity check in contributions.py."""
    check = await db.execute(
        text("""
            SELECT ST_DWithin(
                pr.location,
                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                CASE WHEN gu.unit_type = 'uk_postcode_district' THEN CAST(:threshold_uk AS double precision)
                     ELSE CAST(:threshold_us AS double precision) END
            )
            FROM problem_reports pr
            LEFT JOIN geo_units gu ON gu.id = pr.geo_unit_id
            WHERE pr.id = :report_id
        """),
        {
            "report_id": str(report_id),
            "lat": lat,
            "lon": lon,
            "threshold_uk": CLAIM_PROXIMITY_METERS_UK,
            "threshold_us": CLAIM_PROXIMITY_METERS_US,
        },
    )
    row = check.fetchone()
    if not row or not row[0]:
        raise HTTPException(status_code=403, detail="You need to be at the report's location to submit this photo")


async def _expire_stale_claim(report_id: UUID, db: AsyncSession) -> None:
    """Revert an expired claim to 'open' and notify the claimant. Checked on every
    claim-related read/write instead of via a cron job, since expiry is a passage of
    time rather than a row event a DB trigger could fire on."""
    expired = await db.execute(
        text("""
            UPDATE problem_reports
            SET status = 'open', claim_released_at = NOW()
            WHERE id = :report_id
              AND status IN ('scheduled', 'in_progress')
              AND (
                  (status = 'scheduled' AND claim_before_deadline_at < NOW())
                  OR (status = 'in_progress' AND claim_after_deadline_at < NOW())
              )
            RETURNING claimed_by_user_id, campaign_id
        """),
        {"report_id": str(report_id)},
    )
    row = expired.fetchone()
    if row and row[0]:
        await db.execute(
            text("""
                INSERT INTO user_notifications (user_id, type, title, body, campaign_id, campaign_slug)
                SELECT :user_id, 'claim_expired', 'Your claim expired',
                       'Your claimed trash report reverted to open — someone else can pick it up now.',
                       :campaign_id, camps.slug
                FROM campaigns camps WHERE camps.id = :campaign_id
            """),
            {"user_id": str(row[0]), "campaign_id": str(row[1])},
        )


@router.post("")
async def submit_problem_report(payload: ProblemReportRequest, db: AsyncSession = Depends(get_db)):
    camp_result = await db.execute(
        text("SELECT geo_unit FROM campaigns WHERE id = :campaign_id"),
        {"campaign_id": str(payload.campaign_id)},
    )
    camp_row = camp_result.fetchone()
    campaign_geo_unit = camp_row[0] if camp_row and camp_row[0] else ["zip"]

    # Find geo_unit via point-in-polygon
    geo_result = await db.execute(
        text("""
            SELECT id FROM geo_units
            WHERE ST_Contains(geometry, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))
            AND unit_type = ANY(:geo_unit)
            LIMIT 1
        """),
        {"lon": payload.longitude, "lat": payload.latitude, "geo_unit": campaign_geo_unit},
    )
    geo_unit_row = geo_result.fetchone()
    geo_unit_id = str(geo_unit_row[0]) if geo_unit_row else None

    await db.execute(
        text("""
            INSERT INTO problem_reports (campaign_id, geo_unit_id, submitted_by_user_id, image_urls, location, severity)
            VALUES (:campaign_id, :geo_unit_id, :submitted_by_user_id, :image_urls,
                    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :severity)
        """),
        {
            "campaign_id": str(payload.campaign_id),
            "geo_unit_id": geo_unit_id,
            "submitted_by_user_id": str(payload.submitted_by_user_id),
            "image_urls": [payload.photo_url],
            "lon": payload.longitude,
            "lat": payload.latitude,
            "severity": payload.severity,
        },
    )

    # Check report_count triggers for this campaign/geo_unit
    if geo_unit_id:
        await _check_report_triggers(payload.campaign_id, geo_unit_id, db)

    await db.commit()
    return {"geo_unit_id": geo_unit_id, "status": "submitted"}


@router.get("/campaign/{campaign_id}")
async def get_campaign_reports(campaign_id: UUID, db: AsyncSession = Depends(get_db)):
    """Return open + actively-claimed problem reports with extracted lat/lng, per-geo-unit
    counts (open reports only), and the hotspot threshold."""
    # Opportunistically clear any claims whose timer has lapsed before reading the list,
    # so a stale "claimed" pin never lingers past its deadline for other viewers.
    stale = await db.execute(
        text("""
            SELECT id FROM problem_reports
            WHERE campaign_id = :campaign_id
              AND status IN ('scheduled', 'in_progress')
              AND (
                  (status = 'scheduled' AND claim_before_deadline_at < NOW())
                  OR (status = 'in_progress' AND claim_after_deadline_at < NOW())
              )
        """),
        {"campaign_id": str(campaign_id)},
    )
    for row in stale.fetchall():
        await _expire_stale_claim(row.id, db)
    await db.commit()

    rows_result = await db.execute(
        text("""
            SELECT pr.id, pr.geo_unit_id, pr.severity, pr.reported_at, pr.image_urls,
                   ST_Y(pr.location::geometry) AS latitude,
                   ST_X(pr.location::geometry) AS longitude,
                   gu.unit_type, pr.status, pr.claimed_by_user_id,
                   pr.claim_before_deadline_at, pr.claim_after_deadline_at,
                   COALESCE(flag_counts.flag_count, 0) AS flag_count
            FROM problem_reports pr
            LEFT JOIN geo_units gu ON gu.id = pr.geo_unit_id
            LEFT JOIN (
                SELECT report_id, COUNT(*) AS flag_count
                FROM problem_report_flags
                GROUP BY report_id
            ) flag_counts ON flag_counts.report_id = pr.id
            WHERE pr.campaign_id = :campaign_id AND pr.status IN ('open', 'scheduled', 'in_progress')
            ORDER BY pr.reported_at DESC
        """),
        {"campaign_id": str(campaign_id)},
    )
    rows = rows_result.fetchall()

    counts: dict[str, int] = {}
    for row in rows:
        if row.geo_unit_id and row.status == "open":
            counts[str(row.geo_unit_id)] = counts.get(str(row.geo_unit_id), 0) + 1

    trigger_result = await db.execute(
        text("""
            SELECT condition_config FROM event_triggers
            WHERE campaign_id = :campaign_id AND condition_type = 'report_count' AND is_active = TRUE
            LIMIT 1
        """),
        {"campaign_id": str(campaign_id)},
    )
    trigger_row = trigger_result.fetchone()
    threshold = (trigger_row.condition_config or {}).get("threshold", 5) if trigger_row else None

    return {
        "reports": [
            {
                "id": str(row.id),
                "geo_unit_id": str(row.geo_unit_id) if row.geo_unit_id else None,
                "severity": row.severity,
                "reported_at": str(row.reported_at),
                "photo_url": row.image_urls[0] if row.image_urls else None,
                "latitude": row.latitude,
                "longitude": row.longitude,
                "unit_type": row.unit_type,
                "status": row.status,
                "claimed_by_user_id": str(row.claimed_by_user_id) if row.claimed_by_user_id else None,
                "claim_before_deadline_at": row.claim_before_deadline_at.isoformat()
                if row.claim_before_deadline_at
                else None,
                "claim_after_deadline_at": row.claim_after_deadline_at.isoformat()
                if row.claim_after_deadline_at
                else None,
                "flag_count": row.flag_count,
            }
            for row in rows
        ],
        "counts_by_geo_unit": counts,
        "threshold": threshold,
        "flag_auto_hide_threshold": FLAG_AUTO_HIDE_THRESHOLD,
    }


@router.post("/{report_id}/claim")
async def claim_problem_report(report_id: UUID, payload: ClaimRequest, db: AsyncSession = Depends(get_db)):
    """Start challenge-mode claim flow: locks the report to this user and starts the
    arrival + before-photo timer. Reverting the plain in-range cleanup flow is unaffected —
    an unclaimed open report can still be resolved that way."""
    await _expire_stale_claim(report_id, db)

    cooldown_check = await db.execute(
        text("""
            SELECT status, claimed_by_user_id, claim_released_at FROM problem_reports WHERE id = :report_id
        """),
        {"report_id": str(report_id)},
    )
    report_row = cooldown_check.fetchone()
    if not report_row:
        raise HTTPException(status_code=404, detail="Report not found")
    if report_row.status != "open":
        raise HTTPException(status_code=409, detail="Report is not available to claim")

    # One active claim per user at a time — keeps the challenge mode from becoming a
    # land-grab where a single user locks down every report on the map at once.
    other_claim = await db.execute(
        text("""
            SELECT id FROM problem_reports
            WHERE claimed_by_user_id = :user_id
              AND status IN ('scheduled', 'in_progress')
              AND id != :report_id
            LIMIT 1
        """),
        {"user_id": str(payload.user_id), "report_id": str(report_id)},
    )
    if other_claim.fetchone():
        raise HTTPException(status_code=409, detail="You already have an active claim on another report")
    if (
        report_row.claimed_by_user_id
        and str(report_row.claimed_by_user_id) == str(payload.user_id)
        and report_row.claim_released_at
    ):
        cooldown_check2 = await db.execute(
            text("SELECT NOW() - :released_at < make_interval(mins => :cooldown)"),
            {"released_at": report_row.claim_released_at, "cooldown": CLAIM_RECLAIM_COOLDOWN_MINUTES},
        )
        if cooldown_check2.scalar():
            raise HTTPException(
                status_code=429,
                detail=f"You must wait before reclaiming this report again ({CLAIM_RECLAIM_COOLDOWN_MINUTES} min cooldown)",
            )

    result = await db.execute(
        text("""
            UPDATE problem_reports
            SET status = 'scheduled',
                claimed_by_user_id = :user_id,
                claimed_at = NOW(),
                claim_before_deadline_at = NOW() + make_interval(mins => :window),
                before_photo_url = NULL,
                before_submitted_at = NULL,
                claim_after_deadline_at = NULL
            WHERE id = :report_id AND status = 'open'
            RETURNING claim_before_deadline_at
        """),
        {"report_id": str(report_id), "user_id": str(payload.user_id), "window": CLAIM_BEFORE_WINDOW_MINUTES},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=409, detail="Report is not available to claim")

    await db.commit()
    return {"status": "scheduled", "claim_before_deadline_at": row[0].isoformat()}


@router.post("/{report_id}/claim/before-photo")
async def submit_claim_before_photo(
    report_id: UUID, payload: ClaimPhotoRequest, db: AsyncSession = Depends(get_db)
):
    """Submit the arrival/before photo, moving the claim into its clean-up window."""
    await _expire_stale_claim(report_id, db)
    await _assert_within_claim_radius(report_id, payload.latitude, payload.longitude, db)

    severity_result = await db.execute(
        text("SELECT severity FROM problem_reports WHERE id = :report_id"),
        {"report_id": str(report_id)},
    )
    severity_row = severity_result.fetchone()
    if not severity_row:
        raise HTTPException(status_code=404, detail="Report not found")
    after_window = CLAIM_AFTER_WINDOW_MINUTES.get(severity_row.severity, CLAIM_AFTER_WINDOW_MINUTES["medium"])

    result = await db.execute(
        text("""
            UPDATE problem_reports
            SET status = 'in_progress',
                before_photo_url = :photo_url,
                before_submitted_at = NOW(),
                claim_after_deadline_at = NOW() + make_interval(mins => :window)
            WHERE id = :report_id
              AND status = 'scheduled'
              AND claimed_by_user_id = :user_id
              AND claim_before_deadline_at > NOW()
            RETURNING claim_after_deadline_at
        """),
        {
            "report_id": str(report_id),
            "user_id": str(payload.user_id),
            "photo_url": payload.photo_url,
            "window": after_window,
        },
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=409, detail="Claim is not active or has expired")

    await db.commit()
    return {"status": "in_progress", "claim_after_deadline_at": row[0].isoformat()}


@router.post("/{report_id}/claim/after-photo")
async def submit_claim_after_photo(
    report_id: UUID, payload: ClaimPhotoRequest, db: AsyncSession = Depends(get_db)
):
    """Complete the claim with an after photo: resolves the report and returns the
    challenge-mode score multiplier for the caller to apply on the resulting cleanup
    contribution (via POST /contributions/submit, resolve_report_id + challenge bonus)."""
    await _expire_stale_claim(report_id, db)
    await _assert_within_claim_radius(report_id, payload.latitude, payload.longitude, db)

    result = await db.execute(
        text("""
            UPDATE problem_reports
            SET status = 'addressed',
                resolved_by_user_id = :user_id,
                resolved_at = NOW(),
                image_urls = image_urls || :after_photo_url
            WHERE id = :report_id
              AND status = 'in_progress'
              AND claimed_by_user_id = :user_id
              AND claim_after_deadline_at > NOW()
            RETURNING geo_unit_id, campaign_id
        """),
        {
            "report_id": str(report_id),
            "user_id": str(payload.user_id),
            "after_photo_url": [payload.photo_url],
        },
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=409, detail="Claim is not active or has expired")

    geo_unit_id, campaign_id = row

    if geo_unit_id:
        remaining_open = await db.execute(
            text("SELECT 1 FROM problem_reports WHERE geo_unit_id = :geo_unit_id AND status = 'open' LIMIT 1"),
            {"geo_unit_id": geo_unit_id},
        )
        if not remaining_open.fetchone():
            await db.execute(
                text("""
                    UPDATE campaign_events
                    SET status = 'resolved', resolved_at = NOW()
                    WHERE campaign_id = :campaign_id
                      AND geo_unit_id = :geo_unit_id
                      AND event_type = 'boss_spawn'
                      AND status = 'active'
                """),
                {"campaign_id": str(campaign_id), "geo_unit_id": geo_unit_id},
            )

    await db.commit()
    return {
        "status": "addressed",
        "challenge_multiplier": CLAIM_CHALLENGE_MULTIPLIER,
        "report_id": str(report_id),
    }


@router.post("/{report_id}/claim/release")
async def release_problem_report_claim(
    report_id: UUID, payload: ClaimReleaseRequest, db: AsyncSession = Depends(get_db)
):
    """Voluntary back-out: the claimant no longer wants to do the challenge, so free the
    report back up for anyone else. Sets claim_released_at the same way expiry does, so the
    existing reclaim cooldown applies to this same user re-claiming it right away."""
    await _expire_stale_claim(report_id, db)

    result = await db.execute(
        text("""
            UPDATE problem_reports
            SET status = 'open',
                claim_released_at = NOW(),
                claim_before_deadline_at = NULL,
                before_photo_url = NULL,
                before_submitted_at = NULL,
                claim_after_deadline_at = NULL
            WHERE id = :report_id
              AND status IN ('scheduled', 'in_progress')
              AND claimed_by_user_id = :user_id
            RETURNING id
        """),
        {"report_id": str(report_id), "user_id": str(payload.user_id)},
    )
    if not result.fetchone():
        raise HTTPException(status_code=409, detail="You don't have an active claim on this report")

    await db.commit()
    return {"status": "open"}


@router.post("/{report_id}/flag")
async def flag_problem_report(report_id: UUID, payload: FlagReportRequest, db: AsyncSession = Depends(get_db)):
    """Report a trash report as inaccurate (wrong location, no actual trash, etc). Once
    FLAG_AUTO_HIDE_THRESHOLD distinct users have flagged it, it's auto-pulled from the map
    ('flagged' status) pending manual review, and any active claim on it is released."""
    exists = await db.execute(
        text("SELECT 1 FROM problem_reports WHERE id = :report_id"),
        {"report_id": str(report_id)},
    )
    if not exists.fetchone():
        raise HTTPException(status_code=404, detail="Report not found")

    await db.execute(
        text("""
            INSERT INTO problem_report_flags (report_id, flagged_by_user_id, reason)
            VALUES (:report_id, :user_id, :reason)
            ON CONFLICT (report_id, flagged_by_user_id) DO NOTHING
        """),
        {"report_id": str(report_id), "user_id": str(payload.user_id), "reason": payload.reason},
    )

    count_result = await db.execute(
        text("SELECT COUNT(*) FROM problem_report_flags WHERE report_id = :report_id"),
        {"report_id": str(report_id)},
    )
    flag_count = count_result.scalar() or 0

    auto_hidden = False
    if flag_count >= FLAG_AUTO_HIDE_THRESHOLD:
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
        auto_hidden = hide_row is not None
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

    await db.commit()
    return {"flag_count": flag_count, "auto_hidden": auto_hidden}


async def _check_report_triggers(campaign_id: UUID, geo_unit_id: str, db: AsyncSession):
    count_result = await db.execute(
        text("""
            SELECT COUNT(*) FROM problem_reports
            WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id AND status = 'open'
        """),
        {"campaign_id": str(campaign_id), "geo_unit_id": geo_unit_id},
    )
    report_count = count_result.scalar() or 0

    triggers = await db.execute(
        text("""
            SELECT id, condition_config, event_type, effect_config
            FROM event_triggers
            WHERE campaign_id = :campaign_id AND condition_type = 'report_count' AND is_active = TRUE
        """),
        {"campaign_id": str(campaign_id)},
    )

    for trigger in triggers.fetchall():
        threshold = (trigger.condition_config or {}).get("threshold", 5)
        if report_count < threshold:
            continue

        existing = await db.execute(
            text("""
                SELECT id FROM campaign_events
                WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
                AND event_type = :event_type AND status = 'active'
                LIMIT 1
            """),
            {"campaign_id": str(campaign_id), "geo_unit_id": geo_unit_id, "event_type": trigger.event_type},
        )
        if existing.fetchone():
            continue

        await db.execute(
            text("""
                INSERT INTO campaign_events
                    (campaign_id, trigger_id, geo_unit_id, event_type, title, description, effect_config, ends_at)
                VALUES
                    (:campaign_id, :trigger_id, :geo_unit_id, :event_type, :title, :description, :effect_config,
                     NOW() + INTERVAL '72 hours')
            """),
            {
                "campaign_id": str(campaign_id),
                "trigger_id": str(trigger.id),
                "geo_unit_id": geo_unit_id,
                "event_type": trigger.event_type,
                "title": "Trash Hotspot — Surge Needed!",
                "description": "Reports have reached critical mass. Clean it up in 72 hours for bonus XP!",
                "effect_config": trigger.effect_config,
            },
        )
