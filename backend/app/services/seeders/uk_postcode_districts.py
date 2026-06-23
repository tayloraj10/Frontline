"""
Seeder: uk_postcode_districts
Loads simplified UK postcode district boundaries from
backend/data/uk_postcode_districts.geojson into geo_units.

Run POST /api/admin/simplify-uk-postcode-districts first to generate the source file.
"""

import json
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.wkt import dumps as wkt_dumps
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.geo import SIMPLIFIED_UK_POSTCODE_FILE
from .base import Seeder, SeedResult

_BATCH_SIZE = 500


class UkPostcodeDistrictSeeder(Seeder):
    default_params: dict = {}

    async def run(self, db: AsyncSession, params: dict) -> SeedResult:
        if not SIMPLIFIED_UK_POSTCODE_FILE.exists():
            raise FileNotFoundError(
                f"{SIMPLIFIED_UK_POSTCODE_FILE} not found. "
                "Call POST /api/admin/simplify-uk-postcode-districts first."
            )

        with open(SIMPLIFIED_UK_POSTCODE_FILE, encoding="utf-8") as f:
            features = json.load(f).get("features", [])

        result = SeedResult()

        for i in range(0, len(features), _BATCH_SIZE):
            batch = features[i : i + _BATCH_SIZE]
            for feat in batch:
                district = (feat.get("properties") or {}).get("postcode_district")
                geometry = feat.get("geometry")

                if not district or not geometry:
                    result.skipped += 1
                    continue

                try:
                    geom = shape(geometry)
                    if isinstance(geom, Polygon):
                        geom = MultiPolygon([geom])
                    wkt = wkt_dumps(geom)
                except Exception as exc:
                    result.skipped += 1
                    result.errors.append(f"{district}: geometry error: {exc}")
                    continue

                try:
                    await db.execute(
                        text("""
                            INSERT INTO geo_units
                                (unit_id, unit_type, geometry, geojson, display_name)
                            VALUES (
                                :unit_id, 'uk_postcode_district',
                                ST_GeomFromText(:wkt, 4326), CAST(:geojson AS jsonb), :display_name
                            )
                            ON CONFLICT (unit_type, unit_id) DO UPDATE SET
                                geometry = EXCLUDED.geometry,
                                geojson = EXCLUDED.geojson,
                                display_name = EXCLUDED.display_name
                        """),
                        {
                            "unit_id": district,
                            "wkt": wkt,
                            "geojson": json.dumps(geometry),
                            "display_name": district,
                        },
                    )
                    result.inserted += 1
                except Exception as exc:
                    result.skipped += 1
                    result.errors.append(f"{district}: DB error: {exc}")

            await db.commit()

        return result
