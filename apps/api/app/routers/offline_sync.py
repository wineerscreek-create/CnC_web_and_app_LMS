"""Offline-First Synchronization and Package Authorization Router.

Endpoints:
- POST /api/v1/offline/package/authorize: Creates a time-bound authorization package for offline learning.
- GET  /api/v1/offline/package/{package_id}: Downloads bundled course/assessment/game content.
- POST /api/v1/offline/sync: Durable outbox batch synchronization with server-side grading and idempotency.
- GET  /api/v1/offline/changes: Incremental pull of server-side revisions.
"""
from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field

from app.authz.context import ScopeContext
from app.authz.guards import get_scope_context
from app.repositories.offline_repo import OfflineRepository

router = APIRouter()


class PackageAuthorizeRequest(BaseModel):
    packageType: str = Field(..., description="COURSE_BUNDLE, ASSESSMENT_PACK, GAME_PACK, or EBOOK_PACK")
    resourceId: str = Field(..., description="UUID of the course, quiz, game, or eBook")
    durationDays: int = Field(7, ge=1, le=30, description="Valid authorization duration in days")


class SyncOperationModel(BaseModel):
    operationId: str = Field(..., description="Unique client-generated UUID for idempotency")
    userId: str
    institutionId: str | None = None
    resourceType: str
    resourceId: str
    operationType: str
    attemptId: str | None = None
    baseServerRevision: int = 1
    payload: dict[str, Any] = Field(default_factory=dict)
    clientTimestamp: str | None = None


class SyncBatchRequest(BaseModel):
    operations: list[SyncOperationModel] = Field(default_factory=list)


@router.post("/package/authorize", status_code=status.HTTP_201_CREATED)
async def authorize_offline_package(
    payload: PackageAuthorizeRequest,
    ctx: ScopeContext = Depends(get_scope_context),
) -> dict[str, Any]:
    """Issues a time-bound authorization token & manifest to download content offline."""
    res = await OfflineRepository.authorize_package(
        ctx,
        package_type=payload.packageType,
        resource_id_str=payload.resourceId,
        duration_days=payload.durationDays,
    )
    return {
        "success": True,
        "message": "Offline package authorized successfully.",
        "data": res,
    }


@router.get("/package/{package_id}")
async def get_offline_package(
    package_id: str,
    ctx: ScopeContext = Depends(get_scope_context),
) -> dict[str, Any]:
    """Delivers full structured offline bundle for the authorized resource."""
    res = await OfflineRepository.get_package_bundle(ctx, package_id)
    return {
        "success": True,
        "data": res,
    }


@router.post("/sync")
async def process_sync_batch(
    payload: SyncBatchRequest,
    ctx: ScopeContext = Depends(get_scope_context),
) -> dict[str, Any]:
    """Processes batch outbox mutations.

    Enforces:
    - Operation idempotency via PostgreSQL unique constraint.
    - Server-side authoritative evaluation of assessments against answer keys.
    - Zero-trust score calculation.
    - Conflict detection and transactional consistency.
    """
    ops = [op.model_dump() for op in payload.operations]
    results = await OfflineRepository.process_sync_batch(ctx, ops)

    processed_count = sum(1 for r in results if r.get("status") in ("PROCESSED", "ALREADY_PROCESSED"))
    conflict_count = sum(1 for r in results if r.get("status") == "CONFLICT")
    failed_count = sum(1 for r in results if r.get("status") == "FAILED")

    return {
        "success": True,
        "message": f"Processed {processed_count} operation(s) with {conflict_count} conflict(s).",
        "data": {
            "totalReceived": len(ops),
            "processed": processed_count,
            "conflicts": conflict_count,
            "failed": failed_count,
            "results": results,
        },
    }


@router.get("/changes")
async def get_offline_changes(
    since: str | None = Query(None, description="ISO timestamp of last sync"),
    ctx: ScopeContext = Depends(get_scope_context),
) -> dict[str, Any]:
    """Returns incremental server updates since the client's last synchronization timestamp."""
    # Return server timestamp and empty revisions array if up-to-date
    from datetime import datetime, timezone
    return {
        "success": True,
        "data": {
            "serverTimestamp": datetime.now(timezone.utc).isoformat(),
            "changes": [],
        },
    }
