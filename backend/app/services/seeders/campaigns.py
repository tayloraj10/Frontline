import json
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .base import Seeder, SeedResult

TRASH_WAR_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
TOUCH_GRASS_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
ROAD_TO_INDEPENDENCE_ID = uuid.UUID("00000000-0000-0000-0000-000000000003")
BRAINROT_ID = uuid.UUID("00000000-0000-0000-0000-000000000004")
SOLARPUNK_ID = uuid.UUID("00000000-0000-0000-0000-000000000005")


class CampaignSeeder(Seeder):
    default_params = {"state_fips": "48", "county_fips": "453"}

    async def run(self, db: AsyncSession, params: dict) -> SeedResult:
        state_fips = str(params.get("state_fips", "48"))
        county_fips = str(params.get("county_fips", "453"))

        if params.get("wipe"):
            campaign_ids = [
                str(TRASH_WAR_ID), str(TOUCH_GRASS_ID),
                str(ROAD_TO_INDEPENDENCE_ID), str(BRAINROT_ID), str(SOLARPUNK_ID),
            ]
            await db.execute(
                text("DELETE FROM campaigns WHERE id = ANY(:ids)"),
                {"ids": campaign_ids},
            )
            await db.commit()

        await db.execute(
            text("""
                INSERT INTO campaigns
                    (id, slug, title, description, campaign_type, contribution_type,
                     geo_unit, status, geo_scope, scoring_rules, win_condition)
                VALUES (
                    :id, 'trash-war', 'Trash War',
                    'Claim territory by cleaning up trash. The group with the most bags cleaned in a ZIP code controls it.',
                    'territory', 'cleanup', 'zip', 'active',
                    CAST(:geo_scope AS jsonb), CAST(:scoring_rules AS jsonb), CAST(:win_condition AS jsonb)
                )
                ON CONFLICT (slug) DO UPDATE SET geo_unit = 'zip', geo_scope = EXCLUDED.geo_scope
            """),
            {
                "id": str(TRASH_WAR_ID),
                "geo_scope": json.dumps({"scope": "nationwide"}),
                "scoring_rules": json.dumps({"unit": "bags", "per_contribution": 1}),
                "win_condition": json.dumps({"type": "open_ended"}),
            },
        )

        await db.execute(
            text("""
                INSERT INTO campaigns
                    (id, slug, title, description, campaign_type, contribution_type,
                     geo_unit, status, geo_scope, scoring_rules, win_condition)
                VALUES (
                    :id, 'touch-grass', 'Touch Grass',
                    'Get outside and submit a photo from wherever you are. Anywhere on Earth counts.',
                    'collage', 'photo', 'point', 'active',
                    CAST(:geo_scope AS jsonb), CAST(:scoring_rules AS jsonb), CAST(:win_condition AS jsonb)
                )
                ON CONFLICT (slug) DO NOTHING
            """),
            {
                "id": str(TOUCH_GRASS_ID),
                "geo_scope": json.dumps({"scope": "global"}),
                "scoring_rules": json.dumps({"unit": "photos", "per_contribution": 1}),
                "win_condition": json.dumps({"type": "open_ended"}),
            },
        )

        await db.execute(
            text("""
                INSERT INTO campaigns
                    (id, slug, title, description, campaign_type, contribution_type,
                     geo_unit, status, geo_scope, scoring_rules, win_condition)
                VALUES (
                    :id, 'road-to-independence', 'Road to Independence',
                    'Break free from the two-party system. Log civic actions and help grow America''s independence movement.',
                    'choropleth', 'civic_action', 'state', 'active',
                    CAST(:geo_scope AS jsonb), CAST(:scoring_rules AS jsonb), CAST(:win_condition AS jsonb)
                )
                ON CONFLICT (slug) DO UPDATE SET
                    contribution_type = EXCLUDED.contribution_type,
                    description = EXCLUDED.description,
                    scoring_rules = EXCLUDED.scoring_rules
            """),
            {
                "id": str(ROAD_TO_INDEPENDENCE_ID),
                "geo_scope": json.dumps({"scope": "nationwide"}),
                "scoring_rules": json.dumps({
                    "unit": "actions",
                    "per_contribution": 1,
                    "action_types": [
                        "register_independent",
                        "town_hall",
                        "contact_representative",
                        "volunteer",
                        "visit_landmark",
                        "attend_protest",
                        "read_founding_document",
                    ],
                }),
                "win_condition": json.dumps({"type": "open_ended"}),
            },
        )

        await db.execute(
            text("""
                INSERT INTO campaigns
                    (id, slug, title, description, campaign_type, contribution_type,
                     geo_unit, status, geo_scope, scoring_rules, win_condition)
                VALUES (
                    :id, 'brainrot', 'BRAINROT',
                    'Building Resistance Against Influencers, Narcissism, Ragebait, Overconsumption, and Time-wasting. Log every account you unfollow and help dethrone the biggest offenders.',
                    'heatmap', 'unfollow', 'point', 'active',
                    CAST(:geo_scope AS jsonb), CAST(:scoring_rules AS jsonb), CAST(:win_condition AS jsonb)
                )
                ON CONFLICT (slug) DO UPDATE SET
                    description = EXCLUDED.description,
                    scoring_rules = EXCLUDED.scoring_rules
            """),
            {
                "id": str(BRAINROT_ID),
                "geo_scope": json.dumps({"scope": "global"}),
                "scoring_rules": json.dumps({"unit": "unfollows", "per_contribution": 1}),
                "win_condition": json.dumps({"type": "open_ended"}),
            },
        )

        await db.execute(
            text("""
                INSERT INTO campaigns
                    (id, slug, title, description, campaign_type, contribution_type,
                     geo_unit, status, geo_scope, scoring_rules, win_condition)
                VALUES (
                    :id, 'solarpunk', 'Solarpunk',
                    'Build a regenerative future, one hex at a time. Log real-world actions and photo-document solarpunk happening in the wild.',
                    'hex_bloom', 'solarpunk_action', 'h3_hex', 'active',
                    CAST(:geo_scope AS jsonb), CAST(:scoring_rules AS jsonb), CAST(:win_condition AS jsonb)
                )
                ON CONFLICT (slug) DO UPDATE SET
                    description = EXCLUDED.description,
                    scoring_rules = EXCLUDED.scoring_rules
            """),
            {
                "id": str(SOLARPUNK_ID),
                "geo_scope": json.dumps({"scope": "global"}),
                "scoring_rules": json.dumps({
                    "unit": "bloom_points",
                    "bloom_thresholds": [0, 50, 200, 600, 1500],
                    "action_categories": {
                        "green_infrastructure": {
                            "plant_tree": 3, "community_garden": 3, "green_roof": 3,
                            "rain_garden": 2, "compost": 2, "rewilding": 2,
                            "habitat": 1, "restore_nature": 2,
                        },
                        "energy": {
                            "solar_panels": 4, "energy_coop": 3, "renewable_provider": 2,
                            "repair": 1, "repair_cafe": 1, "energy_reduction": 2, "e_bike": 2,
                        },
                        "food": {
                            "csa": 2, "grow_food": 2, "food_preservation": 1,
                            "urban_foraging": 2, "seed_library": 2, "local_meal": 1,
                        },
                        "mutual_aid": {
                            "mutual_aid": 2, "skill_share": 2, "tool_library": 2,
                            "worker_coop": 2, "local_governance": 1, "help_neighbor": 1,
                        },
                        "mobility": {
                            "advocate_transit": 2, "use_transit": 1,
                            "placemaking": 2, "cohousing": 2,
                        },
                        "culture": {
                            "solarpunk_art": 2, "education_event": 2, "zine": 1, "upcycle": 1,
                        },
                        "water": {
                            "rain_barrel": 3, "watershed": 2, "water_reduction": 1,
                        },
                    },
                    "solarpunk_photo_points": 2,
                }),
                "win_condition": json.dumps({"type": "cooperative", "metric": "world_bloom_score"}),
            },
        )

        await db.commit()

        result = SeedResult()
        result.inserted = 5
        return result
