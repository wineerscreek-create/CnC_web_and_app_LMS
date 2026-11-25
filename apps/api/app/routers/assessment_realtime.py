"""Real-Time Assessment WebSocket Router & Supervisor Monitoring Endpoints."""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any
import jwt
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status, Query
from starlette.websockets import WebSocketState

from app.authz.context import ScopeContext
from app.authz.guards import require_role
from app.authz.roles import Role
from app.core.config import settings
from app.core.errors import NotFound, ScopeForbidden, ValidationError
from app.core.logging import get_logger
from app.db.postgres import get_pg_connection
from app.repositories.assignment_quiz_repo import QuizRepository, _safe_uuid, _parse_json_dict, _parse_json_list
from app.websocket.assessment_ws import assessment_hub

log = get_logger("app.routers.assessment_realtime")

router = APIRouter()
TrainerCtx = Depends(require_role(Role.TRAINER, Role.ADMIN, Role.SUPER_ADMIN))
StudentCtx = Depends(require_role(Role.STUDENT))


async def _authorize_trainer_for_quiz(
    conn: Any,
    ctx: ScopeContext,
    q_uuid: uuid.UUID,
    select_cols: str = "id, title, creator_trainer_id, institution_id, batch_id",
) -> Any:
    quiz = await conn.fetchrow(f"SELECT {select_cols} FROM quizzes WHERE id = $1", q_uuid)
    if not quiz:
        raise NotFound("Assessment not found")

    if ctx.role not in (Role.ADMIN, Role.SUPER_ADMIN) and str(quiz["creator_trainer_id"]) != str(ctx.user_id):
        t_uuid = _safe_uuid(ctx.user_id)
        is_assigned = await conn.fetchval(
            """
            SELECT 1 FROM batch_trainers bt
            WHERE bt.trainer_user_id = $2
              AND (bt.status = 'ACTIVE' OR bt.status IS NULL)
              AND (
                  bt.batch_id = $3
                  OR bt.batch_id IN (
                      SELECT qba.batch_id FROM quiz_batch_assignments qba
                      WHERE qba.quiz_id = $1 AND UPPER(COALESCE(qba.status, 'ACTIVE')) = 'ACTIVE'
                  )
              )
            LIMIT 1
            """,
            q_uuid,
            t_uuid,
            quiz["batch_id"] if "batch_id" in quiz else None,
        )
        if not is_assigned:
            raise ScopeForbidden("You are not authorized to monitor this assessment")
    return quiz


@router.post("/{quiz_id}/monitor-token")
async def get_monitor_token(
    quiz_id: str,
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    """Issues a supervisor monitoring token for real-time live monitoring."""
    q_uuid = _safe_uuid(quiz_id)
    if not q_uuid:
        raise NotFound("Assessment not found")

    async with get_pg_connection() as conn:
        quiz = await _authorize_trainer_for_quiz(
            conn, ctx, q_uuid, "id, title, creator_trainer_id, institution_id, batch_id"
        )
        user_name = await conn.fetchval("SELECT name FROM users WHERE id = $1", _safe_uuid(ctx.user_id))

    token_claims = {
        "sub": str(ctx.user_id),
        "name": user_name or "Trainer",
        "quiz_id": str(quiz["id"]),
        "role": "trainer",
        "type": "trainer",
        "iss": "skillsharp-lms",
        "aud": "quiz-system",
    }
    monitor_token = jwt.encode(token_claims, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return {
        "success": True,
        "data": {
            "token": monitor_token,
            "quizId": str(quiz["id"]),
            "title": quiz["title"],
        },
    }


@router.get("/{quiz_id}/monitor")
async def get_assessment_monitor_data(
    quiz_id: str,
    ctx: ScopeContext = TrainerCtx,
    search: str | None = Query(None, description="Search by student name, roll number, or email"),
    status_filter: str = Query("ALL_STARTED", alias="status", description="Filter by candidate lifecycle status"),
    sort_by: str = Query("roll_number", description="Sort field: roll_number, name, progress, remaining_seconds, warnings, status, last_activity, submission_time"),
    sort_dir: str = Query("asc", description="Sort direction: asc or desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> dict[str, Any]:
    """Retrieves deduplicated, authorized, paginated live monitoring state with cohort counters."""
    q_uuid = _safe_uuid(quiz_id)
    if not q_uuid:
        raise NotFound("Assessment not found")

    if not isinstance(search, str):
        search = None
    if not isinstance(status_filter, str):
        status_filter = "ALL_STARTED"
    if not isinstance(sort_by, str):
        sort_by = "roll_number"
    if not isinstance(sort_dir, str):
        sort_dir = "asc"
    if not isinstance(page, int):
        page = 1
    if not isinstance(page_size, int):
        page_size = 50

    async with get_pg_connection() as conn:
        quiz = await _authorize_trainer_for_quiz(
            conn,
            ctx,
            q_uuid,
            "id, title, quiz_code, duration_minutes, max_score, settings, status, creator_trainer_id, batch_id, CASE WHEN jsonb_typeof(questions) = 'array' THEN jsonb_array_length(questions) ELSE 0 END AS total_questions",
        )

        # Authoritative 1-row-per-student deduplication:
        # Prioritize active in_progress attempts, then valid submitted attempts, then abandoned,
        # breaking ties by most recent activity/completion/creation timestamp.
        db_attempts = await conn.fetch(
            """
            WITH ranked_attempts AS (
                SELECT qa.id, qa.student_user_id, qa.score, qa.possible, qa.percentage, qa.passed,
                       qa.status, qa.candidate_status, qa.submission_reason, qa.submission_source,
                       qa.is_recovered, qa.warning_count, qa.completed_at, qa.local_submitted_at,
                       qa.created_at, qa.remaining_seconds, qa.camera_status, qa.last_heartbeat_at,
                       qa.last_camera_frame_at, qa.current_question_index,
                       COUNT(*) OVER (PARTITION BY qa.student_user_id) AS attempt_count,
                       ROW_NUMBER() OVER (
                           PARTITION BY qa.student_user_id
                           ORDER BY
                               CASE
                                   WHEN qa.status = 'in_progress' THEN 0
                                   WHEN qa.status = 'completed' AND COALESCE(qa.candidate_status, 'COMPLETED') IN ('COMPLETED', 'SUBMITTED', 'OFFLINE_SUBMITTED', 'AUTO_SUBMITTED') THEN 1
                                   ELSE 2
                               END ASC,
                               COALESCE(qa.completed_at, qa.last_heartbeat_at, qa.created_at) DESC,
                               qa.created_at DESC
                       ) AS rn
                FROM quiz_attempts qa
                WHERE qa.quiz_id = $1
            )
            SELECT ra.*, u.name, u.email, sp.roll_number
            FROM ranked_attempts ra
            JOIN users u ON u.id = ra.student_user_id
            LEFT JOIN student_profiles sp ON sp.user_id = ra.student_user_id
            WHERE ra.rn = 1
            ORDER BY sp.roll_number ASC NULLS LAST, u.name ASC
            """,
            q_uuid,
        )

        # Check sync_operations for any pending/failed offline assessment submissions
        pending_sync_rows = await conn.fetch(
            """
            SELECT DISTINCT user_id
            FROM sync_operations
            WHERE resource_id = $1 AND resource_type = 'ASSESSMENT_SUBMISSION' AND status IN ('PENDING', 'FAILED')
            """,
            q_uuid,
        )
        pending_sync_users = {str(r["user_id"]) for r in pending_sync_rows}

        # Aggregate count of eligible students who have NOT started yet (no rows in quiz_attempts)
        not_started_rows = await conn.fetch(
            """
            SELECT DISTINCT sp.user_id, u.name, u.email, sp.roll_number
            FROM student_profiles sp
            JOIN users u ON u.id = sp.user_id
            WHERE (
                sp.batch_id = $2
                OR sp.batch_id IN (
                    SELECT qba.batch_id FROM quiz_batch_assignments qba
                    WHERE qba.quiz_id = $1 AND UPPER(COALESCE(qba.status, 'ACTIVE')) = 'ACTIVE'
                )
            )
              AND NOT EXISTS (
                  SELECT 1 FROM quiz_attempts qa
                  WHERE qa.quiz_id = $1 AND qa.student_user_id = sp.user_id
              )
            ORDER BY sp.roll_number ASC NULLS LAST, u.name ASC
            """,
            q_uuid,
            quiz["batch_id"],
        )
        not_started_count = len(not_started_rows)

    live_students = {s["session_id"]: s for s in assessment_hub.get_monitor_data(str(q_uuid))}
    now_dt = datetime.now(timezone.utc)
    total_q = int(quiz["total_questions"] or 0)

    counters = {
        "totalCandidates": len(db_attempts) + int(not_started_count),
        "startedCount": len(db_attempts),
        "notStartedCount": int(not_started_count),
        "activeCount": 0,
        "completedCount": 0,
        "offlineSubmittedCount": 0,
        "syncPendingCount": 0,
        "autoSubmittedCount": 0,
        "abandonedCount": 0,
        "disconnectedCount": 0,
        "warningsTotal": 0,
    }

    all_candidates: list[dict[str, Any]] = []
    for att in db_attempts:
        uid = str(att["student_user_id"])
        live = live_students.get(uid)

        is_online = False
        last_seen_sec = 9999
        if live:
            is_online = bool(live.get("online"))
            last_seen_sec = int(live.get("last_seen_seconds_ago", 9999))
            if last_seen_sec > 25:
                is_online = False
        elif att["last_heartbeat_at"] and att["status"] == "in_progress":
            hb = att["last_heartbeat_at"]
            if hb.tzinfo is None:
                hb = hb.replace(tzinfo=timezone.utc)
            hb_age = int((now_dt - hb).total_seconds())
            last_seen_sec = min(last_seen_sec, max(0, hb_age))
            if hb_age <= 35:
                is_online = True

        att_status = att["status"] or "in_progress"
        raw_cand = (att["candidate_status"] or "").upper()
        sub_source = (att["submission_source"] or "ONLINE").upper()

        if att_status == "completed":
            if sub_source == "OFFLINE_SYNC" or raw_cand == "OFFLINE_SUBMITTED":
                cand_status = "OFFLINE_SUBMITTED"
                counters["offlineSubmittedCount"] += 1
            elif raw_cand == "AUTO_SUBMITTED":
                cand_status = "AUTO_SUBMITTED"
                counters["autoSubmittedCount"] += 1
            elif raw_cand == "ABANDONED":
                cand_status = "ABANDONED"
                counters["abandonedCount"] += 1
            else:
                cand_status = "COMPLETED"
                counters["completedCount"] += 1
        elif uid in pending_sync_users or raw_cand == "OFFLINE_SYNC_PENDING":
            cand_status = "OFFLINE_SYNC_PENDING"
            counters["syncPendingCount"] += 1
        elif raw_cand == "ABANDONMENT_WARNING":
            cand_status = "ABANDONMENT_WARNING"
            counters["activeCount"] += 1
        elif not is_online:
            cand_status = "DISCONNECTED"
            counters["disconnectedCount"] += 1
        else:
            cand_status = "ACTIVE"
            counters["activeCount"] += 1

        warn_cnt = int(att["warning_count"] or 0)
        counters["warningsTotal"] += warn_cnt

        is_finished = att_status == "completed"
        camera_active = bool(live.get("camera_on")) if (live and not is_finished) else False
        has_snapshot = bool(att["last_camera_frame_at"]) or bool(live and live.get("camera_on"))
        if is_finished:
            camera_stat = "DONE"
        elif cand_status == "DISCONNECTED":
            camera_stat = "HISTORICAL" if has_snapshot else "OFF"
        elif camera_active:
            camera_stat = (live.get("camera_status") if live else None) or "LIVE"
        else:
            camera_stat = "OFF"

        q_idx = live.get("current_question", att["current_question_index"] or 0) if live else (att["current_question_index"] or 0)
        rem_sec = (
            live.get("remaining_seconds", att["remaining_seconds"] or 0)
            if (live and live.get("remaining_seconds") is not None)
            else (att["remaining_seconds"] or 0)
        )

        hb_iso = None
        if live and live.get("last_seen_seconds_ago") is not None:
            hb_iso = datetime.fromtimestamp(time.time() - int(live.get("last_seen_seconds_ago", 0)), tz=timezone.utc).isoformat()
        elif att["last_heartbeat_at"]:
            hb_val = att["last_heartbeat_at"]
            if hb_val.tzinfo is None:
                hb_val = hb_val.replace(tzinfo=timezone.utc)
            hb_iso = hb_val.isoformat()
        elif att["completed_at"] or att["created_at"]:
            fb_val = att["completed_at"] or att["created_at"]
            if fb_val.tzinfo is None:
                fb_val = fb_val.replace(tzinfo=timezone.utc)
            hb_iso = fb_val.isoformat()

        all_candidates.append({
            "session_id": uid,
            "attempt_id": str(att["id"]),
            "attempt_count": int(att["attempt_count"] or 1),
            "name": att["name"],
            "email": att["email"] if ctx.role in (Role.ADMIN, Role.SUPER_ADMIN, Role.TRAINER) else None,
            "roll_number": att["roll_number"] or "—",
            "current_question": q_idx,
            "total_questions": total_q or (live.get("total_questions", 0) if live else 0),
            "remaining_seconds": 0 if is_finished else rem_sec,
            "warnings": warn_cnt,
            "camera_on": camera_active,
            "camera_status": camera_stat,
            "has_snapshot": has_snapshot,
            "last_camera_frame_at": att["last_camera_frame_at"].isoformat() if att["last_camera_frame_at"] else None,
            "fullscreen": bool(live.get("fullscreen")) if (live and not is_finished) else False,
            "online": False if is_finished else is_online,
            "status": att_status,
            "candidate_status": cand_status,
            "submission_source": sub_source,
            "submission_reason": att["submission_reason"],
            "is_recovered": bool(att["is_recovered"]),
            "score": float(att["score"]) if att["score"] is not None else None,
            "percentage": float(att["percentage"]) if att["percentage"] is not None else None,
            "passed": att["passed"],
            "completed_at": att["completed_at"].isoformat() if att["completed_at"] else None,
            "local_submitted_at": att["local_submitted_at"].isoformat() if att["local_submitted_at"] else None,
            "last_activity_at": hb_iso,
            "last_seen_seconds_ago": last_seen_sec,
            "stale": bool(not is_online and not is_finished),
        })

    # Apply search and status filters
    sf = (status_filter or "ALL_STARTED").strip().upper()
    if sf == "NOT_STARTED":
        filtered = [
            {
                "session_id": str(r["user_id"]),
                "attempt_id": "",
                "attempt_count": 0,
                "name": r["name"],
                "email": r["email"] if ctx.role in (Role.ADMIN, Role.SUPER_ADMIN, Role.TRAINER) else None,
                "roll_number": r["roll_number"] or "—",
                "current_question": 0,
                "total_questions": total_q,
                "remaining_seconds": int(quiz["duration_minutes"] or 30) * 60,
                "warnings": 0,
                "camera_on": False,
                "camera_status": "OFF",
                "has_snapshot": False,
                "last_camera_frame_at": None,
                "fullscreen": False,
                "online": False,
                "status": "not_started",
                "candidate_status": "NOT_STARTED",
                "submission_source": "ONLINE",
                "submission_reason": None,
                "is_recovered": False,
                "score": None,
                "percentage": None,
                "passed": None,
                "completed_at": None,
                "local_submitted_at": None,
                "last_activity_at": None,
                "last_seen_seconds_ago": 9999,
                "stale": False,
            }
            for r in not_started_rows
        ]
    else:
        filtered = all_candidates
        if sf == "ACTIVE":
            filtered = [c for c in filtered if c["candidate_status"] in ("ACTIVE", "ABANDONMENT_WARNING")]
        elif sf == "COMPLETED":
            filtered = [c for c in filtered if c["candidate_status"] == "COMPLETED"]
        elif sf == "OFFLINE_SUBMITTED":
            filtered = [c for c in filtered if c["candidate_status"] == "OFFLINE_SUBMITTED"]
        elif sf in ("SYNC_PENDING", "OFFLINE_SYNC_PENDING"):
            filtered = [c for c in filtered if c["candidate_status"] == "OFFLINE_SYNC_PENDING"]
        elif sf == "AUTO_SUBMITTED":
            filtered = [c for c in filtered if c["candidate_status"] == "AUTO_SUBMITTED"]
        elif sf == "ABANDONED":
            filtered = [c for c in filtered if c["candidate_status"] == "ABANDONED"]
        elif sf == "DISCONNECTED":
            filtered = [c for c in filtered if c["candidate_status"] == "DISCONNECTED"]
        elif sf == "WITH_WARNINGS":
            filtered = [c for c in filtered if c["warnings"] > 0]

    if search and search.strip():
        q_str = search.strip().lower()
        filtered = [
            c for c in filtered
            if q_str in (c["name"] or "").lower()
            or q_str in (c["roll_number"] or "").lower()
            or q_str in (c.get("email") or "").lower()
        ]

    # Server-side sorting across all 8 supported columns
    s_field = sort_by.strip().lower()
    reverse = sort_dir.strip().lower() == "desc"
    status_group_order = {
        "ACTIVE": 0,
        "ABANDONMENT_WARNING": 1,
        "DISCONNECTED": 2,
        "OFFLINE_SYNC_PENDING": 3,
        "OFFLINE_SUBMITTED": 4,
        "COMPLETED": 5,
        "AUTO_SUBMITTED": 6,
        "ABANDONED": 7,
    }

    if s_field == "name":
        filtered.sort(key=lambda c: (c["name"] or "").lower(), reverse=reverse)
    elif s_field == "progress":
        filtered.sort(key=lambda c: (int(c["current_question"] or 0), (c["roll_number"] or "").lower()), reverse=reverse)
    elif s_field == "remaining_seconds":
        filtered.sort(key=lambda c: (int(c["remaining_seconds"] or 0), (c["roll_number"] or "").lower()), reverse=reverse)
    elif s_field == "warnings":
        filtered.sort(key=lambda c: (int(c["warnings"] or 0), (c["roll_number"] or "").lower()), reverse=reverse)
    elif s_field == "status":
        filtered.sort(
            key=lambda c: (status_group_order.get(c["candidate_status"], 99), (c["roll_number"] or "").lower()),
            reverse=reverse,
        )
    elif s_field == "last_activity":
        filtered.sort(key=lambda c: c.get("last_activity_at") or "", reverse=reverse)
    elif s_field == "submission_time":
        # Keep unsubmitted records cleanly ordered when sorting by submission_time
        with_sub = [c for c in filtered if (c.get("completed_at") or c.get("local_submitted_at"))]
        without_sub = [c for c in filtered if not (c.get("completed_at") or c.get("local_submitted_at"))]
        with_sub.sort(key=lambda c: (c.get("completed_at") or c.get("local_submitted_at") or ""), reverse=reverse)
        filtered = with_sub + without_sub
    else:
        filtered.sort(key=lambda c: ((c["roll_number"] or "").lower(), (c["name"] or "").lower()), reverse=reverse)

    total_filtered = len(filtered)
    total_pages = max(1, (total_filtered + page_size - 1) // page_size)
    safe_page = min(page, total_pages)
    start_idx = (safe_page - 1) * page_size
    paginated = filtered[start_idx : start_idx + page_size]

    return {
        "success": True,
        "data": {
            "quiz": {
                "id": str(quiz["id"]),
                "name": quiz["title"],
                "code": quiz["quiz_code"],
                "status": quiz["status"],
                "durationMinutes": quiz["duration_minutes"],
                "totalQuestions": total_q,
            },
            "counters": counters,
            "pagination": {
                "page": safe_page,
                "pageSize": page_size,
                "totalFiltered": total_filtered,
                "totalPages": total_pages,
            },
            "students": paginated,
        },
    }


@router.get("/{quiz_id}/snapshots/latest")
async def get_latest_snapshots_for_candidates(
    quiz_id: str,
    student_ids: str = Query(..., description="Comma-separated student UUIDs (max 50)"),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    """Demand-based endpoint: fetches only the latest persisted camera frame for visible candidates."""
    q_uuid = _safe_uuid(quiz_id)
    if not q_uuid:
        raise NotFound("Assessment not found")

    parsed_ids = [uid for s in student_ids.split(",") if (uid := _safe_uuid(s.strip())) is not None][:50]
    if not parsed_ids:
        return {"success": True, "data": {"snapshots": {}}}

    async with get_pg_connection() as conn:
        await _authorize_trainer_for_quiz(conn, ctx, q_uuid)
        rows = await conn.fetch(
            """
            SELECT DISTINCT ON (student_user_id)
                   student_user_id, attempt_id, snapshot_timestamp, event_type, image_data
            FROM quiz_camera_snapshots
            WHERE quiz_id = $1 AND student_user_id = ANY($2::uuid[])
            ORDER BY student_user_id, snapshot_timestamp DESC
            """,
            q_uuid,
            parsed_ids,
        )

    snaps = {
        str(r["student_user_id"]): {
            "attemptId": str(r["attempt_id"]) if r["attempt_id"] else None,
            "timestamp": r["snapshot_timestamp"].isoformat() if r["snapshot_timestamp"] else None,
            "eventType": r["event_type"],
            "imageData": r["image_data"],
        }
        for r in rows
    }
    return {"success": True, "data": {"snapshots": snaps}}


@router.get("/{quiz_id}/students/{student_id}/snapshots")
async def get_student_historical_snapshots(
    quiz_id: str,
    student_id: str,
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    """Lazy-loads historical camera snapshots for a single candidate."""
    q_uuid = _safe_uuid(quiz_id)
    s_uuid = _safe_uuid(student_id)
    if not q_uuid or not s_uuid:
        raise NotFound("Assessment or candidate not found")

    async with get_pg_connection() as conn:
        await _authorize_trainer_for_quiz(conn, ctx, q_uuid)
        rows = await conn.fetch(
            """
            SELECT id, attempt_id, snapshot_timestamp, event_type, image_data
            FROM quiz_camera_snapshots
            WHERE quiz_id = $1 AND student_user_id = $2
            ORDER BY snapshot_timestamp DESC
            LIMIT 30
            """,
            q_uuid,
            s_uuid,
        )

    return {
        "success": True,
        "data": {
            "snapshots": [
                {
                    "id": str(r["id"]),
                    "attemptId": str(r["attempt_id"]) if r["attempt_id"] else None,
                    "timestamp": r["snapshot_timestamp"].isoformat() if r["snapshot_timestamp"] else None,
                    "eventType": r["event_type"],
                    "imageData": r["image_data"],
                }
                for r in rows
            ]
        },
    }


@router.get("/{quiz_id}/students/{student_id}/attempts")
async def get_student_attempt_history(
    quiz_id: str,
    student_id: str,
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    """Lazy-loads all historical attempts and recovery logs for a single candidate."""
    q_uuid = _safe_uuid(quiz_id)
    s_uuid = _safe_uuid(student_id)
    if not q_uuid or not s_uuid:
        raise NotFound("Assessment or candidate not found")

    async with get_pg_connection() as conn:
        await _authorize_trainer_for_quiz(conn, ctx, q_uuid)
        attempts = await conn.fetch(
            """
            SELECT id, score, possible, percentage, passed, status, candidate_status,
                   submission_reason, submission_source, warning_count, is_recovered,
                   created_at, completed_at, local_submitted_at, time_taken_seconds
            FROM quiz_attempts
            WHERE quiz_id = $1 AND student_user_id = $2
            ORDER BY created_at DESC
            """,
            q_uuid,
            s_uuid,
        )
        recoveries = await conn.fetch(
            """
            SELECT id, attempt_id, recovery_action, recovery_reason, created_at
            FROM quiz_recovery_logs
            WHERE quiz_id = $1 AND student_user_id = $2
            ORDER BY created_at DESC
            """,
            q_uuid,
            s_uuid,
        )

    return {
        "success": True,
        "data": {
            "attempts": [
                {
                    "attemptId": str(a["id"]),
                    "score": float(a["score"]) if a["score"] is not None else 0,
                    "possible": int(a["possible"] or 100),
                    "percentage": float(a["percentage"]) if a["percentage"] is not None else 0.0,
                    "passed": bool(a["passed"]),
                    "status": a["status"],
                    "candidateStatus": a["candidate_status"],
                    "submissionReason": a["submission_reason"],
                    "submissionSource": a["submission_source"] or "ONLINE",
                    "warningCount": int(a["warning_count"] or 0),
                    "isRecovered": bool(a["is_recovered"]),
                    "createdAt": a["created_at"].isoformat() if a["created_at"] else None,
                    "completedAt": a["completed_at"].isoformat() if a["completed_at"] else None,
                    "localSubmittedAt": a["local_submitted_at"].isoformat() if a["local_submitted_at"] else None,
                    "timeTakenSeconds": int(a["time_taken_seconds"] or 0),
                }
                for a in attempts
            ],
            "recoveryLogs": [
                {
                    "id": str(r["id"]),
                    "attemptId": str(r["attempt_id"]),
                    "action": r["recovery_action"],
                    "reason": r["recovery_reason"],
                    "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
                }
                for r in recoveries
            ],
        },
    }


@router.post("/{quiz_id}/force-end")
async def force_end_assessment(
    quiz_id: str,
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    """Force-ends an assessment, auto-submitting in-progress sessions."""
    q_uuid = _safe_uuid(quiz_id)
    if not q_uuid:
        raise NotFound("Assessment not found")

    async with get_pg_connection() as conn:
        await _authorize_trainer_for_quiz(conn, ctx, q_uuid)
        await conn.execute(
            """
            UPDATE quizzes
            SET status = 'completed',
                manually_ended = TRUE,
                ended_by = $2,
                ended_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
            """,
            q_uuid,
            _safe_uuid(ctx.user_id),
        )

    # Broadcast quiz_end to all connected sockets
    await assessment_hub.broadcast_to_students(str(q_uuid), "quiz_end", {"quiz_id": str(q_uuid)})
    await assessment_hub.broadcast_to_trainers(str(q_uuid), "quiz_end", {"quiz_id": str(q_uuid)})

    return {"success": True, "message": "Assessment concluded successfully"}


@router.websocket("/{quiz_id}/ws")
async def assessment_websocket_endpoint(
    websocket: WebSocket,
    quiz_id: str,
) -> None:
    """Native FastAPI WebSocket connection for candidates and supervisors."""
    await websocket.accept()

    # Step 1: Wait for initial authentication message
    try:
        raw_msg = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
        auth_payload = json.loads(raw_msg)
    except asyncio.TimeoutError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Auth timeout")
        return
    except Exception as e:
        log.warning("ws_auth_error", extra={"error": str(e)})
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid auth payload")
        return

    token = auth_payload.get("token")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing token")
        return

    try:
        claims = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_aud": False},
        )
    except Exception as exc:
        log.warning("ws_token_decode_failed", extra={"error": str(exc)})
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
        return

    user_id = str(claims.get("sub", ""))
    role = str(claims.get("role", "")).lower()
    token_quiz_id = str(claims.get("quiz_id", ""))

    if token_quiz_id != quiz_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Mismatched assessment")
        return

    name = claims.get("name", "User")
    roll_number = claims.get("roll_number", "—")

    if role == "student":
        duration_minutes = int(claims.get("durationMinutes", 0))
        remaining_seconds = None
        deadline_ts = None
        quiz_timing_mode = "FIXED_TOTAL"
        try:
            q_uuid_parsed = _safe_uuid(quiz_id)
            u_uuid_parsed = _safe_uuid(user_id)
            if q_uuid_parsed and u_uuid_parsed:
                async with get_pg_connection() as conn:
                    q_row = await conn.fetchrow(
                        "SELECT duration_minutes, settings, timing_mode FROM quizzes WHERE id = $1",
                        q_uuid_parsed,
                    )
                    if q_row:
                        if q_row["duration_minutes"]:
                            duration_minutes = int(q_row["duration_minutes"])
                        q_settings = _parse_json_dict(q_row["settings"]) if q_row["settings"] else {}
                        quiz_timing_mode = (
                            q_row["timing_mode"]
                            or q_settings.get("timing_mode")
                            or ("PER_QUESTION" if q_settings.get("enable_timed_questions") else "FIXED_TOTAL")
                        ).upper()

                    att_row = await conn.fetchrow(
                        "SELECT created_at, status FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
                        q_uuid_parsed,
                        u_uuid_parsed,
                    )
                    if att_row and att_row["created_at"]:
                        st_at = att_row["created_at"]
                        if st_at.tzinfo is None:
                            st_at = st_at.replace(tzinfo=timezone.utc)
                        else:
                            st_at = st_at.astimezone(timezone.utc)
                        el = max(0.0, (datetime.now(timezone.utc) - st_at).total_seconds())
                        if quiz_timing_mode == "FIXED_TOTAL":
                            remaining_seconds = max(0, int((duration_minutes * 60) - el))
                            deadline_ts = time.time() + remaining_seconds
        except Exception as e:
            log.warning("error_resolving_quiz_timing", extra={"error": str(e)})

        if duration_minutes <= 0:
            duration_minutes = 30
        if quiz_timing_mode == "FIXED_TOTAL" and remaining_seconds is None:
            remaining_seconds = duration_minutes * 60
            deadline_ts = time.time() + remaining_seconds

        await assessment_hub.register_student(
            quiz_id=quiz_id,
            user_id=user_id,
            ws=websocket,
            name=name,
            roll_number=roll_number,
            duration_minutes=duration_minutes,
            remaining_seconds=remaining_seconds,
            deadline=deadline_ts,
        )
        await websocket.send_text(
            json.dumps({
                "type": "connected",
                "role": "student",
                "data": {
                    "timing_mode": quiz_timing_mode,
                    "remaining_seconds": None if quiz_timing_mode == "PER_QUESTION" else remaining_seconds,
                    "duration_minutes": None if quiz_timing_mode == "PER_QUESTION" else duration_minutes,
                },
            })
        )

        try:
            while websocket.application_state == WebSocketState.CONNECTED:
                text = await websocket.receive_text()
                msg = json.loads(text)
                event = msg.get("event") or msg.get("type")
                data = msg.get("data") or {}

                if event == "camera_snapshot":
                    frame = data.get("snapshot") or data.get("frame")
                    etype = data.get("event_type") or data.get("eventType") or "PERIODIC"
                    if frame:
                        await assessment_hub.handle_snapshot(quiz_id, user_id, frame, event_type=etype)

                elif event == "heartbeat":
                    remaining = await assessment_hub.handle_heartbeat(quiz_id, user_id)
                    ack_id = msg.get("id")
                    await websocket.send_text(
                        json.dumps({"type": "ack", "id": ack_id, "data": {"remaining_seconds": remaining}})
                    )

                elif event == "status":
                    cam_on = data.get("camera_on")
                    fs = data.get("fullscreen")
                    await assessment_hub.handle_status_change(quiz_id, user_id, cam_on, fs)

                elif event == "warning":
                    wtype = data.get("warning_type", "general")
                    count = data.get("count", 1)
                    await assessment_hub.handle_warning(quiz_id, user_id, wtype, count)

                elif event == "answer_saved":
                    qid = data.get("question_id", "")
                    qidx = data.get("current_index", 0)
                    await assessment_hub.handle_answer_saved(quiz_id, user_id, qid, qidx)

                elif event == "abandonment_warning":
                    grace = int(data.get("grace_seconds", 20))
                    await assessment_hub.handle_abandonment_warning(quiz_id, user_id, grace)

                elif event == "abandonment_cancel":
                    await assessment_hub.handle_abandonment_cancel(quiz_id, user_id)

                elif event == "submit":
                    await assessment_hub.handle_submit(quiz_id, user_id, data)

        except (WebSocketDisconnect, asyncio.CancelledError):
            pass
        except Exception as e:
            log.warning("student_ws_loop_error", extra={"error": str(e)})
        finally:
            await assessment_hub.unregister_student(quiz_id, user_id, websocket)

    elif role in ("trainer", "admin", "super_admin"):
        await assessment_hub.register_trainer(quiz_id=quiz_id, ws=websocket, user_id=user_id)
        await websocket.send_text(json.dumps({"type": "connected", "role": "trainer"}))

        try:
            while websocket.application_state == WebSocketState.CONNECTED:
                # Trainers predominantly receive; discard or handle incoming pings
                await websocket.receive_text()
        except (WebSocketDisconnect, asyncio.CancelledError):
            pass
        except Exception as e:
            log.warning("trainer_ws_loop_error", extra={"error": str(e)})
        finally:
            await assessment_hub.unregister_trainer(quiz_id, websocket)
    else:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized role")
