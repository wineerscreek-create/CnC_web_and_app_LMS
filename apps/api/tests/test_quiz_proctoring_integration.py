"""Comprehensive Integration Tests for Proctored Quiz Engine, Real-Time Hub, and Proctoring Subsystems."""
from __future__ import annotations

import asyncio
import json
import time
import uuid
import pytest
import jwt

from app.core.config import settings
from app.websocket.assessment_ws import AssessmentHub


@pytest.mark.asyncio
async def test_assessment_hub_registration_and_heartbeat():
    hub = AssessmentHub()
    quiz_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())

    class MockWs:
        def __init__(self):
            self.sent = []
        async def send_text(self, text: str):
            self.sent.append(text)

    student_ws = MockWs()
    trainer_ws = MockWs()

    # 1. Register trainer
    await hub.register_trainer(quiz_id, trainer_ws, "trainer-1")
    assert trainer_ws in hub.trainer_sockets[quiz_id]

    # 2. Register candidate
    await hub.register_student(
        quiz_id=quiz_id,
        user_id=student_id,
        ws=student_ws,
        name="Alice Candidate",
        roll_number="ROLL-101",
        total_questions=15,
        duration_minutes=30,
    )

    # Verify trainer received student_joined broadcast
    assert len(trainer_ws.sent) == 1
    join_evt = json.loads(trainer_ws.sent[0])
    assert join_evt["event"] == "student_joined"
    assert join_evt["data"]["roll_number"] == "ROLL-101"

    # 3. Test heartbeat
    remaining = await hub.handle_heartbeat(quiz_id, student_id)
    assert remaining > 0
    assert remaining <= 30 * 60

    # 4. Test monitor data retrieval
    mon_data = hub.get_monitor_data(quiz_id)
    assert len(mon_data) == 1
    assert mon_data[0]["session_id"] == student_id
    assert mon_data[0]["name"] == "Alice Candidate"
    assert mon_data[0]["online"] is True


@pytest.mark.asyncio
async def test_assessment_hub_camera_snapshot_relay_and_rate_limit():
    hub = AssessmentHub()
    quiz_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())

    class MockWs:
        def __init__(self):
            self.sent = []
        async def send_text(self, text: str):
            self.sent.append(text)

    student_ws = MockWs()
    trainer_ws = MockWs()

    await hub.register_trainer(quiz_id, trainer_ws, "trainer-1")
    await hub.register_student(quiz_id, student_id, student_ws, "Bob Candidate", "ROLL-102")
    trainer_ws.sent.clear()

    valid_frame = (
        "data:image/jpeg;base64,"
        "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////"
        "wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
    )

    # First snapshot: accepted and relayed
    accepted_1 = await hub.handle_snapshot(quiz_id, student_id, valid_frame)
    assert accepted_1 is True
    assert len(trainer_ws.sent) == 1
    evt = json.loads(trainer_ws.sent[0])
    assert evt["event"] == "camera_snapshot"
    assert evt["data"]["session_id"] == student_id
    assert evt["data"]["frame"] == valid_frame

    # Rapid second snapshot: rejected by rate limiter (< 3.8s)
    accepted_2 = await hub.handle_snapshot(quiz_id, student_id, valid_frame)
    assert accepted_2 is False

    # Invalid non-JPEG header: rejected
    hub.last_snapshot_time[quiz_id][student_id] = 0.0  # reset timer
    accepted_invalid = await hub.handle_snapshot(quiz_id, student_id, "data:text/plain;base64,invalid")
    assert accepted_invalid is False


@pytest.mark.asyncio
async def test_assessment_hub_warning_and_submission_events():
    hub = AssessmentHub()
    quiz_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())

    class MockWs:
        def __init__(self):
            self.sent = []
        async def send_text(self, text: str):
            self.sent.append(text)

    student_ws = MockWs()
    trainer_ws = MockWs()

    await hub.register_trainer(quiz_id, trainer_ws, "trainer-1")
    await hub.register_student(quiz_id, student_id, student_ws, "Charlie Candidate", "ROLL-103")
    trainer_ws.sent.clear()

    # Warning event
    await hub.handle_warning(quiz_id, student_id, "tab_switch", 2)
    assert len(trainer_ws.sent) == 1
    w_evt = json.loads(trainer_ws.sent[0])
    assert w_evt["event"] == "warning"
    assert w_evt["data"]["warning_type"] == "tab_switch"
    assert w_evt["data"]["count"] == 2

    # Status check in monitor
    state = hub.get_monitor_data(quiz_id)[0]
    assert state["warnings"] == 2

    # Submit event
    await hub.handle_submit(quiz_id, student_id, {"score": 85, "passed": True})
    sub_evt = json.loads(trainer_ws.sent[1])
    assert sub_evt["event"] == "submit"
    assert sub_evt["data"]["result"]["score"] == 85

    state = hub.get_monitor_data(quiz_id)[0]
    assert state["status"] == "submitted"


def test_launch_and_monitor_token_claims():
    quiz_id = str(uuid.uuid4())
    student_id = str(uuid.uuid4())
    now = int(time.time())

    student_claims = {
        "sub": student_id,
        "name": "David",
        "roll_number": "ROLL-104",
        "quiz_id": quiz_id,
        "role": "student",
        "type": "student",
        "iss": "skillsharp-lms",
        "aud": "quiz-system",
        "iat": now,
        "exp": now + 1800,
    }

    token = jwt.encode(student_claims, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    decoded = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM], options={"verify_aud": False})

    assert decoded["sub"] == student_id
    assert decoded["role"] == "student"
    assert decoded["quiz_id"] == quiz_id
    assert decoded["roll_number"] == "ROLL-104"


@pytest.mark.asyncio
async def test_timed_question_settings_validation_and_reveal():
    from app.repositories.assignment_quiz_repo import QuizRepository
    from app.authz.context import ScopeContext
    from app.authz.roles import Role
    from app.core.errors import ValidationError, BusinessRuleViolation
    from app.db.postgres import get_pg_connection

    async with get_pg_connection() as conn:
        trainer_row = await conn.fetchrow("SELECT id FROM users WHERE role = 'TRAINER' LIMIT 1")
        if not trainer_row:
            trainer_row = await conn.fetchrow("SELECT id FROM users LIMIT 1")
        trainer_id = trainer_row["id"]

        student_row = await conn.fetchrow("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1")
        student_id = student_row["id"] if student_row else trainer_id

    ctx = ScopeContext(
        user_id=trainer_id,
        role=Role.TRAINER,
        college_id=None,
        department_id=None,
        session_id=str(uuid.uuid4()),
    )

    # 1. Invalid duration settings: question_duration (2s) <= answer_reveal_duration (2s)
    with pytest.raises(ValidationError):
        await QuizRepository.create_trainer_quiz(
            ctx=ctx,
            title="Invalid Timed Quiz",
            duration_minutes=15,
            settings={
                "enable_timed_questions": True,
                "question_duration": 2,
                "answer_reveal_duration": 2,
            },
        )

    # 2. Valid duration settings: question_duration (10s) > answer_reveal_duration (2s)
    created = await QuizRepository.create_trainer_quiz(
        ctx=ctx,
        title="Valid Speed Test Quiz",
        duration_minutes=15,
        questions=[
            {
                "id": "q-1",
                "question": "What is the result of 2 + 2?",
                "options": [{"id": "A", "text": "3"}, {"id": "B", "text": "4"}],
                "correct": ["B"],
                "explanation": "2 + 2 equals 4.",
            }
        ],
        settings={
            "enable_timed_questions": True,
            "question_duration": 10,
            "answer_reveal_duration": 2,
            "auto_advance": True,
            "allow_previous": False,
            "allow_modification": False,
        },
    )
    quiz_id = created["id"]

    # 3. Test question reveal
    student_ctx = ScopeContext(
        user_id=student_id,
        role=Role.STUDENT,
        college_id=None,
        department_id=None,
        session_id=str(uuid.uuid4()),
    )
    reveal_data = await QuizRepository.get_question_reveal(student_ctx, quiz_id, "q-1")
    assert reveal_data["question_id"] == "q-1"
    assert "B" in reveal_data["correct_options"]
    assert reveal_data["correct_answer"] == "B"
    assert "2 + 2 equals 4" in reveal_data["explanation"]

    # 4. Test answer draft and modification lock
    # Ensure any past attempt on this test quiz is cleared
    async with get_pg_connection() as conn:
        await conn.execute("DELETE FROM quiz_attempts WHERE quiz_id = $1", uuid.UUID(quiz_id))

    await QuizRepository.save_student_draft_answer(student_ctx, quiz_id, "q-1", "B")

    # Attempting to change answer when allow_modification is False must raise BusinessRuleViolation
    with pytest.raises(BusinessRuleViolation):
        await QuizRepository.save_student_draft_answer(student_ctx, quiz_id, "q-1", "A")
