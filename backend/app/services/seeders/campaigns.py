import json
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .base import Seeder, SeedResult

TRASH_WAR_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
TOUCH_GRASS_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
ROAD_TO_INDEPENDENCE_ID = uuid.UUID("00000000-0000-0000-0000-000000000003")
BRAINROT_ID = uuid.UUID("00000000-0000-0000-0000-000000000004")


class CampaignSeeder(Seeder):
    default_params = {"state_fips": "48", "county_fips": "453"}

    async def run(self, db: AsyncSession, params: dict) -> SeedResult:
        state_fips = str(params.get("state_fips", "48"))
        county_fips = str(params.get("county_fips", "453"))

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
                ON CONFLICT (slug) DO UPDATE SET geo_unit = 'zip'
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
                    'Break free from the two-party system. Log civic actions — re-register as Independent, attend town halls, contact your representatives, volunteer, visit landmarks, protest, and read the founding documents. Help grow America''s independence movement.',
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

        await db.commit()

        result = SeedResult()
        result.inserted = 4
        return result
