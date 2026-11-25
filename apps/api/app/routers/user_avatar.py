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
from app.core.errors import AppError, Unauthenticated, ValidationError
from app.core.logging import get_logger
from app.db.postgres import get_pg_connection
from app.services.media_service import (
    cleanup_unreferenced_asset,
    persist_media_asset,
    validate_and_optimize_image,
)
from app.services.storage import Keys

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
            "SELECT avatar_url, avatar_asset_id, role FROM users WHERE id = $1 AND deleted_at IS NULL",
            user_uuid,
        )
        if not row:
            return {"success": True, "data": {"avatarUrl": None}}

        avatar_url = (
            f"{settings.API_V1_PREFIX}/media/{row['avatar_asset_id']}"
            if row["avatar_asset_id"]
            else row["avatar_url"]
        )
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
        raise Unauthenticated("Authentication required")
    inst_uuid = UUID(str(ctx.college_id)) if getattr(ctx, "college_id", None) else None

    content = await file.read()
    filename = file.filename or "avatar.jpg"
    content_type = file.content_type or "image/jpeg"

    opt_bytes, ext, canonical_mime = validate_and_optimize_image(
        content, filename, content_type, max_dimensions=(512, 512)
    )
    unique_filename = f"{uuid.uuid4().hex[:12]}{ext}"
    key = Keys.user_avatar(str(user_uuid), unique_filename)

    async with get_pg_connection() as conn:
        async with conn.transaction():
            old_asset_id = await conn.fetchval(
                "SELECT avatar_asset_id FROM users WHERE id = $1 FOR UPDATE",
                user_uuid,
            )
            asset_id, avatar_url = await persist_media_asset(
                conn,
                owner_id=user_uuid,
                institution_id=inst_uuid,
                image_type="AVATAR",
                storage_key=key,
                content=opt_bytes,
                mime_type=canonical_mime,
            )
            # 1. Update core users record
            await conn.execute(
                """
                UPDATE users
                SET avatar_url = $1, avatar_storage_key = $2, avatar_asset_id = $3, updated_at = NOW()
                WHERE id = $4
                """,
                avatar_url,
                key,
                asset_id,
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

            await cleanup_unreferenced_asset(conn, old_asset_id)

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
        raise Unauthenticated("Authentication required")

    async with get_pg_connection() as conn:
        async with conn.transaction():
            old_asset_id = await conn.fetchval(
                "SELECT avatar_asset_id FROM users WHERE id = $1 FOR UPDATE",
                user_uuid,
            )
            await conn.execute(
                "UPDATE users SET avatar_url = NULL, avatar_storage_key = NULL, avatar_asset_id = NULL, updated_at = NOW() WHERE id = $1",
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
            await cleanup_unreferenced_asset(conn, old_asset_id)

    return {
        "success": True,
        "message": "Profile avatar removed successfully",
        "data": {
            "avatarUrl": None,
        },
    }
