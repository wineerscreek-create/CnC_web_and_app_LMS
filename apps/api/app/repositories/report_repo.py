"""PostgreSQL-native Report Repository.

Tracks and serves synchronous and asynchronous report generation jobs,
scoped strictly by tenant role (Super Admin, Institution Admin, SPOC, Trainer, Student).
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Sequence

from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.core.config import settings
from app.core.errors import NotFound, ValidationError
from app.core.logging import get_logger
from app.db.postgres import get_pg_connection
from app.services.reports import REPORT_FAMILIES, build_dataset, render
from app.services.storage import Keys, put_object, signed_url

log = get_logger("app.report_repo")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_uuid(val: Any) -> uuid.UUID | None:
    if not val:
        return None
    try:
        return uuid.UUID(str(val))
    except (ValueError, TypeError):
        return None


class ReportRepository:
    @classmethod
    async def request_report(
        cls,
        ctx: ScopeContext,
        *,
        report_type: str,
        fmt: str,
        filters: dict[str, Any] | None = None,
        force_async: bool = False,
    ) -> dict[str, Any]:
        fmt = (fmt or "xlsx").lower()
        if fmt not in ("xlsx", "csv", "pdf"):
            raise ValidationError(f"Unsupported report format '{fmt}'")

        rtype = (report_type or "").strip().lower()
        clean_filters = {k: v for k, v in (filters or {}).items() if v not in (None, "")}

        inst_uuid = _safe_uuid(ctx.college_id)
        dept_uuid = _safe_uuid(ctx.department_id)
        user_uuid = _safe_uuid(ctx.user_id)

        job_uuid = uuid.uuid4()
        async with get_pg_connection() as conn:
            await conn.execute(
                """
                INSERT INTO report_jobs (
                    id, institution_id, department_id, requested_by, requested_by_role,
                    report_type, format, status, filters, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, 'processing', $8, NOW(), NOW()
                )
                """,
                job_uuid,
                inst_uuid,
                dept_uuid,
                user_uuid,
                str(ctx.role),
                rtype,
                fmt,
                json.dumps(clean_filters),
            )

        # Build dataset
        columns, rows, title = await build_dataset(ctx, rtype, clean_filters)

        # Prepare meta & render
        meta = {
            "Report": title,
            "Generated at": _now().strftime("%d %b %Y, %H:%M UTC"),
            "Requested by": ctx.actor_label,
            "Scope": f"college={ctx.college_id} department={ctx.department_id or 'all'}",
            "Filters": str(clean_filters or "none"),
            "Rows": len(rows),
            "Scoring version": settings.SCORING_VERSION,
        }
        if not rows:
            meta["Notice"] = "No data available for the selected filters."
        subtitle = f"Generated {meta['Generated at']} · {len(rows)} row(s) · scoped to the requester"

        content, mime = render(
            fmt, title=title, subtitle=subtitle, columns=columns, rows=rows, meta=meta
        )

        key = Keys.report(str(job_uuid), fmt)
        stored = await put_object(key, content, mime)
        filename = f"{rtype}-{_now():%Y%m%d-%H%M}.{fmt}"

        async with get_pg_connection() as conn:
            await conn.execute(
                """
                UPDATE report_jobs
                SET status = 'ready',
                    row_count = $2,
                    storage_key = $3,
                    filename = $4,
                    updated_at = NOW()
                WHERE id = $1
                """,
                job_uuid,
                len(rows),
                stored.key,
                filename,
            )

        download_url = await signed_url(stored.key, filename=filename)

        msg = "No data available for the selected filters." if not rows else None
        return {
            "id": str(job_uuid),
            "status": "ready",
            "reportType": rtype,
            "format": fmt,
            "storageKey": stored.key,
            "filename": filename,
            "downloadUrl": download_url,
            "rowCount": len(rows),
            "async": False,
            **({"message": msg} if msg else {}),
        }

    @classmethod
    async def list_reports(
        cls,
        ctx: ScopeContext,
        *,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        page = max(1, page)
        page_size = min(100, max(1, page_size))
        offset = (page - 1) * page_size

        conditions = ["1=1"]
        params: list[Any] = []

        if ctx.role == Role.SUPER_ADMIN:
            pass
        elif ctx.role in (Role.ADMIN, Role.HOD):
            inst_uuid = _safe_uuid(ctx.college_id)
            if inst_uuid:
                params.append(inst_uuid)
                conditions.append(f"institution_id = ${len(params)}")
            if ctx.role == Role.HOD:
                dept_ids = [_safe_uuid(d) for d in ctx.department_ids if _safe_uuid(d)]
                if dept_ids:
                    params.append(dept_ids)
                    conditions.append(f"(department_id = ANY(${len(params)}) OR department_id IS NULL)")
        elif ctx.role in (Role.TRAINER, Role.STUDENT):
            user_uuid = _safe_uuid(ctx.user_id)
            if user_uuid:
                params.append(user_uuid)
                conditions.append(f"requested_by = ${len(params)}")

        where_clause = " AND ".join(conditions)

        async with get_pg_connection() as conn:
            total = await conn.fetchval(f"SELECT COUNT(*) FROM report_jobs WHERE {where_clause}", *params)

            q_params = list(params)
            q_params.append(page_size)
            limit_idx = len(q_params)
            q_params.append(offset)
            offset_idx = len(q_params)

            rows = await conn.fetch(
                f"""
                SELECT id, institution_id, department_id, requested_by, requested_by_role,
                       report_type, format, status, filters, row_count, storage_key, filename,
                       error, created_at, updated_at
                FROM report_jobs
                WHERE {where_clause}
                ORDER BY created_at DESC
                LIMIT ${limit_idx} OFFSET ${offset_idx}
                """,
                *q_params,
            )

        items = []
        for r in rows:
            item = {
                "id": str(r["id"]),
                "reportType": r["report_type"],
                "format": r["format"],
                "status": r["status"],
                "filters": r["filters"] if isinstance(r["filters"], dict) else {},
                "rowCount": r["row_count"],
                "storageKey": r["storage_key"],
                "filename": r["filename"],
                "error": r["error"],
                "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
                "updatedAt": r["updated_at"].isoformat() if r["updated_at"] else None,
            }
            if r["status"] == "ready" and r["storage_key"]:
                item["downloadUrl"] = await signed_url(r["storage_key"], filename=r["filename"])
            items.append(item)

        total_int = int(total or 0)
        return {
            "items": items,
            "total": total_int,
            "page": page,
            "pageSize": page_size,
            "pages": max(1, (total_int + page_size - 1) // page_size),
        }
