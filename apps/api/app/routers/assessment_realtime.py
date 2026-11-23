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
        quiz = await conn.fetchrow(
            "SELECT id, title, creator_trainer_id, institution_id FROM quizzes WHERE id = $1",
            q_uuid,
        )
        if not quiz:
            raise NotFound("Assessment not found")

        # Verify trainer authorization: must be creator, admin, or assigned to one of quiz's batches
        if ctx.role not in (Role.ADMIN, Role.SUPER_ADMIN) and str(quiz["creator_trainer_id"]) != str(ctx.user_id):
            is_assigned = await conn.fetchval(
                """
                SELECT 1 FROM quiz_batch_assignments qba
                JOIN batch_trainers bt ON bt.batch_id = qba.batch_id
                WHERE qba.quiz_id = $1 AND bt.trainer_user_id = $2 AND (bt.status = 'ACTIVE' OR bt.status IS NULL)
                """,
                q_uuid, _safe_uuid(ctx.user_id)
            )
            if not is_assigned:
                raise ScopeForbidden("You are not authorized to monitor this assessment")

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
) -> dict[str, Any]:
    """Retrieves live monitoring state: merges live memory candidates with database attempts."""
    q_uuid = _safe_uuid(quiz_id)
    if not q_uuid:
        raise NotFound("Assessment not found")

    async with get_pg_connection() as conn:
        quiz = await conn.fetchrow(
            "SELECT id, title, quiz_code, duration_minutes, max_score, settings FROM quizzes WHERE id = $1",
            q_uuid,
        )
        if not quiz:
            raise NotFound("Assessment not found")

        # Fetch all database attempts for this assessment
        db_attempts = await conn.fetch(
            """
            SELECT qa.id, qa.student_user_id, u.name, sp.roll_number,
                   qa.score, qa.possible, qa.percentage, qa.passed,
                   qa.status, qa.candidate_status, qa.submission_reason,
                   qa.is_recovered, qa.warning_count, qa.completed_at, qa.created_at,
                   qa.remaining_seconds, qa.camera_status, qa.last_heartbeat_at
            FROM quiz_attempts qa
            JOIN users u ON u.id = qa.student_user_id
            LEFT JOIN student_profiles sp ON sp.user_id = qa.student_user_id
            WHERE qa.quiz_id = $1
            """,
            q_uuid,
        )

    # Get live candidate states from in-memory hub
    live_students = {s["session_id"]: s for s in assessment_hub.get_monitor_data(str(q_uuid))}

    merged: list[dict[str, Any]] = []
    now_ts = time.time()

    # ONLY candidates who have an actual attempt in quiz_attempts appear in live monitoring
    for att in db_attempts:
        uid = str(att["student_user_id"])
        live = live_students.get(uid)

        # Determine online and freshness status
        is_online = False
        last_seen_sec = 9999
        if live:
            is_online = bool(live.get("online"))
            last_seen_sec = int(live.get("last_seen_seconds_ago", 9999))
            if last_seen_sec > 25:
                is_online = False

        att_status = att["status"] or "in_progress"
        if att_status == "completed":
            cand_status = att["candidate_status"] or "COMPLETED"
        elif not is_online:
            cand_status = "DISCONNECTED"
        else:
            cand_status = att["candidate_status"] or "IN_PROGRESS"

        camera_active = bool(live.get("camera_on")) if live else False
        camera_stat = (live.get("camera_status") if live else None) or (att["camera_status"] if "camera_status" in att and att["camera_status"] else None) or ("ON" if camera_active else "OFF")

        merged.append({
            "session_id": uid,
            "attempt_id": str(att["id"]),
            "name": att["name"],
            "roll_number": att["roll_number"] or "—",
            "current_question": live.get("current_question", 0) if live else 0,
            "total_questions": live.get("total_questions", 0) if live else 0,
            "remaining_seconds": live.get("remaining_seconds", att["remaining_seconds"] or 0) if (live and live.get("remaining_seconds") is not None) else (att["remaining_seconds"] or 0),
            "warnings": att["warning_count"] or 0,
            "camera_on": camera_active,
            "camera_status": camera_stat,
            "fullscreen": bool(live.get("fullscreen")) if live else False,
            "online": is_online,
            "status": att_status,
            "candidate_status": cand_status,
            "submission_reason": att["submission_reason"],
            "is_recovered": bool(att["is_recovered"]),
            "score": float(att["score"]) if att["score"] is not None else None,
            "percentage": float(att["percentage"]) if att["percentage"] is not None else None,
            "passed": att["passed"],
            "completed_at": att["completed_at"].isoformat() if att["completed_at"] else None,
            "last_seen_seconds_ago": last_seen_sec,
            "stale": bool(not is_online and att_status == "in_progress"),
        })

    return {
        "success": True,
        "data": {
            "quiz": {
                "id": str(quiz["id"]),
                "name": quiz["title"],
                "code": quiz["quiz_code"],
                "durationMinutes": quiz["duration_minutes"],
            },
            "students": merged,
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
        await conn.execute(
            "UPDATE quizzes SET status = 'completed', updated_at = NOW() WHERE id = $1",
            q_uuid,
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

        # Send existing latest snapshots so trainer monitor immediately displays active feeds
        for s_event in assessment_hub.get_latest_snapshots(quiz_id).values():
            await websocket.send_text(json.dumps({"event": "camera_snapshot", "data": s_event}))

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
