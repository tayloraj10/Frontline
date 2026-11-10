"""Every route under an audited prefix must declare an auth dependency.

AUDITED shrinks the unaudited surface over time: add a prefix here when its router is migrated.
Stripe webhooks authenticate by signature, so they are the only allowlisted exception.
"""

from fastapi.routing import APIRoute

from app.core.auth import require_admin, require_service, require_user
from app.main import app

AUDITED_PREFIXES = ("/api/marketplace", "/api/payments", "/api/sponsorships")
AUTH_DEPS = {require_user, require_admin, require_service}
SIGNATURE_VERIFIED = {"/api/payments/webhooks/stripe"}


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
        if not AUTH_DEPS.intersection(_calls(route.dependant)):
            missing.append(f"{sorted(route.methods)} {route.path}")
    assert not missing, "Routes without an auth dependency:\n" + "\n".join(missing)
