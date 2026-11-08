"""One daily Railway cron that triggers every once-a-day email job on the API service:
organizer reminders, organizer followups, the admin action list, and on Mondays (UTC) the
weekly admin summary. Each job runs on its own, so one failure does not block the others;
the script exits 1 if any job failed so Railway still shows the run as failed."""

import os
import sys
from datetime import datetime, timezone

import httpx

API_URL = os.environ["API_URL"].rstrip("/")
SECRET = os.environ.get("ADMIN_API_SECRET", "")

JOBS = [
    ("organizer reminders", "/api/cleanup-events/organizer-reminders/run", {}),
    ("organizer followups", "/api/cleanup-events/organizer-followups/run", {}),
    ("admin daily action list", "/api/admin-prod/daily-digest/run", {"X-Admin-API-Secret": SECRET}),
]
WEEKLY_JOB = ("admin weekly summary", "/api/admin-prod/weekly-digest/run", {"X-Admin-API-Secret": SECRET})


def main() -> int:
    jobs = list(JOBS)
    if datetime.now(timezone.utc).weekday() == 0:  # Monday
        jobs.append(WEEKLY_JOB)
    failed = 0
    for name, path, headers in jobs:
        try:
            response = httpx.post(f"{API_URL}{path}", headers=headers, timeout=60)
            response.raise_for_status()
            print(f"{name}: {response.json()}")
        except Exception as exc:
            failed += 1
            print(f"{name} failed: {exc}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
