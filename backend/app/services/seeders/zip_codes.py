"""
Seeder: zip_codes
Loads simplified US ZIP code boundaries from backend/data/us_zipcodes.geojson into geo_units.

Run POST /api/admin/simplify-zipcodes first to generate the source file.

Required params:
  campaign_slug  str  slug of the campaign to attach ZIP units to (default: "trash-war")
"""

import json
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.wkt import dumps as wkt_dumps
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.geo import SIMPLIFIED_ZIP_FILE
from .base import Seeder, SeedResult

_BATCH_SIZE = 500


class ZipCodeSeeder(Seeder):
    default_params = {"campaign_slug": "trash-war"}

    async def run(self, db: AsyncSession, params: dict) -> SeedResult:
        campaign_slug = params.get("campaign_slug", "trash-war")

        if not SIMPLIFIED_ZIP_FILE.exists():
            raise FileNotFoundError(
                f"{SIMPLIFIED_ZIP_FILE} not found. "
                "Call POST /api/admin/simplify-zipcodes first."
            )

        row = (
            await db.execute(
                text("SELECT id FROM campaigns WHERE slug = :slug"),
                {"slug": campaign_slug},
            )
        ).fetchone()
        if not row:
            raise ValueError(f"Campaign '{campaign_slug}' not found")
        campaign_id = str(row[0])

        with open(SIMPLIFIED_ZIP_FILE, encoding="utf-8") as f:
            features = json.load(f).get("features", [])

        # Clear existing geo_units for this campaign before reloading
        await db.execute(
            text("DELETE FROM geo_units WHERE campaign_id = :cid"),
            {"cid": campaign_id},
        )

        result = SeedResult()

        for i in range(0, len(features), _BATCH_SIZE):
            batch = features[i : i + _BATCH_SIZE]
            for feat in batch:
                zip_code = (feat.get("properties") or {}).get("zip")
                geometry = feat.get("geometry")

                if not zip_code or not geometry:
                    result.skipped += 1
                    continue

                try:
                    geom = shape(geometry)
                    if isinstance(geom, Polygon):
                        geom = MultiPolygon([geom])
                    wkt = wkt_dumps(geom)
                except Exception as exc:
                    result.skipped += 1
                    result.errors.append(f"{zip_code}: geometry error: {exc}")
                    continue

                try:
                    await db.execute(
                        text("""
                            INSERT INTO geo_units
                                (campaign_id, unit_id, unit_type, geometry, geojson, display_name)
                            VALUES (
                                :campaign_id, :unit_id, 'zip',
                                ST_GeomFromText(:wkt, 4326), CAST(:geojson AS jsonb), :display_name
                            )
                            ON CONFLICT (campaign_id, unit_id) DO NOTHING
                        """),
                        {
                            "campaign_id": campaign_id,
                            "unit_id": zip_code,
                            "wkt": wkt,
                            "geojson": json.dumps(geometry),
                            "display_name": zip_code,
                        },
                    )
                    result.inserted += 1
                except Exception as exc:
                    result.skipped += 1
                    result.errors.append(f"{zip_code}: DB error: {exc}")

            await db.commit()

        return result
