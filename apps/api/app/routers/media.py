"""Durable Media Asset Delivery Router."""
from __future__ import annotations

import uuid

from fastapi import APIRouter
from fastapi.responses import Response

from app.core.errors import NotFound, ServiceUnavailable
from app.db.postgres import get_pg_connection
from app.services.storage import get_storage

router = APIRouter(prefix="/media", tags=["Media"])


@router.get("/{asset_id}")
async def get_media_asset(asset_id: str) -> Response:
    """Streams a durable banner or profile avatar asset by UUID without expiring URLs."""
    try:
        asset_uuid = uuid.UUID(asset_id)
    except ValueError as exc:
        raise NotFound("Media asset not found") from exc

    async with get_pg_connection() as conn:
        row = await conn.fetchrow(
            """
            SELECT storage_driver, storage_key, mime_type, image_bytes
            FROM media_assets
            WHERE id = $1
            """,
            asset_uuid,
        )

    if not row:
        raise NotFound("Media asset not found")

    content: bytes
    if row["image_bytes"] is not None:
        content = bytes(row["image_bytes"])
    else:
        try:
            content = await get_storage().get(row["storage_key"])
        except Exception as exc:
            raise ServiceUnavailable("Media asset is temporarily unavailable") from exc

    return Response(
        content=content,
        media_type=row["mime_type"] or "image/jpeg",
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
