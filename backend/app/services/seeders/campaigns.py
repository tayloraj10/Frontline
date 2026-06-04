import json
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .base import Seeder, SeedResult

TRASH_WAR_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


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
        await db.commit()

        result = SeedResult()
        result.inserted = 1
        return result
