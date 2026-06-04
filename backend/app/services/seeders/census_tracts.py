"""
Seeder: census_tracts
Loads census tract boundaries from the Census TIGER API into geo_units for a campaign.

Required params:
  campaign_slug  str   slug of the campaign row to attach tracts to
  state_fips     str   2-digit state FIPS code (default: "48" = Texas)
  county_fips    str   3-digit county FIPS code (default: "453" = Travis County, TX)
"""

import json

import httpx
from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.wkt import dumps as wkt_dumps
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .base import Seeder, SeedResult

_TIGER_URL = (
    "https://tigerweb.geo.census.gov/arcgis/rest/services"
    "/TIGERweb/tigerWMS_ACS2023/MapServer/8/query"
)


class CensusTractSeeder(Seeder):
    default_params = {"campaign_slug": "trash-war", "state_fips": "48", "county_fips": "453"}

    async def run(self, db: AsyncSession, params: dict) -> SeedResult:
        campaign_slug = params.get("campaign_slug")
        if not campaign_slug:
            raise ValueError("'campaign_slug' is required")

        state_fips = str(params.get("state_fips", "48"))
        county_fips = str(params.get("county_fips", "453"))

        row = (
            await db.execute(
                text("SELECT id FROM campaigns WHERE slug = :slug"),
                {"slug": campaign_slug},
            )
        ).fetchone()
        if not row:
            raise ValueError(f"Campaign '{campaign_slug}' not found")
        campaign_id = str(row[0])

        features = await self._fetch_tracts(state_fips, county_fips)
        result = SeedResult()

        for feat in features:
            props = feat.get("properties") or {}
            geoid = self._geoid(props, state_fips, county_fips)
            if not geoid or not feat.get("geometry"):
                result.skipped += 1
                continue

            tract_num = (
                props.get("TRACT") or props.get("TRACTCE") or props.get("TRACTCE20", "")
            )
            display_name = f"Tract {tract_num}" if tract_num else f"Tract {geoid[-6:]}"

            try:
                wkt = self._to_multipolygon_wkt(feat["geometry"])
            except Exception as exc:
                result.skipped += 1
                result.errors.append(f"{geoid}: geometry error: {exc}")
                continue

            try:
                await db.execute(
                    text("""
                        INSERT INTO geo_units
                            (campaign_id, unit_id, unit_type, geometry, geojson, display_name)
                        VALUES (
                            :campaign_id, :unit_id, 'census_tract',
                            ST_GeomFromText(:wkt, 4326), CAST(:geojson AS jsonb), :display_name
                        )
                        ON CONFLICT (campaign_id, unit_id) DO NOTHING
                    """),
                    {
                        "campaign_id": campaign_id,
                        "unit_id": geoid,
                        "wkt": wkt,
                        "geojson": json.dumps(feat["geometry"]),
                        "display_name": display_name,
                    },
                )
                result.inserted += 1
            except Exception as exc:
                result.skipped += 1
                result.errors.append(f"{geoid}: DB error: {exc}")

        await db.commit()
        return result

    async def _fetch_tracts(self, state_fips: str, county_fips: str) -> list[dict]:
        features: list[dict] = []
        offset = 0
        async with httpx.AsyncClient(timeout=60) as client:
            while True:
                resp = await client.get(
                    _TIGER_URL,
                    params={
                        "where": f"STATE='{state_fips}' AND COUNTY='{county_fips}'",
                        "outFields": "GEOID,NAME,STATE,COUNTY,TRACT",
                        "outSR": "4326",
                        "f": "geojson",
                        "resultOffset": offset,
                        "resultRecordCount": 1000,
                    },
                )
                resp.raise_for_status()
                chunk = resp.json().get("features", [])
                features.extend(chunk)
                if len(chunk) < 1000:
                    break
                offset += 1000
        return features

    def _geoid(self, props: dict, state: str, county: str) -> str | None:
        for key in ("GEOID", "GEOID20", "geoid"):
            if props.get(key):
                return str(props[key])
        tract = props.get("TRACT") or props.get("TRACTCE") or props.get("TRACTCE20")
        if tract:
            return f"{state.zfill(2)}{county.zfill(3)}{str(tract).zfill(6)}"
        return None

    def _to_multipolygon_wkt(self, geometry: dict) -> str:
        geom = shape(geometry)
        if isinstance(geom, Polygon):
            geom = MultiPolygon([geom])
        return wkt_dumps(geom)
