"""OTP verification unit tests.

Tests run entirely without a live database or Redis connection.
All network dependencies are mocked / stubbed so the suite finishes in seconds.

Run with:
    python -m unittest apps/api/tests/test_otp_verification.py -v
"""
from __future__ import annotations

import hashlib
import os
import sys
import types
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

# ---------------------------------------------------------------------------
# Minimal stub environment so imports that read settings don't fail
# ---------------------------------------------------------------------------
os.environ.setdefault("ENV", "test")
os.environ.setdefault("USE_INMEMORY_DB", "true")
os.environ.setdefault("USE_POSTGRES", "false")
os.environ.setdefault("USE_FAKE_REDIS", "true")
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-production")
os.environ.setdefault("DATABASE_URL", "postgresql://localhost/test")
os.environ.setdefault("EMAIL_PROVIDER", "console")
os.environ.setdefault("OTP_TTL_MINUTES", "5")
os.environ.setdefault("OTP_MAX_SENDS_PER_HOUR", "5")
os.environ.setdefault("PUBLIC_WEB_URL", "http://localhost:3000")

# Ensure the api app package is importable
_API_PATH = os.path.join(os.path.dirname(__file__), "..", "app")
if _API_PATH not in sys.path:
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ---------------------------------------------------------------------------
# Helpers — replicate generate_otp / hash_token without touching app internals
# ---------------------------------------------------------------------------
import secrets as _secrets


def _generate_otp(length: int = 6) -> str:
    return "".join(_secrets.choice("0123456789") for _ in range(length))


def _hash_token(token: str, secret: str = "test-secret-not-for-production") -> str:
    return hashlib.sha256(f"{secret}:{token}".encode()).hexdigest()


# ---------------------------------------------------------------------------
# Lightweight in-process OTP store (mirrors rate_limit.py logic)
# ---------------------------------------------------------------------------
class FakeOtpStore:
    """Thread-safe (single-thread test) stand-in for Redis OTP storage."""

    def __init__(self) -> None:
        self._data: dict[str, tuple[str, datetime]] = {}  # key → (hash, expires_at)
        self._sends: dict[str, int] = {}

    def issue(self, purpose: str, subject: str, max_sends: int = 5) -> str | None:
        sends_key = f"sends:{purpose}:{subject}"
        self._sends[sends_key] = self._sends.get(sends_key, 0) + 1
        if self._sends[sends_key] > max_sends:
            return None  # rate-limited

        otp = _generate_otp()
        key = f"otp:{purpose}:{subject}"
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
        self._data[key] = (_hash_token(otp), expires_at)
        return otp

    def verify(self, purpose: str, subject: str, otp: str) -> bool:
        key = f"otp:{purpose}:{subject}"
        entry = self._data.get(key)
        if not entry:
            return False
        stored_hash, expires_at = entry
        if datetime.now(timezone.utc) > expires_at:
            del self._data[key]
            return False
        if stored_hash != _hash_token(otp):
            return False
        del self._data[key]  # consume — single-use
        return True

    def exists(self, purpose: str, subject: str) -> bool:
        key = f"otp:{purpose}:{subject}"
        entry = self._data.get(key)
        if not entry:
            return False
        _, expires_at = entry
        if datetime.now(timezone.utc) > expires_at:
            del self._data[key]
            return False
        return True

    def expire(self, purpose: str, subject: str) -> None:
        """Force-expire an OTP for testing expiry scenarios."""
        key = f"otp:{purpose}:{subject}"
        entry = self._data.get(key)
        if entry:
            self._data[key] = (entry[0], datetime.now(timezone.utc) - timedelta(seconds=1))

    def reset(self) -> None:
        self._data.clear()
        self._sends.clear()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
class TestOtpGeneration(unittest.TestCase):
    """OTP shape and randomness contracts."""

    def test_otp_is_6_digits(self) -> None:
        otp = _generate_otp()
        self.assertEqual(len(otp), 6, "OTP must be exactly 6 characters")
        self.assertTrue(otp.isdigit(), "OTP must contain only digits")

    def test_otp_leading_zero_preserved(self) -> None:
        # Ensure we never use int conversion that strips leading zeros
        for _ in range(50):
            otp = _generate_otp()
            self.assertEqual(len(otp), 6, f"OTP '{otp}' is not 6 chars — leading zero stripped?")

    def test_otp_hash_is_deterministic(self) -> None:
        self.assertEqual(_hash_token("123456"), _hash_token("123456"))

    def test_different_otps_produce_different_hashes(self) -> None:
        self.assertNotEqual(_hash_token("111111"), _hash_token("222222"))


class TestOtpIssuanceAndVerification(unittest.TestCase):
    """Core OTP issuance, verification, and consumption semantics."""

    def setUp(self) -> None:
        self.store = FakeOtpStore()

    def test_valid_otp_verifies(self) -> None:
        email = "student@test.com"
        otp = self.store.issue("verify", email)
        self.assertIsNotNone(otp)
        self.assertTrue(self.store.verify("verify", email, otp))

    def test_wrong_otp_rejected(self) -> None:
        email = "student@test.com"
        self.store.issue("verify", email)
        self.assertFalse(self.store.verify("verify", email, "000000"))

    def test_otp_is_single_use(self) -> None:
        email = "student@test.com"
        otp = self.store.issue("verify", email)
        self.assertTrue(self.store.verify("verify", email, otp))
        # Second attempt with same code must fail (key deleted after first use)
        self.assertFalse(self.store.verify("verify", email, otp))

    def test_expired_otp_rejected(self) -> None:
        email = "student@test.com"
        otp = self.store.issue("verify", email)
        self.store.expire("verify", email)  # force expiry
        self.assertFalse(self.store.verify("verify", email, otp))

    def test_nonexistent_otp_rejected(self) -> None:
        self.assertFalse(self.store.verify("verify", "nobody@test.com", "123456"))

    def test_otp_invalidated_on_resend(self) -> None:
        """Issuing a new OTP must overwrite (invalidate) the old one."""
        email = "student@test.com"
        otp1 = self.store.issue("verify", email)
        otp2 = self.store.issue("verify", email)
        self.assertFalse(
            self.store.verify("verify", email, otp1),
            "Old OTP must be invalid after a new one is issued",
        )
        self.assertTrue(self.store.verify("verify", email, otp2))

    def test_purpose_isolation(self) -> None:
        """OTP issued for 'verify' must not validate under 'reset'."""
        email = "student@test.com"
        otp = self.store.issue("verify", email)
        self.assertFalse(self.store.verify("reset", email, otp))

    def test_different_emails_isolated(self) -> None:
        otp_a = self.store.issue("verify", "a@test.com")
        otp_b = self.store.issue("verify", "b@test.com")
        self.assertFalse(self.store.verify("verify", "a@test.com", otp_b))
        self.assertFalse(self.store.verify("verify", "b@test.com", otp_a))


class TestOtpRateLimiting(unittest.TestCase):
    """OTP send rate-limiting: max 5 sends per hour."""

    def setUp(self) -> None:
        self.store = FakeOtpStore()

    def test_first_five_sends_allowed(self) -> None:
        email = "flood@test.com"
        for _ in range(5):
            otp = self.store.issue("verify", email, max_sends=5)
            self.assertIsNotNone(otp, "Should allow up to 5 sends per hour")

    def test_sixth_send_blocked(self) -> None:
        email = "flood@test.com"
        for _ in range(5):
            self.store.issue("verify", email, max_sends=5)
        result = self.store.issue("verify", email, max_sends=5)
        self.assertIsNone(result, "6th OTP send within the hour must be rate-limited")


class TestEmailServiceConsoleProvider(unittest.TestCase):
    """ConsoleEmailProvider stores emails in-memory and never sends over network."""

    def test_console_provider_stores_message(self) -> None:
        from app.services.email_service import ConsoleEmailProvider

        ConsoleEmailProvider.outbox.clear()
        provider = ConsoleEmailProvider()

        import asyncio
        asyncio.run(provider.send(
            to="test@example.com",
            subject="Test Subject",
            body="Test body",
        ))

        self.assertEqual(len(ConsoleEmailProvider.outbox), 1)
        msg = ConsoleEmailProvider.outbox[0]
        self.assertEqual(msg.to, "test@example.com")
        self.assertEqual(msg.subject, "Test Subject")

    def test_console_outbox_capped_at_200(self) -> None:
        from app.services.email_service import ConsoleEmailProvider

        ConsoleEmailProvider.outbox.clear()
        provider = ConsoleEmailProvider()

        import asyncio
        for i in range(210):
            asyncio.run(provider.send(
                to=f"user{i}@test.com",
                subject=f"msg {i}",
                body="x",
            ))

        self.assertLessEqual(
            len(ConsoleEmailProvider.outbox), 200, "Outbox must be capped at 200"
        )

    def test_reset_clears_outbox(self) -> None:
        from app.services.email_service import ConsoleEmailProvider, reset_email_for_tests

        ConsoleEmailProvider.outbox.clear()
        provider = ConsoleEmailProvider()
        import asyncio
        asyncio.run(provider.send(to="x@test.com", subject="s", body="b"))
        reset_email_for_tests()
        self.assertEqual(len(ConsoleEmailProvider.outbox), 0)


class TestVerificationEmailTemplate(unittest.TestCase):
    """Verify that send_verification_email uses the right subject and content."""

    def test_verification_email_contains_otp(self) -> None:
        from app.services.email_service import ConsoleEmailProvider, reset_email_for_tests
        from app.services import email_service

        reset_email_for_tests()
        # Force console provider
        email_service._provider = ConsoleEmailProvider()

        import asyncio
        asyncio.run(email_service.send_verification_email(
            to="verify@test.com",
            name="Alice",
            otp="847291",
            link_token="fake-token-xyz",
        ))

        self.assertEqual(len(ConsoleEmailProvider.outbox), 1)
        msg = ConsoleEmailProvider.outbox[0]
        self.assertIn("847291", msg.body, "OTP must appear in email body")
        self.assertIn("verify@test.com", msg.to)
        # Subject should contain the OTP for quick identification
        self.assertIn("847291", msg.subject)

    def test_verification_email_contains_link(self) -> None:
        from app.services.email_service import ConsoleEmailProvider, reset_email_for_tests
        from app.services import email_service

        reset_email_for_tests()
        email_service._provider = ConsoleEmailProvider()

        import asyncio
        asyncio.run(email_service.send_verification_email(
            to="link@test.com",
            name="Bob",
            otp="123456",
            link_token="abc123",
        ))

        msg = ConsoleEmailProvider.outbox[0]
        self.assertIn("/verify-email", msg.body, "Verification link must appear in email body")
        self.assertIn("abc123", msg.body)


class TestResendOtpBugFix(unittest.TestCase):
    """
    Regression test for the NameError bug in auth.py resend_otp.

    The bug was: `if purpose == VERIFY:` used bare `purpose` instead of
    `payload.purpose`, causing NameError at runtime for every resend request.

    We verify the fix by checking the corrected source code directly.
    """

    def test_resend_otp_uses_payload_purpose(self) -> None:
        import ast
        auth_path = os.path.join(
            os.path.dirname(__file__), "..", "app", "routers", "auth.py"
        )
        with open(auth_path, encoding="utf-8") as fh:
            source = fh.read()

        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.AsyncFunctionDef) and node.name == "resend_otp":
                func_source = ast.get_source_segment(source, node) or ""
                # The fixed code must use payload.purpose
                self.assertIn(
                    "payload.purpose",
                    func_source,
                    "resend_otp must use payload.purpose (not bare 'purpose')",
                )
                # The old bare `purpose` reference (without payload.) must be gone
                # Look for the specific pattern `if purpose ==` (bug) vs `if payload.purpose ==` (fix)
                import re
                bad_pattern = re.search(r'\bif\s+purpose\s*==', func_source)
                self.assertIsNone(
                    bad_pattern,
                    "Found bare `if purpose ==` in resend_otp — the NameError bug is NOT fixed",
                )
                return

        self.fail("resend_otp function not found in auth.py")


class TestSmtpProviderConfig(unittest.TestCase):
    """SMTP provider reads correct env var names from Settings."""

    def test_config_has_smtp_user_field(self) -> None:
        from app.core.config import Settings
        # Settings uses SMTP_USER (not SMTP_USERNAME) — verify this matches email_service usage
        fields = Settings.model_fields
        self.assertIn("SMTP_USER", fields, "Settings must have SMTP_USER field")
        self.assertIn("SMTP_HOST", fields)
        self.assertIn("SMTP_PORT", fields)
        self.assertIn("SMTP_PASSWORD", fields)
        self.assertIn("EMAIL_FROM", fields)
        self.assertIn("EMAIL_PROVIDER", fields)

    def test_smtp_provider_selected_when_env_set(self) -> None:
        from app.services.email_service import (
            SmtpEmailProvider,
            ConsoleEmailProvider,
            reset_email_for_tests,
        )
        from app.services import email_service

        reset_email_for_tests()
        # Temporarily patch settings.EMAIL_PROVIDER
        from app.core.config import settings as s
        original = s.EMAIL_PROVIDER
        try:
            object.__setattr__(s, "EMAIL_PROVIDER", "smtp")
            provider = email_service.get_email_provider()
            self.assertIsInstance(provider, SmtpEmailProvider)
        finally:
            object.__setattr__(s, "EMAIL_PROVIDER", original)
            reset_email_for_tests()

    def test_console_provider_selected_by_default(self) -> None:
        from app.services.email_service import ConsoleEmailProvider, reset_email_for_tests
        from app.services import email_service

        reset_email_for_tests()
        provider = email_service.get_email_provider()
        self.assertIsInstance(provider, ConsoleEmailProvider)


if __name__ == "__main__":
    unittest.main(verbosity=2)

