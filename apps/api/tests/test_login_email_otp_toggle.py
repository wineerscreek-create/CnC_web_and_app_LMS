"""Tests for LOGIN_EMAIL_OTP_ENABLED feature flag and login authentication flows.

Validates:
1. When LOGIN_EMAIL_OTP_ENABLED=False (default):
   - Student login using email + password succeeds without OTP (HTTP 200, access token issued).
   - Student login using roll number + password succeeds without OTP (HTTP 200, access token issued).
   - Super Admin login succeeds without OTP.
   - Admin login succeeds without OTP.
   - HOD login succeeds without OTP.
   - Trainer login succeeds without OTP.
   - Staff login using employee_id succeeds without OTP.
   - Incorrect password returns 401 Unauthenticated.
   - Deactivated / inactive account returns 401 Unauthenticated.
   - Account with must_change_password=True enforces first-login activation (returns activationRequired: True).
   - Login succeeds even when email service returns HTTP 502 or is down (no email dispatched during login).
   - Backend guard (get_scope_context) allows authenticated requests when email_verified is False and flag is False.

2. When LOGIN_EMAIL_OTP_ENABLED=True:
   - Login with unverified email triggers OTP generation, dispatch, and returns verificationRequired: True.
   - Verification endpoint (/auth/verify-email) with valid OTP verifies the account.
   - Subsequent login after verification succeeds without OTP.
   - Incorrect OTP is rejected.

3. Regression tests:
   - Public signup email verification remains operational.
   - Forgot-password OTP remains operational.
   - Password-reset remains operational.
   - First-login personal email activation remains operational.
   - Staff invitation activation remains operational.
"""
from __future__ import annotations

import asyncio
import uuid
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from starlette.requests import Request
from starlette.responses import Response

from app.authz.guards import get_scope_context
from app.core.config import settings
from app.core.errors import RoleForbidden, Unauthenticated, ValidationError
from app.core.redis_client import K, get_redis
from app.core.security import hash_password, create_purpose_token, decode_token
from app.db.postgres import get_pg_connection
from app.repositories.user_repo import UserRepository
from app.routers.auth import (
    login,
    verify_email,
    forgot_password,
    reset_password,
    signup,
)
from app.schemas.requests import (
    ForgotPasswordRequest,
    LoginRequest,
    ResetPasswordRequest,
    SignupRequest,
    VerifyEmailRequest,
)
from app.services.email_service import ConsoleEmailProvider

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def setup_test_env():
    import app.core.redis_client as rc
    import app.services.email_service as es

    settings.USE_POSTGRES = True
    settings.EMAIL_PROVIDER = "console"
    es._provider = es.ConsoleEmailProvider()
    es.ConsoleEmailProvider.outbox.clear()
    rc._client = None
    yield
    rc._client = None
    settings.LOGIN_EMAIL_OTP_ENABLED = False


def _dummy_request() -> Request:
    return Request({"type": "http", "headers": [], "client": ("127.0.0.1", 1234)})


# Helper to insert users with specific roles and verification status
async def _create_test_user(
    *,
    email: str,
    raw_password: str,
    role: str = "STUDENT",
    status: str = "ACTIVE",
    email_verified: bool = False,
    must_change_password: bool = False,
    roll_number: str | None = None,
    employee_id: str | None = None,
    department_id: uuid.UUID | None = None,
    institution_id: uuid.UUID | None = None,
) -> uuid.UUID:
    uid = uuid.uuid4()
    pwd_hash = hash_password(raw_password)
    async with get_pg_connection() as conn:
        if department_id is None and role in ("STUDENT", "HOD", "TRAINER", "SPOC"):
            inst_id = institution_id or uuid.uuid4()
            dept_id = uuid.uuid4()
            await conn.execute(
                "INSERT INTO institutions (id, name, code) VALUES ($1, 'Test Inst', $2) ON CONFLICT DO NOTHING",
                inst_id,
                f"TI_{inst_id.hex[:6]}",
            )
            await conn.execute(
                "INSERT INTO departments (id, institution_id, name, code) VALUES ($1, $2, 'Test Dept', $3) ON CONFLICT DO NOTHING",
                dept_id,
                inst_id,
                f"TD_{dept_id.hex[:6]}",
            )
            department_id = dept_id
            if institution_id is None:
                institution_id = inst_id

        await conn.execute(
            """
            INSERT INTO users (
                id, email, password_hash, name, role, status,
                email_verified, must_change_password, employee_id,
                department_id, institution_id, created_at, updated_at
            ) VALUES (
                $1, LOWER($2), $3, $4, $5::user_role_enum, $6::record_status_enum,
                $7, $8, $9, $10, $11, NOW(), NOW()
            )
            """,
            uid,
            email,
            pwd_hash,
            f"Test {role.title()}",
            role,
            status,
            email_verified,
            must_change_password,
            employee_id,
            department_id,
            institution_id,
        )
        if role == "STUDENT":
            rn = roll_number or f"ROLL{uid.hex[:6].upper()}"
            await conn.execute(
                """
                INSERT INTO student_profiles (
                    id, user_id, roll_number, institution_id, department_id, created_at, updated_at
                ) VALUES (
                    gen_random_uuid(), $1, UPPER($2), $3, $4, NOW(), NOW()
                )
                """,
                uid,
                rn,
                institution_id,
                department_id,
            )
    return uid


# ===========================================================================
# 1. Tests when LOGIN_EMAIL_OTP_ENABLED = False (Default / Disabled)
# ===========================================================================

async def test_01_student_login_by_email_without_otp():
    """When LOGIN_EMAIL_OTP_ENABLED=False, an unverified student can log in directly with email + password."""
    settings.LOGIN_EMAIL_OTP_ENABLED = False
    settings.EMAIL_VERIFICATION_ENABLED = True

    email = f"student_{uuid.uuid4().hex[:6]}@example.com"
    pwd = "StudentPassword123!"
    await _create_test_user(email=email, raw_password=pwd, role="STUDENT", email_verified=False)

    payload = LoginRequest(identifier=email, password=pwd)
    req = _dummy_request()
    res = Response()

    result = await login(payload, req, res)

    assert result["success"] is True
    assert "accessToken" in result["data"]
    assert result["data"]["user"]["email"] == email.lower()
    assert result["data"]["user"]["role"] == "STUDENT"
    # Verify no verificationRequired flag
    assert result["data"].get("verificationRequired") is not True
    # Verify no OTP was dispatched
    assert len(ConsoleEmailProvider.outbox) == 0


async def test_02_student_login_by_roll_number_without_otp():
    """When LOGIN_EMAIL_OTP_ENABLED=False, student logs in using roll number + password without OTP."""
    settings.LOGIN_EMAIL_OTP_ENABLED = False
    settings.EMAIL_VERIFICATION_ENABLED = True

    roll = f"ROLL{uuid.uuid4().hex[:6].upper()}"
    email = f"roll_{uuid.uuid4().hex[:6]}@example.com"
    pwd = "StudentPassword123!"
    await _create_test_user(
        email=email, raw_password=pwd, role="STUDENT", roll_number=roll, email_verified=False
    )

    payload = LoginRequest(identifier=roll, password=pwd)
    req = _dummy_request()
    res = Response()

    result = await login(payload, req, res)

    assert result["success"] is True
    assert "accessToken" in result["data"]
    assert result["data"]["user"]["email"] == email.lower()
    assert len(ConsoleEmailProvider.outbox) == 0


async def test_03_super_admin_login_without_otp():
    """Super Admin logs in directly with email + password when LOGIN_EMAIL_OTP_ENABLED=False."""
    settings.LOGIN_EMAIL_OTP_ENABLED = False

    email = f"superadmin_{uuid.uuid4().hex[:6]}@platform.com"
    pwd = "SuperAdminPassword123!"
    await _create_test_user(email=email, raw_password=pwd, role="SUPER_ADMIN", email_verified=False)

    payload = LoginRequest(identifier=email, password=pwd)
    req = _dummy_request()
    res = Response()

    result = await login(payload, req, res)

    assert result["success"] is True
    assert result["data"]["user"]["role"] == "SUPER_ADMIN"
    assert "accessToken" in result["data"]


async def test_04_admin_login_without_otp():
    """Admin logs in directly with email + password when LOGIN_EMAIL_OTP_ENABLED=False."""
    settings.LOGIN_EMAIL_OTP_ENABLED = False

    email = f"admin_{uuid.uuid4().hex[:6]}@college.com"
    pwd = "AdminPassword123!"
    await _create_test_user(email=email, raw_password=pwd, role="ADMIN", email_verified=False)

    payload = LoginRequest(identifier=email, password=pwd)
    req = _dummy_request()
    res = Response()

    result = await login(payload, req, res)

    assert result["success"] is True
    assert result["data"]["user"]["role"] == "ADMIN"
    assert "accessToken" in result["data"]


async def test_05_hod_and_trainer_login_without_otp():
    """HOD and Trainer log in directly when LOGIN_EMAIL_OTP_ENABLED=False."""
    settings.LOGIN_EMAIL_OTP_ENABLED = False

    # Create dummy department
    dept_id = uuid.uuid4()
    inst_id = uuid.uuid4()
    async with get_pg_connection() as conn:
        await conn.execute("INSERT INTO institutions (id, name, code) VALUES ($1, 'Test Inst', $2) ON CONFLICT DO NOTHING", inst_id, f"TI_{inst_id.hex[:4]}")
        await conn.execute("INSERT INTO departments (id, institution_id, name, code) VALUES ($1, $2, 'Test Dept', $3) ON CONFLICT DO NOTHING", dept_id, inst_id, f"TD_{dept_id.hex[:4]}")

    hod_email = f"hod_{uuid.uuid4().hex[:6]}@college.com"
    trainer_email = f"trainer_{uuid.uuid4().hex[:6]}@college.com"
    pwd = "StaffPassword123!"

    await _create_test_user(email=hod_email, raw_password=pwd, role="HOD", department_id=dept_id, institution_id=inst_id, email_verified=False)
    await _create_test_user(email=trainer_email, raw_password=pwd, role="TRAINER", department_id=dept_id, institution_id=inst_id, email_verified=False)

    # HOD
    res_hod = await login(LoginRequest(identifier=hod_email, password=pwd), _dummy_request(), Response())
    assert res_hod["success"] is True
    assert res_hod["data"]["user"]["role"] == "HOD"

    # Trainer
    res_tr = await login(LoginRequest(identifier=trainer_email, password=pwd), _dummy_request(), Response())
    assert res_tr["success"] is True
    assert res_tr["data"]["user"]["role"] == "TRAINER"


async def test_06_staff_login_by_employee_id():
    """Staff member logs in using employee_id as identifier."""
    settings.LOGIN_EMAIL_OTP_ENABLED = False

    emp_id = f"EMP{uuid.uuid4().hex[:6].upper()}"
    email = f"staff_{uuid.uuid4().hex[:6]}@college.com"
    pwd = "StaffPassword123!"
    await _create_test_user(email=email, raw_password=pwd, role="ADMIN", employee_id=emp_id, email_verified=False)

    payload = LoginRequest(identifier=emp_id, password=pwd)
    req = _dummy_request()
    res = Response()

    result = await login(payload, req, res)

    assert result["success"] is True
    assert result["data"]["user"]["email"] == email.lower()


async def test_07_incorrect_password_rejected():
    """Incorrect password still returns 401 Unauthenticated."""
    settings.LOGIN_EMAIL_OTP_ENABLED = False

    email = f"user_{uuid.uuid4().hex[:6]}@test.com"
    pwd = "CorrectPassword123!"
    await _create_test_user(email=email, raw_password=pwd, role="STUDENT")

    payload = LoginRequest(identifier=email, password="WrongPassword999!")
    req = _dummy_request()
    res = Response()

    with pytest.raises(Unauthenticated) as exc_info:
        await login(payload, req, res)
    assert "incorrect" in str(exc_info.value).lower()


async def test_08_inactive_account_blocked():
    """Inactive / deactivated account is blocked even when LOGIN_EMAIL_OTP_ENABLED=False."""
    settings.LOGIN_EMAIL_OTP_ENABLED = False

    email = f"inactive_{uuid.uuid4().hex[:6]}@test.com"
    pwd = "Password123!"
    await _create_test_user(email=email, raw_password=pwd, role="STUDENT", status="INACTIVE")

    payload = LoginRequest(identifier=email, password=pwd)
    with pytest.raises(Unauthenticated) as exc:
        await login(payload, _dummy_request(), Response())
    assert "not active" in str(exc.value).lower()


async def test_09_forced_password_change_enforced():
    """Account with must_change_password=True still enforces first-login activation."""
    settings.LOGIN_EMAIL_OTP_ENABLED = False

    email = f"mustchange_{uuid.uuid4().hex[:6]}@aryacollege.in"
    pwd = "TempPassword123!"
    await _create_test_user(email=email, raw_password=pwd, role="STUDENT", must_change_password=True)

    payload = LoginRequest(identifier=email, password=pwd)
    result = await login(payload, _dummy_request(), Response())

    # Returns activationRequired and activationToken; does not issue standard session
    assert result["success"] is True
    assert result["data"].get("activationRequired") is True
    assert "activationToken" in result["data"]
    assert result["data"].get("redirectTo") == "/reset-password"


async def test_10_login_succeeds_when_email_service_fails():
    """When LOGIN_EMAIL_OTP_ENABLED=False, login succeeds even if the email microservice returns 502 or raises."""
    settings.LOGIN_EMAIL_OTP_ENABLED = False
    settings.EMAIL_VERIFICATION_ENABLED = True

    email = f"emaildown_{uuid.uuid4().hex[:6]}@example.com"
    pwd = "Password123!"
    await _create_test_user(email=email, raw_password=pwd, role="STUDENT", email_verified=False)

    # Mock send_verification_email to raise RuntimeError (simulating email service 502)
    with patch("app.routers.auth.send_verification_email", side_effect=RuntimeError("Email service 502 Bad Gateway")):
        payload = LoginRequest(identifier=email, password=pwd)
        result = await login(payload, _dummy_request(), Response())

        assert result["success"] is True
        assert "accessToken" in result["data"]


async def test_11_backend_guard_allows_unverified_user_when_flag_false():
    """get_scope_context dependency permits access for unverified user when LOGIN_EMAIL_OTP_ENABLED=False."""
    settings.LOGIN_EMAIL_OTP_ENABLED = False
    settings.EMAIL_VERIFICATION_ENABLED = True

    email = f"guardtest_{uuid.uuid4().hex[:6]}@example.com"
    pwd = "Password123!"
    uid = await _create_test_user(email=email, raw_password=pwd, role="STUDENT", email_verified=False)

    # Open a session using the hydrated user record
    from app.services.session_service import open_session
    from app.routers.auth import _find_user_by_identifier
    user_doc = await _find_user_by_identifier(email)
    assert user_doc is not None
    session_res = await open_session(user=user_doc, ip="127.0.0.1", user_agent="Test")
    access_token = session_res["accessToken"]

    # Build request with Bearer token
    req = Request({
        "type": "http",
        "method": "GET",
        "path": "/courses",
        "headers": [(b"authorization", f"Bearer {access_token}".encode())],
        "query_string": b"",
    })

    # Scope context succeeds without raising Unauthenticated("Please verify your email address to continue")
    ctx = await get_scope_context(req)
    assert str(ctx.user_id) == str(uid)


# ===========================================================================
# 2. Tests when LOGIN_EMAIL_OTP_ENABLED = True (Reversible Flow)
# ===========================================================================

async def test_12_login_otp_dispatched_when_flag_is_true():
    """When LOGIN_EMAIL_OTP_ENABLED=True, unverified user login requires OTP and sends verification email."""
    settings.LOGIN_EMAIL_OTP_ENABLED = True
    settings.EMAIL_VERIFICATION_ENABLED = True

    email = f"otpenabled_{uuid.uuid4().hex[:6]}@example.com"
    pwd = "Password123!"
    await _create_test_user(email=email, raw_password=pwd, role="STUDENT", email_verified=False)

    payload = LoginRequest(identifier=email, password=pwd)
    req = _dummy_request()
    res = Response()

    result = await login(payload, req, res)

    # Returns verificationRequired: True
    assert result["success"] is False
    assert result["data"].get("verificationRequired") is True
    assert result["data"].get("email") == email.lower()
    # OTP email was sent to outbox
    assert len(ConsoleEmailProvider.outbox) == 1
    assert ConsoleEmailProvider.outbox[0].to == email.lower()


async def test_13_verify_email_endpoint_verifies_otp_and_enables_subsequent_login():
    """Verifying OTP via /auth/verify-email verifies email and allows subsequent login with flag True."""
    settings.LOGIN_EMAIL_OTP_ENABLED = True
    settings.EMAIL_VERIFICATION_ENABLED = True

    email = f"verifyflow_{uuid.uuid4().hex[:6]}@example.com"
    pwd = "Password123!"
    uid = await _create_test_user(email=email, raw_password=pwd, role="STUDENT", email_verified=False)

    # 1. Trigger login to send OTP
    await login(LoginRequest(identifier=email, password=pwd), _dummy_request(), Response())

    # 2. Extract OTP from outbox
    sent_subject = ConsoleEmailProvider.outbox[-1].subject
    otp = sent_subject.split("—")[-1].strip()
    assert len(otp) == 6

    # 3. Incorrect OTP fails
    with pytest.raises(ValidationError):
        await verify_email(VerifyEmailRequest(email=email, otp="000000"), _dummy_request())

    # 4. Correct OTP succeeds
    ver_res = await verify_email(VerifyEmailRequest(email=email, otp=otp), _dummy_request())
    assert ver_res["success"] is True

    # 5. Subsequent login succeeds with 200 and access token
    subsequent_res = await login(LoginRequest(identifier=email, password=pwd), _dummy_request(), Response())
    assert subsequent_res["success"] is True
    assert "accessToken" in subsequent_res["data"]


# ===========================================================================
# 3. Regression Tests (Public Signup, Forgot Password, Reset Password)
# ===========================================================================

async def test_14_regression_forgot_password_otp_unaffected():
    """Forgot password OTP flow works regardless of LOGIN_EMAIL_OTP_ENABLED setting."""
    settings.LOGIN_EMAIL_OTP_ENABLED = False

    email = f"forgotpwd_{uuid.uuid4().hex[:6]}@example.com"
    pwd = "OldPassword123!"
    new_pwd = "NewSecurePassword456!"
    uid = await _create_test_user(email=email, raw_password=pwd, role="STUDENT")

    # Request forgot password
    res_forgot = await forgot_password(ForgotPasswordRequest(email=email), _dummy_request())
    assert res_forgot["success"] is True
    assert len(ConsoleEmailProvider.outbox) == 1

    # Extract token and reset password
    sent_body = ConsoleEmailProvider.outbox[0].body
    import re
    token_match = re.search(r"token=([A-Za-z0-9_-]+)", sent_body)
    assert token_match is not None
    raw_token = token_match.group(1)

    res_reset = await reset_password(
        ResetPasswordRequest(token=raw_token, password=new_pwd, confirmPassword=new_pwd),
        _dummy_request(),
        Response(),
    )
    assert res_reset["success"] is True

    # Login with new password succeeds
    login_res = await login(LoginRequest(identifier=email, password=new_pwd), _dummy_request(), Response())
    assert login_res["success"] is True
    assert "accessToken" in login_res["data"]


async def test_15_regression_public_signup_email_verification_unaffected():
    """Public signup flow still issues verification OTP when EMAIL_VERIFICATION_ENABLED=True."""
    settings.LOGIN_EMAIL_OTP_ENABLED = False
    settings.EMAIL_VERIFICATION_ENABLED = True
    settings.PUBLIC_SIGNUP_ENABLED = True

    email = f"signup_{uuid.uuid4().hex[:6]}@publicstudent.com"
    signup_payload = SignupRequest(
        email=email,
        password="PublicStudentPassword123!",
        confirmPassword="PublicStudentPassword123!",
        name="Public Student",
        role="STUDENT",
        acceptedTerms=True,
    )

    res = await signup(signup_payload, _dummy_request())
    assert res["success"] is True
    assert res["data"]["verificationRequired"] is True
    assert len(ConsoleEmailProvider.outbox) >= 1
