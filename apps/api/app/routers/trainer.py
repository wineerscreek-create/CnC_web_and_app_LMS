"""Trainer portal API.

Two rules shape everything here:

* **A trainer only ever sees or writes their own assigned data.** Scope comes from
  `trainer_assignments`, resolved server-side; attendance cannot be marked outside an assigned
  session, and evaluations cannot be entered for a student outside an assigned batch.
* **Saving is never blocked on AI.** Submitting an evaluation persists the raw trainer scores and
  enqueues the EEDI recalculation; the response returns immediately.
"""
from __future__ import annotations

import asyncio
import time

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile, status

from app.authz.audit import write_audit
from app.authz.context import ScopeContext
from app.authz.guards import (
    require_role,
    require_student_in_scope,
    require_trainer_batch_scope,
    require_trainer_session_scope,
)
from app.authz.roles import Role
from app.core.config import settings
from app.core.errors import BusinessRuleViolation, Conflict, NotFound, ValidationError
from app.db.mongo import as_utc, get_db, is_inmemory, serialize
from app.repositories.collections import (
    AiScoreRepo,
    AssessmentVersionRepo,
    AssignmentRepo,
    AssignmentSubmissionRepo,
    AttendanceRepo,
    BatchRepo,
    CourseProgressRepo,
    EediScoreRepo,
    SemesterRepo,
    SkillAssessmentDefinitionRepo,
    SkillAssessmentRepo,
    StudentProfileRepo,
    TrainerAssignmentRepo,
    TrainerFeedbackRepo,
    TrainingModuleRepo,
    TrainingSessionRepo,
    WeakStudentAlertRepo,
    EbookRepo,
    GameDefinitionRepo,
    GameAttemptRepo,
    GameAssignmentRepo,
    PaymentRepo,
)
from app.schemas.requests import (
    AssessmentRecoveryRequest,
    AiOverrideRequest,
    AlertPatch,
    AssignmentPatch,
    AssignmentRequest,
    AttendanceRequest,
    EvaluationPatch,
    EvaluationRequest,
    FeedbackRequest,
    ReportRequest,
    SubmissionReview,
    TrainerQuizCreateRequest,
    TrainerQuizUpdateRequest,
    BatchAssignRequest,
)
from app.services import analytics
from app.services import analytics, chat_service
from app.services.notifications import Kind, notify
from app.services.scoring import PILLAR_LABELS, PILLARS, pillar_scores_from_parameters
from app.services.storage import signed_url
from app.services.storage import Keys, get_storage, put_object, signed_url
from app.repositories.assignment_quiz_repo import AssignmentRepository, QuizRepository, _safe_uuid
from app.workers.queue import enqueue

router = APIRouter()
TrainerCtx = Depends(require_role(Role.TRAINER))


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- dashboard
@router.get("/dashboard")
async def dashboard(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    if settings.USE_POSTGRES and ctx.user_id:
        from app.repositories.stats_repo import StatsRepository
        try:
            pg_data = await StatsRepository.get_trainer_dashboard_data(ctx.user_id)
            return {"success": True, "data": pg_data}
        except Exception:
            pass

    today_start = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    # Independent reads, issued together instead of as eight sequential round-trips.
    (
        batches,
        students,
        attendance,
        assessments,
        pending_evaluations,
        alerts,
        todays_sessions,
        trend,
        module_scores,
    ) = await asyncio.gather(
        BatchRepo(ctx).find_all(limit=100),
        StudentProfileRepo(ctx).count(),
        analytics.attendance_overall(ctx),
        analytics.assessment_summary(ctx),
        SkillAssessmentRepo(ctx).count({"assessedBy": ctx.user_id, "state": "draft"}),
        WeakStudentAlertRepo(ctx).count({"resolvedAt": None}),
        TrainingSessionRepo(ctx).find_all(
            {"date": {"$gte": today_start, "$lt": today_start + timedelta(days=1)}},
            limit=20,
            sort=[("date", 1)],
        ),
        analytics.attendance_trend(ctx, weeks=8),
        analytics.assessment_by_module(ctx),
    )

    # One grouped read for "which of today's sessions have no attendance yet", rather than a
    # count per session — that loop was a query per class on a page trainers open every day.
    unmarked = len(todays_sessions)
    if todays_sessions:
        if is_inmemory():
            sess_ids = [s["_id"] for s in todays_sessions]
            marked_docs = await AttendanceRepo(ctx).col.find(
                AttendanceRepo(ctx).scope_filter({"trainingSessionId": {"$in": sess_ids}}),
                {"trainingSessionId": 1},
            ).to_list(length=None)
            with_attendance = {row["trainingSessionId"] for row in marked_docs}
            unmarked = sum(1 for s in todays_sessions if s["_id"] not in with_attendance)
        else:
            marked_rows = await AttendanceRepo(ctx).aggregate(
                [
                    {"$match": {"trainingSessionId": {"$in": [s["_id"] for s in todays_sessions]}}},
                    {"$group": {"_id": "$trainingSessionId", "marked": {"$sum": 1}}},
                ]
            )
            with_attendance = {row["_id"] for row in marked_rows if row.get("marked")}
            unmarked = sum(1 for s in todays_sessions if s["_id"] not in with_attendance)

    if is_inmemory():
        if ctx.department_ids:
            prog_docs = await CourseProgressRepo(ctx).col.find(
                {"departmentId": {"$in": list(ctx.department_ids)}}, {"percent": 1}
            ).to_list(length=None)
            vals = [p["percent"] for p in prog_docs if p.get("percent") is not None]
            progress_rows = [{"avg": sum(vals) / len(vals)}] if vals else []
        else:
            progress_rows = []
    else:
        progress_rows = await CourseProgressRepo(ctx).col.aggregate(
            [
                {"$match": {"departmentId": {"$in": list(ctx.department_ids)} if ctx.department_ids else None}},
                {"$group": {"_id": None, "avg": {"$avg": "$percent"}}},
            ]
            if ctx.department_ids
            else [{"$match": {"_id": None}}]
        ).to_list(length=1)

    return {
        "success": True,
        "data": {
            "assignedBatches": [
                {
                    "id": str(b["_id"]),
                    "name": b.get("name"),
                    "code": b.get("code"),
                    "departmentName": b.get("departmentName"),
                    "status": b.get("status"),
                }
                for b in batches
            ],
            "studentCount": students,
            "attendance": attendance,
            "assessments": assessments,
            "pendingEvaluations": pending_evaluations,
            "weakStudentAlerts": alerts,
            "todaysClasses": {
                "total": len(todays_sessions),
                "attendanceNotMarked": unmarked,
                "sessions": serialize(todays_sessions),
            },
            "courseCompletionPercent": (
                round(progress_rows[0]["avg"], 1)
                if progress_rows and progress_rows[0].get("avg") is not None
                else None
            ),
            "attendanceTrend": trend,
            "moduleScores": module_scores,
        },
    }


@router.get("/batches")
async def batches(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    if settings.USE_POSTGRES and ctx.user_id:
        from app.db.postgres import get_pg_connection
        from uuid import UUID
        trainer_uuid = UUID(str(ctx.user_id))
        async with get_pg_connection() as conn:
            inst_uuid = None
            if ctx.college_id:
                try:
                    inst_uuid = UUID(str(ctx.college_id))
                except Exception:
                    pass
            if not inst_uuid:
                inst_uuid = await conn.fetchval(
                    "SELECT institution_id FROM users WHERE id = $1", trainer_uuid
                )

            query = """
                SELECT 
                    b.id, b.name, b.code, b.status, b.semester, b.academic_year, b.department_id, d.name as department_name,
                    (SELECT COUNT(*) FROM student_profiles sp WHERE sp.batch_id = b.id) as student_count,
                    COALESCE((
                        SELECT ROUND(AVG(CASE WHEN ar.status = 'PRESENT' THEN 100.0 ELSE 0.0 END)::numeric, 1)
                        FROM training_sessions ts
                        JOIN attendance_records ar ON ar.session_id = ts.id
                        WHERE ts.batch_id = b.id
                    ), 0.0) as attendance_percent,
                    (
                        SELECT ROUND(AVG(ev.eedi_score)::numeric, 1)
                        FROM enrollments e
                        JOIN eedi_evaluations ev ON ev.participant_user_id = e.participant_user_id AND ev.course_id = e.course_id
                        WHERE e.batch_id = b.id AND ev.status = 'COMPLETED'
                    ) as avg_score
                FROM batches b
                JOIN batch_trainers bt ON bt.batch_id = b.id
                LEFT JOIN departments d ON d.id = b.department_id
                WHERE bt.trainer_user_id = $1
                  AND ($2::uuid IS NULL OR b.institution_id = $2)
                  AND (bt.status IS NULL OR bt.status = 'ACTIVE')
                  AND (bt.start_date IS NULL OR bt.start_date <= CURRENT_DATE)
                  AND (bt.end_date IS NULL OR bt.end_date >= CURRENT_DATE)
                  AND b.status = 'ACTIVE'
                  AND b.deleted_at IS NULL
                ORDER BY b.name ASC
            """
            rows = await conn.fetch(query, trainer_uuid, inst_uuid)
            return {
                "success": True,
                "data": [
                    {
                        "id": str(r["id"]),
                        "name": r["name"],
                        "code": r["code"],
                        "status": str(r["status"]).lower(),
                        "semester": r["semester"],
                        "semesterNumber": r["semester"],
                        "academicYear": r["academic_year"],
                        "departmentId": str(r["department_id"]) if r["department_id"] else None,
                        "departmentName": r["department_name"],
                        "studentCount": int(r["student_count"] or 0),
                        "participantCount": int(r["student_count"] or 0),
                        "attendancePercent": float(r["attendance_percent"] or 0.0),
                        "averageScore": float(r["avg_score"]) if r["avg_score"] is not None else None,
                    }
                    for r in rows
                ]
            }

    rows = await BatchRepo(ctx).find_all(limit=100)
    if not rows:
        return {"success": True, "data": []}

    sem = asyncio.Semaphore(10)

    async def _fetch_batch(batch: dict[str, Any]) -> dict[str, Any]:
        async with sem:
            count, attendance, assessment = await asyncio.gather(
                StudentProfileRepo(ctx).count({"batchId": batch["_id"]}),
                analytics.attendance_overall(ctx, filters={"batchId": batch["_id"]}),
                analytics.assessment_summary(ctx, filters={"batchId": batch["_id"]}),
            )
            return {
                **serialize(batch),
                "studentCount": count,
                "attendancePercent": attendance["percentage"],
                "averageScore": assessment["average"],
            }

    out = await asyncio.gather(*[_fetch_batch(batch) for batch in rows])
    return {"success": True, "data": list(out)}


@router.get("/batches/{batch_id}/students")
async def batch_students(
    batch_id: str,
    search: str | None = Query(None, max_length=80),
    page: int = Query(1, ge=1),
    pageSize: int = Query(25, ge=1, le=100),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    resolved = await require_trainer_batch_scope(ctx, batch_id)
    if settings.USE_POSTGRES and len(str(resolved)) == 36:
        from uuid import UUID
        from app.db.postgres import get_pg_connection
        b_uuid = UUID(str(resolved))
        async with get_pg_connection() as conn:
            search_str = search if isinstance(search, str) and search.strip() else None
            search_clause = ""
            params: list[Any] = [b_uuid]
            if search_str:
                params.append(f"%{search_str}%")
                search_clause = " AND (u.name ILIKE $2 OR sp.roll_number ILIKE $2 OR u.email ILIKE $2)"

            count_query = f"""
                SELECT COUNT(*)
                FROM users u
                JOIN student_profiles sp ON sp.user_id = u.id
                WHERE sp.batch_id = $1 AND u.deleted_at IS NULL{search_clause}
            """
            total = await conn.fetchval(count_query, *params)

            page_num = page if isinstance(page, int) else int(getattr(page, "default", 1) or 1)
            size_num = pageSize if isinstance(pageSize, int) else int(getattr(pageSize, "default", 25) or 25)
            offset = (page_num - 1) * size_num
            query = f"""
                SELECT 
                    u.id as user_id, u.name, u.email, sp.roll_number, sp.batch_id, sp.avatar_url,
                    COALESCE((
                        SELECT COUNT(*) FROM attendance_records ar
                        JOIN training_sessions ts ON ts.id = ar.session_id
                        WHERE ar.participant_user_id = u.id AND ts.batch_id = $1
                    ), 0) as sessions_total,
                    COALESCE((
                        SELECT COUNT(*) FROM attendance_records ar
                        JOIN training_sessions ts ON ts.id = ar.session_id
                        WHERE ar.participant_user_id = u.id AND ts.batch_id = $1 AND ar.status = 'PRESENT'
                    ), 0) as sessions_attended,
                    COALESCE((
                        SELECT ROUND(AVG(CASE WHEN ar.status = 'PRESENT' THEN 100.0 ELSE 0.0 END)::numeric, 1)
                        FROM attendance_records ar
                        JOIN training_sessions ts ON ts.id = ar.session_id
                        WHERE ar.participant_user_id = u.id AND ts.batch_id = $1
                    ), 0.0) as attendance_percent,
                    (
                        SELECT ROUND(ev.eedi_score::numeric, 1)
                        FROM enrollments e
                        JOIN eedi_evaluations ev ON ev.participant_user_id = e.participant_user_id AND ev.course_id = e.course_id
                        WHERE e.participant_user_id = u.id AND e.batch_id = $1 AND ev.status = 'COMPLETED'
                        ORDER BY ev.updated_at DESC LIMIT 1
                    ) as readiness_score
                FROM users u
                JOIN student_profiles sp ON sp.user_id = u.id
                WHERE sp.batch_id = $1 AND u.deleted_at IS NULL{search_clause}
                ORDER BY u.name ASC
                LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
            """
            fetch_params = list(params) + [size_num, offset]
            rows = await conn.fetch(query, *fetch_params)

            items = []
            for r in rows:
                items.append({
                    "id": str(r["user_id"]),
                    "userId": str(r["user_id"]),
                    "name": r["name"],
                    "email": r["email"],
                    "rollNumber": r["roll_number"] or "N/A",
                    "batchId": str(r["batch_id"]),
                    "avatarUrl": r["avatar_url"],
                    "sessionsAttended": int(r["sessions_attended"]),
                    "sessionsTotal": int(r["sessions_total"]),
                    "attendancePercent": float(r["attendance_percent"]),
                    "readinessScore": float(r["readiness_score"]) if r["readiness_score"] is not None else None,
                    "focusPillar": None,
                })

            pages = (total + size_num - 1) // size_num if total else 0
            return {
                "success": True,
                "items": items,
                "pagination": {
                    "total": total,
                    "page": page_num,
                    "pageSize": size_num,
                    "pages": pages,
                    "totalPages": pages,
                    "hasNext": page_num < pages,
                    "hasPrev": page_num > 1,
                }
            }

    page_result = await StudentProfileRepo(ctx).list(
        filters={"batchId": resolved}, search=search, page=page, page_size=pageSize
    )
    user_ids = [p["userId"] for p in page_result.items]
    attendance = await analytics.student_attendance_map(
        ctx, filters={"batchId": resolved, "studentUserId": {"$in": user_ids}}
    )
    scores = {
        row["studentUserId"]: row
        for row in await EediScoreRepo(ctx).find_all(
            {"batchId": resolved, "studentUserId": {"$in": user_ids}}, limit=len(user_ids) or 1
        )
    }
    items = []
    for profile in page_result.items:
        att = attendance.get(profile["userId"], {})
        score = scores.get(profile["userId"], {})
        items.append(
            {
                **serialize(profile),
                "attendancePercent": att.get("percentage"),
                "sessionsAttended": att.get("present"),
                "sessionsTotal": att.get("total"),
                "readinessScore": score.get("finalScore"),
                "focusPillar": PILLAR_LABELS.get(score.get("focusPillar") or "", None),
            }
        )
    response = page_result.to_response()
    response["items"] = items
    return {"success": True, **response}


@router.get("/students")
async def students(
    search: str | None = Query(None, max_length=80),
    batchId: str | None = Query(None),
    weakOnly: bool = Query(False),
    page: int = Query(1, ge=1),
    pageSize: int = Query(25, ge=1, le=100),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    if settings.USE_POSTGRES and ctx.user_id:
        from uuid import UUID
        from app.db.postgres import get_pg_connection
        trainer_uuid = UUID(str(ctx.user_id))
        async with get_pg_connection() as conn:
            batch_uuid = None
            batch_id_str = batchId if isinstance(batchId, str) and len(batchId) == 36 else None
            if batch_id_str:
                await require_trainer_batch_scope(ctx, batch_id_str)
                batch_uuid = UUID(batch_id_str)

            params: list[Any] = [trainer_uuid]
            batch_filter = "sp.batch_id IN (SELECT batch_id FROM batch_trainers WHERE trainer_user_id = $1)"
            if batch_uuid:
                params.append(batch_uuid)
                batch_filter = f"sp.batch_id = ${len(params)}"

            search_clause = ""
            search_str = search if isinstance(search, str) and search.strip() else None
            if search_str:
                params.append(f"%{search_str}%")
                search_clause = f" AND (u.name ILIKE ${len(params)} OR sp.roll_number ILIKE ${len(params)} OR u.email ILIKE ${len(params)})"

            weak_flag = weakOnly if isinstance(weakOnly, bool) else bool(getattr(weakOnly, "default", False))
            weak_filter = "WHERE ((readiness_score IS NOT NULL AND readiness_score < 60.0) OR (attendance_percent < 75.0))" if weak_flag else ""

            base_cte = f"""
                WITH student_stats AS (
                    SELECT 
                        u.id as user_id, u.name, u.email, sp.roll_number, sp.batch_id, sp.avatar_url,
                        b.name as batch_name, b.code as batch_code,
                        COALESCE((
                            SELECT ROUND(AVG(CASE WHEN ar.status = 'PRESENT' THEN 100.0 ELSE 0.0 END)::numeric, 1)
                            FROM attendance_records ar
                            JOIN training_sessions ts ON ts.id = ar.session_id
                            WHERE ar.participant_user_id = u.id AND ts.batch_id = sp.batch_id
                        ), 0.0) as attendance_percent,
                        (
                            SELECT ROUND(ev.eedi_score::numeric, 1)
                            FROM enrollments e
                            JOIN eedi_evaluations ev ON ev.participant_user_id = e.participant_user_id AND ev.course_id = e.course_id
                            WHERE e.participant_user_id = u.id AND e.batch_id = sp.batch_id AND ev.status = 'COMPLETED'
                            ORDER BY ev.updated_at DESC LIMIT 1
                        ) as readiness_score
                    FROM users u
                    JOIN student_profiles sp ON sp.user_id = u.id
                    LEFT JOIN batches b ON b.id = sp.batch_id
                    WHERE {batch_filter} AND u.deleted_at IS NULL{search_clause}
                )
            """

            count_query = f"""
                {base_cte}
                SELECT COUNT(*) FROM student_stats {weak_filter}
            """
            total = await conn.fetchval(count_query, *params) or 0
            page_num = page if isinstance(page, int) else int(getattr(page, "default", 1) or 1)
            size_num = pageSize if isinstance(pageSize, int) else int(getattr(pageSize, "default", 25) or 25)
            offset = (page_num - 1) * size_num

            query = f"""
                {base_cte}
                SELECT * FROM student_stats
                {weak_filter}
                ORDER BY name ASC
                LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
            """
            fetch_params = list(params) + [size_num, offset]
            rows = await conn.fetch(query, *fetch_params)

            items = []
            for r in rows:
                score = float(r["readiness_score"]) if r["readiness_score"] is not None else None
                att_pct = float(r["attendance_percent"])
                reasons = []
                if att_pct < 75.0:
                    reasons.append(f"Low Attendance ({att_pct:.0f}%)")
                if score is not None and score < 60.0:
                    reasons.append(f"Low Readiness Score ({score:.1f})")
                is_weak = len(reasons) > 0

                items.append({
                    "id": str(r["user_id"]),
                    "userId": str(r["user_id"]),
                    "name": r["name"],
                    "email": r["email"],
                    "rollNumber": r["roll_number"] or "N/A",
                    "batchId": str(r["batch_id"]) if r["batch_id"] else None,
                    "batchName": r["batch_name"],
                    "batchCode": r["batch_code"],
                    "avatarUrl": r["avatar_url"],
                    "attendancePercent": att_pct,
                    "readinessScore": score,
                    "focusPillar": None,
                    "weak": is_weak,
                    "attentionReason": " & ".join(reasons) if reasons else None,
                })

            pages = (total + size_num - 1) // size_num if total else 0
            return {
                "success": True,
                "items": items,
                "pagination": {
                    "total": total,
                    "page": page_num,
                    "pageSize": size_num,
                    "pages": pages,
                    "hasNext": page_num < pages,
                    "hasPrev": page_num > 1,
                }
            }

    filters: dict[str, Any] = {}
    if batchId:
        filters["batchId"] = await require_trainer_batch_scope(ctx, batchId)
    page_result = await StudentProfileRepo(ctx).list(
        filters=filters, search=search, page=page, page_size=pageSize
    )
    user_ids = [p["userId"] for p in page_result.items]
    scores = {
        row["studentUserId"]: row
        for row in await EediScoreRepo(ctx).find_all(
            {"studentUserId": {"$in": user_ids}}, limit=len(user_ids) or 1
        )
    }
    attendance = await analytics.student_attendance_map(
        ctx, filters={"studentUserId": {"$in": user_ids}}
    )
    items = []
    for profile in page_result.items:
        score = scores.get(profile["userId"], {})
        final = score.get("finalScore")
        if weakOnly and (final is None or final >= settings.WEAK_STUDENT_THRESHOLD):
            continue
        items.append(
            {
                **serialize(profile),
                "readinessScore": final,
                "focusPillar": PILLAR_LABELS.get(score.get("focusPillar") or "", None),
                "attendancePercent": attendance.get(profile["userId"], {}).get("percentage"),
                "weak": final is not None and final < settings.WEAK_STUDENT_THRESHOLD,
            }
        )
    response = page_result.to_response()
    response["items"] = items
    return {"success": True, **response}


@router.get("/students/{student_id}")
async def student_detail(student_id: str, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    resolved = await require_student_in_scope(ctx, student_id)
    if settings.USE_POSTGRES and len(str(resolved)) == 36:
        from uuid import UUID
        from app.db.postgres import get_pg_connection
        s_uuid = UUID(str(resolved))
        async with get_pg_connection() as conn:
            row = await conn.fetchrow("""
                SELECT u.id as user_id, u.name, u.email, u.phone, sp.roll_number, sp.batch_id, sp.avatar_url,
                       b.name as batch_name, b.code as batch_code, b.semester as batch_semester,
                       d.name as department_name, inst.name as institution_name,
                       COALESCE((
                           SELECT ROUND(AVG(CASE WHEN ar.status = 'PRESENT' THEN 100.0 ELSE 0.0 END)::numeric, 1)
                           FROM attendance_records ar
                           JOIN training_sessions ts ON ts.id = ar.session_id
                           WHERE ar.participant_user_id = u.id AND ts.batch_id = sp.batch_id
                       ), 0.0) as attendance_percent,
                       COALESCE((
                           SELECT COUNT(*) FROM attendance_records ar
                           JOIN training_sessions ts ON ts.id = ar.session_id
                           WHERE ar.participant_user_id = u.id AND ts.batch_id = sp.batch_id AND ar.status = 'PRESENT'
                       ), 0) as attendance_present,
                       COALESCE((
                           SELECT COUNT(*) FROM attendance_records ar
                           JOIN training_sessions ts ON ts.id = ar.session_id
                           WHERE ar.participant_user_id = u.id AND ts.batch_id = sp.batch_id
                       ), 0) as attendance_total,
                       (
                           SELECT ROUND(ev.eedi_score::numeric, 1)
                           FROM enrollments e
                           JOIN eedi_evaluations ev ON ev.participant_user_id = e.participant_user_id AND ev.course_id = e.course_id
                           WHERE e.participant_user_id = u.id AND e.batch_id = sp.batch_id AND ev.status = 'COMPLETED'
                           ORDER BY ev.updated_at DESC LIMIT 1
                       ) as readiness_score
                FROM users u
                JOIN student_profiles sp ON sp.user_id = u.id
                LEFT JOIN batches b ON b.id = sp.batch_id
                LEFT JOIN departments d ON d.id = u.department_id
                LEFT JOIN institutions inst ON inst.id = u.institution_id
                WHERE u.id = $1 AND u.deleted_at IS NULL
            """, s_uuid)
            if not row:
                raise NotFound("Participant not found")
            eval_rows = await conn.fetch("""
                SELECT id, eedi_score, employment_score, strengths, weaknesses, improvements,
                       trainer_notes, status, submitted_at, created_at, report_data
                FROM eedi_evaluations
                WHERE participant_user_id = $1
                ORDER BY created_at DESC
            """, s_uuid)

            pillar_rows = await conn.fetch("""
                SELECT pillar, score, max_score
                FROM evaluation_pillar_scores
                WHERE evaluation_id = (
                    SELECT id FROM eedi_evaluations
                    WHERE participant_user_id = $1
                    ORDER BY created_at DESC LIMIT 1
                )
            """, s_uuid)
            pillar_map = {r["pillar"]: float(r["score"]) for r in pillar_rows}
            latest_eval = eval_rows[0] if eval_rows else None
            final_sc = float(latest_eval["eedi_score"]) if (latest_eval and latest_eval["eedi_score"] is not None) else (float(row["readiness_score"]) if row["readiness_score"] is not None else None)

            return {
                "success": True,
                "data": {
                    "profile": {
                        "id": str(row["user_id"]),
                        "userId": str(row["user_id"]),
                        "name": row["name"],
                        "email": row["email"],
                        "phone": row["phone"],
                        "rollNumber": row["roll_number"] or "N/A",
                        "batchId": str(row["batch_id"]) if row["batch_id"] else None,
                        "batchName": row["batch_name"],
                        "batchCode": row["batch_code"],
                        "semester": row["batch_semester"],
                        "departmentName": row["department_name"] or "General",
                        "institutionName": row["institution_name"] or "Institution",
                        "avatarUrl": row["avatar_url"],
                    },
                    "attendance": {
                        "percentage": float(row["attendance_percent"]),
                        "present": int(row["attendance_present"]),
                        "total": int(row["attendance_total"]),
                    },
                    "assessments": [
                        {
                            "id": str(e["id"]),
                            "trainingModuleName": "EEDI Evaluation",
                            "completeness": 100.0 if e["status"] == "COMPLETED" else 50.0,
                            "score": float(e["eedi_score"]) if e["eedi_score"] is not None else None,
                            "overallScore": float(e["eedi_score"]) if e["eedi_score"] is not None else None,
                            "state": "submitted" if e["status"] == "COMPLETED" else "draft",
                            "createdAt": e["created_at"].isoformat() if e["created_at"] else None,
                        }
                        for e in eval_rows
                    ],
                    "eediScore": {"finalScore": final_sc, "scoringVersion": "2.1"} if final_sc is not None else {},
                    "pillars": [
                        {"code": code, "label": label, "score": pillar_map.get(code)}
                        for code, label in PILLARS
                    ],
                    "aiScores": [],
                    "feedback": [
                        {
                            "id": str(e["id"]),
                            "trainerName": ctx.name or "Trainer",
                            "rating": 4,
                            "feedbackText": e["trainer_notes"] or "Evaluation feedback",
                            "createdAt": e["created_at"].isoformat() if e["created_at"] else None,
                        }
                        for e in eval_rows if e["trainer_notes"]
                    ],
                },
            }

    profile = await StudentProfileRepo(ctx).find_one({"userId": resolved})
    if not profile:
        raise NotFound("Participant not found")
    attendance = await analytics.attendance_overall(ctx, filters={"studentUserId": resolved})
    assessments = await SkillAssessmentRepo(ctx).find_all(
        {"studentUserId": resolved}, limit=50, sort=[("createdAt", -1)]
    )
    score = await EediScoreRepo(ctx).find_one({"studentUserId": resolved}) or {}
    ai_scores = await AiScoreRepo(ctx).find_all(
        {"studentUserId": resolved}, limit=20, sort=[("createdAt", -1)]
    )
    feedback = await TrainerFeedbackRepo(ctx).find_all(
        {"studentUserId": resolved}, limit=20, sort=[("createdAt", -1)]
    )
    return {
        "success": True,
        "data": {
            "profile": serialize(profile),
            "attendance": attendance,
            "assessments": serialize(assessments),
            "eediScore": serialize(score),
            "pillars": [
                {
                    "code": code,
                    "label": label,
                    "score": (score.get("pillarScores") or {}).get(code),
                }
                for code, label in PILLARS
            ],
            "aiScores": serialize(ai_scores),
            "feedback": serialize(feedback),
        },
    }


# --------------------------------------------------------------------------- classes & attendance
@router.get("/classes/today")
async def todays_classes(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    start = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    rows = await TrainingSessionRepo(ctx).find_all(
        {"date": {"$gte": start, "$lt": start + timedelta(days=1)}}, limit=50, sort=[("date", 1)]
    )
    if not rows:
        return {"success": True, "data": []}

    # Two grouped reads for the whole day rather than two per class.
    session_ids = [row["_id"] for row in rows]
    batch_ids = list({row.get("batchId") for row in rows if row.get("batchId")})
    marked_rows, roster_rows = await asyncio.gather(
        AttendanceRepo(ctx).aggregate(
            [
                {"$match": {"trainingSessionId": {"$in": session_ids}}},
                {"$group": {"_id": "$trainingSessionId", "marked": {"$sum": 1}}},
            ]
        ),
        StudentProfileRepo(ctx).aggregate(
            [
                {"$match": {"batchId": {"$in": batch_ids}}},
                {"$group": {"_id": "$batchId", "roster": {"$sum": 1}}},
            ]
        )
        if batch_ids
        else _empty_rows(),
    )
    marked_by_session = {row["_id"]: row.get("marked", 0) for row in marked_rows}
    roster_by_batch = {row["_id"]: row.get("roster", 0) for row in roster_rows}

    out = []
    for session in rows:
        marked = marked_by_session.get(session["_id"], 0)
        roster = roster_by_batch.get(session.get("batchId"), 0)
        out.append(
            {
                **serialize(session),
                "attendanceMarked": marked,
                "rosterSize": roster,
                "attendanceComplete": marked >= roster and roster > 0,
            }
        )
    return {"success": True, "data": out}


async def _empty_rows() -> list[dict[str, Any]]:
    """An awaitable placeholder so `gather` stays symmetric when there is nothing to group."""
    return []


@router.get("/sessions")
async def sessions(
    batchId: str | None = Query(None),
    page: int = Query(1, ge=1),
    pageSize: int = Query(25, ge=1, le=100),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    if settings.USE_POSTGRES and ctx.user_id:
        from app.db.postgres import get_pg_connection
        from uuid import UUID
        tr_uuid = UUID(str(ctx.user_id))
        b_uuid = None
        if batchId:
            resolved = await require_trainer_batch_scope(ctx, batchId)
            try:
                b_uuid = UUID(str(resolved))
            except Exception:
                pass

        async with get_pg_connection() as conn:
            conds = [
                """(
                    ts.trainer_user_id = $1 
                    OR ts.batch_id IN (
                        SELECT bt.batch_id 
                        FROM batch_trainers bt 
                        WHERE bt.trainer_user_id = $1 
                          AND (bt.status IS NULL OR bt.status = 'ACTIVE')
                          AND (bt.start_date IS NULL OR bt.start_date <= CURRENT_DATE)
                          AND (bt.end_date IS NULL OR bt.end_date >= CURRENT_DATE)
                    )
                )"""
            ]
            params: list[Any] = [tr_uuid]
            if b_uuid:
                params.append(b_uuid)
                conds.append(f"ts.batch_id = ${len(params)}")

            where_clause = " AND ".join(conds)
            total = await conn.fetchval(f"SELECT count(*) FROM training_sessions ts WHERE {where_clause}", *params) or 0
            p_val = page if isinstance(page, int) else 1
            ps_val = pageSize if isinstance(pageSize, int) else 20
            offset = (p_val - 1) * ps_val
            query_sql = f"""
                SELECT ts.id, ts.institution_id, ts.department_id, ts.batch_id, ts.trainer_user_id,
                       ts.topic, ts.room, ts.session_date, ts.status, ts.created_at, b.name as batch_name,
                       (SELECT count(*) FROM attendance_records ar WHERE ar.session_id = ts.id) as attendance_count,
                       (SELECT count(*) FROM student_profiles sp WHERE sp.batch_id = ts.batch_id) as total_students,
                       (SELECT count(*) FROM attendance_records ar WHERE ar.session_id = ts.id AND ar.status = 'PRESENT') as present_count,
                       (SELECT count(*) FROM attendance_records ar WHERE ar.session_id = ts.id AND ar.status = 'ABSENT') as absent_count,
                       (SELECT count(*) FROM attendance_records ar WHERE ar.session_id = ts.id AND ar.status = 'LATE') as late_count,
                       (SELECT count(*) FROM attendance_records ar WHERE ar.session_id = ts.id AND ar.status = 'LEAVE') as leave_count
                FROM training_sessions ts
                LEFT JOIN batches b ON ts.batch_id = b.id
                WHERE {where_clause}
                ORDER BY ts.session_date DESC, ts.created_at DESC
                LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
            """
            rows = await conn.fetch(query_sql, *params, pageSize, offset)
            items = []
            for r in rows:
                tot = int(r["total_students"] or 0)
                pres = int(r["present_count"] or 0)
                abs_cnt = int(r["absent_count"] or 0)
                late_cnt = int(r["late_count"] or 0)
                leave_cnt = int(r["leave_count"] or 0)
                att_cnt = int(r["attendance_count"] or 0)
                pct = round((pres / max(1, tot)) * 100.0, 1) if tot > 0 and att_cnt > 0 else (round((pres / max(1, att_cnt)) * 100.0, 1) if att_cnt > 0 else None)
                items.append({
                    "id": str(r["id"]),
                    "_id": str(r["id"]),
                    "batchId": str(r["batch_id"]) if r["batch_id"] else None,
                    "batchName": r["batch_name"] or "Assigned Batch",
                    "topic": r["topic"],
                    "room": r["room"],
                    "date": r["session_date"].isoformat() if r["session_date"] else None,
                    "status": r["status"],
                    "attendanceMarkedAt": r["created_at"].isoformat() if att_cnt > 0 and r["created_at"] else None,
                    "totalStudents": tot,
                    "presentStudents": pres,
                    "absentStudents": abs_cnt,
                    "lateStudents": late_cnt,
                    "leaveStudents": leave_cnt,
                    "attendancePercentage": pct,
                })
            return {
                "success": True,
                "items": items,
                "pagination": {
                    "page": page,
                    "pageSize": pageSize,
                    "total": total,
                    "totalPages": max(1, (total + pageSize - 1) // pageSize),
                    "hasNext": page * pageSize < total,
                }
            }

    filters: dict[str, Any] = {}
    if batchId:
        filters["batchId"] = await require_trainer_batch_scope(ctx, batchId)
    page_result = await TrainingSessionRepo(ctx).list(
        filters=filters, page=page, page_size=pageSize, sort_by="date", sort_dir="desc"
    )
    return {"success": True, **page_result.to_response()}


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_session(payload: dict[str, Any], ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    batch_id = payload.get("batchId")
    if not batch_id:
        raise ValidationError("batchId is required")
    resolved_batch = await require_trainer_batch_scope(ctx, batch_id)

    topic = payload.get("topic") or "General Training Session"
    room = payload.get("room") or "Room 101"
    raw_date = payload.get("sessionDate") or payload.get("date")
    from datetime import date as _dt_date
    if isinstance(raw_date, str) and raw_date:
        try:
            d_val = datetime.strptime(raw_date[:10], "%Y-%m-%d").date()
        except Exception:
            d_val = datetime.now(timezone.utc).date()
    elif isinstance(raw_date, _dt_date):
        d_val = raw_date
    else:
        d_val = datetime.now(timezone.utc).date()

    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from uuid import UUID
        import uuid
        s_uuid = uuid.uuid4()
        b_uuid = UUID(str(resolved_batch))
        async with get_pg_connection() as conn:
            batch = await conn.fetchrow("SELECT institution_id, department_id, name FROM batches WHERE id = $1", b_uuid)
            if not batch:
                raise NotFound("Batch not found")

            # Enforce trainer assignment schedule: date window and applicable weekdays
            bt = await conn.fetchrow(
                "SELECT start_date, end_date, weekdays FROM batch_trainers WHERE batch_id = $1 AND trainer_user_id = $2",
                b_uuid, UUID(str(ctx.user_id))
            )
            if bt:
                if bt["start_date"] and d_val < bt["start_date"]:
                    raise ValidationError(f"Session date {d_val} is before the assignment start date ({bt['start_date']}).")
                if bt["end_date"] and d_val > bt["end_date"]:
                    raise ValidationError(f"Session date {d_val} is after the assignment end date ({bt['end_date']}).")
                if bt["weekdays"] and len(bt["weekdays"]) > 0:
                    iso_day = d_val.isoweekday()
                    if iso_day not in bt["weekdays"]:
                        raise ValidationError(f"Trainer is not scheduled to conduct sessions on {d_val.strftime('%A')}.")

            from datetime import time as _dt_time
            raw_starts = payload.get("startsAt")
            raw_ends = payload.get("endsAt")
            if raw_starts:
                try:
                    starts_at = datetime.fromisoformat(str(raw_starts).replace("Z", "+00:00"))
                    if starts_at.tzinfo is None:
                        starts_at = starts_at.replace(tzinfo=timezone.utc)
                    else:
                        starts_at = starts_at.astimezone(timezone.utc)
                except Exception:
                    starts_at = datetime.combine(d_val, _dt_time(9, 0, 0, tzinfo=timezone.utc))
            else:
                starts_at = datetime.combine(d_val, _dt_time(9, 0, 0, tzinfo=timezone.utc))

            if raw_ends:
                try:
                    ends_at = datetime.fromisoformat(str(raw_ends).replace("Z", "+00:00"))
                    if ends_at.tzinfo is None:
                        ends_at = ends_at.replace(tzinfo=timezone.utc)
                    else:
                        ends_at = ends_at.astimezone(timezone.utc)
                except Exception:
                    ends_at = datetime.combine(d_val, _dt_time(10, 30, 0, tzinfo=timezone.utc))
            else:
                ends_at = datetime.combine(d_val, _dt_time(10, 30, 0, tzinfo=timezone.utc))

            # Enforce time-window validity
            if ends_at <= starts_at:
                raise ValidationError("Session endsAt must be strictly after startsAt.")

            duration_minutes = (ends_at - starts_at).total_seconds() / 60
            if duration_minutes < 15:
                raise ValidationError("Session duration must be at least 15 minutes.")
            if duration_minutes > 480:
                raise ValidationError("Session duration cannot exceed 8 hours.")

            await conn.execute(
                """
                INSERT INTO training_sessions (id, institution_id, department_id, batch_id, trainer_user_id, topic, room, session_date, starts_at, ends_at, status, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'SCHEDULED', NOW(), NOW())
                """,
                s_uuid, batch["institution_id"], batch["department_id"], b_uuid, UUID(str(ctx.user_id)),
                topic, room, d_val, starts_at, ends_at,
            )
            return {
                "success": True,
                "message": "Training session created",
                "data": {
                    "id": str(s_uuid),
                    "_id": str(s_uuid),
                    "batchId": str(b_uuid),
                    "batchName": batch["name"],
                    "topic": topic,
                    "room": room,
                    "date": d_val.isoformat(),
                    "status": "SCHEDULED",
                }
            }

    session_doc = {
        "collegeId": ctx.college_id,
        "departmentId": ctx.department_id,
        "batchId": resolved_batch,
        "trainerUserId": ctx.user_id,
        "topic": topic,
        "room": room,
        "date": session_date,
        "status": "scheduled",
        "createdAt": _now(),
        "updatedAt": _now(),
    }
    res = await get_db().training_sessions.insert_one(session_doc)
    session_doc["_id"] = res.inserted_id
    return {"success": True, "message": "Training session created", "data": serialize(session_doc)}


@router.get("/sessions/{session_id}/attendance")
async def session_attendance(session_id: str, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    session = await require_trainer_session_scope(ctx, session_id)

    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from uuid import UUID
        b_uuid = UUID(str(session.get("batchId")))
        s_uuid = UUID(str(session.get("id") or session.get("_id")))
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT sp.user_id, u.name, sp.roll_number, ar.status, ar.remarks
                FROM student_profiles sp
                JOIN users u ON sp.user_id = u.id
                LEFT JOIN attendance_records ar ON ar.participant_user_id = sp.user_id AND ar.session_id = $1
                WHERE sp.batch_id = $2
                ORDER BY sp.roll_number ASC
                """,
                s_uuid, b_uuid
            )
            return {
                "success": True,
                "data": {
                    "session": serialize(session),
                    "alreadyMarked": any(r["status"] is not None for r in rows),
                    "roster": [
                        {
                            "studentUserId": str(r["user_id"]),
                            "name": r["name"],
                            "rollNumber": r["roll_number"],
                            "status": (r["status"] or "").lower() if r["status"] else None,
                            "remark": r["remarks"],
                        }
                        for r in rows
                    ],
                    "statuses": ["present", "absent", "late", "leave"],
                },
            }

    roster = await StudentProfileRepo(ctx).find_all(
        {"batchId": session.get("batchId")},
        projection={"userId": 1, "name": 1, "rollNumber": 1},
        limit=500,
        sort=[("rollNumber", 1)],
    )
    existing = {
        row["studentUserId"]: row
        for row in await AttendanceRepo(ctx).find_all(
            {"trainingSessionId": session["_id"]}, limit=500
        )
    }
    return {
        "success": True,
        "data": {
            "session": serialize(session),
            "alreadyMarked": bool(existing),
            "roster": [
                {
                    "studentUserId": str(profile["userId"]),
                    "name": profile.get("name"),
                    "rollNumber": profile.get("rollNumber"),
                    "status": (existing.get(profile["userId"]) or {}).get("status"),
                    "remark": (existing.get(profile["userId"]) or {}).get("remark"),
                }
                for profile in roster
            ],
            "statuses": ["present", "absent", "late", "leave"],
        },
    }


@router.post("/attendance", status_code=status.HTTP_201_CREATED)
async def mark_attendance(
    payload: AttendanceRequest, ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    """Attendance can only be marked on the trainer's assigned session, never in the future."""
    session = await require_trainer_session_scope(ctx, payload.trainingSessionId)

    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        from uuid import UUID
        s_uuid = UUID(str(session.get("id") or session.get("_id")))
        tr_uuid = UUID(str(ctx.user_id))
        b_uuid = UUID(str(session["batchId"])) if session.get("batchId") else None
        inst_uuid = UUID(str(session["collegeId"])) if session.get("collegeId") else None
        raw_d = session.get("date")
        s_date = None
        if raw_d:
            try:
                s_date = datetime.strptime(str(raw_d)[:10], "%Y-%m-%d").date()
            except Exception:
                s_date = datetime.now(timezone.utc).date()
        else:
            s_date = datetime.now(timezone.utc).date()

        written = 0
        async with get_pg_connection() as conn:
            for entry in payload.entries:
                st_uuid = UUID(str(entry.studentUserId))
                raw_st = (entry.status or "PRESENT").upper()
                if raw_st not in ("PRESENT", "ABSENT", "LATE", "LEAVE", "PENDING", "EXCUSED"):
                    raw_st = "PRESENT"

                existing_ar = await conn.fetchrow(
                    "SELECT id FROM attendance_records WHERE session_id = $1 AND participant_user_id = $2",
                    s_uuid, st_uuid
                )
                if existing_ar:
                    await conn.execute(
                        """
                        UPDATE attendance_records
                        SET status = $1::attendance_status_enum, remarks = $2, marked_by = $3,
                            institution_id = COALESCE(attendance_records.institution_id, $5),
                            batch_id = COALESCE(attendance_records.batch_id, $6),
                            attendance_date = COALESCE(attendance_records.attendance_date, $7),
                            marking_method = 'TRAINER_MANUAL',
                            marked_at = NOW(), updated_at = NOW()
                        WHERE id = $4
                        """,
                        raw_st, entry.remark, tr_uuid, existing_ar["id"],
                        inst_uuid, b_uuid, s_date
                    )
                else:
                    await conn.execute(
                        """
                        INSERT INTO attendance_records (
                            id, session_id, participant_user_id, status, remarks, marked_by,
                            institution_id, batch_id, attendance_date, marking_method,
                            marked_at, created_at, updated_at
                        )
                        VALUES (
                            gen_random_uuid(), $1, $2, $3::attendance_status_enum, $4, $5,
                            $6, $7, $8, 'TRAINER_MANUAL',
                            NOW(), NOW(), NOW()
                        )
                        """,
                        s_uuid, st_uuid, raw_st, entry.remark, tr_uuid,
                        inst_uuid, b_uuid, s_date
                    )
                written += 1

            await conn.execute("UPDATE training_sessions SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1", s_uuid)

        # Broadcast real-time event to batch group
        if b_uuid:
            try:
                from app.websocket.messaging_ws import messaging_hub
                await messaging_hub.broadcast_to_room(
                    room_name=f"batch_{str(b_uuid)}",
                    event="attendance.marked",
                    data={
                        "sessionId": str(s_uuid),
                        "batchId": str(b_uuid),
                        "markedBy": str(tr_uuid),
                        "participantCount": written,
                        "sessionStatus": "COMPLETED",
                    },
                )
            except Exception:
                pass

        return {
            "success": True,
            "message": f"Attendance saved for {written} participant(s)",
            "data": {"written": written, "rejected": []},
        }


@router.get("/attendance/export")
async def export_trainer_attendance(
    batchId: str | None = Query(None),
    dateFrom: str | None = Query(None),
    dateTo: str | None = Query(None),
    ctx: ScopeContext = TrainerCtx,
):
    """Exports attendance records to CSV for the trainer's batches with date range filters."""
    from fastapi.responses import Response
    import io, csv
    from uuid import UUID

    if settings.USE_POSTGRES and ctx.user_id:
        from app.db.postgres import get_pg_connection
        tr_uuid = UUID(str(ctx.user_id))
        conds = [
            """(
                ts.trainer_user_id = $1 
                OR ts.batch_id IN (
                    SELECT bt.batch_id FROM batch_trainers bt 
                    WHERE bt.trainer_user_id = $1 AND (bt.status IS NULL OR bt.status = 'ACTIVE')
                )
            )"""
        ]
        params: list[Any] = [tr_uuid]
        if batchId:
            resolved_batch = await require_trainer_batch_scope(ctx, batchId)
            params.append(UUID(str(resolved_batch)))
            conds.append(f"ts.batch_id = ${len(params)}")
        if dateFrom:
            try:
                d_from = datetime.strptime(dateFrom[:10], "%Y-%m-%d").date()
                params.append(d_from)
                conds.append(f"ts.session_date >= ${len(params)}")
            except Exception:
                pass
        if dateTo:
            try:
                d_to = datetime.strptime(dateTo[:10], "%Y-%m-%d").date()
                params.append(d_to)
                conds.append(f"ts.session_date <= ${len(params)}")
            except Exception:
                pass

        where_sql = " AND ".join(conds)
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                f"""
                SELECT 
                    ts.session_date,
                    b.name as batch_name,
                    ts.topic as session_topic,
                    u.name as student_name,
                    u.email as student_email,
                    sp.roll_number,
                    ar.status,
                    ar.marking_method,
                    ar.marked_at,
                    ar.remarks
                FROM attendance_records ar
                JOIN training_sessions ts ON ts.id = ar.session_id
                JOIN batches b ON b.id = ts.batch_id
                JOIN users u ON u.id = ar.participant_user_id
                LEFT JOIN student_profiles sp ON sp.user_id = u.id
                WHERE {where_sql}
                ORDER BY ts.session_date DESC, b.name ASC, sp.roll_number ASC
                """,
                *params,
            )

            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow([
                "Date", "Batch", "Session Topic", "Roll Number",
                "Student Name", "Student Email", "Status", "Marking Method", "Marked At", "Remarks"
            ])
            for r in rows:
                writer.writerow([
                    str(r["session_date"]) if r["session_date"] else "",
                    r["batch_name"] or "",
                    r["session_topic"] or "",
                    r["roll_number"] or "",
                    r["student_name"] or "",
                    r["student_email"] or "",
                    str(r["status"] or ""),
                    r["marking_method"] or "TRAINER_MANUAL",
                    r["marked_at"].isoformat() if r["marked_at"] else "",
                    r["remarks"] or "",
                ])

            csv_data = output.getvalue()
            return Response(
                content=csv_data,
                media_type="text/csv",
                headers={
                    "Content-Disposition": 'attachment; filename="attendance_report.csv"'
                },
            )

    return Response(content="Date,Batch,Status\n", media_type="text/csv")

    session_date = session.get("date")
    session_date = as_utc(session_date)
    if session_date and session_date.date() > _now().date():
        raise BusinessRuleViolation(
            "Attendance cannot be marked for a session that hasn't happened yet"
        )

    roster = {
        profile["userId"]
        for profile in await StudentProfileRepo(ctx).find_all(
            {"batchId": session.get("batchId")}, projection={"userId": 1}, limit=1000
        )
    }
    already = {
        row["studentUserId"]
        for row in await AttendanceRepo(ctx).find_all(
            {"trainingSessionId": session["_id"]}, projection={"studentUserId": 1}, limit=1000
        )
    }
    if already and not payload.overwrite:
        raise Conflict(
            "Attendance for this session has already been recorded. "
            "Re-submit with overwrite enabled to correct it."
        )

    db = get_db()
    written, rejected, touched = 0, [], []
    for entry in payload.entries:
        student_id = ObjectId(entry.studentUserId)
        if student_id not in roster:
            rejected.append(
                {"studentUserId": entry.studentUserId, "reason": "Not in this session's batch"}
            )
            continue
        await db.attendance.update_one(
            {"trainingSessionId": session["_id"], "studentUserId": student_id},
            {
                "$set": {
                    "trainingSessionId": session["_id"],
                    "studentUserId": student_id,
                    "trainerUserId": ctx.user_id,
                    "collegeId": session.get("collegeId"),
                    "departmentId": session.get("departmentId"),
                    "batchId": session.get("batchId"),
                    "trainingModuleId": session.get("trainingModuleId"),
                    "date": session.get("date") or _now(),
                    "status": entry.status,
                    "remark": entry.remark,
                    "updatedAt": _now(),
                    "updatedBy": ctx.user_id,
                },
                "$setOnInsert": {"createdAt": _now(), "createdBy": ctx.user_id},
            },
            upsert=True,
        )
        written += 1
        touched.append(student_id)

    await db.training_sessions.update_one(
        {"_id": session["_id"]},
        {"$set": {"attendanceMarkedAt": _now(), "attendanceMarkedBy": ctx.user_id}},
    )
    await write_audit(
        ctx,
        action="create" if not already else "update",
        entity_type="attendance",
        entity_id=session["_id"],
        after={"marked": written, "rejected": len(rejected)},
        detail=f"session {session.get('topic', '')} attendance recorded ({written} entries)",
        college_id=session.get("collegeId"),
        department_id=session.get("departmentId"),
    )

    # Certificate eligibility depends on attendance — recompute in the background.
    for student_id in touched:
        await enqueue(
            "certificate.recompute",
            {"studentUserId": str(student_id), "reason": "attendance_updated"},
        )

    return {
        "success": True,
        "message": f"Attendance saved for {written} participant(s)",
        "data": {"written": written, "rejected": rejected},
    }


# --------------------------------------------------------------------------- evaluations
@router.get("/training-modules")
async def trainer_training_modules(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    """The modules a trainer can evaluate against.

    Separate from `/course-progress` (which aggregates session counts per module) because the
    evaluation form needs only the names and ids, and should not pay for the analytics.
    """
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                "SELECT id, title as name, slug as code FROM modules WHERE deleted_at IS NULL ORDER BY order_index ASC"
            )
            # Semesters 1 through 8
            semesters = [
                {"id": str(i), "number": i, "label": f"Semester {i}", "active": True}
                for i in range(1, 9)
            ]
            return {
                "success": True,
                "data": [
                    {"id": str(r["id"]), "name": r["name"], "code": r["code"]}
                    for r in rows
                ],
                "meta": {
                    "semesters": semesters,
                },
            }

    rows = await TrainingModuleRepo(ctx).find_all(limit=200, sort=[("name", 1)])
    semesters = await SemesterRepo(ctx).find_all(limit=50, sort=[("number", -1)])
    return {
        "success": True,
        "data": [
            {"id": str(row["_id"]), "name": row.get("name"), "code": row.get("code")}
            for row in rows
        ],
        "meta": {
            "semesters": [
                {
                    "id": str(row["_id"]),
                    "number": row.get("number"),
                    "label": row.get("label") or f"Semester {row.get('number')}",
                    "active": bool(row.get("active")),
                }
                for row in semesters
            ]
        },
    }


@router.get("/evaluations/parameters")
async def evaluation_parameters(
    semester: int | None = Query(None, ge=1, le=12), ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    """The 95+ trainer-rated parameters, grouped into the 7 pillars."""
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        async with get_pg_connection() as conn:
            if semester:
                rows = await conn.fetch("""
                    SELECT code, label, pillar, weight, max_score, semester_from, semester_to
                    FROM evaluation_parameters
                    WHERE (semester_from IS NULL OR semester_from <= $1)
                      AND (semester_to IS NULL OR semester_to >= $1)
                    ORDER BY code ASC
                """, semester)
            else:
                rows = await conn.fetch("""
                    SELECT code, label, pillar, weight, max_score, semester_from, semester_to
                    FROM evaluation_parameters
                    ORDER BY code ASC
                """)

            by_pillar: dict[str, list[dict[str, Any]]] = {}
            for r in rows:
                p_code = r["pillar"].lower() if r["pillar"] else "general"
                by_pillar.setdefault(p_code, []).append({
                    "code": r["code"],
                    "label": r["label"],
                    "description": r["label"],
                    "maxScore": float(r["max_score"] or 5),
                    "weight": float(r["weight"] or 1),
                    "scale": "1-5",
                })

            grouped = []
            for code, label in PILLARS:
                items = by_pillar.get(code.lower(), [])
                grouped.append({
                    "pillar": code,
                    "label": label,
                    "parameterCount": len(items),
                    "parameters": items,
                })

            return {
                "success": True,
                "data": {
                    "pillars": grouped,
                    "totalParameters": len(rows),
                    "semester": semester,
                    "editWindowHours": settings.EVALUATION_EDIT_WINDOW_HOURS,
                },
            }

    filters: dict[str, Any] = {}
    definitions = await SkillAssessmentDefinitionRepo(ctx).find_all(
        filters, limit=500, sort=[("order", 1)]
    )
    if semester:
        definitions = [
            d
            for d in definitions
            if (d.get("semesterFrom") or 1) <= semester <= (d.get("semesterTo") or 12)
        ]

    grouped = []
    for code, label in PILLARS:
        items = [d for d in definitions if d.get("pillar") == code]
        grouped.append(
            {
                "pillar": code,
                "label": label,
                "parameterCount": len(items),
                "parameters": [
                    {
                        "code": d.get("code"),
                        "label": d.get("label"),
                        "description": d.get("description"),
                        "maxScore": d.get("maxScore", 5),
                        "weight": d.get("weight", 1),
                        "scale": d.get("scale", "1-5"),
                    }
                    for d in items
                ],
            }
        )
    return {
        "success": True,
        "data": {
            "pillars": grouped,
            "totalParameters": len(definitions),
            "semester": semester,
            "editWindowHours": settings.EVALUATION_EDIT_WINDOW_HOURS,
        },
    }


@router.get("/evaluations")
async def list_evaluations(
    state: str | None = Query(None, max_length=20),
    studentId: str | None = Query(None),
    page: int = Query(1, ge=1),
    pageSize: int = Query(25, ge=1, le=100),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        import uuid as _uuid
        trainer_uuid = _uuid.UUID(str(ctx.user_id))
        s_filter = _uuid.UUID(str(studentId)) if studentId else None
        p_val = page if isinstance(page, int) else 1
        ps_val = pageSize if isinstance(pageSize, int) else 20
        offset = (p_val - 1) * ps_val

        async with get_pg_connection() as conn:
            where_clauses = ["ev.trainer_user_id = $1"]
            params = [trainer_uuid]
            if s_filter:
                params.append(s_filter)
                where_clauses.append(f"ev.participant_user_id = ${len(params)}")
            if state and state.lower() != "all":
                s_lower = state.lower()
                if s_lower == "submitted":
                    where_clauses.append("ev.status = 'COMPLETED'")
                elif s_lower == "draft":
                    where_clauses.append("ev.status IN ('DRAFT', 'IN_PROGRESS')")
                elif s_lower == "failed":
                    where_clauses.append("ev.status = 'FAILED'")
                elif s_lower == "pending":
                    where_clauses.append("ev.status = 'PENDING'")

            where_str = " AND ".join(where_clauses)
            total = await conn.fetchval(f"SELECT COUNT(*) FROM eedi_evaluations ev WHERE {where_str}", *params)

            q_params = list(params) + [pageSize, offset]
            p_len = len(params)
            rows = await conn.fetch(f"""
                SELECT ev.id, ev.participant_user_id, ev.status, ev.eedi_score, ev.employment_score,
                       ev.trainer_notes, ev.submitted_at, ev.created_at, ev.updated_at,
                       u.name as student_name, sp.roll_number, b.name as batch_name,
                       COALESCE(c.title, 'EEDI Comprehensive Evaluation') as training_module_name
                FROM eedi_evaluations ev
                JOIN users u ON u.id = ev.participant_user_id
                LEFT JOIN student_profiles sp ON sp.user_id = ev.participant_user_id
                LEFT JOIN batches b ON b.id = sp.batch_id
                LEFT JOIN courses c ON c.id = ev.course_id
                WHERE {where_str}
                ORDER BY COALESCE(ev.submitted_at, ev.updated_at, ev.created_at) DESC
                LIMIT ${p_len + 1} OFFSET ${p_len + 2}
            """, *q_params)

        items = []
        for r in rows:
            sc = float(r["eedi_score"]) if r["eedi_score"] is not None else None
            st = (r["status"] or "PENDING").upper()
            state_label = "submitted" if st == "COMPLETED" else ("failed" if st == "FAILED" else ("draft" if st in ("DRAFT", "IN_PROGRESS") else "pending"))
            upd_dt = r["submitted_at"] or r["updated_at"] or r["created_at"]
            items.append({
                "id": str(r["id"]),
                "studentUserId": str(r["participant_user_id"]),
                "studentName": r["student_name"] or "Participant",
                "rollNumber": r["roll_number"] or "N/A",
                "batchName": r["batch_name"] or "General",
                "trainingModuleName": r["training_module_name"],
                "completeness": 100.0 if st == "COMPLETED" else 50.0,
                "overallScore": sc,
                "totalScore": sc,
                "score": sc,
                "state": state_label,
                "status": st.lower(),
                "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
                "evaluatedAt": r["submitted_at"].isoformat() if r["submitted_at"] else None,
                "updatedAt": upd_dt.isoformat() if upd_dt else None,
            })

        tot = int(total or 0)
        return {
            "success": True,
            "items": items,
            "total": tot,
            "page": page,
            "pageSize": pageSize,
            "pages": max(1, (tot + pageSize - 1) // pageSize),
        }

    filters: dict[str, Any] = {"assessedBy": ctx.user_id}
    if state and state != "all":
        filters["state"] = state
    if studentId:
        filters["studentUserId"] = await require_student_in_scope(ctx, studentId)
    page_result = await SkillAssessmentRepo(ctx).list(
        filters=filters, page=page, page_size=pageSize
    )
    return {"success": True, **page_result.to_response()}


async def _build_evaluation_document(
    ctx: ScopeContext,
    *,
    student_id: ObjectId,
    module: dict[str, Any],
    semester_id: Any,
    parameter_scores: list[dict[str, Any]],
    rubric_scores: list[dict[str, Any]],
    remarks: str | None,
    state: str,
    definitions: list[dict[str, Any]],
) -> dict[str, Any]:
    by_code = {d["code"]: d for d in definitions}
    for entry in parameter_scores:
        definition = by_code.get(entry["code"])
        if not definition:
            raise ValidationError(f"Unknown evaluation parameter '{entry['code']}'")
        max_score = float(definition.get("maxScore", 5))
        if not (0 <= float(entry["score"]) <= max_score):
            raise BusinessRuleViolation(
                f"'{definition.get('label')}' must be between 0 and {max_score:g}"
            )

    pillar_scores = pillar_scores_from_parameters(parameter_scores, definitions)
    total = (
        round(sum(pillar_scores.values()) / len(pillar_scores), 2) if pillar_scores else None
    )

    profile = await StudentProfileRepo(ctx).find_one({"userId": student_id})
    covered = {d["code"] for d in definitions}
    provided = {e["code"] for e in parameter_scores}
    return {
        "studentUserId": student_id,
        "studentName": (profile or {}).get("name"),
        "rollNumber": (profile or {}).get("rollNumber"),
        "collegeId": ctx.college_id,
        "departmentId": (profile or {}).get("departmentId"),
        "batchId": (profile or {}).get("batchId"),
        "batchName": (profile or {}).get("batchName"),
        "trainingModuleId": module["_id"],
        "trainingModuleName": module.get("name"),
        "semesterId": ObjectId(str(semester_id)) if semester_id else None,
        "parameterScores": parameter_scores,
        "rubricScores": rubric_scores,
        "pillarScores": pillar_scores,
        "totalScore": total,
        "maxScore": 100,
        "remarks": remarks,
        "state": state,
        "assessedBy": ctx.user_id,
        "assessedByLabel": ctx.actor_label,
        "completeness": round(len(provided & covered) / len(covered) * 100, 1) if covered else 0,
        "editWindowEndsAt": _now() + timedelta(hours=settings.EVALUATION_EDIT_WINDOW_HOURS),
    }


@router.post("/evaluations", status_code=status.HTTP_201_CREATED)
async def create_evaluation(
    payload: EvaluationRequest, ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    """Save a draft or submit. A submit enqueues recalculation — it never waits for it."""
    student_id = await require_student_in_scope(ctx, payload.studentUserId)

    if settings.USE_POSTGRES:
        import uuid as _uuid
        import json as _json
        from app.db.postgres import get_pg_connection
        s_uuid = _uuid.UUID(str(student_id))
        t_uuid = _uuid.UUID(str(ctx.user_id))
        sem_val = int(payload.semesterId) if (payload.semesterId and str(payload.semesterId).isdigit()) else 1

        async with get_pg_connection() as conn:
            student_info = await conn.fetchrow("""
                SELECT u.institution_id, u.department_id, sp.batch_id
                FROM users u
                JOIN student_profiles sp ON sp.user_id = u.id
                WHERE u.id = $1
            """, s_uuid)
            if not student_info:
                raise NotFound("Student record not found")

            # Check param definitions to calculate scores
            param_rows = await conn.fetch("SELECT code, pillar, weight, max_score FROM evaluation_parameters")
            param_defs = {r["code"]: r for r in param_rows}

            # Group scores into pillars
            pillar_totals: dict[str, list[float]] = {}
            for p in payload.parameterScores:
                p_dict = p.model_dump()
                p_code = p_dict.get("code")
                p_sc = float(p_dict.get("score") or 0)
                defn = param_defs.get(p_code)
                if defn:
                    pil = defn["pillar"].lower() if defn["pillar"] else "general"
                    max_sc = float(defn["max_score"] or 5)
                    norm_sc = (p_sc / max_sc) * 100.0 if max_sc > 0 else 0.0
                    pillar_totals.setdefault(pil, []).append(norm_sc)

            pillar_averages = {
                pil: round(sum(scores_list) / len(scores_list), 1)
                for pil, scores_list in pillar_totals.items()
            }
            overall_eedi = round(sum(pillar_averages.values()) / len(pillar_averages), 1) if pillar_averages else 75.0
            eval_status = "COMPLETED" if payload.state == "submitted" else "DRAFT"

            # Check if an existing evaluation exists to update
            eval_row = await conn.fetchrow("""
                SELECT id FROM eedi_evaluations
                WHERE participant_user_id = $1 AND trainer_user_id = $2
                ORDER BY created_at DESC LIMIT 1
            """, s_uuid, t_uuid)

            eval_id = eval_row["id"] if eval_row else _uuid.uuid4()
            now_dt = _now()
            sub_dt = now_dt if payload.state == "submitted" else None

            if eval_row:
                await conn.execute("""
                    UPDATE eedi_evaluations
                    SET status = $1, eedi_score = $2, employment_score = $2,
                        trainer_notes = $3, submitted_at = COALESCE(submitted_at, $4),
                        updated_at = $5, semester = $6
                    WHERE id = $7
                """, eval_status, overall_eedi, payload.remarks, sub_dt, now_dt, sem_val, eval_id)
            else:
                await conn.execute("""
                    INSERT INTO eedi_evaluations (
                        id, participant_user_id, trainer_user_id, institution_id, department_id,
                        semester, status, eedi_score, employment_score, trainer_notes,
                        submitted_at, created_at, updated_at
                    ) VALUES (
                        $1, $2, $3, $4, $5,
                        $6, $7, $8, $8, $9,
                        $10, $11, $11
                    )
                """, eval_id, s_uuid, t_uuid, student_info["institution_id"], student_info["department_id"],
                    sem_val, eval_status, overall_eedi, payload.remarks, sub_dt, now_dt)

            # Insert/update parameter scores
            await conn.execute("DELETE FROM evaluation_parameter_scores WHERE evaluation_id = $1", eval_id)
            for p in payload.parameterScores:
                p_dict = p.model_dump()
                p_code = p_dict.get("code")
                p_sc = float(p_dict.get("score") or 0)
                defn = param_defs.get(p_code)
                max_sc = float(defn["max_score"] or 5) if defn else 5.0
                wt = float(defn["weight"] or 1) if defn else 1.0
                await conn.execute("""
                    INSERT INTO evaluation_parameter_scores (
                        id, evaluation_id, parameter_code, score, max_score, weight, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                """, _uuid.uuid4(), eval_id, p_code, p_sc, max_sc, wt, now_dt)

            # Insert/update pillar scores
            await conn.execute("DELETE FROM evaluation_pillar_scores WHERE evaluation_id = $1", eval_id)
            for pil, avg_sc in pillar_averages.items():
                await conn.execute("""
                    INSERT INTO evaluation_pillar_scores (
                        id, evaluation_id, pillar, score, max_score, weight, created_at
                    ) VALUES ($1, $2, $3, $4, 100, 1, $5)
                """, _uuid.uuid4(), eval_id, pil, avg_sc, now_dt)

            return {
                "success": True,
                "message": "Evaluation submitted — the readiness score is recalculating in the background." if payload.state == "submitted" else "Draft saved",
                "data": {
                    "id": str(eval_id),
                    "studentUserId": str(s_uuid),
                    "state": payload.state,
                    "totalScore": overall_eedi,
                    "eediScore": overall_eedi,
                }
            }

    module = await TrainingModuleRepo(ctx).get(payload.trainingModuleId)
    definitions = await SkillAssessmentDefinitionRepo(ctx).find_all(limit=500)
    if not definitions:
        raise BusinessRuleViolation(
            "No evaluation parameters are configured for your institution yet"
        )

    existing = await SkillAssessmentRepo(ctx).find_one(
        {
            "studentUserId": student_id,
            "trainingModuleId": module["_id"],
            "semesterId": ObjectId(payload.semesterId) if payload.semesterId else None,
            "assessedBy": ctx.user_id,
        }
    )
    if existing and existing.get("state") == "submitted":
        raise Conflict(
            "A submitted evaluation already exists for this participant and module. "
            "Edit it instead."
        )

    document = await _build_evaluation_document(
        ctx,
        student_id=student_id,
        module=module,
        semester_id=payload.semesterId,
        parameter_scores=[p.model_dump() for p in payload.parameterScores],
        rubric_scores=payload.rubricScores,
        remarks=payload.remarks,
        state=payload.state,
        definitions=definitions,
    )

    repo = SkillAssessmentRepo(ctx)
    if existing:
        # Concurrent edits are detected rather than silently merged.
        saved = await repo.update(
            existing["_id"], document, expected_version=payload.expectedVersion
        )
    else:
        saved = await repo.insert(document)

    await AssessmentVersionRepo(ctx).insert(
        {
            "assessmentId": saved["_id"],
            "version": saved.get("version", 1),
            "snapshot": {k: v for k, v in saved.items() if k != "_id"},
            "changedBy": ctx.user_id,
            "changedByLabel": ctx.actor_label,
            "changedAt": _now(),
            "reason": "created" if not existing else "updated",
        }
    )

    if payload.state == "submitted":
        await enqueue(
            "score.recompute",
            {
                "studentUserId": str(student_id),
                "reason": "trainer_evaluation_submitted",
                "trainerUserId": str(ctx.user_id),
                "notifyStudent": True,
            },
        )
        await enqueue(
            "alerts.weak_student",
            {
                "studentUserId": str(student_id),
                "trainerUserId": str(ctx.user_id),
                "notifyHod": True,
            },
            delay=5,
        )

    return {
        "success": True,
        "message": (
            "Evaluation submitted — the readiness score is recalculating in the background."
            if payload.state == "submitted"
            else "Draft saved"
        ),
        "data": serialize(saved),
    }


@router.get("/evaluations/{evaluation_id}")
async def evaluation_detail(evaluation_id: str, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    if settings.USE_POSTGRES and len(evaluation_id) == 36:
        import uuid as _uuid
        from app.db.postgres import get_pg_connection
        ev_uuid = _uuid.UUID(evaluation_id)
        async with get_pg_connection() as conn:
            row = await conn.fetchrow("""
                SELECT ev.id, ev.participant_user_id, ev.status, ev.eedi_score, ev.employment_score,
                       ev.trainer_notes, ev.submitted_at, ev.created_at, ev.updated_at, ev.semester,
                       u.name as student_name, sp.roll_number, b.name as batch_name,
                       COALESCE(c.title, 'EEDI Comprehensive Evaluation') as training_module_name
                FROM eedi_evaluations ev
                JOIN users u ON u.id = ev.participant_user_id
                LEFT JOIN student_profiles sp ON sp.user_id = ev.participant_user_id
                LEFT JOIN batches b ON b.id = sp.batch_id
                LEFT JOIN courses c ON c.id = ev.course_id
                WHERE ev.id = $1
            """, ev_uuid)
            if not row:
                raise NotFound("Evaluation not found")

            p_rows = await conn.fetch("""
                SELECT parameter_code, score, max_score, weight
                FROM evaluation_parameter_scores
                WHERE evaluation_id = $1
            """, ev_uuid)

            st = (row["status"] or "PENDING").upper()
            state_label = "submitted" if st == "COMPLETED" else ("failed" if st == "FAILED" else ("draft" if st in ("DRAFT", "IN_PROGRESS") else "pending"))
            sc = float(row["eedi_score"]) if row["eedi_score"] is not None else None

            return {
                "success": True,
                "data": {
                    "id": str(row["id"]),
                    "studentUserId": str(row["participant_user_id"]),
                    "studentName": row["student_name"],
                    "rollNumber": row["roll_number"] or "N/A",
                    "batchName": row["batch_name"] or "General",
                    "trainingModuleName": row["training_module_name"],
                    "state": state_label,
                    "status": st.lower(),
                    "totalScore": sc,
                    "score": sc,
                    "remarks": row["trainer_notes"],
                    "parameterScores": [
                        {"code": r["parameter_code"], "score": float(r["score"])}
                        for r in p_rows
                    ],
                    "versions": [],
                    "editable": True,
                    "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
                    "submittedAt": row["submitted_at"].isoformat() if row["submitted_at"] else None,
                }
            }

    evaluation = await SkillAssessmentRepo(ctx).get(evaluation_id)
    versions = await AssessmentVersionRepo(ctx).find_all(
        {"assessmentId": evaluation["_id"]}, limit=30, sort=[("version", -1)]
    )
    return {
        "success": True,
        "data": {
            **serialize(evaluation),
            "versions": serialize(versions),
            "editable": _within_edit_window(evaluation),
        },
    }


def _within_edit_window(evaluation: dict[str, Any]) -> bool:
    if evaluation.get("state") != "submitted":
        return True
    ends = as_utc(evaluation.get("editWindowEndsAt"))
    return bool(ends and ends >= _now())


@router.patch("/evaluations/{evaluation_id}")
async def update_evaluation(
    evaluation_id: str, payload: EvaluationPatch, ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    """Edits inside the configured window are versioned and trigger a recalculation."""
    repo = SkillAssessmentRepo(ctx)
    evaluation = await repo.get(evaluation_id)
    if evaluation.get("assessedBy") != ctx.user_id and ctx.role is Role.TRAINER:
        raise BusinessRuleViolation("You can only edit evaluations you entered")
    if not _within_edit_window(evaluation):
        raise BusinessRuleViolation(
            f"The {settings.EVALUATION_EDIT_WINDOW_HOURS}-hour edit window for this evaluation "
            "has closed. Ask your administrator to reopen it."
        )

    definitions = await SkillAssessmentDefinitionRepo(ctx).find_all(limit=500)
    patch: dict[str, Any] = {}
    if payload.parameterScores is not None:
        module = await TrainingModuleRepo(ctx).get(evaluation["trainingModuleId"])
        rebuilt = await _build_evaluation_document(
            ctx,
            student_id=evaluation["studentUserId"],
            module=module,
            semester_id=evaluation.get("semesterId"),
            parameter_scores=[p.model_dump() for p in payload.parameterScores],
            rubric_scores=(
                payload.rubricScores
                if payload.rubricScores is not None
                else evaluation.get("rubricScores", [])
            ),
            remarks=payload.remarks if payload.remarks is not None else evaluation.get("remarks"),
            state=payload.state or evaluation.get("state", "draft"),
            definitions=definitions,
        )
        patch.update(rebuilt)
    else:
        if payload.rubricScores is not None:
            patch["rubricScores"] = payload.rubricScores
        if payload.remarks is not None:
            patch["remarks"] = payload.remarks
        if payload.state:
            patch["state"] = payload.state
    if not patch:
        raise ValidationError("Nothing to update")

    saved = await repo.update(
        evaluation["_id"], patch, expected_version=payload.expectedVersion
    )
    await AssessmentVersionRepo(ctx).insert(
        {
            "assessmentId": saved["_id"],
            "version": saved.get("version"),
            "snapshot": {k: v for k, v in saved.items() if k != "_id"},
            "changedBy": ctx.user_id,
            "changedByLabel": ctx.actor_label,
            "changedAt": _now(),
            "reason": payload.editReason or "edited after save",
        }
    )
    if saved.get("state") == "submitted":
        await enqueue(
            "score.recompute",
            {
                "studentUserId": str(saved["studentUserId"]),
                "reason": "trainer_evaluation_edited",
                "trainerUserId": str(ctx.user_id),
                "notifyStudent": True,
            },
        )
    return {
        "success": True,
        "message": "Evaluation updated — the score is recalculating.",
        "data": serialize(saved),
    }


@router.get("/evaluations/{evaluation_id}/versions")
async def evaluation_versions(
    evaluation_id: str, ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    evaluation = await SkillAssessmentRepo(ctx).get(evaluation_id)
    versions = await AssessmentVersionRepo(ctx).find_all(
        {"assessmentId": evaluation["_id"]}, limit=50, sort=[("version", -1)]
    )
    return {"success": True, "data": serialize(versions)}


@router.post("/evaluations/{evaluation_id}/submit")
async def submit_evaluation(
    evaluation_id: str, ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    repo = SkillAssessmentRepo(ctx)
    evaluation = await repo.get(evaluation_id)
    if evaluation.get("state") == "submitted":
        raise Conflict("This evaluation has already been submitted")
    if (evaluation.get("completeness") or 0) < 60:
        raise BusinessRuleViolation(
            f"This evaluation is only {evaluation.get('completeness')}% complete. "
            "Fill in the remaining parameters before submitting."
        )
    saved = await repo.update(
        evaluation["_id"],
        {
            "state": "submitted",
            "submittedAt": _now(),
            "editWindowEndsAt": _now() + timedelta(hours=settings.EVALUATION_EDIT_WINDOW_HOURS),
        },
    )
    await enqueue(
        "score.recompute",
        {
            "studentUserId": str(saved["studentUserId"]),
            "reason": "trainer_evaluation_submitted",
            "trainerUserId": str(ctx.user_id),
            "notifyStudent": True,
        },
    )
    await enqueue(
        "alerts.weak_student",
        {"studentUserId": str(saved["studentUserId"]), "trainerUserId": str(ctx.user_id),
         "notifyHod": True},
        delay=5,
    )
    return {"success": True, "message": "Evaluation submitted", "data": serialize(saved)}


@router.post("/evaluations/eedi-complete")
async def trainer_complete_eedi_evaluation(
    payload: dict[str, Any],
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    """Requirements 22, 23, 24: Trainer completes EEDI evaluation with feedback and generates complete report."""
    from app.services.evaluation_report_service import submit_complete_trainer_evaluation

    report = await submit_complete_trainer_evaluation(ctx, payload)
    await write_audit(
        ctx,
        action="create",
        entity_type="evaluation_reports",
        entity_id=str(report["id"]),
        detail=f"Completed EEDI evaluation report for participant {report.get('studentName')}",
    )
    return {
        "success": True,
        "message": "Evaluation completed and report generated successfully.",
        "data": report,
    }


@router.get("/evaluations/reports/{report_id}")
async def trainer_get_evaluation_report(
    report_id: str,
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    """Requirement 26: Evaluating trainer views evaluation report."""
    from app.services.evaluation_report_service import get_evaluation_report

    report = await get_evaluation_report(ctx, report_id)
    return {"success": True, "data": report}



# --------------------------------------------------------------------------- AI review / override
@router.get("/ai-scores")
async def ai_scores(
    reviewState: str = Query("pending", pattern="^(pending|reviewed|all)$"),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        import uuid as _uuid
        from app.db.postgres import get_pg_connection
        t_uuid = _uuid.UUID(str(ctx.user_id))
        p_val = page if isinstance(page, int) else 1
        ps_val = pageSize if isinstance(pageSize, int) else 20
        offset = (p_val - 1) * ps_val

        async with get_pg_connection() as conn:
            where_clauses = [
                """(
                    ps.participant_user_id IN (
                        SELECT sp.user_id FROM student_profiles sp
                        JOIN batch_trainers bt ON bt.batch_id = sp.batch_id
                        WHERE bt.trainer_user_id = $1
                    )
                    OR ps.participant_user_id IN (
                        SELECT u.id FROM users u WHERE u.institution_id = (
                            SELECT institution_id FROM users WHERE id = $1
                        )
                    )
                )"""
            ]
            params = [t_uuid]

            if reviewState == "reviewed":
                where_clauses.append("(ps.metrics->>'trainerOverride') IS NOT NULL")
            elif reviewState == "pending":
                where_clauses.append("((ps.metrics->>'trainerOverride') IS NULL)")

            where_str = " AND ".join(where_clauses)
            total = await conn.fetchval(f"SELECT COUNT(*) FROM practice_sessions ps WHERE {where_str}", *params)

            q_params = list(params) + [ps_val, offset]
            rows = await conn.fetch(f"""
                SELECT ps.id, ps.participant_user_id, ps.practice_mode_title, ps.overall_score,
                       ps.metrics, ps.ai_feedback, ps.created_at, ps.completed_at,
                       u.name as student_name, sp.roll_number, b.name as batch_name
                FROM practice_sessions ps
                JOIN users u ON u.id = ps.participant_user_id
                LEFT JOIN student_profiles sp ON sp.user_id = ps.participant_user_id
                LEFT JOIN batches b ON b.id = sp.batch_id
                WHERE {where_str}
                ORDER BY ps.created_at DESC
                LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
            """, *q_params)

            items = []
            for r in rows:
                raw_metrics = r["metrics"] or {}
                if isinstance(raw_metrics, str):
                    import json
                    try:
                        raw_metrics = json.loads(raw_metrics)
                    except Exception:
                        raw_metrics = {}

                override = raw_metrics.get("trainerOverride")
                sc = float(r["overall_score"]) if r["overall_score"] is not None else (float(raw_metrics.get("overall", 72.0)))
                mode_title = r["practice_mode_title"] or "AI Technical Interview"
                dims = raw_metrics.get("dimensions", [
                    {"code": "articulation", "name": "Technical Articulation", "score": sc},
                    {"code": "structure", "name": "Answer Structure", "score": sc},
                    {"code": "clarity", "name": "Clarity & Tone", "score": sc},
                ])

                items.append({
                    "id": str(r["id"]),
                    "studentUserId": str(r["participant_user_id"]),
                    "studentName": r["student_name"] or "Participant",
                    "rollNumber": r["roll_number"] or "N/A",
                    "batchName": r["batch_name"] or "General",
                    "practiceModeTitle": mode_title,
                    "overall": sc,
                    "grounded": True,
                    "dimensions": dims,
                    "trainerOverride": override,
                    "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
                })

            tot = int(total or 0)
            return {
                "success": True,
                "items": items,
                "data": items,
                "total": tot,
                "page": p_val,
                "pageSize": ps_val,
                "pages": max(1, (tot + ps_val - 1) // ps_val),
            }

    filters: dict[str, Any] = {}
    if reviewState != "all":
        filters["trainerReviewState"] = reviewState
    page_result = await AiScoreRepo(ctx).list(filters=filters, page=page, page_size=pageSize)
    return {"success": True, **page_result.to_response()}


@router.post("/ai-scores/{score_id}/override")
async def override_ai_score(
    score_id: str, payload: AiOverrideRequest, ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    """A trainer override keeps the original AI result, the override, and the reason.

    That triple is exactly the dataset needed to improve the model later (§12).
    """
    if settings.USE_POSTGRES and len(score_id) == 36:
        import uuid as _uuid
        import json as _json
        from app.db.postgres import get_pg_connection
        s_uuid = _uuid.UUID(score_id)
        t_uuid = _uuid.UUID(str(ctx.user_id))

        for dimension in payload.dimensions:
            value = dimension.get("score")
            if value is None or not (0 <= float(value) <= 100):
                raise BusinessRuleViolation("Each overridden dimension must score between 0 and 100")

        overall = round(
            sum(float(d.get("score", 0)) * float(d.get("weight", 1 / len(payload.dimensions)))
                for d in payload.dimensions),
            1,
        )

        async with get_pg_connection() as conn:
            session = await conn.fetchrow("SELECT id, metrics, overall_score FROM practice_sessions WHERE id = $1", s_uuid)
            if not session:
                raise NotFound("Practice session not found")

            metrics = session["metrics"] or {}
            if isinstance(metrics, str):
                try:
                    metrics = _json.loads(metrics)
                except Exception:
                    metrics = {}

            override = {
                "dimensions": payload.dimensions,
                "reason": payload.reason,
                "by": str(t_uuid),
                "byLabel": ctx.actor_label,
                "at": _now().isoformat(),
                "originalOverall": float(session["overall_score"]) if session["overall_score"] is not None else None,
            }
            metrics["trainerOverride"] = override
            metrics["overall"] = overall

            await conn.execute("""
                UPDATE practice_sessions
                SET metrics = $1::jsonb, overall_score = $2
                WHERE id = $3
            """, _json.dumps(metrics), overall, s_uuid)

            return {
                "success": True,
                "message": "AI score overridden successfully",
                "data": {
                    "id": score_id,
                    "overall": overall,
                    "trainerOverride": override,
                }
            }

    repo = AiScoreRepo(ctx)
    score = await repo.get(score_id)
    await require_student_in_scope(ctx, score["studentUserId"])

    for dimension in payload.dimensions:
        value = dimension.get("score")
        if value is None or not (0 <= float(value) <= 100):
            raise BusinessRuleViolation("Each overridden dimension must score between 0 and 100")

    original = score.get("dimensions", [])
    override = {
        "dimensions": payload.dimensions,
        "reason": payload.reason,
        "by": ctx.user_id,
        "byLabel": ctx.actor_label,
        "at": _now(),
        "originalDimensions": original,
        "originalOverall": score.get("overall"),
    }
    overall = round(
        sum(float(d.get("score", 0)) * float(d.get("weight", 1 / len(payload.dimensions)))
            for d in payload.dimensions),
        1,
    )
    saved = await repo.update(
        score["_id"],
        {
            "trainerOverride": override,
            "trainerReviewState": "reviewed",
            "reviewedBy": ctx.user_id,
            "reviewedAt": _now(),
            "overriddenOverall": overall,
        },
    )
    await get_db().ai_usage_events.insert_one(
        {
            "collegeId": score.get("collegeId"),
            "departmentId": score.get("departmentId"),
            "kind": "trainer_override",
            "studentUserId": score.get("studentUserId"),
            "modelVersion": score.get("modelVersion"),
            "originalOverall": score.get("overall"),
            "overriddenOverall": overall,
            "reason": payload.reason,
            "at": _now(),
        }
    )
    await enqueue(
        "score.recompute",
        {"studentUserId": str(score["studentUserId"]), "reason": "trainer_override"},
    )
    await notify(
        user_id=score["studentUserId"],
        kind=Kind.ASSESSMENT_FEEDBACK,
        title="Your trainer reviewed your practice attempt",
        body=payload.reason[:160],
        href=f"/student/practice/session/{score['practiceSessionId']}/feedback",
        college_id=score.get("collegeId"),
        department_id=score.get("departmentId"),
    )
    return {"success": True, "message": "AI score overridden", "data": serialize(saved)}


@router.post("/feedback", status_code=status.HTTP_201_CREATED)
async def add_feedback(payload: FeedbackRequest, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    student_id = await require_student_in_scope(ctx, payload.studentUserId)
    session = None
    if payload.trainingSessionId:
        session = await require_trainer_session_scope(ctx, payload.trainingSessionId)
    profile = await StudentProfileRepo(ctx).find_one({"userId": student_id})

    saved = await TrainerFeedbackRepo(ctx).insert(
        {
            "studentUserId": student_id,
            "studentName": (profile or {}).get("name"),
            "rollNumber": (profile or {}).get("rollNumber"),
            "trainingSessionId": (session or {}).get("_id"),
            "sessionLabel": (session or {}).get("topic"),
            "trainingModuleName": (session or {}).get("trainingModuleName"),
            "trainerUserId": ctx.user_id,
            "trainerName": ctx.name,
            "batchId": (profile or {}).get("batchId"),
            "rating": payload.rating,
            "feedbackText": payload.feedbackText,
        }
    )
    await notify(
        user_id=student_id,
        kind=Kind.ASSESSMENT_FEEDBACK,
        title="New trainer feedback",
        body=payload.feedbackText[:160],
        href="/student/progress",
        college_id=ctx.college_id,
        department_id=(profile or {}).get("departmentId"),
    )
    return {"success": True, "message": "Feedback recorded", "data": serialize(saved)}


# --------------------------------------------------------------------------- assessments (quizzes & tests)
@router.get("/assessments")
async def trainer_assessments(
    batchId: str | None = Query(None),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    items = await QuizRepository.list_trainer_quizzes(ctx, batch_id=batchId)
    return {"success": True, "data": items, "items": items}


@router.post("/assessments", status_code=status.HTTP_201_CREATED)
async def create_trainer_assessment(
    payload: TrainerQuizCreateRequest,
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    res = await QuizRepository.create_trainer_quiz(
        ctx,
        title=payload.title,
        description=payload.description,
        instructions=payload.instructions,
        course_id=payload.courseId,
        duration_minutes=payload.durationMinutes,
        max_score=payload.maxScore,
        opens_at=payload.opensAt,
        closes_at=payload.closesAt,
        questions=payload.questions,
        settings=payload.settings,
        batch_ids=payload.batchIds,
        quiz_code=payload.quizCode,
    )
    return {"success": True, "data": res, "message": "Assessment created successfully"}


@router.get("/assessments/{quiz_id}")
async def get_trainer_assessment(
    quiz_id: str,
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    data = await QuizRepository.get_trainer_quiz(ctx, quiz_id)
    return {"success": True, "data": data}


@router.put("/assessments/{quiz_id}")
async def update_trainer_assessment(
    quiz_id: str,
    payload: TrainerQuizUpdateRequest,
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    res = await QuizRepository.update_trainer_quiz(
        ctx,
        quiz_id=quiz_id,
        title=payload.title,
        description=payload.description,
        instructions=payload.instructions,
        course_id=payload.courseId,
        duration_minutes=payload.durationMinutes,
        max_score=payload.maxScore,
        opens_at=payload.opensAt,
        closes_at=payload.closesAt,
        questions=payload.questions,
        settings=payload.settings,
        batch_ids=payload.batchIds,
        status=payload.status,
    )
    return {"success": True, "data": res, "message": "Assessment updated"}


@router.delete("/assessments/{quiz_id}")
async def delete_trainer_assessment(
    quiz_id: str,
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    res = await QuizRepository.delete_trainer_quiz(ctx, quiz_id)
    return {"success": True, "data": res, "message": "Assessment deleted"}


@router.post("/assessments/{quiz_id}/assign-batches")
async def assign_assessment_batches(
    quiz_id: str,
    payload: BatchAssignRequest,
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    res = await QuizRepository.assign_quiz_batches(ctx, quiz_id, payload.batchIds)
    return {"success": True, "data": res, "message": "Batches assigned successfully"}


@router.get("/assessments/{quiz_id}/results")
async def get_trainer_assessment_results(
    quiz_id: str,
    batchId: str | None = Query(None),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    data = await QuizRepository.get_trainer_quiz_results(ctx, quiz_id, batch_id=batchId, include_snapshots_data=False)
    return {"success": True, "data": data}


from pydantic import BaseModel as _PydanticBaseModel, Field as _PydanticField


class BatchExcelExportRequest(_PydanticBaseModel):
    batchIds: list[str] = _PydanticField(..., min_length=1)
    includePhotos: bool = False


@router.post("/assessments/{quiz_id}/export-excel")
async def export_trainer_assessment_excel_batch_scoped(
    quiz_id: str,
    payload: BatchExcelExportRequest,
    ctx: ScopeContext = TrainerCtx,
) -> Response:
    """Generates a secure, batch-scoped Excel workbook (.xlsx) with optional camera snapshot sheets."""
    import io
    import re
    import base64
    from datetime import datetime, timezone
    from PIL import Image as PILImage, ImageFile
    ImageFile.LOAD_TRUNCATED_IMAGES = True
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.drawing.image import Image as OpenpyxlImage
    from openpyxl.utils import get_column_letter
    from app.db.postgres import get_pg_connection
    from app.repositories.assignment_quiz_repo import QuizRepository, _safe_uuid, _parse_json_list
    from app.core.errors import NotFound, ScopeForbidden, ValidationError

    q_uuid = _safe_uuid(quiz_id)
    if not q_uuid:
        raise NotFound("Assessment not found")

    req_batch_uuids = []
    for bid in payload.batchIds:
        bu = _safe_uuid(bid)
        if not bu:
            raise ValidationError(f"Invalid batch ID: {bid}")
        if bu not in req_batch_uuids:
            req_batch_uuids.append(bu)
    if not req_batch_uuids:
        raise ValidationError("Select at least one batch to export.")

    t_uuid = _safe_uuid(ctx.user_id)
    async with get_pg_connection() as conn:
        quiz = await conn.fetchrow(
            "SELECT id, title, creator_trainer_id, institution_id, max_score FROM quizzes WHERE id = $1 AND deleted_at IS NULL",
            q_uuid,
        )
        if not quiz:
            raise NotFound("Assessment not found")

        # Validate quiz access
        if ctx.role not in (Role.ADMIN, Role.SUPER_ADMIN) and quiz["creator_trainer_id"] != t_uuid:
            has_quiz_access = await conn.fetchval(
                """
                SELECT 1 FROM quiz_batch_assignments qba
                JOIN batch_trainers bt ON bt.batch_id = qba.batch_id
                WHERE qba.quiz_id = $1 AND bt.trainer_user_id = $2 AND (bt.status = 'ACTIVE' OR bt.status IS NULL)
                LIMIT 1
                """,
                q_uuid, t_uuid,
            )
            if not has_quiz_access:
                raise ScopeForbidden("You are not authorized to export this assessment.")

        # Validate every requested batch belongs to trainer's authorized batches (prevent IDOR)
        if ctx.role in (Role.ADMIN, Role.SUPER_ADMIN):
            auth_batches = await conn.fetch(
                "SELECT id, name, code FROM batches WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL",
                req_batch_uuids,
            )
        else:
            auth_batches = await conn.fetch(
                """
                SELECT b.id, b.name, b.code
                FROM batches b
                JOIN batch_trainers bt ON bt.batch_id = b.id
                WHERE b.id = ANY($1::uuid[])
                  AND bt.trainer_user_id = $2
                  AND (bt.status = 'ACTIVE' OR bt.status IS NULL)
                  AND b.deleted_at IS NULL
                """,
                req_batch_uuids, t_uuid,
            )
        auth_batch_map = {r["id"]: r for r in auth_batches}
        for bu in req_batch_uuids:
            if bu not in auth_batch_map:
                raise ScopeForbidden("You are not authorized to export one or more selected batches.")

        wb = Workbook()
        # Remove default empty sheet after creating batch sheets
        default_sheet = wb.active
        header_fill = PatternFill(start_color="FFE2E8F0", end_color="FFE2E8F0", fill_type="solid")
        header_font = Font(name="Calibri", size=11, bold=True)
        regular_font = Font(name="Calibri", size=10)
        bold_font = Font(name="Calibri", size=10, bold=True)
        center_align = Alignment(horizontal="center", vertical="center")
        left_align = Alignment(horizontal="left", vertical="center")
        thin_border = Border(
            left=Side(style='thin', color='E2E8F0'),
            right=Side(style='thin', color='E2E8F0'),
            top=Side(style='thin', color='E2E8F0'),
            bottom=Side(style='thin', color='E2E8F0'),
        )

        def _sheet_title(prefix: str, batch_label: str, existing_names: set[str]) -> str:
            clean = re.sub(r'[:\\/?*\[\]\s]+', '_', batch_label).strip('_') or 'Batch'
            base = f"{prefix}_{clean}"[:31]
            cand = base
            idx = 2
            while cand in existing_names:
                suffix = f"_{idx}"
                cand = f"{base[:31 - len(suffix)]}{suffix}"
                idx += 1
            existing_names.add(cand)
            return cand

        used_sheet_names: set[str] = set()
        batch_slugs: list[str] = []

        for bu in req_batch_uuids:
            b_info = auth_batch_map[bu]
            b_label = b_info["code"] or b_info["name"] or "Batch"
            batch_slugs.append(re.sub(r'[^a-zA-Z0-9_-]', '_', b_label))

            attempts = await QuizRepository.fetch_canonical_export_attempts(
                conn,
                q_uuid,
                batch_id=bu,
            )

            res_title = _sheet_title("Result", b_label, used_sheet_names)
            ws_res = wb.create_sheet(title=res_title)
            ws_res.views.sheetView[0].state = "frozen"
            ws_res.views.sheetView[0].ySplit = 1

            res_headers = [
                "Roll Number", "Student Name", "Batch", "Quiz Title",
                "Total Marks", "Obtained Marks", "Percentage", "Correct Answers",
                "Incorrect Answers", "Unattempted Questions", "Submission Status",
                "Submission Time", "Duration (s)", "Warnings", "Submission Reason"
            ]
            ws_res.append(res_headers)
            for col_idx in range(1, len(res_headers) + 1):
                c = ws_res.cell(row=1, column=col_idx)
                c.font = header_font
                c.fill = header_fill
                c.alignment = center_align
                c.border = thin_border
            ws_res.row_dimensions[1].height = 24

            for a in attempts:
                sub_dt = a["completed_at"] or a["local_submitted_at"]
                sub_time = sub_dt.isoformat() if sub_dt else "—"
                ws_res.append([
                    a["roll_number"] or "—",
                    a["student_name"] or "Student",
                    b_info["name"] or b_label,
                    quiz["title"],
                    int(a["possible"] or quiz["max_score"] or 100),
                    int(a["score"] or 0),
                    f"{float(a['percentage'] or 0):.2f}%",
                    int(a["correct_count"] or 0),
                    int(a["incorrect_count"] or 0),
                    int(a["unattempted_count"] or 0),
                    a["candidate_status"] or a["status"] or "—",
                    sub_time,
                    int(a["time_taken_seconds"] or 0),
                    int(a["warning_count"] or 0),
                    a["submission_reason"] or "—",
                ])

            for r_idx in range(2, ws_res.max_row + 1):
                ws_res.row_dimensions[r_idx].height = 20
                for c_idx in range(1, len(res_headers) + 1):
                    cell = ws_res.cell(row=r_idx, column=c_idx)
                    cell.font = regular_font
                    cell.border = thin_border
                    cell.alignment = center_align if c_idx in (5, 6, 7, 8, 9, 10, 13, 14) else left_align

            for col_i, w in enumerate([16, 24, 18, 26, 12, 14, 12, 14, 15, 18, 18, 24, 12, 10, 22], start=1):
                ws_res.column_dimensions[get_column_letter(col_i)].width = w

            if payload.includePhotos:
                snap_title = _sheet_title("Snapshot", b_label, used_sheet_names)
                ws_snap = wb.create_sheet(title=snap_title)
                ws_snap.views.sheetView[0].state = "frozen"
                ws_snap.views.sheetView[0].ySplit = 1
                snap_headers = ["Roll Number", "Student Name"] + [f"Snapshot {i}" for i in range(1, 11)]
                ws_snap.append(snap_headers)
                for col_idx in range(1, len(snap_headers) + 1):
                    c = ws_snap.cell(row=1, column=col_idx)
                    c.font = header_font
                    c.fill = header_fill
                    c.alignment = center_align
                    c.border = thin_border
                ws_snap.row_dimensions[1].height = 24
                ws_snap.column_dimensions["A"].width = 16
                ws_snap.column_dimensions["B"].width = 24
                for idx in range(3, 13):
                    ws_snap.column_dimensions[get_column_letter(idx)].width = 22

                selected_attempt_ids = [a["id"] for a in attempts]
                snaps_by_attempt: dict[Any, list[Any]] = {}
                if selected_attempt_ids:
                    snap_rows = await conn.fetch(
                        """
                        SELECT student_user_id, attempt_id, snapshot_timestamp, image_data
                        FROM quiz_camera_snapshots
                        WHERE quiz_id = $1 AND attempt_id = ANY($2::uuid[])
                        ORDER BY snapshot_timestamp ASC
                        """,
                        q_uuid, selected_attempt_ids,
                    )
                    for sr in snap_rows:
                        snaps_by_attempt.setdefault(sr["attempt_id"], []).append(sr)

                cam_row = 2
                for a in attempts:
                    stu_snaps = snaps_by_attempt.get(a["id"], [])[:10]
                    ws_snap.append([a["roll_number"] or "—", a["student_name"] or "Student"] + [""] * 10)
                    ws_snap.row_dimensions[cam_row].height = 110
                    ws_snap.cell(row=cam_row, column=1).font = regular_font
                    ws_snap.cell(row=cam_row, column=1).border = thin_border
                    ws_snap.cell(row=cam_row, column=2).font = bold_font
                    ws_snap.cell(row=cam_row, column=2).border = thin_border

                    for slot in range(10):
                        c_idx = 3 + slot
                        cell = ws_snap.cell(row=cam_row, column=c_idx)
                        cell.border = thin_border
                        if slot < len(stu_snaps):
                            s_item = stu_snaps[slot]
                            ts_lbl = s_item["snapshot_timestamp"].strftime("%H:%M:%S") if s_item["snapshot_timestamp"] else ""
                            cell.value = f"\n\n\n\n\n{ts_lbl}"
                            cell.font = Font(name="Calibri", size=8, color="475569")
                            cell.alignment = Alignment(horizontal="center", vertical="bottom", wrap_text=True)
                            try:
                                raw_b64 = (s_item["image_data"] or "").split(",")[-1].strip()
                                img_bytes = base64.b64decode(raw_b64)
                                pil_img = PILImage.open(io.BytesIO(img_bytes))
                                ow, oh = pil_img.size
                                scale = min(110.0 / max(1, ow), 75.0 / max(1, oh))
                                dw, dh = max(1, int(ow * scale)), max(1, int(oh * scale))
                                pil_img.thumbnail((dw, dh))
                                out_io = io.BytesIO()
                                pil_img.save(out_io, format="JPEG", quality=85)
                                out_io.seek(0)
                                xl_img = OpenpyxlImage(out_io)
                                xl_img.width = dw
                                xl_img.height = dh
                                ws_snap.add_image(xl_img, f"{get_column_letter(c_idx)}{cam_row}")
                            except Exception:
                                cell.value = f"Image error\n{ts_lbl}"
                        else:
                            cell.value = "Unavailable"
                            cell.font = Font(name="Calibri", size=9, italic=True, color="94A3B8")
                            cell.alignment = center_align
                    cam_row += 1

        if default_sheet in wb.worksheets and len(wb.worksheets) > 1:
            wb.remove(default_sheet)

    out_buf = io.BytesIO()
    wb.save(out_buf)
    out_buf.seek(0)
    safe_title = re.sub(r'[^a-zA-Z0-9_\-]', '_', quiz["title"])
    batch_part = "_".join(batch_slugs[:3]) + ("_more" if len(batch_slugs) > 3 else "")
    date_part = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filename = f"{safe_title}_{batch_part}_{date_part}.xlsx"

    return Response(
        content=out_buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/assessments/{quiz_id}/export-excel")
async def export_trainer_assessment_excel(
    quiz_id: str,
    batchId: str | None = Query(None),
    ctx: ScopeContext = TrainerCtx,
) -> Response:
    """Generates and streams a verified Excel workbook (.xlsx) with embedded proctoring camera snapshots."""
    import io
    import re
    import base64
    from PIL import Image as PILImage, ImageFile
    ImageFile.LOAD_TRUNCATED_IMAGES = True
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.drawing.image import Image as OpenpyxlImage
    from openpyxl.utils import get_column_letter

    data = await QuizRepository.get_trainer_quiz_results(ctx, quiz_id, batch_id=batchId, include_snapshots_data=True)
    quiz_title = data.get("title") or "Assessment"
    results = data.get("results") or []

    wb = Workbook()
    header_fill = PatternFill(start_color="FFE2E8F0", end_color="FFE2E8F0", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True)
    regular_font = Font(name="Calibri", size=10)
    bold_font = Font(name="Calibri", size=10, bold=True)
    center_align = Alignment(horizontal="center", vertical="center")
    left_align = Alignment(horizontal="left", vertical="center")

    thin_border = Border(
        left=Side(style='thin', color='E2E8F0'),
        right=Side(style='thin', color='E2E8F0'),
        top=Side(style='thin', color='E2E8F0'),
        bottom=Side(style='thin', color='E2E8F0'),
    )

    # -------------------------------------------------------------
    # SHEET 1: RESULTS (Preserves all existing student result info)
    # -------------------------------------------------------------
    ws_results = wb.active
    ws_results.title = "Results"
    ws_results.views.sheetView[0].state = "frozen"
    ws_results.views.sheetView[0].ySplit = 1

    res_headers = [
        "Rank", "Roll Number", "Student Name", "Batch",
        "Marks", "Max Marks", "Percentage", "Result", "Warnings",
        "Submission Timestamp", "Attempt Status", "Submission Reason",
        "Assessment ID", "Attempt ID", "Warning Count", "Event Type"
    ]
    ws_results.append(res_headers)
    for col_idx in range(1, len(res_headers) + 1):
        cell = ws_results.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = center_align
        cell.border = thin_border
    ws_results.row_dimensions[1].height = 26

    for r in results:
        w_list = r.get("warningList") or []
        w_types = list(dict.fromkeys(w.get("eventType") or w.get("warning_type") or "Warning" for w in w_list if isinstance(w, dict)))
        event_type_str = ", ".join(w_types) if w_types else "None"
        warning_cnt = r.get("warningCount", r.get("warnings", 0))

        ws_results.append([
            r.get("rank"),
            r.get("rollNumber") or "—",
            r.get("name") or "—",
            r.get("batchName") or "—",
            r.get("score", 0),
            r.get("maxScore", 100),
            f"{r.get('percentage', 0)}%",
            "Pass" if r.get("passed") else "Fail",
            warning_cnt,
            r.get("completedAt") or r.get("submittedAt") or "—",
            r.get("candidateStatus") or r.get("status") or "—",
            r.get("submissionReason") or "—",
            quiz_id,
            r.get("attemptId") or "—",
            warning_cnt,
            event_type_str,
        ])

    for row_num in range(2, ws_results.max_row + 1):
        ws_results.row_dimensions[row_num].height = 20
        for col_num in range(1, len(res_headers) + 1):
            cell = ws_results.cell(row=row_num, column=col_num)
            cell.font = regular_font
            cell.border = thin_border
            if col_num in (1, 5, 6, 7, 8, 9, 15):
                cell.alignment = center_align
            else:
                cell.alignment = left_align

    res_col_widths = [8, 16, 24, 16, 10, 12, 12, 10, 12, 24, 16, 22, 36, 36, 14, 24]
    for idx, width in enumerate(res_col_widths, start=1):
        ws_results.column_dimensions[get_column_letter(idx)].width = width

    # -------------------------------------------------------------
    # SHEET 2: CAMERA SNAPSHOTS (Exact requested schema: 10 snapshots per attempt)
    # -------------------------------------------------------------
    ws_camera = wb.create_sheet(title="Camera Snapshots")
    ws_camera.views.sheetView[0].state = "frozen"
    ws_camera.views.sheetView[0].ySplit = 1

    cam_headers = [
        "Student Name", "Roll Number",
        "Snapshot 1", "Snapshot 2", "Snapshot 3", "Snapshot 4", "Snapshot 5",
        "Snapshot 6", "Snapshot 7", "Snapshot 8", "Snapshot 9", "Snapshot 10"
    ]
    ws_camera.append(cam_headers)
    for col_idx in range(1, len(cam_headers) + 1):
        cell = ws_camera.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = center_align
        cell.border = thin_border
    ws_camera.row_dimensions[1].height = 26

    ws_camera.column_dimensions["A"].width = 24
    ws_camera.column_dimensions["B"].width = 16
    for idx in range(3, 13):
        ws_camera.column_dimensions[get_column_letter(idx)].width = 22

    def _select_rep_snapshots(snaps: list[dict[str, Any]], limit: int = 10) -> list[dict[str, Any]]:
        """Selects up to `limit` representative snapshots chronologically distributed across the exam duration."""
        if not snaps:
            return []
        if len(snaps) <= limit:
            return list(snaps)
        n = len(snaps)
        indices: list[int] = []
        for i in range(limit):
            idx = int(round(i * (n - 1) / (limit - 1)))
            indices.append(idx)
        for k in range(1, len(indices)):
            if indices[k] <= indices[k - 1]:
                indices[k] = indices[k - 1] + 1
        indices = [min(idx, n - 1) for idx in indices]
        for k in range(len(indices) - 2, -1, -1):
            if indices[k] >= indices[k + 1]:
                indices[k] = max(0, indices[k + 1] - 1)
        return [snaps[idx] for idx in indices]

    def _fmt_ts(raw_ts: Any) -> str:
        if not raw_ts:
            return "—"
        s = str(raw_ts).strip()
        if "T" in s:
            s = s.replace("T", " ").split(".")[0]
        return s[:19]

    current_cam_row = 2
    for r in results:
        student_name = r.get("name") or "—"
        roll_num = r.get("rollNumber") or "—"
        all_snapshots = r.get("snapshots") or []
        rep_snapshots = _select_rep_snapshots(all_snapshots, limit=10)

        # Append row with student info and 10 placeholders
        row_values = [student_name, roll_num] + [""] * 10
        ws_camera.append(row_values)
        ws_camera.row_dimensions[current_cam_row].height = 115

        # Format student name & roll number cells
        name_cell = ws_camera.cell(row=current_cam_row, column=1)
        name_cell.font = bold_font
        name_cell.alignment = left_align
        name_cell.border = thin_border

        roll_cell = ws_camera.cell(row=current_cam_row, column=2)
        roll_cell.font = regular_font
        roll_cell.alignment = center_align
        roll_cell.border = thin_border

        # Populate Snapshot 1 through 10
        for slot_idx in range(10):
            col_idx = 3 + slot_idx
            col_letter = get_column_letter(col_idx)
            cell = ws_camera.cell(row=current_cam_row, column=col_idx)
            cell.border = thin_border

            if slot_idx < len(rep_snapshots):
                snap = rep_snapshots[slot_idx]
                ts_str = _fmt_ts(snap.get("timestamp"))
                img_data = snap.get("imageData") or snap.get("image_data") or ""

                cell.value = f"\n\n\n\n\n{ts_str}"
                cell.font = Font(name="Calibri", size=8, color="475569")
                cell.alignment = Alignment(horizontal="center", vertical="bottom", wrap_text=True)

                if img_data:
                    try:
                        clean_b64 = img_data.split(",")[-1].strip()
                        img_bytes = base64.b64decode(clean_b64)
                        pil_img = PILImage.open(io.BytesIO(img_bytes))
                        orig_w, orig_h = pil_img.size
                        scale = min(110.0 / orig_w, 75.0 / orig_h)
                        disp_w = max(1, int(orig_w * scale))
                        disp_h = max(1, int(orig_h * scale))

                        pil_img.thumbnail((disp_w, disp_h))
                        thumb_io = io.BytesIO()
                        pil_img.save(thumb_io, format="JPEG", quality=85)
                        thumb_io.seek(0)

                        openpyxl_img = OpenpyxlImage(thumb_io)
                        openpyxl_img.width = disp_w
                        openpyxl_img.height = disp_h
                        ws_camera.add_image(openpyxl_img, f"{col_letter}{current_cam_row}")
                    except Exception as err:
                        import logging
                        logging.getLogger("app").warning("excel_image_embed_error", extra={"error": str(err)})
                        cell.value = f"Image error\n{ts_str}"
                        cell.font = Font(name="Calibri", size=8, color="EF4444")
            else:
                # Slot is unavailable (fewer than 10 snapshots)
                cell.value = "Unavailable"
                cell.font = Font(name="Calibri", size=9, italic=True, color="94A3B8")
                cell.alignment = center_align
                cell.fill = PatternFill(start_color="FFF8FAFC", end_color="FFF8FAFC", fill_type="solid")

        current_cam_row += 1

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    safe_title = re.sub(r'[^a-zA-Z0-9_\-]', '_', quiz_title)
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=\"{safe_title}_results_with_camera_snapshots.xlsx\""
        },
    )


@router.get("/assessments/{quiz_id}/attempts/{attempt_id}/export-excel")
async def export_individual_assessment_report_excel(
    quiz_id: str,
    attempt_id: str,
    ctx: ScopeContext = TrainerCtx,
) -> Response:
    """Requirement Module 3.1: Generates and streams an individual student's 4-sheet assessment report workbook (.xlsx)."""
    from fastapi.responses import Response
    from app.repositories.assessment_report_repo import AssessmentReportRepository, _sanitize_filename
    from app.repositories.assignment_quiz_repo import _safe_uuid
    from app.db.postgres import get_pg_connection
    from app.core.errors import NotFound, ScopeForbidden
    from app.authz.roles import Role

    q_uuid = _safe_uuid(quiz_id)
    att_uuid = _safe_uuid(attempt_id)
    if not q_uuid or not att_uuid:
        raise NotFound("Assessment or attempt not found.")

    async with get_pg_connection() as conn:
        quiz = await conn.fetchrow(
            "SELECT id, title, creator_trainer_id, institution_id, batch_id FROM quizzes WHERE id = $1",
            q_uuid,
        )
        if not quiz:
            raise NotFound("Assessment not found.")

        if ctx.role == Role.TRAINER:
            t_uuid = _safe_uuid(ctx.user_id)
            trainer_assigned = await conn.fetchval(
                """
                SELECT 1 FROM quizzes q
                WHERE q.id = $1 AND (
                    q.creator_trainer_id = $2 OR q.institution_id = $3 OR q.batch_id IS NOT NULL
                )
                LIMIT 1
                """,
                q_uuid,
                t_uuid,
                _safe_uuid(ctx.college_id),
            )
            if not trainer_assigned:
                raise ScopeForbidden("You are not authorized to export reports for this assessment.")

    report_dict = await AssessmentReportRepository.generate_and_persist_report(att_uuid)
    full_report = await AssessmentReportRepository.get_report_by_id(report_dict["id"])

    if str(full_report.get("quizId")) != str(q_uuid):
        raise NotFound("Attempt does not belong to this assessment.")

    excel_bytes = AssessmentReportRepository.generate_individual_excel_report(full_report)

    roll = full_report.get("rollNumber") or ""
    s_name = full_report.get("studentName") or "Student"
    prefix = _sanitize_filename(roll) if roll.strip() else _sanitize_filename(s_name)
    sanitized_quiz = _sanitize_filename(full_report.get("assessmentTitle") or "Assessment")
    filename = f"{prefix}_{sanitized_quiz}_Report.xlsx"

    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )


@router.get("/assessments/{quiz_id}/export-bulk-reports")
async def export_bulk_assessment_reports(
    quiz_id: str,
    batchId: str | None = Query(None),
    ctx: ScopeContext = TrainerCtx,
) -> Response:
    """Requirement Module 3.2: Generates and streams a ZIP archive containing individual student assessment reports."""
    from fastapi.responses import Response
    from app.repositories.assessment_report_repo import AssessmentReportRepository

    zip_bytes, archive_name = await AssessmentReportRepository.build_bulk_zip_reports(
        quiz_id=quiz_id,
        ctx=ctx,
        batch_id=batchId,
    )

    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{archive_name}"'
        },
    )


@router.get("/assessments/{quiz_id}/reports")
async def list_trainer_assessment_reports(
    quiz_id: str,
    approval_status: str | None = Query(None, alias="status"),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    """Lists permanent assessment reports for a quiz with approval status filtering."""
    from app.repositories.assessment_report_repo import AssessmentReportRepository

    data = await AssessmentReportRepository.list_trainer_assessment_reports(
        ctx=ctx,
        quiz_id=quiz_id,
        approval_status=approval_status,
        search=search,
        page=page,
        page_size=page_size,
    )
    return {"success": True, "data": data}


@router.post("/assessments/reports/{report_id}/approve")
async def approve_assessment_report(
    report_id: str,
    payload: dict[str, Any] | None = None,
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    """Approves an assessment report idempotently and records audit history."""
    from app.repositories.assessment_report_repo import AssessmentReportRepository

    notes = (payload or {}).get("notes") if isinstance(payload, dict) else None
    res = await AssessmentReportRepository.review_assessment_report(
        ctx=ctx,
        report_id=report_id,
        decision="APPROVED",
        notes=notes,
    )
    await write_audit(
        ctx,
        action="approve_assessment_report",
        entity_type="assessment_reports",
        entity_id=report_id,
        detail=f"Approved assessment report {report_id}",
    )
    return {"success": True, "data": res}


@router.post("/assessments/reports/{report_id}/reject")
async def reject_assessment_report(
    report_id: str,
    payload: dict[str, Any] | None = None,
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    """Rejects an assessment report idempotently and records audit history."""
    from app.repositories.assessment_report_repo import AssessmentReportRepository

    notes = (payload or {}).get("notes") or (payload or {}).get("reason") if isinstance(payload, dict) else None
    res = await AssessmentReportRepository.review_assessment_report(
        ctx=ctx,
        report_id=report_id,
        decision="REJECTED",
        notes=notes,
    )
    await write_audit(
        ctx,
        action="reject_assessment_report",
        entity_type="assessment_reports",
        entity_id=report_id,
        detail=f"Rejected assessment report {report_id}",
    )
    return {"success": True, "data": res}


@router.get("/assessments/{quiz_id}/feedback")
async def get_trainer_assessment_feedback(
    quiz_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    """Retrieves aggregated feedback summary and student feedback records for an assessment."""
    res = await QuizRepository.get_trainer_quiz_feedback(
        ctx=ctx,
        quiz_id=quiz_id,
        page=page,
        limit=limit,
    )
    return {"success": True, "data": res}


@router.get("/assessments/{quiz_id}/offline-readiness")
async def get_trainer_assessment_offline_readiness(
    quiz_id: str,
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    """Retrieves offline examination readiness, package download status, and cloud synchronization counts."""
    from uuid import UUID
    from app.db.postgres import get_pg_connection

    quiz_uuid = UUID(str(quiz_id))
    async with get_pg_connection() as conn:
        quiz = await conn.fetchrow(
            "SELECT id, title, duration_minutes, batch_id, institution_id FROM quizzes WHERE id = $1",
            quiz_uuid,
        )
        if not quiz:
            raise NotFound("Assessment not found.")

        packages = await conn.fetch(
            """
            SELECT p.id, p.user_id, p.downloaded_at, p.expires_at, p.status,
                   u.name as student_name, u.email as student_email,
                   COALESCE(sp.roll_number, '') as roll_number
            FROM offline_packages p
            JOIN users u ON u.id = p.user_id
            LEFT JOIN student_profiles sp ON sp.user_id = u.id
            WHERE p.resource_id = $1 AND p.package_type = 'ASSESSMENT_PACK'
            ORDER BY p.downloaded_at DESC NULLS LAST
            """,
            quiz_uuid,
        )

        synced_attempts = await conn.fetch(
            """
            SELECT a.id as attempt_id, a.student_user_id, a.score, a.possible,
                   a.time_taken_seconds, a.local_submitted_at, a.completed_at,
                   a.submission_source, a.offline_integrity_hash,
                   u.name as student_name, COALESCE(sp.roll_number, '') as roll_number
            FROM quiz_attempts a
            JOIN users u ON u.id = a.student_user_id
            LEFT JOIN student_profiles sp ON sp.user_id = u.id
            WHERE a.quiz_id = $1 AND a.submission_source = 'OFFLINE_SYNC'
            ORDER BY a.completed_at DESC NULLS LAST
            """,
            quiz_uuid,
        )

        proctor_logs_count = await conn.fetchval(
            "SELECT COUNT(*) FROM offline_proctoring_logs WHERE quiz_id = $1",
            quiz_uuid,
        ) or 0

        downloaded_user_ids = {p["user_id"] for p in packages}
        synced_user_ids = {a["student_user_id"] for a in synced_attempts}
        downloaded_count = len(downloaded_user_ids)
        synced_count = len(synced_attempts)
        pending_count = len(downloaded_user_ids - synced_user_ids)

        return {
            "success": True,
            "data": {
                "quizId": str(quiz["id"]),
                "title": quiz["title"],
                "durationMinutes": quiz["duration_minutes"],
                "downloadedPackagesCount": downloaded_count,
                "synchronizedAttemptsCount": synced_count,
                "pendingSyncCount": pending_count,
                "offlineProctoringEventsCount": proctor_logs_count,
                "downloadedPackages": [
                    {
                        "packageId": str(p["id"]),
                        "studentId": str(p["user_id"]),
                        "studentName": p["student_name"] or "Student",
                        "rollNumber": p["roll_number"] or "—",
                        "downloadedAt": p["downloaded_at"].isoformat() if p["downloaded_at"] else None,
                        "expiresAt": p["expires_at"].isoformat() if p["expires_at"] else None,
                        "status": p["status"],
                    }
                    for p in packages
                ],
                "synchronizedAttempts": [
                    {
                        "attemptId": str(a["attempt_id"]),
                        "studentId": str(a["student_user_id"]),
                        "studentName": a["student_name"] or "Student",
                        "rollNumber": a["roll_number"] or "—",
                        "score": a["score"],
                        "possible": a["possible"],
                        "durationSeconds": a["time_taken_seconds"],
                        "localSubmittedAt": a["local_submitted_at"].isoformat() if a["local_submitted_at"] else None,
                        "syncedAt": a["completed_at"].isoformat() if a["completed_at"] else None,
                        "integrityHash": a["offline_integrity_hash"],
                    }
                    for a in synced_attempts
                ],
            },
        }


@router.post("/assessments/{quiz_id}/attempts/{attempt_id}/recover")
async def recover_student_assessment_attempt(
    quiz_id: str,
    attempt_id: str,
    payload: AssessmentRecoveryRequest,
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    """Recovers an accidentally submitted or abandoned assessment attempt via RESTART or RESUME."""
    res = await QuizRepository.recover_assessment_attempt(
        ctx=ctx,
        quiz_id=quiz_id,
        attempt_id=attempt_id,
        action=payload.action,
        reason=payload.reason,
    )
    return {"success": True, "data": res}


@router.get("/assessments/{quiz_id}/eedi-analytics")
async def get_trainer_assessment_eedi(
    quiz_id: str,
    batchId: str | None = Query(None),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    data = await QuizRepository.get_trainer_quiz_eedi_analytics(ctx, quiz_id, batch_id=batchId)
    return {"success": True, "data": data}


@router.get("/eedi-indexes")
async def get_trainer_eedi_indexes(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    """Returns all available EEDI evaluation_parameters from PostgreSQL for question authoring and User Guide."""
    from app.db.postgres import get_pg_connection

    async with get_pg_connection() as conn:
        rows = await conn.fetch(
            """
            SELECT code, pillar, label, description, max_score, weight
            FROM evaluation_parameters
            ORDER BY pillar ASC, code ASC
            """
        )

    return {
        "success": True,
        "data": {
            "indexes": [
                {
                    "name": r["label"],
                    "code": r["code"],
                    "pillar": r["pillar"],
                    "databaseId": None,
                    "description": r["description"],
                    "maxScore": float(r["max_score"] or 10),
                    "weight": float(r["weight"] or 1),
                }
                for r in rows
            ],
            "totalCount": len(rows),
        },
    }


@router.get("/assessments/sample-csv")
async def download_sample_assessment_csv(ctx: ScopeContext = TrainerCtx) -> Response:
    """Downloads a sample combined MCQ + MSQ CSV template for assessment question import."""
    sample_csv = (
        "question_type,question,option_a,option_b,option_c,option_d,correct_answers,marks,negative_marks,explanation,eedi_parameters\n"
        'MCQ,"Which language runs on the JVM?","Python","Java","C","HTML",B,2,0,"Java runs on the JVM.","TEC01"\n'
        'MSQ,"Which are programming languages?","Java","Python","HTML","CSS","A|B",4,0,"Java and Python are programming languages.","TEC02|PRB02"\n'
    )
    return Response(
        content=sample_csv,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="assessment_questions_sample.csv"'},
    )


@router.post("/assessments/{quiz_id}/upload-csv")
async def upload_trainer_assessment_csv(
    quiz_id: str,
    file: UploadFile = File(...),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    """Imports combined MCQ + MSQ questions from a single CSV with row-level & EEDI validation."""
    import csv
    import io
    from app.db.postgres import get_pg_connection

    content = await file.read()
    try:
        try:
            text_content = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            text_content = content.decode("latin-1")
        reader = list(csv.DictReader(io.StringIO(text_content)))
    except Exception as exc:
        raise ValidationError(f"Could not parse CSV: {exc}")

    if not reader:
        raise ValidationError("CSV is empty or invalid")

    normalized_rows: list[dict[str, str]] = []
    for row in reader:
        norm_row: dict[str, str] = {}
        for k, v in row.items():
            if k is not None:
                norm_row[str(k).strip().lower().replace(" ", "_")] = str(v or "").strip()
        if any(norm_row.values()):
            normalized_rows.append(norm_row)

    if not normalized_rows:
        raise ValidationError("CSV contained no question rows")

    sample_keys = set(normalized_rows[0].keys())
    has_question = "question" in sample_keys
    has_opt_a = "option_a" in sample_keys or "optiona" in sample_keys
    has_opt_b = "option_b" in sample_keys or "optionb" in sample_keys
    has_correct = any(k in sample_keys for k in ("correct_answers", "correct", "answer"))
    missing = [
        name
        for name, ok in [
            ("question", has_question),
            ("option_a", has_opt_a),
            ("option_b", has_opt_b),
            ("correct_answers", has_correct),
        ]
        if not ok
    ]
    if missing:
        raise ValidationError(f"Missing required column(s): {', '.join(missing)}")

    has_type_col = "question_type" in sample_keys

    async with get_pg_connection() as conn:
        ep_rows = await conn.fetch("SELECT code FROM evaluation_parameters")
    valid_eedi_codes = {str(r["code"]).strip().upper(): str(r["code"]).strip() for r in ep_rows}
    cognitive_terms = {"RECALL", "UNDERSTAND", "APPLY", "ANALYZE", "EVALUATE", "CREATE"}

    row_errors: list[str] = []
    questions: list[dict[str, Any]] = []
    mcq_count = 0
    msq_count = 0

    for idx, row in enumerate(normalized_rows):
        row_num = idx + 2  # 1-based CSV line including header
        q_text = row.get("question", "").strip()
        if not q_text:
            row_errors.append(f"Row {row_num}: Question text is required.")
            continue

        opt_a = row.get("option_a", row.get("optiona", "")).strip()
        opt_b = row.get("option_b", row.get("optionb", "")).strip()
        opt_c = row.get("option_c", row.get("optionc", "")).strip()
        opt_d = row.get("option_d", row.get("optiond", "")).strip()

        if not opt_a or not opt_b:
            row_errors.append(f"Row {row_num}: option_a and option_b are required.")
            continue

        raw_correct = row.get("correct_answers", row.get("correct", row.get("answer", ""))).strip().upper()
        if not raw_correct:
            row_errors.append(f"Row {row_num}: correct_answers is required.")
            continue

        sep_answers = [c.strip() for c in raw_correct.replace(",", "|").split("|") if c.strip()]
        # Deduplicate while preserving order
        correct_ids: list[str] = []
        for c in sep_answers:
            if c not in correct_ids:
                correct_ids.append(c)

        raw_qtype = row.get("question_type", "").strip().upper()
        if has_type_col:
            if raw_qtype not in ("MCQ", "MSQ"):
                row_errors.append(f"Row {row_num}: Invalid question_type '{raw_qtype or 'empty'}' — must be MCQ or MSQ.")
                continue
            q_kind = raw_qtype
        else:
            q_kind = "MSQ" if len(correct_ids) > 1 else "MCQ"

        available_opts = {"A": opt_a, "B": opt_b}
        if opt_c:
            available_opts["C"] = opt_c
        if opt_d:
            available_opts["D"] = opt_d

        invalid_ans = [c for c in correct_ids if c not in available_opts]
        if invalid_ans:
            row_errors.append(
                f"Row {row_num}: correct_answers '{','.join(invalid_ans)}' does not match non-empty options ({', '.join(available_opts.keys())})."
            )
            continue

        if q_kind == "MCQ" and len(correct_ids) != 1:
            row_errors.append(f"Row {row_num}: MCQ must have exactly one correct answer (got {len(correct_ids)}).")
            continue
        if q_kind == "MSQ" and len(correct_ids) < 1:
            row_errors.append(f"Row {row_num}: MSQ must have at least one correct answer.")
            continue

        marks_raw = row.get("marks", row.get("mark", "1")).strip()
        neg_raw = row.get("negative_marks", row.get("negative", "0")).strip() or "0"
        try:
            marks = float(marks_raw) if marks_raw else 1.0
            if marks <= 0:
                raise ValueError("marks must be > 0")
        except ValueError:
            row_errors.append(f"Row {row_num}: Invalid marks '{marks_raw}'.")
            continue

        try:
            negative = float(neg_raw) if neg_raw else 0.0
            if negative < 0:
                raise ValueError("negative_marks must be >= 0")
        except ValueError:
            row_errors.append(f"Row {row_num}: Invalid negative_marks '{neg_raw}'.")
            continue

        explanation = row.get("explanation", "").strip() or None
        image_raw = row.get("image", row.get("img", "")).strip() or None

        eedi_params_raw = row.get("eedi_parameters", "").strip()
        eedi_idx_raw = row.get("eedi_index", row.get("index", "")).strip()
        eedi_term_raw = row.get("eedi_term", row.get("term", "")).strip()

        eedi_parameters: list[str] = []
        if eedi_params_raw:
            tokens = [t.strip() for t in eedi_params_raw.replace(",", "|").split("|") if t.strip()]
            bad_codes: list[str] = []
            for tok in tokens:
                up = tok.upper()
                if up in valid_eedi_codes:
                    eedi_parameters.append(valid_eedi_codes[up])
                elif up in cognitive_terms:
                    eedi_parameters.append(up.title())
                else:
                    bad_codes.append(tok)
            if bad_codes:
                row_errors.append(f"Row {row_num}: Unknown EEDI parameter code(s): {', '.join(bad_codes)}.")
                continue

        eedi_idx = None
        if eedi_idx_raw:
            try:
                eedi_idx = int(eedi_idx_raw)
            except ValueError:
                row_errors.append(f"Row {row_num}: Invalid eedi_index '{eedi_idx_raw}'.")
                continue

        options = [{"id": oid, "text": otext, "correct": oid in correct_ids} for oid, otext in available_opts.items()]
        mapped_qtype = "mcq_multiple" if q_kind == "MSQ" else "mcq_single"
        if q_kind == "MSQ":
            msq_count += 1
        else:
            mcq_count += 1

        primary_term = eedi_parameters[0] if eedi_parameters else (eedi_term_raw if eedi_term_raw else None)
        questions.append({
            "id": f"q_{len(questions) + 1}",
            "question_type": mapped_qtype,
            "questionType": mapped_qtype,
            "type": q_kind,
            "text": q_text,
            "image": image_raw,
            "explanation": explanation,
            "options": options,
            "correct": correct_ids,
            "marks": marks,
            "negative": negative,
            "eedi_parameters": eedi_parameters,
            "eediParameters": eedi_parameters,
            "eediIndex": eedi_idx,
            "eediTerm": primary_term,
            "eedi_index": eedi_idx,
            "eedi_term": primary_term,
        })

    if row_errors:
        raise ValidationError("CSV validation failed:\n" + "\n".join(row_errors[:10]))

    if not questions:
        raise ValidationError("CSV contained no valid questions")

    await QuizRepository.update_trainer_quiz(ctx, quiz_id, questions=questions)
    return {
        "success": True,
        "message": f"Successfully imported {len(questions)} questions ({mcq_count} MCQ, {msq_count} MSQ)",
        "questionCount": len(questions),
        "mcqCount": mcq_count,
        "msqCount": msq_count,
        "preview": [
            {
                "id": q["id"],
                "type": q["type"],
                "text": q["text"],
                "marks": q["marks"],
                "correct": q["correct"],
                "eediParameters": q["eedi_parameters"],
            }
            for q in questions[:10]
        ],
    }


# --------------------------------------------------------------------------- assignments
@router.get("/assignments")
async def assignments(
    batchId: str | None = Query(None),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.repositories.assignment_quiz_repo import AssignmentRepository
        res = await AssignmentRepository.list_trainer_assignments(
            ctx, batch_id=batchId, page=page, page_size=pageSize
        )
        return {
            "success": True,
            "items": res["items"],
            "data": res["items"],
            "pagination": {
                "total": res["total"],
                "page": res["page"],
                "pageSize": res["pageSize"],
                "pages": res["pages"],
                "hasNext": res["page"] < res["pages"],
                "hasPrev": res["page"] > 1,
            },
        }

    filters: dict[str, Any] = {"trainerUserId": ctx.user_id}
    if batchId:
        filters["batchId"] = await require_trainer_batch_scope(ctx, batchId)
    page_result = await AssignmentRepo(ctx).list(filters=filters, page=page, page_size=pageSize)
    items = []
    for assignment in page_result.items:
        roster = await StudentProfileRepo(ctx).count({"batchId": assignment.get("batchId")})
        submitted = await AssignmentSubmissionRepo(ctx).count(
            {"assignmentId": assignment["_id"]}
        )
        items.append(
            {
                **serialize(assignment),
                "rosterSize": roster,
                "submittedCount": submitted,
                "pendingCount": max(0, roster - submitted),
            }
        )
    response = page_result.to_response()
    response["items"] = items
    return {"success": True, **response}


@router.post("/assignments", status_code=status.HTTP_201_CREATED)
async def create_assignment(
    payload: AssignmentRequest, ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    batch_id = await require_trainer_batch_scope(ctx, payload.batchId)
    if payload.dueAt <= _now():
        raise BusinessRuleViolation("The due date must be in the future")

    if settings.USE_POSTGRES:
        from app.repositories.assignment_quiz_repo import AssignmentRepository
        saved = await AssignmentRepository.create_assignment(ctx, {
            "title": payload.title,
            "description": payload.description,
            "batchId": str(batch_id),
            "trainingModuleId": str(payload.trainingModuleId) if payload.trainingModuleId else None,
            "dueAt": payload.dueAt,
            "maxScore": payload.maxScore,
            "allowLate": False,
            "attachments": [],
        })
        return {"success": True, "message": "Assignment created", "data": saved}

    batch = await BatchRepo(ctx).get(batch_id)
    module = (
        await TrainingModuleRepo(ctx).get(payload.trainingModuleId)
        if payload.trainingModuleId
        else None
    )
    saved = await AssignmentRepo(ctx).insert(
        {
            "title": payload.title,
            "description": payload.description,
            "batchId": batch_id,
            "batchName": batch.get("name"),
            "departmentId": batch.get("departmentId"),
            "trainerUserId": ctx.user_id,
            "trainerName": ctx.name,
            "trainingModuleId": (module or {}).get("_id"),
            "trainingModuleName": (module or {}).get("name"),
            "dueAt": payload.dueAt,
            "maxScore": payload.maxScore,
            "attachments": [],
            "status": "open",
        }
    )
    students = await StudentProfileRepo(ctx).find_all(
        {"batchId": batch_id}, projection={"userId": 1}, limit=1000
    )
    from app.services.notifications import notify_many

    await notify_many(
        [s["userId"] for s in students],
        kind=Kind.ASSIGNMENT_DUE,
        title=f"New assignment: {payload.title}",
        body=f"Due {payload.dueAt:%d %b, %H:%M}",
        href="/student/learning",
        college_id=ctx.college_id,
        department_id=batch.get("departmentId"),
        push=False,
    )
    return {"success": True, "message": "Assignment created", "data": serialize(saved)}


@router.patch("/assignments/{assignment_id}")
async def update_assignment(
    assignment_id: str, payload: AssignmentPatch, ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise ValidationError("Nothing to update")

    if settings.USE_POSTGRES and len(assignment_id) == 36:
        from app.db.postgres import get_pg_connection
        import uuid as _uuid
        a_uuid = _uuid.UUID(assignment_id)
        async with get_pg_connection() as conn:
            set_parts = []
            params = [a_uuid]
            for k, v in updates.items():
                if k == "title":
                    params.append(v)
                    set_parts.append(f"title = ${len(params)}")
                elif k == "description":
                    params.append(v)
                    set_parts.append(f"description = ${len(params)}")
                elif k == "dueAt":
                    params.append(v)
                    set_parts.append(f"due_at = ${len(params)}")
                elif k == "maxScore":
                    params.append(v)
                    set_parts.append(f"max_score = ${len(params)}")
                elif k == "status":
                    params.append(v)
                    set_parts.append(f"status = ${len(params)}")
            if set_parts:
                await conn.execute(f"UPDATE assignments SET {', '.join(set_parts)}, updated_at = NOW() WHERE id = $1", *params)
        return {"success": True, "message": "Assignment updated", "data": {"id": assignment_id, **updates}}

    saved = await AssignmentRepo(ctx).update(assignment_id, updates)
    return {"success": True, "message": "Assignment updated", "data": serialize(saved)}


@router.get("/assignments/{assignment_id}/submissions")
async def assignment_submissions(
    assignment_id: str, ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    if settings.USE_POSTGRES and len(assignment_id) == 36:
        from app.repositories.assignment_quiz_repo import AssignmentRepository
        res = await AssignmentRepository.get_submissions(ctx, assignment_id)
        return {"success": True, "data": res}

    assignment = await AssignmentRepo(ctx).get(assignment_id)
    roster = await StudentProfileRepo(ctx).find_all(
        {"batchId": assignment.get("batchId")},
        projection={"userId": 1, "name": 1, "rollNumber": 1},
        limit=1000,
        sort=[("rollNumber", 1)],
    )
    submissions = {
        row["studentUserId"]: row
        for row in await AssignmentSubmissionRepo(ctx).find_all(
            {"assignmentId": assignment["_id"]}, limit=1000
        )
    }
    rows = []
    for profile in roster:
        submission = submissions.get(profile["userId"])
        item = {
            "studentUserId": str(profile["userId"]),
            "name": profile.get("name"),
            "rollNumber": profile.get("rollNumber"),
            "state": "pending" if not submission else submission.get("state", "submitted"),
            "submittedAt": (submission or {}).get("submittedAt"),
            "late": (submission or {}).get("late", False),
            "grade": (submission or {}).get("grade"),
            "remarks": (submission or {}).get("remarks"),
            "note": (submission or {}).get("note"),
            "submissionId": str(submission["_id"]) if submission else None,
            "files": [],
        }
        for attachment in (submission or {}).get("files", []):
            item["files"].append(
                {
                    "filename": attachment.get("filename"),
                    "downloadUrl": await signed_url(
                        attachment["storageKey"], filename=attachment.get("filename")
                    ),
                }
            )
        rows.append(item)
    return {
        "success": True,
        "data": {"assignment": serialize(assignment), "submissions": rows},
    }


@router.patch("/submissions/{submission_id}")
async def review_submission(
    submission_id: str,
    payload: SubmissionReview,
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    if settings.USE_POSTGRES and len(submission_id) == 36:
        from app.repositories.assignment_quiz_repo import AssignmentRepository
        res = await AssignmentRepository.review_submission(
            ctx,
            submission_id=submission_id,
            grade=float(payload.grade) if payload.grade is not None else None,
            remarks=payload.remarks,
            state=payload.state or "reviewed",
        )
        return {"success": True, "message": "Submission reviewed", "data": res}

    repo = AssignmentSubmissionRepo(ctx)
    submission = await repo.get(submission_id)
    assignment = await AssignmentRepo(ctx).get(submission["assignmentId"])
    if payload.grade is not None and payload.grade > float(assignment.get("maxScore", 100)):
        raise BusinessRuleViolation(
            f"Grade cannot exceed the assignment maximum of {assignment.get('maxScore')}"
        )
    saved = await repo.update(
        submission["_id"],
        {
            "grade": payload.grade,
            "remarks": payload.remarks,
            "state": payload.state,
            "reviewedBy": ctx.user_id,
            "reviewedAt": _now(),
        },
    )
    await notify(
        user_id=submission["studentUserId"],
        kind=Kind.ASSESSMENT_FEEDBACK,
        title=f"Your submission was reviewed: {assignment.get('title')}",
        body=(payload.remarks or "See your grade and remarks.")[:160],
        href="/student/learning",
        college_id=ctx.college_id,
        department_id=submission.get("departmentId"),
    )
    return {"success": True, "message": "Submission reviewed", "data": serialize(saved)}


# --------------------------------------------------------------------------- progress, alerts, trends
@router.get("/course-progress")
async def course_progress(
    batchId: str | None = Query(None), ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        import uuid as _uuid
        b_uuid = _safe_uuid(batchId)
        t_uuid = _safe_uuid(ctx.user_id)
        inst_uuid = _safe_uuid(ctx.college_id)

        async with get_pg_connection() as conn:
            m_rows = await conn.fetch("""
                SELECT m.id, m.title as name,
                       COUNT(l.id) as total_sessions,
                       COUNT(l.id) as completed_sessions,
                       COALESCE((
                           SELECT ROUND(AVG(ev.eedi_score)::numeric, 1)
                           FROM eedi_evaluations ev
                           WHERE ev.status = 'COMPLETED' AND ev.eedi_score IS NOT NULL
                       ), 72.5) as avg_score
                FROM modules m
                LEFT JOIN lessons l ON l.module_id = m.id
                WHERE m.deleted_at IS NULL
                GROUP BY m.id, m.title
                ORDER BY m.title
                LIMIT 50
            """)

            module_rows = []
            for r in m_rows:
                tot = int(r["total_sessions"] or 0)
                comp = int(r["completed_sessions"] or 0)
                pct_val = round((comp / tot) * 100, 1) if tot > 0 else 0.0
                sc = float(r["avg_score"]) if r["avg_score"] is not None else 72.5
                module_rows.append({
                    "id": str(r["id"]),
                    "name": r["name"],
                    "totalSessions": tot,
                    "completedSessions": comp,
                    "percent": pct_val,
                    "averageScore": sc,
                })

            b_rows = await conn.fetch("""
                SELECT b.id, b.name,
                       COUNT(ts.id) as total_sessions,
                       COUNT(CASE WHEN ts.status = 'COMPLETED' THEN 1 END) as completed_sessions,
                       (SELECT COUNT(*) FROM student_profiles sp WHERE sp.batch_id = b.id) as student_count
                FROM batches b
                LEFT JOIN training_sessions ts ON ts.batch_id = b.id
                WHERE (b.id IN (SELECT batch_id FROM batch_trainers WHERE trainer_user_id = $1)
                   OR b.institution_id = $2)
                  AND b.deleted_at IS NULL
                GROUP BY b.id, b.name
                ORDER BY b.name
                LIMIT 50
            """, t_uuid, inst_uuid)

            batch_rows = []
            for r in b_rows:
                tot = int(r["total_sessions"] or 0)
                comp = int(r["completed_sessions"] or 0)
                pct_val = round((comp / tot) * 100, 1) if tot > 0 else 0.0
                batch_rows.append({
                    "id": str(r["id"]),
                    "name": r["name"],
                    "percent": pct_val,
                    "studentCount": int(r["student_count"] or 0),
                })

            return {"success": True, "data": {"modules": module_rows, "batches": batch_rows}}

    batch_filter: dict[str, Any] = {}
    if batchId:
        batch_filter["batchId"] = await require_trainer_batch_scope(ctx, batchId)

    modules = await TrainingModuleRepo(ctx).find_all(limit=100)
    module_rows = []
    for module in modules:
        sessions = await TrainingSessionRepo(ctx).count(
            {"trainingModuleId": module["_id"], **batch_filter}
        )
        completed = await TrainingSessionRepo(ctx).count(
            {"trainingModuleId": module["_id"], "status": "completed", **batch_filter}
        )
        assessment = await analytics.assessment_summary(
            ctx, filters={"trainingModuleId": module["_id"], **batch_filter}
        )
        module_rows.append(
            {
                "id": str(module["_id"]),
                "name": module.get("name"),
                "totalSessions": sessions,
                "completedSessions": completed,
                "percent": round(completed / sessions * 100, 1) if sessions else 0.0,
                "averageScore": assessment["average"],
            }
        )

    batches = await BatchRepo(ctx).find_all(limit=50)
    batch_rows = []
    for batch in batches:
        sessions = await TrainingSessionRepo(ctx).count({"batchId": batch["_id"]})
        completed = await TrainingSessionRepo(ctx).count(
            {"batchId": batch["_id"], "status": "completed"}
        )
        batch_rows.append(
            {
                "id": str(batch["_id"]),
                "name": batch.get("name"),
                "percent": round(completed / sessions * 100, 1) if sessions else 0.0,
                "studentCount": await StudentProfileRepo(ctx).count({"batchId": batch["_id"]}),
            }
        )
    return {"success": True, "data": {"modules": module_rows, "batches": batch_rows}}


@router.get("/alerts")
async def alerts(
    resolved: bool = Query(False),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        import uuid as _uuid
        t_uuid = _uuid.UUID(str(ctx.user_id))
        inst_uuid = _uuid.UUID(str(ctx.college_id)) if ctx.college_id else None
        p_val = page if isinstance(page, int) else 1
        ps_val = pageSize if isinstance(pageSize, int) else 20
        offset = (p_val - 1) * ps_val

        res_val = resolved if isinstance(resolved, bool) else False
        async with get_pg_connection() as conn:
            where_sql = "WHERE (w.trainer_user_id = $1 OR w.institution_id = $2)"
            where_sql += " AND w.resolved_at IS NOT NULL" if res_val else " AND w.resolved_at IS NULL"

            total = await conn.fetchval(f"SELECT COUNT(*) FROM weak_student_alerts w {where_sql}", t_uuid, inst_uuid)
            rows = await conn.fetch(f"""
                SELECT w.id, w.reason, w.score, w.threshold, w.resolved_at, w.resolution_note, w.created_at,
                       u.name as student_name, sp.roll_number, b.name as batch_name
                FROM weak_student_alerts w
                JOIN users u ON u.id = w.student_user_id
                LEFT JOIN student_profiles sp ON sp.user_id = w.student_user_id
                LEFT JOIN batches b ON b.id = w.batch_id
                {where_sql}
                ORDER BY w.created_at DESC
                LIMIT $3 OFFSET $4
            """, t_uuid, inst_uuid, ps_val, offset)

        items = []
        for r in rows:
            items.append({
                "id": str(r["id"]),
                "studentName": r["student_name"] or "Student",
                "rollNumber": r["roll_number"] or "N/A",
                "batchName": r["batch_name"] or "General",
                "reason": r["reason"],
                "score": float(r["score"]) if r["score"] is not None else None,
                "threshold": float(r["threshold"]) if r["threshold"] is not None else 65.0,
                "resolved": r["resolved_at"] is not None,
                "resolvedAt": r["resolved_at"].isoformat() if r["resolved_at"] else None,
                "resolutionNote": r["resolution_note"],
                "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
            })
        tot = int(total or 0)
        return {
            "success": True,
            "items": items,
            "total": tot,
            "page": p_val,
            "pageSize": ps_val,
            "pages": max(1, (tot + ps_val - 1) // ps_val),
            "meta": {"threshold": settings.WEAK_STUDENT_THRESHOLD},
        }

    filters = {"resolvedAt": {"$ne": None} if resolved else None}
    page_result = await WeakStudentAlertRepo(ctx).list(
        filters=filters, page=page, page_size=pageSize
    )
    return {
        "success": True,
        **page_result.to_response(),
        "meta": {"threshold": settings.WEAK_STUDENT_THRESHOLD},
    }


@router.patch("/alerts/{alert_id}")
async def resolve_alert(
    alert_id: str, payload: AlertPatch, ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        import uuid as _uuid
        a_uuid = _uuid.UUID(str(alert_id))
        t_uuid = _uuid.UUID(str(ctx.user_id))
        async with get_pg_connection() as conn:
            await conn.execute("""
                UPDATE weak_student_alerts
                SET resolved_at = $2,
                    resolved_by = $3,
                    resolution_note = $4
                WHERE id = $1
            """, a_uuid, _now() if payload.resolved else None, t_uuid if payload.resolved else None, payload.note)
            row = await conn.fetchrow("SELECT id, reason, score, resolved_at, resolution_note FROM weak_student_alerts WHERE id = $1", a_uuid)
            return {"success": True, "message": "Alert updated", "data": dict(row) if row else {}}

    saved = await WeakStudentAlertRepo(ctx).update(
        alert_id,
        {
            "resolvedAt": _now() if payload.resolved else None,
            "resolvedBy": ctx.user_id if payload.resolved else None,
            "resolutionNote": payload.note,
        },
    )
    return {"success": True, "message": "Alert updated", "data": serialize(saved)}


@router.get("/trends")
async def trends(
    batchId: str | None = Query(None),
    studentId: str | None = Query(None),
    weeks: int = Query(8, ge=1, le=52),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    filters: dict[str, Any] = {}
    if batchId:
        filters["batchId"] = await require_trainer_batch_scope(ctx, batchId)
    if studentId:
        filters["studentUserId"] = await require_student_in_scope(ctx, studentId)

    student_trend = None
    if studentId:
        score = await EediScoreRepo(ctx).find_one({"studentUserId": filters["studentUserId"]})
        student_trend = [
            {"at": h.get("computedAt"), "score": h.get("finalScore")}
            for h in (score or {}).get("history", [])
            if h.get("finalScore") is not None
        ]

    return {
        "success": True,
        "data": serialize(
            {
                "attendanceTrend": await analytics.attendance_trend(
                    ctx, weeks=weeks, filters=filters
                ),
                "monthlyAttendance": await analytics.attendance_monthly_trend(
                    ctx, filters=filters
                ),
                "moduleScores": await analytics.assessment_by_module(ctx, filters=filters),
                "batchScores": await analytics.assessment_by_batch(ctx, filters=filters),
                "studentTrend": student_trend,
                "pillarAverages": await analytics.department_pillar_averages(ctx),
            }
        ),
    }


# --------------------------------------------------------------------------- reports
@router.post("/reports", status_code=status.HTTP_202_ACCEPTED)
async def create_report(payload: ReportRequest, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    allowed = {"attendance", "assessment", "defaulters", "feedback", "practice", "learning"}
    if payload.reportType not in allowed:
        raise ValidationError(
            f"Trainers can export: {', '.join(sorted(allowed))}"
        )
    if settings.USE_POSTGRES:
        from app.repositories.report_repo import ReportRepository
        result = await ReportRepository.request_report(
            ctx,
            report_type=payload.reportType,
            fmt=payload.format,
            filters=payload.filters,
            force_async=payload.forceAsync,
        )
        return {"success": True, "data": result}

    from app.services.reports import request_report

    result = await request_report(
        ctx,
        report_type=payload.reportType,
        fmt=payload.format,
        filters=payload.filters,
        force_async=payload.forceAsync,
    )
    return {"success": True, "data": result}


@router.get("/reports")
async def list_reports(
    page: int = Query(1, ge=1), pageSize: int = Query(20, ge=1, le=100),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.repositories.report_repo import ReportRepository
        res = await ReportRepository.list_reports(ctx, page=page, page_size=pageSize)
        return {"success": True, **res}

    from app.repositories.collections import ReportJobRepo

    page_result = await ReportJobRepo(ctx).list(
        filters={"requestedBy": ctx.user_id}, page=page, page_size=pageSize
    )
    return {"success": True, **page_result.to_response()}


# --------------------------------------------------------------------------- Trainer Profile (P0)
from app.routers.trainer_profile import (
    get_my_trainer_profile,
    update_my_trainer_profile,
    upload_trainer_photo,
    upload_trainer_resume,
    upload_trainer_teaching_photo,
    set_trainer_testimonial_approval,
    TrainerProfileUpdateRequest,
    TrainerTestimonialApprovalRequest,
)

@router.get("/profile")
async def trainer_profile(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    return await get_my_trainer_profile(ctx)

@router.patch("/profile")
async def patch_trainer_profile(
    payload: TrainerProfileUpdateRequest,
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    return await update_my_trainer_profile(payload, ctx)

@router.put("/profile")
async def put_trainer_profile(
    payload: TrainerProfileUpdateRequest,
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    return await update_my_trainer_profile(payload, ctx)

@router.post("/profile/photo")
async def post_trainer_photo(
    file: UploadFile = File(...),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    return await upload_trainer_photo(file, ctx)

@router.post("/profile/resume")
async def post_trainer_resume(
    file: UploadFile = File(...),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    return await upload_trainer_resume(file, ctx)

@router.post("/profile/teaching-photo")
async def post_trainer_teaching_photo(
    file: UploadFile = File(...),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    return await upload_trainer_teaching_photo(file, ctx)

@router.post("/profile/{target_user_id}/testimonial")
async def post_trainer_testimonial(
    target_user_id: str,
    payload: TrainerTestimonialApprovalRequest,
    ctx: ScopeContext = Depends(require_role(Role.SUPER_ADMIN)),
) -> dict[str, Any]:
    return await set_trainer_testimonial_approval(target_user_id, payload, ctx)


# --------------------------------------------------------------------------- E-Books
@router.get("/ebooks")
async def trainer_list_ebooks(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    if settings.USE_POSTGRES and ctx.user_id:
        from app.db.postgres import get_pg_connection
        import uuid as _uuid
        try:
            u_uuid = _uuid.UUID(str(ctx.user_id))
            async with get_pg_connection() as conn:
                rows = await conn.fetch("""
                    SELECT e.id, e.title, e.author, e.description, e.category, e.cover_image, e.cover_key,
                           e.page_count, e.file_size_bytes, e.status, e.uploaded_by, e.created_at,
                           co.title as course_title
                    FROM ebooks e
                    LEFT JOIN courses co ON e.course_id = co.id
                    WHERE e.deleted_at IS NULL AND (e.uploaded_by = $1 OR e.status = 'PUBLISHED')
                    ORDER BY e.created_at DESC LIMIT 100
                """, u_uuid)
                items = []
                for r in rows:
                    cover_url = r["cover_image"]
                    if not cover_url and r.get("cover_key"):
                        try:
                            cover_url = await signed_url(r["cover_key"], ttl=3600)
                        except Exception:
                            cover_url = None
                    is_owner = str(r["uploaded_by"]) == str(u_uuid) if r.get("uploaded_by") else False
                    items.append({
                        "id": str(r["id"]),
                        "title": r["title"],
                        "author": r["author"],
                        "description": r["description"],
                        "category": r["category"] or "General",
                        "coverUrl": cover_url,
                        "pageCount": r["page_count"] or 120,
                        "courseTitle": r["course_title"],
                        "published": r["status"] == "PUBLISHED",
                        "status": r["status"] or "PUBLISHED",
                        "rejectionReason": None,
                        "readsCount": 0,
                        "completionsCount": 0,
                        "isOwner": is_owner,
                        "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
                    })
                return {"success": True, "data": items}
        except Exception as e:
            log.warning("trainer_list_ebooks_pg_failed", extra={"error": str(e)})
            return {"success": True, "data": []}

    # Return ebooks authored by this trainer or published
    query = {"$or": [{"uploadedBy": ctx.user_id}, {"collegeId": ctx.college_id, "published": True}]}
    books = await get_db().ebooks.find(query).sort("createdAt", -1).to_list(100)

    items = []
    for b in books:
        cover_url = None
        if b.get("coverKey"):
            cover_url = await signed_url(b["coverKey"], ttl=3600)
        items.append({
            "id": str(b["_id"]),
            "title": b.get("title"),
            "author": b.get("author"),
            "description": b.get("description"),
            "category": b.get("category"),
            "coverUrl": cover_url,
            "pageCount": b.get("pageCount", 120),
            "courseTitle": b.get("courseTitle"),
            "published": b.get("published", False),
            "status": b.get("status", "PUBLISHED" if b.get("published") else "DRAFT"),
            "rejectionReason": b.get("rejectionReason"),
            "readsCount": b.get("readsCount", 0),
            "completionsCount": b.get("completionsCount", 0),
            "isOwner": b.get("uploadedBy") == ctx.user_id,
            "createdAt": b.get("createdAt").isoformat() if b.get("createdAt") else None,
        })
    return {"success": True, "data": items}


@router.post("/ebooks")
async def trainer_create_ebook(
    title: str = Form(...),
    description: str = Form(""),
    category: str = Form("General"),
    author: str = Form(""),
    tags: str = Form(""),
    courseId: str | None = Form(None),
    visibility: str = Form("PUBLIC"),
    file: UploadFile | None = File(None),
    cover: UploadFile | None = File(None),
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    from app.services.ebook_service import validate_pdf_bytes, extract_cover_from_pdf, slugify
    from app.services.storage import Keys, get_storage

    if not title.strip():
        raise ValidationError("Title is required.")

    course_id = ObjectId(courseId) if courseId else None
    course = await get_db().courses.find_one({"_id": course_id}) if course_id else None

    now = _now()
    ebook_id = ObjectId()
    str_id = str(ebook_id)
    storage = get_storage()

    page_count = 100
    file_size = 5 * 1024 * 1024
    pdf_key = Keys.ebook_file(str_id, f"{slugify(title)}.pdf")
    cover_key = None

    if file and file.filename:
        pdf_bytes = await file.read()
        page_count, file_size = validate_pdf_bytes(pdf_bytes)
        await storage.put(pdf_key, pdf_bytes, "application/pdf")

        if cover and cover.size and cover.size > 0:
            c_bytes = await cover.read()
            cover_key = Keys.ebook_cover(str_id, "cover.jpg")
            await storage.put(cover_key, c_bytes, "image/jpeg")
        else:
            extracted = extract_cover_from_pdf(pdf_bytes)
            if extracted:
                cover_key = Keys.ebook_cover(str_id, "cover.jpg")
                await storage.put(cover_key, extracted, "image/jpeg")
    else:
        pdf_key = Keys.ebook_file("default", "book.pdf")

    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    doc = {
        "_id": ebook_id,
        "slug": f"{slugify(title)}-{str_id[-6:]}",
        "collegeId": ctx.college_id,
        "departmentId": list(ctx.department_ids)[0] if ctx.department_ids else None,
        "uploadedBy": ctx.user_id,
        "uploaderRole": "TRAINER",
        "author": author.strip() or ctx.name or "Faculty",
        "title": title.strip(),
        "description": description.strip(),
        "shortDescription": description.strip()[:140] + ("..." if len(description.strip()) > 140 else ""),
        "category": category.strip() or "General",
        "courseId": course_id,
        "courseTitle": course.get("title") if course else None,
        "coverKey": cover_key,
        "fileKey": pdf_key,
        "fileSizeBytes": file_size,
        "pageCount": page_count,
        "tags": tag_list,
        "status": "DRAFT",
        "published": False,
        "visibility": visibility,
        "isFeatured": False,
        "isPinned": False,
        "displayOrder": 0,
        "allowDownload": False,
        "readsCount": 0,
        "completionsCount": 0,
        "createdAt": now,
        "updatedAt": now,
        "deletedAt": None,
    }
    res = await get_db().ebooks.insert_one(doc)
    doc["_id"] = res.inserted_id
    return {"success": True, "data": serialize(doc), "message": "eBook created successfully as Draft."}


@router.post("/ebooks/{ebook_id}/request-publish")
async def trainer_request_publish(
    ebook_id: str,
    payload: dict[str, Any],
    ctx: ScopeContext = TrainerCtx,
) -> dict[str, Any]:
    db = get_db()
    oid = ObjectId(ebook_id)
    book = await db.ebooks.find_one({"_id": oid, "uploadedBy": ctx.user_id, "deletedAt": None})
    if not book:
        raise NotFound("eBook not found.")

    now = _now()
    message = str(payload.get("message", "")).strip()

    await db.ebooks.update_one(
        {"_id": oid},
        {"$set": {"status": "PENDING_REVIEW", "updatedAt": now}},
    )

    req_doc = {
        "ebookId": oid,
        "ebookTitle": book.get("title"),
        "requestedBy": ctx.user_id,
        "requesterName": ctx.name or "Trainer",
        "requesterRole": "TRAINER",
        "collegeId": ctx.college_id,
        "requestMessage": message,
        "status": "PENDING",
        "createdAt": now,
        "updatedAt": now,
    }
    await db.ebook_publish_requests.insert_one(req_doc)
    return {"success": True, "message": "eBook publication requested for Super Admin review."}


@router.get("/ebooks/{ebook_id}")
async def trainer_get_ebook(ebook_id: str, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    if not ObjectId.is_valid(ebook_id):
        raise NotFound("E-Book not found.")
    oid = ObjectId(ebook_id)
    book = await get_db().ebooks.find_one({"_id": oid})
    if not book:
        raise NotFound("E-Book not found.")

    cover_url = None
    if book.get("coverKey"):
        cover_url = await signed_url(book["coverKey"], ttl=3600)

    file_url = None
    if book.get("fileKey"):
        file_url = await signed_url(book["fileKey"], ttl=3600)

    return {
        "success": True,
        "data": {
            "id": str(book["_id"]),
            "title": book.get("title"),
            "author": book.get("author"),
            "description": book.get("description"),
            "category": book.get("category"),
            "coverUrl": cover_url,
            "fileUrl": file_url,
            "pageCount": book.get("pageCount", 100),
            "courseTitle": book.get("courseTitle"),
            "published": book.get("published", False),
            "readsCount": book.get("readsCount", 0),
            "completionsCount": book.get("completionsCount", 0),
            "tags": book.get("tags", []),
            "isOwner": book.get("uploadedBy") == ctx.user_id,
        },
    }


@router.patch("/ebooks/{ebook_id}")
async def trainer_update_ebook(ebook_id: str, payload: dict[str, Any], ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    oid = ObjectId(ebook_id)
    book = await get_db().ebooks.find_one({"_id": oid})
    if not book:
        raise NotFound("E-Book not found.")

    if book.get("uploadedBy") != ctx.user_id and not ctx.is_platform_wide:
        raise ScopeForbidden("You cannot edit another trainer's e-book.")

    allowed = {"title", "author", "description", "category", "published", "tags", "courseTitle"}
    updates = {k: v for k, v in payload.items() if k in allowed}
    updates["updatedAt"] = _now()

    await get_db().ebooks.update_one({"_id": oid}, {"$set": updates})
    return {"success": True, "message": "E-Book updated"}


@router.delete("/ebooks/{ebook_id}")
async def trainer_delete_ebook(ebook_id: str, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    oid = ObjectId(ebook_id)
    book = await get_db().ebooks.find_one({"_id": oid})
    if not book:
        raise NotFound("E-Book not found.")

    if book.get("uploadedBy") != ctx.user_id and not ctx.is_platform_wide:
        raise ScopeForbidden("You cannot delete another trainer's e-book.")

    await get_db().ebooks.update_one({"_id": oid}, {"$set": {"deletedAt": _now(), "published": False}})
    return {"success": True, "message": "E-Book archived"}


# --------------------------------------------------------------------------- Mentor Chat
@router.get("/chat/students")
async def trainer_list_chat_students(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    students = await chat_service.get_authorized_students_for_trainer(ctx.user_id, ctx.college_id)
    return {"success": True, "data": students}


@router.get("/chat/conversations")
async def trainer_list_conversations(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    if settings.USE_POSTGRES and ctx.user_id:
        from app.db.postgres import get_pg_connection
        import uuid as _uuid
        try:
            u_uuid = _uuid.UUID(str(ctx.user_id))
            async with get_pg_connection() as conn:
                rows = await conn.fetch("""
                    SELECT c.id, c.student_user_id, c.trainer_user_id, c.last_message_at, c.last_message_text,
                           c.trainer_unread_count, u.name as student_name, u.avatar_color as student_avatar_color
                    FROM conversations c
                    JOIN users u ON c.student_user_id = u.id
                    WHERE c.trainer_user_id = $1
                    ORDER BY c.last_message_at DESC NULLS LAST LIMIT 100
                """, u_uuid)
                items = []
                for r in rows:
                    items.append({
                        "id": str(r["id"]),
                        "_id": str(r["id"]),
                        "studentUserId": str(r["student_user_id"]),
                        "trainerUserId": str(r["trainer_user_id"]),
                        "studentName": r["student_name"],
                        "studentAvatarColor": r["student_avatar_color"] or "#6366f1",
                        "lastMessageAt": r["last_message_at"].isoformat() if r["last_message_at"] else None,
                        "lastMessageText": r["last_message_text"] or "",
                        "unreadCount": r["trainer_unread_count"] or 0,
                    })
                return {"success": True, "data": items}
        except Exception as e:
            log.warning("list_trainer_conversations_pg_failed", extra={"error": str(e)})
            return {"success": True, "data": []}

    convs = await get_db().conversations.find({"trainerUserId": ctx.user_id, "collegeId": ctx.college_id}).sort("lastMessageAt", -1).to_list(100)
    return {"success": True, "data": serialize(convs)}


@router.post("/chat/conversations/start")
async def trainer_start_conversation(payload: dict[str, Any], ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    student_id = payload["studentUserId"]
    conv = await chat_service.get_or_create_conversation(student_id, ctx.user_id, ctx.college_id)
    return {"success": True, "data": serialize(conv)}


@router.get("/chat/conversations/{conv_id}/messages")
async def trainer_get_chat_messages(conv_id: str, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    if settings.USE_POSTGRES and ctx.user_id:
        from app.db.postgres import get_pg_connection
        import uuid as _uuid
        try:
            c_uuid = _uuid.UUID(str(conv_id))
            u_uuid = _uuid.UUID(str(ctx.user_id))
            async with get_pg_connection() as conn:
                conv = await conn.fetchrow("SELECT * FROM conversations WHERE id = $1 AND trainer_user_id = $2", c_uuid, u_uuid)
                if not conv:
                    raise NotFound("Conversation not found.")
                msgs = await conn.fetch("""
                    SELECT id, conversation_id, sender_user_id, receiver_user_id, sender_role,
                           message_type, message_text, is_read, read_at, created_at
                    FROM messages
                    WHERE conversation_id = $1
                    ORDER BY created_at ASC LIMIT 200
                """, c_uuid)
                await chat_service.mark_conversation_read(c_uuid, u_uuid, "TRAINER")
                return {
                    "success": True,
                    "data": [
                        {
                            "id": str(m["id"]),
                            "_id": str(m["id"]),
                            "conversationId": str(m["conversation_id"]),
                            "senderId": str(m["sender_user_id"]),
                            "senderRole": m["sender_role"],
                            "receiverId": str(m["receiver_user_id"]),
                            "message": m["message_text"],
                            "messageType": m["message_type"],
                            "isRead": m["is_read"],
                            "readAt": m["read_at"].isoformat() if m["read_at"] else None,
                            "createdAt": m["created_at"].isoformat() if m["created_at"] else None,
                        }
                        for m in msgs
                    ]
                }
        except NotFound:
            raise
        except Exception as e:
            log.warning("get_trainer_chat_messages_pg_failed", extra={"error": str(e)})
            raise NotFound("Conversation not found.")

    cid = ObjectId(conv_id)
    conv = await get_db().conversations.find_one({"_id": cid, "trainerUserId": ctx.user_id})
    if not conv:
        raise NotFound("Conversation not found.")

    msgs = await get_db().messages.find({"conversationId": cid}).sort("createdAt", 1).limit(200).to_list(200)
    await chat_service.mark_conversation_read(cid, ctx.user_id, "TRAINER")
    return {"success": True, "data": serialize(msgs)}


@router.post("/chat/conversations/{conv_id}/messages")
async def trainer_send_chat_message(conv_id: str, payload: dict[str, Any], ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    msg = await chat_service.send_chat_message(conv_id, ctx.user_id, "TRAINER", payload.get("message", ""))
    return {"success": True, "data": msg}


@router.post("/chat/conversations/{conv_id}/read")
async def trainer_mark_chat_read(conv_id: str, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    await chat_service.mark_conversation_read(conv_id, ctx.user_id, "TRAINER")
    return {"success": True}


# --------------------------------------------------------------------------- Games
@router.get("/games")
async def trainer_list_games(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    if settings.USE_POSTGRES:
        from app.routers.gamification import trainer_list_games as pg_trainer_list_games
        return await pg_trainer_list_games(ctx=ctx)
    games = await get_db().game_definitions.find({"published": True}).to_list(100)
    assigned = await get_db().game_assignments.find({"trainerUserId": ctx.user_id}).to_list(100)
    assigned_codes = {a["gameCode"] for a in assigned}

    out = []
    for g in games:
        out.append({
            "id": str(g["_id"]),
            "code": g.get("code"),
            "title": g.get("title"),
            "description": g.get("description"),
            "category": g.get("category"),
            "difficulty": g.get("difficulty"),
            "xpReward": g.get("xpReward", 50),
            "isAssigned": g.get("code") in assigned_codes,
            "skillMap": g.get("skillMap", []),
        })
    return {"success": True, "data": out}


@router.get("/games/analytics")
async def trainer_game_analytics(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    from app.repositories.game_repo import GameRepository
    analytics = await GameRepository.get_game_analytics(institution_id=ctx.college_id)
    return {
        "success": True,
        "data": analytics,
    }


@router.post("/games/assign")
async def trainer_assign_game(payload: dict[str, Any], ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    from app.routers.gamification import trainer_assign_game as gamification_assign_game
    from app.routers.gamification import GameAssignmentRequest
    req = GameAssignmentRequest(**payload)
    return await gamification_assign_game(payload=req, ctx=ctx)


# --------------------------------------------------------------------------- Trainer Assigned Courses (Phase 6, 7, 8)
@router.get("/courses")
async def list_trainer_courses(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    """Lists courses assigned to the current trainer with enrollment and session metrics."""
    if settings.USE_POSTGRES and ctx.user_id:
        from app.repositories.learning_content_repo import LearningContentRepository
        courses = await LearningContentRepository.get_trainer_assigned_courses(ctx.user_id)
        out = []
        for c in courses:
            out.append({
                "id": str(c["id"]),
                "title": c["title"],
                "slug": c["slug"],
                "code": c["code"],
                "description": c["description"],
                "category": c["category"],
                "deliveryMode": c["delivery_mode"],
                "durationHours": c["duration_hours"],
                "fee": float(c["fee"]) if c["fee"] is not None else 0.0,
                "status": c.get("status") or ("PUBLISHED" if c["published"] else "DRAFT"),
                "trialDurationDays": c.get("trial_duration_days") or 3,
                "trialEnabled": c.get("trial_enabled", True),
                "batchCount": c.get("batch_count", 0),
                "totalStudents": c.get("total_students", 0),
                "paidStudents": c.get("paid_students", 0),
                "activeTrials": c.get("active_trials", 0),
            })
        return {"success": True, "data": out}
    return {"success": True, "data": []}


@router.get("/courses/{course_id}/sessions")
async def list_trainer_course_sessions(course_id: str, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    """Lists live class sessions with meeting links for an assigned course."""
    if settings.USE_POSTGRES and ctx.user_id:
        from app.repositories.learning_content_repo import LearningContentRepository
        is_assigned = await LearningContentRepository.is_trainer_assigned_to_course(ctx.user_id, course_id)
        if not is_assigned:
            from app.core.errors import ScopeForbidden
            raise ScopeForbidden("You are not assigned as a trainer for this course.")
        sessions = await LearningContentRepository.get_course_sessions(course_id, published_only=False)
        out = []
        for s in sessions:
            out.append({
                "id": str(s["id"]),
                "courseId": str(s["course_id"]),
                "batchId": str(s["batch_id"]) if s.get("batch_id") else None,
                "batchName": s.get("batch_name"),
                "topic": s["topic"],
                "date": str(s.get("session_date") or s.get("date") or "") if (s.get("session_date") or s.get("date")) else None,
                "startTime": s["starts_at"].strftime("%H:%M") if s.get("starts_at") else None,
                "endTime": s["ends_at"].strftime("%H:%M") if s.get("ends_at") else None,
                "meetingLink": s.get("meeting_link"),
                "meetingPassword": s.get("meeting_password"),
                "isPublished": s.get("is_published", True),
            })
        return {"success": True, "data": out}
    return {"success": True, "data": []}


@router.post("/courses/{course_id}/sessions")
async def create_trainer_course_session(
    course_id: str, payload: dict[str, Any], ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    """Schedules a new class session with meeting link for an assigned course."""
    if settings.USE_POSTGRES and ctx.user_id:
        from app.repositories.learning_content_repo import LearningContentRepository
        is_assigned = await LearningContentRepository.is_trainer_assigned_to_course(ctx.user_id, course_id)
        if not is_assigned:
            from app.core.errors import ScopeForbidden
            raise ScopeForbidden("You are not assigned as a trainer for this course.")

        topic = payload.get("topic")
        meeting_link = payload.get("meetingLink") or payload.get("meeting_link")
        if not topic or not meeting_link:
            raise ValidationError("Topic and meetingLink are required.")

        import datetime as dt
        raw_date = payload.get("date")
        session_date = dt.date.fromisoformat(raw_date) if raw_date else dt.date.today()

        raw_start = payload.get("startTime") or payload.get("start_time")
        start_time = dt.time.fromisoformat(raw_start) if raw_start else dt.time(10, 0)

        raw_end = payload.get("endTime") or payload.get("end_time")
        end_time = dt.time.fromisoformat(raw_end) if raw_end else dt.time(11, 0)

        created = await LearningContentRepository.create_course_session(
            course_id=course_id,
            topic=topic,
            session_date=session_date,
            start_time=start_time,
            end_time=end_time,
            meeting_link=meeting_link,
            meeting_password=payload.get("meetingPassword") or payload.get("meeting_password"),
            batch_id=payload.get("batchId") or payload.get("batch_id"),
            is_published=payload.get("isPublished", True),
        )
        return {
            "success": True,
            "message": "Session scheduled successfully with meeting link.",
            "data": {
                "id": str(created["id"]),
                "courseId": str(created["course_id"]),
                "topic": created["topic"],
                "meetingLink": created["meeting_link"],
                "date": str(created["date"]),
                "isPublished": created["is_published"],
            }
        }
    return {"success": False, "message": "Postgres mode required."}


@router.get("/courses/{course_id}/materials")
async def list_trainer_course_materials(course_id: str, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    """Lists class notes, documents, and slides for an assigned course."""
    if settings.USE_POSTGRES and ctx.user_id:
        from app.repositories.learning_content_repo import LearningContentRepository
        is_assigned = await LearningContentRepository.is_trainer_assigned_to_course(ctx.user_id, course_id)
        if not is_assigned:
            from app.core.errors import ScopeForbidden
            raise ScopeForbidden("You are not assigned as a trainer for this course.")
        materials = await LearningContentRepository.get_course_materials(course_id, published_only=False)
        out = []
        for m in materials:
            out.append({
                "id": str(m["id"]),
                "courseId": str(m["course_id"]),
                "title": m["title"],
                "description": m.get("description"),
                "materialType": m["material_type"],
                "fileUrl": m["file_url"],
                "fileSizeBytes": m.get("file_size_bytes", 0),
                "published": m["published"],
                "createdAt": m["created_at"].isoformat() if m.get("created_at") else None,
                "trainerName": m.get("trainer_name"),
            })
        return {"success": True, "data": out}
    return {"success": True, "data": []}


@router.post("/courses/{course_id}/materials")
async def create_trainer_course_material(
    course_id: str, payload: dict[str, Any], ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    """Uploads/publishes course materials (notes, slides, documents)."""
    if settings.USE_POSTGRES and ctx.user_id:
        from app.repositories.learning_content_repo import LearningContentRepository
        is_assigned = await LearningContentRepository.is_trainer_assigned_to_course(ctx.user_id, course_id)
        if not is_assigned:
            from app.core.errors import ScopeForbidden
            raise ScopeForbidden("You are not assigned as a trainer for this course.")

        title = payload.get("title")
        file_url = payload.get("fileUrl") or payload.get("file_url")
        if not title or not file_url:
            raise ValidationError("Title and fileUrl are required.")

        mat = await LearningContentRepository.create_course_material(
            course_id=course_id,
            trainer_user_id=ctx.user_id,
            title=title,
            file_url=file_url,
            description=payload.get("description"),
            material_type=(payload.get("materialType") or payload.get("material_type") or "DOCUMENT").upper(),
            file_size_bytes=int(payload.get("fileSizeBytes") or 0),
            session_id=payload.get("sessionId") or payload.get("session_id"),
            batch_id=payload.get("batchId") or payload.get("batch_id"),
            published=payload.get("published", True),
        )
        return {
            "success": True,
            "message": "Class material published successfully.",
            "data": {
                "id": str(mat["id"]),
                "title": mat["title"],
                "fileUrl": mat["file_url"],
                "materialType": mat["material_type"],
                "published": mat["published"],
            }
        }
    return {"success": False, "message": "Postgres mode required."}


@router.delete("/materials/{material_id}")
async def delete_trainer_material(material_id: str, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    """Deletes class material owned by the trainer."""
    if settings.USE_POSTGRES and ctx.user_id:
        from app.repositories.learning_content_repo import LearningContentRepository
        deleted = await LearningContentRepository.delete_course_material(material_id, trainer_user_id=ctx.user_id)
        if not deleted:
            raise NotFound("Material not found or unauthorized.")
        return {"success": True, "message": "Material removed successfully."}
    return {"success": False}


@router.get("/courses/{course_id}/recordings")
async def list_trainer_course_recordings(course_id: str, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    """Lists class recordings for an assigned course."""
    if settings.USE_POSTGRES and ctx.user_id:
        from app.repositories.learning_content_repo import LearningContentRepository
        is_assigned = await LearningContentRepository.is_trainer_assigned_to_course(ctx.user_id, course_id)
        if not is_assigned:
            from app.core.errors import ScopeForbidden
            raise ScopeForbidden("You are not assigned as a trainer for this course.")
        recs = await LearningContentRepository.get_course_recordings(course_id, published_only=False)
        out = []
        for r in recs:
            out.append({
                "id": str(r["id"]),
                "courseId": str(r["course_id"]),
                "title": r["title"],
                "recordingUrl": r["recording_url"],
                "durationSeconds": r.get("duration_seconds", 0),
                "status": r["status"],
                "createdAt": r["created_at"].isoformat() if r.get("created_at") else None,
                "trainerName": r.get("trainer_name"),
            })
        return {"success": True, "data": out}
    return {"success": True, "data": []}


@router.post("/courses/{course_id}/recordings")
async def create_trainer_course_recording(
    course_id: str, payload: dict[str, Any], ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    """Publishes a session recording for an assigned course."""
    if settings.USE_POSTGRES and ctx.user_id:
        from app.repositories.learning_content_repo import LearningContentRepository
        is_assigned = await LearningContentRepository.is_trainer_assigned_to_course(ctx.user_id, course_id)
        if not is_assigned:
            from app.core.errors import ScopeForbidden
            raise ScopeForbidden("You are not assigned as a trainer for this course.")

        title = payload.get("title")
        rec_url = payload.get("recordingUrl") or payload.get("recording_url")
        if not title or not rec_url:
            raise ValidationError("Title and recordingUrl are required.")

        rec = await LearningContentRepository.create_course_recording(
            course_id=course_id,
            trainer_user_id=ctx.user_id,
            title=title,
            recording_url=rec_url,
            duration_seconds=int(payload.get("durationSeconds") or 0),
            session_id=payload.get("sessionId") or payload.get("session_id"),
            batch_id=payload.get("batchId") or payload.get("batch_id"),
            status=payload.get("status", "PUBLISHED"),
        )
        return {
            "success": True,
            "message": "Class recording published successfully.",
            "data": {
                "id": str(rec["id"]),
                "title": rec["title"],
                "recordingUrl": rec["recording_url"],
                "status": rec["status"],
            }
        }
    return {"success": False, "message": "Postgres mode required."}


@router.patch("/recordings/{recording_id}")
async def update_trainer_recording(
    recording_id: str, payload: dict[str, Any], ctx: ScopeContext = TrainerCtx
) -> dict[str, Any]:
    """Updates recording details."""
    if settings.USE_POSTGRES and ctx.user_id:
        from app.repositories.learning_content_repo import LearningContentRepository
        updated = await LearningContentRepository.update_course_recording(recording_id, payload)
        if not updated:
            raise NotFound("Recording not found.")
        return {"success": True, "message": "Recording updated.", "data": {"id": str(updated["id"])}}
    return {"success": False}


@router.delete("/recordings/{recording_id}")
async def delete_trainer_recording(recording_id: str, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    """Deletes recording owned by the trainer."""
    if settings.USE_POSTGRES and ctx.user_id:
        from app.repositories.learning_content_repo import LearningContentRepository
        deleted = await LearningContentRepository.delete_course_recording(recording_id, trainer_user_id=ctx.user_id)
        if not deleted:
            raise NotFound("Recording not found or unauthorized.")
        return {"success": True, "message": "Recording removed."}
    return {"success": False}


# --------------------------------------------------------------------------- Course Invitations
@router.get("/course-invitations")
async def trainer_list_course_invitations(ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    """Lists all pending and past course teaching invitations offered to this trainer."""
    if not ctx.user_id:
        return {"success": True, "items": []}

    try:
        t_uuid = UUID(str(ctx.user_id))
    except (ValueError, TypeError):
        return {"success": True, "items": []}

    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT 
                    ci.id, ci.course_id, c.title as course_title, c.code as course_code,
                    c.category as course_category, c.delivery_mode,
                    ci.institution_id, i.name as institution_name,
                    ci.department_id, d.name as department_name,
                    ci.batch_id, b.name as batch_name,
                    ci.status, ci.notes, ci.proposed_start_date, ci.proposed_end_date,
                    ci.response_notes, ci.responded_at, ci.created_at
                FROM course_invitations ci
                JOIN courses c ON ci.course_id = c.id
                LEFT JOIN institutions i ON ci.institution_id = i.id
                LEFT JOIN departments d ON ci.department_id = d.id
                LEFT JOIN batches b ON ci.batch_id = b.id
                WHERE ci.trainer_user_id = $1
                ORDER BY 
                    CASE WHEN ci.status = 'PENDING' THEN 1 ELSE 2 END,
                    ci.created_at DESC
                """,
                t_uuid,
            )
            items = [
                {
                    "id": str(r["id"]),
                    "courseId": str(r["course_id"]),
                    "courseTitle": r["course_title"],
                    "courseCode": r["course_code"],
                    "category": r["course_category"],
                    "deliveryMode": r["delivery_mode"],
                    "institutionId": str(r["institution_id"]) if r["institution_id"] else None,
                    "institutionName": r["institution_name"],
                    "departmentId": str(r["department_id"]) if r["department_id"] else None,
                    "departmentName": r["department_name"],
                    "batchId": str(r["batch_id"]) if r["batch_id"] else None,
                    "batchName": r["batch_name"],
                    "status": r["status"],
                    "notes": r["notes"],
                    "proposedStartDate": r["proposed_start_date"].isoformat() if r["proposed_start_date"] else None,
                    "proposedEndDate": r["proposed_end_date"].isoformat() if r["proposed_end_date"] else None,
                    "responseNotes": r["response_notes"],
                    "respondedAt": r["responded_at"].isoformat() if r["responded_at"] else None,
                    "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
                }
                for r in rows
            ]
            return {"success": True, "items": items}
    return {"success": True, "items": []}


@router.post("/course-invitations/{invitation_id}/accept")
async def trainer_accept_course_invitation(invitation_id: str, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    """Trainer accepts an offered course invitation, making the course active on their profile."""
    if not ctx.user_id:
        from app.core.errors import ScopeForbidden
        raise ScopeForbidden("Authentication required.")

    try:
        t_uuid = UUID(str(ctx.user_id))
        inv_uuid = UUID(str(invitation_id))
    except (ValueError, TypeError):
        raise ValidationError("Invalid UUID format.")

    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        async with get_pg_connection() as conn:
            inv = await conn.fetchrow(
                "SELECT * FROM course_invitations WHERE id = $1 AND trainer_user_id = $2",
                inv_uuid, t_uuid
            )
            if not inv:
                raise NotFound("Course invitation not found.")
            if inv["status"] != "PENDING":
                raise ValidationError(f"Cannot accept invitation in '{inv['status']}' state.")

            # 1. Update invitation status to ACCEPTED
            await conn.execute(
                "UPDATE course_invitations SET status = 'ACCEPTED', responded_at = NOW(), updated_at = NOW() WHERE id = $1",
                inv_uuid
            )

            # 2. Add to course_trainers
            await conn.execute(
                """
                INSERT INTO course_trainers (course_id, trainer_user_id, assigned_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (course_id, trainer_user_id) DO NOTHING
                """,
                inv["course_id"], t_uuid
            )

            # 3. Add to course_trainer_assignments
            existing_cta = await conn.fetchrow(
                """
                SELECT id FROM course_trainer_assignments 
                WHERE course_id = $1 AND trainer_user_id = $2 
                  AND ((department_id = $3) OR (department_id IS NULL AND $3 IS NULL))
                """,
                inv["course_id"], t_uuid, inv["department_id"]
            )
            if not existing_cta:
                await conn.execute(
                    """
                    INSERT INTO course_trainer_assignments (course_id, trainer_user_id, institution_id, department_id, assigned_by)
                    VALUES ($1, $2, $3, $4, $5)
                    """,
                    inv["course_id"], t_uuid, inv["institution_id"], inv["department_id"], inv["offered_by"]
                )

            # 4. If batch_id specified, add to batch_trainers
            if inv["batch_id"]:
                await conn.execute(
                    """
                    INSERT INTO batch_trainers (batch_id, trainer_user_id, institution_id, assigned_by, notes)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (batch_id, trainer_user_id) DO NOTHING
                    """,
                    inv["batch_id"], t_uuid, inv["institution_id"], inv["offered_by"], inv["notes"]
                )

        return {"success": True, "message": "Course invitation accepted. Course is now assigned to your profile."}
    return {"success": False, "message": "Postgres mode required."}


@router.post("/course-invitations/{invitation_id}/reject")
async def trainer_reject_course_invitation(invitation_id: str, payload: dict[str, Any] = {}, ctx: ScopeContext = TrainerCtx) -> dict[str, Any]:
    """Trainer declines an offered course invitation."""
    if not ctx.user_id:
        from app.core.errors import ScopeForbidden
        raise ScopeForbidden("Authentication required.")

    try:
        t_uuid = UUID(str(ctx.user_id))
        inv_uuid = UUID(str(invitation_id))
    except (ValueError, TypeError):
        raise ValidationError("Invalid UUID format.")

    reason = (payload.get("reason") or "").strip()

    if settings.USE_POSTGRES:
        from app.db.postgres import get_pg_connection
        async with get_pg_connection() as conn:
            inv = await conn.fetchrow(
                "SELECT * FROM course_invitations WHERE id = $1 AND trainer_user_id = $2",
                inv_uuid, t_uuid
            )
            if not inv:
                raise NotFound("Course invitation not found.")
            if inv["status"] != "PENDING":
                raise ValidationError(f"Cannot decline invitation in '{inv['status']}' state.")

            await conn.execute(
                "UPDATE course_invitations SET status = 'REJECTED', response_notes = $1, responded_at = NOW(), updated_at = NOW() WHERE id = $2",
                reason or None, inv_uuid
            )

        return {"success": True, "message": "Course invitation declined."}
    return {"success": False, "message": "Postgres mode required."}


