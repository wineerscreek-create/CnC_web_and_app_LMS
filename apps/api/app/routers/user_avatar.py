"""Universal User Profile Avatar / Image Upload.

Implements unified S3-backed profile image uploading across all five roles
(STUDENT, TRAINER, ADMIN, HOD, SUPER_ADMIN) with PostgreSQL persistence,
magic-byte validation, and offline image caching.
"""

from __future__ import annotations

import os
import uuid
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, UploadFile, status
from pydantic import BaseModel

from app.authz.context import ScopeContext
from app.authz.guards import get_scope_context
from app.core.config import settings
from app.core.errors import AppError, ValidationError
from app.core.logging import get_logger
from app.db.postgres import get_pg_connection
from app.services.storage import Keys, get_storage

log = get_logger("app.user_avatar")

router = APIRouter(prefix="/user/avatar", tags=["User Avatar"])

MAX_AVATAR_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

AVATAR_UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "static", "avatars"
)
os.makedirs(AVATAR_UPLOAD_DIR, exist_ok=True)


def _validate_avatar_bytes(content: bytes, filename: str, content_type: str) -> str:
    if len(content) > MAX_AVATAR_BYTES:
        raise ValidationError("Profile image must not exceed 5 MB.")
    if len(content) < 32:
        raise ValidationError("Uploaded file is empty or corrupted.")

    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValidationError(f"Unsupported extension '{ext}'. Allowed: JPG, PNG, WebP.")

    # Magic number header check
    is_jpeg = content.startswith(b"\xff\xd8\xff")
    is_png = content.startswith(b"\x89PNG\r\n\x1a\n")
    is_webp = content.startswith(b"RIFF") and b"WEBP" in content[:16]

    if not (is_jpeg or is_png or is_webp):
        raise ValidationError(
            "Invalid image content. File is not a valid JPEG, PNG, or WebP image."
        )

    return ext


@router.get("", status_code=status.HTTP_200_OK)
async def get_user_avatar(ctx: ScopeContext = Depends(get_scope_context)) -> dict[str, Any]:
    """Retrieve current user's profile avatar URL."""
    user_uuid = UUID(str(ctx.user_id)) if ctx.user_id else None
    if not user_uuid:
        return {"success": True, "data": {"avatarUrl": None}}

    async with get_pg_connection() as conn:
        row = await conn.fetchrow(
            "SELECT avatar_url, role FROM users WHERE id = $1 AND deleted_at IS NULL",
            user_uuid,
        )
        if not row:
            return {"success": True, "data": {"avatarUrl": None}}

        avatar_url = row["avatar_url"]
        return {
            "success": True,
            "data": {
                "avatarUrl": avatar_url,
                "role": row["role"],
            },
        }


@router.post("/upload", status_code=status.HTTP_200_OK)
async def upload_user_avatar(
    file: UploadFile = File(...),
    ctx: ScopeContext = Depends(get_scope_context),
) -> dict[str, Any]:
    """Securely upload and assign a custom profile avatar for the current user."""
    user_uuid = UUID(str(ctx.user_id)) if ctx.user_id else None
    if not user_uuid:
        raise ValidationError("Authentication required")

    content = await file.read()
    filename = file.filename or "avatar.jpg"
    content_type = file.content_type or "image/jpeg"

    ext = _validate_avatar_bytes(content, filename, content_type)
    unique_filename = f"{uuid.uuid4().hex[:12]}{ext}"

    avatar_url = None
    if settings.STORAGE_DRIVER == "s3":
        try:
            storage = get_storage()
            key = Keys.user_avatar(str(user_uuid), unique_filename)
            await storage.put(key, content, content_type)
            avatar_url = await storage.signed_download_url(key, ttl=86400 * 7)
        except Exception as exc:
            log.warning(f"S3 storage put failed for user avatar ({exc}), falling back to local storage")
            avatar_url = None

    if not avatar_url:
        user_folder = os.path.join(AVATAR_UPLOAD_DIR, str(user_uuid))
        os.makedirs(user_folder, exist_ok=True)
        file_path = os.path.join(user_folder, unique_filename)
        with open(file_path, "wb") as f:
            f.write(content)
        avatar_url = f"/static/avatars/{user_uuid}/{unique_filename}"

    async with get_pg_connection() as conn:
        # 1. Update core users record
        await conn.execute(
            """
            UPDATE users
            SET avatar_url = $1, updated_at = NOW()
            WHERE id = $2
            """,
            avatar_url,
            user_uuid,
        )

        # 2. Synchronize role-specific profile records if present
        user_role = str(ctx.role).upper()
        if user_role == "STUDENT":
            await conn.execute(
                """
                UPDATE student_profiles
                SET avatar_url = $1, updated_at = NOW()
                WHERE user_id = $2
                """,
                avatar_url,
                user_uuid,
            )
        elif user_role == "TRAINER":
            await conn.execute(
                """
                UPDATE trainer_profiles
                SET profile_photo_url = $1, updated_at = NOW()
                WHERE user_id = $2
                """,
                avatar_url,
                user_uuid,
            )

    return {
        "success": True,
        "message": "Profile avatar uploaded successfully",
        "data": {
            "avatarUrl": avatar_url,
        },
    }


@router.delete("", status_code=status.HTTP_200_OK)
async def delete_user_avatar(ctx: ScopeContext = Depends(get_scope_context)) -> dict[str, Any]:
    """Remove custom profile avatar and reset to default."""
    user_uuid = UUID(str(ctx.user_id)) if ctx.user_id else None
    if not user_uuid:
        raise ValidationError("Authentication required")

    async with get_pg_connection() as conn:
        await conn.execute(
            "UPDATE users SET avatar_url = NULL, updated_at = NOW() WHERE id = $1",
            user_uuid,
        )
        user_role = str(ctx.role).upper()
        if user_role == "STUDENT":
            await conn.execute(
                "UPDATE student_profiles SET avatar_url = NULL, updated_at = NOW() WHERE user_id = $1",
                user_uuid,
            )
        elif user_role == "TRAINER":
            await conn.execute(
                "UPDATE trainer_profiles SET profile_photo_url = NULL, updated_at = NOW() WHERE user_id = $1",
                user_uuid,
            )

    return {
        "success": True,
        "message": "Profile avatar removed successfully",
        "data": {
            "avatarUrl": None,
        },
    }
