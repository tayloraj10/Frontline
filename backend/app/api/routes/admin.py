import asyncio
from functools import partial

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services import geo
from app.services.seeders import REGISTRY, StatesSeeder
from app.services.seeders.demo_data import DemoDataSeeder
from app.services.seeders.zip_codes import ZipCodeSeeder

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/simplify-zipcodes")
async def simplify_zipcodes(tolerance: float = 0.001, precision: int = 4):
    """
    Convert and simplify backend/data/zipcode_data_simple.json →
    backend/data/us_zipcodes.geojson. CPU-bound; takes ~30–60s.
    Run this before POST /admin/seed when seeding zip_codes.
    """
    if not geo.RAW_ZIP_FILE.exists():
        raise HTTPException(
            404,
            f"Source file not found: {geo.RAW_ZIP_FILE}. "
            "Copy zipcode_data_simple.json to backend/data/.",
        )

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None,
            partial(geo.simplify_zipcodes, tolerance=tolerance, precision=precision),
        )
    except Exception as exc:
        raise HTTPException(500, f"Simplification failed: {exc}")

    return {
        "input_size_mb": round(result.input_size_mb, 1),
        "output_size_mb": round(result.output_size_mb, 1),
        "feature_count": result.feature_count,
        "skipped_count": result.skipped_count,
    }


@router.post("/seed")
async def run_all_seeds(db: AsyncSession = Depends(get_db)):
    """Run all registered seeders with their default params."""
    results = {}
    for name, seeder_cls in REGISTRY.items():
        try:
            result = await seeder_cls().run(db, seeder_cls.default_params)
            results[name] = {
                "inserted": result.inserted,
                "skipped": result.skipped,
                "errors": result.errors[:20],
            }
        except Exception as exc:
            raise HTTPException(500, f"Seeder '{name}' failed: {exc}")
    return results


@router.post("/load-geo-units/zips")
async def load_geo_units_zips(db: AsyncSession = Depends(get_db)):
    """Load ZIP code boundaries into geo_units. Run POST /admin/simplify-zipcodes first."""
    try:
        result = await ZipCodeSeeder().run(db, {})
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(500, str(exc))
    return {"inserted": result.inserted, "skipped": result.skipped, "errors": result.errors[:20]}


@router.post("/seed/demo-data")
async def seed_demo_data(db: AsyncSession = Depends(get_db)):
    """Seed 10 demo users, 5 groups, and realistic activity for all 3 campaigns. Idempotent."""
    try:
        result = await DemoDataSeeder().run(db, {})
    except Exception as exc:
        raise HTTPException(500, f"Demo seeder failed: {exc}")
    return {"inserted": result.inserted, "skipped": result.skipped, "errors": result.errors[:20]}


@router.post("/load-geo-units/states")
async def load_geo_units_states(db: AsyncSession = Depends(get_db)):
    """Load US state boundaries into geo_units for the Road to Independence campaign."""
    try:
        result = await StatesSeeder().run(db, {})
    except Exception as exc:
        raise HTTPException(500, str(exc))
    return {"inserted": result.inserted, "skipped": result.skipped, "errors": result.errors[:20]}
