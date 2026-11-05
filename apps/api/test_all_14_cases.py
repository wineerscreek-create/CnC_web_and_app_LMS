"""14 Required Production Audit Test Cases for Winners Creek LMS."""
from __future__ import annotations

import asyncio
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from uuid import uuid4

# Ensure PostgreSQL and local test config are active
os.environ["USE_POSTGRES"] = "true"
os.environ["USE_FAKE_REDIS"] = "true"
os.environ["EMAIL_VERIFICATION_ENABLED"] = "false"
os.environ["EMAIL_PROVIDER"] = "console"

from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.core.redis_client import get_redis
from app.core.security import hash_password, hash_token, verify_password
from app.db.postgres import connect_to_postgres, get_pg_connection, close_postgres
from app.main import create_app
from app.repositories.user_repo import UserRepository
from app.services.email_service import ConsoleEmailProvider


async def run_audit_suite():
    print("=" * 70)
    print("WINNERS CREEK LMS - AUTHENTICATION & RECOVERY AUDIT (14 CASES)")
    print("=" * 70)

    # Initialize DB connections
    await connect_to_postgres()
    redis = get_redis()
    app = create_app()

    results = []

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:

        # -------------------------------------------------------------
        # Test Case 1: Correct email + correct password
        # -------------------------------------------------------------
        print("\n[Case 1] Correct email + correct password")
        res1 = await client.post(
            "/api/v1/auth/login",
            json={"identifier": "sandeep.27cs@aryacollege.in", "password": "Eedi@2026"},
        )
        passed1 = res1.status_code == 200 and "accessToken" in res1.json().get("data", {})
        results.append(("Case 1: Correct email + correct password", passed1, f"Status {res1.status_code}"))
        print(f"  Result: {'PASS' if passed1 else 'FAIL'} (Status: {res1.status_code})")

        # -------------------------------------------------------------
        # Test Case 2: Correct institution ID + correct password
        # -------------------------------------------------------------
        print("\n[Case 2] Correct institution ID (Roll No) + correct password")
        res2 = await client.post(
            "/api/v1/auth/login",
            json={"identifier": "23EARCS142", "password": "Eedi@2026"},
        )
        passed2 = res2.status_code == 200 and "accessToken" in res2.json().get("data", {})
        results.append(("Case 2: Correct institution ID + correct password", passed2, f"Status {res2.status_code}"))
        print(f"  Result: {'PASS' if passed2 else 'FAIL'} (Status: {res2.status_code})")

        # -------------------------------------------------------------
        # Test Case 3: Incorrect password
        # -------------------------------------------------------------
        print("\n[Case 3] Incorrect password")
        res3 = await client.post(
            "/api/v1/auth/login",
            json={"identifier": "sandeep.27cs@aryacollege.in", "password": "WrongPassword!2026"},
        )
        passed3 = res3.status_code == 401
        results.append(("Case 3: Incorrect password", passed3, f"Status {res3.status_code}"))
        print(f"  Result: {'PASS' if passed3 else 'FAIL'} (Status: {res3.status_code})")

        # -------------------------------------------------------------
        # Test Case 4: Non-existent account
        # -------------------------------------------------------------
        print("\n[Case 4] Non-existent account")
        res4 = await client.post(
            "/api/v1/auth/login",
            json={"identifier": "nonexistent.user.audit@aryacollege.in", "password": "Password@2026"},
        )
        passed4 = res4.status_code == 401
        results.append(("Case 4: Non-existent account", passed4, f"Status {res4.status_code}"))
        print(f"  Result: {'PASS' if passed4 else 'FAIL'} (Status: {res4.status_code})")

        # -------------------------------------------------------------
        # Test Case 5: Active account with unverified email
        # -------------------------------------------------------------
        print("\n[Case 5] Active account with unverified email (email_verified=false)")
        # SANDEEP is ACTIVE with email_verified=False
        sandeep_user = await UserRepository.get_by_email("sandeep.27cs@aryacollege.in")
        assert sandeep_user is not None
        passed5 = (
            sandeep_user["email_verified"] is False
            and sandeep_user["status"] == "ACTIVE"
            and res1.status_code == 200
        )
        results.append(("Case 5: Active account with unverified email logs in directly", passed5, f"Verified=False, Login={res1.status_code}"))
        print(f"  Result: {'PASS' if passed5 else 'FAIL'} (email_verified={sandeep_user['email_verified']}, status={sandeep_user['status']})")

        # -------------------------------------------------------------
        # Test Case 6: Disabled account (status = INACTIVE)
        # -------------------------------------------------------------
        print("\n[Case 6] Disabled / inactive account")
        test_uid = uuid4()
        test_email = f"audit_inactive_{uuid4().hex[:8]}@example.com"
        test_pwd_hash = hash_password("TestPassword@2026")
        async with get_pg_connection() as conn:
            await conn.execute(
                """
                INSERT INTO users (id, email, password_hash, name, role, status)
                VALUES ($1, $2, $3, 'Inactive User', 'STUDENT', 'INACTIVE')
                """,
                test_uid, test_email, test_pwd_hash
            )
        try:
            res6 = await client.post(
                "/api/v1/auth/login",
                json={"identifier": test_email, "password": "TestPassword@2026"},
            )
            passed6 = res6.status_code == 401 and "not active" in res6.text.lower()
            results.append(("Case 6: Disabled account rejected", passed6, f"Status {res6.status_code}"))
            print(f"  Result: {'PASS' if passed6 else 'FAIL'} (Status: {res6.status_code})")
        finally:
            async with get_pg_connection() as conn:
                await conn.execute("DELETE FROM users WHERE id = $1", test_uid)

        # -------------------------------------------------------------
        # Test Case 7: Student account with missing student profile
        # -------------------------------------------------------------
        print("\n[Case 7] Student account with missing student profile")
        test_uid7 = uuid4()
        test_email7 = f"audit_noprofile_{uuid4().hex[:8]}@example.com"
        dept_id = "dccbb2bf-8de1-4945-bf70-f11ad2f7682a"
        inst_id = "39a363c8-635a-4a0b-b9c0-d0c51529774f"
        async with get_pg_connection() as conn:
            await conn.execute(
                """
                INSERT INTO users (id, email, password_hash, name, role, status, institution_id, department_id)
                VALUES ($1, $2, $3, 'No Profile Student', 'STUDENT', 'ACTIVE', $4::uuid, $5::uuid)
                """,
                test_uid7, test_email7, test_pwd_hash, inst_id, dept_id
            )
        try:
            res7 = await client.post(
                "/api/v1/auth/login",
                json={"identifier": test_email7, "password": "TestPassword@2026"},
            )
            passed7 = res7.status_code == 200 and "accessToken" in res7.json().get("data", {})
            results.append(("Case 7: Student without student_profile logs in cleanly", passed7, f"Status {res7.status_code}"))
            print(f"  Result: {'PASS' if passed7 else 'FAIL'} (Status: {res7.status_code})")
        finally:
            async with get_pg_connection() as conn:
                await conn.execute("DELETE FROM users WHERE id = $1", test_uid7)

        # -------------------------------------------------------------
        # Test Case 8: Redis unavailable (graceful 503 instead of 500)
        # -------------------------------------------------------------
        print("\n[Case 8] Redis unavailable returns 503 Service Unavailable")
        from unittest.mock import patch
        import redis.exceptions as red_exc

        async def broken_setex(*args, **kwargs):
            raise red_exc.ConnectionError("Redis connection refused")

        redis_client = get_redis()
        with patch.object(redis_client, "setex", side_effect=broken_setex):
            res8 = await client.post(
                "/api/v1/auth/login",
                json={"identifier": "sandeep.27cs@aryacollege.in", "password": "Eedi@2026"},
            )
            passed8 = res8.status_code == 503 and res8.json().get("error", {}).get("code") == "SERVICE_UNAVAILABLE"
            results.append(("Case 8: Redis unavailable returns 503", passed8, f"Status {res8.status_code}, Code={res8.json().get('error', {}).get('code')}"))
            print(f"  Result: {'PASS' if passed8 else 'FAIL'} (Status: {res8.status_code}, Code: {res8.json().get('error', {}).get('code')})")

        # -------------------------------------------------------------
        # Test Case 9: Valid password reset link request and token generation
        # -------------------------------------------------------------
        print("\n[Case 9] Valid password reset link (POST /forgot-password)")
        test_uid9 = uuid4()
        test_email9 = f"audit_reset_{uuid4().hex[:8]}@example.com"
        async with get_pg_connection() as conn:
            await conn.execute(
                """
                INSERT INTO users (id, email, password_hash, name, role, status, institution_id, department_id)
                VALUES ($1, $2, $3, 'Reset Test User', 'STUDENT', 'ACTIVE', '39a363c8-635a-4a0b-b9c0-d0c51529774f'::uuid, 'dccbb2bf-8de1-4945-bf70-f11ad2f7682a'::uuid)
                """,
                test_uid9, test_email9, test_pwd_hash
            )
        try:
            ConsoleEmailProvider.outbox.clear()
            res9 = await client.post(
                "/api/v1/auth/forgot-password",
                json={"identifier": test_email9},
            )
            passed9 = res9.status_code == 200 and res9.json().get("success") is True
            # Verify DB token hash was set
            user_after_fp = await UserRepository.get_by_id(test_uid9)
            has_token_hash = bool(user_after_fp.get("reset_password_token_hash"))
            # Verify outbox received email
            has_email = any(m.to == test_email9 and "reset-password?token=" in m.body for m in ConsoleEmailProvider.outbox)
            passed9 = passed9 and has_token_hash and has_email
            results.append(("Case 9: Valid password reset link generation", passed9, f"Status {res9.status_code}, DB Token={has_token_hash}, Email={has_email}"))
            print(f"  Result: {'PASS' if passed9 else 'FAIL'} (Status: {res9.status_code}, Token in DB: {has_token_hash}, Email sent: {has_email})")

            # Extract the raw token from the email body
            raw_token = None
            for m in ConsoleEmailProvider.outbox:
                if m.to == test_email9:
                    import re
                    match = re.search(r"token=([A-Za-z0-9_-]+)", m.body)
                    if match:
                        raw_token = match.group(1)
                        break
            assert raw_token is not None, "Raw reset token could not be parsed from email"

            # -------------------------------------------------------------
            # Test Case 10: Expired reset link
            # -------------------------------------------------------------
            print("\n[Case 10] Expired reset link rejected")
            # Set the expiry time in DB to 30 minutes in the past
            past_time = datetime.now(timezone.utc) - timedelta(minutes=30)
            async with get_pg_connection() as conn:
                await conn.execute(
                    "UPDATE users SET reset_password_token_expires_at = $1 WHERE id = $2",
                    past_time, test_uid9
                )
            res10 = await client.post(
                "/api/v1/auth/reset-password",
                json={
                    "token": raw_token,
                    "password": "NewSecretPassword@2026",
                    "confirmPassword": "NewSecretPassword@2026",
                },
            )
            passed10 = res10.status_code == 400 and "expired" in res10.text.lower()
            results.append(("Case 10: Expired reset link rejected", passed10, f"Status {res10.status_code}"))
            print(f"  Result: {'PASS' if passed10 else 'FAIL'} (Status: {res10.status_code})")

            # -------------------------------------------------------------
            # Test Case 12: Invalid reset token
            # -------------------------------------------------------------
            print("\n[Case 12] Invalid reset token")
            res12 = await client.post(
                "/api/v1/auth/reset-password",
                json={
                    "token": "completely_bogus_token_1234567890abcdef",
                    "password": "NewSecretPassword@2026",
                    "confirmPassword": "NewSecretPassword@2026",
                },
            )
            passed12 = res12.status_code == 400
            results.append(("Case 12: Invalid reset token rejected", passed12, f"Status {res12.status_code}"))
            print(f"  Result: {'PASS' if passed12 else 'FAIL'} (Status: {res12.status_code})")

            # -------------------------------------------------------------
            # Test Case 13: Password reset followed by successful login
            # -------------------------------------------------------------
            print("\n[Case 13] Password reset followed by successful login")
            # Re-issue a fresh valid token
            future_time = datetime.now(timezone.utc) + timedelta(minutes=15)
            fresh_token = "valid_test_token_" + uuid4().hex
            fresh_hash = hash_token(fresh_token)
            await UserRepository.set_password_reset_token(test_uid9, fresh_hash, future_time)

            # First establish a session to test Case 14 later
            login_before = await client.post(
                "/api/v1/auth/login",
                json={"identifier": test_email9, "password": "TestPassword@2026"},
            )
            refresh_token_before = login_before.cookies.get(settings.REFRESH_COOKIE_NAME)
            assert refresh_token_before, f"Refresh token cookie missing: {login_before.cookies}"

            # Perform the password reset
            new_pass = "BrandNewPass@2026!"
            res13 = await client.post(
                "/api/v1/auth/reset-password",
                json={
                    "token": fresh_token,
                    "password": new_pass,
                    "confirmPassword": new_pass,
                },
            )
            passed13_reset = res13.status_code == 200 and res13.json().get("success") is True

            # Verify login with NEW password succeeds
            login_new = await client.post(
                "/api/v1/auth/login",
                json={"identifier": test_email9, "password": new_pass},
            )
            passed13_new_login = login_new.status_code == 200

            # Verify login with OLD password fails
            login_old = await client.post(
                "/api/v1/auth/login",
                json={"identifier": test_email9, "password": "TestPassword@2026"},
            )
            passed13_old_fail = login_old.status_code == 401

            passed13 = passed13_reset and passed13_new_login and passed13_old_fail
            results.append(("Case 13: Password reset & login with new password", passed13, f"Reset={res13.status_code}, NewLogin={login_new.status_code}, OldLogin={login_old.status_code}"))
            print(f"  Result: {'PASS' if passed13 else 'FAIL'} (Reset: {res13.status_code}, New Login: {login_new.status_code}, Old Login: {login_old.status_code})")

            # -------------------------------------------------------------
            # Test Case 11: Already-used reset link
            # -------------------------------------------------------------
            print("\n[Case 11] Already-used reset link cannot be reused")
            res11 = await client.post(
                "/api/v1/auth/reset-password",
                json={
                    "token": fresh_token,
                    "password": "AnotherNewPass@2026!",
                    "confirmPassword": "AnotherNewPass@2026!",
                },
            )
            passed11 = res11.status_code == 400 and "invalid or has expired" in res11.text.lower()
            results.append(("Case 11: Already-used reset link rejected", passed11, f"Status {res11.status_code}"))
            print(f"  Result: {'PASS' if passed11 else 'FAIL'} (Status: {res11.status_code})")

            # -------------------------------------------------------------
            # Test Case 14: Existing session invalidation after password reset
            # -------------------------------------------------------------
            print("\n[Case 14] Existing session invalidation after password reset")
            res14 = await client.post(
                "/api/v1/auth/refresh",
                cookies={settings.REFRESH_COOKIE_NAME: refresh_token_before},
            )
            passed14 = res14.status_code == 401
            results.append(("Case 14: Pre-reset session tokens invalidated", passed14, f"Status {res14.status_code}"))
            print(f"  Result: {'PASS' if passed14 else 'FAIL'} (Status: {res14.status_code})")

        finally:
            async with get_pg_connection() as conn:
                await conn.execute("DELETE FROM users WHERE id = $1", test_uid9)

    await close_postgres()

    # -------------------------------------------------------------
    # Summary Table
    # -------------------------------------------------------------
    print("\n" + "=" * 70)
    print("TEST SUITE SUMMARY - 14 TEST CASES")
    print("=" * 70)
    all_passed = True
    for name, status, details in results:
        status_str = "PASS" if status else "FAIL"
        if not status:
            all_passed = False
        print(f"[{status_str:4s}] {name:50s} | {details}")

    print("=" * 70)
    if all_passed:
        print("ALL 14 TEST CASES PASSED SUCCESSFULLY!")
    else:
        print("SOME TESTS FAILED! CHECK LOGS ABOVE.")
    print("=" * 70)
    return all_passed


if __name__ == "__main__":
    success = asyncio.run(run_audit_suite())
    sys.exit(0 if success else 1)
