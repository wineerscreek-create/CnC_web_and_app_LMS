"""PostgreSQL Repository for Quizzes, Quiz Attempts, Assignments, and Submissions.

Ensures participant and trainer assessments/assignments are completely native to PostgreSQL.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.core.config import settings
from app.core.errors import BusinessRuleViolation, NotFound, ValidationError
from app.core.logging import get_logger
from app.db.postgres import get_pg_connection
from app.services.storage import Keys, put_object, signed_url

log = get_logger("app.assignment_quiz_repo")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_uuid(val: Any) -> uuid.UUID | None:
    if not val:
        return None
    try:
        return uuid.UUID(str(val))
    except (ValueError, TypeError):
        return None


def _parse_json_list(val: Any) -> list[Any]:
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                return parsed
        except Exception:
            pass
    return []


DEFAULT_QUIZ_BANK = [
    (
        "Business Communication Basics",
        "quiz",
        15,
        100,
        [
            {
                "id": "q1",
                "text": "Which opening is most appropriate for a formal client email?",
                "marks": 1,
                "options": [
                    {"id": "o1", "text": "Hey there!", "correct": False},
                    {"id": "o2", "text": "Dear Mr. Sharma,", "correct": True},
                    {"id": "o3", "text": "Yo team", "correct": False},
                    {"id": "o4", "text": "Hi hi", "correct": False},
                ],
            },
            {
                "id": "q2",
                "text": "What is the main purpose of an email subject line?",
                "marks": 1,
                "options": [
                    {"id": "o1", "text": "Decoration", "correct": False},
                    {"id": "o2", "text": "To let the reader triage the message", "correct": True},
                    {"id": "o3", "text": "To repeat the body text", "correct": False},
                    {"id": "o4", "text": "To include your signoff", "correct": False},
                ],
            },
            {
                "id": "q3",
                "text": "Which sentence provides the most direct and professional clarity?",
                "marks": 1,
                "options": [
                    {"id": "o1", "text": "The delay was caused by unforeseen factors.", "correct": False},
                    {"id": "o2", "text": "We missed the delivery deadline because the supplier shipped late.", "correct": True},
                    {"id": "o3", "text": "Regrettably an unforeseen circumstance arose.", "correct": False},
                    {"id": "o4", "text": "It got delayed yesterday.", "correct": False},
                ],
            },
        ],
    ),
    (
        "Grammar & Syntax Assessment",
        "quiz",
        15,
        100,
        [
            {
                "id": "q1",
                "text": "Choose the grammatically correct sentence.",
                "marks": 1,
                "options": [
                    {"id": "o1", "text": "He don't know the answer.", "correct": False},
                    {"id": "o2", "text": "He doesn't knows the answer.", "correct": False},
                    {"id": "o3", "text": "He doesn't know the answer.", "correct": True},
                    {"id": "o4", "text": "He not know the answer.", "correct": False},
                ],
            },
            {
                "id": "q2",
                "text": "Identify the correctly punctuated sentence.",
                "marks": 1,
                "options": [
                    {"id": "o1", "text": "Lets eat, grandma.", "correct": False},
                    {"id": "o2", "text": "Let's eat, grandma.", "correct": True},
                    {"id": "o3", "text": "Lets eat grandma.", "correct": False},
                    {"id": "o4", "text": "Let's eat grandma.", "correct": False},
                ],
            },
        ],
    ),
    (
        "Quantitative & Logical Reasoning",
        "quiz",
        20,
        100,
        [
            {
                "id": "q1",
                "text": "If a task takes 6 people 4 days, how long for 8 people at the same rate?",
                "marks": 1,
                "options": [
                    {"id": "o1", "text": "3 days", "correct": True},
                    {"id": "o2", "text": "2 days", "correct": False},
                    {"id": "o3", "text": "5 days", "correct": False},
                    {"id": "o4", "text": "6 days", "correct": False},
                ],
            },
            {
                "id": "q2",
                "text": "What is 15% of 240?",
                "marks": 1,
                "options": [
                    {"id": "o1", "text": "36", "correct": True},
                    {"id": "o2", "text": "32", "correct": False},
                    {"id": "o3", "text": "40", "correct": False},
                    {"id": "o4", "text": "24", "correct": False},
                ],
            },
        ],
    ),
]


class QuizRepository:
    @classmethod
    async def ensure_seeded(cls, institution_id: uuid.UUID | None, department_id: uuid.UUID | None, batch_id: uuid.UUID | None) -> None:
        """Seed default baseline quizzes if no quizzes exist."""
        async with get_pg_connection() as conn:
            existing = await conn.fetchval("SELECT COUNT(*) FROM quizzes LIMIT 1")
            if existing and int(existing) > 0:
                await conn.execute(
                    """
                    UPDATE quizzes
                    SET institution_id = NULL, batch_id = NULL
                    WHERE title IN ('Business Communication Basics', 'Grammar & Syntax Assessment', 'Quantitative & Logical Reasoning')
                      AND (institution_id IS NOT NULL OR batch_id IS NOT NULL)
                    """
                )
                return

            for title, kind, duration, max_sc, questions in DEFAULT_QUIZ_BANK:
                await conn.execute(
                    """
                    INSERT INTO quizzes (
                        institution_id, department_id, batch_id, title, kind,
                        duration_minutes, max_score, allow_retake, opens_at, closes_at,
                        questions, status, created_at, updated_at
                    ) VALUES (
                        NULL, NULL, NULL, $1, $2,
                        $3, $4, false, NOW() - INTERVAL '5 days', NOW() + INTERVAL '30 days',
                        $5::jsonb, 'active', NOW(), NOW()
                    )
                    """,
                    title, kind,
                    duration, max_sc, json.dumps(questions)
                )

    @classmethod
    async def list_student_quizzes(cls, ctx: ScopeContext) -> list[dict[str, Any]]:
        u_uuid = _safe_uuid(ctx.user_id)
        inst_uuid = _safe_uuid(ctx.college_id)
        dept_uuid = _safe_uuid(ctx.department_id)

        async with get_pg_connection() as conn:
            # Get student batch
            b_row = await conn.fetchrow("SELECT batch_id, institution_id, department_id FROM student_profiles WHERE user_id = $1", u_uuid)
            batch_id = b_row["batch_id"] if b_row else None
            if not inst_uuid and b_row and b_row["institution_id"]:
                inst_uuid = b_row["institution_id"]
            if not dept_uuid and b_row and b_row["department_id"]:
                dept_uuid = b_row["department_id"]

            await cls.ensure_seeded(inst_uuid, dept_uuid, batch_id)

            rows = await conn.fetch(
                """
                SELECT q.id, q.title, q.kind, q.duration_minutes, q.max_score,
                       q.opens_at, q.closes_at, q.questions,
                       qa.score as my_score, qa.completed_at
                FROM quizzes q
                LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id AND qa.student_user_id = $1
                WHERE (q.batch_id = $2 OR q.institution_id = $3 OR q.batch_id IS NULL OR q.institution_id IS NULL)
                  AND q.status = 'active'
                ORDER BY q.opens_at DESC NULLS LAST
                """,
                u_uuid, batch_id, inst_uuid
            )

        items = []
        now = _now()
        for r in rows:
            opens = r["opens_at"]
            closes = r["closes_at"]
            state = "available"
            if r["my_score"] is not None or r["completed_at"]:
                state = "completed"
            elif opens and opens > now:
                state = "upcoming"
            elif closes and closes < now:
                state = "closed"

            questions = _parse_json_list(r["questions"])
            items.append({
                "id": str(r["id"]),
                "title": r["title"],
                "kind": r["kind"] or "quiz",
                "questions": len(questions),
                "durationMinutes": r["duration_minutes"],
                "opensAt": opens.isoformat() if opens else None,
                "closesAt": closes.isoformat() if closes else None,
                "state": state,
                "myScore": int(r["my_score"]) if r["my_score"] is not None else None,
                "maxScore": int(r["max_score"] or 100),
            })
        return items

    @classmethod
    async def get_quiz(cls, quiz_id: str, student_user_id: uuid.UUID) -> dict[str, Any]:
        q_uuid = _safe_uuid(quiz_id)
        if not q_uuid:
            raise NotFound("Quiz not found")

        async with get_pg_connection() as conn:
            quiz = await conn.fetchrow(
                """
                SELECT id, title, kind, duration_minutes, max_score, opens_at, closes_at, questions
                FROM quizzes WHERE id = $1 AND status = 'active'
                """,
                q_uuid
            )
            if not quiz:
                raise NotFound("Quiz not found")

            attempt = await conn.fetchrow(
                "SELECT score, completed_at FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
                q_uuid, student_user_id
            )

        q_list = _parse_json_list(quiz["questions"])
        questions = [
            {
                "id": q.get("id"),
                "text": q.get("text"),
                "options": [{"id": o.get("id"), "text": o.get("text")} for o in q.get("options", [])],
                "marks": q.get("marks", 1),
            }
            for q in q_list
        ]

        return {
            "id": str(quiz["id"]),
            "title": quiz["title"],
            "kind": quiz["kind"],
            "durationMinutes": quiz["duration_minutes"],
            "maxScore": quiz["max_score"],
            "opensAt": quiz["opens_at"].isoformat() if quiz["opens_at"] else None,
            "closesAt": quiz["closes_at"].isoformat() if quiz["closes_at"] else None,
            "questions": questions,
            "attempt": {
                "score": attempt["score"],
                "completedAt": attempt["completed_at"].isoformat() if attempt["completed_at"] else None,
            } if attempt else None,
        }

    @classmethod
    async def submit_quiz_attempt(cls, ctx: ScopeContext, quiz_id: str, answers: dict[str, str]) -> dict[str, Any]:
        q_uuid = _safe_uuid(quiz_id)
        u_uuid = _safe_uuid(ctx.user_id)
        if not q_uuid:
            raise NotFound("Quiz not found")

        async with get_pg_connection() as conn:
            quiz = await conn.fetchrow("SELECT id, title, questions, max_score, allow_retake FROM quizzes WHERE id = $1", q_uuid)
            if not quiz:
                raise NotFound("Quiz not found")

            existing = await conn.fetchrow("SELECT id, score FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2", q_uuid, u_uuid)
            if existing and not quiz["allow_retake"]:
                raise BusinessRuleViolation("You have already submitted this assessment")

            q_list = _parse_json_list(quiz["questions"])
            earned = 0
            total_marks = 0
            for q in q_list:
                m = int(q.get("marks", 1))
                total_marks += m
                qid = q.get("id")
                chosen_opt_id = answers.get(qid)
                for opt in q.get("options", []):
                    if opt.get("id") == chosen_opt_id and opt.get("correct"):
                        earned += m
                        break

            pct_score = int(round((earned / max(1, total_marks)) * float(quiz["max_score"] or 100)))

            if existing:
                await conn.execute(
                    """
                    UPDATE quiz_attempts
                    SET score = $3, answers = $4::jsonb, completed_at = NOW()
                    WHERE id = $1 AND student_user_id = $2
                    """,
                    existing["id"], u_uuid, pct_score, json.dumps(answers)
                )
                att_id = existing["id"]
            else:
                att_id = uuid.uuid4()
                await conn.execute(
                    """
                    INSERT INTO quiz_attempts (id, quiz_id, student_user_id, score, possible, answers, created_at, completed_at)
                    VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), NOW())
                    """,
                    att_id, q_uuid, u_uuid, pct_score, int(quiz["max_score"] or 100), json.dumps(answers)
                )

        return {
            "attemptId": str(att_id),
            "score": pct_score,
            "maxScore": int(quiz["max_score"] or 100),
            "percentage": pct_score,
            "passed": pct_score >= 60,
        }


class AssignmentRepository:
    @classmethod
    async def list_trainer_assignments(cls, ctx: ScopeContext, batch_id: str | None = None, page: int = 1, page_size: int = 20) -> dict[str, Any]:
        page = max(1, page)
        page_size = min(100, max(1, page_size))
        offset = (page - 1) * page_size

        t_uuid = _safe_uuid(ctx.user_id)
        b_uuid = _safe_uuid(batch_id)
        inst_uuid = _safe_uuid(ctx.college_id)

        async with get_pg_connection() as conn:
            where_sql = "WHERE (a.trainer_user_id = $1 OR a.batch_id = $2 OR $2 IS NULL) AND a.status != 'archived'"
            total = await conn.fetchval(f"SELECT COUNT(*) FROM assignments a {where_sql}", t_uuid, b_uuid)

            rows = await conn.fetch(
                f"""
                SELECT a.id, a.title, a.description, a.batch_id, b.name as batch_name,
                       a.due_at, a.max_score, a.allow_late, a.status, a.created_at,
                       (SELECT COUNT(*) FROM student_profiles sp WHERE sp.batch_id = a.batch_id) as roster_size,
                       (SELECT COUNT(*) FROM assignment_submissions sub WHERE sub.assignment_id = a.id) as submitted_count
                FROM assignments a
                LEFT JOIN batches b ON b.id = a.batch_id
                {where_sql}
                ORDER BY a.created_at DESC
                LIMIT $3 OFFSET $4
                """,
                t_uuid, b_uuid, page_size, offset
            )

        items = []
        for r in rows:
            roster = int(r["roster_size"] or 0)
            submitted = int(r["submitted_count"] or 0)
            items.append({
                "id": str(r["id"]),
                "_id": str(r["id"]),
                "title": r["title"],
                "description": r["description"],
                "batchId": str(r["batch_id"]) if r["batch_id"] else None,
                "batchName": r["batch_name"] or "General",
                "dueAt": r["due_at"].isoformat() if r["due_at"] else None,
                "maxScore": float(r["max_score"] or 100),
                "allowLate": r["allow_late"],
                "status": r["status"],
                "rosterSize": roster,
                "submittedCount": submitted,
                "pendingCount": max(0, roster - submitted),
                "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
            })

        tot = int(total or 0)
        return {
            "items": items,
            "total": tot,
            "page": page,
            "pageSize": page_size,
            "pages": max(1, (tot + page_size - 1) // page_size),
        }

    @classmethod
    async def create_assignment(cls, ctx: ScopeContext, data: dict[str, Any]) -> dict[str, Any]:
        inst_uuid = _safe_uuid(ctx.college_id)
        t_uuid = _safe_uuid(ctx.user_id)
        b_uuid = _safe_uuid(data.get("batchId"))
        m_uuid = _safe_uuid(data.get("trainingModuleId"))

        a_uuid = uuid.uuid4()
        due_at = data.get("dueAt")
        if isinstance(due_at, str):
            due_at = datetime.fromisoformat(due_at.replace("Z", "+00:00"))

        async with get_pg_connection() as conn:
            await conn.execute(
                """
                INSERT INTO assignments (
                    id, institution_id, batch_id, trainer_user_id, training_module_id,
                    title, description, due_at, max_score, allow_late, attachments,
                    status, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8, $9, $10, $11::jsonb,
                    'open', NOW(), NOW()
                )
                """,
                a_uuid, inst_uuid, b_uuid, t_uuid, m_uuid,
                data["title"], data.get("description", ""), due_at,
                float(data.get("maxScore", 100)), bool(data.get("allowLate", False)),
                json.dumps(data.get("attachments", []))
            )

        return {
            "id": str(a_uuid),
            "_id": str(a_uuid),
            "title": data["title"],
            "batchId": str(b_uuid) if b_uuid else None,
            "status": "open",
        }

    @classmethod
    async def get_submissions(cls, ctx: ScopeContext, assignment_id: str) -> dict[str, Any]:
        a_uuid = _safe_uuid(assignment_id)
        if not a_uuid:
            raise NotFound("Assignment not found")

        async with get_pg_connection() as conn:
            assignment = await conn.fetchrow(
                "SELECT a.id, a.title, a.batch_id, a.due_at, a.max_score FROM assignments a WHERE a.id = $1",
                a_uuid
            )
            if not assignment:
                raise NotFound("Assignment not found")

            # Roster for the batch
            roster = await conn.fetch(
                """
                SELECT sp.user_id, u.name, sp.roll_number
                FROM student_profiles sp
                JOIN users u ON u.id = sp.user_id
                WHERE sp.batch_id = $1 AND u.deleted_at IS NULL
                ORDER BY sp.roll_number ASC NULLS LAST
                """,
                assignment["batch_id"]
            )

            subs = await conn.fetch(
                """
                SELECT s.id, s.student_user_id, s.state, s.grade, s.remarks, s.note, s.files, s.late, s.submitted_at
                FROM assignment_submissions s
                WHERE s.assignment_id = $1
                """,
                a_uuid
            )
            sub_map = {r["student_user_id"]: r for r in subs}

        rows = []
        for p in roster:
            uid = p["user_id"]
            sub = sub_map.get(uid)
            files = _parse_json_list(sub["files"]) if sub else []
            rows.append({
                "studentUserId": str(uid),
                "name": p["name"],
                "rollNumber": p["roll_number"] or "N/A",
                "state": sub["state"] if sub else "pending",
                "submittedAt": sub["submitted_at"].isoformat() if sub and sub["submitted_at"] else None,
                "late": sub["late"] if sub else False,
                "grade": float(sub["grade"]) if sub and sub["grade"] is not None else None,
                "remarks": sub["remarks"] if sub else None,
                "note": sub["note"] if sub else None,
                "submissionId": str(sub["id"]) if sub else None,
                "files": files,
            })

        return {
            "assignment": {
                "id": str(assignment["id"]),
                "_id": str(assignment["id"]),
                "title": assignment["title"],
                "maxScore": float(assignment["max_score"] or 100),
            },
            "submissions": rows,
        }

    @classmethod
    async def review_submission(cls, ctx: ScopeContext, submission_id: str, grade: float | None, remarks: str | None, state: str) -> dict[str, Any]:
        s_uuid = _safe_uuid(submission_id)
        if not s_uuid:
            raise NotFound("Submission not found")
        t_uuid = _safe_uuid(ctx.user_id)

        async with get_pg_connection() as conn:
            await conn.execute(
                """
                UPDATE assignment_submissions
                SET grade = $2, remarks = $3, state = $4, reviewed_by = $5, reviewed_at = NOW()
                WHERE id = $1
                """,
                s_uuid, grade, remarks, state, t_uuid
            )
            sub = await conn.fetchrow("SELECT id, state, grade, remarks FROM assignment_submissions WHERE id = $1", s_uuid)

        return dict(sub) if sub else {}

    @classmethod
    async def list_student_assignments(cls, ctx: ScopeContext) -> list[dict[str, Any]]:
        u_uuid = _safe_uuid(ctx.user_id)
        inst_uuid = _safe_uuid(ctx.college_id)

        async with get_pg_connection() as conn:
            b_row = await conn.fetchrow("SELECT batch_id, institution_id FROM student_profiles WHERE user_id = $1", u_uuid)
            batch_id = b_row["batch_id"] if b_row else None
            if not inst_uuid and b_row and b_row["institution_id"]:
                inst_uuid = b_row["institution_id"]

            rows = await conn.fetch(
                """
                SELECT a.id, a.title, a.description, a.due_at, a.max_score, a.allow_late, a.attachments, a.status,
                       s.id as submission_id, s.state as sub_state, s.grade, s.remarks, s.note, s.files, s.submitted_at
                FROM assignments a
                LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_user_id = $1
                WHERE (a.batch_id = $2 OR a.institution_id = $3 OR a.batch_id IS NULL)
                  AND a.status != 'archived'
                ORDER BY a.due_at ASC NULLS LAST
                """,
                u_uuid, batch_id, inst_uuid
            )

        items = []
        now = _now()
        for r in rows:
            due = r["due_at"]
            sub_id = r["submission_id"]
            state = "pending"
            if r["grade"] is not None:
                state = "graded"
            elif sub_id:
                state = r["sub_state"] or "submitted"

            days_left = (due.date() - now.date()).days if due else None

            submission_doc = None
            if sub_id:
                submission_doc = {
                    "id": str(sub_id),
                    "_id": str(sub_id),
                    "state": r["sub_state"],
                    "grade": float(r["grade"]) if r["grade"] is not None else None,
                    "remarks": r["remarks"],
                    "note": r["note"],
                    "files": _parse_json_list(r["files"]),
                    "submittedAt": r["submitted_at"].isoformat() if r["submitted_at"] else None,
                }

            items.append({
                "id": str(r["id"]),
                "_id": str(r["id"]),
                "title": r["title"],
                "description": r["description"],
                "dueAt": due.isoformat() if due else None,
                "maxScore": float(r["max_score"] or 100),
                "allowLate": r["allow_late"],
                "submission": submission_doc,
                "state": state,
                "daysLeft": days_left,
            })

        return items

    @classmethod
    async def submit_assignment(cls, ctx: ScopeContext, assignment_id: str, note: str, file_data: bytes | None, filename: str | None, content_type: str | None) -> dict[str, Any]:
        a_uuid = _safe_uuid(assignment_id)
        u_uuid = _safe_uuid(ctx.user_id)
        if not a_uuid:
            raise NotFound("Assignment not found")

        async with get_pg_connection() as conn:
            assignment = await conn.fetchrow("SELECT id, due_at, allow_late FROM assignments WHERE id = $1", a_uuid)
            if not assignment:
                raise NotFound("Assignment not found")

            due_at = assignment["due_at"]
            now = _now()
            is_late = bool(due_at and due_at < now)
            if is_late and not assignment["allow_late"]:
                raise BusinessRuleViolation("The deadline for this assignment has passed")

            files = []
            if file_data and filename:
                storage_key = Keys.submission(str(a_uuid), str(u_uuid), filename)
                stored = await put_object(storage_key, file_data, content_type or "application/octet-stream")
                files.append({
                    "filename": filename,
                    "storageKey": stored.key,
                    "bytes": stored.bytes,
                    "contentType": content_type,
                })

            sub_uuid = uuid.uuid4()
            await conn.execute(
                """
                INSERT INTO assignment_submissions (
                    id, assignment_id, student_user_id, state, note, files, late, submitted_at
                ) VALUES (
                    $1, $2, $3, 'submitted', $4, $5::jsonb, $6, NOW()
                )
                ON CONFLICT (assignment_id, student_user_id) DO UPDATE SET
                    state = 'submitted',
                    note = EXCLUDED.note,
                    files = EXCLUDED.files,
                    late = EXCLUDED.late,
                    submitted_at = NOW()
                """,
                sub_uuid, a_uuid, u_uuid, note, json.dumps(files), is_late
            )

        return {
            "assignmentId": str(a_uuid),
            "state": "submitted",
            "late": is_late,
            "message": "Assignment submitted successfully",
        }
