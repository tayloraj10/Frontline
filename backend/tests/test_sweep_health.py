import pytest
from sqlalchemy import text

from app.db.database import AsyncSessionLocal, engine
from app.services import marketplace, sweep_health

pytestmark = pytest.mark.anyio


@pytest.fixture
async def alerts(monkeypatch):
    sent = []

    async def fake(db, kind, title, body, path):
        sent.append(title)

    monkeypatch.setattr(marketplace, "_notify_admins", fake)
    yield sent
    await engine.dispose()


async def _set(db, age_min, alerted):
    await db.execute(
        text(
            """UPDATE service_heartbeats SET last_run_at = now() - make_interval(mins => :a),
               last_alert_at = CASE WHEN :x THEN now() ELSE NULL END WHERE name = :n"""
        ),
        {"a": age_min, "x": alerted, "n": sweep_health.NAME},
    )
    await db.commit()


async def test_alerts_once_when_stale_then_clears_on_run(alerts):
    async with AsyncSessionLocal() as db:
        await _set(db, 5, False)
        await sweep_health.alert_if_stale(db)
        assert alerts == []

        await _set(db, 90, False)
        await sweep_health.alert_if_stale(db)
        await sweep_health.alert_if_stale(db)
        assert len(alerts) == 1

        await sweep_health.record_run(db)
        await sweep_health.alert_if_stale(db)
        assert len(alerts) == 1
