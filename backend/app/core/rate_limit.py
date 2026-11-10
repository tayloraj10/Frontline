"""In-memory sliding-window rate limits, per user, per process.

Good enough while the API runs as a single Railway instance. If it scales out, move the counters to
Redis (the dependency signature stays the same). Limits are keyed by the verified user id, so they
need no client IP and cannot be dodged by rotating addresses.
"""

import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException

from app.core.auth import CurrentUser, require_user

_hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)


def rate_limit(name: str, limit: int, window_s: int):
    async def dependency(user: CurrentUser = Depends(require_user)) -> None:
        now = time.monotonic()
        hits = _hits[(name, str(user.id))]
        while hits and now - hits[0] > window_s:
            hits.popleft()
        if len(hits) >= limit:
            raise HTTPException(429, "Too many requests. Please wait a moment and try again.")
        hits.append(now)

    return dependency


# Ordinary writes (messages, photos, profile edits) and money-moving actions (charges, checkout,
# onboarding links, payouts) get separate budgets.
limit_writes = rate_limit("write", 60, 60)
limit_money = rate_limit("money", 10, 60)
