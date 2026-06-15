"""Unit tests for core/security.py — no database required."""
import time
import pytest
from jose import JWTError

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


# ── Password hashing ─────────────────────────────────────────────────────────

def test_hash_password_produces_bcrypt_hash():
    h = hash_password("secret123")
    assert h.startswith("$2")  # bcrypt prefix


def test_verify_password_correct():
    h = hash_password("mypin")
    assert verify_password("mypin", h) is True


def test_verify_password_wrong():
    h = hash_password("mypin")
    assert verify_password("wrongpin", h) is False


def test_hash_is_not_plaintext():
    h = hash_password("secret")
    assert h != "secret"


def test_same_password_produces_different_hashes():
    h1 = hash_password("same")
    h2 = hash_password("same")
    assert h1 != h2  # bcrypt salts each hash


# ── Access token ─────────────────────────────────────────────────────────────

def test_create_access_token_is_decodable():
    token = create_access_token(subject=42)
    payload = decode_token(token)
    assert payload["sub"] == "42"


def test_access_token_type_is_access():
    token = create_access_token(subject=1)
    payload = decode_token(token)
    assert payload["type"] == "access"


def test_access_token_carries_extra_claims():
    token = create_access_token(subject=7, extra={"org_id": 3, "role": "admin"})
    payload = decode_token(token)
    assert payload["org_id"] == 3
    assert payload["role"] == "admin"


def test_access_token_custom_expiry():
    token = create_access_token(subject=1, expire_hours=24)
    payload = decode_token(token)
    # exp should be roughly 24 h from now (within a 60-second tolerance)
    assert payload["exp"] > time.time() + 23 * 3600


def test_tampered_access_token_raises():
    token = create_access_token(subject=1)
    bad = token[:-4] + "xxxx"
    with pytest.raises(JWTError):
        decode_token(bad)


def test_access_token_with_zero_expiry_is_expired():
    from datetime import UTC, datetime, timedelta
    from jose import jwt
    from app.core.config import settings
    payload = {
        "sub": "1",
        "type": "access",
        "exp": datetime.now(UTC) - timedelta(seconds=1),
    }
    expired_token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    with pytest.raises(JWTError):
        decode_token(expired_token)


# ── Refresh token ────────────────────────────────────────────────────────────

def test_create_refresh_token_is_decodable():
    token = create_refresh_token(subject=99)
    payload = decode_token(token)
    assert payload["sub"] == "99"


def test_refresh_token_type_is_refresh():
    token = create_refresh_token(subject=1)
    payload = decode_token(token)
    assert payload["type"] == "refresh"


def test_refresh_token_expires_later_than_access():
    access = decode_token(create_access_token(subject=1))
    refresh = decode_token(create_refresh_token(subject=1))
    assert refresh["exp"] > access["exp"]
