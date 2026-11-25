import asyncio
import json
import uuid
from datetime import datetime, timezone
import pytest

from app.authz.roles import Role
from app.db.postgres import get_pg_connection
from app.repositories.assignment_quiz_repo import QuizRepository
from app.repositories.offline_repo import OfflineRepository
from app.services.offline_crypto import OfflineCryptoService


class DummyScope:
    def __init__(self, user_id, role=Role.STUDENT, college_id=None):
        self.user_id = user_id
        self.role = role
        self.college_id = college_id or uuid.uuid4()
        self.department_id = uuid.uuid4()
        self.session_id = f"sess-{user_id}"
        self.email = f"p0_{user_id}@test.com"


@pytest.mark.asyncio
async def test_online_start_then_offline_complete_and_sync():
    """P0: Starting online (in_progress) then completing offline must NOT raise CONFLICT and must merge locked answers."""
    student_id = uuid.uuid4()
    quiz_id = uuid.uuid4()
    ctx = DummyScope(student_id)

    questions = [
        {
            "id": "q1",
            "text": "Protocol?",
            "marks": 5,
            "options": [
                {"id": "a1", "text": "TCP", "correct": True},
                {"id": "a2", "text": "UDP", "correct": False},
            ],
        },
        {
            "id": "q2",
            "text": "Port?",
            "marks": 5,
            "options": [
                {"id": "b1", "text": "80", "correct": False},
                {"id": "b2", "text": "443", "correct": True},
            ],
        },
    ]

    async with get_pg_connection() as conn:
        await conn.execute(
            """
            INSERT INTO users (id, name, email, password_hash, role, status, created_at, updated_at)
            VALUES ($1, 'Offline Transition Student', $2, 'hash', 'STUDENT', 'ACTIVE', NOW(), NOW())
            """,
            student_id,
            ctx.email,
        )
        await conn.execute(
            """
            INSERT INTO quizzes (
                id, title, kind, duration_minutes, max_score, allow_retake,
                opens_at, closes_at, questions, status, created_at, updated_at
            ) VALUES (
                $1, 'P0 Online-to-Offline Exam', 'quiz', 30, 100, false,
                NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day',
                $2::jsonb, 'active', NOW(), NOW()
            )
            """,
            quiz_id,
            json.dumps(questions),
        )

    # 1. Student starts online and locks q1 = a1
    await QuizRepository.start_or_resume_quiz_attempt(quiz_id=str(quiz_id), student_user_id=student_id)
    await QuizRepository.save_student_draft_answer(
        ctx, quiz_id=str(quiz_id), question_id="q1", answer="a1", lock=True
    )

    # 2. Network drops; student answers q2 = b2 offline (and even tries stale q1 = a2 in offline payload)
    client_attempt_id = str(uuid.uuid4())
    op_id = str(uuid.uuid4())
    answers = [
        {"questionId": "q1", "optionId": "a2"},  # stale offline draft should NOT overwrite locked a1
        {"questionId": "q2", "optionId": "b2"},
    ]
    integrity_hash = OfflineCryptoService.compute_attempt_integrity_hash(
        client_attempt_id, str(quiz_id), str(student_id), {"q1": "a2", "q2": "b2"}
    )
    op = {
        "operationId": op_id,
        "userId": str(student_id),
        "resourceType": "ASSESSMENT_SUBMISSION",
        "resourceId": str(quiz_id),
        "operationType": "SUBMIT_ASSESSMENT",
        "attemptId": client_attempt_id,
        "payload": {
            "quizId": str(quiz_id),
            "answers": answers,
            "durationSeconds": 420,
            "localSubmittedAt": datetime.now(timezone.utc).isoformat(),
            "integrityHash": integrity_hash,
        },
        "clientTimestamp": datetime.now(timezone.utc).isoformat(),
    }

    res = await OfflineRepository.process_sync_batch(ctx, [op])
    assert len(res) == 1
    assert res[0]["status"] == "PROCESSED", f"Expected PROCESSED, got {res[0]}"

    # 3. Verify PostgreSQL state: 1 row only, OFFLINE_SUBMITTED, score=100 (because locked a1 + offline b2)
    async with get_pg_connection() as conn:
        rows = await conn.fetch(
            "SELECT id, status, candidate_status, submission_source, score, answers FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
            quiz_id,
            student_id,
        )
        assert len(rows) == 1, f"Expected 1 attempt row, found {len(rows)}"
        row = rows[0]
        assert row["status"] == "completed"
        assert row["candidate_status"] == "OFFLINE_SUBMITTED"
        assert row["submission_source"] == "OFFLINE_SYNC"
        assert int(row["score"]) == 100
        saved_ans = json.loads(row["answers"]) if isinstance(row["answers"], str) else row["answers"]
        assert saved_ans["q1"] == "a1"
        assert saved_ans["q2"] == "b2"

    # 4. Duplicate sync with same operationId returns ALREADY_PROCESSED
    res_dup = await OfflineRepository.process_sync_batch(ctx, [op])
    assert res_dup[0]["status"] == "ALREADY_PROCESSED"


@pytest.mark.asyncio
async def test_concurrent_start_and_warning_candidate_status():
    """P0: Concurrent start requests must create exactly 1 in_progress row; warnings must not leave NOT_STARTED."""
    student_id = uuid.uuid4()
    quiz_id = uuid.uuid4()
    ctx = DummyScope(student_id)

    async with get_pg_connection() as conn:
        await conn.execute(
            """
            INSERT INTO users (id, name, email, password_hash, role, status, created_at, updated_at)
            VALUES ($1, 'Concurrent Student', $2, 'hash', 'STUDENT', 'ACTIVE', NOW(), NOW())
            """,
            student_id,
            ctx.email,
        )
        await conn.execute(
            """
            INSERT INTO quizzes (
                id, title, kind, duration_minutes, max_score, allow_retake,
                opens_at, closes_at, questions, status, created_at, updated_at
            ) VALUES (
                $1, 'P0 Concurrency Exam', 'quiz', 30, 100, false,
                NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day',
                '[{"id":"q1","text":"Q1","marks":10,"options":[{"id":"o1","text":"O1","correct":true}]}]'::jsonb,
                'active', NOW(), NOW()
            )
            """,
            quiz_id,
        )

    # Fire 5 concurrent start calls + 1 warning call
    await asyncio.gather(
        QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student_id),
        QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student_id),
        QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student_id),
        QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student_id),
        QuizRepository.record_student_warning(ctx, str(quiz_id), "TAB_SWITCH", "test"),
    )

    async with get_pg_connection() as conn:
        rows = await conn.fetch(
            "SELECT id, status, candidate_status, warning_count FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
            quiz_id,
            student_id,
        )
        assert len(rows) == 1, f"Expected exactly 1 attempt row, got {len(rows)}"
        assert rows[0]["status"] == "in_progress"
        assert rows[0]["candidate_status"] == "IN_PROGRESS"
        assert rows[0]["warning_count"] == 1
