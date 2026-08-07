import json

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.geo import SIMPLIFIED_NYC_BOROUGHS_FILE

from .base import Seeder, SeedResult


class NycBoroughSeeder(Seeder):
    """
    Seeds NYC's 5 boroughs into geo_units — 5 features total, so no batching or
    adjacency needed. Backs both a toggleable borough-level layer and (dissolved
    at query time) the single gold city-outline shown on the campaign map.
    """

    default_params: dict = {}

    async def run(self, db: AsyncSession, params: dict) -> SeedResult:
        if not SIMPLIFIED_NYC_BOROUGHS_FILE.exists():
            raise FileNotFoundError(
                f"Simplified file not found: {SIMPLIFIED_NYC_BOROUGHS_FILE}. "
                "Run POST /admin/simplify-nyc-boroughs first."
            )

        with open(SIMPLIFIED_NYC_BOROUGHS_FILE, encoding="utf-8") as f:
            features = json.load(f).get("features", [])

        result = SeedResult()

        for feat in features:
            props = feat.get("properties") or {}
            unit_id = props.get("unit_id")
            display_name = props.get("display_name")
            geometry = feat.get("geometry")
            if not unit_id or not geometry:
                result.skipped += 1
                continue

            try:
                await db.execute(
                    text("""
                        INSERT INTO geo_units (unit_id, unit_type, geometry, geojson, display_name)
                        VALUES (
                            :unit_id, 'nyc_borough',
                            ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326),
                            CAST(:geojson AS jsonb), :display_name
                        )
                        ON CONFLICT (unit_type, unit_id) DO UPDATE SET
                            geometry = EXCLUDED.geometry,
                            geojson = EXCLUDED.geojson,
                            display_name = EXCLUDED.display_name
                    """),
                    {
                        "unit_id": unit_id,
                        "geometry": json.dumps(geometry),
                        "geojson": json.dumps(geometry),
                        "display_name": display_name,
                    },
                )
                result.inserted += 1
            except Exception as exc:
                result.skipped += 1
                result.errors.append(f"{unit_id}: {exc}")

        await db.commit()
        return result
