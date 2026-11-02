import json
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException

from app.core import auth
from app.core.config import settings

pytestmark = pytest.mark.anyio

KID = "test-key"


@pytest.fixture
def keypair(monkeypatch):
    private = ec.generate_private_key(ec.SECP256R1())
    jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(private.public_key()))
    jwk.update(kid=KID, alg="ES256", use="sig")
    monkeypatch.setattr(auth, "_keys", {KID: jwk})
    monkeypatch.setattr(auth, "_fetched_at", time.monotonic())
    return private


def _token(private, **overrides):
    claims = {
        "sub": "11111111-1111-1111-1111-111111111111",
        "aud": "authenticated",
        "iss": f"{settings.supabase_url.rstrip('/')}/auth/v1",
        "exp": int(time.time()) + 300,
        **overrides,
    }
    return jwt.encode(claims, private, algorithm="ES256", headers={"kid": KID})


async def test_valid_token(keypair):
    user = await auth.require_user(f"Bearer {_token(keypair)}")
    assert str(user.id) == "11111111-1111-1111-1111-111111111111"


@pytest.mark.parametrize(
    "overrides",
    [{"exp": 1}, {"aud": "other"}, {"iss": "https://evil.example/auth/v1"}],
)
async def test_bad_claims_rejected(keypair, overrides):
    with pytest.raises(HTTPException) as e:
        await auth.require_user(f"Bearer {_token(keypair, **overrides)}")
    assert e.value.status_code == 401


async def test_wrong_signer_rejected(keypair):
    other = ec.generate_private_key(ec.SECP256R1())
    with pytest.raises(HTTPException) as e:
        await auth.require_user(f"Bearer {_token(other)}")
    assert e.value.status_code == 401


async def test_missing_header_rejected():
    with pytest.raises(HTTPException) as e:
        await auth.require_user(None)
    assert e.value.status_code == 401


async def test_hs256_token_rejected(keypair):
    forged = jwt.encode({"sub": "x"}, "secret", algorithm="HS256", headers={"kid": KID})
    with pytest.raises(HTTPException) as e:
        await auth.require_user(f"Bearer {forged}")
    assert e.value.status_code == 401


async def test_service_secret(monkeypatch):
    monkeypatch.setattr(settings, "admin_api_secret", "")
    with pytest.raises(HTTPException) as e:
        await auth.require_service("anything")
    assert e.value.status_code == 503
    monkeypatch.setattr(settings, "admin_api_secret", "s3cret")
    with pytest.raises(HTTPException) as e:
        await auth.require_service("wrong")
    assert e.value.status_code == 403
    assert await auth.require_service("s3cret") is None
