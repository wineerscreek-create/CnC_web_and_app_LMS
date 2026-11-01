"""Pytest suite for the 14 Required Production Audit Cases."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.core.redis_client import get_redis
from app.core.security import hash_password, hash_token
from app.db.postgres import connect_to_postgres, get_pg_connection, close_postgres
from app.main import create_app
from app.repositories.user_repo import UserRepository
from app.services.email_service import ConsoleEmailProvider


@pytest_asyncio.fixture(scope="module")
async def audit_client():
    await connect_to_postgres()
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
    await close_postgres()


@pytest.mark.asyncio
async def test_case_01_correct_email_and_password(audit_client: AsyncClient):
    res = await audit_client.post(
        "/api/v1/auth/login",
        json={"identifier": "sandeep.27cs@aryacollege.in", "password": "Eedi@2026"},
    )
    assert res.status_code == 200
    assert "accessToken" in res.json().get("data", {})


@pytest.mark.asyncio
async def test_case_02_correct_institution_id_and_password(audit_client: AsyncClient):
    res = await audit_client.post(
        "/api/v1/auth/login",
        json={"identifier": "23EARCS142", "password": "Eedi@2026"},
    )
    assert res.status_code == 200
    assert "accessToken" in res.json().get("data", {})


@pytest.mark.asyncio
async def test_case_03_incorrect_password(audit_client: AsyncClient):
    res = await audit_client.post(
        "/api/v1/auth/login",
        json={"identifier": "sandeep.27cs@aryacollege.in", "password": "WrongPassword@123"},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_case_04_nonexistent_account(audit_client: AsyncClient):
    res = await audit_client.post(
        "/api/v1/auth/login",
        json={"identifier": "nonexistent_audit_user@example.com", "password": "Password@2026"},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_case_05_active_account_with_unverified_email(audit_client: AsyncClient):
    user = await UserRepository.get_by_email("sandeep.27cs@aryacollege.in")
    assert user is not None
    assert user["email_verified"] is False
    assert user["status"] == "ACTIVE"
    res = await audit_client.post(
        "/api/v1/auth/login",
        json={"identifier": "sandeep.27cs@aryacollege.in", "password": "Eedi@2026"},
    )
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_case_06_disabled_account(audit_client: AsyncClient):
    test_uid = uuid4()
    test_email = f"pytest_inactive_{uuid4().hex[:8]}@example.com"
    pwd_hash = hash_password("TestPassword@2026")
    async with get_pg_connection() as conn:
        await conn.execute(
            """
            INSERT INTO users (id, email, password_hash, name, role, status)
            VALUES ($1, $2, $3, 'Inactive User', 'STUDENT', 'INACTIVE')
            """,
            test_uid, test_email, pwd_hash
        )
    try:
        res = await audit_client.post(
            "/api/v1/auth/login",
            json={"identifier": test_email, "password": "TestPassword@2026"},
        )
        assert res.status_code == 401
    finally:
        async with get_pg_connection() as conn:
            await conn.execute("DELETE FROM users WHERE id = $1", test_uid)


@pytest.mark.asyncio
async def test_case_07_student_missing_profile(audit_client: AsyncClient):
    test_uid = uuid4()
    test_email = f"pytest_noprofile_{uuid4().hex[:8]}@example.com"
    pwd_hash = hash_password("TestPassword@2026")
    dept_id = "dccbb2bf-8de1-4945-bf70-f11ad2f7682a"
    inst_id = "39a363c8-635a-4a0b-b9c0-d0c51529774f"
    async with get_pg_connection() as conn:
        await conn.execute(
            """
            INSERT INTO users (id, email, password_hash, name, role, status, institution_id, department_id)
            VALUES ($1, $2, $3, 'No Profile Student', 'STUDENT', 'ACTIVE', $4::uuid, $5::uuid)
            """,
            test_uid, test_email, pwd_hash, inst_id, dept_id
        )
    try:
        res = await audit_client.post(
            "/api/v1/auth/login",
            json={"identifier": test_email, "password": "TestPassword@2026"},
        )
        assert res.status_code == 200
    finally:
        async with get_pg_connection() as conn:
            await conn.execute("DELETE FROM users WHERE id = $1", test_uid)


@pytest.mark.asyncio
async def test_case_08_redis_unavailable(audit_client: AsyncClient):
    from unittest.mock import patch
    import redis.exceptions as red_exc

    async def broken_setex(*args, **kwargs):
        raise red_exc.ConnectionError("Redis connection refused")

    redis_client = get_redis()
    with patch.object(redis_client, "setex", side_effect=broken_setex):
        res = await audit_client.post(
            "/api/v1/auth/login",
            json={"identifier": "sandeep.27cs@aryacollege.in", "password": "Eedi@2026"},
        )
        assert res.status_code == 503
        assert res.json().get("error", {}).get("code") == "SERVICE_UNAVAILABLE"


@pytest.mark.asyncio
async def test_case_09_to_14_password_reset_flow(audit_client: AsyncClient):
    test_uid = uuid4()
    test_email = f"pytest_reset_{uuid4().hex[:8]}@example.com"
    pwd_hash = hash_password("InitialPass@2026")
    dept_id = "dccbb2bf-8de1-4945-bf70-f11ad2f7682a"
    inst_id = "39a363c8-635a-4a0b-b9c0-d0c51529774f"
    async with get_pg_connection() as conn:
        await conn.execute(
            """
            INSERT INTO users (id, email, password_hash, name, role, status, institution_id, department_id)
            VALUES ($1, $2, $3, 'Reset User', 'STUDENT', 'ACTIVE', $4::uuid, $5::uuid)
            """,
            test_uid, test_email, pwd_hash, inst_id, dept_id
        )
    try:
        # Case 9: Valid password reset link
        ConsoleEmailProvider.outbox.clear()
        res9 = await audit_client.post(
            "/api/v1/auth/forgot-password",
            json={"identifier": test_email},
        )
        assert res9.status_code == 200

        user_after = await UserRepository.get_by_id(test_uid)
        assert user_after["reset_password_token_hash"] is not None

        raw_token = None
        for m in ConsoleEmailProvider.outbox:
            if m.to == test_email and "token=" in m.body:
                import re
                match = re.search(r"token=([A-Za-z0-9_-]+)", m.body)
                if match:
                    raw_token = match.group(1)
                    break
        assert raw_token is not None

        # Case 10: Expired reset link
        past_time = datetime.now(timezone.utc) - timedelta(minutes=30)
        async with get_pg_connection() as conn:
            await conn.execute(
                "UPDATE users SET reset_password_token_expires_at = $1 WHERE id = $2",
                past_time, test_uid
            )
        res10 = await audit_client.post(
            "/api/v1/auth/reset-password",
            json={
                "token": raw_token,
                "password": "NewSecretPassword@2026",
                "confirmPassword": "NewSecretPassword@2026",
            },
        )
        assert res10.status_code == 400

        # Case 12: Invalid reset token
        res12 = await audit_client.post(
            "/api/v1/auth/reset-password",
            json={
                "token": "bogus_token_xyz_1234567890",
                "password": "NewSecretPassword@2026",
                "confirmPassword": "NewSecretPassword@2026",
            },
        )
        assert res12.status_code == 400

        # Setup for Case 13 & 14
        future_time = datetime.now(timezone.utc) + timedelta(minutes=15)
        fresh_token = "pytest_valid_token_" + uuid4().hex
        fresh_hash = hash_token(fresh_token)
        await UserRepository.set_password_reset_token(test_uid, fresh_hash, future_time)

        # Log in first to get an active session
        login_init = await audit_client.post(
            "/api/v1/auth/login",
            json={"identifier": test_email, "password": "InitialPass@2026"},
        )
        assert login_init.status_code == 200
        pre_refresh_token = login_init.cookies.get(settings.REFRESH_COOKIE_NAME)
        assert pre_refresh_token is not None

        # Case 13: Password reset followed by successful login
        new_password = "UpdatedPass@2026!"
        res13 = await audit_client.post(
            "/api/v1/auth/reset-password",
            json={
                "token": fresh_token,
                "password": new_password,
                "confirmPassword": new_password,
            },
        )
        assert res13.status_code == 200

        login_new = await audit_client.post(
            "/api/v1/auth/login",
            json={"identifier": test_email, "password": new_password},
        )
        assert login_new.status_code == 200

        login_old = await audit_client.post(
            "/api/v1/auth/login",
            json={"identifier": test_email, "password": "InitialPass@2026"},
        )
        assert login_old.status_code == 401

        # Case 11: Already-used reset link
        res11 = await audit_client.post(
            "/api/v1/auth/reset-password",
            json={
                "token": fresh_token,
                "password": "AnotherNewPass@2026!",
                "confirmPassword": "AnotherNewPass@2026!",
            },
        )
        assert res11.status_code == 400

        # Case 14: Existing session invalidation
        res14 = await audit_client.post(
            "/api/v1/auth/refresh",
            cookies={settings.REFRESH_COOKIE_NAME: pre_refresh_token},
        )
        assert res14.status_code == 401
    finally:
        async with get_pg_connection() as conn:
            await conn.execute("DELETE FROM users WHERE id = $1", test_uid)
