"""Auth dependencies for FastAPI routes. Every non-public route declares exactly one of these.

- require_user: verifies the caller's Supabase access token (Authorization: Bearer).
- require_admin: require_user plus a database check on profiles.is_admin.
- require_service: server-to-server callers (cron, sweep, trusted proxy) using a shared secret.

Supabase signs with an asymmetric key (ES256), so tokens are verified against the project's public
JWKS and no signing secret is stored here. See dev-docs/backend-security-plan-2026-10-30.md.
"""

import hmac
import time
from uuid import UUID

import httpx
import jwt
from fastapi import Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.database import get_db
from app.services.admin_roles import is_site_admin

JWKS_TTL_S = 600
JWKS_MIN_REFETCH_S = 30
ALGORITHMS = ["ES256", "RS256"]

_keys: dict[str, dict] = {}
_fetched_at = 0.0


class CurrentUser(BaseModel):
    id: UUID
    email: str | None = None
    is_admin: bool = False


def _issuer() -> str:
    return f"{settings.supabase_url.rstrip('/')}/auth/v1"


async def _refresh_jwks() -> None:
    global _keys, _fetched_at
    async with httpx.AsyncClient(timeout=5) as client:
        res = await client.get(f"{_issuer()}/.well-known/jwks.json")
        res.raise_for_status()
    _keys = {k["kid"]: k for k in res.json().get("keys", []) if "kid" in k}
    _fetched_at = time.monotonic()


async def _signing_key(kid: str):
    """Cached JWKS lookup. An unknown kid triggers one refetch (rate limited) so key rotation works."""
    now = time.monotonic()
    stale = now - _fetched_at > JWKS_TTL_S
    unknown = kid not in _keys
    if (stale or unknown) and now - _fetched_at > JWKS_MIN_REFETCH_S:
        try:
            await _refresh_jwks()
        except httpx.HTTPError:
            if not _keys:
                raise HTTPException(503, "Auth keys unavailable.")
    jwk = _keys.get(kid)
    if jwk is None:
        raise HTTPException(401, "Invalid token.")
    return jwt.PyJWK(jwk).key


async def verify_token(token: str) -> dict:
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        if not kid or header.get("alg") not in ALGORITHMS:
            raise HTTPException(401, "Invalid token.")
        key = await _signing_key(kid)
        return jwt.decode(
            token,
            key,
            algorithms=ALGORITHMS,
            audience="authenticated",
            issuer=_issuer(),
            options={"require": ["exp", "sub", "iss", "aud"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired.")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token.")


async def require_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Missing bearer token.")
    claims = await verify_token(token.strip())
    try:
        uid = UUID(claims["sub"])
    except ValueError:
        raise HTTPException(401, "Invalid token.")
    return CurrentUser(id=uid, email=claims.get("email"))


async def require_admin(
    user: CurrentUser = Depends(require_user), db: AsyncSession = Depends(get_db)
) -> CurrentUser:
    if not await is_site_admin(db, user.id):
        raise HTTPException(403, "Admin only.")
    return user.model_copy(update={"is_admin": True})


async def require_service(x_admin_api_secret: str | None = Header(default=None)) -> None:
    """Shared secret for callers that are not a signed-in user. Fails closed when unset."""
    if not settings.admin_api_secret:
        raise HTTPException(503, "Service endpoint is not configured.")
    if not hmac.compare_digest((x_admin_api_secret or "").encode(), settings.admin_api_secret.encode()):
        raise HTTPException(403, "Invalid service secret.")
