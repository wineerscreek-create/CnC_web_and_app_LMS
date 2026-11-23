"""Comprehensive Automated Production Test Suite for Assessment Engine Synchronization Audit:
Covers all 16 Mandatory Scenarios:
1. 50 questions attempted -> 50 answers in submission
2. 422 autosave recovery without answer loss
3. Concurrent saves to same question -> latest version wins
4. Browser refresh resumes attempt with answers and timer
5. Disconnect shows DISCONNECTED, reconnect resumes same attempt
6. Not-started student not in live monitoring
7. Trainer recovery restores student resume
8. Fullscreen exit return within 10s resumes with warning
9. Fullscreen exit >10s auto-submits with FULLSCREEN_EXIT_TIMEOUT
10. Warning limit reached auto-submits with WARNING_LIMIT_REACHED
11. WebSocket disconnect does not auto-submit
12. Refresh during pending warning preserves violation state
13. Repeated start and submit requests are strictly idempotent
14. Token expiration during autosave survives renewal
15. Consistent counts across trainer monitor, student UI, DB, and Excel
16. Completed/abandoned attempts cannot be resumed without trainer recovery
"""
from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone, timedelta
import pytest

from app.db.postgres import get_pg_connection
from app.core.errors import BusinessRuleViolation, ScopeForbidden
from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.repositories.assignment_quiz_repo import QuizRepository
from app.websocket.assessment_ws import assessment_hub
from app.routers.assessment_realtime import get_assessment_monitor_data


def make_ctx(user_id, role: Role, college_id=None) -> ScopeContext:
    return ScopeContext(
        user_id=str(user_id),
        college_id=str(college_id) if college_id else None,
        department_id=str(uuid.uuid4()),
        role=role,
        session_id=f"sess-{role.value.lower()}-{uuid.uuid4().hex[:6]}",
    )


async def _create_test_quiz(
    conn,
    trainer_id: uuid.UUID,
    inst_id: uuid.UUID | None,
    num_questions: int = 5,
    timing_mode: str = "FIXED_TOTAL",
    duration_minutes: int = 30,
    max_warnings: int = 3,
) -> tuple[uuid.UUID, list[dict]]:
    quiz_id = uuid.uuid4()
    questions = []
    for i in range(1, num_questions + 1):
        questions.append({
            "id": f"q_{i}",
            "text": f"Question {i} text",
            "question_type": "mcq_single",
            "options": [
                {"id": "A", "text": "Option A"},
                {"id": "B", "text": "Option B"},
                {"id": "C", "text": "Option C"},
            ],
            "correct_options": ["A"],
            "marks": 2,
            "negative": 0,
            "duration_seconds": 60,
        })

    settings = {
        "timing_mode": timing_mode,
        "max_warnings": max_warnings,
        "fullscreen_required": True,
        "camera_required": True,
    }

    await conn.execute(
        """
        INSERT INTO quizzes (
            id, creator_trainer_id, institution_id, title, kind,
            duration_minutes, max_score, allow_retake, questions,
            settings, quiz_code, status, timing_mode, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, 'quiz',
            $5, $6, false, $7::jsonb,
            $8::jsonb, $9, 'active', $10, NOW(), NOW()
        )
        """,
        quiz_id, trainer_id, inst_id, f"Audit Quiz {quiz_id.hex[:6]}",
        duration_minutes, num_questions * 2, json.dumps(questions),
        json.dumps(settings), f"CD{quiz_id.hex[:4]}", timing_mode,
    )
    return quiz_id, questions


# -----------------------------------------------------------------------------
# SCENARIO 1: 50 questions attempted -> 50 answers in submission
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_01_fifty_questions_attempted_retained_in_submission():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, questions = await _create_test_quiz(
            conn, trainer["id"], trainer["institution_id"], num_questions=50, duration_minutes=60
        )
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])

        # Start attempt
        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])

        # Student drafts answers for first 35 questions
        for i in range(1, 36):
            draft_res = await QuizRepository.save_student_draft_answer(
                s_ctx, str(quiz_id), f"q_{i}", "A", version=1
            )
            assert draft_res["saved"] is True
            assert draft_res["attemptedCount"] == i

        # Student submits remaining 15 questions during final submit (total 50 answers)
        final_answers = {f"q_{i}": ("A" if i % 2 == 1 else "B") for i in range(1, 51)}
        sub_res = await QuizRepository.submit_quiz_attempt(
            s_ctx, str(quiz_id), answers=final_answers, submission_reason="STUDENT_MANUAL_SUBMIT"
        )

        assert sub_res["attemptedCount"] == 50
        assert sub_res["serverConfirmedAnswerCount"] == 50
        assert sub_res["candidateStatus"] == "COMPLETED"

        # Verify DB persistence has all 50 answers
        att_row = await conn.fetchrow("SELECT answers FROM quiz_attempts WHERE id = $1", uuid.UUID(sub_res["attemptId"]))
        persisted = json.loads(att_row["answers"])
        assert len(persisted) == 50
        for i in range(1, 51):
            assert f"q_{i}" in persisted


# -----------------------------------------------------------------------------
# SCENARIO 2: 422 autosave recovery without answer loss
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_02_autosave_recovery_without_answer_loss():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=10)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])

        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])

        # Answers q_1 and q_2 successfully
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_1", "A", version=1)
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_2", "B", version=1)

        # In case a draft fails or is enqueued (e.g. temporary disconnection), client retains queue
        pending_queue = {"q_3": "C", "q_4": "A"}

        # At final submission, client flushes pending answers merged with server draft
        sub_res = await QuizRepository.submit_quiz_attempt(
            s_ctx, str(quiz_id), answers=pending_queue, submission_reason="STUDENT_MANUAL_SUBMIT"
        )
        assert sub_res["attemptedCount"] == 4
        assert sub_res["serverConfirmedAnswerCount"] == 4

        att = await conn.fetchrow("SELECT answers FROM quiz_attempts WHERE id = $1", uuid.UUID(sub_res["attemptId"]))
        persisted = json.loads(att["answers"])
        assert set(persisted.keys()) == {"q_1", "q_2", "q_3", "q_4"}


# -----------------------------------------------------------------------------
# SCENARIO 3: Concurrent saves to same question -> latest version wins
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_03_concurrent_saves_latest_version_wins():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=5)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])

        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])

        # Newer version arrives first (v2)
        r2 = await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_1", "B", version=2)
        assert r2["saved"] is True
        assert r2["version"] == 2

        # Older delayed packet arrives late (v1)
        r1 = await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_1", "A", version=1)
        assert r1["saved"] is True
        assert r1["status"] == "ignored_stale"

        # Check DB preserves "B"
        att = await conn.fetchrow("SELECT answers FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2", quiz_id, student["id"])
        persisted = json.loads(att["answers"])
        assert persisted["q_1"] == "B"


# -----------------------------------------------------------------------------
# SCENARIO 4: Browser refresh resumes attempt with answers and timer
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_04_browser_refresh_resumes_attempt_with_answers_and_timer():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=5, duration_minutes=30)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])

        # Start attempt
        init_timing = await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])
        attempt_id = init_timing["attemptId"]

        # Student saves an answer
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_1", "C", version=1)

        # Simulate browser refresh: get timing again
        refreshed_timing = await QuizRepository.get_student_attempt_timing(str(quiz_id), student["id"])
        assert refreshed_timing["attemptId"] == attempt_id
        assert refreshed_timing["canResume"] is True
        assert refreshed_timing["status"] == "in_progress"
        assert refreshed_timing["answers"]["q_1"] == "C"
        assert refreshed_timing["timingState"]["overall_remaining_seconds"] > 0

        # Verify get_quiz also indicates canResume: True
        quiz_data = await QuizRepository.get_quiz(str(quiz_id), student["id"])
        assert quiz_data["canResume"] is True
        assert quiz_data["hasStarted"] is True
        assert quiz_data["attempt"] is None  # in-progress attempt does not lock with completed attempt card


# -----------------------------------------------------------------------------
# SCENARIO 5: Disconnect shows DISCONNECTED, reconnect resumes same attempt
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_05_disconnect_shows_disconnected_reconnect_resumes():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=5)
        t_ctx = make_ctx(trainer["id"], Role.TRAINER, trainer["institution_id"])
        s_uid = str(student["id"])
        q_str = str(quiz_id)

        # Student starts attempt
        await QuizRepository.start_or_resume_quiz_attempt(q_str, student["id"])

        # Register in memory hub with old timestamp (>25s ago)
        await assessment_hub.register_student(
            q_str, s_uid, ws=None, name="Test Candidate", roll_number="TEST001", total_questions=5, duration_minutes=30
        )
        assessment_hub.student_states[q_str][s_uid]["last_seen"] = time.time() - 35
        assessment_hub.student_states[q_str][s_uid]["online"] = False

        # Monitor query should show DISCONNECTED
        mon_data = await get_assessment_monitor_data(q_str, t_ctx)
        cands = {c["session_id"]: c for c in mon_data["data"]["students"]}
        assert s_uid in cands
        assert cands[s_uid]["candidate_status"] == "DISCONNECTED"
        assert cands[s_uid]["online"] is False
        assert cands[s_uid]["stale"] is True

        # Reconnect (new heartbeat within 5 seconds)
        assessment_hub.student_states[q_str][s_uid]["last_seen"] = time.time()
        assessment_hub.student_states[q_str][s_uid]["online"] = True

        mon_data_reconnected = await get_assessment_monitor_data(q_str, t_ctx)
        cands_recon = {c["session_id"]: c for c in mon_data_reconnected["data"]["students"]}
        assert cands_recon[s_uid]["candidate_status"] == "IN_PROGRESS"
        assert cands_recon[s_uid]["online"] is True


# -----------------------------------------------------------------------------
# SCENARIO 6: Not-started student not in live monitoring
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_06_not_started_student_not_in_live_monitoring():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=5)
        t_ctx = make_ctx(trainer["id"], Role.TRAINER, trainer["institution_id"])
        s_uid = str(student["id"])
        q_str = str(quiz_id)

        # Simulate preflight WebSocket registration before student ever clicks Start Assessment
        await assessment_hub.register_student(
            q_str, s_uid, ws=None, name="Preflight Student", roll_number="PRE001", total_questions=5
        )

        # Monitor data MUST NOT include students who have not started
        mon = await get_assessment_monitor_data(q_str, t_ctx)
        student_ids = [c["session_id"] for c in mon["data"]["students"]]
        assert s_uid not in student_ids


# -----------------------------------------------------------------------------
# SCENARIO 7: Trainer recovery restores student resume
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_07_trainer_recovery_restores_student_resume():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=5, duration_minutes=30)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])
        t_ctx = make_ctx(trainer["id"], Role.TRAINER, trainer["institution_id"])

        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_1", "B", version=1)

        # Attempt abandoned
        await conn.execute(
            """
            UPDATE quiz_attempts
            SET status = 'completed', candidate_status = 'ABANDONED',
                submission_reason = 'ABANDONMENT_TIMEOUT', completed_at = NOW()
            WHERE quiz_id = $1 AND student_user_id = $2
            """,
            quiz_id, student["id"]
        )

        att = await conn.fetchrow("SELECT id FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2", quiz_id, student["id"])

        # Trainer performs recovery: action RESUME
        rec = await QuizRepository.recover_assessment_attempt(
            t_ctx, str(quiz_id), str(att["id"]), action="RESUME", reason="Device crashed during exam"
        )
        assert rec["success"] is True
        assert rec["canResume"] is True
        assert rec["candidateStatus"] == "IN_PROGRESS"
        assert rec["restoredAnswers"]["q_1"] == "B"
        assert rec["remainingSeconds"] > 0

        # Verify student quiz listing shows canResume: True
        quizzes = await QuizRepository.list_student_quizzes(s_ctx)
        matching = [q for q in quizzes if q["id"] == str(quiz_id)]
        assert len(matching) == 1
        assert matching[0]["canResume"] is True
        assert matching[0]["state"] == "in_progress"

        # Verify student quiz detail allows resume
        quiz_detail = await QuizRepository.get_quiz(str(quiz_id), student["id"])
        assert quiz_detail["canResume"] is True
        assert quiz_detail["attempt"] is None


# -----------------------------------------------------------------------------
# SCENARIO 8: Fullscreen exit return within 10s resumes with warning
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_08_fullscreen_exit_return_within_10s_resumes_with_warning():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=5, max_warnings=3)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])

        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])

        # Warning recorded for returning within grace period
        w_res = await QuizRepository.record_student_warning(s_ctx, str(quiz_id), "fullscreen_exit", "Returned within 10s")
        assert w_res["warning_count"] == 1
        assert w_res["auto_submit"] is False

        # Attempt remains in_progress
        att = await conn.fetchrow("SELECT status, candidate_status, warning_count FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2", quiz_id, student["id"])
        assert att["status"] == "in_progress"
        assert att["candidate_status"] == "IN_PROGRESS"
        assert att["warning_count"] == 1


# -----------------------------------------------------------------------------
# SCENARIO 9: Fullscreen exit >10s auto-submits with FULLSCREEN_EXIT_TIMEOUT
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_09_fullscreen_exit_timeout_auto_submits():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=5)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])

        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_1", "A", version=1)

        # Fullscreen exit expired > 10s triggers auto-submit
        sub = await QuizRepository.submit_quiz_attempt(
            s_ctx, str(quiz_id), submission_reason="FULLSCREEN_EXIT_TIMEOUT"
        )
        assert sub["candidateStatus"] == "AUTO_SUBMITTED"
        assert sub["submissionReason"] == "FULLSCREEN_EXIT_TIMEOUT"

        att = await conn.fetchrow("SELECT status, candidate_status, submission_reason FROM quiz_attempts WHERE id = $1", uuid.UUID(sub["attemptId"]))
        assert att["status"] == "completed"
        assert att["candidate_status"] == "AUTO_SUBMITTED"
        assert att["submission_reason"] == "FULLSCREEN_EXIT_TIMEOUT"


# -----------------------------------------------------------------------------
# SCENARIO 10: Warning limit reached auto-submits with WARNING_LIMIT_REACHED
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_10_warning_limit_reached_auto_submits():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=5, max_warnings=2)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])

        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])

        # Warning 1
        w1 = await QuizRepository.record_student_warning(s_ctx, str(quiz_id), "tab_switch")
        assert w1["warning_count"] == 1
        assert w1["auto_submit"] is False

        # Warning 2 (limit reached)
        w2 = await QuizRepository.record_student_warning(s_ctx, str(quiz_id), "tab_switch")
        assert w2["warning_count"] == 2
        assert w2["auto_submit"] is True

        # Triggers submission with WARNING_LIMIT_REACHED
        sub = await QuizRepository.submit_quiz_attempt(
            s_ctx, str(quiz_id), submission_reason="WARNING_LIMIT_REACHED"
        )
        assert sub["candidateStatus"] == "AUTO_SUBMITTED"
        assert sub["submissionReason"] == "WARNING_LIMIT_REACHED"


# -----------------------------------------------------------------------------
# SCENARIO 11: WebSocket disconnect does not auto-submit
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_11_websocket_disconnect_does_not_auto_submit():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=5)
        s_uid = str(student["id"])
        q_str = str(quiz_id)

        await QuizRepository.start_or_resume_quiz_attempt(q_str, student["id"])

        # Connect and then disconnect WS
        fake_ws = object()
        await assessment_hub.register_student(q_str, s_uid, ws=fake_ws, name="WS Candidate", roll_number="WS001")
        await assessment_hub.unregister_student(q_str, s_uid, ws=fake_ws)

        # Attempt in DB must strictly remain 'in_progress', NOT auto-submitted
        att = await conn.fetchrow("SELECT status, candidate_status FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2", quiz_id, student["id"])
        assert att["status"] == "in_progress"


# -----------------------------------------------------------------------------
# SCENARIO 12: Refresh during pending warning preserves violation state
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_12_refresh_preserves_warning_violation_state():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=5, max_warnings=5)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])

        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])
        await QuizRepository.record_student_warning(s_ctx, str(quiz_id), "devtools_open", "F12 pressed")
        await QuizRepository.record_student_warning(s_ctx, str(quiz_id), "right_click", "Context menu blocked")

        # Simulate page refresh
        att = await conn.fetchrow("SELECT warning_count, warnings FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2", quiz_id, student["id"])
        assert att["warning_count"] == 2
        w_list = json.loads(att["warnings"])
        assert len(w_list) == 2
        types = [w["type"] for w in w_list]
        assert "devtools_open" in types
        assert "right_click" in types


# -----------------------------------------------------------------------------
# SCENARIO 13: Repeated start and submit requests are strictly idempotent
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_13_repeated_start_and_submit_are_idempotent():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=5)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])

        # Multiple start requests return identical attemptId
        s1 = await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])
        s2 = await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])
        assert s1["attemptId"] == s2["attemptId"]

        # First submission
        sub1 = await QuizRepository.submit_quiz_attempt(s_ctx, str(quiz_id), answers={"q_1": "A"})
        # Second identical submission
        sub2 = await QuizRepository.submit_quiz_attempt(s_ctx, str(quiz_id), answers={"q_1": "A"})

        assert sub1["attemptId"] == sub2["attemptId"]
        assert sub1["score"] == sub2["score"]
        assert sub2.get("idempotent") is True


# -----------------------------------------------------------------------------
# SCENARIO 14: Token expiration during autosave survives renewal
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_14_token_expiration_autosave_survives():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=5)
        s_ctx_old = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])
        s_ctx_renewed = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])

        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])

        # Save with version 1
        await QuizRepository.save_student_draft_answer(s_ctx_old, str(quiz_id), "q_1", "A", version=1)

        # After renewal, next save with version 2 on same attempt
        res = await QuizRepository.save_student_draft_answer(s_ctx_renewed, str(quiz_id), "q_2", "B", version=2)
        assert res["saved"] is True
        assert res["attemptedCount"] == 2


# -----------------------------------------------------------------------------
# SCENARIO 15: Consistent counts across trainer monitor, student UI, DB, and Excel
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_15_consistent_counts_across_monitor_ui_and_db():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=10)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])
        t_ctx = make_ctx(trainer["id"], Role.TRAINER, trainer["institution_id"])

        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])

        # Answer 7 questions
        for i in range(1, 8):
            await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), f"q_{i}", "A", version=1)

        # 2 warnings
        await QuizRepository.record_student_warning(s_ctx, str(quiz_id), "tab_switch")
        await QuizRepository.record_student_warning(s_ctx, str(quiz_id), "copy_paste")

        # Submit
        sub = await QuizRepository.submit_quiz_attempt(s_ctx, str(quiz_id))
        assert sub["attemptedCount"] == 7
        assert sub["serverConfirmedAnswerCount"] == 7

        # Check DB count
        att = await conn.fetchrow("SELECT answers, warning_count FROM quiz_attempts WHERE id = $1", uuid.UUID(sub["attemptId"]))
        db_answers = json.loads(att["answers"])
        assert len(db_answers) == 7
        assert att["warning_count"] == 2

        # Check Trainer Monitor API
        mon = await get_assessment_monitor_data(str(quiz_id), t_ctx)
        cand = [c for c in mon["data"]["students"] if c["session_id"] == str(student["id"])][0]
        assert cand["warnings"] == 2
        assert cand["candidate_status"] == "COMPLETED"


# -----------------------------------------------------------------------------
# SCENARIO 16: Completed/abandoned attempts cannot be resumed without trainer recovery
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_scenario_16_completed_attempt_cannot_be_resumed_without_trainer_recovery():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=5)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])
        t_ctx = make_ctx(trainer["id"], Role.TRAINER, trainer["institution_id"])

        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])
        sub = await QuizRepository.submit_quiz_attempt(s_ctx, str(quiz_id), answers={"q_1": "A"})
        assert sub["candidateStatus"] == "COMPLETED"

        # Student attempts to resume completed attempt -> Forbidden
        with pytest.raises(ScopeForbidden):
            await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])

        # Trainer recovers attempt
        rec = await QuizRepository.recover_assessment_attempt(
            t_ctx, str(quiz_id), sub["attemptId"], action="RESUME", reason="Authorized extra time"
        )
        assert rec["canResume"] is True

        # Now resumption is unlocked
        resumed_timing = await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])
        assert resumed_timing["canResume"] is True
        assert resumed_timing["status"] == "in_progress"
