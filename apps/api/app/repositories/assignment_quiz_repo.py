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
from app.core.errors import BusinessRuleViolation, NotFound, ScopeForbidden, ValidationError
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
                       q.questions, q.settings, q.quiz_code, q.batch_id, q.institution_id
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
                    (quiz["batch_id"] is None and (quiz["institution_id"] == student_inst_id or quiz["institution_id"] is None))
                )

            if not is_authorized:
                raise ScopeForbidden("This assessment is not assigned to your batch")

            attempt = await conn.fetchrow(
                "SELECT score, completed_at, passed, percentage FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
                q_uuid, student_user_id
            )

        q_list = _parse_json_list(quiz["questions"])
        questions = []
        for q in q_list:
            opts = []
            if isinstance(q.get("options"), list):
                for i, o in enumerate(q.get("options", [])):
                    opts.append({"id": o.get("id", chr(65 + i)), "text": o.get("text", "")})
            elif isinstance(q.get("options"), dict):
                for k, v in q.get("options", {}).items():
                    opts.append({"id": k, "text": str(v)})
            questions.append({
                "id": str(q.get("id")),
                "text": q.get("text") or q.get("question"),
                "image": q.get("image"),
                "options": opts,
                "marks": q.get("marks", 1),
                "question_type": q.get("question_type") or q.get("questionType") or ("mcq_multiple" if len(q.get("correct", [])) > 1 else "mcq_single"),
            })

        return {
            "id": str(quiz["id"]),
            "title": quiz["title"],
            "kind": quiz["kind"],
            "durationMinutes": quiz["duration_minutes"],
            "maxScore": quiz["max_score"],
            "opensAt": quiz["opens_at"].isoformat() if quiz["opens_at"] else None,
            "closesAt": quiz["closes_at"].isoformat() if quiz["closes_at"] else None,
            "quizCode": quiz["quiz_code"],
            "settings": _parse_json_dict(quiz["settings"]),
            "questions": questions,
            "attempt": {
                "score": attempt["score"],
                "completedAt": attempt["completed_at"].isoformat() if attempt["completed_at"] else None,
                "passed": attempt["passed"],
                "percentage": float(attempt["percentage"]) if attempt["percentage"] is not None else None,
            } if attempt else None,
        }

    @classmethod
    async def submit_quiz_attempt(
        cls,
        ctx: ScopeContext,
        quiz_id: str,
        answers: dict[str, str],
        device_id: str | None = None,
        warnings: list[Any] | None = None,
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
                "SELECT id, title, questions, max_score, allow_retake, closes_at, batch_id, institution_id FROM quizzes WHERE id = $1 AND status = 'active'",
                q_uuid
            )
            if not quiz:
                raise NotFound("Quiz not found")

            # Check deadline
            if quiz["closes_at"] and quiz["closes_at"] < _now():
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
                    (quiz["batch_id"] is None and (quiz["institution_id"] == student_inst_id or quiz["institution_id"] is None))
                )

            if not is_authorized:
                raise ScopeForbidden("This assessment is not assigned to your batch")

            existing = await conn.fetchrow(
                "SELECT id, score, status FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
                q_uuid, u_uuid
            )
            if existing and existing["status"] == "completed" and not quiz["allow_retake"]:
                raise BusinessRuleViolation("You have already submitted this assessment")

            q_list = _parse_json_list(quiz["questions"])
            earned = 0.0
            total_marks = 0.0

            # EEDI accumulator: (eedi_term, eedi_index) -> {"earned": float, "possible": float}
            eedi_acc: dict[tuple[str, int | None], dict[str, float]] = {}

            for q in q_list:
                m = float(q.get("marks", 1))
                neg = float(q.get("negative", 0))
                total_marks += m
                qid = str(q.get("id"))
                raw_ans = answers.get(qid)
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
                correct_raw = q.get("correct") or q.get("correct_answer") or q.get("correctAnswer")
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

            warnings_json = json.dumps(warnings or [])
            warning_count = len(warnings or [])

            if existing:
                att_id = existing["id"]
                await conn.execute(
                    """
                    UPDATE quiz_attempts
                    SET score = $3, possible = $4, answers = $5::jsonb, completed_at = NOW(),
                        batch_id = $6, institution_id = $7, device_id = $8,
                        warnings = $9::jsonb, warning_count = $10, status = 'completed',
                        percentage = $11, passed = $12
                    WHERE id = $1 AND student_user_id = $2
                    """,
                    att_id, u_uuid, score_val, int(quiz["max_score"] or 100),
                    json.dumps(answers), student_batch_id, student_inst_id, device_id,
                    warnings_json, warning_count, pct_score, passed
                )
            else:
                att_id = uuid.uuid4()
                await conn.execute(
                    """
                    INSERT INTO quiz_attempts (
                        id, quiz_id, student_user_id, score, possible, answers, created_at, completed_at,
                        batch_id, institution_id, device_id, warnings, warning_count, status, percentage, passed
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6::jsonb, NOW(), NOW(),
                        $7, $8, $9, $10::jsonb, $11, 'completed', $12, $13
                    )
                    """,
                    att_id, q_uuid, u_uuid, score_val, int(quiz["max_score"] or 100),
                    json.dumps(answers), student_batch_id, student_inst_id, device_id,
                    warnings_json, warning_count, pct_score, passed
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

        # Student response contains user-facing score only (NO EEDI SCORES)
        return {
            "attemptId": str(att_id),
            "score": score_val,
            "maxScore": int(quiz["max_score"] or 100),
            "percentage": pct_score,
            "passed": passed,
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
                "SELECT settings, duration_minutes, max_score, questions FROM quizzes WHERE id = $1",
                q_uuid,
            )
            if not quiz:
                return {}

            settings_dict = _parse_json_dict(quiz["settings"])
            q_list = _parse_json_list(quiz["questions"])
            total_questions = len(q_list)

            attempt = await conn.fetchrow(
                "SELECT id, created_at, completed_at, score, answers, status FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
                q_uuid, student_user_id,
            )

            now_utc = datetime.now(timezone.utc)
            is_timed = bool(settings_dict.get("enable_timed_questions"))
            q_dur = int(settings_dict.get("question_duration", 10))
            ans_rev_dur = int(settings_dict.get("answer_reveal_duration", 2))
            ans_dur = max(1, q_dur - ans_rev_dur)
            auto_advance = bool(settings_dict.get("auto_advance", True))
            allow_prev = bool(settings_dict.get("allow_previous", False))
            allow_mod = bool(settings_dict.get("allow_modification", False))
            overall_duration_minutes = int(quiz["duration_minutes"] or 30)
            overall_duration_seconds = overall_duration_minutes * 60
            total_duration_seconds = overall_duration_seconds

            if not attempt:
                return {
                    "hasStarted": False,
                    "status": "not_started",
                    "answers": {},
                    "timingState": {
                        "is_timed": is_timed,
                        "started_at": None,
                        "server_time": int(now_utc.timestamp()),
                        "elapsed_seconds": 0,
                        "total_duration_seconds": total_duration_seconds,
                        "remaining_seconds": total_duration_seconds,
                        "overall_remaining_seconds": total_duration_seconds,
                        "duration_minutes": overall_duration_minutes,
                        "total_questions": total_questions,
                        "current_question_index": 0,
                        "phase": "answering",
                        "phase_remaining_seconds": ans_dur if is_timed else total_duration_seconds,
                        "question_remaining_seconds": q_dur if is_timed else total_duration_seconds,
                        "question_duration": q_dur,
                        "answer_reveal_duration": ans_rev_dur,
                        "answering_duration": ans_dur,
                        "auto_advance": auto_advance,
                        "allow_previous": allow_prev,
                        "allow_modification": allow_mod,
                        "is_completed": False,
                    }
                }

            att_id = attempt["id"]
            started_at = as_utc(attempt["created_at"])
            status = attempt["status"] or ("completed" if attempt["completed_at"] else "in_progress")
            answers = _parse_json_dict(attempt["answers"]) if attempt["answers"] else {}

            elapsed_seconds = max(0.0, (now_utc - started_at).total_seconds())
            overall_remaining_seconds = max(0.0, overall_duration_seconds - elapsed_seconds)
            timed_exam_limit_seconds = (total_questions * q_dur) if is_timed else overall_duration_seconds

            is_expired = False
            if elapsed_seconds >= overall_duration_seconds:
                is_expired = True
            elif is_timed and elapsed_seconds >= timed_exam_limit_seconds:
                is_expired = True

            if status != "completed" and is_expired:
                status = "completed"
                await conn.execute(
                    "UPDATE quiz_attempts SET status = 'completed', completed_at = $1 WHERE id = $2",
                    now_utc, att_id,
                )

            if is_timed:
                current_q_idx = min(total_questions - 1, int(elapsed_seconds // q_dur)) if total_questions > 0 else 0
                time_in_q = elapsed_seconds % q_dur
                phase = "answering" if time_in_q < ans_dur else "revealing"
                phase_time_left = max(0.0, ans_dur - time_in_q) if phase == "answering" else max(0.0, q_dur - time_in_q)
                question_time_left = max(0.0, q_dur - time_in_q)
            else:
                current_q_idx = 0
                phase = "answering"
                phase_time_left = overall_remaining_seconds
                question_time_left = overall_remaining_seconds

            return {
                "hasStarted": True,
                "attemptId": str(att_id),
                "status": status,
                "answers": answers,
                "timingState": {
                    "is_timed": is_timed,
                    "started_at": int(started_at.timestamp()),
                    "server_time": int(now_utc.timestamp()),
                    "elapsed_seconds": round(elapsed_seconds, 2),
                    "total_duration_seconds": total_duration_seconds,
                    "remaining_seconds": round(overall_remaining_seconds, 1),
                    "overall_remaining_seconds": round(overall_remaining_seconds, 1),
                    "duration_minutes": overall_duration_minutes,
                    "total_questions": total_questions,
                    "current_question_index": current_q_idx,
                    "phase": phase,
                    "phase_remaining_seconds": round(phase_time_left, 1),
                    "question_remaining_seconds": round(question_time_left, 1),
                    "question_duration": q_dur,
                    "answer_reveal_duration": ans_rev_dur,
                    "answering_duration": ans_dur,
                    "auto_advance": auto_advance,
                    "allow_previous": allow_prev,
                    "allow_modification": allow_mod,
                    "is_completed": status == "completed",
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
                "SELECT id, questions, settings, duration_minutes, max_score, status FROM quizzes WHERE id = $1 AND status = 'active'",
                q_uuid,
            )
            if not quiz:
                raise NotFound("Assessment not found")

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
                        batch_id, institution_id, warnings, warning_count, status
                    ) VALUES (
                        $1, $2, $3, 0, $4, '{}'::jsonb, $5,
                        $6, $7, '[]'::jsonb, 0, 'in_progress'
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
    ) -> dict[str, Any]:
        q_uuid = _safe_uuid(quiz_id)
        u_uuid = _safe_uuid(ctx.user_id)
        if not q_uuid:
            raise NotFound("Assessment not found")

        async with get_pg_connection() as conn:
            quiz_row = await conn.fetchrow(
                "SELECT settings, questions FROM quizzes WHERE id = $1",
                q_uuid
            )
            settings_dict = _parse_json_dict(quiz_row["settings"]) if quiz_row else {}

            existing = await conn.fetchrow(
                "SELECT id, answers, status, created_at FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
                q_uuid, u_uuid,
            )
            if existing and existing["status"] == "completed":
                raise BusinessRuleViolation("Assessment has already been submitted")

            answers_dict: dict[str, Any] = {}
            if existing and existing["answers"]:
                answers_dict = _parse_json_dict(existing["answers"])

            # Strict Timed Question Lock: enforce answering deadline and locked past questions
            if settings_dict.get("enable_timed_questions") and existing:
                server_now = datetime.now(timezone.utc)
                started_at = as_utc(existing["created_at"])
                elapsed_seconds = max(0.0, (server_now - started_at).total_seconds())

                q_list = _parse_json_list(quiz_row["questions"]) if quiz_row else []
                target_idx = None
                for idx, q in enumerate(q_list):
                    if str(q.get("id")) == str(question_id):
                        target_idx = idx
                        break

                if target_idx is not None:
                    q_dur = int(settings_dict.get("question_duration", 10))
                    ans_rev_dur = int(settings_dict.get("answer_reveal_duration", 2))
                    ans_dur = max(1, q_dur - ans_rev_dur)

                    answering_deadline = (target_idx * q_dur) + ans_dur
                    if elapsed_seconds > answering_deadline:
                        raise BusinessRuleViolation("Answering period for this question has expired and answers are locked")

                    current_active_idx = int(elapsed_seconds // q_dur)
                    if settings_dict.get("allow_previous") is False and target_idx < current_active_idx:
                        raise BusinessRuleViolation("Previous questions are locked for this timed assessment")

            if settings_dict.get("enable_timed_questions"):
                if settings_dict.get("allow_modification") is False and str(question_id) in answers_dict:
                    if answers_dict[str(question_id)] != answer:
                        raise BusinessRuleViolation("Modification of answered questions is locked for this timed assessment")

            answers_dict[str(question_id)] = answer

            if existing:
                await conn.execute(
                    "UPDATE quiz_attempts SET answers = $1::jsonb WHERE id = $2",
                    json.dumps(answers_dict), existing["id"]
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
                        gen_random_uuid(), $1, $2, 0, 100, $3::jsonb, NOW(),
                        $4, $5, '[]'::jsonb, 0, 'in_progress'
                    )
                    """,
                    q_uuid, u_uuid, json.dumps(answers_dict),
                    b_row["batch_id"] if b_row else None,
                    b_row["institution_id"] if b_row else None,
                )

        return {"saved": True, "questionId": question_id}

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
                "SELECT id, questions, settings, status FROM quizzes WHERE id = $1",
                q_uuid
            )
            if not quiz:
                raise NotFound("Assessment not found")

            settings_dict = _parse_json_dict(quiz["settings"])
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

            # Server-Authoritative Timing Guard:
            # Reject reveal if answering phase is still active!
            if settings_dict.get("enable_timed_questions"):
                attempt = await conn.fetchrow(
                    "SELECT id, created_at, status FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
                    q_uuid, u_uuid,
                )
                if not attempt:
                    raise ScopeForbidden("Assessment attempt not started")

                if attempt["status"] != "completed" and target_idx is not None:
                    server_now = datetime.now(timezone.utc)
                    started_at = as_utc(attempt["created_at"])
                    elapsed_seconds = max(0.0, (server_now - started_at).total_seconds())

                    q_dur = int(settings_dict.get("question_duration", 10))
                    ans_rev_dur = int(settings_dict.get("answer_reveal_duration", 2))
                    ans_dur = max(1, q_dur - ans_rev_dur)

                    answering_deadline = (target_idx * q_dur) + ans_dur
                    if elapsed_seconds < answering_deadline:
                        raise ScopeForbidden("Answering phase is still active. Reveal not authorized until answering period ends.")

        correct_opts = []
        if isinstance(target_q.get("correct"), list):
            correct_opts = [str(x) for x in target_q.get("correct")]
        elif target_q.get("correct") is not None:
            correct_opts = [str(target_q.get("correct"))]
        elif target_q.get("correct_answer") is not None:
            correct_opts = [str(target_q.get("correct_answer"))]
        elif target_q.get("answer") is not None:
            correct_opts = [str(target_q.get("answer"))]

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
        b_uuids = [_safe_uuid(b) for b in (batch_ids or []) if _safe_uuid(b)]

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
            if clean_settings.get("enable_timed_questions"):
                q_dur = int(clean_settings.get("question_duration", 10))
                ans_dur = int(clean_settings.get("answer_reveal_duration", 2))
                if q_dur <= ans_dur:
                    raise ValidationError("question_duration must be strictly greater than answer_reveal_duration")
                clean_settings["question_duration"] = q_dur
                clean_settings["answer_reveal_duration"] = ans_dur
                clean_settings["auto_advance"] = bool(clean_settings.get("auto_advance", True))
                clean_settings["allow_previous"] = bool(clean_settings.get("allow_previous", False))
                clean_settings["allow_modification"] = bool(clean_settings.get("allow_modification", False))

            q_id = uuid.uuid4()
            await conn.execute(
                """
                INSERT INTO quizzes (
                    id, creator_trainer_id, institution_id, title, kind,
                    duration_minutes, max_score, allow_retake, opens_at, closes_at,
                    questions, settings, quiz_code, status, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, 'quiz',
                    $5, $6, false, $7, $8,
                    $9::jsonb, $10::jsonb, $11, 'active', NOW(), NOW()
                )
                """,
                q_id, t_uuid, inst_uuid, title.strip(),
                max(1, duration_minutes), max_score, opens_at, closes_at,
                json.dumps(questions or []), json.dumps(clean_settings), code
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
                SELECT id, title, kind, duration_minutes, max_score, opens_at, closes_at,
                       questions, settings, quiz_code, status, creator_trainer_id, created_at
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
            "kind": quiz["kind"],
            "durationMinutes": quiz["duration_minutes"],
            "maxScore": quiz["max_score"],
            "opensAt": quiz["opens_at"].isoformat() if quiz["opens_at"] else None,
            "closesAt": quiz["closes_at"].isoformat() if quiz["closes_at"] else None,
            "quizCode": quiz["quiz_code"],
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
            quiz = await conn.fetchrow("SELECT id, creator_trainer_id, institution_id, status FROM quizzes WHERE id = $1", q_uuid)
            if not quiz:
                raise NotFound("Quiz not found")

            if quiz["creator_trainer_id"] != t_uuid and ctx.role != Role.ADMIN and ctx.role != Role.SUPER_ADMIN:
                raise ScopeForbidden("Only the quiz creator can edit this assessment")

            updates = ["updated_at = NOW()"]
            params: list[Any] = [q_uuid]

            if title is not None:
                params.append(title.strip())
                updates.append(f"title = ${len(params)}")
            if duration_minutes is not None:
                params.append(max(1, duration_minutes))
                updates.append(f"duration_minutes = ${len(params)}")
            if max_score is not None:
                params.append(max_score)
                updates.append(f"max_score = ${len(params)}")
            if opens_at is not None:
                params.append(opens_at)
                updates.append(f"opens_at = ${len(params)}")
            if closes_at is not None:
                params.append(closes_at)
                updates.append(f"closes_at = ${len(params)}")
            if questions is not None:
                params.append(json.dumps(questions))
                updates.append(f"questions = ${len(params)}::jsonb")
            if settings is not None:
                clean_settings = dict(settings or {})
                if clean_settings.get("enable_timed_questions"):
                    q_dur = int(clean_settings.get("question_duration", 10))
                    ans_dur = int(clean_settings.get("answer_reveal_duration", 2))
                    if q_dur <= ans_dur:
                        raise ValidationError("question_duration must be strictly greater than answer_reveal_duration")
                    clean_settings["question_duration"] = q_dur
                    clean_settings["answer_reveal_duration"] = ans_dur
                    clean_settings["auto_advance"] = bool(clean_settings.get("auto_advance", True))
                    clean_settings["allow_previous"] = bool(clean_settings.get("allow_previous", False))
                    clean_settings["allow_modification"] = bool(clean_settings.get("allow_modification", False))
                params.append(json.dumps(clean_settings))
                updates.append(f"settings = ${len(params)}::jsonb")
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
                       qa.warning_count, qa.device_id
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

        results = []
        for i, a in enumerate(attempts, start=1):
            results.append({
                "rank": i,
                "attemptId": str(a["id"]),
                "studentId": str(a["student_user_id"]),
                "name": a["student_name"],
                "email": a["student_email"],
                "rollNumber": a["roll_number"] or "—",
                "batchId": str(a["batch_id"]) if a["batch_id"] else None,
                "batchName": a["batch_name"] or "—",
                "score": int(a["score"]),
                "maxScore": int(a["possible"] or 100),
                "percentage": float(a["percentage"]) if a["percentage"] is not None else 0.0,
                "passed": a["passed"],
                "warnings": int(a["warning_count"] or 0),
                "completedAt": a["completed_at"].isoformat() if a["completed_at"] else None,
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
