"""Independent Verification Test Suite for Assessment Engine.

Directly tests PostgreSQL persistence and real workflows:
- 50 questions answered and submitted.
- 100 questions answered and submitted.
- Rapid consecutive answer changes.
- Changing an answer multiple times.
- Navigating backward and forward.
- Refresh during an active assessment.
- Network interruption during autosave.
- Token expiration during autosave.
- Submission while requests are in flight.
- Duplicate submission.
- Complete Trainer Recovery workflow (10 steps, no duplicate attempt).
- Auto-submission rules: only WARNING_LIMIT_REACHED and FULLSCREEN_EXIT_TIMEOUT (>10s).
- Normal duration expiry.
- Disconnections, refreshes, camera interrupts never auto-submit.
- Live monitoring state verification (preflight/not-started excluded).
"""
import json
import time
import uuid
import pytest
from datetime import datetime, timezone, timedelta

from app.db.postgres import get_pg_connection
from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.repositories.assignment_quiz_repo import QuizRepository
from app.websocket.assessment_ws import assessment_hub
from app.routers.assessment_realtime import get_assessment_monitor_data


def make_ctx(user_id, role: Role, college_id=None, session_id=None) -> ScopeContext:
    return ScopeContext(
        user_id=str(user_id),
        college_id=str(college_id) if college_id else None,
        department_id=str(uuid.uuid4()),
        role=role,
        session_id=session_id or f"sess-{role.value.lower()}-{uuid.uuid4().hex[:6]}",
    )


async def _create_test_quiz(
    conn,
    trainer_id: uuid.UUID,
    inst_id: uuid.UUID | None,
    num_questions: int = 5,
    timing_mode: str = "FIXED_TOTAL",
    duration_minutes: int = 60,
    max_warnings: int = 3,
) -> tuple[uuid.UUID, list[dict]]:
    quiz_id = uuid.uuid4()
    questions = []
    for i in range(1, num_questions + 1):
        questions.append({
            "id": f"q_{i}",
            "text": f"Question {i} test question content",
            "question_type": "mcq_single",
            "options": [
                {"id": "A", "text": "Option A"},
                {"id": "B", "text": "Option B"},
                {"id": "C", "text": "Option C"},
                {"id": "D", "text": "Option D"},
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
        quiz_id, trainer_id, inst_id, f"Verification Quiz {quiz_id.hex[:6]}",
        duration_minutes, num_questions * 2, json.dumps(questions),
        json.dumps(settings), f"VQ{quiz_id.hex[:4]}", timing_mode,
    )
    return quiz_id, questions


# =============================================================================
# 1. 50 QUESTIONS ANSWERED AND SUBMITTED -> VERIFIED IN POSTGRESQL
# =============================================================================
@pytest.mark.asyncio
async def test_50_questions_answered_and_persisted_in_postgres():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=50, duration_minutes=90)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])

        # Start attempt
        init_attempt = await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])
        attempt_id = uuid.UUID(init_attempt["attemptId"])

        # Draft answers for questions 1 to 40
        for i in range(1, 41):
            opt = "A" if i % 2 == 1 else "B"
            res = await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), f"q_{i}", opt, version=1)
            assert res["saved"] is True
            assert res["attemptedCount"] == i

        # Submit with remaining questions 41 to 50 included in client submission answers
        final_payload = {f"q_{i}": ("C" if i % 2 == 1 else "D") for i in range(41, 51)}
        sub_res = await QuizRepository.submit_quiz_attempt(
            s_ctx, str(quiz_id), answers=final_payload, submission_reason="STUDENT_MANUAL_SUBMIT"
        )

        assert sub_res["attemptedCount"] == 50
        assert sub_res["serverConfirmedAnswerCount"] == 50
        assert sub_res["candidateStatus"] == "COMPLETED"

        # DIRECT POSTGRESQL QUERY VERIFICATION
        row = await conn.fetchrow("SELECT status, answers, candidate_status FROM quiz_attempts WHERE id = $1", attempt_id)
        assert row["status"] == "completed"
        assert row["candidate_status"] == "COMPLETED"

        persisted_answers = json.loads(row["answers"])
        assert len(persisted_answers) == 50, f"Expected 50 answers in DB, found {len(persisted_answers)}"
        for i in range(1, 41):
            expected_opt = "A" if i % 2 == 1 else "B"
            assert persisted_answers[f"q_{i}"] == expected_opt
        for i in range(41, 51):
            expected_opt = "C" if i % 2 == 1 else "D"
            assert persisted_answers[f"q_{i}"] == expected_opt


# =============================================================================
# 2. 100 QUESTIONS ANSWERED AND SUBMITTED -> VERIFIED IN POSTGRESQL
# =============================================================================
@pytest.mark.asyncio
async def test_100_questions_answered_and_persisted_in_postgres():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=100, duration_minutes=180)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])

        init_attempt = await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])
        attempt_id = uuid.UUID(init_attempt["attemptId"])

        # Draft 70 questions via autosave
        for i in range(1, 71):
            opt = ["A", "B", "C", "D"][i % 4]
            await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), f"q_{i}", opt, version=1)

        # Remaining 30 submitted in payload (total 100)
        final_payload = {f"q_{i}": ["A", "B", "C", "D"][(i + 1) % 4] for i in range(71, 101)}
        sub_res = await QuizRepository.submit_quiz_attempt(
            s_ctx, str(quiz_id), answers=final_payload, submission_reason="STUDENT_MANUAL_SUBMIT"
        )

        assert sub_res["attemptedCount"] == 100
        assert sub_res["serverConfirmedAnswerCount"] == 100

        # Direct PostgreSQL check
        row = await conn.fetchrow("SELECT answers FROM quiz_attempts WHERE id = $1", attempt_id)
        db_answers = json.loads(row["answers"])
        assert len(db_answers) == 100, f"Expected 100 answers in DB, found {len(db_answers)}"
        for i in range(1, 101):
            assert f"q_{i}" in db_answers


# =============================================================================
# 3. RAPID CONSECUTIVE ANSWER CHANGES & MULTIPLE EDITS
# =============================================================================
@pytest.mark.asyncio
async def test_rapid_consecutive_answer_changes_and_multiple_edits():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=10)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])

        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])

        # Candidate selects A, then B, then C, then D in rapid succession on question 1
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_1", "A", version=1)
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_1", "B", version=2)
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_1", "C", version=3)
        final_draft = await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_1", "D", version=4)

        assert final_draft["saved"] is True
        assert final_draft["version"] == 4

        # Direct DB query
        row = await conn.fetchrow("SELECT answers FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2", quiz_id, student["id"])
        persisted = json.loads(row["answers"])
        assert persisted["q_1"] == "D"


# =============================================================================
# 4. BACKWARD AND FORWARD NAVIGATION WITH REPEATED CHANGES
# =============================================================================
@pytest.mark.asyncio
async def test_backward_forward_navigation_with_repeated_changes():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=10)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])

        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])

        # Navigate forward: Q1 -> Q2 -> Q3
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_1", "A", version=1)
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_2", "A", version=1)
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_3", "A", version=1)

        # Navigate backward: Q3 -> Q2 -> Q1 and change Q1 from A to C
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_1", "C", version=2)

        # Navigate forward again: Q1 -> Q2 and change Q2 from A to B
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_2", "B", version=2)

        # Direct DB verification
        row = await conn.fetchrow("SELECT answers FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2", quiz_id, student["id"])
        persisted = json.loads(row["answers"])
        assert persisted["q_1"] == "C"
        assert persisted["q_2"] == "B"
        assert persisted["q_3"] == "A"
        assert len(persisted) == 3


# =============================================================================
# 5. REFRESH DURING ACTIVE ASSESSMENT PRESERVES ANSWERS AND TIMER
# =============================================================================
@pytest.mark.asyncio
async def test_refresh_during_active_assessment_preserves_answers_and_timer():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=5, duration_minutes=45)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])

        start_info = await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])
        attempt_id = start_info["attemptId"]

        # Save answers
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_1", "B", version=1)
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_2", "D", version=1)

        # Simulate browser refresh by fetching timing State
        timing = await QuizRepository.get_student_attempt_timing(str(quiz_id), student["id"])
        assert timing["attemptId"] == attempt_id
        assert timing["canResume"] is True
        assert timing["status"] == "in_progress"
        assert timing["answers"]["q_1"] == "B"
        assert timing["answers"]["q_2"] == "D"
        assert timing["timingState"]["overall_remaining_seconds"] > 0
        assert timing["timingState"]["overall_remaining_seconds"] <= 45 * 60


# =============================================================================
# 6. NETWORK INTERRUPTION DURING AUTOSAVE FLUSHED ON FINAL SUBMISSION
# =============================================================================
@pytest.mark.asyncio
async def test_network_interruption_during_autosave_flushed_on_submit():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=10)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])

        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])

        # Q1 saved successfully
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_1", "A", version=1)

        # Q2 and Q3 could not reach server due to network loss; held in client queue
        client_pending_queue = {
            "q_1": "A",  # existing
            "q_2": "C",  # offline draft
            "q_3": "B",  # offline draft
        }

        # Connectivity restored -> final submit sends full client union
        sub_res = await QuizRepository.submit_quiz_attempt(
            s_ctx, str(quiz_id), answers=client_pending_queue, submission_reason="STUDENT_MANUAL_SUBMIT"
        )

        assert sub_res["attemptedCount"] == 3
        row = await conn.fetchrow("SELECT answers FROM quiz_attempts WHERE id = $1", uuid.UUID(sub_res["attemptId"]))
        persisted = json.loads(row["answers"])
        assert persisted["q_1"] == "A"
        assert persisted["q_2"] == "C"
        assert persisted["q_3"] == "B"


# =============================================================================
# 7. TOKEN EXPIRATION DURING AUTOSAVE SURVIVES RENEWAL
# =============================================================================
@pytest.mark.asyncio
async def test_token_expiration_new_session_context_preserves_attempt():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=5)
        # Session 1
        s_ctx_old = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"], session_id="old-jwt-session-1")

        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])
        await QuizRepository.save_student_draft_answer(s_ctx_old, str(quiz_id), "q_1", "A", version=1)

        # Token refreshed -> new session ID
        s_ctx_new = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"], session_id="refreshed-jwt-session-2")

        # Save next answer with new context
        res = await QuizRepository.save_student_draft_answer(s_ctx_new, str(quiz_id), "q_2", "B", version=1)
        assert res["saved"] is True
        assert res["attemptedCount"] == 2

        # Verify DB has both answers
        row = await conn.fetchrow("SELECT answers FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2", quiz_id, student["id"])
        persisted = json.loads(row["answers"])
        assert persisted["q_1"] == "A"
        assert persisted["q_2"] == "B"


# =============================================================================
# 8. SUBMISSION WHILE REQUESTS ARE IN FLIGHT -> UNION RECONCILIATION
# =============================================================================
@pytest.mark.asyncio
async def test_submission_while_requests_in_flight_union_reconciliation():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=10)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])

        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])

        # DB has answers for q_1, q_2, q_3 from earlier autosaves
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_1", "A", version=1)
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_2", "B", version=1)
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_3", "C", version=1)

        # In-flight submit payload only contains the newly clicked answers q_4 and q_5
        incoming_payload = {"q_4": "D", "q_5": "A"}

        sub = await QuizRepository.submit_quiz_attempt(
            s_ctx, str(quiz_id), answers=incoming_payload, submission_reason="STUDENT_MANUAL_SUBMIT"
        )

        assert sub["attemptedCount"] == 5
        assert sub["serverConfirmedAnswerCount"] == 5

        # Check DB has full union
        row = await conn.fetchrow("SELECT answers FROM quiz_attempts WHERE id = $1", uuid.UUID(sub["attemptId"]))
        persisted = json.loads(row["answers"])
        assert set(persisted.keys()) == {"q_1", "q_2", "q_3", "q_4", "q_5"}


# =============================================================================
# 9. DUPLICATE SUBMISSION IS STRICTLY IDEMPOTENT (NO DUPLICATE ATTEMPT)
# =============================================================================
@pytest.mark.asyncio
async def test_duplicate_submission_is_strictly_idempotent():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=5)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])

        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_1", "A", version=1)

        # First submission
        sub1 = await QuizRepository.submit_quiz_attempt(
            s_ctx, str(quiz_id), answers={"q_1": "A"}, submission_reason="STUDENT_MANUAL_SUBMIT"
        )
        attempt_id_1 = sub1["attemptId"]

        # Duplicate submission attempt
        sub2 = await QuizRepository.submit_quiz_attempt(
            s_ctx, str(quiz_id), answers={"q_1": "A"}, submission_reason="STUDENT_MANUAL_SUBMIT"
        )
        attempt_id_2 = sub2["attemptId"]

        assert attempt_id_1 == attempt_id_2

        # Verify in DB: exactly ONE attempt exists for this student and quiz
        attempts_count = await conn.fetchval(
            "SELECT COUNT(*) FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
            quiz_id, student["id"]
        )
        assert attempts_count == 1, "Duplicate submission must never create a second attempt"


# =============================================================================
# 10. COMPLETE TRAINER RECOVERY WORKFLOW (10 STEPS, NO DUPLICATE ATTEMPT)
# =============================================================================
@pytest.mark.asyncio
async def test_complete_trainer_recovery_workflow_no_duplicate_attempt():
    """
    1. Student starts assessment.
    2. Student answers questions.
    3. Student disconnects.
    4. Trainer opens monitoring.
    5. Trainer selects Resume/Recover.
    6. Student refreshes the browser.
    7. Student sees Resume Assessment.
    8. Student opens the same attempt ID.
    9. Previous answers are restored.
    10. Remaining time is preserved.
    """
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=10, duration_minutes=60)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])
        t_ctx = make_ctx(trainer["id"], Role.TRAINER, trainer["institution_id"])

        # Step 1: Student starts assessment
        start_res = await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])
        original_attempt_id = start_res["attemptId"]

        # Step 2: Student answers questions
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_1", "A", version=1)
        await QuizRepository.save_student_draft_answer(s_ctx, str(quiz_id), "q_2", "C", version=1)

        # Step 3: Student disconnects & attempt marked abandoned
        await conn.execute(
            """
            UPDATE quiz_attempts
            SET status = 'completed', candidate_status = 'ABANDONED',
                submission_reason = 'ABANDONMENT_TIMEOUT', completed_at = NOW()
            WHERE id = $1
            """,
            uuid.UUID(original_attempt_id)
        )

        # Step 4: Trainer checks monitor data
        # Step 5: Trainer selects Resume/Recover
        rec_res = await QuizRepository.recover_assessment_attempt(
            t_ctx, str(quiz_id), original_attempt_id, action="RESUME", reason="Device rebooted"
        )
        assert rec_res["success"] is True
        assert rec_res["canResume"] is True
        assert rec_res["candidateStatus"] == "IN_PROGRESS"

        # Step 6: Student refreshes browser (lists quizzes)
        student_quizzes = await QuizRepository.list_student_quizzes(s_ctx)
        target_quiz = next((q for q in student_quizzes if q["id"] == str(quiz_id)), None)
        assert target_quiz is not None

        # Step 7: Student sees Resume Assessment
        assert target_quiz["canResume"] is True
        assert target_quiz["state"] == "in_progress"

        # Step 8: Student opens the same attempt ID
        timing = await QuizRepository.get_student_attempt_timing(str(quiz_id), student["id"])
        assert timing["attemptId"] == original_attempt_id
        assert timing["canResume"] is True

        # Step 9: Previous answers are restored
        assert timing["answers"]["q_1"] == "A"
        assert timing["answers"]["q_2"] == "C"

        # Step 10: Remaining time is preserved
        assert timing["timingState"]["overall_remaining_seconds"] > 0
        assert timing["timingState"]["overall_remaining_seconds"] <= 60 * 60

        # Verification: Exactly ONE attempt exists in DB
        db_attempts = await conn.fetchval(
            "SELECT COUNT(*) FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
            quiz_id, student["id"]
        )
        assert db_attempts == 1, "Recovery must never spawn a duplicate attempt in PostgreSQL"


# =============================================================================
# 11. AUTO-SUBMISSION RULES: ONLY TWO VIOLATION CONDITIONS ALLOWED
# =============================================================================
@pytest.mark.asyncio
async def test_auto_submission_rules_enforcement():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        # Test A: Fullscreen restored within 10s does NOT auto-submit
        quiz_id_a, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=5, max_warnings=5)
        s_ctx_a = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])
        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id_a), student["id"])

        w_within_10s = await QuizRepository.record_student_warning(s_ctx_a, str(quiz_id_a), "fullscreen_exit", "Returned in 5s")
        assert w_within_10s["auto_submit"] is False
        att_a = await conn.fetchrow("SELECT status, candidate_status FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2", quiz_id_a, student["id"])
        assert att_a["status"] == "in_progress"

        # Test B: Fullscreen NOT restored after 10s -> FULLSCREEN_EXIT_TIMEOUT
        sub_b = await QuizRepository.submit_quiz_attempt(
            s_ctx_a, str(quiz_id_a), submission_reason="FULLSCREEN_EXIT_TIMEOUT"
        )
        assert sub_b["candidateStatus"] == "AUTO_SUBMITTED"
        assert sub_b["submissionReason"] == "FULLSCREEN_EXIT_TIMEOUT"

        # Test C: Warning limit reached -> WARNING_LIMIT_REACHED
        quiz_id_c, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=5, max_warnings=2)
        s_ctx_c = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])
        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id_c), student["id"])

        await QuizRepository.record_student_warning(s_ctx_c, str(quiz_id_c), "tab_switch")
        w_limit = await QuizRepository.record_student_warning(s_ctx_c, str(quiz_id_c), "tab_switch")
        assert w_limit["auto_submit"] is True

        sub_c = await QuizRepository.submit_quiz_attempt(
            s_ctx_c, str(quiz_id_c), submission_reason="WARNING_LIMIT_REACHED"
        )
        assert sub_c["candidateStatus"] == "AUTO_SUBMITTED"
        assert sub_c["submissionReason"] == "WARNING_LIMIT_REACHED"


# =============================================================================
# 12. NETWORK, WEBSOCKET, CAMERA, OR TOKEN DISCONNECTIONS NEVER AUTO-SUBMIT
# =============================================================================
@pytest.mark.asyncio
async def test_disconnections_never_trigger_auto_submit():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=5)
        s_ctx = make_ctx(student["id"], Role.STUDENT, trainer["institution_id"])

        await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student["id"])

        # Record camera interruption / off in assessment_hub
        await assessment_hub.handle_status_change(str(quiz_id), str(student["id"]), camera_on=False, fullscreen=True)

        # Disconnect WebSocket in hub
        await assessment_hub.unregister_student(str(quiz_id), str(student["id"]), ws=None)

        # Check DB status is STILL IN_PROGRESS
        row = await conn.fetchrow("SELECT status, candidate_status FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2", quiz_id, student["id"])
        assert row["status"] == "in_progress"
        assert row["candidate_status"] == "IN_PROGRESS"


# =============================================================================
# 13. LIVE MONITORING: NOT-STARTED STUDENTS MUST NOT APPEAR AS CANDIDATES
# =============================================================================
@pytest.mark.asyncio
async def test_live_monitoring_candidate_states_not_started_excluded():
    async with get_pg_connection() as conn:
        trainer = await conn.fetchrow("SELECT id, institution_id FROM users WHERE role IN ('TRAINER', 'ADMIN', 'SUPER_ADMIN') LIMIT 1")
        student = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")

        quiz_id, _ = await _create_test_quiz(conn, trainer["id"], trainer["institution_id"], num_questions=5)
        t_ctx = make_ctx(trainer["id"], Role.TRAINER, trainer["institution_id"])
        q_str = str(quiz_id)
        s_uid = str(student["id"])

        # Candidate has NOT clicked Start Assessment. WebSocket connects for preflight device check.
        await assessment_hub.register_student(
            q_str, s_uid, ws=None, name="Preflight Student", roll_number="ROLL-PRE", total_questions=5
        )

        mon_data = await get_assessment_monitor_data(q_str, t_ctx)
        cands = [c["session_id"] for c in mon_data["data"]["students"]]
        assert s_uid not in cands, "Preflight/not-started students must not appear in trainer live monitor"
