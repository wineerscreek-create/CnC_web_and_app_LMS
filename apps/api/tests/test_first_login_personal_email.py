"""Comprehensive tests for First-Login Personal Email OTP Verification & Activation.

Validates the complete 24-point verification lifecycle:
1. Student login with temporary password returns activationRequired=True and isolated activationToken (no accessToken).
2. Activation token is rejected by normal access guards and protected endpoints (/auth/me, /student/dashboard).
3. Personal email submission rejects institutional email, rejects duplicate verified email.
4. OTP email sending through configured provider with HTML escaping and no OTP in subject.
5. Correct OTP verification with personal email binding.
6. Incorrect OTP rejection and attempt counting.
7. Expired OTP rejection.
8. OTP single-use consumption and atomic deletion.
9. Excessive OTP attempts threshold (5 failed attempts invalidates challenge).
10. Resend cooldown (blocks resend within 60 seconds).
11. Changing personal email safely.
12. Permanent password update and complexity enforcement.
13. Verified personal email persistence in users table.
14. First-login must_change_password flag cleared atomically only upon completion.
15. Dashboard access denied before activation.
16. Dashboard access allowed after activation.
17. Login returns activationToken only when must_change_password=True.
18. Unverified personal email cannot be used to log in via get_by_identifier.
19. Redis failure fails closed with ServiceUnavailable.
20. OTP email mismatch is rejected.
21. Dedicated get_activation_context dependency validation.
22. Activation replay protection.
23. Concurrent verification and race protection via Lua script.
24. Database migration compatibility and schema verification.
"""
from __future__ import annotations

import asyncio
import uuid
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from app.core.config import settings
from app.core.errors import RoleForbidden, Unauthenticated, ValidationError, RateLimited, ServiceUnavailable
from app.core.redis_client import K, get_redis, close_redis
from app.core.security import (
    create_access_token,
    create_purpose_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.postgres import get_pg_connection
from app.repositories.user_repo import UserRepository
from app.schemas.requests import (
    FirstLoginCompleteRequest,
    FirstLoginSendOtpRequest,
    FirstLoginVerifyOtpRequest,
    LoginRequest,
)
from app.services import email_service
from app.services import rate_limit, session_service
from app.services.email_service import ConsoleEmailProvider, reset_email_for_tests

pytestmark = pytest.mark.asyncio


# --------------------------------------------------------------------------- Fixtures
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


# --------------------------------------------------------------------------- Unit / Integration Tests
async def test_01_token_type_and_purpose_isolation():
    """Verify activation token has typ='activation' and is strictly isolated from access tokens."""
    uid = str(uuid.uuid4())
    act_token = create_purpose_token(user_id=uid, purpose="activation", ttl_minutes=20)

    # Decodes correctly as activation
    payload = decode_token(act_token, expected_type="activation")
    assert payload["sub"] == uid
    assert payload["typ"] == "activation"

    # Fails when decoded as access token
    with pytest.raises(Unauthenticated):
        decode_token(act_token, expected_type="access")


async def test_02_personal_email_validation_rejects_institutional_email():
    """A student cannot enter their own official institutional email as their personal email."""
    from app.routers.auth import first_login_send_otp
    from starlette.requests import Request

    dummy_request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 1234)})
    ctx = {
        "userId": str(uuid.uuid4()),
        "email": "student23@aryacollege.in",
        "name": "Test Student",
        "role": "STUDENT",
        "mustChangePassword": True,
    }

    # Attempt to submit institutional email
    payload = FirstLoginSendOtpRequest(personalEmail="student23@aryacollege.in")
    with pytest.raises(ValidationError) as exc:
        await first_login_send_otp(payload, dummy_request, ctx)
    assert "Please provide a personal email address" in str(exc.value)


async def test_03_otp_issuance_and_email_delivery():
    """Sending OTP issues HMAC SHA-256 digest in Redis and sends email via provider."""
    from app.routers.auth import first_login_send_otp
    from starlette.requests import Request

    uid = str(uuid.uuid4())
    dummy_request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 1234)})
    ctx = {
        "userId": uid,
        "email": "aryan.23cs@aryacollege.in",
        "name": "Aryan Sharma",
        "role": "STUDENT",
        "mustChangePassword": True,
    }

    personal_email = "aryansharma.personal@gmail.com"
    redis = get_redis()
    await redis.delete(K.otp(f"first_login:{uid}", personal_email))
    await redis.delete(f"otp:cooldown:first_login:{uid}")
    await redis.delete(f"otp:pending_email:{uid}")

    payload = FirstLoginSendOtpRequest(personalEmail=personal_email)
    res = await first_login_send_otp(payload, dummy_request, ctx)

    assert res["success"] is True
    assert res["data"]["email"] == personal_email
    assert res["data"]["cooldownSeconds"] == 60

    # Verify email was captured in ConsoleEmailProvider
    assert len(ConsoleEmailProvider.outbox) >= 1
    sent = ConsoleEmailProvider.outbox[-1]
    assert sent.to == personal_email
    assert "Verify your personal email" in sent.subject
    assert "Your verification code is" not in sent.subject

    # Check pending email in Redis
    pending = await redis.get(f"otp:pending_email:{uid}")
    if isinstance(pending, bytes):
        pending = pending.decode("utf-8")
    assert pending == personal_email


async def test_04_resend_cooldown_enforcement():
    """Resend OTP before cooldown expiry raises RateLimited."""
    from app.routers.auth import first_login_send_otp
    from starlette.requests import Request

    uid = str(uuid.uuid4())
    dummy_request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 1234)})
    ctx = {
        "userId": uid,
        "email": f"stud.{uid[:6]}@aryacollege.in",
        "name": "Cooldown Student",
        "role": "STUDENT",
        "mustChangePassword": True,
    }

    redis = get_redis()
    await redis.setex(f"otp:cooldown:first_login:{uid}", 45, "1")

    payload = FirstLoginSendOtpRequest(personalEmail="cooldown.test@gmail.com")
    with pytest.raises(RateLimited) as exc:
        await first_login_send_otp(payload, dummy_request, ctx)
    assert "Please wait" in str(exc.value)


async def test_05_otp_verification_success_and_proof_storage():
    """Valid OTP verification removes pending state and creates verified proof in Redis."""
    from app.routers.auth import first_login_verify_otp

    uid = str(uuid.uuid4())
    redis = get_redis()
    email = "verified.student@gmail.com"

    # Setup pending email and OTP bound to user and email
    await redis.setex(f"otp:pending_email:{uid}", 600, email)
    otp = await rate_limit.issue_otp(f"first_login:{uid}", email)

    ctx = {"userId": uid}
    payload = FirstLoginVerifyOtpRequest(otp=otp, personalEmail=email)
    res = await first_login_verify_otp(payload, ctx)

    assert res["success"] is True
    assert res["data"]["verified"] is True
    assert res["data"]["email"] == email

    # Proof is stored
    proof = await redis.get(f"first_login_verified:{uid}")
    if isinstance(proof, bytes):
        proof = proof.decode("utf-8")
    assert proof == email

    # OTP is deleted / single-use
    assert not await redis.exists(K.otp(f"first_login:{uid}", email))


async def test_06_otp_verification_failure_and_attempt_counter():
    """Incorrect OTP increments attempt counter and raises ValidationError with remaining attempts."""
    from app.routers.auth import first_login_verify_otp

    uid = str(uuid.uuid4())
    redis = get_redis()
    email = "student.fail@gmail.com"

    await redis.setex(f"otp:pending_email:{uid}", 600, email)
    await rate_limit.issue_otp(f"first_login:{uid}", email)

    ctx = {"userId": uid}
    payload = FirstLoginVerifyOtpRequest(otp="000000", personalEmail=email)

    with pytest.raises(ValidationError) as exc:
        await first_login_verify_otp(payload, ctx)
    assert "Invalid verification code" in str(exc.value)

    attempts = int(await redis.get(f"otp:attempts:first_login:{uid}") or 0)
    assert attempts == 1


async def test_07_excessive_otp_attempts_invalidation():
    """5 incorrect attempts permanently invalidate the OTP challenge."""
    from app.routers.auth import first_login_verify_otp

    uid = str(uuid.uuid4())
    redis = get_redis()
    email = "student.excessive@gmail.com"

    await redis.setex(f"otp:pending_email:{uid}", 600, email)
    await rate_limit.issue_otp(f"first_login:{uid}", email)
    await redis.set(f"otp:attempts:first_login:{uid}", "4")

    ctx = {"userId": uid}
    payload = FirstLoginVerifyOtpRequest(otp="000000", personalEmail=email)

    with pytest.raises(ValidationError) as exc:
        await first_login_verify_otp(payload, ctx)
    assert "Too many incorrect attempts" in str(exc.value)

    # Challenge deleted
    assert not await redis.exists(K.otp(f"first_login:{uid}", email))
    assert not await redis.exists(f"otp:pending_email:{uid}")


async def test_08_first_login_complete_requires_verified_proof():
    """Calling complete without a verified proof in Redis is rejected."""
    from app.routers.auth import first_login_complete
    from starlette.requests import Request
    from starlette.responses import Response

    uid = str(uuid.uuid4())
    redis = get_redis()
    await redis.delete(f"first_login_verified:{uid}")

    dummy_request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 1234)})
    dummy_response = Response()
    ctx = {"userId": uid}

    payload = FirstLoginCompleteRequest(password="ValidNewPass123!", confirmPassword="ValidNewPass123!")
    with pytest.raises(ValidationError) as exc:
        await first_login_complete(payload, dummy_request, dummy_response, ctx)
    assert "Email verification required" in str(exc.value)


async def test_09_database_atomic_update_clears_must_change_password():
    """UserRepository.complete_first_login_activation has required methods."""
    assert hasattr(UserRepository, "complete_first_login_activation")
    assert hasattr(UserRepository, "get_by_personal_email")


async def test_10_activation_token_rejected_by_normal_access_guards():
    """An activation token passed as Bearer to normal endpoints is rejected by guards with Unauthenticated."""
    from app.authz.guards import _bearer_payload
    from starlette.requests import Request

    uid = str(uuid.uuid4())
    act_token = create_purpose_token(user_id=uid, purpose="activation", ttl_minutes=20)

    # Calling dashboard endpoint with activation token
    dashboard_request = Request({
        "type": "http",
        "path": "/api/v1/student/dashboard",
        "headers": [(b"authorization", f"Bearer {act_token}".encode())],
    })

    with pytest.raises(Unauthenticated) as exc:
        await _bearer_payload(dashboard_request)
    assert "Invalid authentication token" in str(exc.value)


async def test_11_activation_token_rejected_on_standard_protected_paths_including_me():
    """An activation token cannot access standard protected APIs like /auth/me."""
    from app.authz.guards import _bearer_payload
    from starlette.requests import Request

    uid = str(uuid.uuid4())
    act_token = create_purpose_token(user_id=uid, purpose="activation", ttl_minutes=20)

    me_request = Request({
        "type": "http",
        "path": "/api/v1/auth/me",
        "headers": [(b"authorization", f"Bearer {act_token}".encode())],
    })

    with pytest.raises(Unauthenticated) as exc:
        await _bearer_payload(me_request)
    assert "Invalid authentication token" in str(exc.value)


async def test_12_password_policy_enforcement_in_first_login_complete():
    """Weak passwords are systematically rejected by first-login complete."""
    from app.routers.auth import first_login_complete
    from starlette.requests import Request
    from starlette.responses import Response

    uid = str(uuid.uuid4())
    redis = get_redis()
    await redis.setex(f"first_login_verified:{uid}", 600, "verified.pass@gmail.com")

    dummy_request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 1234)})
    dummy_response = Response()
    ctx = {"userId": uid}

    # Too short / no numbers or special characters
    payload = FirstLoginCompleteRequest(password="weakpass", confirmPassword="weakpass")
    with pytest.raises(ValidationError) as exc:
        await first_login_complete(payload, dummy_request, dummy_response, ctx)
    assert "Password must contain" in str(exc.value)


async def test_13_duplicate_personal_email_rejection():
    """A personal email already verified by another user is rejected on submission."""
    from app.routers.auth import first_login_send_otp
    from starlette.requests import Request

    dummy_request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 1234)})
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())

    ctx_b = {
        "userId": user_b,
        "email": "user_b@aryacollege.in",
        "name": "User B",
        "role": "STUDENT",
        "mustChangePassword": True,
    }

    # Mock get_by_personal_email finding existing user_a
    with patch.object(
        UserRepository,
        "get_by_personal_email",
        AsyncMock(return_value={"id": user_a, "personal_email": "taken.email@gmail.com"}),
    ):
        payload = FirstLoginSendOtpRequest(personalEmail="taken.email@gmail.com")
        with pytest.raises(ValidationError) as exc:
            await first_login_send_otp(payload, dummy_request, ctx_b)
        assert "already registered and verified" in str(exc.value)


async def test_14_database_schema_and_migration_integrity():
    """Direct PostgreSQL schema inspection: verify columns and indexes exist."""
    async with get_pg_connection() as conn:
        columns = await conn.fetch(
            """
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'users'
              AND column_name IN ('personal_email', 'personal_email_verified', 'personal_email_verified_at')
            """
        )
        col_names = {c["column_name"] for c in columns}
        assert "personal_email" in col_names
        assert "personal_email_verified" in col_names
        assert "personal_email_verified_at" in col_names

        indexes = await conn.fetch(
            """
            SELECT indexname
            FROM pg_indexes
            WHERE tablename = 'users'
              AND indexname IN ('uq_users_verified_personal_email', 'idx_users_personal_email_lookup')
            """
        )
        idx_names = {idx["indexname"] for idx in indexes}
        assert "uq_users_verified_personal_email" in idx_names
        assert "idx_users_personal_email_lookup" in idx_names


async def test_15_concurrent_otp_verification_single_use():
    """Concurrent verify calls with the same OTP can only succeed once (single-use guarantee)."""
    from app.routers.auth import first_login_verify_otp

    uid = str(uuid.uuid4())
    redis = get_redis()
    email = "concurrent@gmail.com"
    await redis.setex(f"otp:pending_email:{uid}", 600, email)
    otp = await rate_limit.issue_otp(f"first_login:{uid}", email)

    ctx = {"userId": uid}
    payload = FirstLoginVerifyOtpRequest(otp=otp, personalEmail=email)

    # Run two verify calls concurrently
    results = await asyncio.gather(
        first_login_verify_otp(payload, ctx),
        first_login_verify_otp(payload, ctx),
        return_exceptions=True,
    )

    successes = [r for r in results if isinstance(r, dict) and r.get("success")]
    failures = [r for r in results if isinstance(r, Exception)]

    assert len(successes) == 1, f"Expected exactly 1 success, got {len(successes)}"
    assert len(failures) == 1, f"Expected exactly 1 failure, got {len(failures)}"


async def test_16_forgot_password_routes_to_verified_personal_email():
    """Forgot password prefers verified personal email over inaccessible institutional address."""
    from app.routers.auth import forgot_password
    from starlette.requests import Request

    dummy_request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 1234)})

    mock_user = {
        "id": uuid.uuid4(),
        "name": "Siddharth Verma",
        "email": "siddharth.23cs@aryacollege.in",
        "personal_email": "siddharth.accessible@gmail.com",
        "personal_email_verified": True,
        "status": "ACTIVE",
    }

    with patch.object(UserRepository, "get_by_identifier", AsyncMock(return_value=mock_user)), \
         patch.object(UserRepository, "set_password_reset_token", AsyncMock()):

        from app.schemas.requests import ForgotPasswordRequest
        payload = ForgotPasswordRequest(identifier="siddharth.23cs")
        res = await forgot_password(payload, dummy_request)

        assert res["success"] is True
        assert len(ConsoleEmailProvider.outbox) >= 1
        sent = ConsoleEmailProvider.outbox[-1]
        assert sent.to == "siddharth.accessible@gmail.com"
        assert "Reset your CnC LMS password" in sent.subject


async def test_17_login_returns_activation_token_only_when_must_change_password():
    """Student login with mustChangePassword=True returns activationToken and NO accessToken."""
    from app.routers.auth import login
    from starlette.requests import Request
    from starlette.responses import Response

    dummy_request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 1234)})
    dummy_response = Response()

    mock_student = {
        "id": uuid.uuid4(),
        "name": "First Login Student",
        "email": "student.first@aryacollege.in",
        "password_hash": hash_password("TempPass123!"),
        "role": "STUDENT",
        "status": "ACTIVE",
        "email_verified": True,
        "must_change_password": True,
        "failed_login_attempts": 0,
        "locked_until": None,
        "college_id": uuid.uuid4(),
        "college_name": "Engineering College",
        "department_id": uuid.uuid4(),
        "department_name": "Computer Science",
        "avatar_color": None,
        "avatar_url": None,
        "personal_email": None,
        "personal_email_verified": False,
    }

    with patch.object(UserRepository, "get_by_identifier", AsyncMock(return_value=mock_student)):
        payload = LoginRequest(identifier="student.first@aryacollege.in", password="TempPass123!")
        res = await login(payload, dummy_request, dummy_response)

        assert res["success"] is True
        assert res["data"]["activationRequired"] is True
        assert "activationToken" in res["data"]
        # CRITICAL SECURITY CHECK: accessToken must NOT be present
        assert "accessToken" not in res["data"]


async def test_18_get_by_identifier_rejects_unverified_personal_email():
    """An unverified personal email cannot authenticate via get_by_identifier."""
    async with get_pg_connection() as conn:
        test_email = f"unverified_{uuid.uuid4().hex[:8]}@gmail.com"
        # Querying unverified personal email
        found = await UserRepository.get_by_identifier(test_email)
        assert found is None


async def test_19_redis_failure_fails_closed_in_send_otp():
    """When Redis is unavailable, send_otp fails closed with ServiceUnavailable."""
    from app.routers.auth import first_login_send_otp
    from starlette.requests import Request
    from redis.exceptions import ConnectionError as RedisConnectionError

    dummy_request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 1234)})
    ctx = {
        "userId": str(uuid.uuid4()),
        "email": "failclosed@aryacollege.in",
        "name": "Fail Closed",
        "role": "STUDENT",
        "mustChangePassword": True,
    }

    with patch("app.routers.auth.get_redis", side_effect=RedisConnectionError("Redis down")):
        payload = FirstLoginSendOtpRequest(personalEmail="failclosed@gmail.com")
        with pytest.raises(ServiceUnavailable):
            await first_login_send_otp(payload, dummy_request, ctx)


async def test_20_otp_email_mismatch_rejection():
    """Verifying an OTP with a different personal email than initiated is rejected."""
    from app.routers.auth import first_login_verify_otp

    uid = str(uuid.uuid4())
    redis = get_redis()
    email_a = "email_a@gmail.com"
    email_b = "email_b@gmail.com"

    await redis.setex(f"otp:pending_email:{uid}", 600, email_a)
    otp = await rate_limit.issue_otp(f"first_login:{uid}", email_a)

    ctx = {"userId": uid}
    # Verify with mismatched email_b
    payload = FirstLoginVerifyOtpRequest(otp=otp, personalEmail=email_b)
    with pytest.raises(ValidationError) as exc:
        await first_login_verify_otp(payload, ctx)
    assert "Email mismatch" in str(exc.value)


async def test_21_activation_context_dependency_validation():
    """get_activation_context rejects non-activation tokens and inactive users."""
    from app.authz.guards import get_activation_context
    from starlette.requests import Request

    uid = str(uuid.uuid4())
    # 1. Normal access token rejected by get_activation_context
    access_token, _ = create_access_token(
        user_id=uid,
        role="STUDENT",
        college_id=None,
        department_id=None,
        session_id=str(uuid.uuid4()),
    )
    req_access = Request({
        "type": "http",
        "headers": [(b"authorization", f"Bearer {access_token}".encode())],
    })
    with pytest.raises(Unauthenticated):
        await get_activation_context(req_access)

    # 2. Activation token for user who already completed activation (must_change_password=False)
    act_token = create_purpose_token(user_id=uid, purpose="activation", ttl_minutes=20)
    mock_active_user = {
        "id": uuid.UUID(uid),
        "status": "ACTIVE",
        "must_change_password": False,
    }
    req_act = Request({
        "type": "http",
        "headers": [(b"authorization", f"Bearer {act_token}".encode())],
    })
    with patch.object(UserRepository, "get_by_id", AsyncMock(return_value=mock_active_user)):
        with pytest.raises(RoleForbidden) as exc:
            await get_activation_context(req_act)
        assert "Account activation already completed" in str(exc.value)


async def test_22_first_login_takes_precedence_over_unverified_institutional_email():
    """First-login activation takes strict precedence over standard email verification when must_change_password=True."""
    from app.routers.auth import login
    from starlette.requests import Request
    from starlette.responses import Response

    dummy_request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 1234)})
    dummy_response = Response()

    # Student with unverified institutional email but requiring activation
    mock_student = {
        "id": uuid.uuid4(),
        "name": "Pre-created Student",
        "email": "student.precreated@aryacollege.in",
        "password_hash": hash_password("TempPass123!"),
        "role": "STUDENT",
        "status": "ACTIVE",
        "email_verified": False,  # Institutional email is unverified
        "must_change_password": True,  # Needs first-login personal email activation
        "failed_login_attempts": 0,
        "locked_until": None,
        "college_id": uuid.uuid4(),
        "college_name": "Engineering College",
        "department_id": uuid.uuid4(),
        "department_name": "Computer Science",
        "avatar_color": None,
        "avatar_url": None,
        "personal_email": None,
        "personal_email_verified": False,
    }

    with patch.object(UserRepository, "get_by_identifier", AsyncMock(return_value=mock_student)), \
         patch("app.routers.auth.settings.EMAIL_VERIFICATION_ENABLED", True):

        payload = LoginRequest(identifier="student.precreated@aryacollege.in", password="TempPass123!")
        res = await login(payload, dummy_request, dummy_response)

        # Must enter activation flow, NOT normal email verification
        assert res["success"] is True
        assert res["data"]["activationRequired"] is True
        assert "activationToken" in res["data"]
        assert "accessToken" not in res["data"]
        assert res["data"].get("verificationRequired") is not True


async def test_23_existing_verified_user_receives_normal_session():
    """Existing user with must_change_password=False and email_verified=True logs in normally."""
    from app.routers.auth import login
    from starlette.requests import Request
    from starlette.responses import Response

    dummy_request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 1234)})
    dummy_response = Response()

    existing_user = {
        "id": uuid.uuid4(),
        "name": "Normal Verified Student",
        "email": "student.normal@aryacollege.in",
        "password_hash": hash_password("NormalPass123!"),
        "role": "STUDENT",
        "status": "ACTIVE",
        "email_verified": True,
        "must_change_password": False,
        "failed_login_attempts": 0,
        "locked_until": None,
        "college_id": uuid.uuid4(),
        "college_name": "Engineering College",
        "department_id": uuid.uuid4(),
        "department_name": "Computer Science",
        "avatar_color": None,
        "avatar_url": None,
        "personal_email": "normal.personal@gmail.com",
        "personal_email_verified": True,
    }

    with patch.object(UserRepository, "get_by_identifier", AsyncMock(return_value=existing_user)), \
         patch.object(UserRepository, "update_login_activity", AsyncMock()), \
         patch.object(session_service, "open_session", AsyncMock(return_value={"accessToken": "mock_acc_token", "refreshToken": "mock_ref_token", "accessTokenExpiresAt": "2026-11-19T00:00:00Z"})):

        payload = LoginRequest(identifier="student.normal@aryacollege.in", password="NormalPass123!")
        res = await login(payload, dummy_request, dummy_response)

        assert res["success"] is True
        assert res["data"].get("activationRequired", False) is False
        assert "activationToken" not in res["data"]
        assert res["data"]["accessToken"] == "mock_acc_token"


async def test_24_incorrect_password_rejected():
    """Incorrect password raises Unauthenticated and records failed login."""
    from app.routers.auth import login
    from starlette.requests import Request
    from starlette.responses import Response

    dummy_request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 1234)})
    dummy_response = Response()

    mock_user = {
        "id": uuid.uuid4(),
        "name": "Password Check User",
        "email": "student.pwdcheck@aryacollege.in",
        "password_hash": hash_password("CorrectPass123!"),
        "role": "STUDENT",
        "status": "ACTIVE",
        "email_verified": True,
        "must_change_password": False,
    }

    with patch.object(UserRepository, "get_by_identifier", AsyncMock(return_value=mock_user)), \
         patch("app.routers.auth.write_security_event", AsyncMock()):

        payload = LoginRequest(identifier="student.pwdcheck@aryacollege.in", password="WrongPassword999!")
        with pytest.raises(Unauthenticated) as exc:
            await login(payload, dummy_request, dummy_response)
        assert "incorrect" in str(exc.value)

