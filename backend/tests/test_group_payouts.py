from uuid import uuid4

import pytest

from app.core.config import settings
from app.db.database import AsyncSessionLocal, engine
from app.services import connect

pytestmark = pytest.mark.anyio


async def test_group_without_account_is_blocked_only_when_stripe_is_on(monkeypatch):
    try:
        async with AsyncSessionLocal() as db:
            gid = uuid4()
            monkeypatch.setattr(settings, "stripe_secret_key", "")
            assert await connect.group_payouts_ready(db, gid) is True  # manual payouts in local dev
            monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_x")
            assert await connect.group_account_for(db, gid) == (None, False)
            assert await connect.group_payouts_ready(db, gid) is False
    finally:
        await engine.dispose()
