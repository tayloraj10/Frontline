"""
Seeder: states
Loads US state boundaries into geo_units for the Road to Independence campaign.
Fetches GeoJSON from a CDN if backend/data/us-states.json is not present.
"""

import json
import urllib.request
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.wkt import dumps as wkt_dumps
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .base import Seeder, SeedResult

_STATES_FILE = Path(__file__).parent.parent.parent.parent / "data" / "us-states.json"
_STATES_URL = "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json"

_STATE_FIPS: dict[str, str] = {
    "Alabama": "01", "Alaska": "02", "Arizona": "04", "Arkansas": "05",
    "California": "06", "Colorado": "08", "Connecticut": "09", "Delaware": "10",
    "District of Columbia": "11", "Florida": "12", "Georgia": "13", "Hawaii": "15",
    "Idaho": "16", "Illinois": "17", "Indiana": "18", "Iowa": "19",
    "Kansas": "20", "Kentucky": "21", "Louisiana": "22", "Maine": "23",
    "Maryland": "24", "Massachusetts": "25", "Michigan": "26", "Minnesota": "27",
    "Mississippi": "28", "Missouri": "29", "Montana": "30", "Nebraska": "31",
    "Nevada": "32", "New Hampshire": "33", "New Jersey": "34", "New Mexico": "35",
    "New York": "36", "North Carolina": "37", "North Dakota": "38", "Ohio": "39",
    "Oklahoma": "40", "Oregon": "41", "Pennsylvania": "42", "Rhode Island": "44",
    "South Carolina": "45", "South Dakota": "46", "Tennessee": "47", "Texas": "48",
    "Utah": "49", "Vermont": "50", "Virginia": "51", "Washington": "53",
    "West Virginia": "54", "Wisconsin": "55", "Wyoming": "56",
}


def _load_features() -> list[dict]:
    if _STATES_FILE.exists():
        with open(_STATES_FILE, encoding="utf-8") as f:
            return json.load(f).get("features", [])
    _STATES_FILE.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(_STATES_URL, timeout=30) as resp:
        data = resp.read().decode("utf-8")
    with open(_STATES_FILE, "w", encoding="utf-8") as f:
        f.write(data)
    return json.loads(data).get("features", [])


class StatesSeeder(Seeder):
    default_params: dict = {}

    async def run(self, db: AsyncSession, params: dict) -> SeedResult:
        features = _load_features()
        result = SeedResult()

        await db.execute(
            text("DELETE FROM geo_units WHERE unit_type = 'state'"),
        )

        for feat in features:
            props = feat.get("properties") or {}
            state_name = props.get("name") or props.get("NAME") or props.get("state_name")
            geometry = feat.get("geometry")

            if not state_name or not geometry:
                result.skipped += 1
                continue

            fips = _STATE_FIPS.get(state_name)
            if not fips:
                result.skipped += 1
                result.errors.append(f"Unknown state: {state_name!r}")
                continue

            try:
                geom = shape(geometry)
                if isinstance(geom, Polygon):
                    geom = MultiPolygon([geom])
                wkt = wkt_dumps(geom)
            except Exception as exc:
                result.skipped += 1
                result.errors.append(f"{state_name}: geometry error: {exc}")
                continue

            try:
                await db.execute(
                    text("""
                        INSERT INTO geo_units
                            (unit_id, unit_type, geometry, geojson, display_name)
                        VALUES (
                            :unit_id, 'state',
                            ST_GeomFromText(:wkt, 4326), CAST(:geojson AS jsonb), :display_name
                        )
                        ON CONFLICT (unit_type, unit_id) DO UPDATE SET
                            geometry = EXCLUDED.geometry,
                            geojson = EXCLUDED.geojson,
                            display_name = EXCLUDED.display_name
                    """),
                    {
                        "unit_id": fips,
                        "wkt": wkt,
                        "geojson": json.dumps(geometry),
                        "display_name": state_name,
                    },
                )
                result.inserted += 1
            except Exception as exc:
                result.skipped += 1
                result.errors.append(f"{state_name}: DB error: {exc}")

        await db.commit()
        return result
