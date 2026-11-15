"""Every route under an audited prefix must declare an auth dependency.

AUDITED shrinks the unaudited surface over time: add a prefix here when its router is migrated.
Stripe webhooks authenticate by signature, so they are the only allowlisted exception.
"""

from fastapi.routing import APIRoute

from app.core.auth import optional_user, require_admin, require_service, require_user
from app.main import app

AUDITED_PREFIXES = ("/api/marketplace", "/api/payments", "/api/sponsorships")
AUTH_DEPS = {require_user, require_admin, require_service}
SIGNATURE_VERIFIED = {"/api/payments/webhooks/stripe"}
# Static job-category catalog (labels, icons, colors): no user data, so no auth at all.
PUBLIC_STATIC = {"/api/marketplace/categories"}
# Read-only browse routes a logged-out visitor may call. They must use optional_user (never skip auth
# silently); the frontend proxies also only forward them when the payments gate is on.
PUBLIC_READS = {
    "/api/sponsorships/sites",
    "/api/sponsorships/map",
    "/api/sponsorships/group-areas",
    "/api/marketplace/cleaners",
    "/api/marketplace/cleaners/{cleaner_id}",
    "/api/marketplace/pricing",
    "/api/marketplace/board",
    "/api/marketplace/board/pins",
    "/api/marketplace/jobs/{job_id}",
}


def _calls(dependant):
    for sub in dependant.dependencies:
        yield sub.call
        yield from _calls(sub)


def test_audited_routes_have_auth():
    missing = []
    for route in app.routes:
        if not isinstance(route, APIRoute) or not route.path.startswith(AUDITED_PREFIXES):
            continue
        if route.path in SIGNATURE_VERIFIED:
            continue
        if route.path in PUBLIC_STATIC and route.methods == {"GET"}:
            continue
        deps = set(_calls(route.dependant))
        if AUTH_DEPS & deps:
            continue
        if route.path in PUBLIC_READS and route.methods == {"GET"} and optional_user in deps:
            continue
        missing.append(f"{sorted(route.methods)} {route.path}")
    assert not missing, "Routes without an auth dependency:\n" + "\n".join(missing)
