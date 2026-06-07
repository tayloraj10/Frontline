"""One-time seeder: creates geo_units for all ~41K H3 resolution-3 hexes globally."""

import h3
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .base import Seeder, SeedResult

H3_RESOLUTION = 3
_BATCH_SIZE = 500


def _cell_wkt(h3_index: str) -> str | None:
    boundary = h3.cell_to_boundary(h3_index)
    coords = [(lng, lat) for lat, lng in boundary]
    # Skip hexes that cross the antimeridian — their bounding boxes span
    # the full world width and corrupt every tile row they touch.
    if max(c[0] for c in coords) - min(c[0] for c in coords) > 180:
        return None
    coords.append(coords[0])
    return "POLYGON((" + ", ".join(f"{x} {y}" for x, y in coords) + "))"


class GlobalHexSeeder(Seeder):
    default_params: dict = {}

    async def run(self, db: AsyncSession, params: dict) -> SeedResult:
        result = SeedResult()

        if params.get("wipe"):
            await db.execute(
                text("""
                    DELETE FROM territory_claims
                    WHERE geo_unit_id IN (
                        SELECT id FROM geo_units WHERE unit_type = 'h3_hex'
                    )
                """)
            )
            await db.execute(
                text("DELETE FROM geo_units WHERE unit_type = 'h3_hex'")
            )
            await db.commit()

        all_cells: list[str] = []
        for res0 in h3.get_res0_cells():
            all_cells.extend(h3.cell_to_children(res0, H3_RESOLUTION))

        for i in range(0, len(all_cells), _BATCH_SIZE):
            batch = all_cells[i : i + _BATCH_SIZE]
            rows = [{"h3_index": c, "wkt": w} for c in batch if (w := _cell_wkt(c)) is not None]
            if not rows:
                continue
            try:
                await db.execute(
                    text("""
                        INSERT INTO geo_units (unit_type, unit_id, geometry, display_name)
                        VALUES ('h3_hex', :h3_index, ST_Multi(ST_GeomFromText(:wkt, 4326)), :h3_index)
                        ON CONFLICT (unit_type, unit_id) DO NOTHING
                    """),
                    rows,
                )
                result.inserted += len(batch)
            except Exception as exc:
                result.errors.append(f"batch {i // _BATCH_SIZE}: {exc}")

        await db.commit()
        return result
