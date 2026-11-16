"""Comprehensive Unit and Integration Tests for Mutually Exclusive Assessment Timing Modes.

Verifies:
1. Mode 1: FIXED_TOTAL (Total Quiz Timer)
   - Single continuous countdown
   - No per-question timer leakage
   - Strict lock on answered questions
   - Auto-completion on total time expiration
2. Mode 2: PER_QUESTION (Variable Duration Mode)
   - Dedicated timer per question
   - No total assessment countdown timer leakage
   - Question locking and progression
   - Final question auto-completion
3. Mutual Exclusivity:
   - Simultaneous execution is mathematically and structurally impossible.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone, timedelta
import pytest

from app.db.postgres import get_pg_connection
from app.core.errors import BusinessRuleViolation, Conflict
from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.repositories.assignment_quiz_repo import QuizRepository


@pytest.mark.asyncio
async def test_fixed_total_mode_lifecycle_and_locks():
    """Verifies FIXED_TOTAL mode runs total countdown, suppresses question timer, and locks attempted questions."""
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
            session_id="sess-student-001",
        )

        quiz_id = uuid.uuid4()
        questions = [
            {"id": "q1", "text": "Question 1", "options": [{"id": "A", "text": "Opt A"}], "marks": 1},
            {"id": "q2", "text": "Question 2", "options": [{"id": "B", "text": "Opt B"}], "marks": 1},
        ]

        # 1. Create quiz with timing_mode = FIXED_TOTAL
        await conn.execute(
            """
            INSERT INTO quizzes (
                id, creator_trainer_id, institution_id, title, kind,
                duration_minutes, max_score, allow_retake, questions,
                settings, quiz_code, status, timing_mode, created_at, updated_at
            ) VALUES (
                $1, $2, $3, 'Fixed Total Exam', 'quiz',
                10, 100, false, $4::jsonb,
                '{"timing_mode": "FIXED_TOTAL", "enable_timed_questions": false}'::jsonb,
                $5, 'active', 'FIXED_TOTAL', NOW(), NOW()
            )
            """,
            quiz_id, trainer_id, inst_id, json.dumps(questions), f"FT-{uuid.uuid4().hex[:6].upper()}",
        )

        # 2. Student starts attempt
        res = await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student_id)
        assert res["hasStarted"] is True
        ts = res["timingState"]

        # STRICT ASSERTIONS: FIXED_TOTAL must have total timer, NO question timer
        assert ts["timing_mode"] == "FIXED_TOTAL"
        assert ts["is_timed"] is False
        assert ts["total_duration_seconds"] == 600  # 10 minutes
        assert ts["remaining_seconds"] == 600
        assert ts["overall_remaining_seconds"] == 600
        assert ts["question_remaining_seconds"] is None
        assert ts["question_duration"] is None
        assert ts["phase_remaining_seconds"] is None

        # 3. Save draft answer for Question 1
        save_res = await QuizRepository.save_student_draft_answer(
            ctx=mock_student_ctx,
            quiz_id=str(quiz_id),
            question_id="q1",
            answer="A",
        )
        assert save_res["saved"] is True

        # 4. Verify question state is locked
        timing_after_save = await QuizRepository.get_student_attempt_timing(str(quiz_id), student_id)
        q_states = timing_after_save["timingState"]["question_states"]
        assert "q1" in q_states
        assert q_states["q1"]["is_locked"] is True
        assert q_states["q1"]["selected_answer"] == "A"

        # 5. Attempting to change locked question must raise BusinessRuleViolation
        with pytest.raises(BusinessRuleViolation, match="locked"):
            await QuizRepository.save_student_draft_answer(
                ctx=mock_student_ctx,
                quiz_id=str(quiz_id),
                question_id="q1",
                answer="B",
            )

        # 6. Verify auto-expiration when time exceeds total duration
        st_at = datetime.now(timezone.utc) - timedelta(seconds=605)
        await conn.execute(
            "UPDATE quiz_attempts SET created_at = $1 WHERE quiz_id = $2 AND student_user_id = $3",
            st_at, quiz_id, student_id,
        )
        exp_res = await QuizRepository.get_student_attempt_timing(str(quiz_id), student_id)
        assert exp_res["status"] == "completed"
        assert exp_res["timingState"]["is_completed"] is True


@pytest.mark.asyncio
async def test_per_question_mode_lifecycle_and_auto_advance():
    """Verifies PER_QUESTION mode tracks dedicated question timers, suppresses total timer, and auto-locks."""
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
            session_id="sess-student-002",
        )

        quiz_id = uuid.uuid4()
        questions = [
            {"id": "pq1", "text": "Question 1", "time_limit": 20, "options": [{"id": "A", "text": "Opt A"}], "marks": 1},
            {"id": "pq2", "text": "Question 2", "time_limit": 40, "options": [{"id": "B", "text": "Opt B"}], "marks": 1},
        ]

        # 1. Create quiz with timing_mode = PER_QUESTION
        await conn.execute(
            """
            INSERT INTO quizzes (
                id, creator_trainer_id, institution_id, title, kind,
                duration_minutes, max_score, allow_retake, questions,
                settings, quiz_code, status, timing_mode, created_at, updated_at
            ) VALUES (
                $1, $2, $3, 'Per Question Exam', 'quiz',
                30, 100, false, $4::jsonb,
                '{"timing_mode": "PER_QUESTION", "enable_timed_questions": true, "question_duration": 20}'::jsonb,
                $5, 'active', 'PER_QUESTION', NOW(), NOW()
            )
            """,
            quiz_id, trainer_id, inst_id, json.dumps(questions), f"PQ-{uuid.uuid4().hex[:6].upper()}",
        )

        # 2. Student starts attempt
        res = await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student_id)
        assert res["hasStarted"] is True
        ts = res["timingState"]

        # STRICT ASSERTIONS: PER_QUESTION must have question timer, NO total timer
        assert ts["timing_mode"] == "PER_QUESTION"
        assert ts["is_timed"] is True
        assert ts["total_duration_seconds"] is None
        assert ts["remaining_seconds"] is None
        assert ts["overall_remaining_seconds"] is None
        assert ts["question_limits"] == [20, 40]
        assert ts["current_question_index"] == 0
        assert ts["question_duration"] == 20
        assert ts["question_remaining_seconds"] is not None

        # 3. Simulate passage of time beyond Question 1 (25 seconds elapsed)
        st_at = datetime.now(timezone.utc) - timedelta(seconds=25)
        await conn.execute(
            "UPDATE quiz_attempts SET created_at = $1 WHERE quiz_id = $2 AND student_user_id = $3",
            st_at, quiz_id, student_id,
        )

        # 4. Check timing: must automatically be at Question 2 (index 1)
        res_after = await QuizRepository.get_student_attempt_timing(str(quiz_id), student_id)
        ts_after = res_after["timingState"]
        assert ts_after["current_question_index"] == 1
        assert ts_after["question_duration"] == 40
        # Elapsed 25s, Q1 took 20s, so 5s into Q2 -> remaining ~35s
        assert 33 <= ts_after["question_remaining_seconds"] <= 36

        # 5. Student cannot submit for expired Question 1
        with pytest.raises(BusinessRuleViolation, match="expired|locked"):
            await QuizRepository.save_student_draft_answer(
                ctx=mock_student_ctx,
                quiz_id=str(quiz_id),
                question_id="pq1",
                answer="A",
            )

        # 6. Simulate passage of time beyond all questions (65 seconds elapsed)
        st_at_end = datetime.now(timezone.utc) - timedelta(seconds=65)
        await conn.execute(
            "UPDATE quiz_attempts SET created_at = $1 WHERE quiz_id = $2 AND student_user_id = $3",
            st_at_end, quiz_id, student_id,
        )
        res_end = await QuizRepository.get_student_attempt_timing(str(quiz_id), student_id)
        assert res_end["status"] == "completed"
        assert res_end["timingState"]["is_completed"] is True


@pytest.mark.asyncio
async def test_mutual_exclusivity_guarantee():
    """Confirms that under NO circumstances can both timers run or report data simultaneously."""
    async with get_pg_connection() as conn:
        inst = await conn.fetchrow("SELECT id FROM institutions LIMIT 1")
        trainer = await conn.fetchrow("SELECT id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        inst_id = inst["id"]
        trainer_id = trainer["id"]
        student_id = student["id"]

        q_fixed_id = uuid.uuid4()
        q_per_id = uuid.uuid4()

        questions = [{"id": "mx1", "text": "Question MX", "options": [{"id": "A", "text": "A"}], "marks": 1}]

        # Create both types
        await conn.execute(
            """
            INSERT INTO quizzes (id, creator_trainer_id, institution_id, title, kind, duration_minutes, max_score, allow_retake, questions, settings, quiz_code, status, timing_mode, created_at, updated_at)
            VALUES
            ($1, $3, $4, 'Quiz Fixed', 'quiz', 15, 100, false, $5::jsonb, '{"timing_mode": "FIXED_TOTAL"}'::jsonb, $6, 'active', 'FIXED_TOTAL', NOW(), NOW()),
            ($2, $3, $4, 'Quiz PerQ', 'quiz', 15, 100, false, $5::jsonb, '{"timing_mode": "PER_QUESTION", "question_duration": 45}'::jsonb, $7, 'active', 'PER_QUESTION', NOW(), NOW())
            """,
            q_fixed_id, q_per_id, trainer_id, inst_id, json.dumps(questions),
            f"MXF-{uuid.uuid4().hex[:6].upper()}", f"MXP-{uuid.uuid4().hex[:6].upper()}"
        )

        # Query Fixed: question timer MUST be None
        t_fixed = (await QuizRepository.get_student_attempt_timing(str(q_fixed_id), student_id))["timingState"]
        assert t_fixed["timing_mode"] == "FIXED_TOTAL"
        assert t_fixed["remaining_seconds"] is not None
        assert t_fixed["question_remaining_seconds"] is None
        assert t_fixed["question_duration"] is None
        assert t_fixed["phase_remaining_seconds"] is None

        # Query Per-Question: total timer MUST be None
        t_per = (await QuizRepository.get_student_attempt_timing(str(q_per_id), student_id))["timingState"]
        assert t_per["timing_mode"] == "PER_QUESTION"
        assert t_per["remaining_seconds"] is None
        assert t_per["total_duration_seconds"] is None
        assert t_per["overall_remaining_seconds"] is None
        assert t_per["question_remaining_seconds"] is not None
        assert t_per["question_duration"] == 45
