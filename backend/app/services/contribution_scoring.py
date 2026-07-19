"""Shared scoring tail for contribution submission.

Extracted from POST /contributions/submit so other entry points (e.g. an organizer
logging a contribution for a cleanup-event attendee) get identical scoring behavior
without duplicating it. Geo-assignment, proximity verification, hotspot claiming, and
creating the `cleanups` row itself are the caller's responsibility — this only covers
the value computation + `contributions` insert + `territory_claims` upsert tail, which
is identical no matter how `geo_unit_id`/`cleanup_id` were derived.
"""

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Server-side source of truth for cleanup scoring — the client's `value` field is
# ignored for cleanup contributions so a direct API call can't spoof points.
SMALL_BAG_VALUE = 1
LARGE_BAG_VALUE = 3


@dataclass
class RecordedContribution:
    contribution_id: str
    value: float


async def record_contribution(
    db: AsyncSession,
    *,
    user_id: UUID,
    campaign_id: UUID,
    group_id: UUID | None,
    geo_unit_id: str | None,
    cleanup_id: str | None,
    cleanup_event_id: str | None = None,
    contribution_type: str,
    value: float | None,
    small_bags: int | None = None,
    large_bags: int | None = None,
    photo_url: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    notes: str | None = None,
    location_verified: bool = False,
    recorded_by_user_id: UUID | None = None,
    apply_multiplier: bool = True,
    challenge_multiplier: float = 1.0,
) -> RecordedContribution:
    has_location = latitude is not None and longitude is not None

    if contribution_type == "cleanup":
        effective_value = (small_bags or 0) * SMALL_BAG_VALUE + (large_bags or 0) * LARGE_BAG_VALUE
    else:
        effective_value = value or 1

    if apply_multiplier and geo_unit_id:
        multiplier_result = await db.execute(
            text("""
                SELECT effect_config FROM campaign_events
                WHERE campaign_id = :campaign_id
                  AND status = 'active'
                  AND (geo_unit_id IS NULL OR geo_unit_id = :geo_unit_id)
                  AND (ends_at IS NULL OR ends_at > NOW())
                  AND effect_config->>'type' = 'score_multiplier'
                LIMIT 1
            """),
            {"campaign_id": str(campaign_id), "geo_unit_id": geo_unit_id},
        )
        multiplier_row = multiplier_result.fetchone()
        if multiplier_row:
            multiplier = float((multiplier_row[0] or {}).get("multiplier", 1))
            effective_value = effective_value * multiplier

    # "Claim-a-report" challenge-mode bonus: applied on top of any active campaign-wide
    # multiplier, since it rewards the individual claim rather than the geo unit.
    effective_value = effective_value * challenge_multiplier

    insert_params = {
        "campaign_id": str(campaign_id),
        "user_id": str(user_id),
        "group_id": str(group_id) if group_id else None,
        "geo_unit_id": geo_unit_id,
        "contribution_type": contribution_type,
        "value": effective_value,
        "photo_url": photo_url,
        "notes": notes,
        "cleanup_id": cleanup_id,
        "cleanup_event_id": cleanup_event_id,
        "recorded_by_user_id": str(recorded_by_user_id) if recorded_by_user_id else None,
    }

    if has_location:
        contribution_result = await db.execute(
            text("""
                INSERT INTO contributions
                    (campaign_id, user_id, group_id, geo_unit_id, contribution_type,
                     value, photo_url, location, location_verified, notes, cleanup_id,
                     cleanup_event_id, recorded_by_user_id)
                VALUES
                    (:campaign_id, :user_id, :group_id, :geo_unit_id, :contribution_type,
                     :value, :photo_url,
                     ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                     :location_verified, :notes, :cleanup_id, :cleanup_event_id, :recorded_by_user_id)
                RETURNING id
            """),
            {**insert_params, "lon": longitude, "lat": latitude, "location_verified": location_verified},
        )
    else:
        contribution_result = await db.execute(
            text("""
                INSERT INTO contributions
                    (campaign_id, user_id, group_id, geo_unit_id, contribution_type,
                     value, photo_url, location_verified, notes, cleanup_id,
                     cleanup_event_id, recorded_by_user_id)
                VALUES
                    (:campaign_id, :user_id, :group_id, :geo_unit_id, :contribution_type,
                     :value, :photo_url, :location_verified, :notes, :cleanup_id,
                     :cleanup_event_id, :recorded_by_user_id)
                RETURNING id
            """),
            {**insert_params, "location_verified": location_verified},
        )

    contribution_id = str(contribution_result.scalar())

    if geo_unit_id:
        await db.execute(
            text("""
                INSERT INTO territory_claims
                    (campaign_id, geo_unit_id, claimed_by_user, claimed_by_group, total_value, last_contribution_at)
                VALUES
                    (:campaign_id, :geo_unit_id, :user_id, :group_id, :value, NOW())
                ON CONFLICT (campaign_id, geo_unit_id) DO UPDATE SET
                    total_value = territory_claims.total_value + EXCLUDED.total_value,
                    last_contribution_at = NOW(),
                    decay_starts_at = NULL,
                    updated_at = NOW()
            """),
            {
                "campaign_id": str(campaign_id),
                "geo_unit_id": geo_unit_id,
                "user_id": str(user_id),
                "group_id": str(group_id) if group_id else None,
                "value": effective_value,
            },
        )
        await db.execute(
            text("""
                WITH top_group AS (
                    SELECT group_id FROM contributions
                    WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
                      AND group_id IS NOT NULL
                    GROUP BY group_id ORDER BY SUM(value) DESC LIMIT 1
                ),
                top_user AS (
                    SELECT user_id FROM contributions
                    WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
                    GROUP BY user_id ORDER BY SUM(value) DESC LIMIT 1
                )
                UPDATE territory_claims SET
                    claimed_by_group = (SELECT group_id FROM top_group),
                    claimed_by_user  = (SELECT user_id  FROM top_user)
                WHERE campaign_id = :campaign_id AND geo_unit_id = :geo_unit_id
            """),
            {
                "campaign_id": str(campaign_id),
                "geo_unit_id": geo_unit_id,
            },
        )

    return RecordedContribution(contribution_id=contribution_id, value=effective_value)
