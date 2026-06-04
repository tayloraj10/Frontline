from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services.seeders import REGISTRY

router = APIRouter(prefix="/admin", tags=["admin"])


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
