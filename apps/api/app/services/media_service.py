"""Unified Media Asset Validation, Optimization, and Durable Persistence."""
from __future__ import annotations

import hashlib
import io
import os
import uuid
from typing import Any

from PIL import Image, ImageFile

from app.core.config import settings
from app.core.errors import ServiceUnavailable, ValidationError
from app.core.logging import get_logger
from app.services.storage import get_storage

ImageFile.LOAD_TRUNCATED_IMAGES = True
log = get_logger("app.media_service")

MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}


def validate_and_optimize_image(
    content: bytes,
    filename: str,
    content_type: str | None = None,
    *,
    max_bytes: int = MAX_IMAGE_BYTES,
    max_dimensions: tuple[int, int] = (1920, 1080),
) -> tuple[bytes, str, str]:
    """Validates image bytes via magic headers + Pillow decoding, strips EXIF, and optimizes dimensions.

    Returns (optimized_bytes, extension, canonical_mime_type).
    """
    if not content or len(content) < 32:
        raise ValidationError("Uploaded file is empty or corrupted.")
    if len(content) > max_bytes:
        raise ValidationError("Image file is too large. Maximum allowed size is 5 MB.")

    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValidationError(f"Unsupported file format '{ext or 'unknown'}'. Allowed formats: JPEG, PNG, WebP.")

    if content_type:
        ct_norm = content_type.split(";")[0].strip().lower()
        if ct_norm and ct_norm not in ALLOWED_MIME_TYPES and ct_norm != "application/octet-stream":
            raise ValidationError(f"Unsupported MIME type '{ct_norm}'. Allowed: image/jpeg, image/png, image/webp.")

    is_jpeg = content.startswith(b"\xff\xd8\xff")
    is_png = content.startswith(b"\x89PNG\r\n\x1a\n")
    is_webp = content.startswith(b"RIFF") and b"WEBP" in content[:16]
    if not (is_jpeg or is_png or is_webp):
        raise ValidationError("Invalid image content. File must be a valid JPEG, PNG, or WebP image.")

    try:
        with Image.open(io.BytesIO(content)) as img_check:
            img_check.verify()
        with Image.open(io.BytesIO(content)) as img:
            fmt = (img.format or "").upper()
            if fmt not in ("JPEG", "PNG", "WEBP"):
                raise ValidationError("Unsupported image format. Allowed: JPEG, PNG, WebP.")

            # Resize proportionally if larger than max_dimensions
            img.thumbnail(max_dimensions, Image.Resampling.LANCZOS)

            out = io.BytesIO()
            if fmt == "JPEG":
                if img.mode in ("RGBA", "LA", "P"):
                    img = img.convert("RGB")
                img.save(out, format="JPEG", quality=88, optimize=True)
                return out.getvalue(), ".jpg", "image/jpeg"
            if fmt == "PNG":
                if img.mode == "P":
                    img = img.convert("RGBA")
                img.save(out, format="PNG", optimize=True)
                return out.getvalue(), ".png", "image/png"
            # WEBP
            if img.mode == "P":
                img = img.convert("RGBA")
            img.save(out, format="WEBP", quality=88, method=4)
            return out.getvalue(), ".webp", "image/webp"
    except ValidationError:
        raise
    except Exception as exc:
        log.warning("image_decode_failed", extra={"error": str(exc)})
        raise ValidationError("Invalid or corrupted image file. Please upload a valid JPEG, PNG, or WebP image.")


async def persist_media_asset(
    conn: Any,
    *,
    owner_id: uuid.UUID,
    institution_id: uuid.UUID | None,
    image_type: str,
    storage_key: str,
    content: bytes,
    mime_type: str,
) -> tuple[uuid.UUID, str]:
    """Persists image to configured object storage (with durable PostgreSQL bytea fallback) and returns (asset_id, durable_url)."""
    checksum = hashlib.sha256(content).hexdigest()
    driver_used = "postgres"
    stored_bytes: bytes | None = content

    if settings.STORAGE_DRIVER in ("s3", "supabase"):
        try:
            storage = get_storage()
            await storage.put(storage_key, content, mime_type)
            driver_used = storage.name
            stored_bytes = None
        except Exception as exc:
            log.warning(
                "external_storage_put_fallback_postgres",
                extra={"driver": settings.STORAGE_DRIVER, "key": storage_key, "error": str(exc)},
            )
            driver_used = "postgres"
            stored_bytes = content

    try:
        asset_id = await conn.fetchval(
            """
            INSERT INTO media_assets (
                id, owner_id, institution_id, image_type, storage_driver,
                storage_key, mime_type, file_size, sha256, image_bytes,
                created_at, updated_at
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, $4,
                $5, $6, $7, $8, $9,
                NOW(), NOW()
            )
            RETURNING id
            """,
            owner_id,
            institution_id,
            image_type,
            driver_used,
            storage_key,
            mime_type,
            len(content),
            checksum,
            stored_bytes,
        )
    except Exception as exc:
        log.error("media_asset_db_persist_failed", extra={"error": str(exc), "key": storage_key})
        raise ServiceUnavailable("Database persistence failed while saving image.")

    return asset_id, f"{settings.API_V1_PREFIX}/media/{asset_id}"


async def cleanup_unreferenced_asset(conn: Any, asset_id: uuid.UUID | None) -> None:
    """Deletes an old media_assets record and its external object only if no banner or user references it."""
    if not asset_id:
        return
    try:
        still_used = await conn.fetchval(
            """
            SELECT EXISTS (
                SELECT 1 FROM user_banners WHERE media_asset_id = $1
                UNION ALL
                SELECT 1 FROM users WHERE avatar_asset_id = $1
            )
            """,
            asset_id,
        )
        if still_used:
            return
        row = await conn.fetchrow(
            "DELETE FROM media_assets WHERE id = $1 RETURNING storage_driver, storage_key",
            asset_id,
        )
        if row and row["storage_driver"] in ("s3", "supabase") and row["storage_key"]:
            try:
                await get_storage().delete(row["storage_key"])
            except Exception:
                pass
    except Exception as exc:
        log.warning("media_asset_cleanup_skipped", extra={"asset_id": str(asset_id), "error": str(exc)})
