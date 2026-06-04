from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db

router = APIRouter(prefix="/decay", tags=["decay"])


@router.post("/run")
async def run_decay_job(db: AsyncSession = Depends(get_db)):
    """
    Marks territory as decayed when no activity has occurred within the campaign's
    decay window. Intended to be called by a Railway cron or Cloud Run scheduler.
    """
    result = await db.execute(
        text("""
            UPDATE territory_claims
            SET claimed_by_user = NULL,
                claimed_by_group = NULL,
                total_value = 0,
                updated_at = NOW()
            WHERE decay_starts_at IS NOT NULL
            AND decay_starts_at < NOW()
            RETURNING campaign_id, geo_unit_id
        """)
    )
    decayed = result.fetchall()
    await db.commit()

    return {"decayed_count": len(decayed), "units": [{"campaign_id": str(r[0]), "geo_unit_id": str(r[1])} for r in decayed]}
