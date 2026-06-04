#!/usr/bin/env python3
"""
Seed the Trash War campaign with US ZIP code boundaries.

Reads from the pre-simplified GeoJSON produced by simplify_zipcodes.py.
Run that script first if backend/data/us_zipcodes.geojson doesn't exist.

Usage (from backend/ directory):
    python scripts/seed_trash_war.py
    python scripts/seed_trash_war.py --zipfile /path/to/us_zipcodes.geojson

Requires DATABASE_URL in backend/.env.
"""

import asyncio
import argparse
import json
import sys
import uuid
from pathlib import Path

import asyncpg
from shapely.geometry import shape, MultiPolygon, Polygon
from shapely.wkt import dumps as wkt_dumps
from dotenv import load_dotenv
import os

load_dotenv(Path(__file__).parent.parent / ".env")

TRASH_WAR_CAMPAIGN_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
DEFAULT_ZIPFILE = Path(__file__).parent.parent / "data" / "us_zipcodes.geojson"
BATCH_SIZE = 500


def to_multipolygon_wkt(geometry: dict) -> str:
    geom = shape(geometry)
    if isinstance(geom, Polygon):
        geom = MultiPolygon([geom])
    return wkt_dumps(geom)


async def seed(zipfile: Path) -> None:
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        sys.exit("DATABASE_URL not set. Copy backend/.env.example to backend/.env and fill it in.")

    if not zipfile.exists():
        sys.exit(
            f"{zipfile} not found.\n"
            "Run: python scripts/simplify_zipcodes.py --input /path/to/zipcode_data_simple.json"
        )

    print(f"Reading {zipfile} ...")
    with open(zipfile, encoding="utf-8") as f:
        fc = json.load(f)
    features = fc.get("features", [])
    print(f"  {len(features)} ZIP features loaded.")

    raw_url = db_url.replace("postgresql+asyncpg://", "postgresql://")
    print("Connecting to database ...")
    conn = await asyncpg.connect(raw_url)

    try:
        # Upsert the Trash War campaign (idempotent)
        print("Upserting Trash War campaign ...")
        await conn.execute(
            """
            INSERT INTO campaigns
                (id, slug, title, description, campaign_type, contribution_type,
                 geo_unit, status, geo_scope, scoring_rules, win_condition)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb)
            ON CONFLICT (slug) DO UPDATE SET geo_unit = 'zip'
            """,
            TRASH_WAR_CAMPAIGN_ID,
            "trash-war",
            "Trash War",
            "Claim territory by cleaning up trash. The group with the most bags cleaned in a ZIP code controls it.",
            "territory",
            "cleanup",
            "zip",
            "active",
            json.dumps({"scope": "nationwide"}),
            json.dumps({"unit": "bags", "per_contribution": 1}),
            json.dumps({"type": "open_ended"}),
        )

        # Clear any stale geo_units for this campaign (census tracts or prior ZIP load)
        deleted = await conn.fetchval(
            "DELETE FROM geo_units WHERE campaign_id = $1 RETURNING count(*)",
            TRASH_WAR_CAMPAIGN_ID,
        )
        print(f"  cleared {deleted or 0} existing geo_unit rows.")

        # Batch insert ZIP boundaries
        print(f"Inserting {len(features)} ZIP geo_units (batch size {BATCH_SIZE}) ...")
        inserted = 0
        skipped = 0

        for batch_start in range(0, len(features), BATCH_SIZE):
            batch = features[batch_start : batch_start + BATCH_SIZE]
            rows = []

            for feat in batch:
                zip_code = (feat.get("properties") or {}).get("zip")
                geometry = feat.get("geometry")

                if not zip_code or not geometry:
                    skipped += 1
                    continue

                try:
                    wkt = to_multipolygon_wkt(geometry)
                except Exception as exc:
                    print(f"  geometry error for {zip_code}: {exc}")
                    skipped += 1
                    continue

                rows.append((
                    TRASH_WAR_CAMPAIGN_ID,
                    zip_code,
                    "zip",
                    wkt,
                    json.dumps(geometry),
                    zip_code,  # display_name
                ))

            if rows:
                await conn.executemany(
                    """
                    INSERT INTO geo_units
                        (campaign_id, unit_id, unit_type, geometry, geojson, display_name)
                    VALUES ($1, $2, $3, ST_GeomFromText($4, 4326), $5::jsonb, $6)
                    ON CONFLICT (campaign_id, unit_id) DO NOTHING
                    """,
                    rows,
                )
                inserted += len(rows)

            print(f"  {min(batch_start + BATCH_SIZE, len(features))}/{len(features)} ...")

        print(f"\nDone. inserted: {inserted}  skipped: {skipped}")
        print("Visit /campaigns/trash-war to see the map.")

    finally:
        await conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--zipfile",
        default=str(DEFAULT_ZIPFILE),
        help=f"Path to simplified ZIP GeoJSON (default: {DEFAULT_ZIPFILE})",
    )
    args = parser.parse_args()

    asyncio.run(seed(Path(args.zipfile)))
