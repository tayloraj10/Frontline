#!/usr/bin/env python3
"""
Seed the Trash War campaign with census tract boundaries.

Usage (from backend/ directory):
    python scripts/seed_trash_war.py
    python scripts/seed_trash_war.py --state 06 --county 037   # Los Angeles

Defaults to Travis County, TX (Austin). State and county are FIPS codes.
Fetches boundaries from the Census TIGER web service — requires internet.
Requires DATABASE_URL in backend/.env (or set in environment).
"""

import asyncio
import argparse
import json
import sys
import uuid
from pathlib import Path

import httpx
import asyncpg
from shapely.geometry import shape, MultiPolygon, Polygon
from shapely.wkt import dumps as wkt_dumps
from dotenv import load_dotenv
import os

# Load .env from backend/ directory (script lives in backend/scripts/)
load_dotenv(Path(__file__).parent.parent / ".env")

TIGER_URL = (
    "https://tigerweb.geo.census.gov/arcgis/rest/services"
    "/TIGERweb/tigerWMS_ACS2023/MapServer/8/query"
)

# Fixed UUID so repeated runs are idempotent
TRASH_WAR_CAMPAIGN_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


async def fetch_tracts(state_fips: str, county_fips: str) -> list[dict]:
    """Fetch census tract GeoJSON features from Census TIGER."""
    features: list[dict] = []
    offset = 0
    batch = 1000

    async with httpx.AsyncClient(timeout=60) as client:
        while True:
            params = {
                "where": f"STATE='{state_fips}' AND COUNTY='{county_fips}'",
                "outFields": "GEOID,NAME,STATE,COUNTY,TRACT",
                "outSR": "4326",
                "f": "geojson",
                "resultOffset": offset,
                "resultRecordCount": batch,
            }
            resp = await client.get(TIGER_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

            chunk = data.get("features", [])
            features.extend(chunk)
            print(f"  fetched {len(chunk)} tracts (running total: {len(features)})")

            if len(chunk) < batch:
                break
            offset += batch

    return features


def geoid_from(props: dict, state: str, county: str) -> str | None:
    """Extract GEOID from feature properties, falling back to construction."""
    for key in ("GEOID", "GEOID20", "geoid"):
        if props.get(key):
            return str(props[key])
    tract = props.get("TRACT") or props.get("TRACTCE") or props.get("TRACTCE20")
    if tract:
        return f"{state.zfill(2)}{county.zfill(3)}{str(tract).zfill(6)}"
    return None


def to_multipolygon_wkt(geometry: dict) -> str:
    geom = shape(geometry)
    if isinstance(geom, Polygon):
        geom = MultiPolygon([geom])
    return wkt_dumps(geom)


async def seed(state_fips: str, county_fips: str) -> None:
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        sys.exit("DATABASE_URL not set. Copy backend/.env.example to backend/.env and fill it in.")

    # asyncpg uses postgresql:// not postgresql+asyncpg://
    raw_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

    print(f"Connecting to database…")
    conn = await asyncpg.connect(raw_url)

    try:
        # 1. Upsert the Trash War campaign
        print("Seeding Trash War campaign…")
        await conn.execute(
            """
            INSERT INTO campaigns
                (id, slug, title, description, campaign_type, contribution_type,
                 geo_unit, status, geo_scope, scoring_rules, win_condition)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb)
            ON CONFLICT (slug) DO NOTHING
            """,
            TRASH_WAR_CAMPAIGN_ID,
            "trash-war",
            "Trash War",
            (
                "Claim territory by cleaning up trash. "
                "The group with the most bags cleaned in a census tract controls it."
            ),
            "territory",
            "cleanup",
            "census_tract",
            "active",
            json.dumps({"state_fips": state_fips, "county_fips": county_fips}),
            json.dumps({"unit": "bags", "per_contribution": 1}),
            json.dumps({"type": "open_ended"}),
        )
        print("  campaign row upserted.")

        # 2. Fetch tracts from Census TIGER
        print(f"Fetching census tracts (state={state_fips}, county={county_fips})…")
        features = await fetch_tracts(state_fips, county_fips)

        if not features:
            sys.exit(
                "No features returned from Census TIGER. "
                "Double-check --state and --county FIPS codes."
            )

        print(f"  {len(features)} tracts fetched.")

        # 3. Insert geo_units
        print("Inserting geo_units…")
        inserted = 0
        skipped = 0

        for feat in features:
            props = feat.get("properties") or {}
            geoid = geoid_from(props, state_fips, county_fips)

            if not geoid or not feat.get("geometry"):
                skipped += 1
                continue

            tract_num = props.get("TRACT") or props.get("TRACTCE") or props.get("TRACTCE20", "")
            display_name = f"Tract {tract_num}" if tract_num else f"Tract {geoid[-6:]}"

            try:
                wkt = to_multipolygon_wkt(feat["geometry"])
            except Exception as exc:
                print(f"  geometry error for {geoid}: {exc}")
                skipped += 1
                continue

            try:
                await conn.execute(
                    """
                    INSERT INTO geo_units
                        (campaign_id, unit_id, unit_type, geometry, geojson, display_name)
                    VALUES ($1, $2, $3, ST_GeomFromText($4, 4326), $5::jsonb, $6)
                    ON CONFLICT (campaign_id, unit_id) DO NOTHING
                    """,
                    TRASH_WAR_CAMPAIGN_ID,
                    geoid,
                    "census_tract",
                    wkt,
                    json.dumps(feat["geometry"]),
                    display_name,
                )
                inserted += 1
            except Exception as exc:
                print(f"  DB error for {geoid}: {exc}")
                skipped += 1

        print(f"  inserted: {inserted}  skipped/errored: {skipped}")
        print()
        print("Done. Visit /campaigns/trash-war to see the map.")

    finally:
        await conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--state", default="48", help="State FIPS (default: 48 = Texas)")
    parser.add_argument("--county", default="453", help="County FIPS (default: 453 = Travis County, TX)")
    args = parser.parse_args()

    asyncio.run(seed(args.state, args.county))
