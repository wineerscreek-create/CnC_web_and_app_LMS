"""Append-only audit + security event trail (SRS §11.2, §14.4).

Persisted in PostgreSQL `audit_logs` and `security_events`.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.authz.context import ScopeContext
from app.core.logging import get_logger
from app.db.postgres import get_pg_connection
from app.repositories.audit_repo import AuditRepository

log = get_logger("app.audit")

CREATE, UPDATE, DELETE, EXPORT, LOGIN, LOGOUT, ISSUE = (
    "create", "update", "delete", "export", "login", "logout", "issue",
)


def _clean(value: Any) -> Any:
    """Never let a secret reach the audit trail, and serialize UUIDs/datetimes."""
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    redact = {"password", "passwordHash", "password_hash", "otp", "token", "refreshToken", "secret"}
    if isinstance(value, dict):
        return {k: ("[redacted]" if k in redact else _clean(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [_clean(v) for v in value]
    return value


def _to_uuid(val: Any) -> UUID | None:
    if not val:
        return None
    try:
        return UUID(str(val))
    except (ValueError, TypeError):
        return None


async def write_audit(
    ctx: ScopeContext | None,
    *,
    action: str,
    entity_type: str,
    entity_id: Any = None,
    before: Any = None,
    after: Any = None,
    detail: str | None = None,
    college_id: Any = None,
    department_id: Any = None,
    actor_label: str | None = None,
) -> None:
    try:
        from app.db.mongo import get_db
        from bson import ObjectId
        from datetime import datetime, timezone
        db = get_db()
        now_dt = datetime.now(timezone.utc)
        cid = college_id or (ctx.college_id if ctx else None)
        did = department_id or (ctx.department_id if ctx else None)
        m_cid = ObjectId(str(cid)) if cid and ObjectId.is_valid(str(cid)) else (str(cid) if cid else None)
        m_did = ObjectId(str(did)) if did and ObjectId.is_valid(str(did)) else (str(did) if did else None)
        await db.audit_logs.insert_one({
            "action": action,
            "entityType": entity_type,
            "entityId": str(entity_id) if entity_id is not None else None,
            "actorId": str(ctx.user_id) if ctx and ctx.user_id else None,
            "actorLabel": actor_label or (ctx.actor_label if ctx else "system"),
            "actorRole": str(ctx.role) if ctx and ctx.role else "SYSTEM",
            "collegeId": m_cid,
            "departmentId": m_did,
            "before": _clean(before),
            "after": _clean(after),
            "detail": detail,
            "at": now_dt,
            "createdAt": now_dt,
        })
    except Exception as e:
        print("MONGO AUDIT ERROR:", type(e), e)

    try:
        actor_id = _to_uuid(ctx.user_id if ctx else None)
        inst_id = _to_uuid(college_id or (ctx.college_id if ctx else None))
        dept_id = _to_uuid(department_id or (ctx.department_id if ctx else None))
        ent_id_str = str(entity_id) if entity_id is not None else ""

        meta = {
            "before": _clean(before),
            "after": _clean(after),
            "detail": detail,
            "actorLabel": actor_label or (ctx.actor_label if ctx else "system"),
            "actorRole": str(ctx.role) if ctx else "SYSTEM",
            "requestId": ctx.request_id if ctx else None,
        }

        await AuditRepository.log_event(
            actor_user_id=actor_id,
            action=action,
            entity_name=entity_type,
            entity_id=ent_id_str,
            institution_id=inst_id,
            department_id=dept_id,
            metadata=meta,
            ip_address=ctx.ip if ctx else None,
        )
    except Exception as exc:  # pragma: no cover - trail must never break the request
        log.error("audit_write_failed", extra={"error": str(exc), "entity": entity_type})


async def write_security_event(
    *,
    kind: str,
    user_id: Any = None,
    detail: str,
    request_id: str | None = None,
    ip: str | None = None,
    path: str | None = None,
    metadata: dict[str, Any] | None = None,
    college_id: Any = None,
    department_id: Any = None,
) -> None:
    """Security events recorded in PostgreSQL and MongoDB `security_events` table/collection."""
    try:
        from app.db.mongo import get_db
        import bson
        from datetime import datetime, timezone
        db = get_db()
        now_dt = datetime.now(timezone.utc)
        def _to_obj_id(val):
            if not val:
                return None
            try:
                return bson.ObjectId(str(val))
            except Exception:
                return val

        u_obj = _to_obj_id(user_id)
        c_obj = _to_obj_id(college_id)
        d_obj = _to_obj_id(department_id)

        if c_obj is None and u_obj is not None:
            try:
                user_doc = await db.users.find_one({"_id": u_obj})
                if user_doc:
                    c_obj = user_doc.get("collegeId")
                    d_obj = d_obj or user_doc.get("departmentId")
            except Exception:
                pass

        await db.security_events.insert_one({
            "kind": kind,
            "userId": u_obj,
            "collegeId": c_obj,
            "departmentId": d_obj,
            "detail": detail,
            "ip": ip,
            "requestId": request_id,
            "path": path,
            "metadata": _clean(metadata or {}),
            "at": now_dt,
            "createdAt": now_dt,
        })
    except Exception as e:
        pass

    try:
        u_uuid = _to_uuid(user_id)
        c_uuid = _to_uuid(college_id)
        d_uuid = _to_uuid(department_id)

        if c_uuid is None and u_uuid is not None:
            try:
                async with get_pg_connection() as conn:
                    row = await conn.fetchrow(
                        "SELECT institution_id, department_id FROM users WHERE id = $1",
                        u_uuid,
                    )
                    if row:
                        c_uuid = row["institution_id"]
                        d_uuid = d_uuid or row["department_id"]
            except Exception:
                pass

        async with get_pg_connection() as conn:
            await conn.execute(
                """
                INSERT INTO security_events (
                    kind, user_id, institution_id, department_id, detail,
                    ip_address, request_id, path, metadata, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                """,
                kind,
                u_uuid,
                c_uuid,
                d_uuid,
                detail,
                ip,
                request_id,
                path,
                _clean(metadata or {}),
            )
    except Exception as exc:  # pragma: no cover
        log.error("security_event_write_failed", extra={"error": str(exc)})
    log.warning("security_event", extra={"kind": kind, "detail": detail, "user_id": str(user_id)})
