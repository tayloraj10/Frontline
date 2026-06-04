from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import admin, contributions, decay, events, health, problem_reports, tiles, upload
from app.core.config import settings

app = FastAPI(title="Frontline API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://frontline.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(contributions.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(decay.router, prefix="/api")
app.include_router(upload.router, prefix="/api")
app.include_router(problem_reports.router, prefix="/api")
app.include_router(tiles.router, prefix="/api")
if not settings.is_production:
    app.include_router(admin.router, prefix="/api")
