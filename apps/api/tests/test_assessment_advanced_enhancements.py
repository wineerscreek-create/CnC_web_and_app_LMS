"""Comprehensive Integration Tests for Assessment Advanced Enhancements:
1. Answer Reveal in FIXED_TOTAL & PER_QUESTION Modes
2. Assessment Scheduling Lifecycles (UPCOMING, ACTIVE, EXPIRED)
3. 4-Category Performance Classification & Validation
4. Motivational Feedback Rendering & Storage
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone, timedelta
import pytest

from app.db.postgres import get_pg_connection
from app.core.errors import BusinessRuleViolation, Conflict, ScopeForbidden, ValidationError
from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.repositories.assignment_quiz_repo import (
    QuizRepository,
    validate_performance_classification_settings,
    determine_performance_category,
    DEFAULT_PERFORMANCE_RANGES,
    DEFAULT_MOTIVATIONAL_MESSAGES,
)


@pytest.mark.asyncio
async def test_assessment_scheduling_lifecycle():
    """Verifies that UPCOMING assessments block starts and hide questions,
    ACTIVE assessments allow starts, and EXPIRED assessments block new attempts.
    """
    async with get_pg_connection() as conn:
        inst = await conn.fetchrow("SELECT id FROM institutions LIMIT 1")
        trainer = await conn.fetchrow("SELECT id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        inst_id = inst["id"]
        trainer_id = trainer["id"]
        student_id = student["id"]

        now = datetime.now(timezone.utc)
        future_start = now + timedelta(hours=2)
        future_end = now + timedelta(hours=4)
        past_start = now - timedelta(hours=4)
        past_end = now - timedelta(hours=1)

        questions = [
            {
                "id": "q1",
                "text": "Secret Question 1",
                "options": [{"id": "A", "text": "Opt A"}, {"id": "B", "text": "Opt B"}],
                "correct_options": ["A"],
                "marks": 1,
            }
        ]

        # 1. UPCOMING QUIZ
        upcoming_id = uuid.uuid4()
        await conn.execute(
            """
            INSERT INTO quizzes (
                id, creator_trainer_id, institution_id, title, kind,
                duration_minutes, max_score, allow_retake, questions,
                settings, quiz_code, status, timing_mode, opens_at, closes_at,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, 'Upcoming Exam', 'quiz',
                30, 100, false, $4::jsonb,
                '{}'::jsonb, $5, 'active', 'FIXED_TOTAL', $6, $7,
                NOW(), NOW()
            )
            """,
            upcoming_id, trainer_id, inst_id, json.dumps(questions),
            f"UP-{uuid.uuid4().hex[:6].upper()}", future_start, future_end,
        )

        # GET quiz: must report UPCOMING and suppress questions to prevent cheating
        quiz_data = await QuizRepository.get_quiz(str(upcoming_id), student_id)
        assert quiz_data["scheduleStatus"] == "UPCOMING"
        assert len(quiz_data["questions"]) == 0  # Hidden before opening

        # Attempt to start: must be rejected
        with pytest.raises((Conflict, BusinessRuleViolation)) as exc_info:
            await QuizRepository.start_or_resume_quiz_attempt(str(upcoming_id), student_id)
        assert "upcoming" in str(exc_info.value).lower() or "not started" in str(exc_info.value).lower()

        # 2. EXPIRED QUIZ
        expired_id = uuid.uuid4()
        await conn.execute(
            """
            INSERT INTO quizzes (
                id, creator_trainer_id, institution_id, title, kind,
                duration_minutes, max_score, allow_retake, questions,
                settings, quiz_code, status, timing_mode, opens_at, closes_at,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, 'Expired Exam', 'quiz',
                30, 100, false, $4::jsonb,
                '{}'::jsonb, $5, 'active', 'FIXED_TOTAL', $6, $7,
                NOW(), NOW()
            )
            """,
            expired_id, trainer_id, inst_id, json.dumps(questions),
            f"EX-{uuid.uuid4().hex[:6].upper()}", past_start, past_end,
        )

        quiz_data_exp = await QuizRepository.get_quiz(str(expired_id), student_id)
        assert quiz_data_exp["scheduleStatus"] == "EXPIRED"

        with pytest.raises((Conflict, BusinessRuleViolation)) as exc_info_exp:
            await QuizRepository.start_or_resume_quiz_attempt(str(expired_id), student_id)
        assert "expired" in str(exc_info_exp.value).lower() or "ended" in str(exc_info_exp.value).lower()

        # 3. ACTIVE QUIZ
        active_id = uuid.uuid4()
        await conn.execute(
            """
            INSERT INTO quizzes (
                id, creator_trainer_id, institution_id, title, kind,
                duration_minutes, max_score, allow_retake, questions,
                settings, quiz_code, status, timing_mode, opens_at, closes_at,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, 'Active Exam', 'quiz',
                30, 100, false, $4::jsonb,
                '{}'::jsonb, $5, 'active', 'FIXED_TOTAL', $6, $7,
                NOW(), NOW()
            )
            """,
            active_id, trainer_id, inst_id, json.dumps(questions),
            f"AC-{uuid.uuid4().hex[:6].upper()}", past_start, future_end,
        )

        quiz_data_act = await QuizRepository.get_quiz(str(active_id), student_id)
        assert quiz_data_act["scheduleStatus"] == "ACTIVE"
        assert len(quiz_data_act["questions"]) == 1

        start_act = await QuizRepository.start_or_resume_quiz_attempt(str(active_id), student_id)
        assert start_act["hasStarted"] is True


@pytest.mark.asyncio
async def test_answer_reveal_in_fixed_total_and_per_question_modes():
    """Verifies that Answer Reveal Duration is configured, saved, and authorized
    in BOTH FIXED_TOTAL and PER_QUESTION modes upon question submission.
    """
    async with get_pg_connection() as conn:
        inst = await conn.fetchrow("SELECT id FROM institutions LIMIT 1")
        trainer = await conn.fetchrow("SELECT id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        inst_id = inst["id"]
        trainer_id = trainer["id"]
        student_id = student["id"]

        mock_student_ctx = ScopeContext(
            user_id=str(student_id),
            role=Role.STUDENT,
            college_id=str(inst_id),
            department_id=str(uuid.uuid4()),
            session_id="sess-student-reveal",
        )

        questions = [
            {
                "id": "q1",
                "text": "What is Python?",
                "options": [{"id": "A", "text": "Language"}, {"id": "B", "text": "Snake"}],
                "correct_options": ["A"],
                "explanation": "Python is a high-level programming language.",
                "marks": 5,
            }
        ]

        # Case 1: FIXED_TOTAL with answer_reveal_duration = 10
        ft_quiz_id = uuid.uuid4()
        await conn.execute(
            """
            INSERT INTO quizzes (
                id, creator_trainer_id, institution_id, title, kind,
                duration_minutes, max_score, allow_retake, questions,
                settings, quiz_code, status, timing_mode, created_at, updated_at
            ) VALUES (
                $1, $2, $3, 'Fixed Total with Reveal', 'quiz',
                15, 100, false, $4::jsonb,
                '{"timing_mode": "FIXED_TOTAL", "answer_reveal_duration": 10}'::jsonb,
                $5, 'active', 'FIXED_TOTAL', NOW(), NOW()
            )
            """,
            ft_quiz_id, trainer_id, inst_id, json.dumps(questions),
            f"FTR-{uuid.uuid4().hex[:6].upper()}",
        )

        # Start attempt
        ft_start = await QuizRepository.start_or_resume_quiz_attempt(str(ft_quiz_id), student_id)
        assert ft_start["timingState"]["answer_reveal_duration"] == 10
        assert ft_start["timingState"]["timing_mode"] == "FIXED_TOTAL"

        # Attempting reveal before answering -> not authorized
        with pytest.raises((ScopeForbidden, BusinessRuleViolation)):
            await QuizRepository.get_question_reveal(mock_student_ctx, str(ft_quiz_id), "q1")

        # Save draft answer (locks question)
        save_res = await QuizRepository.save_student_draft_answer(
            ctx=mock_student_ctx,
            quiz_id=str(ft_quiz_id),
            question_id="q1",
            answer="A",
        )
        assert save_res["saved"] is True

        # Now get_question_reveal must succeed and return correct options & explanation!
        reveal_data = await QuizRepository.get_question_reveal(mock_student_ctx, str(ft_quiz_id), "q1")
        assert reveal_data["question_id"] == "q1"
        assert reveal_data["correct_options"] == ["A"]
        assert "high-level" in reveal_data["explanation"]

        # Case 2: PER_QUESTION with answer_reveal_duration = 5, question_duration = 30
        pq_quiz_id = uuid.uuid4()
        await conn.execute(
            """
            INSERT INTO quizzes (
                id, creator_trainer_id, institution_id, title, kind,
                duration_minutes, max_score, allow_retake, questions,
                settings, quiz_code, status, timing_mode, created_at, updated_at
            ) VALUES (
                $1, $2, $3, 'Per Question with Reveal', 'quiz',
                15, 100, false, $4::jsonb,
                '{"timing_mode": "PER_QUESTION", "enable_timed_questions": true, "question_duration": 30, "answer_reveal_duration": 5}'::jsonb,
                $5, 'active', 'PER_QUESTION', NOW(), NOW()
            )
            """,
            pq_quiz_id, trainer_id, inst_id, json.dumps(questions),
            f"PQR-{uuid.uuid4().hex[:6].upper()}",
        )

        pq_start = await QuizRepository.start_or_resume_quiz_attempt(str(pq_quiz_id), student_id)
        assert pq_start["timingState"]["answer_reveal_duration"] == 5
        assert pq_start["timingState"]["timing_mode"] == "PER_QUESTION"


@pytest.mark.asyncio
async def test_performance_classification_and_motivational_feedback():
    """Verifies that:
    1. Brackets validation rejects invalid, overlapping, or gapped brackets.
    2. Boundaries determine correct categories: FAIL, NEED IMPROVEMENT, GOOD, EXCELLENT.
    3. Quiz attempt submission accurately persists score, breakdown, category, and feedback.
    """
    # 1. Validation test
    valid_brackets = {
        "FAIL": [0, 39],
        "NEED_IMPROVEMENT": [40, 59],
        "GOOD": [60, 79],
        "EXCELLENT": [80, 100],
    }
    clean_ranges, clean_messages = validate_performance_classification_settings(valid_brackets)
    assert clean_ranges["FAIL"]["min"] == 0.0
    assert clean_ranges["FAIL"]["max"] == 39.0
    assert clean_ranges["EXCELLENT"]["min"] == 80.0
    assert clean_ranges["EXCELLENT"]["max"] == 100.0

    # Inverted brackets must fail
    with pytest.raises((BusinessRuleViolation, ValidationError)):
        validate_performance_classification_settings({
            "FAIL": [0, 50],
            "NEED_IMPROVEMENT": [40, 60],  # Overlap!
            "GOOD": [61, 79],
            "EXCELLENT": [80, 100],
        })

    # Gap must fail
    with pytest.raises((BusinessRuleViolation, ValidationError)):
        validate_performance_classification_settings({
            "FAIL": [0, 35],
            "NEED_IMPROVEMENT": [40, 59],  # Gap from 36 to 39!
            "GOOD": [60, 79],
            "EXCELLENT": [80, 100],
        })

    # 2. Category determination boundaries
    assert determine_performance_category(0.0, valid_brackets) == "FAIL"
    assert determine_performance_category(39.0, valid_brackets) == "FAIL"
    assert determine_performance_category(39.4, valid_brackets) == "FAIL"
    assert determine_performance_category(40.0, valid_brackets) == "NEED IMPROVEMENT"
    assert determine_performance_category(59.0, valid_brackets) == "NEED IMPROVEMENT"
    assert determine_performance_category(60.0, valid_brackets) == "GOOD"
    assert determine_performance_category(79.0, valid_brackets) == "GOOD"
    assert determine_performance_category(80.0, valid_brackets) == "EXCELLENT"
    assert determine_performance_category(100.0, valid_brackets) == "EXCELLENT"

    # 3. End-to-end Quiz Submission with Category & Motivational Feedback Persistence
    async with get_pg_connection() as conn:
        inst = await conn.fetchrow("SELECT id FROM institutions LIMIT 1")
        trainer = await conn.fetchrow("SELECT id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id, name FROM users WHERE role = 'STUDENT' LIMIT 1")

        inst_id = inst["id"]
        trainer_id = trainer["id"]
        student_id = student["id"]

        quiz_id = uuid.uuid4()
        custom_feedback = {
            "FAIL": "Keep studying, you can do better next time!",
            "NEED_IMPROVEMENT": "Good attempt, practice the tricky questions.",
            "GOOD": "Great work! Solid grasp of concepts.",
            "EXCELLENT": "Top of the class! Phenomenal score!",
        }

        questions = [
            {
                "id": "q1",
                "text": "2 + 2 = ?",
                "options": [{"id": "A", "text": "4"}, {"id": "B", "text": "5"}],
                "correct_options": ["A"],
                "marks": 50,
            },
            {
                "id": "q2",
                "text": "3 + 3 = ?",
                "options": [{"id": "A", "text": "6"}, {"id": "B", "text": "7"}],
                "correct_options": ["A"],
                "marks": 50,
            }
        ]

        await conn.execute(
            """
            INSERT INTO quizzes (
                id, creator_trainer_id, institution_id, title, kind,
                duration_minutes, max_score, allow_retake, questions,
                settings, quiz_code, status, timing_mode, created_at, updated_at
            ) VALUES (
                $1, $2, $3, 'Performance Feedback Test', 'quiz',
                30, 100, false, $4::jsonb,
                $5::jsonb, $6, 'active', 'FIXED_TOTAL', NOW(), NOW()
            )
            """,
            quiz_id, trainer_id, inst_id, json.dumps(questions),
            json.dumps({
                "performance_classification": valid_brackets,
                "motivational_feedback": custom_feedback,
            }),
            f"PFT-{uuid.uuid4().hex[:6].upper()}",
        )

        # Start attempt
        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student_id)

        mock_student_ctx = ScopeContext(
            user_id=str(student_id),
            role=Role.STUDENT,
            college_id=str(inst_id),
            department_id=str(uuid.uuid4()),
            session_id="sess-student-perf",
        )

        # Submit: q1 correct (50 marks), q2 omitted -> 50%
        submit_res = await QuizRepository.submit_quiz_attempt(
            ctx=mock_student_ctx,
            quiz_id=str(quiz_id),
            answers={"q1": "A"},
        )

        assert submit_res["score"] == 50
        assert submit_res["percentage"] == 50.0
        assert submit_res["correctCount"] == 1
        assert submit_res["incorrectCount"] == 0
        assert submit_res["unattemptedCount"] == 1
        assert submit_res["performanceCategory"] == "NEED IMPROVEMENT"
        assert submit_res["motivationalMessage"] == custom_feedback["NEED_IMPROVEMENT"]

        # Verify database record in quiz_attempts table directly
        attempt_row = await conn.fetchrow(
            """
            SELECT performance_category, motivational_message, correct_count, incorrect_count, unattempted_count
            FROM quiz_attempts
            WHERE quiz_id = $1 AND student_user_id = $2
            """,
            quiz_id, student_id,
        )
        assert attempt_row["performance_category"] == "NEED IMPROVEMENT"
        assert attempt_row["motivational_message"] == custom_feedback["NEED_IMPROVEMENT"]
        assert attempt_row["correct_count"] == 1
        assert attempt_row["incorrect_count"] == 0
        assert attempt_row["unattempted_count"] == 1
