"""User Hero Banner Customization Router (P0).

Provides secure, authenticated image upload, positioning, text color selection,
smart overlay customization, and persistent storage in PostgreSQL for all user roles.
"""
from __future__ import annotations

import os
import uuid
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, UploadFile, status
from pydantic import BaseModel, Field

from app.authz.context import ScopeContext
from app.authz.guards import get_scope_context
from app.core.config import settings
from app.core.errors import ValidationError
from app.db.postgres import get_pg_connection

router = APIRouter(prefix="/user/banner", tags=["User Banner"])

MAX_BANNER_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_TEXT_COLORS = {"#FFFFFF", "#F8F9FA", "#1E293B", "#0B0F19"}

BANNER_UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "static", "banners")
os.makedirs(BANNER_UPLOAD_DIR, exist_ok=True)


class BannerPatchRequest(BaseModel):
    posX: int | None = Field(default=None, ge=0, le=100)
    posY: int | None = Field(default=None, ge=0, le=100)
    scale: float | None = Field(default=None, ge=0.5, le=3.0)
    cropData: dict[str, Any] | None = None
    textColor: str | None = None
    overlayType: str | None = Field(default=None, pattern="^(dark|light)$")
    overlayOpacity: int | None = Field(default=None, ge=0, le=90)
    glassmorphism: bool | None = None


def _validate_image_bytes(content: bytes, filename: str, content_type: str) -> str:
    if len(content) > MAX_BANNER_BYTES:
        raise ValidationError("Banner image must not exceed 5 MB.")
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
        raise ValidationError("Invalid image content. File is not a valid JPEG, PNG, or WebP image.")

    return ext


@router.get("", status_code=status.HTTP_200_OK)
async def get_user_banner(ctx: ScopeContext = Depends(get_scope_context)) -> dict[str, Any]:
    """Retrieve current user's persistent hero banner settings."""
    user_uuid = UUID(str(ctx.user_id)) if ctx.user_id else None
    if not user_uuid:
        return {
            "success": True,
            "data": {
                "hasCustomBanner": False,
                "bannerUrl": None,
                "posX": 50,
                "posY": 50,
                "scale": 1.0,
                "cropData": {},
                "textColor": "#FFFFFF",
                "overlayType": "dark",
                "overlayOpacity": 40,
                "glassmorphism": True,
            },
        }

    async with get_pg_connection() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, banner_url, pos_x, pos_y, scale, crop_data, text_color, 
                   overlay_type, overlay_opacity, glassmorphism, updated_at
            FROM user_banners
            WHERE user_id = $1
            """,
            user_uuid,
        )

    if not row:
        return {
            "success": True,
            "data": {
                "hasCustomBanner": False,
                "bannerUrl": None,
                "posX": 50,
                "posY": 50,
                "scale": 1.0,
                "cropData": {},
                "textColor": "#FFFFFF",
                "overlayType": "dark",
                "overlayOpacity": 40,
                "glassmorphism": True,
            },
        }

    return {
        "success": True,
        "data": {
            "hasCustomBanner": True,
            "bannerUrl": row["banner_url"],
            "posX": row["pos_x"],
            "posY": row["pos_y"],
            "scale": float(row["scale"] or 1.0),
            "cropData": row["crop_data"] or {},
            "textColor": row["text_color"] or "#FFFFFF",
            "overlayType": row["overlay_type"] or "dark",
            "overlayOpacity": row["overlay_opacity"] if row["overlay_opacity"] is not None else 40,
            "glassmorphism": row["glassmorphism"] if row["glassmorphism"] is not None else True,
            "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
        },
    }


@router.post("/upload", status_code=status.HTTP_200_OK)
async def upload_user_banner(
    file: UploadFile = File(...),
    ctx: ScopeContext = Depends(get_scope_context),
) -> dict[str, Any]:
    """Securely upload and assign a custom hero banner for the current user."""
    user_uuid = UUID(str(ctx.user_id)) if ctx.user_id else None
    if not user_uuid:
        raise ValidationError("Authentication required")

    content = await file.read()
    filename = file.filename or "banner.jpg"
    content_type = file.content_type or "image/jpeg"

    ext = _validate_image_bytes(content, filename, content_type)

    user_folder = os.path.join(BANNER_UPLOAD_DIR, str(user_uuid))
    os.makedirs(user_folder, exist_ok=True)

    unique_filename = f"{uuid.uuid4().hex[:12]}{ext}"
    file_path = os.path.join(user_folder, unique_filename)

    with open(file_path, "wb") as f:
        f.write(content)

    # Relative static path served by API static mount
    banner_url = f"/static/banners/{user_uuid}/{unique_filename}"

    async with get_pg_connection() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO user_banners (
                user_id, banner_url, pos_x, pos_y, scale, crop_data, 
                text_color, overlay_type, overlay_opacity, glassmorphism, updated_at
            )
            VALUES ($1, $2, 50, 50, 1.0, '{}'::jsonb, '#FFFFFF', 'dark', 40, true, NOW())
            ON CONFLICT (user_id) DO UPDATE SET
                banner_url = EXCLUDED.banner_url,
                updated_at = NOW()
            RETURNING id, banner_url, pos_x, pos_y, scale, crop_data, text_color, 
                      overlay_type, overlay_opacity, glassmorphism, updated_at
            """,
            user_uuid,
            banner_url,
        )

    return {
        "success": True,
        "message": "Hero banner uploaded successfully",
        "data": {
            "hasCustomBanner": True,
            "bannerUrl": row["banner_url"],
            "posX": row["pos_x"],
            "posY": row["pos_y"],
            "scale": float(row["scale"] or 1.0),
            "cropData": row["crop_data"] or {},
            "textColor": row["text_color"] or "#FFFFFF",
            "overlayType": row["overlay_type"] or "dark",
            "overlayOpacity": row["overlay_opacity"],
            "glassmorphism": row["glassmorphism"],
            "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
        },
    }


@router.patch("", status_code=status.HTTP_200_OK)
async def update_user_banner_settings(
    payload: BannerPatchRequest,
    ctx: ScopeContext = Depends(get_scope_context),
) -> dict[str, Any]:
    """Update positioning, scale, text color, and overlay parameters for current banner."""
    user_uuid = UUID(str(ctx.user_id)) if ctx.user_id else None
    if not user_uuid:
        raise ValidationError("Authentication required")

    text_color = payload.textColor
    if text_color:
        text_color = text_color.upper().strip()
        if not text_color.startswith("#"):
            text_color = f"#{text_color}"
        # If not one of 4 predefined colors, validate hex
        if text_color not in ALLOWED_TEXT_COLORS and len(text_color) != 7:
            raise ValidationError("Invalid hex color code.")

    async with get_pg_connection() as conn:
        existing = await conn.fetchrow("SELECT id FROM user_banners WHERE user_id = $1", user_uuid)
        if not existing:
            # Create standard entry with these preferences
            row = await conn.fetchrow(
                """
                INSERT INTO user_banners (
                    user_id, banner_url, pos_x, pos_y, scale, crop_data, 
                    text_color, overlay_type, overlay_opacity, glassmorphism, updated_at
                )
                VALUES (
                    $1, '', 
                    COALESCE($2, 50), 
                    COALESCE($3, 50), 
                    COALESCE($4, 1.0), 
                    '{}'::jsonb,
                    COALESCE($5, '#FFFFFF'), 
                    COALESCE($6, 'dark'), 
                    COALESCE($7, 40), 
                    COALESCE($8, true), 
                    NOW()
                )
                RETURNING id, banner_url, pos_x, pos_y, scale, crop_data, text_color, 
                          overlay_type, overlay_opacity, glassmorphism, updated_at
                """,
                user_uuid,
                payload.posX,
                payload.posY,
                payload.scale,
                text_color,
                payload.overlayType,
                payload.overlayOpacity,
                payload.glassmorphism,
            )
        else:
            row = await conn.fetchrow(
                """
                UPDATE user_banners
                SET pos_x = COALESCE($2, pos_x),
                    pos_y = COALESCE($3, pos_y),
                    scale = COALESCE($4, scale),
                    text_color = COALESCE($5, text_color),
                    overlay_type = COALESCE($6, overlay_type),
                    overlay_opacity = COALESCE($7, overlay_opacity),
                    glassmorphism = COALESCE($8, glassmorphism),
                    updated_at = NOW()
                WHERE user_id = $1
                RETURNING id, banner_url, pos_x, pos_y, scale, crop_data, text_color, 
                          overlay_type, overlay_opacity, glassmorphism, updated_at
                """,
                user_uuid,
                payload.posX,
                payload.posY,
                payload.scale,
                text_color,
                payload.overlayType,
                payload.overlayOpacity,
                payload.glassmorphism,
            )

    return {
        "success": True,
        "message": "Banner customization updated",
        "data": {
            "hasCustomBanner": bool(row["banner_url"]),
            "bannerUrl": row["banner_url"] or None,
            "posX": row["pos_x"],
            "posY": row["pos_y"],
            "scale": float(row["scale"] or 1.0),
            "cropData": row["crop_data"] or {},
            "textColor": row["text_color"] or "#FFFFFF",
            "overlayType": row["overlay_type"] or "dark",
            "overlayOpacity": row["overlay_opacity"],
            "glassmorphism": row["glassmorphism"],
            "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
        },
    }


@router.delete("", status_code=status.HTTP_200_OK)
async def delete_user_banner(ctx: ScopeContext = Depends(get_scope_context)) -> dict[str, Any]:
    """Remove custom banner and reset to default platform branding."""
    user_uuid = UUID(str(ctx.user_id)) if ctx.user_id else None
    if not user_uuid:
        raise ValidationError("Authentication required")

    async with get_pg_connection() as conn:
        await conn.execute("DELETE FROM user_banners WHERE user_id = $1", user_uuid)

    return {
        "success": True,
        "message": "Banner reset to default",
        "data": {
            "hasCustomBanner": False,
            "bannerUrl": None,
            "posX": 50,
            "posY": 50,
            "scale": 1.0,
            "cropData": {},
            "textColor": "#FFFFFF",
            "overlayType": "dark",
            "overlayOpacity": 40,
            "glassmorphism": True,
        },
    }

