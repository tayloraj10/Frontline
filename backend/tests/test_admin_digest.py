import pytest

from app.db.database import AsyncSessionLocal, engine
from app.services import admin_digest

pytestmark = pytest.mark.anyio


def _digest(**over):
    d = {
        "days": 7,
        "activity": {"signups": 0, "groups": 0, "events_created": 0,
                     "contributions": 0, "contribution_points": 0},
        "approvals": {"pending": 0, "oldest_pending_hours": None, "auto_approved": 0,
                      "manual_approved": 0, "rejected": 0},
        "community": {"groups_pending": 0, "partners_pending": 0, "flagged_avatars": 0,
                      "flagged_contribution_photos": 0, "flagged_cleanup_photos": 0,
                      "flagged_trash_reports": 0, "new_user_blocks": 0},
        "trash": {"cleanups": 0, "small_bags": 0, "large_bags": 0, "pounds": 0, "new_reports": 0,
                  "cleaned_up": 0, "open_now": 0, "claimed_now": 0, "auto_hidden": 0},
        "tasks": {"open_reports": 0, "flagged_messages": 0, "suspended_cleaners": 0,
                  "unpaid_allocations": 0, "failed_payouts": 0, "sweep_stale_minutes": None},
        "partners": {"new": 0, "new_offers": 0, "redemptions": 0, "redemption_points": 0},
        "marketplace": {"new_jobs": 0, "jobs_completed": 0, "new_cleaners": 0, "cleaner_applications": 0,
                        "disputed_jobs": 0, "safety_reports": 0, "held_jobs": 0, "held_cents": 0,
                        "awaiting_release": 0, "overdue_release": 0, "new_strikes": 0},
    }
    for section, values in over.items():
        d[section].update(values)
    return d


def test_daily_quiet_has_no_items():
    assert admin_digest.action_items(_digest()) == []


def test_daily_ignores_stats_only_numbers():
    d = _digest(activity={"signups": 5}, trash={"cleanups": 2, "pounds": 40},
                marketplace={"held_jobs": 2, "held_cents": 5000, "new_jobs": 3},
                tasks={"suspended_cleaners": 1})
    assert admin_digest.action_items(d) == []


def test_daily_lists_only_nonzero_queues():
    d = _digest(
        community={"groups_pending": 2, "flagged_avatars": 1},
        approvals={"pending": 3, "oldest_pending_hours": 72},
        marketplace={"overdue_release": 1},
    )
    items = dict(admin_digest.action_items(d))
    assert items["Groups pending approval"] == "2"
    assert items["Flagged avatars"] == "1"
    assert items["Marketplace jobs past release date"] == "1"
    assert items["Sponsored work waiting for review"] == "3 (oldest 3d)"
    assert "Partners pending approval" not in items


def test_daily_render():
    html = admin_digest.render_daily_html([("Groups pending approval", "2")])
    assert "Waiting on you" in html and "Groups pending approval" in html
    assert "because you are a site admin" in html


def test_weekly_quiet_is_skipped():
    assert admin_digest.needs_attention(_digest()) is False


def test_weekly_triggers_on_any_number():
    assert admin_digest.needs_attention(_digest(activity={"signups": 2})) is True
    assert admin_digest.needs_attention(_digest(trash={"cleanups": 1})) is True
    assert admin_digest.needs_attention(_digest(approvals={"rejected": 1})) is True
    assert admin_digest.needs_attention(_digest(marketplace={"new_jobs": 1})) is True


def test_weekly_render_contains_sections():
    html = admin_digest.render_weekly_html(_digest(approvals={"pending": 3, "oldest_pending_hours": 72},
                                                   community={"groups_pending": 1}))
    assert " to " in admin_digest._date_range(7)
    for needle in ("weekly summary","Waiting on you right now", "Activity", "Trash War",
                   "Pounds collected", "Partners", "Marketplace", "Earn sponsored work", "Moderation", "3d"):
        assert needle in html
    assert "because you are a site admin" in html


def test_weekly_render_when_nothing_waiting():
    assert "Nothing waiting on an admin" in admin_digest.render_weekly_html(_digest(activity={"signups": 1}))


async def test_build_digest_runs_against_db():
    try:
        async with AsyncSessionLocal() as db:
            for days in (1, 7):
                d = await admin_digest.build_digest(db, days)
                assert d["days"] == days
                assert set(d) == {"days", "activity", "approvals", "community", "trash", "tasks",
                                  "partners", "marketplace"}
    finally:
        await engine.dispose()
