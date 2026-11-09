"""Isolated Authentication and Authorization Boundary for Winners Creek Operations Center.

This module provides independent identity, Argon2id password hashing, RFC 6238 TOTP MFA,
and secure session management completely isolated from ordinary LMS user credentials.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import struct
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import argon2
from fastapi import Cookie, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel

from app.core.config import settings
from app.core.logging import get_logger
from app.db.postgres import get_pg_connection

log = get_logger("app.operations_center.auth")

# Argon2id password hasher instance
_ph = argon2.PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    type=argon2.Type.ID,
)

OPS_SESSION_COOKIE_NAME = "ops_session"
OPS_SESSION_TTL_HOURS = 12
OPS_REAUTH_TTL_MINUTES = 5

# Ephemeral in-memory reauth tokens for high-risk emergency controls
_reauth_tokens: dict[str, dict[str, Any]] = {}

# Ephemeral in-memory MFA setup sessions for secure enrollment/recovery (10 minute TTL)
_mfa_setup_sessions: dict[str, dict[str, Any]] = {}


def generate_backup_codes(count: int = 8) -> list[str]:
    """Generate high-entropy 8-character single-use recovery codes."""
    return [secrets.token_hex(4).upper() for _ in range(count)]


def hash_backup_code(code: str) -> str:
    """Hash recovery code with SHA-256 for secure immutable storage."""
    return hashlib.sha256(code.strip().upper().encode("utf-8")).hexdigest()


def create_mfa_setup_session(admin_id: str, username: str, secret: str, hashed_backup_codes: list[str]) -> str:
    """Create short-lived MFA setup session valid for 10 minutes."""
    setup_token = secrets.token_urlsafe(32)
    _mfa_setup_sessions[setup_token] = {
        "admin_id": admin_id,
        "username": username,
        "secret": secret,
        "hashed_backup_codes": hashed_backup_codes,
        "expires_at": time.time() + 600,
    }
    return setup_token


def pop_mfa_setup_session(setup_token: str) -> dict[str, Any] | None:
    """Retrieve and consume MFA setup session."""
    data = _mfa_setup_sessions.pop(setup_token, None)
    if not data or time.time() > data["expires_at"]:
        return None
    return data


def hash_password(password: str) -> str:
    """Hash password using Argon2id."""
    return _ph.hash(password)


def verify_password(hashed: str, password: str) -> bool:
    """Verify password against Argon2id hash."""
    try:
        return _ph.verify(hashed, password)
    except Exception:
        return False


def generate_totp_secret() -> str:
    """Generate a random 32-character base32 TOTP secret."""
    raw = secrets.token_bytes(20)
    return base64.b32encode(raw).decode("utf-8").replace("=", "")


def generate_totp(secret_b32: str, intervals_no: int | None = None) -> str:
    """Compute RFC 6238 TOTP 6-digit code."""
    if intervals_no is None:
        intervals_no = int(time.time()) // 30
    # Pad base32 if needed
    secret_clean = secret_b32.strip().upper()
    padding = len(secret_clean) % 8
    if padding:
        secret_clean += "=" * (8 - padding)
    key = base64.b32decode(secret_clean, casefold=True)
    msg = struct.pack(">Q", intervals_no)
    h = hmac.new(key, msg, hashlib.sha1).digest()
    o = h[19] & 15
    token = (struct.unpack(">I", h[o : o + 4])[0] & 0x7FFFFFFF) % 1000000
    return f"{token:06d}"


def verify_totp(secret_b32: str, code: str, window: int = 1) -> bool:
    """Verify TOTP with window allowance (+/- 30s)."""
    if not code or len(code.strip()) != 6:
        return False
    curr = int(time.time()) // 30
    for i in range(-window, window + 1):
        if generate_totp(secret_b32, curr + i) == code.strip():
            return True
    return False


def hash_token(raw_token: str) -> str:
    """SHA-256 hash for database token storage."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


class OpsAdminIdentity(BaseModel):
    id: str
    username: str
    email: str
    status: str
    mfa_enabled: bool
    session_id: str
    created_at: str


async def create_ops_session(
    admin_id: UUID | str,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> tuple[str, str]:
    """Create a new Operations Center session and return (raw_session_token, session_id)."""
    raw_token = secrets.token_urlsafe(48)
    token_h = hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=OPS_SESSION_TTL_HOURS)

    async with get_pg_connection() as conn:
        session_id = await conn.fetchval(
            """
            INSERT INTO operations_center_sessions (
                admin_id, session_token_hash, ip_address, user_agent, expires_at
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING id
            """,
            UUID(str(admin_id)),
            token_h,
            ip_address,
            user_agent,
            expires_at,
        )
        # Update last_login_at on admin
        await conn.execute(
            """
            UPDATE operations_center_admins
            SET last_login_at = NOW(),
                last_login_ip = $2,
                failed_login_attempts = 0,
                lockout_until = NULL,
                updated_at = NOW()
            WHERE id = $1
            """,
            UUID(str(admin_id)),
            ip_address,
        )

    return raw_token, str(session_id)


async def revoke_ops_session(session_token: str) -> bool:
    """Explicitly revoke an Operations Center session."""
    token_h = hash_token(session_token)
    async with get_pg_connection() as conn:
        res = await conn.execute(
            """
            UPDATE operations_center_sessions
            SET revoked_at = NOW()
            WHERE session_token_hash = $1 AND revoked_at IS NULL
            """,
            token_h,
        )
        return "UPDATE 1" in res


def issue_reauth_token(admin_username: str) -> str:
    """Issue a 5-minute ephemeral re-auth token for emergency critical operations."""
    reauth_tok = secrets.token_urlsafe(32)
    _reauth_tokens[reauth_tok] = {
        "username": admin_username,
        "expires_at": time.time() + (OPS_REAUTH_TTL_MINUTES * 60),
    }
    return reauth_tok


def verify_reauth_token(token: str, admin_username: str) -> bool:
    """Validate ephemeral re-auth token and consume it (one-time use)."""
    data = _reauth_tokens.pop(token, None)
    if not data:
        return False
    if time.time() > data["expires_at"]:
        return False
    return data["username"] == admin_username


async def get_current_ops_admin(
    request: Request,
    authorization: str | None = Header(None),
) -> OpsAdminIdentity:
    """Strict authorization dependency: validates Operations Center session."""
    # 1. Extract session token from cookie or Authorization header
    token = request.cookies.get(OPS_SESSION_COOKIE_NAME)
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ")[1].strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Operations Center authentication required. Access denied.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_h = hash_token(token)
    now = datetime.now(timezone.utc)

    async with get_pg_connection() as conn:
        row = await conn.fetchrow(
            """
            SELECT s.id as session_id, s.expires_at, s.revoked_at,
                   a.id as admin_id, a.username, a.email, a.status, a.mfa_enabled, a.created_at
            FROM operations_center_sessions s
            JOIN operations_center_admins a ON a.id = s.admin_id
            WHERE s.session_token_hash = $1
            """,
            token_h,
        )

        if not row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Operations Center session.",
            )

        if row["revoked_at"] is not None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Operations Center session has been revoked.",
            )

        if row["expires_at"] < now:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Operations Center session has expired.",
            )

        if row["status"] != "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operations Center administrator account is suspended or disabled.",
            )

        # Update last activity
        await conn.execute(
            "UPDATE operations_center_sessions SET last_activity_at = NOW() WHERE id = $1",
            row["session_id"],
        )

        return OpsAdminIdentity(
            id=str(row["admin_id"]),
            username=row["username"],
            email=row["email"],
            status=row["status"],
            mfa_enabled=bool(row["mfa_enabled"]),
            session_id=str(row["session_id"]),
            created_at=row["created_at"].isoformat(),
        )


def set_ops_cookie(response: Response, token: str) -> None:
    """Set secure HttpOnly cookie for Operations Center."""
    response.set_cookie(
        key=OPS_SESSION_COOKIE_NAME,
        value=token,
        max_age=OPS_SESSION_TTL_HOURS * 3600,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/",
    )


def clear_ops_cookie(response: Response) -> None:
    """Clear Operations Center cookie."""
    response.delete_cookie(
        key=OPS_SESSION_COOKIE_NAME,
        path="/",
        secure=True,
        httponly=True,
        samesite="strict",
    )
