import json
import uuid

import h3
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .base import Seeder, SeedResult

SOLARPUNK_ID = uuid.UUID("00000000-0000-0000-0000-000000000005")
H3_RESOLUTION = 3

# Cities and regions with documented solarpunk-aligned policies, practices, or culture.
# bloom_score puts each in stage 2 (Growing ≥200) or stage 3 (Thriving ≥600).
PRESEED_LOCATIONS = [
    (64.13,  -21.91, 800, "Iceland — ~99% renewable energy, geothermal pioneer"),
    (55.68,   12.57, 750, "Copenhagen — carbon-neutral city target, cycling capital"),
    ( 9.93,  -84.09, 700, "Costa Rica — 100% renewable electricity, mass reforestation"),
    (52.09,    5.12, 600, "Netherlands — cycling nation, water management innovation"),
    (27.47,   89.64, 900, "Bhutan — carbon-negative, 72% forest cover, Gross National Happiness"),
    (48.00,    7.84, 650, "Freiburg — Solar City, car-free Vauban quarter"),
    (-34.90, -56.19, 600, "Uruguay — 97% renewable electricity, regional sustainability leader"),
    (  1.35,  103.82, 550, "Singapore — biophilic city, vertical gardens, urban food production"),
    (  6.25,  -75.56, 600, "Medellín — cable car transit innovation, urban green corridors"),
    (-25.43,  -49.27, 580, "Curitiba — world's first BRT, recycling culture, urban forests"),
    (48.21,   16.37, 650, "Vienna — most livable city, social housing, cycling infrastructure"),
    (52.37,    4.90, 680, "Amsterdam — circular economy pioneer, cycling utopia, housing co-ops"),
]


def _h3_boundary_wkt(h3_index: str) -> str:
    boundary = h3.cell_to_boundary(h3_index)  # [(lat, lng), ...]
    coords = [(lng, lat) for lat, lng in boundary]
    coords.append(coords[0])
    return "POLYGON((" + ", ".join(f"{x} {y}" for x, y in coords) + "))"


class SolarpunkPreseedSeeder(Seeder):
    default_params: dict = {}

    async def run(self, db: AsyncSession, params: dict) -> SeedResult:
        result = SeedResult()

        if params.get("wipe"):
            # Remove preseed territory_claims (claimed_by_user IS NULL means no real user claimed it).
            # This resets baseline bloom scores without touching contributions from real users.
            await db.execute(
                text("""
                    DELETE FROM territory_claims
                    WHERE campaign_id = :campaign_id
                      AND claimed_by_user IS NULL
                      AND claimed_by_group IS NULL
                      AND geo_unit_id IN (
                          SELECT id FROM geo_units WHERE unit_type = 'h3_hex'
                      )
                """),
                {"campaign_id": str(SOLARPUNK_ID)},
            )
            await db.commit()

        for lat, lng, bloom_score, seed_source in PRESEED_LOCATIONS:
            h3_index = h3.latlng_to_cell(lat, lng, H3_RESOLUTION)
            wkt = _h3_boundary_wkt(h3_index)

            # Upsert geo_unit row
            geo_result = await db.execute(
                text("""
                    INSERT INTO geo_units (unit_type, unit_id, geometry, display_name, seed_source)
                    VALUES (
                        'h3_hex', :h3_index,
                        ST_Multi(ST_GeomFromText(:wkt, 4326)),
                        :display_name,
                        :seed_source
                    )
                    ON CONFLICT (unit_type, unit_id) DO UPDATE
                      SET seed_source = EXCLUDED.seed_source
                    RETURNING id::text
                """),
                {
                    "h3_index": h3_index,
                    "wkt": wkt,
                    "display_name": h3_index,
                    "seed_source": seed_source,
                },
            )
            geo_unit_id = geo_result.scalar()

            # Upsert territory_claim — preserve existing player-contributed value
            await db.execute(
                text("""
                    INSERT INTO territory_claims
                        (campaign_id, geo_unit_id, claimed_by_user, claimed_by_group,
                         total_value, last_contribution_at)
                    VALUES
                        (:campaign_id, :geo_unit_id, NULL, NULL, :bloom_score, NOW())
                    ON CONFLICT (campaign_id, geo_unit_id) DO UPDATE
                      SET total_value = GREATEST(territory_claims.total_value, EXCLUDED.total_value)
                """),
                {
                    "campaign_id": str(SOLARPUNK_ID),
                    "geo_unit_id": geo_unit_id,
                    "bloom_score": bloom_score,
                },
            )
            result.inserted += 1

        await db.commit()

        # Seed milestone event_triggers (idempotent via ON CONFLICT on id PK)
        _NS = uuid.UUID("00000000-0000-0000-0000-000000000005")
        milestones = [
            {
                "id": str(uuid.uuid5(_NS, "milestone_5k")),
                "threshold": 5_000,
                "label": "First Sparks",
                "description": "The global solarpunk bloom has reached 5,000 points. A 1.25× boost activates for 48 hours.",
                "multiplier": 1.25,
                "duration_hours": 48,
            },
            {
                "id": str(uuid.uuid5(_NS, "milestone_15k")),
                "threshold": 15_000,
                "label": "Growing Network",
                "description": "15,000 bloom points reached — the network is spreading. 1.5× multiplier for 72 hours.",
                "multiplier": 1.5,
                "duration_hours": 72,
            },
            {
                "id": str(uuid.uuid5(_NS, "milestone_40k")),
                "threshold": 40_000,
                "label": "Grid Rising",
                "description": "40,000 points! The decentralised grid is rising. 1.75× multiplier for 72 hours.",
                "multiplier": 1.75,
                "duration_hours": 72,
            },
            {
                "id": str(uuid.uuid5(_NS, "milestone_100k")),
                "threshold": 100_000,
                "label": "Solarpunk World",
                "description": "100,000 bloom points — the solarpunk era has arrived. 2× multiplier for 120 hours.",
                "multiplier": 2.0,
                "duration_hours": 120,
            },
        ]
        for m in milestones:
            await db.execute(
                text("""
                    INSERT INTO event_triggers
                        (id, campaign_id, name, condition_type, condition_config, event_type, effect_config, is_active)
                    VALUES
                        (:id, :campaign_id, :name, 'threshold_reached',
                         CAST(:condition_config AS jsonb),
                         'score_multiplier',
                         CAST(:effect_config AS jsonb),
                         TRUE)
                    ON CONFLICT (id) DO NOTHING
                """),
                {
                    "id": m["id"],
                    "campaign_id": str(SOLARPUNK_ID),
                    "name": f"Phase Unlocked — {m['label']}",
                    "condition_config": json.dumps({
                        "threshold": m["threshold"],
                        "metric": "total_value",
                        "title": f"Phase Unlocked — {m['label']}!",
                        "description": m["description"],
                    }),
                    "effect_config": json.dumps({
                        "type": "score_multiplier",
                        "multiplier": m["multiplier"],
                        "duration_hours": m["duration_hours"],
                    }),
                },
            )
            result.inserted += 1

        await db.commit()
        return result
