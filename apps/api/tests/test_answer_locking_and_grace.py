import asyncio
import json
import uuid
from datetime import datetime, timezone
import pytest
from app.authz.roles import Role
from app.core.errors import BusinessRuleViolation
from app.repositories.assignment_quiz_repo import QuizRepository
from app.repositories.offline_repo import OfflineRepository
from app.services.session_service import open_session, refresh_session
from app.db.postgres import get_pg_connection

class DummyScope:
    def __init__(self, user_id, role=Role.STUDENT):
        self.user_id = user_id
        self.role = role
        self.college_id = uuid.uuid4()
        self.department_id = uuid.uuid4()
        self.session_id = f"sess-{user_id}"
        self.email = f"student_{user_id}@test.com"

@pytest.mark.asyncio
async def test_draft_answer_locking_and_immutability():
    """Verify NEXT & SAVE locks answer, rejects changes, and permits idempotent repeats."""
    student_id = uuid.uuid4()
    quiz_id = uuid.uuid4()
    ctx = DummyScope(student_id)

    # 1. Create a dummy user and quiz
    async with get_pg_connection() as conn:
        await conn.execute(
            """
            INSERT INTO users (id, name, email, password_hash, role, status, created_at, updated_at)
            VALUES ($1, 'Locking Student', $2, 'hash', 'STUDENT', 'ACTIVE', NOW(), NOW())
            ON CONFLICT (id) DO NOTHING
            """,
            student_id,
            f"student_{student_id}@test.com",
        )
        await conn.execute(
            """
            INSERT INTO quizzes (
                id, title, kind, duration_minutes, max_score, allow_retake,
                opens_at, closes_at, questions, status, created_at, updated_at
            ) VALUES (
                $1, 'Locking Test Exam', 'quiz', 30, 10, false,
                NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day',
                '[{"id": "q1", "text": "Q1", "marks": 5, "options": [{"id": "opt1", "text": "O1", "correct": true}]}]'::jsonb,
                'active', NOW(), NOW()
            )
            """,
            quiz_id,
        )

    # 2. Start attempt
    timing = await QuizRepository.start_or_resume_quiz_attempt(quiz_id=str(quiz_id), student_user_id=student_id)
    attempt_id = timing.get("attemptId") or timing.get("attempt_id") or timing.get("id")
    if not attempt_id:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow("SELECT id FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2", quiz_id, student_id)
            attempt_id = row["id"]

    # 3. Save draft without lock (NEXT navigation)
    res1 = await QuizRepository.save_student_draft_answer(
        ctx,
        quiz_id=str(quiz_id),
        question_id="q1",
        answer="opt1",
        time_spent_seconds=10,
        lock=False,
    )
    assert res1.get("isLocked") is False

    # Verify attempt in DB shows not locked
    async with get_pg_connection() as conn:
        row = await conn.fetchrow("SELECT question_states, answers FROM quiz_attempts WHERE id = $1", attempt_id)
        q_states = json.loads(row["question_states"]) if isinstance(row["question_states"], str) else row["question_states"]
        answers = json.loads(row["answers"]) if isinstance(row["answers"], str) else row["answers"]
        assert answers.get("q1") == "opt1"
        assert q_states.get("q1", {}).get("is_locked") is False

    # 4. Save with lock=True (NEXT & SAVE button)
    res2 = await QuizRepository.save_student_draft_answer(
        ctx,
        quiz_id=str(quiz_id),
        question_id="q1",
        answer="opt1",
        time_spent_seconds=20,
        lock=True,
    )
    assert res2.get("isLocked") is True

    # Verify attempt in DB shows locked
    async with get_pg_connection() as conn:
        row = await conn.fetchrow("SELECT question_states FROM quiz_attempts WHERE id = $1", attempt_id)
        q_states = json.loads(row["question_states"]) if isinstance(row["question_states"], str) else row["question_states"]
        assert q_states["q1"]["is_locked"] is True
        assert q_states["q1"]["lock_source"] == "NEXT_AND_SAVE"

    # 5. Idempotent repeat of same answer on locked question should succeed
    res3 = await QuizRepository.save_student_draft_answer(
        ctx,
        quiz_id=str(quiz_id),
        question_id="q1",
        answer="opt1",
        time_spent_seconds=25,
        lock=True,
    )
    assert res3.get("isLocked") is True

    # 6. Attempt to modify locked answer should fail with BusinessRuleViolation
    with pytest.raises(BusinessRuleViolation) as exc:
        await QuizRepository.save_student_draft_answer(
            ctx,
            quiz_id=str(quiz_id),
            question_id="q1",
            answer="opt2_different",
            time_spent_seconds=30,
            lock=False,
        )
    assert "permanently locked" in str(exc.value)

@pytest.mark.asyncio
async def test_refresh_token_grace_window():
    """Verify that concurrent/subsequent refresh within 15 seconds returns cached tokens without revoking."""
    user_id = uuid.uuid4()
    college_id = uuid.uuid4()

    # Create dummy user in DB
    async with get_pg_connection() as conn:
        await conn.execute(
            """
            INSERT INTO users (id, name, email, password_hash, role, status, created_at, updated_at)
            VALUES ($1, 'Grace Student', $2, 'hash', 'STUDENT', 'ACTIVE', NOW(), NOW())
            ON CONFLICT (id) DO NOTHING
            """,
            user_id,
            f"grace_{user_id}@test.com"
        )

    # 1. Create initial session
    user_dict = {
        "id": user_id,
        "role": "STUDENT",
        "email": f"grace_{user_id}@test.com",
        "collegeId": college_id,
        "departmentId": None,
    }
    bundle1 = await open_session(
        user=user_dict,
        ip="127.0.0.1",
        user_agent="TestRunner",
        remember_me=False,
    )
    original_refresh_token = bundle1["refreshToken"]

    # 2. First refresh: should rotate tokens and set grace key
    bundle2 = await refresh_session(
        refresh_token_raw=original_refresh_token,
        ip="127.0.0.1"
    )
    assert bundle2["accessToken"] != bundle1["accessToken"]

    # 3. Immediate concurrent second request presenting original_refresh_token within grace window
    bundle3 = await refresh_session(
        refresh_token_raw=original_refresh_token,
        ip="127.0.0.1"
    )
    # Must succeed and return the cached access token without revoking
    assert bundle3["accessToken"] == bundle2["accessToken"]
    assert bundle3["refreshToken"] == bundle2["refreshToken"]
