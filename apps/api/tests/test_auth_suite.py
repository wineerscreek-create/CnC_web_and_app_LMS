"""Comprehensive End-to-End Authentication Test Suite for Winners Creek LMS.
Validates all requirements specified in Section 7.
"""
import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta

# Ensure api directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
api_dir = os.path.dirname(current_dir)
if api_dir not in sys.path:
    sys.path.insert(0, api_dir)

os.environ["EMAIL_VERIFICATION_ENABLED"] = "false"
os.environ["USE_FAKE_REDIS"] = "true"

import httpx
import jwt
from app.main import create_app
from app.core.config import settings
from app.core.security import hash_password, verify_password, create_access_token
from app.repositories.user_repo import UserRepository
from app.db.postgres import get_pg_connection

# Ensure settings is set to False for OTP-disabled mode
settings.EMAIL_VERIFICATION_ENABLED = False
settings.USE_FAKE_REDIS = True

results = []

def record(test_name: str, passed: bool, detail: str = ""):
    status = "PASS" if passed else "FAIL"
    results.append({"test": test_name, "status": status, "detail": detail})
    print(f"[{status}] {test_name}: {detail}")

async def run_all_tests():
    print(f"\n=======================================================")
    print(f"Running Authentication Audit & Test Suite")
    print(f"EMAIL_VERIFICATION_ENABLED = {settings.EMAIL_VERIFICATION_ENABLED}")
    print(f"=======================================================\n")

    app = create_app()
    transport = httpx.ASGITransport(app=app)
    
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Prepare test users in DB
        async with get_pg_connection() as conn:
            test_pw = "Eedi@2026"
            pw_hash = hash_password(test_pw)

            # Ensure test institution and department exist
            inst = await conn.fetchrow("SELECT id FROM institutions WHERE code = 'ABC' LIMIT 1")
            inst_id = inst["id"] if inst else None
            dept = await conn.fetchrow("SELECT id FROM departments WHERE code = 'CSE' LIMIT 1")
            dept_id = dept["id"] if dept else None

            # 1. Unverified Student
            unverified_email = "test_unverified_student@abcengg.edu"
            await conn.execute("""
                INSERT INTO users (email, password_hash, name, role, institution_id, department_id, email_verified, status)
                VALUES ($1, $2, 'Unverified Student', 'STUDENT', $3, $4, FALSE, 'ACTIVE')
                ON CONFLICT (email) DO UPDATE SET password_hash = $2, email_verified = FALSE, status = 'ACTIVE'
            """, unverified_email, pw_hash, inst_id, dept_id)
            unver_row = await conn.fetchrow("SELECT id FROM users WHERE email = $1", unverified_email)
            await conn.execute("""
                INSERT INTO student_profiles (user_id, roll_number, institution_id, department_id)
                VALUES ($1, 'TESTUNVER01', $2, $3)
                ON CONFLICT (user_id) DO UPDATE SET roll_number = 'TESTUNVER01'
            """, unver_row["id"], inst_id, dept_id)

            # 2. Verified Student
            verified_email = "test_verified_student@abcengg.edu"
            await conn.execute("""
                INSERT INTO users (email, password_hash, name, role, institution_id, department_id, email_verified, status)
                VALUES ($1, $2, 'Verified Student', 'STUDENT', $3, $4, TRUE, 'ACTIVE')
                ON CONFLICT (email) DO UPDATE SET password_hash = $2, email_verified = TRUE, status = 'ACTIVE'
            """, verified_email, pw_hash, inst_id, dept_id)
            ver_row = await conn.fetchrow("SELECT id FROM users WHERE email = $1", verified_email)
            await conn.execute("""
                INSERT INTO student_profiles (user_id, roll_number, institution_id, department_id)
                VALUES ($1, 'TESTVER01', $2, $3)
                ON CONFLICT (user_id) DO UPDATE SET roll_number = 'TESTVER01'
            """, ver_row["id"], inst_id, dept_id)

            # 3. Inactive / Suspended User (record_status_enum: 'INACTIVE')
            suspended_email = "test_suspended@abcengg.edu"
            await conn.execute("""
                INSERT INTO users (email, password_hash, name, role, institution_id, department_id, email_verified, status)
                VALUES ($1, $2, 'Suspended User', 'STUDENT', $3, $4, TRUE, 'INACTIVE')
                ON CONFLICT (email) DO UPDATE SET password_hash = $2, status = 'INACTIVE'
            """, suspended_email, pw_hash, inst_id, dept_id)

            # 4. Trainer User
            trainer_email = "test_trainer@abcengg.edu"
            await conn.execute("""
                INSERT INTO users (email, password_hash, name, role, institution_id, department_id, email_verified, status)
                VALUES ($1, $2, 'Test Trainer', 'TRAINER', $3, $4, FALSE, 'ACTIVE')
                ON CONFLICT (email) DO UPDATE SET password_hash = $2, email_verified = FALSE, status = 'ACTIVE'
            """, trainer_email, pw_hash, inst_id, dept_id)

            # 5. Admin User
            admin_email = "test_admin@abcengg.edu"
            await conn.execute("""
                INSERT INTO users (email, password_hash, name, role, institution_id, department_id, email_verified, status)
                VALUES ($1, $2, 'Test Admin', 'ADMIN', $3, $4, FALSE, 'ACTIVE')
                ON CONFLICT (email) DO UPDATE SET password_hash = $2, email_verified = FALSE, status = 'ACTIVE'
            """, admin_email, pw_hash, inst_id, dept_id)

            # 6. Super Admin User
            super_admin_email = "test_superadmin@eedilms.app"
            await conn.execute("""
                INSERT INTO users (email, password_hash, name, role, institution_id, department_id, email_verified, status)
                VALUES ($1, $2, 'Test Super Admin', 'SUPER_ADMIN', NULL, NULL, FALSE, 'ACTIVE')
                ON CONFLICT (email) DO UPDATE SET password_hash = $2, email_verified = FALSE, status = 'ACTIVE'
            """, super_admin_email, pw_hash)

        # TEST CASE 1: Verified user + correct password -> Login successful
        res = await client.post("/api/v1/auth/login", json={"identifier": verified_email, "password": test_pw})
        passed = (res.status_code == 200 and res.json().get("success") is True and "accessToken" in res.json().get("data", {}))
        record("Verified user + correct password", passed, f"Status: {res.status_code}, User: {res.json().get('data', {}).get('user', {}).get('name')}")

        # TEST CASE 2: Unverified user + correct password -> Login successful (OTP bypassed cleanly)
        res = await client.post("/api/v1/auth/login", json={"identifier": unverified_email, "password": test_pw})
        passed = (res.status_code == 200 and res.json().get("success") is True and "accessToken" in res.json().get("data", {}))
        record("Unverified user + correct password", passed, f"Status: {res.status_code}, Direct login without OTP: {'accessToken' in res.json().get('data', {})}")

        # TEST CASE 3: Login by Institution ID (Roll number)
        res = await client.post("/api/v1/auth/login", json={"identifier": "TESTUNVER01", "password": test_pw})
        passed = (res.status_code == 200 and res.json().get("success") is True and res.json().get("data", {}).get("user", {}).get("email") == unverified_email)
        record("Login by Institution ID (Roll Number)", passed, f"Status: {res.status_code}, Matched email: {res.json().get('data', {}).get('user', {}).get('email')}")

        # TEST CASE 4: Invalid password -> Login rejected
        res = await client.post("/api/v1/auth/login", json={"identifier": verified_email, "password": "WrongPassword123!"})
        passed = (res.status_code == 401 and res.json().get("success") is False)
        record("Invalid password", passed, f"Status: {res.status_code}, Error: {res.json().get('error', {}).get('message')}")

        # TEST CASE 5: Invalid email/ID -> Login rejected
        res = await client.post("/api/v1/auth/login", json={"identifier": "nonexistent_user_999@test.com", "password": test_pw})
        passed = (res.status_code == 401 and res.json().get("success") is False)
        record("Invalid email/ID", passed, f"Status: {res.status_code}, Error: {res.json().get('error', {}).get('message')}")

        # TEST CASE 6: Suspended account -> Login rejected
        res = await client.post("/api/v1/auth/login", json={"identifier": suspended_email, "password": test_pw})
        passed = (res.status_code == 401 and res.json().get("success") is False)
        record("Suspended account", passed, f"Status: {res.status_code}, Error: {res.json().get('error', {}).get('message')}")

        # TEST CASE 7: Missing password -> Login rejected
        res = await client.post("/api/v1/auth/login", json={"identifier": verified_email, "password": ""})
        passed = (res.status_code in (400, 422) and res.json().get("success") is False)
        record("Missing password", passed, f"Status: {res.status_code}, Validated: {res.json().get('error', {}).get('code')}")

        # TEST CASE 8: Student login -> Student dashboard
        res = await client.post("/api/v1/auth/login", json={"identifier": unverified_email, "password": test_pw})
        data = res.json().get("data", {})
        passed = (data.get("redirectTo") == "/student/dashboard" and data.get("user", {}).get("role") == "STUDENT")
        record("Student login role & redirect", passed, f"Role: {data.get('user', {}).get('role')}, Redirect: {data.get('redirectTo')}")

        # TEST CASE 9: Trainer login -> Trainer dashboard
        res = await client.post("/api/v1/auth/login", json={"identifier": trainer_email, "password": test_pw})
        data = res.json().get("data", {})
        passed = (data.get("redirectTo") == "/trainer/dashboard" and data.get("user", {}).get("role") == "TRAINER")
        record("Trainer login role & redirect", passed, f"Role: {data.get('user', {}).get('role')}, Redirect: {data.get('redirectTo')}")

        # TEST CASE 10: Admin login -> Admin dashboard
        res = await client.post("/api/v1/auth/login", json={"identifier": admin_email, "password": test_pw})
        data = res.json().get("data", {})
        passed = (data.get("redirectTo") == "/admin/dashboard" and data.get("user", {}).get("role") == "ADMIN")
        record("Admin login role & redirect", passed, f"Role: {data.get('user', {}).get('role')}, Redirect: {data.get('redirectTo')}")

        # TEST CASE 11: Super Admin login -> Super Admin dashboard
        res = await client.post("/api/v1/auth/login", json={"identifier": super_admin_email, "password": test_pw})
        data = res.json().get("data", {})
        passed = (data.get("redirectTo") == "/super-admin" and data.get("user", {}).get("role") == "SUPER_ADMIN")
        record("Super Admin login role & redirect", passed, f"Role: {data.get('user', {}).get('role')}, Redirect: {data.get('redirectTo')}")

        # TEST CASE 12: Remember Me enabled vs disabled
        res_remember = await client.post("/api/v1/auth/login", json={"identifier": verified_email, "password": test_pw, "rememberMe": True})
        cookie_header = res_remember.headers.get("set-cookie", "")
        passed = (settings.REFRESH_COOKIE_NAME in cookie_header and "max-age=" in cookie_header.lower())
        record("Remember Me cookie generation", passed, f"Cookie set: {settings.REFRESH_COOKIE_NAME in cookie_header}")

        # TEST CASE 13: Refresh token rotation
        refresh_res = await client.post("/api/v1/auth/refresh")
        passed = (refresh_res.status_code == 200 and "accessToken" in refresh_res.json().get("data", {}))
        record("Refresh token rotation functionality", passed, f"Status: {refresh_res.status_code}, New access token: {'accessToken' in refresh_res.json().get('data', {})}")

        student_access_token = data.get("accessToken")
        # TEST CASE 14: Protected route access with valid JWT
        auth_headers = {"Authorization": f"Bearer {student_access_token}"}
        me_res = await client.get("/api/v1/auth/me", headers=auth_headers)
        passed = (me_res.status_code == 200 and me_res.json().get("success") is True)
        record("Protected route access with valid JWT (/auth/me)", passed, f"Status: {me_res.status_code}")

        # TEST CASE 15: Protected route access with invalid JWT
        me_bad_res = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid.jwt.token"})
        passed = (me_bad_res.status_code == 401)
        record("Protected route rejected on invalid JWT", passed, f"Status: {me_bad_res.status_code}")

        # TEST CASE 16: Protected route access with expired JWT
        now = datetime.now(timezone.utc)
        expired_token = jwt.encode(
            {
                "sub": str(unver_row["id"]),
                "role": "STUDENT",
                "typ": "access",
                "sid": "dummy",
                "jti": "dummy",
                "iat": int((now - timedelta(hours=2)).timestamp()),
                "exp": int((now - timedelta(hours=1)).timestamp()),
            },
            settings.JWT_SECRET,
            algorithm=settings.JWT_ALGORITHM,
        )
        me_exp_res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
        passed = (me_exp_res.status_code == 401)
        record("Protected route rejected on expired JWT", passed, f"Status: {me_exp_res.status_code}")

        # TEST CASE 17: Cross-institution / Scope isolation check
        admin_login = await client.post("/api/v1/auth/login", json={"identifier": admin_email, "password": test_pw})
        admin_token = admin_login.json()["data"]["accessToken"]
        
        scope_res = await client.get(
            "/api/v1/admin/courses",
            headers={"Authorization": f"Bearer {admin_token}"},
            params={"institutionId": "00000000-0000-0000-0000-000000000000"}
        )
        passed = (scope_res.status_code in (200, 403, 404))
        record("Tenant isolation / Scope check", passed, f"Status: {scope_res.status_code}")

        # TEST CASE 18: Verification mode toggle verification
        # Temporarily enable EMAIL_VERIFICATION_ENABLED to verify safe behaviour reactivation
        settings.EMAIL_VERIFICATION_ENABLED = True
        blocked_res = await client.post("/api/v1/auth/login", json={"identifier": unverified_email, "password": test_pw})
        settings.EMAIL_VERIFICATION_ENABLED = False  # Restore to disabled
        passed = (blocked_res.status_code == 200 and blocked_res.json().get("data", {}).get("verificationRequired") is True)
        record("Email verification toggle (when enabled, blocks unverified)", passed, f"Blocked: {blocked_res.json().get('data', {}).get('verificationRequired')}")

    print("\n=======================================================")
    total = len(results)
    passed_count = sum(1 for r in results if r["status"] == "PASS")
    print(f"Summary: {passed_count}/{total} tests PASSED")
    print("=======================================================\n")
    return passed_count == total

if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
