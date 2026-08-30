import json

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.geo import SIMPLIFIED_CHICAGO_NEIGHBORHOODS_FILE

from .base import Seeder, SeedResult

_BATCH_SIZE = 500


class ChicagoNeighborhoodSeeder(Seeder):
    """
    Seeds Chicago neighborhood boundaries into geo_units for the toggleable
    "mosaic" overlay layer, same pattern as NycNeighborhoodSeeder.

    Also computes adjacency (ST_DWithin self-join) into geo_unit_adjacency so the
    frontend's greedy graph-coloring gives touching neighborhoods different colors.
    """

    default_params: dict = {}

    async def run(self, db: AsyncSession, params: dict) -> SeedResult:
        if not SIMPLIFIED_CHICAGO_NEIGHBORHOODS_FILE.exists():
            raise FileNotFoundError(
                f"Simplified file not found: {SIMPLIFIED_CHICAGO_NEIGHBORHOODS_FILE}. "
                "Run POST /admin/simplify-chicago-neighborhoods first."
            )

        with open(SIMPLIFIED_CHICAGO_NEIGHBORHOODS_FILE, encoding="utf-8") as f:
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
                                :unit_id, 'chicago_neighborhood',
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
                WHERE geo_unit_id IN (SELECT id FROM geo_units WHERE unit_type = 'chicago_neighborhood')
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
                 AND ST_DWithin(a.geometry, b.geometry, 0.0003)
                WHERE a.unit_type = 'chicago_neighborhood'
                ON CONFLICT DO NOTHING
            """)
        )
        await db.commit()
