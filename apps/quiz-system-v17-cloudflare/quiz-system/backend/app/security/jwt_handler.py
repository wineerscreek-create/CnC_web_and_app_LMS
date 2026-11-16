"""
JWT issuing / verification for both admin and student sessions.
Student tokens are additionally bound to a random session UUID + a device
fingerprint so a token cannot be replayed from a second device (see
services/auth_service.py for the one-device-only enforcement).
"""
import uuid
import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.config.settings import settings


class TokenError(Exception):
    pass


def _encode(payload: dict, expire_minutes: int) -> str:
    now = datetime.now(timezone.utc)
    to_encode = payload.copy()
    to_encode.update({
        "iat": now,
        "exp": now + timedelta(minutes=expire_minutes),
        "jti": str(uuid.uuid4()),
    })
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_admin_token(admin_id: str, username: str, role: str) -> str:
    return _encode(
        {"sub": admin_id, "username": username, "role": role, "type": "admin"},
        settings.admin_token_expire_minutes,
    )


def create_student_token(session_id: str, quiz_code: str, roll_number: str, device_id: str) -> str:
    return _encode(
        {
            "sub": session_id,
            "quiz_code": quiz_code,
            "roll_number": roll_number,
            "device_id": device_id,
            "type": "student",
        },
        settings.student_token_expire_minutes,
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        raise TokenError("Token has expired")
    except jwt.InvalidTokenError:
        raise TokenError("Invalid token")


def new_session_id() -> str:
    return str(uuid.uuid4())
