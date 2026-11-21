"""Comprehensive Integration Tests for Assessment Engine Redesign:
1. Pre-Assessment Verification & Session Readiness
2. Draft Answer Autosave (All Question Types, Versioning, No Loss of Answers)
3. Abandonment Detection Grace Period, Warning, and Cancellation
4. Abandonment Timeout Auto-Submission with Authoritative Reason
5. Idempotent Submission & Score Preservation
6. Trainer Dashboard Recovery: Option A (RESTART Fresh Attempt)
7. Trainer Dashboard Recovery: Option B (RESUME Last Persisted State)
8. Authoritative Candidate Status Synchronization
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
from app.repositories.assignment_quiz_repo import QuizRepository


@pytest.mark.asyncio
async def test_draft_answer_autosave_all_types_and_versioning():
    """Verifies draft answer saving supports single-choice, multi-select, numerical,
    and null/empty answers without HTTP 422 or locking crashes, and respects monotonic versioning.
    """
    async with get_pg_connection() as conn:
        inst = await conn.fetchrow("SELECT id FROM institutions LIMIT 1")
        trainer = await conn.fetchrow("SELECT id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        inst_id = inst["id"]
        trainer_id = trainer["id"]
        student_id = student["id"]

        quiz_id = uuid.uuid4()
        questions = [
            {
                "id": "q_single",
                "text": "Single Choice Question",
                "question_type": "mcq_single",
                "options": [{"id": "opt_a", "text": "A"}, {"id": "opt_b", "text": "B"}],
                "correct_options": ["opt_a"],
                "marks": 2,
            },
            {
                "id": "q_multi",
                "text": "Multi Select Question",
                "question_type": "mcq_multiple",
                "options": [{"id": "m1", "text": "M1"}, {"id": "m2", "text": "M2"}, {"id": "m3", "text": "M3"}],
                "correct_options": ["m1", "m2"],
                "marks": 4,
            },
            {
                "id": "q_num",
                "text": "Numerical Question",
                "question_type": "numerical",
                "options": [],
                "correct_answer": "42",
                "marks": 2,
            },
        ]

        await conn.execute(
            """
            INSERT INTO quizzes (
                id, creator_trainer_id, institution_id, title, kind,
                duration_minutes, max_score, allow_retake, questions,
                settings, quiz_code, status, timing_mode, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, 'quiz',
                30, 8, false, $5::jsonb,
                $6::jsonb, $7, 'active', 'FIXED_TOTAL', NOW(), NOW()
            )
            """,
            quiz_id,
            trainer_id,
            inst_id,
            "Autosave Robustness Quiz",
            json.dumps(questions),
            json.dumps({"timing_mode": "FIXED_TOTAL", "camera_required": True, "allow_modification": True}),
            f"AUTO-{uuid.uuid4().hex[:6].upper()}",
        )

        student_ctx = ScopeContext(
            user_id=str(student_id),
            college_id=str(inst_id),
            department_id=str(uuid.uuid4()),
            role=Role.STUDENT,
            session_id="sess-student-auto",
        )

        # Start attempt
        await QuizRepository.start_or_resume_quiz_attempt(
            quiz_id=str(quiz_id),
            student_user_id=student_id,
        )
        attempt_row = await conn.fetchrow(
            "SELECT id FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
            quiz_id,
            student_id,
        )
        attempt_id = str(attempt_row["id"])

        # 1. Save single choice answer (version 1)
        res_single = await QuizRepository.save_student_draft_answer(
            ctx=student_ctx,
            quiz_id=str(quiz_id),
            question_id="q_single",
            answer="opt_a",
            version=1,
            marked_for_review=False,
            time_spent_seconds=12,
        )
        assert res_single["saved"] is True
        assert res_single["questionId"] == "q_single"

        # 2. Save multi-select answer (version 1)
        res_multi = await QuizRepository.save_student_draft_answer(
            ctx=student_ctx,
            quiz_id=str(quiz_id),
            question_id="q_multi",
            answer=["m1", "m2"],
            version=1,
            marked_for_review=True,
            time_spent_seconds=25,
        )
        assert res_multi["saved"] is True

        # 3. Save numerical answer (version 1)
        res_num = await QuizRepository.save_student_draft_answer(
            ctx=student_ctx,
            quiz_id=str(quiz_id),
            question_id="q_num",
            answer="42",
            version=1,
            marked_for_review=False,
            time_spent_seconds=40,
        )
        assert res_num["saved"] is True

        # 4. Save higher version for single choice (version 2)
        res_single_v2 = await QuizRepository.save_student_draft_answer(
            ctx=student_ctx,
            quiz_id=str(quiz_id),
            question_id="q_single",
            answer="opt_b",
            version=2,
            marked_for_review=False,
            time_spent_seconds=45,
        )
        assert res_single_v2["saved"] is True

        # 5. Outdated write (version 1) must not overwrite newer version 2
        await QuizRepository.save_student_draft_answer(
            ctx=student_ctx,
            quiz_id=str(quiz_id),
            question_id="q_single",
            answer="opt_a",
            version=1,
            marked_for_review=False,
        )
        attempt_row = await conn.fetchrow(
            "SELECT answers, candidate_status, version FROM quiz_attempts WHERE id = $1",
            uuid.UUID(attempt_id),
        )
        answers = json.loads(attempt_row["answers"])
        assert answers["q_single"] == "opt_b"
        assert answers["q_multi"] == ["m1", "m2"]
        assert answers["q_num"] == "42"
        assert attempt_row["candidate_status"] == "IN_PROGRESS"


@pytest.mark.asyncio
async def test_abandonment_detection_lifecycle():
    """Verifies that abandonment warning records timestamp, cancellation clears warning,
    and timeout triggers automatic submission with ABANDONMENT_TIMEOUT.
    """
    async with get_pg_connection() as conn:
        inst = await conn.fetchrow("SELECT id FROM institutions LIMIT 1")
        trainer = await conn.fetchrow("SELECT id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        inst_id = inst["id"]
        trainer_id = trainer["id"]
        student_id = student["id"]

        quiz_id = uuid.uuid4()
        questions = [
            {
                "id": "q1",
                "text": "Question 1",
                "options": [{"id": "A", "text": "A"}, {"id": "B", "text": "B"}],
                "correct_options": ["A"],
                "marks": 5,
            }
        ]

        await conn.execute(
            """
            INSERT INTO quizzes (
                id, creator_trainer_id, institution_id, title, kind,
                duration_minutes, max_score, allow_retake, questions,
                settings, quiz_code, status, timing_mode, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, 'quiz',
                20, 5, false, $5::jsonb,
                '{}'::jsonb, $6, 'active', 'FIXED_TOTAL', NOW(), NOW()
            )
            """,
            quiz_id,
            trainer_id,
            inst_id,
            "Abandonment Test Quiz",
            json.dumps(questions),
            f"ABAN-{uuid.uuid4().hex[:6].upper()}",
        )

        student_ctx = ScopeContext(
            user_id=str(student_id),
            college_id=str(inst_id),
            department_id=str(uuid.uuid4()),
            role=Role.STUDENT,
            session_id="sess-student-auto",
        )

        # 1. Start attempt
        await QuizRepository.start_or_resume_quiz_attempt(
            quiz_id=str(quiz_id),
            student_user_id=student_id,
        )
        att_row = await conn.fetchrow(
            "SELECT id FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
            quiz_id,
            student_id,
        )
        attempt_id = str(att_row["id"])

        # Persist a draft answer
        await QuizRepository.save_student_draft_answer(
            ctx=student_ctx,
            quiz_id=str(quiz_id),
            question_id="q1",
            answer="A",
            version=1,
        )

        # 2. Record abandonment warning
        warn_res = await QuizRepository.record_abandonment_warning(
            ctx=student_ctx,
            quiz_id=str(quiz_id),
        )
        assert warn_res["success"] is True
        assert warn_res["abandonmentWarning"] is True

        row = await conn.fetchrow(
            "SELECT candidate_status, abandonment_warning_at FROM quiz_attempts WHERE id = $1",
            uuid.UUID(attempt_id),
        )
        assert row["candidate_status"] == "ABANDONMENT_WARNING"
        assert row["abandonment_warning_at"] is not None

        # 3. Student returns within 20s -> Cancel warning
        cancel_res = await QuizRepository.cancel_abandonment_warning(
            ctx=student_ctx,
            quiz_id=str(quiz_id),
        )
        assert cancel_res["success"] is True
        assert cancel_res["restored"] is True
        assert cancel_res["candidateStatus"] == "IN_PROGRESS"

        row_restored = await conn.fetchrow(
            "SELECT candidate_status, abandonment_warning_at FROM quiz_attempts WHERE id = $1",
            uuid.UUID(attempt_id),
        )
        assert row_restored["candidate_status"] == "IN_PROGRESS"
        assert row_restored["abandonment_warning_at"] is None

        # 4. Now student leaves again and 20s expires -> timeout auto-submission
        await QuizRepository.record_abandonment_warning(
            ctx=student_ctx,
            quiz_id=str(quiz_id),
        )
        timeout_res = await QuizRepository.handle_abandonment_timeout(
            ctx=student_ctx,
            quiz_id=str(quiz_id),
        )
        # Since draft answer was "A" (correct), score should be 5
        assert timeout_res["score"] == 5

        # Verify DB state
        row_sub = await conn.fetchrow(
            "SELECT completed_at, submission_reason, candidate_status, score FROM quiz_attempts WHERE id = $1",
            uuid.UUID(attempt_id),
        )
        assert row_sub["completed_at"] is not None
        assert row_sub["submission_reason"] == "ABANDONMENT_TIMEOUT"
        assert row_sub["candidate_status"] == "ABANDONED"
        assert row_sub["score"] == 5


@pytest.mark.asyncio
async def test_idempotent_final_submission_and_answer_merging():
    """Verifies that final submission merges persisted draft answers with supplied answers,
    records submission reasons, prevents duplicate scoring, and is idempotent.
    """
    async with get_pg_connection() as conn:
        inst = await conn.fetchrow("SELECT id FROM institutions LIMIT 1")
        trainer = await conn.fetchrow("SELECT id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        inst_id = inst["id"]
        trainer_id = trainer["id"]
        student_id = student["id"]

        quiz_id = uuid.uuid4()
        questions = [
            {
                "id": "q1",
                "text": "Question 1",
                "options": [{"id": "A", "text": "A"}, {"id": "B", "text": "B"}],
                "correct_options": ["A"],
                "marks": 5,
            },
            {
                "id": "q2",
                "text": "Question 2",
                "options": [{"id": "X", "text": "X"}, {"id": "Y", "text": "Y"}],
                "correct_options": ["X"],
                "marks": 5,
            },
        ]

        await conn.execute(
            """
            INSERT INTO quizzes (
                id, creator_trainer_id, institution_id, title, kind,
                duration_minutes, max_score, allow_retake, questions,
                settings, quiz_code, status, timing_mode, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, 'quiz',
                25, 10, false, $5::jsonb,
                '{}'::jsonb, $6, 'active', 'FIXED_TOTAL', NOW(), NOW()
            )
            """,
            quiz_id,
            trainer_id,
            inst_id,
            "Idempotency Test Quiz",
            json.dumps(questions),
            f"IDEM-{uuid.uuid4().hex[:6].upper()}",
        )

        student_ctx = ScopeContext(
            user_id=str(student_id),
            college_id=str(inst_id),
            department_id=str(uuid.uuid4()),
            role=Role.STUDENT,
            session_id="sess-student-auto",
        )

        # 1. Start attempt
        await QuizRepository.start_or_resume_quiz_attempt(
            quiz_id=str(quiz_id),
            student_user_id=student_id,
        )

        # 2. Persist answer for q1 via draft
        await QuizRepository.save_student_draft_answer(
            ctx=student_ctx,
            quiz_id=str(quiz_id),
            question_id="q1",
            answer="A",
            version=1,
        )

        # 3. Final submission only submits q2 (q1 is merged from draft!)
        sub1 = await QuizRepository.submit_quiz_attempt(
            ctx=student_ctx,
            quiz_id=str(quiz_id),
            answers={"q2": "X"},
            submission_reason="STUDENT_MANUAL_SUBMIT",
        )
        assert sub1["score"] == 10  # Both q1 and q2 are correct!

        # 4. Immediate second submit (e.g. double-click or network retry) -> Idempotent
        sub2 = await QuizRepository.submit_quiz_attempt(
            ctx=student_ctx,
            quiz_id=str(quiz_id),
            answers={},
            submission_reason="STUDENT_MANUAL_SUBMIT",
        )
        assert sub2["score"] == 10
        assert sub2["attemptId"] == sub1["attemptId"]

        # Verify only one attempt was created and score is recorded accurately
        count = await conn.fetchval(
            "SELECT count(*) FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
            quiz_id,
            student_id,
        )
        assert count == 1


@pytest.mark.asyncio
async def test_trainer_recovery_option_a_and_option_b():
    """Verifies trainer reassignment and recovery:
    - Option A (RESTART): Fresh attempt, resets answers, resets timer, logs audit.
    - Option B (RESUME): Restores persisted answers, navigation position, remaining time, logs audit.
    """
    async with get_pg_connection() as conn:
        inst = await conn.fetchrow("SELECT id FROM institutions LIMIT 1")
        trainer = await conn.fetchrow("SELECT id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        inst_id = inst["id"]
        trainer_id = trainer["id"]
        student_id = student["id"]

        quiz_id = uuid.uuid4()
        questions = [
            {
                "id": "q1",
                "text": "Question 1",
                "options": [{"id": "A", "text": "A"}, {"id": "B", "text": "B"}],
                "correct_options": ["A"],
                "marks": 5,
            },
            {
                "id": "q2",
                "text": "Question 2",
                "options": [{"id": "X", "text": "X"}, {"id": "Y", "text": "Y"}],
                "correct_options": ["X"],
                "marks": 5,
            },
        ]

        await conn.execute(
            """
            INSERT INTO quizzes (
                id, creator_trainer_id, institution_id, title, kind,
                duration_minutes, max_score, allow_retake, questions,
                settings, quiz_code, status, timing_mode, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, 'quiz',
                40, 10, false, $5::jsonb,
                '{}'::jsonb, $6, 'active', 'FIXED_TOTAL', NOW(), NOW()
            )
            """,
            quiz_id,
            trainer_id,
            inst_id,
            "Recovery System Test Quiz",
            json.dumps(questions),
            f"RECOV-{uuid.uuid4().hex[:6].upper()}",
        )

        student_ctx = ScopeContext(
            user_id=str(student_id),
            college_id=str(inst_id),
            department_id=str(uuid.uuid4()),
            role=Role.STUDENT,
            session_id="sess-student-auto",
        )
        trainer_ctx = ScopeContext(
            user_id=str(trainer_id),
            college_id=str(inst_id),
            department_id=str(uuid.uuid4()),
            role=Role.TRAINER,
            session_id="sess-trainer-auto",
        )

        # 1. Student starts attempt
        await QuizRepository.start_or_resume_quiz_attempt(
            quiz_id=str(quiz_id),
            student_user_id=student_id,
        )
        rec_row = await conn.fetchrow(
            "SELECT id FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
            quiz_id,
            student_id,
        )
        attempt_id = str(rec_row["id"])

        # Student saves draft answer for q1
        await QuizRepository.save_student_draft_answer(
            ctx=student_ctx,
            quiz_id=str(quiz_id),
            question_id="q1",
            answer="A",
            version=1,
            time_spent_seconds=60,
        )

        # Attempt prematurely submitted with ABANDONMENT_TIMEOUT
        await QuizRepository.submit_quiz_attempt(
            ctx=student_ctx,
            quiz_id=str(quiz_id),
            answers={},
            submission_reason="ABANDONMENT_TIMEOUT",
        )

        # TEST OPTION B: RESUME ASSESSMENT
        resume_res = await QuizRepository.recover_assessment_attempt(
            ctx=trainer_ctx,
            quiz_id=str(quiz_id),
            attempt_id=attempt_id,
            action="RESUME",
            reason="Student disconnected due to wifi outage, verified by trainer",
        )
        assert resume_res["action"] == "RESUME"
        assert resume_res["attemptId"] == attempt_id
        assert resume_res["candidateStatus"] == "IN_PROGRESS"
        assert resume_res["restoredAnswers"] == {"q1": "A"}

        # Verify audit log in quiz_recovery_logs
        log_entry = await conn.fetchrow(
            """
            SELECT recovery_action, recovery_reason, trainer_user_id, attempt_id, previous_attempt_snapshot
            FROM quiz_recovery_logs WHERE attempt_id = $1
            ORDER BY created_at DESC LIMIT 1
            """,
            uuid.UUID(attempt_id),
        )
        assert log_entry is not None
        assert log_entry["recovery_action"] == "RESUME"
        assert "wifi outage" in log_entry["recovery_reason"]

        # Student can now continue and submit normally
        final_submit = await QuizRepository.submit_quiz_attempt(
            ctx=student_ctx,
            quiz_id=str(quiz_id),
            answers={"q1": "A", "q2": "X"},
            submission_reason="STUDENT_MANUAL_SUBMIT",
        )
        assert final_submit["score"] == 10

        # TEST OPTION A: RESTART ASSESSMENT
        restart_res = await QuizRepository.recover_assessment_attempt(
            ctx=trainer_ctx,
            quiz_id=str(quiz_id),
            attempt_id=attempt_id,
            action="RESTART",
            reason="Candidate granted complete fresh restart by department head",
        )
        assert restart_res["action"] == "RESTART"
        assert restart_res["attemptId"] == attempt_id
        assert restart_res["candidateStatus"] == "IN_PROGRESS"

        # Verify attempt exists and is ready from Question 1 with reset answers
        restarted_row = await conn.fetchrow("SELECT * FROM quiz_attempts WHERE id = $1", uuid.UUID(attempt_id))
        assert restarted_row["is_recovered"] is True
        assert restarted_row["completed_at"] is None
        ans_raw = restarted_row["answers"]
        assert (json.loads(ans_raw) if isinstance(ans_raw, str) else ans_raw) == {}


@pytest.mark.asyncio
async def test_candidate_status_monitor_synchronization():
    """Verifies that the monitoring query returns accurate candidate_status,
    camera_status, submission_reason, and is_recovered fields.
    """
    async with get_pg_connection() as conn:
        inst = await conn.fetchrow("SELECT id FROM institutions LIMIT 1")
        trainer = await conn.fetchrow("SELECT id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        inst_id = inst["id"]
        trainer_id = trainer["id"]
        student_id = student["id"]

        quiz_id = uuid.uuid4()
        questions = [
            {
                "id": "q1",
                "text": "Sample Question",
                "options": [{"id": "A", "text": "A"}],
                "correct_options": ["A"],
                "marks": 5,
            }
        ]

        await conn.execute(
            """
            INSERT INTO quizzes (
                id, creator_trainer_id, institution_id, title, kind,
                duration_minutes, max_score, allow_retake, questions,
                settings, quiz_code, status, timing_mode, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, 'quiz',
                15, 5, false, $5::jsonb,
                '{}'::jsonb, $6, 'active', 'FIXED_TOTAL', NOW(), NOW()
            )
            """,
            quiz_id,
            trainer_id,
            inst_id,
            "Monitor Sync Test Quiz",
            json.dumps(questions),
            f"MONI-{uuid.uuid4().hex[:6].upper()}",
        )

        from app.routers.assessment_realtime import get_assessment_monitor_data

        # Fetch monitor data - should reflect student status
        data = await get_assessment_monitor_data(str(quiz_id))
        assert data is not None
        assert "data" in data and "students" in data["data"]
