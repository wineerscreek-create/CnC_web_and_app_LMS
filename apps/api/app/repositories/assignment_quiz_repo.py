"""PostgreSQL Repository for Quizzes, Quiz Attempts, Assignments, and Submissions.

Ensures participant and trainer assessments/assignments are completely native to PostgreSQL.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any

from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.core.config import settings
from app.core.errors import BusinessRuleViolation, Conflict, NotFound, ScopeForbidden, ValidationError
from app.core.logging import get_logger
from app.db.postgres import get_pg_connection
from app.services.storage import Keys, put_object, signed_url

log = get_logger("app.assignment_quiz_repo")


DEFAULT_PERFORMANCE_RANGES: dict[str, dict[str, float]] = {
    "FAIL": {"min": 0.0, "max": 39.0},
    "NEED_IMPROVEMENT": {"min": 40.0, "max": 59.0},
    "GOOD": {"min": 60.0, "max": 79.0},
    "EXCELLENT": {"min": 80.0, "max": 100.0},
}

DEFAULT_MOTIVATIONAL_MESSAGES: dict[str, str] = {
    "FAIL": "Every mistake is an opportunity to learn. Identify your weak areas, practise consistently and try again.",
    "NEED_IMPROVEMENT": "You are making progress. Focus on the topics where you lost marks and keep improving.",
    "GOOD": "Good work! You have developed a solid understanding. Keep practising to reach the next level.",
    "EXCELLENT": "Outstanding performance! Your preparation and understanding are reflected in your results. Keep challenging yourself.",
}


def normalize_category_key(key: str) -> str:
    k = str(key).strip().upper().replace(" ", "_")
    if k in ("NEED_IMPROVEMENT", "NEED_IMPROVEMENTS", "NEEDIMPROVEMENT"):
        return "NEED_IMPROVEMENT"
    return k


def validate_performance_classification_settings(
    ranges: dict[str, Any] | None,
    messages: dict[str, Any] | None = None,
) -> tuple[dict[str, dict[str, float]], dict[str, str]]:
    """Strictly validates four performance categories (FAIL, NEED_IMPROVEMENT, GOOD, EXCELLENT)."""
    req_cats = ["FAIL", "NEED_IMPROVEMENT", "GOOD", "EXCELLENT"]

    clean_ranges: dict[str, dict[str, float]] = {}
    if ranges and isinstance(ranges, dict):
        for raw_k, v in ranges.items():
            norm_k = normalize_category_key(raw_k)
            if isinstance(v, (list, tuple)) and len(v) >= 2:
                try:
                    c_min = float(v[0])
                    c_max = float(v[1])
                    clean_ranges[norm_k] = {"min": c_min, "max": c_max}
                except (ValueError, TypeError):
                    raise ValidationError(f"Invalid min/max range values for category '{raw_k}'")
            elif isinstance(v, dict) and "min" in v and "max" in v:
                try:
                    c_min = float(v["min"])
                    c_max = float(v["max"])
                    clean_ranges[norm_k] = {"min": c_min, "max": c_max}
                except (ValueError, TypeError):
                    raise ValidationError(f"Invalid min/max range values for category '{raw_k}'")
    else:
        clean_ranges = {k: dict(v) for k, v in DEFAULT_PERFORMANCE_RANGES.items()}

    for cat in req_cats:
        if cat not in clean_ranges:
            clean_ranges[cat] = dict(DEFAULT_PERFORMANCE_RANGES[cat])

    if clean_ranges["FAIL"]["min"] != 0:
        raise ValidationError("Lowest category (FAIL) must start at 0%")
    if clean_ranges["EXCELLENT"]["max"] != 100:
        raise ValidationError("Highest category (EXCELLENT) must end at 100%")

    ordered = ["FAIL", "NEED_IMPROVEMENT", "GOOD", "EXCELLENT"]
    for i in range(len(ordered)):
        cat = ordered[i]
        c_min = clean_ranges[cat]["min"]
        c_max = clean_ranges[cat]["max"]
        if c_min > c_max:
            raise ValidationError(f"Category '{cat}' min ({c_min}%) cannot be greater than max ({c_max}%)")
        if i < len(ordered) - 1:
            next_cat = ordered[i + 1]
            n_min = clean_ranges[next_cat]["min"]
            if c_max >= n_min:
                raise ValidationError(f"Overlapping ranges between {cat} (max {c_max}%) and {next_cat} (min {n_min}%)")
            if (n_min - c_max) > 1.01:
                raise ValidationError(f"Gap detected between {cat} (max {c_max}%) and {next_cat} (min {n_min}%)")

    clean_messages: dict[str, str] = {}
    if messages and isinstance(messages, dict):
        for raw_k, msg in messages.items():
            norm_k = normalize_category_key(raw_k)
            if msg and str(msg).strip():
                clean_messages[norm_k] = str(msg).strip()

    for cat in req_cats:
        if cat not in clean_messages or not clean_messages[cat].strip():
            clean_messages[cat] = DEFAULT_MOTIVATIONAL_MESSAGES[cat]

    return clean_ranges, clean_messages


def determine_performance_category(percentage: float, ranges: dict[str, Any] | None) -> str:
    """Classifies percentage into FAIL, NEED IMPROVEMENT, GOOD, or EXCELLENT."""
    p = round(float(percentage), 2)
    active_ranges = ranges or DEFAULT_PERFORMANCE_RANGES

    for cat_label, norm_key in [
        ("EXCELLENT", "EXCELLENT"),
        ("GOOD", "GOOD"),
        ("NEED IMPROVEMENT", "NEED_IMPROVEMENT"),
        ("FAIL", "FAIL"),
    ]:
        r = active_ranges.get(norm_key) or active_ranges.get(cat_label)
        if r and isinstance(r, dict):
            rmin = float(r.get("min", 0.0))
            rmax = float(r.get("max", 100.0))
            if rmin <= p <= rmax:
                return cat_label

    if p >= 80.0:
        return "EXCELLENT"
    elif p >= 60.0:
        return "GOOD"
    elif p >= 40.0:
        return "NEED IMPROVEMENT"
    return "FAIL"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_uuid(val: Any) -> uuid.UUID | None:
    if not val:
        return None
    try:
        return uuid.UUID(str(val))
    except (ValueError, TypeError):
        return None


def as_utc(val: Any) -> datetime:
    if isinstance(val, datetime):
        if val.tzinfo is None:
            return val.replace(tzinfo=timezone.utc)
        return val.astimezone(timezone.utc)
    return datetime.now(timezone.utc)


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


def _parse_json_dict(val: Any) -> dict[str, Any]:
    if not val:
        return {}
    if isinstance(val, dict):
        return dict(val)
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            return dict(parsed) if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


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
            b_row = await conn.fetchrow(
                "SELECT batch_id, institution_id, department_id FROM student_profiles WHERE user_id = $1",
                u_uuid
            )
            batch_id = b_row["batch_id"] if b_row else None
            if not inst_uuid and b_row and b_row["institution_id"]:
                inst_uuid = b_row["institution_id"]
            if not dept_uuid and b_row and b_row["department_id"]:
                dept_uuid = b_row["department_id"]

            await cls.ensure_seeded(inst_uuid, dept_uuid, batch_id)

            rows = await conn.fetch(
                """
                SELECT q.id, q.title, q.kind, q.duration_minutes, q.max_score,
                       q.opens_at, q.closes_at, q.questions, q.settings, q.quiz_code,
                       qa.score as my_score, qa.completed_at, qa.passed, qa.percentage
                FROM quizzes q
                LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id AND qa.student_user_id = $1
                WHERE q.status = 'active'
                  AND (
                    -- Explicitly assigned to the student's batch via quiz_batch_assignments
                    EXISTS (
                        SELECT 1 FROM quiz_batch_assignments qba
                        WHERE qba.quiz_id = q.id AND qba.batch_id = $2 AND UPPER(qba.status) = 'ACTIVE'
                    )
                    -- Fallback for legacy quizzes without quiz_batch_assignments
                    OR (
                        NOT EXISTS (SELECT 1 FROM quiz_batch_assignments qba WHERE qba.quiz_id = q.id)
                        AND (q.batch_id = $2 OR (q.batch_id IS NULL AND (q.institution_id = $3 OR q.institution_id IS NULL)))
                    )
                  )
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
                "passed": r["passed"],
                "percentage": float(r["percentage"]) if r["percentage"] is not None else None,
                "quizCode": r["quiz_code"],
            })
        return items

    @classmethod
    async def get_quiz(cls, quiz_id: str, student_user_id: uuid.UUID) -> dict[str, Any]:
        q_uuid = _safe_uuid(quiz_id)
        if not q_uuid:
            raise NotFound("Quiz not found")

        async with get_pg_connection() as conn:
            # Verify student profile and batch
            b_row = await conn.fetchrow(
                "SELECT batch_id, institution_id FROM student_profiles WHERE user_id = $1",
                student_user_id
            )
            student_batch_id = b_row["batch_id"] if b_row else None
            student_inst_id = b_row["institution_id"] if b_row else None

            quiz = await conn.fetchrow(
                """
                SELECT q.id, q.title, q.kind, q.duration_minutes, q.max_score, q.opens_at, q.closes_at,
                       q.questions, q.settings, q.quiz_code, q.batch_id, q.institution_id,
                       q.description, q.instructions
                FROM quizzes q
                WHERE q.id = $1 AND q.status = 'active'
                """,
                q_uuid
            )
            if not quiz:
                raise NotFound("Quiz not found")

            # Check if quiz has batch assignments
            has_assignments = await conn.fetchval(
                "SELECT COUNT(*) FROM quiz_batch_assignments WHERE quiz_id = $1",
                q_uuid
            )

            is_authorized = False
            if has_assignments and int(has_assignments) > 0:
                is_authorized = bool(await conn.fetchval(
                    """
                    SELECT 1 FROM quiz_batch_assignments
                    WHERE quiz_id = $1 AND batch_id = $2 AND UPPER(status) = 'ACTIVE'
                    """,
                    q_uuid, student_batch_id
                ))
            else:
                is_authorized = bool(
                    quiz["batch_id"] == student_batch_id or
                    (quiz["batch_id"] is None and (
                        quiz["institution_id"] == student_inst_id or 
                        quiz["institution_id"] is None or
                        (ctx.college_id and str(quiz["institution_id"]) == str(ctx.college_id))
                    ))
                )

            if not is_authorized:
                raise ScopeForbidden("This assessment is not assigned to your batch")

            attempt = await conn.fetchrow(
                """
                SELECT qa.score, qa.possible, qa.completed_at, qa.passed, qa.percentage,
                       qa.performance_category, qa.motivational_message, qa.correct_count,
                       qa.incorrect_count, qa.unattempted_count, u.name as student_name
                FROM quiz_attempts qa
                LEFT JOIN users u ON u.id = qa.student_user_id
                WHERE qa.quiz_id = $1 AND qa.student_user_id = $2
                """,
                q_uuid, student_user_id
            )

        now = _now()
        schedule_status = "ACTIVE"
        if quiz["opens_at"] and as_utc(quiz["opens_at"]) > now:
            schedule_status = "UPCOMING"
        elif quiz["closes_at"] and as_utc(quiz["closes_at"]) < now:
            schedule_status = "EXPIRED"

        q_list = _parse_json_list(quiz["questions"])
        settings_dict = _parse_json_dict(quiz["settings"]) if quiz["settings"] else {}
        timing_mode = (
            settings_dict.get("timing_mode")
            or ("PER_QUESTION" if settings_dict.get("enable_timed_questions") else "FIXED_TOTAL")
        )
        settings_dict["timing_mode"] = timing_mode
        settings_dict["enable_timed_questions"] = (timing_mode == "PER_QUESTION")
        default_q_dur = int(settings_dict.get("question_duration", 30))

        questions = []
        if schedule_status != "UPCOMING":
            for q in q_list:
                opts = []
                if isinstance(q.get("options"), list):
                    for i, o in enumerate(q.get("options", [])):
                        opts.append({"id": o.get("id", chr(65 + i)), "text": o.get("text", "")})
                elif isinstance(q.get("options"), dict):
                    for k, v in q.get("options", {}).items():
                        opts.append({"id": k, "text": str(v)})
                q_time_limit = int(q.get("time_limit") or q.get("duration_seconds") or q.get("timeLimitSeconds") or default_q_dur)
                questions.append({
                    "id": str(q.get("id")),
                    "text": q.get("text") or q.get("question"),
                    "image": q.get("image"),
                    "options": opts,
                    "marks": q.get("marks", 1),
                    "time_limit": q_time_limit,
                    "duration_seconds": q_time_limit,
                    "question_type": q.get("question_type") or q.get("questionType") or ("mcq_multiple" if len(q.get("correct", [])) > 1 else "mcq_single"),
                })

        return {
            "id": str(quiz["id"]),
            "title": quiz["title"],
            "description": quiz.get("description"),
            "instructions": quiz.get("instructions"),
            "kind": quiz["kind"],
            "timingMode": timing_mode,
            "timing_mode": timing_mode,
            "durationMinutes": quiz["duration_minutes"],
            "maxScore": quiz["max_score"],
            "opensAt": quiz["opens_at"].isoformat() if quiz["opens_at"] else None,
            "closesAt": quiz["closes_at"].isoformat() if quiz["closes_at"] else None,
            "scheduleStatus": schedule_status,
            "quizCode": quiz["quiz_code"],
            "settings": settings_dict,
            "questions": questions,
            "attempt": {
                "score": attempt["score"],
                "maxScore": attempt["possible"],
                "completedAt": attempt["completed_at"].isoformat() if attempt["completed_at"] else None,
                "passed": attempt["passed"],
                "percentage": float(attempt["percentage"]) if attempt["percentage"] is not None else None,
                "performanceCategory": attempt["performance_category"],
                "motivationalMessage": attempt["motivational_message"],
                "correctCount": attempt["correct_count"],
                "incorrectCount": attempt["incorrect_count"],
                "unattemptedCount": attempt["unattempted_count"],
                "studentName": attempt["student_name"],
            } if attempt else None,
        }

    @classmethod
    async def submit_quiz_attempt(
        cls,
        ctx: ScopeContext,
        quiz_id: str,
        answers: dict[str, Any] | None = None,
        device_id: str | None = None,
        warnings: list[Any] | None = None,
        submission_reason: str = "STUDENT_MANUAL_SUBMIT",
    ) -> dict[str, Any]:
        q_uuid = _safe_uuid(quiz_id)
        u_uuid = _safe_uuid(ctx.user_id)
        if not q_uuid:
            raise NotFound("Quiz not found")

        async with get_pg_connection() as conn:
            # Verify student profile and batch
            b_row = await conn.fetchrow(
                "SELECT batch_id, institution_id FROM student_profiles WHERE user_id = $1",
                u_uuid
            )
            student_batch_id = b_row["batch_id"] if b_row else None
            student_inst_id = b_row["institution_id"] if b_row else None

            quiz = await conn.fetchrow(
                "SELECT id, title, questions, max_score, allow_retake, closes_at, batch_id, institution_id, settings FROM quizzes WHERE id = $1 AND status = 'active'",
                q_uuid
            )
            if not quiz:
                raise NotFound("Quiz not found")

            # Check deadline with grace period
            now_utc = _now()
            if quiz["closes_at"] and as_utc(quiz["closes_at"]) + timedelta(seconds=60) < now_utc:
                raise BusinessRuleViolation("This assessment has already closed")

            # Check batch authorization
            has_assignments = await conn.fetchval(
                "SELECT COUNT(*) FROM quiz_batch_assignments WHERE quiz_id = $1",
                q_uuid
            )
            is_authorized = False
            if has_assignments and int(has_assignments) > 0:
                is_authorized = bool(await conn.fetchval(
                    "SELECT 1 FROM quiz_batch_assignments WHERE quiz_id = $1 AND batch_id = $2 AND UPPER(status) = 'ACTIVE'",
                    q_uuid, student_batch_id
                ))
            else:
                is_authorized = bool(
                    quiz["batch_id"] == student_batch_id or
                    (quiz["batch_id"] is None and (
                        quiz["institution_id"] == student_inst_id or 
                        quiz["institution_id"] is None or
                        (ctx.college_id and str(quiz["institution_id"]) == str(ctx.college_id))
                    ))
                )

            if not is_authorized:
                raise ScopeForbidden("This assessment is not assigned to your batch")

            existing = await conn.fetchrow(
                """
                SELECT id, score, possible, percentage, passed, performance_category,
                       motivational_message, correct_count, incorrect_count, unattempted_count,
                       status, answers, question_states, completed_at, submission_reason,
                       warnings, warning_count
                FROM quiz_attempts
                WHERE quiz_id = $1 AND student_user_id = $2
                """,
                q_uuid, u_uuid
            )
            if existing and existing["status"] == "completed" and not quiz["allow_retake"]:
                u_row = await conn.fetchrow("SELECT name FROM users WHERE id = $1", u_uuid)
                return {
                    "attemptId": str(existing["id"]),
                    "score": int(existing["score"]),
                    "maxScore": int(existing["possible"] or quiz["max_score"] or 100),
                    "percentage": float(existing["percentage"]) if existing["percentage"] is not None else 0.0,
                    "passed": bool(existing["passed"]),
                    "performanceCategory": existing["performance_category"] or "GOOD",
                    "motivationalMessage": existing["motivational_message"] or "Well done!",
                    "correctCount": int(existing["correct_count"] or 0),
                    "incorrectCount": int(existing["incorrect_count"] or 0),
                    "unattemptedCount": int(existing["unattempted_count"] or 0),
                    "totalMarks": int(quiz["max_score"] or 100),
                    "obtainedMarks": int(existing["score"]),
                    "studentName": u_row["name"] if u_row and u_row["name"] else "Student",
                    "assessmentName": quiz["title"],
                    "submissionReason": existing.get("submission_reason") or "STUDENT_MANUAL_SUBMIT",
                    "completedAt": existing["completed_at"].isoformat() if existing["completed_at"] else now_utc.isoformat(),
                    "idempotent": True,
                }

            # Merge supplied answers with previously persisted draft answers
            persisted_answers = _parse_json_dict(existing["answers"]) if existing and existing["answers"] else {}
            effective_answers = {**persisted_answers, **(answers or {})}

            q_list = _parse_json_list(quiz["questions"])
            earned = 0.0
            total_marks = 0.0
            correct_count = 0
            incorrect_count = 0
            unattempted_count = 0

            # EEDI accumulator: (eedi_term, eedi_index) -> {"earned": float, "possible": float}
            eedi_acc: dict[tuple[str, int | None], dict[str, float]] = {}

            for q in q_list:
                m = float(q.get("marks", 1))
                neg = float(q.get("negative", 0))
                total_marks += m
                qid = str(q.get("id"))
                raw_ans = effective_answers.get(qid)
                q_type = q.get("question_type") or q.get("questionType") or "mcq_single"

                # Normalize candidate answer
                chosen_list: list[str] = []
                if isinstance(raw_ans, list):
                    chosen_list = [str(c).strip().upper() for c in raw_ans if str(c).strip()]
                elif isinstance(raw_ans, dict):
                    chosen_list = [str(c).strip().upper() for c in raw_ans.get("selected", [])]
                elif raw_ans is not None and str(raw_ans).strip():
                    chosen_list = [str(raw_ans).strip().upper()]

                # Normalize correct answers
                correct_raw = q.get("correct_options") or q.get("correct") or q.get("correct_answer") or q.get("correctAnswer")
                if not correct_raw and isinstance(q.get("options"), list):
                    correct_raw = [opt.get("id") for opt in q.get("options", []) if opt.get("correct")]

                if isinstance(correct_raw, str):
                    correct_answers = [correct_raw.strip().upper()]
                elif isinstance(correct_raw, list):
                    correct_answers = [str(c).strip().upper() for c in correct_raw if str(c).strip()]
                else:
                    correct_answers = []

                is_correct = False
                has_attempted = False

                if q_type == "numerical":
                    val = str(raw_ans).strip().lower() if raw_ans is not None else ""
                    expected = str(q.get("correct_answer") or q.get("correctAnswer") or (correct_answers[0] if correct_answers else "")).strip().lower()
                    has_attempted = bool(val)
                    is_correct = bool(val and val == expected)
                elif q_type == "mcq_multiple":
                    has_attempted = bool(chosen_list)
                    is_correct = bool(chosen_list and set(chosen_list) == set(correct_answers))
                else:
                    # Single choice
                    chosen = chosen_list[0] if chosen_list else ""
                    has_attempted = bool(chosen)
                    if isinstance(q.get("options"), list):
                        for opt in q.get("options", []):
                            opt_id = str(opt.get("id", "")).strip().upper()
                            if opt_id == chosen and (opt.get("correct") or opt_id in correct_answers):
                                is_correct = True
                                break
                    elif isinstance(q.get("options"), dict):
                        if chosen in correct_answers:
                            is_correct = True

                if not has_attempted:
                    unattempted_count += 1
                elif is_correct:
                    correct_count += 1
                else:
                    incorrect_count += 1

                q_earned = 0.0
                if is_correct:
                    q_earned = m
                elif has_attempted:
                    q_earned = neg if neg < 0 else (-abs(neg) if neg > 0 else 0.0)
                earned += q_earned

                # EEDI metadata tracking (supports both camelCase and snake_case)
                eedi_term = q.get("eedi_term") or q.get("eediTerm")
                eedi_idx = q.get("eedi_index") if q.get("eedi_index") is not None else q.get("eediIndex")
                if eedi_term:
                    term_key = (str(eedi_term).strip(), int(eedi_idx) if eedi_idx is not None else None)
                    if term_key not in eedi_acc:
                        eedi_acc[term_key] = {"earned": 0.0, "possible": 0.0}
                    eedi_acc[term_key]["possible"] += m
                    if is_correct:
                        eedi_acc[term_key]["earned"] += m

            score_val = max(0, min(int(quiz["max_score"] or 100), int(round((earned / max(1.0, total_marks)) * float(quiz["max_score"] or 100)))))
            pct_score = max(0.0, min(100.0, round((earned / max(1.0, total_marks)) * 100.0, 2)))
            passed = pct_score >= 60.0

            existing_warnings: list[dict[str, Any]] = []
            if existing and existing["warnings"]:
                existing_warnings = _parse_json_list(existing["warnings"])

            client_warnings: list[dict[str, Any]] = []
            if warnings:
                if isinstance(warnings, list):
                    client_warnings = warnings
                elif isinstance(warnings, str):
                    client_warnings = _parse_json_list(warnings)

            # Preserve proctoring warnings recorded during exam attempt
            all_warnings = list(existing_warnings)
            for cw in client_warnings:
                if cw not in all_warnings:
                    all_warnings.append(cw)

            warnings_json = json.dumps(all_warnings)
            warning_count = len(all_warnings)

            settings_dict = _parse_json_dict(quiz.get("settings"))
            perf_ranges = settings_dict.get("performance_classification") or DEFAULT_PERFORMANCE_RANGES
            mot_messages = settings_dict.get("motivational_feedback") or DEFAULT_MOTIVATIONAL_MESSAGES
            perf_cat = determine_performance_category(pct_score, perf_ranges)
            mot_msg = mot_messages.get(normalize_category_key(perf_cat)) or DEFAULT_MOTIVATIONAL_MESSAGES.get(normalize_category_key(perf_cat), "Well done!")

            u_row = await conn.fetchrow("SELECT name FROM users WHERE id = $1", u_uuid)
            student_name = u_row["name"] if u_row and u_row["name"] else "Student"

            final_cand_status = "SUBMITTED"
            if submission_reason == "ABANDONMENT_TIMEOUT":
                final_cand_status = "ABANDONED"
            elif submission_reason in ("TIMER_EXPIRED", "TRAINER_END_ASSESSMENT"):
                final_cand_status = "AUTO_SUBMITTED"

            if existing:
                att_id = existing["id"]
                await conn.execute(
                    """
                    UPDATE quiz_attempts
                    SET score = $3, possible = $4, answers = $5::jsonb, completed_at = NOW(),
                        batch_id = $6, institution_id = $7, device_id = $8,
                        warnings = $9::jsonb, warning_count = $10, status = 'completed',
                        percentage = $11, passed = $12, performance_category = $13,
                        motivational_message = $14, correct_count = $15, incorrect_count = $16,
                        unattempted_count = $17, submission_reason = $18, candidate_status = $19,
                        remaining_seconds = 0, last_heartbeat_at = NOW()
                    WHERE id = $1 AND student_user_id = $2
                    """,
                    att_id, u_uuid, score_val, int(quiz["max_score"] or 100),
                    json.dumps(effective_answers), student_batch_id, student_inst_id, device_id,
                    warnings_json, warning_count, pct_score, passed,
                    perf_cat, mot_msg, correct_count, incorrect_count, unattempted_count,
                    submission_reason, final_cand_status
                )
            else:
                att_id = uuid.uuid4()
                await conn.execute(
                    """
                    INSERT INTO quiz_attempts (
                        id, quiz_id, student_user_id, score, possible, answers, created_at, completed_at,
                        batch_id, institution_id, device_id, warnings, warning_count, status, percentage, passed,
                        performance_category, motivational_message, correct_count, incorrect_count, unattempted_count,
                        submission_reason, candidate_status, remaining_seconds, last_heartbeat_at
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6::jsonb, NOW(), NOW(),
                        $7, $8, $9, $10::jsonb, $11, 'completed', $12, $13,
                        $14, $15, $16, $17, $18, $19, $20, 0, NOW()
                    )
                    """,
                    att_id, q_uuid, u_uuid, score_val, int(quiz["max_score"] or 100),
                    json.dumps(effective_answers), student_batch_id, student_inst_id, device_id,
                    warnings_json, warning_count, pct_score, passed,
                    perf_cat, mot_msg, correct_count, incorrect_count, unattempted_count,
                    submission_reason, final_cand_status
                )

            # Associate any unlinked camera snapshots captured during session to this attempt
            await conn.execute(
                """
                UPDATE quiz_camera_snapshots
                SET attempt_id = $1
                WHERE quiz_id = $2 AND student_user_id = $3 AND attempt_id IS NULL
                """,
                att_id, q_uuid, u_uuid
            )

            # Store EEDI results (TRAINER-ONLY visibility)
            for (term, idx), scores in eedi_acc.items():
                p_marks = scores["possible"]
                e_marks = max(0.0, scores["earned"])
                term_pct = round((e_marks / max(0.01, p_marks)) * 100, 2)
                await conn.execute(
                    """
                    INSERT INTO quiz_eedi_results (
                        id, quiz_id, attempt_id, student_user_id, batch_id, institution_id,
                        eedi_index, eedi_term, earned_marks, possible_marks, score_percentage,
                        calculation_version, created_at
                    ) VALUES (
                        gen_random_uuid(), $1, $2, $3, $4, $5,
                        $6, $7, $8, $9, $10, 'v1', NOW()
                    )
                    ON CONFLICT (attempt_id, eedi_term, eedi_index) DO UPDATE
                    SET earned_marks = EXCLUDED.earned_marks,
                        possible_marks = EXCLUDED.possible_marks,
                        score_percentage = EXCLUDED.score_percentage
                    """,
                    q_uuid, att_id, u_uuid, student_batch_id, student_inst_id,
                    idx, term, e_marks, p_marks, term_pct
                )

        # Notify real-time hub
        try:
            from app.websocket.assessment_ws import assessment_hub
            await assessment_hub.handle_submit(str(quiz_id), str(ctx.user_id), {
                "score": score_val,
                "passed": passed,
                "percentage": pct_score,
                "submission_reason": submission_reason,
                "candidate_status": final_cand_status,
            })
        except Exception:
            pass

        # Student response contains user-facing score and performance feedback (NO EEDI SCORES)
        return {
            "attemptId": str(att_id),
            "score": score_val,
            "maxScore": int(quiz["max_score"] or 100),
            "percentage": pct_score,
            "passed": passed,
            "performanceCategory": perf_cat,
            "motivationalMessage": mot_msg,
            "correctCount": correct_count,
            "incorrectCount": incorrect_count,
            "unattemptedCount": unattempted_count,
            "totalMarks": int(quiz["max_score"] or 100),
            "obtainedMarks": score_val,
            "studentName": student_name,
            "assessmentName": quiz["title"],
        }

    @classmethod
    async def record_student_warning(
        cls,
        ctx: ScopeContext,
        quiz_id: str,
        warning_type: str,
        detail: str | None = None,
    ) -> dict[str, Any]:
        q_uuid = _safe_uuid(quiz_id)
        u_uuid = _safe_uuid(ctx.user_id)
        if not q_uuid:
            raise NotFound("Assessment not found")

        async with get_pg_connection() as conn:
            quiz = await conn.fetchrow(
                "SELECT id, settings FROM quizzes WHERE id = $1", q_uuid
            )
            if not quiz:
                raise NotFound("Assessment not found")

            settings_dict = quiz["settings"] or {}
            if isinstance(settings_dict, str):
                try:
                    settings_dict = json.loads(settings_dict)
                except Exception:
                    settings_dict = {}
            max_warnings = int(settings_dict.get("max_warnings", 3))

            existing = await conn.fetchrow(
                "SELECT id, warnings, warning_count FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
                q_uuid, u_uuid,
            )

            current_warnings: list[dict[str, Any]] = []
            if existing and existing["warnings"]:
                current_warnings = _parse_json_list(existing["warnings"])

            current_warnings.append({
                "type": str(warning_type)[:50],
                "detail": str(detail or "")[:300],
                "timestamp": _now().isoformat(),
            })
            new_count = len(current_warnings)
            auto_submit = new_count >= max_warnings

            if existing:
                await conn.execute(
                    """
                    UPDATE quiz_attempts
                    SET warnings = $1::jsonb, warning_count = $2
                    WHERE id = $3
                    """,
                    json.dumps(current_warnings), new_count, existing["id"]
                )
            else:
                b_row = await conn.fetchrow(
                    "SELECT batch_id, institution_id FROM student_profiles WHERE user_id = $1",
                    u_uuid
                )
                await conn.execute(
                    """
                    INSERT INTO quiz_attempts (
                        id, quiz_id, student_user_id, score, possible, answers, created_at,
                        batch_id, institution_id, warnings, warning_count, status
                    ) VALUES (
                        gen_random_uuid(), $1, $2, 0, 100, '{}'::jsonb, NOW(),
                        $3, $4, $5::jsonb, $6, 'in_progress'
                    )
                    """,
                    q_uuid, u_uuid,
                    b_row["batch_id"] if b_row else None,
                    b_row["institution_id"] if b_row else None,
                    json.dumps(current_warnings), new_count
                )

        return {
            "warning_count": new_count,
            "max_warnings": max_warnings,
            "auto_submit": auto_submit,
        }

    @classmethod
    async def save_camera_snapshot(
        cls,
        ctx: ScopeContext,
        quiz_id: str,
        image_data: str,
        event_type: str = "PERIODIC",
        timestamp: datetime | None = None,
        attempt_id: str | None = None,
    ) -> dict[str, Any]:
        q_uuid = _safe_uuid(quiz_id)
        u_uuid = _safe_uuid(ctx.user_id)
        att_uuid = _safe_uuid(attempt_id)
        if not q_uuid:
            raise NotFound("Assessment not found")

        async with get_pg_connection() as conn:
            if not att_uuid:
                att_row = await conn.fetchrow(
                    """
                    SELECT id FROM quiz_attempts
                    WHERE quiz_id = $1 AND student_user_id = $2
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    q_uuid, u_uuid
                )
                if att_row:
                    att_uuid = att_row["id"]

            snap_id = uuid.uuid4()
            now_ts = timestamp or _now()
            await conn.execute(
                """
                INSERT INTO quiz_camera_snapshots (
                    id, quiz_id, student_user_id, attempt_id, snapshot_timestamp, event_type, image_data, created_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, NOW()
                )
                """,
                snap_id, q_uuid, u_uuid, att_uuid, now_ts, str(event_type)[:64], image_data
            )
            if att_uuid:
                await conn.execute(
                    "UPDATE quiz_attempts SET last_camera_frame_at = NOW(), camera_status = 'active' WHERE id = $1",
                    att_uuid
                )

            return {
                "id": str(snap_id),
                "quizId": str(q_uuid),
                "studentUserId": str(u_uuid),
                "attemptId": str(att_uuid) if att_uuid else None,
                "timestamp": now_ts.isoformat(),
                "eventType": event_type,
            }

    @classmethod
    async def get_student_attempt_timing(
        cls,
        quiz_id: str,
        student_user_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Calculates server-authoritative question timing, phase, and progress."""
        q_uuid = _safe_uuid(quiz_id)
        if not q_uuid:
            return {}

        async with get_pg_connection() as conn:
            quiz = await conn.fetchrow(
                "SELECT settings, duration_minutes, max_score, questions, timing_mode FROM quizzes WHERE id = $1",
                q_uuid,
            )
            if not quiz:
                return {}

            settings_dict = _parse_json_dict(quiz["settings"])
            q_list = _parse_json_list(quiz["questions"])
            total_questions = len(q_list)

            # Determine timing mode: strictly FIXED_TOTAL or PER_QUESTION
            timing_mode = (
                quiz["timing_mode"]
                or settings_dict.get("timing_mode")
                or ("PER_QUESTION" if settings_dict.get("enable_timed_questions") else "FIXED_TOTAL")
            ).upper()
            if timing_mode not in ("FIXED_TOTAL", "PER_QUESTION"):
                timing_mode = "FIXED_TOTAL"

            default_q_dur = int(settings_dict.get("question_duration", 30))
            q_limits: list[int] = []
            for q in q_list:
                lim = q.get("time_limit") or q.get("duration_seconds") or q.get("timeLimitSeconds") or default_q_dur
                try:
                    q_limits.append(max(5, int(lim)))
                except (ValueError, TypeError):
                    q_limits.append(default_q_dur)

            ans_rev_dur = int(settings_dict.get("answer_reveal_duration", 0))
            auto_advance = True
            overall_duration_minutes = int(quiz["duration_minutes"] or 30)
            overall_duration_seconds = overall_duration_minutes * 60

            attempt = await conn.fetchrow(
                "SELECT id, created_at, completed_at, score, answers, status, question_states FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
                q_uuid, student_user_id,
            )

            now_utc = datetime.now(timezone.utc)

            if not attempt:
                first_q_limit = q_limits[0] if q_limits else default_q_dur
                return {
                    "hasStarted": False,
                    "status": "not_started",
                    "answers": {},
                    "timingState": {
                        "timing_mode": timing_mode,
                        "is_timed": (timing_mode == "PER_QUESTION"),
                        "started_at": None,
                        "server_time": int(now_utc.timestamp()),
                        "elapsed_seconds": 0,
                        "total_duration_seconds": overall_duration_seconds if timing_mode == "FIXED_TOTAL" else None,
                        "remaining_seconds": overall_duration_seconds if timing_mode == "FIXED_TOTAL" else None,
                        "overall_remaining_seconds": overall_duration_seconds if timing_mode == "FIXED_TOTAL" else None,
                        "duration_minutes": overall_duration_minutes if timing_mode == "FIXED_TOTAL" else None,
                        "total_questions": total_questions,
                        "current_question_index": 0,
                        "question_limits": q_limits,
                        "phase": "answering",
                        "phase_remaining_seconds": None if timing_mode == "FIXED_TOTAL" else (max(1, first_q_limit - ans_rev_dur) if ans_rev_dur > 0 else first_q_limit),
                        "question_remaining_seconds": None if timing_mode == "FIXED_TOTAL" else first_q_limit,
                        "question_duration": first_q_limit if timing_mode == "PER_QUESTION" else None,
                        "answer_reveal_duration": ans_rev_dur,
                        "auto_advance": auto_advance,
                        "allow_previous": False,
                        "allow_modification": False,
                        "is_completed": False,
                        "question_states": {},
                    }
                }

            att_id = attempt["id"]
            started_at = as_utc(attempt["created_at"])
            status = attempt["status"] or ("completed" if attempt["completed_at"] else "in_progress")
            answers = _parse_json_dict(attempt["answers"]) if attempt["answers"] else {}
            q_states = _parse_json_dict(attempt["question_states"]) if attempt["question_states"] else {}

            elapsed_seconds = max(0.0, (now_utc - started_at).total_seconds())
            is_expired = False

            if timing_mode == "FIXED_TOTAL":
                overall_remaining_seconds = max(0.0, overall_duration_seconds - elapsed_seconds)
                if overall_remaining_seconds <= 0:
                    is_expired = True

                if status != "completed" and is_expired:
                    status = "completed"
                    await conn.execute(
                        "UPDATE quiz_attempts SET status = 'completed', completed_at = $1 WHERE id = $2",
                        now_utc, att_id,
                    )

                return {
                    "hasStarted": True,
                    "attemptId": str(att_id),
                    "status": status,
                    "answers": answers,
                    "timingState": {
                        "timing_mode": "FIXED_TOTAL",
                        "is_timed": False,
                        "started_at": int(started_at.timestamp()),
                        "server_time": int(now_utc.timestamp()),
                        "elapsed_seconds": round(elapsed_seconds, 2),
                        "total_duration_seconds": overall_duration_seconds,
                        "remaining_seconds": round(overall_remaining_seconds, 1),
                        "overall_remaining_seconds": round(overall_remaining_seconds, 1),
                        "duration_minutes": overall_duration_minutes,
                        "total_questions": total_questions,
                        "current_question_index": 0,
                        "question_limits": q_limits,
                        "phase": "answering",
                        "phase_remaining_seconds": None,
                        "question_remaining_seconds": None,
                        "question_duration": None,
                        "answer_reveal_duration": ans_rev_dur,
                        "auto_advance": auto_advance,
                        "allow_previous": False,
                        "allow_modification": False,
                        "is_completed": status == "completed",
                        "question_states": q_states,
                    }
                }
            else:
                # PER_QUESTION mode
                q_cum = [0]
                for lim in q_limits:
                    q_cum.append(q_cum[-1] + lim)
                total_timed_exam_limit = q_cum[-1] if q_cum else 0

                if elapsed_seconds >= total_timed_exam_limit:
                    is_expired = True
                    current_q_idx = max(0, total_questions - 1)
                    time_in_q = q_limits[current_q_idx] if q_limits else 0
                    phase = "revealing" if ans_rev_dur > 0 else "answering"
                    phase_time_left = 0.0
                    question_time_left = 0.0
                else:
                    current_q_idx = 0
                    for i in range(len(q_limits)):
                        if q_cum[i] <= elapsed_seconds < q_cum[i + 1]:
                            current_q_idx = i
                            break
                    time_in_q = elapsed_seconds - q_cum[current_q_idx]
                    cur_q_limit = q_limits[current_q_idx]
                    ans_dur = max(1, cur_q_limit - ans_rev_dur) if ans_rev_dur > 0 else cur_q_limit
                    if ans_rev_dur > 0 and time_in_q >= ans_dur:
                        phase = "revealing"
                        phase_time_left = max(0.0, cur_q_limit - time_in_q)
                    else:
                        phase = "answering"
                        phase_time_left = max(0.0, ans_dur - time_in_q)
                    question_time_left = max(0.0, cur_q_limit - time_in_q)

                if status != "completed" and is_expired:
                    status = "completed"
                    await conn.execute(
                        "UPDATE quiz_attempts SET status = 'completed', completed_at = $1 WHERE id = $2",
                        now_utc, att_id,
                    )

                return {
                    "hasStarted": True,
                    "attemptId": str(att_id),
                    "status": status,
                    "answers": answers,
                    "timingState": {
                        "timing_mode": "PER_QUESTION",
                        "is_timed": True,
                        "started_at": int(started_at.timestamp()),
                        "server_time": int(now_utc.timestamp()),
                        "elapsed_seconds": round(elapsed_seconds, 2),
                        "total_duration_seconds": None,
                        "remaining_seconds": None,
                        "overall_remaining_seconds": None,
                        "duration_minutes": None,
                        "total_questions": total_questions,
                        "current_question_index": current_q_idx,
                        "question_limits": q_limits,
                        "phase": phase,
                        "phase_remaining_seconds": round(phase_time_left, 1),
                        "question_remaining_seconds": round(question_time_left, 1),
                        "question_duration": q_limits[current_q_idx] if current_q_idx < len(q_limits) else default_q_dur,
                        "answer_reveal_duration": ans_rev_dur,
                        "auto_advance": auto_advance,
                        "allow_previous": False,
                        "allow_modification": False,
                        "is_completed": status == "completed",
                        "question_states": q_states,
                    }
                }

    @classmethod
    async def start_or_resume_quiz_attempt(
        cls,
        quiz_id: str,
        student_user_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Initializes or resumes a proctored quiz attempt with server-authoritative start timestamp."""
        q_uuid = _safe_uuid(quiz_id)
        if not q_uuid:
            raise NotFound("Assessment not found")

        async with get_pg_connection() as conn:
            quiz = await conn.fetchrow(
                "SELECT id, questions, settings, duration_minutes, max_score, status, timing_mode, opens_at, closes_at FROM quizzes WHERE id = $1 AND status = 'active'",
                q_uuid,
            )
            if not quiz:
                raise NotFound("Assessment not found")

            now_utc = datetime.now(timezone.utc)
            if quiz["opens_at"] and now_utc < as_utc(quiz["opens_at"]):
                raise BusinessRuleViolation("Assessment has not started yet. Status: Upcoming")
            if quiz["closes_at"] and now_utc > as_utc(quiz["closes_at"]):
                raise BusinessRuleViolation("Assessment schedule has ended. Status: Expired")

            # Check if attempt already exists
            existing = await conn.fetchrow(
                "SELECT id, created_at, completed_at, score, answers, status FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
                q_uuid, student_user_id,
            )

            now_utc = datetime.now(timezone.utc)
            if not existing:
                b_row = await conn.fetchrow(
                    "SELECT batch_id, institution_id FROM student_profiles WHERE user_id = $1",
                    student_user_id,
                )
                att_id = uuid.uuid4()
                await conn.execute(
                    """
                    INSERT INTO quiz_attempts (
                        id, quiz_id, student_user_id, score, possible, answers, created_at,
                        batch_id, institution_id, warnings, warning_count, status, question_states
                    ) VALUES (
                        $1, $2, $3, 0, $4, '{}'::jsonb, $5,
                        $6, $7, '[]'::jsonb, 0, 'in_progress', '{}'::jsonb
                    )
                    """,
                    att_id, q_uuid, student_user_id,
                    int(quiz["max_score"] or 100), now_utc,
                    b_row["batch_id"] if b_row else None,
                    b_row["institution_id"] if b_row else None,
                )

        return await cls.get_student_attempt_timing(quiz_id, student_user_id)

    @classmethod
    async def save_student_draft_answer(
        cls,
        ctx: ScopeContext,
        quiz_id: str,
        question_id: str,
        answer: Any,
        marked_for_review: bool = False,
        version: int | None = None,
        time_spent_seconds: float | None = None,
    ) -> dict[str, Any]:
        q_uuid = _safe_uuid(quiz_id)
        u_uuid = _safe_uuid(ctx.user_id)
        if not q_uuid:
            raise NotFound("Assessment not found")

        qid_str = str(question_id or "").strip()
        if not qid_str:
            raise ValidationError("Valid question ID is required")

        async with get_pg_connection() as conn:
            quiz_row = await conn.fetchrow(
                "SELECT settings, questions, timing_mode, duration_minutes, opens_at, closes_at FROM quizzes WHERE id = $1",
                q_uuid
            )
            if not quiz_row:
                raise NotFound("Assessment not found")

            server_now = datetime.now(timezone.utc)
            if quiz_row["closes_at"] and server_now > as_utc(quiz_row["closes_at"]) + timedelta(seconds=10):
                raise BusinessRuleViolation("Assessment submission deadline has passed. Status: Expired")

            settings_dict = _parse_json_dict(quiz_row["settings"])
            timing_mode = (
                quiz_row["timing_mode"]
                or settings_dict.get("timing_mode")
                or ("PER_QUESTION" if settings_dict.get("enable_timed_questions") else "FIXED_TOTAL")
            ).upper()
            if timing_mode not in ("FIXED_TOTAL", "PER_QUESTION"):
                timing_mode = "FIXED_TOTAL"

            existing = await conn.fetchrow(
                """
                SELECT id, answers, status, created_at, question_states, version
                FROM quiz_attempts
                WHERE quiz_id = $1 AND student_user_id = $2
                """,
                q_uuid, u_uuid,
            )
            if existing and existing["status"] == "completed":
                raise BusinessRuleViolation("Assessment has already been submitted")

            answers_dict: dict[str, Any] = _parse_json_dict(existing["answers"]) if existing and existing["answers"] else {}
            q_states: dict[str, Any] = _parse_json_dict(existing["question_states"]) if existing and existing["question_states"] else {}

            existing_q_state = q_states.get(qid_str) or {}
            existing_ver = existing_q_state.get("version", 0)
            if version is not None and existing_ver and version < existing_ver:
                log.info("ignoring_stale_draft_write", extra={"question_id": qid_str, "incoming_ver": version, "existing_ver": existing_ver})
                return {
                    "saved": True,
                    "questionId": qid_str,
                    "version": existing_ver,
                    "status": "ignored_stale",
                }

            new_version = (existing_ver + 1) if version is None else max(version, existing_ver + 1)
            should_lock = not bool(settings_dict.get("allow_modification", False))

            if existing:
                started_at = as_utc(existing["created_at"])
                elapsed_seconds = max(0.0, (server_now - started_at).total_seconds())

                if timing_mode == "FIXED_TOTAL":
                    total_dur = int(quiz_row["duration_minutes"] or 30) * 60
                    if elapsed_seconds > total_dur + 5:
                        raise BusinessRuleViolation("Assessment total time limit has expired")
                    if qid_str in q_states and q_states[qid_str].get("is_locked"):
                        if answers_dict.get(qid_str) != answer:
                            raise BusinessRuleViolation("Previous question is locked and cannot be modified")
                else:
                    # PER_QUESTION
                    q_list = _parse_json_list(quiz_row["questions"])
                    default_q_dur = int(settings_dict.get("question_duration", 30))
                    q_limits = []
                    target_idx = None
                    for idx, q in enumerate(q_list):
                        lim = q.get("time_limit") or q.get("duration_seconds") or q.get("timeLimitSeconds") or default_q_dur
                        try:
                            q_limits.append(max(5, int(lim)))
                        except (ValueError, TypeError):
                            q_limits.append(default_q_dur)
                        if str(q.get("id")) == qid_str:
                            target_idx = idx

                    if target_idx is not None:
                        q_cum = [0]
                        for lim in q_limits:
                            q_cum.append(q_cum[-1] + lim)

                        ans_rev_dur = int(settings_dict.get("answer_reveal_duration", 0))
                        target_limit = q_limits[target_idx]
                        ans_dur = max(1, target_limit - ans_rev_dur) if ans_rev_dur > 0 else target_limit

                        question_start = q_cum[target_idx]
                        answering_deadline = question_start + ans_dur if ans_rev_dur > 0 else (question_start + ans_dur + 3.0)

                        if elapsed_seconds > answering_deadline:
                            raise BusinessRuleViolation("Answering period for this question has expired and answers are locked")

                        if qid_str in q_states and q_states[qid_str].get("is_locked"):
                            if answers_dict.get(qid_str) != answer:
                                raise BusinessRuleViolation("Previous questions are locked for this timed assessment")
                    should_lock = True

            answers_dict[qid_str] = answer
            is_attempted = (
                answer is not None
                and answer != ""
                and answer != []
                and (not isinstance(answer, dict) or bool(answer))
            )
            q_states[qid_str] = {
                "question_id": qid_str,
                "selected_answer": answer,
                "is_attempted": is_attempted,
                "is_locked": should_lock,
                "version": new_version,
                "marked_for_review": marked_for_review,
                "time_spent_seconds": time_spent_seconds,
                "submitted_at": server_now.isoformat(),
            }

            if existing:
                att_id = existing["id"]
                await conn.execute(
                    """
                    UPDATE quiz_attempts
                    SET answers = $1::jsonb,
                        question_states = $2::jsonb,
                        candidate_status = 'IN_PROGRESS',
                        last_heartbeat_at = NOW(),
                        version = COALESCE(version, 0) + 1
                    WHERE id = $3
                    """,
                    json.dumps(answers_dict), json.dumps(q_states), att_id
                )
            else:
                b_row = await conn.fetchrow(
                    "SELECT batch_id, institution_id FROM student_profiles WHERE user_id = $1",
                    u_uuid
                )
                att_id = uuid.uuid4()
                await conn.execute(
                    """
                    INSERT INTO quiz_attempts (
                        id, quiz_id, student_user_id, score, possible, answers, created_at,
                        batch_id, institution_id, warnings, warning_count, status, question_states,
                        candidate_status, last_heartbeat_at, version
                    ) VALUES (
                        $1, $2, $3, 0, 100, $4::jsonb, NOW(),
                        $5, $6, '[]'::jsonb, 0, 'in_progress', $7::jsonb,
                        'IN_PROGRESS', NOW(), 1
                    )
                    """,
                    att_id, q_uuid, u_uuid, json.dumps(answers_dict),
                    b_row["batch_id"] if b_row else None,
                    b_row["institution_id"] if b_row else None,
                    json.dumps(q_states)
                )

        return {
            "saved": True,
            "questionId": qid_str,
            "version": new_version,
            "attemptId": str(att_id),
            "status": "persisted",
            "isAttempted": is_attempted,
            "markedForReview": marked_for_review,
        }

    @classmethod
    async def get_question_reveal(
        cls,
        ctx: ScopeContext,
        quiz_id: str,
        question_id: str,
    ) -> dict[str, Any]:
        """Provides secure reveal of correct answer for timed question mode."""
        q_uuid = _safe_uuid(quiz_id)
        u_uuid = _safe_uuid(ctx.user_id)
        if not q_uuid:
            raise NotFound("Assessment not found")

        async with get_pg_connection() as conn:
            quiz = await conn.fetchrow(
                "SELECT id, questions, settings, status, timing_mode FROM quizzes WHERE id = $1",
                q_uuid
            )
            if not quiz:
                raise NotFound("Assessment not found")

            settings_dict = _parse_json_dict(quiz["settings"])
            timing_mode = (
                quiz["timing_mode"]
                or settings_dict.get("timing_mode")
                or ("PER_QUESTION" if settings_dict.get("enable_timed_questions") else "FIXED_TOTAL")
            ).upper()
            if timing_mode not in ("FIXED_TOTAL", "PER_QUESTION"):
                timing_mode = "FIXED_TOTAL"

            q_list = _parse_json_list(quiz["questions"])
            target_q = None
            target_idx = None
            for idx, q in enumerate(q_list):
                if str(q.get("id")) == str(question_id):
                    target_q = q
                    target_idx = idx
                    break

            if not target_q:
                raise NotFound(f"Question {question_id} not found")

            # Server-Authoritative Timing & Lock Guard:
            attempt = await conn.fetchrow(
                "SELECT id, created_at, status, question_states FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
                q_uuid, u_uuid,
            )
            if not attempt:
                raise ScopeForbidden("Assessment attempt not started")

            if attempt["status"] != "completed":
                q_states = _parse_json_dict(attempt["question_states"]) if attempt["question_states"] else {}
                qid_str = str(question_id)
                is_locked = bool(q_states.get(qid_str, {}).get("is_locked", False))

                if timing_mode == "FIXED_TOTAL":
                    if not is_locked:
                        raise ScopeForbidden("Question must be answered and locked before reveal is permitted.")
                else:
                    # In PER_QUESTION:
                    if not is_locked and target_idx is not None:
                        server_now = datetime.now(timezone.utc)
                        started_at = as_utc(attempt["created_at"])
                        elapsed_seconds = max(0.0, (server_now - started_at).total_seconds())

                        default_q_dur = int(settings_dict.get("question_duration", 30))
                        ans_rev_dur = int(settings_dict.get("answer_reveal_duration", 0))

                        q_limits = []
                        for q in q_list:
                            lim = q.get("time_limit") or q.get("duration_seconds") or q.get("timeLimitSeconds") or default_q_dur
                            try:
                                q_limits.append(max(5, int(lim)))
                            except (ValueError, TypeError):
                                q_limits.append(default_q_dur)

                        q_cum = [0]
                        for lim in q_limits:
                            q_cum.append(q_cum[-1] + lim)

                        target_limit = q_limits[target_idx] if target_idx < len(q_limits) else default_q_dur
                        ans_dur = max(1, target_limit - ans_rev_dur) if ans_rev_dur > 0 else target_limit

                        question_start = q_cum[target_idx] if target_idx < len(q_cum) else 0
                        answering_deadline = question_start + ans_dur

                        if elapsed_seconds < answering_deadline:
                            raise ScopeForbidden("Answering phase is still active. Reveal not authorized until answering period ends.")

        correct_opts = []
        if isinstance(target_q.get("correct_options"), list):
            correct_opts = [str(x) for x in target_q.get("correct_options")]
        elif isinstance(target_q.get("correct"), list):
            correct_opts = [str(x) for x in target_q.get("correct")]
        elif target_q.get("correct_options") is not None:
            correct_opts = [str(target_q.get("correct_options"))]
        elif target_q.get("correct") is not None:
            correct_opts = [str(target_q.get("correct"))]
        elif target_q.get("correct_answer") is not None:
            correct_opts = [str(target_q.get("correct_answer"))]
        elif target_q.get("answer") is not None:
            correct_opts = [str(target_q.get("answer"))]
        elif isinstance(target_q.get("options"), list):
            correct_opts = [str(opt.get("id")) for opt in target_q["options"] if opt.get("correct") or opt.get("is_correct")]

        return {
            "question_id": str(question_id),
            "correct_options": correct_opts,
            "correct_answer": correct_opts[0] if correct_opts else None,
            "explanation": target_q.get("explanation") or target_q.get("solution") or "No explanation provided.",
        }

    # =========================================================================
    # TRAINER ASSESSMENT & MULTI-BATCH ASSIGNMENT METHODS
    # =========================================================================

    @classmethod
    async def list_trainer_quizzes(cls, ctx: ScopeContext, batch_id: str | None = None) -> list[dict[str, Any]]:
        t_uuid = _safe_uuid(ctx.user_id)
        b_uuid = _safe_uuid(batch_id)
        inst_uuid = _safe_uuid(ctx.college_id)

        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT q.id, q.title, q.kind, q.duration_minutes, q.max_score,
                       q.opens_at, q.closes_at, q.status, q.quiz_code, q.settings,
                       q.created_at, q.creator_trainer_id,
                       (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.quiz_id = q.id) as total_attempts,
                       (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.status = 'completed') as submitted_attempts
                FROM quizzes q
                WHERE (
                    q.creator_trainer_id = $1
                    OR EXISTS (
                        SELECT 1 FROM quiz_batch_assignments qba
                        JOIN batch_trainers bt ON bt.batch_id = qba.batch_id
                        WHERE qba.quiz_id = q.id AND bt.trainer_user_id = $1 AND (bt.status = 'ACTIVE' OR bt.status IS NULL)
                    )
                    OR ($3::uuid IS NOT NULL AND q.institution_id = $3)
                )
                AND ($2::uuid IS NULL OR EXISTS (
                    SELECT 1 FROM quiz_batch_assignments qba WHERE qba.quiz_id = q.id AND qba.batch_id = $2
                ) OR q.batch_id = $2)
                ORDER BY q.created_at DESC
                """,
                t_uuid, b_uuid, inst_uuid
            )

            quiz_ids = [r["id"] for r in rows]
            assignments_by_quiz: dict[uuid.UUID, list[dict[str, Any]]] = {qid: [] for qid in quiz_ids}
            if quiz_ids:
                assign_rows = await conn.fetch(
                    """
                    SELECT qba.quiz_id, qba.batch_id, b.name as batch_name, b.code as batch_code
                    FROM quiz_batch_assignments qba
                    JOIN batches b ON b.id = qba.batch_id
                    WHERE qba.quiz_id = ANY($1::uuid[]) AND UPPER(qba.status) = 'ACTIVE'
                    ORDER BY b.name ASC
                    """,
                    quiz_ids
                )
                for a in assign_rows:
                    assignments_by_quiz[a["quiz_id"]].append({
                        "batchId": str(a["batch_id"]),
                        "batchName": a["batch_name"],
                        "batchCode": a["batch_code"],
                    })

        items = []
        for r in rows:
            items.append({
                "id": str(r["id"]),
                "title": r["title"],
                "kind": r["kind"] or "quiz",
                "quizCode": r["quiz_code"],
                "durationMinutes": r["duration_minutes"],
                "maxScore": r["max_score"],
                "opensAt": r["opens_at"].isoformat() if r["opens_at"] else None,
                "closesAt": r["closes_at"].isoformat() if r["closes_at"] else None,
                "status": r["status"],
                "settings": r["settings"] or {},
                "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
                "isCreator": r["creator_trainer_id"] == t_uuid,
                "totalAttempts": int(r["total_attempts"] or 0),
                "submittedAttempts": int(r["submitted_attempts"] or 0),
                "assignedBatches": assignments_by_quiz.get(r["id"], []),
            })
        return items

    @classmethod
    async def create_trainer_quiz(
        cls,
        ctx: ScopeContext,
        title: str,
        description: str | None = None,
        instructions: str | None = None,
        course_id: str | None = None,
        duration_minutes: int = 30,
        max_score: int = 100,
        opens_at: datetime | None = None,
        closes_at: datetime | None = None,
        questions: list[Any] | None = None,
        settings: dict[str, Any] | None = None,
        batch_ids: list[str] | None = None,
        quiz_code: str | None = None,
    ) -> dict[str, Any]:
        t_uuid = _safe_uuid(ctx.user_id)
        inst_uuid = _safe_uuid(ctx.college_id)
        c_uuid = _safe_uuid(course_id)
        b_uuids = [_safe_uuid(b) for b in (batch_ids or []) if _safe_uuid(b)]

        utc_opens = as_utc(opens_at) if opens_at else None
        utc_closes = as_utc(closes_at) if closes_at else None
        if utc_opens and utc_closes and utc_closes <= utc_opens:
            raise ValidationError("Assessment End Date & Time must be strictly after Start Date & Time")

        async with get_pg_connection() as conn:
            # STRICT RBAC CHECK: Validate trainer is authorized for EVERY target batch
            if b_uuids:
                for b_id in b_uuids:
                    allowed = await conn.fetchval(
                        """
                        SELECT 1 FROM batch_trainers
                        WHERE trainer_user_id = $1 AND batch_id = $2 AND (status = 'ACTIVE' OR status IS NULL)
                        """,
                        t_uuid, b_id
                    )
                    if not allowed and ctx.role != Role.ADMIN and ctx.role != Role.SUPER_ADMIN:
                        raise ScopeForbidden(f"You are not authorized to assign assessments to batch {b_id}")

            code = (quiz_code or f"QUIZ-{uuid.uuid4().hex[:6].upper()}").strip()
            existing_code = await conn.fetchval("SELECT 1 FROM quizzes WHERE quiz_code = $1", code)
            if existing_code:
                code = f"QUIZ-{uuid.uuid4().hex[:6].upper()}"

            clean_settings = dict(settings or {})
            timing_mode = (
                clean_settings.get("timing_mode")
                or ("PER_QUESTION" if clean_settings.get("enable_timed_questions") else "FIXED_TOTAL")
            ).upper()
            if timing_mode not in ("FIXED_TOTAL", "PER_QUESTION"):
                timing_mode = "PER_QUESTION" if clean_settings.get("enable_timed_questions") else "FIXED_TOTAL"
            clean_settings["timing_mode"] = timing_mode

            ans_dur = int(clean_settings.get("answer_reveal_duration", 0))
            clean_settings["answer_reveal_duration"] = max(0, ans_dur)

            if timing_mode == "PER_QUESTION":
                clean_settings["enable_timed_questions"] = True
                q_dur = int(clean_settings.get("question_duration", 30))
                if ans_dur > 0 and q_dur <= ans_dur:
                    raise ValidationError("question_duration must be strictly greater than answer_reveal_duration")
                clean_settings["question_duration"] = q_dur
                clean_settings["auto_advance"] = True
                clean_settings["allow_previous"] = False
                clean_settings["allow_modification"] = False
            else:
                clean_settings["enable_timed_questions"] = False
                clean_settings["allow_previous"] = False
                clean_settings["allow_modification"] = False

            # Performance classification and motivational feedback validation
            clean_ranges, clean_messages = validate_performance_classification_settings(
                clean_settings.get("performance_classification"),
                clean_settings.get("motivational_feedback"),
            )
            clean_settings["performance_classification"] = clean_ranges
            clean_settings["motivational_feedback"] = clean_messages
            if description:
                clean_settings["description"] = description
            if instructions:
                clean_settings["instructions"] = instructions

            q_id = uuid.uuid4()
            await conn.execute(
                """
                INSERT INTO quizzes (
                    id, creator_trainer_id, institution_id, course_id, title, description, instructions, kind,
                    duration_minutes, max_score, allow_retake, opens_at, closes_at,
                    questions, settings, quiz_code, status, timing_mode, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, 'quiz',
                    $8, $9, false, $10, $11,
                    $12::jsonb, $13::jsonb, $14, 'active', $15, NOW(), NOW()
                )
                """,
                q_id, t_uuid, inst_uuid, c_uuid, title.strip(), description, instructions,
                max(1, duration_minutes), max_score, utc_opens, utc_closes,
                json.dumps(questions or []), json.dumps(clean_settings), code, timing_mode
            )

            # Insert batch assignments
            for b_id in b_uuids:
                await conn.execute(
                    """
                    INSERT INTO quiz_batch_assignments (id, quiz_id, batch_id, institution_id, assigned_by, assigned_at, status)
                    VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), 'ACTIVE')
                    ON CONFLICT (quiz_id, batch_id) DO UPDATE SET status = 'ACTIVE'
                    """,
                    q_id, b_id, inst_uuid, t_uuid
                )

        return {
            "id": str(q_id),
            "title": title,
            "quizCode": code,
            "durationMinutes": duration_minutes,
            "maxScore": max_score,
            "batchCount": len(b_uuids),
            "status": "active",
        }

    @classmethod
    async def get_trainer_quiz(cls, ctx: ScopeContext, quiz_id: str) -> dict[str, Any]:
        t_uuid = _safe_uuid(ctx.user_id)
        q_uuid = _safe_uuid(quiz_id)
        if not q_uuid:
            raise NotFound("Quiz not found")

        async with get_pg_connection() as conn:
            quiz = await conn.fetchrow(
                """
                SELECT id, title, description, instructions, course_id, kind, duration_minutes, max_score, opens_at, closes_at,
                       questions, settings, quiz_code, status, creator_trainer_id, created_at, timing_mode
                FROM quizzes WHERE id = $1
                """,
                q_uuid
            )
            if not quiz:
                raise NotFound("Quiz not found")

            # Check trainer authorization
            is_owner = quiz["creator_trainer_id"] == t_uuid
            has_batch = bool(await conn.fetchval(
                """
                SELECT 1 FROM quiz_batch_assignments qba
                JOIN batch_trainers bt ON bt.batch_id = qba.batch_id
                WHERE qba.quiz_id = $1 AND bt.trainer_user_id = $2 AND (bt.status = 'ACTIVE' OR bt.status IS NULL)
                """,
                q_uuid, t_uuid
            ))
            if not is_owner and not has_batch and ctx.role != Role.ADMIN and ctx.role != Role.SUPER_ADMIN:
                raise ScopeForbidden("You are not authorized to view this assessment")

            batches = await conn.fetch(
                """
                SELECT qba.batch_id, b.name as batch_name, b.code as batch_code
                FROM quiz_batch_assignments qba
                JOIN batches b ON b.id = qba.batch_id
                WHERE qba.quiz_id = $1 AND UPPER(qba.status) = 'ACTIVE'
                ORDER BY b.name ASC
                """,
                q_uuid
            )

        return {
            "id": str(quiz["id"]),
            "title": quiz["title"],
            "description": quiz.get("description"),
            "instructions": quiz.get("instructions"),
            "courseId": str(quiz["course_id"]) if quiz.get("course_id") else None,
            "kind": quiz["kind"],
            "durationMinutes": quiz["duration_minutes"],
            "maxScore": quiz["max_score"],
            "opensAt": quiz["opens_at"].isoformat() if quiz["opens_at"] else None,
            "closesAt": quiz["closes_at"].isoformat() if quiz["closes_at"] else None,
            "quizCode": quiz["quiz_code"],
            "timingMode": quiz.get("timing_mode") or "FIXED_TOTAL",
            "settings": quiz["settings"] or {},
            "status": quiz["status"],
            "questions": _parse_json_list(quiz["questions"]),
            "isCreator": is_owner,
            "assignedBatches": [{"batchId": str(b["batch_id"]), "batchName": b["batch_name"], "batchCode": b["batch_code"]} for b in batches],
        }

    @classmethod
    async def update_trainer_quiz(
        cls,
        ctx: ScopeContext,
        quiz_id: str,
        title: str | None = None,
        description: str | None = None,
        instructions: str | None = None,
        course_id: str | None = None,
        duration_minutes: int | None = None,
        max_score: int | None = None,
        opens_at: datetime | None = None,
        closes_at: datetime | None = None,
        questions: list[Any] | None = None,
        settings: dict[str, Any] | None = None,
        batch_ids: list[str] | None = None,
        status: str | None = None,
    ) -> dict[str, Any]:
        t_uuid = _safe_uuid(ctx.user_id)
        q_uuid = _safe_uuid(quiz_id)
        if not q_uuid:
            raise NotFound("Quiz not found")

        async with get_pg_connection() as conn:
            quiz = await conn.fetchrow("SELECT id, creator_trainer_id, institution_id, status, opens_at, closes_at FROM quizzes WHERE id = $1", q_uuid)
            if not quiz:
                raise NotFound("Quiz not found")

            if quiz["creator_trainer_id"] != t_uuid and ctx.role != Role.ADMIN and ctx.role != Role.SUPER_ADMIN:
                raise ScopeForbidden("Only the quiz creator can edit this assessment")

            eff_opens = as_utc(opens_at) if opens_at is not None else as_utc(quiz["opens_at"]) if quiz["opens_at"] else None
            eff_closes = as_utc(closes_at) if closes_at is not None else as_utc(quiz["closes_at"]) if quiz["closes_at"] else None
            if eff_opens and eff_closes and eff_closes <= eff_opens:
                raise ValidationError("Assessment End Date & Time must be strictly after Start Date & Time")

            updates = ["updated_at = NOW()"]
            params: list[Any] = [q_uuid]

            if title is not None:
                params.append(title.strip())
                updates.append(f"title = ${len(params)}")
            if description is not None:
                params.append(description)
                updates.append(f"description = ${len(params)}")
            if instructions is not None:
                params.append(instructions)
                updates.append(f"instructions = ${len(params)}")
            if course_id is not None:
                params.append(_safe_uuid(course_id))
                updates.append(f"course_id = ${len(params)}")
            if duration_minutes is not None:
                params.append(max(1, duration_minutes))
                updates.append(f"duration_minutes = ${len(params)}")
            if max_score is not None:
                params.append(max_score)
                updates.append(f"max_score = ${len(params)}")
            if opens_at is not None:
                params.append(as_utc(opens_at))
                updates.append(f"opens_at = ${len(params)}")
            if closes_at is not None:
                params.append(as_utc(closes_at))
                updates.append(f"closes_at = ${len(params)}")
            if questions is not None:
                params.append(json.dumps(questions))
                updates.append(f"questions = ${len(params)}::jsonb")
            if settings is not None:
                clean_settings = dict(settings or {})
                timing_mode = (clean_settings.get("timing_mode") or "").upper()
                if not timing_mode:
                    timing_mode = "PER_QUESTION" if clean_settings.get("enable_timed_questions") else "FIXED_TOTAL"
                clean_settings["timing_mode"] = timing_mode

                ans_dur = int(clean_settings.get("answer_reveal_duration", 0))
                clean_settings["answer_reveal_duration"] = max(0, ans_dur)

                if timing_mode == "PER_QUESTION":
                    clean_settings["enable_timed_questions"] = True
                    q_dur = int(clean_settings.get("question_duration", 30))
                    if ans_dur > 0 and q_dur <= ans_dur:
                        raise ValidationError("question_duration must be strictly greater than answer_reveal_duration")
                    clean_settings["question_duration"] = q_dur
                    clean_settings["auto_advance"] = True
                    clean_settings["allow_previous"] = False
                    clean_settings["allow_modification"] = False
                else:
                    clean_settings["enable_timed_questions"] = False
                    clean_settings["allow_previous"] = False
                    clean_settings["allow_modification"] = False

                clean_ranges, clean_messages = validate_performance_classification_settings(
                    clean_settings.get("performance_classification"),
                    clean_settings.get("motivational_feedback"),
                )
                clean_settings["performance_classification"] = clean_ranges
                clean_settings["motivational_feedback"] = clean_messages

                params.append(json.dumps(clean_settings))
                updates.append(f"settings = ${len(params)}::jsonb")
                params.append(timing_mode)
                updates.append(f"timing_mode = ${len(params)}")
            if status is not None:
                params.append(status)
                updates.append(f"status = ${len(params)}")

            sql = f"UPDATE quizzes SET {', '.join(updates)} WHERE id = $1"
            await conn.execute(sql, *params)

            # Update batch assignments if provided
            if batch_ids is not None:
                b_uuids = [_safe_uuid(b) for b in batch_ids if _safe_uuid(b)]
                for b_id in b_uuids:
                    allowed = await conn.fetchval(
                        """
                        SELECT 1 FROM batch_trainers
                        WHERE trainer_user_id = $1 AND batch_id = $2 AND (status = 'ACTIVE' OR status IS NULL)
                        """,
                        t_uuid, b_id
                    )
                    if not allowed and ctx.role != Role.ADMIN and ctx.role != Role.SUPER_ADMIN:
                        raise ScopeForbidden(f"You are not authorized to assign assessments to batch {b_id}")

                await conn.execute(
                    "UPDATE quiz_batch_assignments SET status = 'INACTIVE' WHERE quiz_id = $1 AND NOT (batch_id = ANY($2::uuid[]))",
                    q_uuid, b_uuids
                )
                for b_id in b_uuids:
                    await conn.execute(
                        """
                        INSERT INTO quiz_batch_assignments (id, quiz_id, batch_id, institution_id, assigned_by, assigned_at, status)
                        VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), 'ACTIVE')
                        ON CONFLICT (quiz_id, batch_id) DO UPDATE SET status = 'ACTIVE'
                        """,
                        q_uuid, b_id, quiz["institution_id"], t_uuid
                    )

        return {"id": quiz_id, "updated": True}

    @classmethod
    async def delete_trainer_quiz(cls, ctx: ScopeContext, quiz_id: str) -> dict[str, Any]:
        t_uuid = _safe_uuid(ctx.user_id)
        q_uuid = _safe_uuid(quiz_id)
        if not q_uuid:
            raise NotFound("Quiz not found")

        async with get_pg_connection() as conn:
            quiz = await conn.fetchrow("SELECT id, creator_trainer_id FROM quizzes WHERE id = $1", q_uuid)
            if not quiz:
                raise NotFound("Quiz not found")

            if quiz["creator_trainer_id"] != t_uuid and ctx.role != Role.ADMIN and ctx.role != Role.SUPER_ADMIN:
                raise ScopeForbidden("Only the quiz creator can delete this assessment")

            await conn.execute("DELETE FROM quizzes WHERE id = $1", q_uuid)

        return {"id": quiz_id, "deleted": True}

    @classmethod
    async def assign_quiz_batches(cls, ctx: ScopeContext, quiz_id: str, batch_ids: list[str]) -> dict[str, Any]:
        t_uuid = _safe_uuid(ctx.user_id)
        q_uuid = _safe_uuid(quiz_id)
        inst_uuid = _safe_uuid(ctx.college_id)
        if not q_uuid:
            raise NotFound("Quiz not found")

        b_uuids = [_safe_uuid(b) for b in batch_ids if _safe_uuid(b)]

        async with get_pg_connection() as conn:
            quiz = await conn.fetchrow("SELECT id, creator_trainer_id, institution_id FROM quizzes WHERE id = $1", q_uuid)
            if not quiz:
                raise NotFound("Quiz not found")

            if quiz["creator_trainer_id"] != t_uuid and ctx.role != Role.ADMIN and ctx.role != Role.SUPER_ADMIN:
                raise ScopeForbidden("Only the quiz creator or an admin can manage its batch assignments")

            for b_id in b_uuids:
                allowed = await conn.fetchval(
                    """
                    SELECT 1 FROM batch_trainers
                    WHERE trainer_user_id = $1 AND batch_id = $2 AND (status = 'ACTIVE' OR status IS NULL)
                    """,
                    t_uuid, b_id
                )
                if not allowed and ctx.role != Role.ADMIN and ctx.role != Role.SUPER_ADMIN:
                    raise ScopeForbidden(f"You are not authorized to manage batch {b_id}")

            await conn.execute(
                "UPDATE quiz_batch_assignments SET status = 'INACTIVE' WHERE quiz_id = $1 AND NOT (batch_id = ANY($2::uuid[]))",
                q_uuid, b_uuids
            )
            for b_id in b_uuids:
                await conn.execute(
                    """
                    INSERT INTO quiz_batch_assignments (id, quiz_id, batch_id, institution_id, assigned_by, assigned_at, status)
                    VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), 'ACTIVE')
                    ON CONFLICT (quiz_id, batch_id) DO UPDATE SET status = 'ACTIVE'
                    """,
                    q_uuid, b_id, quiz["institution_id"] or inst_uuid, t_uuid
                )

        return {"quizId": quiz_id, "assignedBatches": len(b_uuids), "success": True}

    @classmethod
    async def get_trainer_quiz_results(cls, ctx: ScopeContext, quiz_id: str, batch_id: str | None = None) -> dict[str, Any]:
        t_uuid = _safe_uuid(ctx.user_id)
        q_uuid = _safe_uuid(quiz_id)
        b_uuid = _safe_uuid(batch_id)
        if not q_uuid:
            raise NotFound("Quiz not found")

        async with get_pg_connection() as conn:
            quiz = await conn.fetchrow("SELECT id, title, quiz_code, max_score FROM quizzes WHERE id = $1", q_uuid)
            if not quiz:
                raise NotFound("Quiz not found")

            attempts = await conn.fetch(
                """
                SELECT qa.id, qa.student_user_id, u.name as student_name, u.email as student_email,
                       sp.roll_number, b.id as batch_id, b.name as batch_name,
                       qa.score, qa.possible, qa.percentage, qa.passed, qa.completed_at,
                       qa.warning_count, qa.warnings, qa.device_id, qa.status, qa.candidate_status,
                       qa.submission_reason, qa.is_recovered, qa.created_at
                FROM quiz_attempts qa
                JOIN users u ON u.id = qa.student_user_id
                LEFT JOIN student_profiles sp ON sp.user_id = qa.student_user_id
                LEFT JOIN batches b ON b.id = COALESCE(qa.batch_id, sp.batch_id)
                WHERE qa.quiz_id = $1
                  AND (
                    b.id IN (SELECT batch_id FROM batch_trainers WHERE trainer_user_id = $2 AND (status = 'ACTIVE' OR status IS NULL))
                    OR $2 = (SELECT creator_trainer_id FROM quizzes WHERE id = $1)
                    OR $2 IN (SELECT id FROM users WHERE role IN ('ADMIN', 'SUPER_ADMIN'))
                  )
                  AND ($3::uuid IS NULL OR b.id = $3)
                ORDER BY qa.score DESC
                """,
                q_uuid, t_uuid, b_uuid
            )

            # Retrieve persisted camera snapshots for this quiz
            snap_rows = await conn.fetch(
                """
                SELECT id, student_user_id, attempt_id, snapshot_timestamp, event_type, image_data
                FROM quiz_camera_snapshots
                WHERE quiz_id = $1
                ORDER BY snapshot_timestamp ASC
                """,
                q_uuid
            )
            snaps_by_student: dict[str, list[dict[str, Any]]] = {}
            for s in snap_rows:
                s_uid = str(s["student_user_id"])
                if s_uid not in snaps_by_student:
                    snaps_by_student[s_uid] = []
                snaps_by_student[s_uid].append({
                    "id": str(s["id"]),
                    "attemptId": str(s["attempt_id"]) if s["attempt_id"] else None,
                    "timestamp": s["snapshot_timestamp"].isoformat() if s["snapshot_timestamp"] else None,
                    "eventType": s["event_type"],
                    "imageData": s["image_data"],
                })

        results = []
        for i, a in enumerate(attempts, start=1):
            stu_id = str(a["student_user_id"])
            att_id = str(a["id"])
            stu_snaps = [
                s for s in snaps_by_student.get(stu_id, [])
                if s.get("attemptId") is None or s.get("attemptId") == att_id
            ]
            warning_cnt = int(a["warning_count"] or 0)
            warning_items = _parse_json_list(a["warnings"]) if a["warnings"] else []
            if warning_cnt == 0 and len(warning_items) > 0:
                warning_cnt = len(warning_items)

            results.append({
                "rank": i,
                "attemptId": att_id,
                "studentId": stu_id,
                "name": a["student_name"],
                "email": a["student_email"],
                "rollNumber": a["roll_number"] or "—",
                "batchId": str(a["batch_id"]) if a["batch_id"] else None,
                "batchName": a["batch_name"] or "—",
                "score": int(a["score"]),
                "maxScore": int(a["possible"] or 100),
                "percentage": float(a["percentage"]) if a["percentage"] is not None else 0.0,
                "passed": a["passed"],
                "warnings": warning_cnt,
                "warningCount": warning_cnt,
                "warningList": warning_items,
                "completedAt": a["completed_at"].isoformat() if a["completed_at"] else None,
                "submittedAt": a["completed_at"].isoformat() if a["completed_at"] else None,
                "createdAt": a["created_at"].isoformat() if a["created_at"] else None,
                "status": a["status"] or "submitted",
                "candidateStatus": a["candidate_status"] or ("SUBMITTED" if a["status"] == "completed" else "IN_PROGRESS"),
                "submissionReason": a["submission_reason"],
                "isRecovered": bool(a["is_recovered"]),
                "snapshots": stu_snaps,
            })

        return {
            "quizId": str(quiz["id"]),
            "title": quiz["title"],
            "quizCode": quiz["quiz_code"],
            "totalSubmissions": len(results),
            "results": results,
        }

    @classmethod
    async def get_trainer_quiz_eedi_analytics(cls, ctx: ScopeContext, quiz_id: str, batch_id: str | None = None) -> dict[str, Any]:
        """STRICTLY FOR TRAINERS. Never exposed to students."""
        t_uuid = _safe_uuid(ctx.user_id)
        q_uuid = _safe_uuid(quiz_id)
        b_uuid = _safe_uuid(batch_id)
        if not q_uuid:
            raise NotFound("Quiz not found")

        async with get_pg_connection() as conn:
            quiz = await conn.fetchrow("SELECT id, title, quiz_code FROM quizzes WHERE id = $1", q_uuid)
            if not quiz:
                raise NotFound("Quiz not found")

            rows = await conn.fetch(
                """
                SELECT qr.eedi_index, qr.eedi_term,
                       COUNT(DISTINCT qr.student_user_id) as participant_count,
                       ROUND(AVG(qr.score_percentage), 2) as avg_score,
                       MAX(qr.score_percentage) as max_score,
                       MIN(qr.score_percentage) as min_score
                FROM quiz_eedi_results qr
                WHERE qr.quiz_id = $1
                  AND (
                    qr.batch_id IN (SELECT batch_id FROM batch_trainers WHERE trainer_user_id = $2 AND (status = 'ACTIVE' OR status IS NULL))
                    OR $2 = (SELECT creator_trainer_id FROM quizzes WHERE id = $1)
                    OR $2 IN (SELECT id FROM users WHERE role IN ('ADMIN', 'SUPER_ADMIN'))
                  )
                  AND ($3::uuid IS NULL OR qr.batch_id = $3)
                GROUP BY qr.eedi_term, qr.eedi_index
                ORDER BY qr.eedi_term ASC, qr.eedi_index ASC NULLS LAST
                """,
                q_uuid, t_uuid, b_uuid
            )

            student_rows = await conn.fetch(
                """
                SELECT qr.student_user_id, u.name as student_name, sp.roll_number,
                       b.name as batch_name, qr.eedi_term, qr.eedi_index,
                       qr.earned_marks, qr.possible_marks, qr.score_percentage
                FROM quiz_eedi_results qr
                JOIN users u ON u.id = qr.student_user_id
                LEFT JOIN student_profiles sp ON sp.user_id = qr.student_user_id
                LEFT JOIN batches b ON b.id = qr.batch_id
                WHERE qr.quiz_id = $1
                  AND (
                    qr.batch_id IN (SELECT batch_id FROM batch_trainers WHERE trainer_user_id = $2 AND (status = 'ACTIVE' OR status IS NULL))
                    OR $2 = (SELECT creator_trainer_id FROM quizzes WHERE id = $1)
                    OR $2 IN (SELECT id FROM users WHERE role IN ('ADMIN', 'SUPER_ADMIN'))
                  )
                  AND ($3::uuid IS NULL OR qr.batch_id = $3)
                ORDER BY u.name ASC, qr.eedi_term ASC
                """,
                q_uuid, t_uuid, b_uuid
            )

        summary = []
        for r in rows:
            summary.append({
                "eediIndex": r["eedi_index"],
                "eediTerm": r["eedi_term"],
                "participants": int(r["participant_count"]),
                "avgScore": float(r["avg_score"] or 0),
                "maxScore": float(r["max_score"] or 0),
                "minScore": float(r["min_score"] or 0),
            })

        by_student: dict[str, Any] = {}
        for s in student_rows:
            uid = str(s["student_user_id"])
            if uid not in by_student:
                by_student[uid] = {
                    "studentId": uid,
                    "studentName": s["student_name"],
                    "rollNumber": s["roll_number"] or "—",
                    "batchName": s["batch_name"] or "—",
                    "pillars": [],
                }
            by_student[uid]["pillars"].append({
                "eediIndex": s["eedi_index"],
                "eediTerm": s["eedi_term"],
                "earnedMarks": float(s["earned_marks"]),
                "possibleMarks": float(s["possible_marks"]),
                "scorePercentage": float(s["score_percentage"]),
            })

        return {
            "quizId": str(quiz["id"]),
            "title": quiz["title"],
            "eediSummary": summary,
            "studentBreakdown": list(by_student.values()),
        }

    @classmethod
    async def recover_assessment_attempt(
        cls,
        ctx: ScopeContext,
        quiz_id: str,
        attempt_id: str,
        action: str,
        reason: str,
    ) -> dict[str, Any]:
        t_uuid = _safe_uuid(ctx.user_id)
        q_uuid = _safe_uuid(quiz_id)
        att_uuid = _safe_uuid(attempt_id)
        if not q_uuid or not att_uuid:
            raise NotFound("Assessment or attempt not found")

        act = action.strip().upper()
        if act not in ("RESTART", "RESUME"):
            raise ValidationError("Recovery action must be RESTART or RESUME")

        async with get_pg_connection() as conn:
            quiz = await conn.fetchrow(
                "SELECT id, title, duration_minutes, creator_trainer_id FROM quizzes WHERE id = $1",
                q_uuid
            )
            if not quiz:
                raise NotFound("Assessment not found")

            if ctx.role not in (Role.ADMIN, Role.SUPER_ADMIN) and str(quiz["creator_trainer_id"]) != str(ctx.user_id):
                is_assigned = await conn.fetchval(
                    """
                    SELECT 1 FROM quiz_batch_assignments qba
                    JOIN batch_trainers bt ON bt.batch_id = qba.batch_id
                    WHERE qba.quiz_id = $1 AND bt.trainer_user_id = $2 AND (bt.status = 'ACTIVE' OR bt.status IS NULL)
                    """,
                    q_uuid, t_uuid
                )
                if not is_assigned:
                    raise ScopeForbidden("You are not authorized to recover attempts for this assessment")

            att = await conn.fetchrow(
                """
                SELECT id, student_user_id, status, candidate_status, score, percentage,
                       passed, answers, question_states, created_at, completed_at,
                       submission_reason, warnings, warning_count, recovery_history
                FROM quiz_attempts
                WHERE id = $1 AND quiz_id = $2
                """,
                att_uuid, q_uuid
            )
            if not att:
                raise NotFound("Attempt record not found")

            snapshot = {
                "attempt_id": str(att["id"]),
                "student_user_id": str(att["student_user_id"]),
                "previous_status": att["status"],
                "previous_candidate_status": att["candidate_status"],
                "score": att["score"],
                "percentage": float(att["percentage"]) if att["percentage"] is not None else 0.0,
                "passed": att["passed"],
                "answers": _parse_json_dict(att["answers"]),
                "question_states": _parse_json_dict(att["question_states"]),
                "submission_reason": att["submission_reason"],
                "completed_at": att["completed_at"].isoformat() if att["completed_at"] else None,
            }

            history = _parse_json_list(att["recovery_history"]) if att["recovery_history"] else []
            history_entry = {
                "trainer_id": str(ctx.user_id),
                "action": act,
                "reason": reason,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "previous_status": att["status"],
                "previous_submission_reason": att["submission_reason"],
            }
            history.append(history_entry)

            duration_mins = int(quiz["duration_minutes"] or 30)
            prev_answers: dict[str, Any] = {}

            if act == "RESTART":
                # Option A: Restart Assessment (Fresh attempt, reset answers, timer according to duration)
                await conn.execute(
                    """
                    UPDATE quiz_attempts
                    SET answers = '{}'::jsonb,
                        question_states = '{}'::jsonb,
                        score = 0,
                        percentage = 0.0,
                        passed = FALSE,
                        status = 'in_progress',
                        candidate_status = 'IN_PROGRESS',
                        current_question_index = 0,
                        completed_at = NULL,
                        submission_reason = NULL,
                        abandonment_warning_at = NULL,
                        abandonment_timeout_at = NULL,
                        remaining_seconds = $2,
                        created_at = NOW(),
                        last_heartbeat_at = NOW(),
                        is_recovered = TRUE,
                        recovery_history = $3::jsonb
                    WHERE id = $1
                    """,
                    att_uuid, duration_mins * 60, json.dumps(history)
                )
                res_remaining = duration_mins * 60
                res_q_idx = 0
            else:
                # Option B: Resume Assessment (Restore last persisted answers, remaining time, do not restart Q1)
                prev_answers = _parse_json_dict(att["answers"])
                if att["created_at"] and att["completed_at"]:
                    spent = (as_utc(att["completed_at"]) - as_utc(att["created_at"])).total_seconds()
                    res_remaining = max(60, int((duration_mins * 60) - spent))
                else:
                    res_remaining = duration_mins * 60

                res_q_idx = max(0, len(prev_answers) - 1) if prev_answers else 0

                await conn.execute(
                    """
                    UPDATE quiz_attempts
                    SET status = 'in_progress',
                        candidate_status = 'IN_PROGRESS',
                        completed_at = NULL,
                        submission_reason = NULL,
                        abandonment_warning_at = NULL,
                        abandonment_timeout_at = NULL,
                        remaining_seconds = $2,
                        last_heartbeat_at = NOW(),
                        is_recovered = TRUE,
                        recovery_history = $3::jsonb
                    WHERE id = $1
                    """,
                    att_uuid, res_remaining, json.dumps(history)
                )

            # Insert immutable audit record into quiz_recovery_logs
            await conn.execute(
                """
                INSERT INTO quiz_recovery_logs (
                    id, trainer_user_id, student_user_id, quiz_id, attempt_id,
                    recovery_action, recovery_reason, previous_attempt_snapshot, created_at
                ) VALUES (
                    gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::jsonb, NOW()
                )
                """,
                t_uuid, att["student_user_id"], q_uuid, att_uuid,
                act, reason, json.dumps(snapshot)
            )

        # Broadcast update to supervisor hub
        try:
            from app.websocket.assessment_ws import assessment_hub
            await assessment_hub.handle_attempt_recovered(
                quiz_id=str(quiz_id),
                user_id=str(att["student_user_id"]),
                action=act,
                remaining_seconds=res_remaining,
                current_question_index=res_q_idx,
            )
        except Exception:
            pass

        return {
            "success": True,
            "action": act,
            "attemptId": str(att_uuid),
            "studentId": str(att["student_user_id"]),
            "candidateStatus": "IN_PROGRESS",
            "restoredAnswers": prev_answers,
            "remainingSeconds": res_remaining,
            "currentQuestionIndex": res_q_idx,
            "recoveredAt": datetime.now(timezone.utc).isoformat(),
        }

    @classmethod
    async def record_abandonment_warning(cls, ctx: ScopeContext, quiz_id: str) -> dict[str, Any]:
        q_uuid = _safe_uuid(quiz_id)
        u_uuid = _safe_uuid(ctx.user_id)
        if not q_uuid:
            raise NotFound("Assessment not found")

        server_now = datetime.now(timezone.utc)
        timeout_at = server_now + timedelta(seconds=20)

        async with get_pg_connection() as conn:
            att = await conn.fetchrow(
                "SELECT id, status FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
                q_uuid, u_uuid
            )
            if not att or att["status"] == "completed":
                return {"active": False}

            await conn.execute(
                """
                UPDATE quiz_attempts
                SET abandonment_warning_at = $1,
                    abandonment_timeout_at = $2,
                    candidate_status = 'ABANDONMENT_WARNING',
                    last_heartbeat_at = NOW()
                WHERE id = $3
                """,
                server_now, timeout_at, att["id"]
            )

        try:
            from app.websocket.assessment_ws import assessment_hub
            await assessment_hub.handle_abandonment_warning(str(quiz_id), str(ctx.user_id), 20)
        except Exception:
            pass

        return {
            "success": True,
            "abandonmentWarning": True,
            "gracePeriodSeconds": 20,
            "timeoutAt": timeout_at.isoformat(),
        }

    @classmethod
    async def cancel_abandonment_warning(cls, ctx: ScopeContext, quiz_id: str) -> dict[str, Any]:
        q_uuid = _safe_uuid(quiz_id)
        u_uuid = _safe_uuid(ctx.user_id)
        if not q_uuid:
            raise NotFound("Assessment not found")

        async with get_pg_connection() as conn:
            att = await conn.fetchrow(
                "SELECT id, status FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
                q_uuid, u_uuid
            )
            if not att or att["status"] == "completed":
                return {"restored": False}

            await conn.execute(
                """
                UPDATE quiz_attempts
                SET abandonment_warning_at = NULL,
                    abandonment_timeout_at = NULL,
                    candidate_status = 'IN_PROGRESS',
                    last_heartbeat_at = NOW()
                WHERE id = $1
                """,
                att["id"]
            )

        try:
            from app.websocket.assessment_ws import assessment_hub
            await assessment_hub.handle_abandonment_cancel(str(quiz_id), str(ctx.user_id))
        except Exception:
            pass

        return {
            "success": True,
            "restored": True,
            "candidateStatus": "IN_PROGRESS",
        }

    @classmethod
    async def handle_abandonment_timeout(cls, ctx: ScopeContext, quiz_id: str) -> dict[str, Any]:
        return await cls.submit_quiz_attempt(
            ctx=ctx,
            quiz_id=quiz_id,
            answers=None,
            submission_reason="ABANDONMENT_TIMEOUT",
        )

    @classmethod
    async def record_student_heartbeat(cls, ctx: ScopeContext, quiz_id: str) -> dict[str, Any]:
        q_uuid = _safe_uuid(quiz_id)
        u_uuid = _safe_uuid(ctx.user_id)
        if not q_uuid:
            raise NotFound("Assessment not found")

        server_now = datetime.now(timezone.utc)
        async with get_pg_connection() as conn:
            quiz = await conn.fetchrow("SELECT duration_minutes, timing_mode, settings FROM quizzes WHERE id = $1", q_uuid)
            att = await conn.fetchrow(
                """
                SELECT id, status, created_at, abandonment_timeout_at, remaining_seconds, candidate_status
                FROM quiz_attempts
                WHERE quiz_id = $1 AND student_user_id = $2
                """,
                q_uuid, u_uuid
            )
            if not att:
                return {"active": False, "remainingSeconds": (quiz["duration_minutes"] if quiz else 30) * 60}

            if att["status"] == "completed":
                return {"active": False, "status": "completed", "remainingSeconds": 0}

            if att["abandonment_timeout_at"] and server_now > as_utc(att["abandonment_timeout_at"]):
                await conn.close()
                return await cls.handle_abandonment_timeout(ctx, quiz_id)

            duration_mins = int((quiz["duration_minutes"] if quiz else 30) or 30)
            elapsed = (server_now - as_utc(att["created_at"])).total_seconds()
            rem = max(0, int((duration_mins * 60) - elapsed))

            if rem <= 0:
                await conn.close()
                return await cls.submit_quiz_attempt(ctx=ctx, quiz_id=quiz_id, answers=None, submission_reason="TIMER_EXPIRED")

            await conn.execute(
                """
                UPDATE quiz_attempts
                SET last_heartbeat_at = NOW(),
                    remaining_seconds = $2
                WHERE id = $1
                """,
                att["id"], rem
            )

        return {
            "active": True,
            "remainingSeconds": rem,
            "candidateStatus": att["candidate_status"] or "IN_PROGRESS",
            "serverTime": server_now.isoformat(),
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
