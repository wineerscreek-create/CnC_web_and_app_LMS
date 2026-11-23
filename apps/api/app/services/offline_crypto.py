"""Cryptographic services for Decentralized Offline-First Examination.

Provides:
- HMAC-SHA256 package signing to ensure student packages are tamper-resistant.
- Offline package signature verification.
- Tamper-evident attempt checksum verification.
- Authoritative cloud synchronization receipt generation.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any
from datetime import datetime, timezone

from app.core.config import settings


def _get_signing_key() -> bytes:
    key_str = getattr(settings, "JWT_SECRET", "winnerscreek-offline-signing-secret-2026")
    return key_str.encode("utf-8")


def sign_offline_package(
    package_id: str,
    quiz_id: str,
    user_id: str,
    expires_at_iso: str,
    duration_minutes: int,
) -> str:
    """Computes a cryptographically secure HMAC-SHA256 signature for an offline exam package."""
    message = f"{package_id}:{quiz_id}:{user_id}:{expires_at_iso}:{duration_minutes}".encode("utf-8")
    sig = hmac.new(_get_signing_key(), message, hashlib.sha256).hexdigest()
    return sig


def verify_package_signature(
    package_id: str,
    quiz_id: str,
    user_id: str,
    expires_at_iso: str,
    duration_minutes: int,
    expected_sig: str,
) -> bool:
    """Verifies that an offline package has not been tampered with and was issued by the backend."""
    if not expected_sig:
        return False
    computed_sig = sign_offline_package(package_id, quiz_id, user_id, expires_at_iso, duration_minutes)
    return hmac.compare_digest(computed_sig, expected_sig)


def compute_attempt_integrity_hash(
    attempt_id: str,
    quiz_id: str,
    user_id: str,
    answers: Any,
    duration_seconds: int = 0,
) -> str:
    """Calculates SHA-256 integrity hash over candidate answer payload."""
    serialized_answers = json.dumps(answers, sort_keys=True)
    msg = f"{attempt_id}:{quiz_id}:{user_id}:{serialized_answers}:{duration_seconds}".encode("utf-8")
    return hashlib.sha256(msg).hexdigest()


def generate_sync_receipt(
    attempt_id: str,
    quiz_id: str,
    user_id: str,
    official_score: float,
    processed_at_iso: str,
) -> dict[str, Any]:
    """Generates an official tamper-proof synchronization receipt for the candidate device."""
    raw = f"{attempt_id}:{quiz_id}:{user_id}:{official_score}:{processed_at_iso}".encode("utf-8")
    receipt_sig = hmac.new(_get_signing_key(), raw, hashlib.sha256).hexdigest()
    return {
        "receiptId": f"rcpt_{attempt_id[:8]}_{receipt_sig[:8]}",
        "attemptId": attempt_id,
        "quizId": quiz_id,
        "userId": user_id,
        "officialScore": official_score,
        "processedAt": processed_at_iso,
        "signature": receipt_sig,
        "status": "OFFICIALLY_GRADED_AND_CONFIRMED",
    }


class OfflineCryptoService:
    sign_offline_package = staticmethod(sign_offline_package)
    verify_package_signature = staticmethod(verify_package_signature)
    compute_attempt_integrity_hash = staticmethod(compute_attempt_integrity_hash)
    generate_sync_receipt = staticmethod(generate_sync_receipt)
