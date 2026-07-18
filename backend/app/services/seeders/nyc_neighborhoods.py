import json

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.geo import SIMPLIFIED_NYC_NEIGHBORHOODS_FILE

from .base import Seeder, SeedResult

_BATCH_SIZE = 500


class NycNeighborhoodSeeder(Seeder):
    """
    Seeds NYC Neighborhood Tabulation Areas (NTAs) into geo_units for the toggleable
    "mosaic" overlay layer. Purely visual — contributions still score against zip codes.

    After loading the polygons, also computes which neighborhoods touch each other
    (ST_Touches self-join) and populates geo_unit_adjacency, which the frontend uses
    for greedy graph-coloring so no two touching neighborhoods render the same color.
    """

    default_params: dict = {}

    async def run(self, db: AsyncSession, params: dict) -> SeedResult:
        if not SIMPLIFIED_NYC_NEIGHBORHOODS_FILE.exists():
            raise FileNotFoundError(
                f"Simplified file not found: {SIMPLIFIED_NYC_NEIGHBORHOODS_FILE}. "
                "Run POST /admin/simplify-nyc-neighborhoods first."
            )

        with open(SIMPLIFIED_NYC_NEIGHBORHOODS_FILE, encoding="utf-8") as f:
            features = json.load(f).get("features", [])

        result = SeedResult()

        for i in range(0, len(features), _BATCH_SIZE):
            batch = features[i : i + _BATCH_SIZE]
            for feat in batch:
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
                                :unit_id, 'nyc_neighborhood',
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

        await self._compute_adjacency(db)

        return result

    async def _compute_adjacency(self, db: AsyncSession) -> None:
        await db.execute(
            text("""
                DELETE FROM geo_unit_adjacency
                WHERE geo_unit_id IN (SELECT id FROM geo_units WHERE unit_type = 'nyc_neighborhood')
            """)
        )
        await db.execute(
            text("""
                INSERT INTO geo_unit_adjacency (geo_unit_id, adjacent_geo_unit_id)
                SELECT a.id, b.id
                FROM geo_units a
                JOIN geo_units b
                  ON a.unit_type = b.unit_type
                 AND a.id != b.id
                 AND ST_Touches(a.geometry, b.geometry)
                WHERE a.unit_type = 'nyc_neighborhood'
                ON CONFLICT DO NOTHING
            """)
        )
        await db.commit()
