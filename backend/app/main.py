import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import admin, admin_wipe, cleanup_events, contributions, decay, events, geo_units, groups, health, leaderboard, partners, problem_reports, tiles, upload
from app.core.config import settings

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=0.1 if settings.is_production else 1.0,
        enable_tracing=True,
    )

app = FastAPI(title="Frontline API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
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
app.include_router(leaderboard.router, prefix="/api")
app.include_router(geo_units.router, prefix="/api")
app.include_router(partners.router, prefix="/api")
app.include_router(cleanup_events.router, prefix="/api")
app.include_router(cleanup_events.routes_router, prefix="/api")
app.include_router(groups.router, prefix="/api")
app.include_router(admin_wipe.router, prefix="/api")
if not settings.is_production:
    app.include_router(admin.router, prefix="/api")
