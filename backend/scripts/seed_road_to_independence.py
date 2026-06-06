#!/usr/bin/env python3
"""
Seed the Road to Independence campaign with US state boundaries.

Fetches simplified US state GeoJSON from a public source (or a local file).
Each state becomes a geo_unit. display_name is the full state name, which
the frontend uses to look up partisan lean for the choropleth coloring.

Usage (from backend/ directory):
    python scripts/seed_road_to_independence.py
    python scripts/seed_road_to_independence.py --statefile /path/to/us-states.json

Requires DATABASE_URL in backend/.env.
"""

import asyncio
import argparse
import json
import sys
import uuid
import urllib.request
from pathlib import Path

import asyncpg
from shapely.geometry import shape, MultiPolygon, Polygon
from shapely.wkt import dumps as wkt_dumps
from dotenv import load_dotenv
import os

load_dotenv(Path(__file__).parent.parent / ".env")

ROAD_TO_INDEPENDENCE_ID = uuid.UUID("00000000-0000-0000-0000-000000000003")
DEFAULT_STATEFILE = Path(__file__).parent.parent / "data" / "us-states.json"
STATES_URL = "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json"

# State name → FIPS code mapping
STATE_FIPS: dict[str, str] = {
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


def to_multipolygon_wkt(geometry: dict) -> str:
    geom = shape(geometry)
    if isinstance(geom, Polygon):
        geom = MultiPolygon([geom])
    elif not isinstance(geom, MultiPolygon):
        raise ValueError(f"Unexpected geometry type: {type(geom)}")
    return wkt_dumps(geom)


def load_states_geojson(statefile: Path) -> list[dict]:
    if statefile.exists():
        print(f"Loading states from {statefile} ...")
        with open(statefile, encoding="utf-8") as f:
            fc = json.load(f)
    else:
        print(f"{statefile} not found — fetching from {STATES_URL} ...")
        statefile.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(STATES_URL, timeout=30) as resp:
            data = resp.read().decode("utf-8")
        fc = json.loads(data)
        with open(statefile, "w", encoding="utf-8") as f:
            f.write(data)
        print(f"  Saved to {statefile}")
    return fc.get("features", [])


async def seed(statefile: Path) -> None:
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        sys.exit("DATABASE_URL not set. Copy backend/.env.example to backend/.env and fill it in.")

    features = load_states_geojson(statefile)
    print(f"  {len(features)} state features loaded.")

    raw_url = db_url.replace("postgresql+asyncpg://", "postgresql://")
    print("Connecting to database ...")
    conn = await asyncpg.connect(raw_url)

    try:
        print("Upserting Road to Independence campaign ...")
        await conn.execute(
            """
            INSERT INTO campaigns
                (id, slug, title, description, campaign_type, contribution_type,
                 geo_unit, status, geo_scope, scoring_rules, win_condition)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb)
            ON CONFLICT (slug) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                campaign_type = EXCLUDED.campaign_type,
                contribution_type = EXCLUDED.contribution_type,
                geo_unit = EXCLUDED.geo_unit,
                status = EXCLUDED.status
            """,
            ROAD_TO_INDEPENDENCE_ID,
            "road-to-independence",
            "Road to Independence",
            "Every voter registration change toward Independent shifts the map from red and blue toward gray. Help neutralize America's political map.",
            "choropleth",
            "registration",
            "state",
            "active",
            json.dumps({"scope": "nationwide"}),
            json.dumps({"unit": "registrations", "per_contribution": 1}),
            json.dumps({"type": "threshold", "value": 500, "unit": "registrations_per_state"}),
        )

        deleted = await conn.fetchval(
            "DELETE FROM geo_units WHERE campaign_id = $1 RETURNING count(*)",
            ROAD_TO_INDEPENDENCE_ID,
        )
        print(f"  Cleared {deleted or 0} existing geo_unit rows.")

        print(f"Inserting state geo_units ...")
        inserted = 0
        skipped = 0

        for feat in features:
            props = feat.get("properties") or {}
            # PublicaMundi GeoJSON uses "name" for state name
            state_name = props.get("name") or props.get("NAME") or props.get("state_name")
            geometry = feat.get("geometry")

            if not state_name or not geometry:
                skipped += 1
                continue

            fips = STATE_FIPS.get(state_name)
            if not fips:
                print(f"  Skipping unknown state: {state_name!r}")
                skipped += 1
                continue

            try:
                wkt = to_multipolygon_wkt(geometry)
            except Exception as exc:
                print(f"  Geometry error for {state_name}: {exc}")
                skipped += 1
                continue

            await conn.execute(
                """
                INSERT INTO geo_units
                    (campaign_id, unit_id, unit_type, geometry, geojson, display_name)
                VALUES ($1, $2, $3, ST_GeomFromText($4, 4326), $5::jsonb, $6)
                ON CONFLICT (campaign_id, unit_id) DO UPDATE SET
                    geometry = EXCLUDED.geometry,
                    geojson = EXCLUDED.geojson,
                    display_name = EXCLUDED.display_name
                """,
                ROAD_TO_INDEPENDENCE_ID,
                fips,
                "state",
                wkt,
                json.dumps(geometry),
                state_name,
            )
            inserted += 1

        print(f"\nDone. inserted: {inserted}  skipped: {skipped}")
        print("Visit /campaigns/road-to-independence to see the map.")

    finally:
        await conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--statefile",
        default=str(DEFAULT_STATEFILE),
        help=f"Path to US states GeoJSON (default: {DEFAULT_STATEFILE}). Fetched automatically if missing.",
    )
    args = parser.parse_args()

    asyncio.run(seed(Path(args.statefile)))
