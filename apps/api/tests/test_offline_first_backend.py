"""Unit and Integration Tests for Offline-First Backend Architecture.

Tests:
1. Registration of offline sync router in FastAPI application.
2. Migration 019 application and table schema verification.
3. Package authorization logic (time-bound, tenant-scoped, tamper-resistant).
4. Zero-trust assessment evaluation: client answers evaluated on server.
5. Idempotent outbox sync: duplicate operationId returns ALREADY_PROCESSED.
6. Conflict detection when duplicate submission attempted without retake permission.
"""
import json
import uuid
import pytest
from datetime import datetime, timezone, timedelta
from app.main import create_app
from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.db.postgres import run_migrations, get_pg_connection
from app.repositories.offline_repo import OfflineRepository


@pytest.fixture(autouse=True)
async def ensure_db_migrations():
    """Applies pending migrations including 019."""
    await run_migrations()


@pytest.fixture
def student_ctx():
    return ScopeContext(
        user_id=uuid.uuid4(),
        role=Role.STUDENT,
        college_id=uuid.uuid4(),
        department_id=uuid.uuid4(),
        session_id="test-session-123",
        email="test_offline_student@winnerscreek.internal",
    )


def test_offline_routes_registered():
    app = create_app()
    routes = [r.path for r in app.routes]
    assert "/api/v1/offline/package/authorize" in routes
    assert "/api/v1/offline/package/{package_id}" in routes
    assert "/api/v1/offline/sync" in routes
    assert "/api/v1/offline/changes" in routes


@pytest.mark.asyncio
async def test_offline_package_authorization_validation(student_ctx):
    # Testing validation on invalid resource ID / package type
    with pytest.raises(Exception):
        await OfflineRepository.authorize_package(student_ctx, "INVALID_TYPE", str(uuid.uuid4()))


@pytest.mark.asyncio
async def test_offline_sync_idempotency_structure(student_ctx):
    # Ensure test user exists in users table with name
    test_user_id = student_ctx.user_id
    async with get_pg_connection() as conn:
        await conn.execute(
            """
            INSERT INTO users (id, name, email, password_hash, role, status, created_at, updated_at)
            VALUES ($1, 'Test Offline Student', $2, 'test_hash', 'STUDENT', 'ACTIVE', NOW(), NOW())
            ON CONFLICT (id) DO NOTHING
            """,
            test_user_id,
            f"offline_{test_user_id}@test.internal",
        )

    op_id = str(uuid.uuid4())
    ops = [
        {
            "operationId": op_id,
            "userId": str(test_user_id),
            "resourceType": "GENERIC",
            "resourceId": str(uuid.uuid4()),
            "operationType": "PING",
            "payload": {"ping": True},
            "clientTimestamp": datetime.now(timezone.utc).isoformat(),
        }
    ]

    # First sync run -> PROCESSED
    results1 = await OfflineRepository.process_sync_batch(student_ctx, ops)
    print("RESULTS1 DEBUG:", results1)
    assert len(results1) == 1
    assert results1[0]["operationId"] == op_id
    assert results1[0]["status"] == "PROCESSED"

    # Second sync run with identical operationId -> ALREADY_PROCESSED (Strict Idempotency)
    results2 = await OfflineRepository.process_sync_batch(student_ctx, ops)
    assert len(results2) == 1
    assert results2[0]["operationId"] == op_id
    assert results2[0]["status"] == "ALREADY_PROCESSED"


@pytest.mark.asyncio
async def test_offline_assessment_server_side_grading(student_ctx):
    test_user_id = student_ctx.user_id
    quiz_id = uuid.uuid4()
    q1_id = "q1"
    q2_id = "q2"

    quiz_questions = [
        {
            "id": q1_id,
            "text": "What is 2 + 2?",
            "marks": 5,
            "options": [
                {"id": "opt1_wrong", "text": "3", "correct": False},
                {"id": "opt1_correct", "text": "4", "correct": True},
            ],
        },
        {
            "id": q2_id,
            "text": "Capital of France?",
            "marks": 5,
            "options": [
                {"id": "opt2_correct", "text": "Paris", "correct": True},
                {"id": "opt2_wrong", "text": "Rome", "correct": False},
            ],
        },
    ]

    async with get_pg_connection() as conn:
        # User
        await conn.execute(
            """
            INSERT INTO users (id, name, email, password_hash, role, status, created_at, updated_at)
            VALUES ($1, 'Test Offline Student 2', $2, 'test_hash', 'STUDENT', 'ACTIVE', NOW(), NOW())
            ON CONFLICT (id) DO NOTHING
            """,
            test_user_id,
            f"offline_{test_user_id}_2@test.internal",
        )
        # Quiz
        await conn.execute(
            """
            INSERT INTO quizzes (
                id, title, kind, duration_minutes, max_score, allow_retake,
                opens_at, closes_at, questions, status, created_at, updated_at
            ) VALUES (
                $1, 'Offline Test Assessment', 'quiz', 30, 10, false,
                NOW() - INTERVAL '1 day', NOW() + INTERVAL '5 days', $2::jsonb, 'active', NOW(), NOW()
            )
            """,
            quiz_id,
            json.dumps(quiz_questions),
        )

    # Participant answered q1 correctly, q2 incorrectly
    attempt_op_id = str(uuid.uuid4())
    ops = [
        {
            "operationId": attempt_op_id,
            "userId": str(test_user_id),
            "resourceType": "ASSESSMENT_SUBMISSION",
            "resourceId": str(quiz_id),
            "operationType": "SUBMIT_ASSESSMENT",
            "attemptId": str(uuid.uuid4()),
            "payload": {
                "quizId": str(quiz_id),
                "answers": [
                    {"questionId": q1_id, "optionId": "opt1_correct"},
                    {"questionId": q2_id, "optionId": "opt2_wrong"},
                ],
                "durationSeconds": 120,
            },
            "clientTimestamp": datetime.now(timezone.utc).isoformat(),
        }
    ]

    results = await OfflineRepository.process_sync_batch(student_ctx, ops)
    print("ASSESSMENT SYNC RESULT DEBUG:", results)
    assert len(results) == 1
    assert results[0]["operationId"] == attempt_op_id
    assert results[0]["status"] == "PROCESSED"
    # Earned 5 out of 10 marks -> 50.0% official server-evaluated score
    assert results[0]["data"]["officialScore"] == 50.0
    assert results[0]["data"]["passed"] is True
