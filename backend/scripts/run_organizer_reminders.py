"""Calls POST /api/cleanup-events/organizer-reminders/run on the API service. Intended
for a Railway cron service (mirrors run_decay.py)."""

import os
import sys

import httpx

API_URL = os.environ["API_URL"].rstrip("/")


def main() -> None:
    response = httpx.post(f"{API_URL}/api/cleanup-events/organizer-reminders/run", timeout=30)
    response.raise_for_status()
    print(response.json())


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"organizer reminders run failed: {exc}", file=sys.stderr)
        sys.exit(1)
