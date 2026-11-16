"""Comprehensive Test Suite for Quiz System - LMS Native Integration.

Validates:
1. Trainer quiz creation with proctoring settings (durationMinutes, isProctored, maxWarnings).
2. Multi-batch assignment and strict batch-level access control via batch_trainers.
3. IDOR / privilege escalation rejection when assigning unauthorized batches (ScopeForbidden / HTTP 403).
4. Student access control: students in assigned batches can access, unassigned students receive 403.
5. Student examination launch-token generation for proctored examination.
6. Student quiz submission with device ID and anti-cheat proctoring warnings.
7. EEDI isolation: EEDI competency analytics visible ONLY to authorized trainers; never leaked to students or public.
8. Question CSV parsing with eedi_index / eedi_term tags alongside backward compatibility for legacy CSVs.
9. Standalone Quiz System backend CSV service backward-compatible metadata extraction.
"""
from __future__ import annotations

import subprocess
import sys
import uuid
from pathlib import Path
import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.db.postgres import get_pg_connection
from tests.conftest import ACCOUNTS, login, Session


@pytest.fixture(autouse=True)
def enable_postgres():
    old = settings.USE_POSTGRES
    settings.USE_POSTGRES = True
    yield
    settings.USE_POSTGRES = old


@pytest.mark.asyncio
async def test_quiz_system_standalone_csv_service_compatibility():
    """Verify standalone quiz-system backend csv_service parses eedi_index and eedi_term safely."""
    skillsharp_root = Path(__file__).resolve().parents[3]
    backend_dir = skillsharp_root / "apps" / "quiz-system-v17-cloudflare" / "quiz-system" / "backend"
    
    script = """
import sys
from app.services.csv_service import parse_and_validate_csv

# 1. Extended CSV with eedi columns
extended_csv = (
    "Question,OptionA,OptionB,OptionC,OptionD,Correct,Marks,eedi_index,eedi_term\\n"
    "What is the capital of France?,Paris,London,Berlin,Madrid,A,1,101,Geography\\n"
    "What is 2+2?,3,4,5,6,B,1,102,Mathematics\\n"
).encode("utf-8")
res, records = parse_and_validate_csv(extended_csv)
assert res.accepted, f"Extended CSV should be accepted: {res.errors}"
assert len(records) == 2
assert records[0].eedi_index == 101
assert records[0].eedi_term == "Geography"
assert records[0].correct == ["A"]
assert records[1].eedi_index == 102
assert records[1].eedi_term == "Mathematics"

# 2. Legacy CSV without eedi columns (backward compatibility)
legacy_csv = (
    "Question,OptionA,OptionB,OptionC,OptionD,Correct,Marks\\n"
    "Legacy Question?,Opt1,Opt2,Opt3,Opt4,C,2\\n"
).encode("utf-8")
res_leg, records_leg = parse_and_validate_csv(legacy_csv)
assert res_leg.accepted, f"Legacy CSV should be accepted without eedi: {res_leg.errors}"
assert len(records_leg) == 1
assert records_leg[0].eedi_index is None
assert records_leg[0].eedi_term is None
assert records_leg[0].correct == ["C"]

print("STANDALONE_CSV_SERVICE_VERIFIED")
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=str(backend_dir),
        capture_output=True,
        text=True
    )
    assert result.returncode == 0, f"Standalone verification failed: {result.stderr}"
    assert "STANDALONE_CSV_SERVICE_VERIFIED" in result.stdout


@pytest.mark.asyncio
async def test_trainer_create_and_manage_quiz(client: AsyncClient, trainer: Session):
    """Test trainer creating a quiz, configuring proctoring settings, and listing it."""
    async with get_pg_connection() as conn:
        u = await conn.fetchrow("SELECT id, institution_id, department_id FROM users WHERE email = $1", trainer.user["email"])
        trainer_id = u["id"]
        inst_id = u["institution_id"]
        dept_id = u["department_id"]

        batch_id = uuid.uuid4()
        batch_code = f"TB-{uuid.uuid4().hex[:6]}"
        await conn.execute(
            """
            INSERT INTO batches (id, institution_id, department_id, name, code)
            VALUES ($1, $2, $3, 'Test Assessment Batch', $4)
            """,
            batch_id, inst_id, dept_id, batch_code
        )

        await conn.execute(
            """
            INSERT INTO batch_trainers (id, batch_id, trainer_user_id, institution_id, status)
            VALUES ($1, $2, $3, $4, 'ACTIVE')
            ON CONFLICT (batch_id, trainer_user_id) DO NOTHING
            """,
            uuid.uuid4(), batch_id, trainer_id, inst_id
        )

    payload = {
        "title": "Data Structures Midterm Quiz",
        "durationMinutes": 45,
        "maxScore": 10,
        "batchIds": [str(batch_id)],
        "settings": {
            "isProctored": True,
            "maxWarnings": 3
        },
        "questions": [
            {
                "id": "q-1",
                "text": "What is the time complexity of binary search?",
                "options": [
                    {"id": "A", "text": "O(n)", "correct": False},
                    {"id": "B", "text": "O(log n)", "correct": True},
                    {"id": "C", "text": "O(n^2)", "correct": False},
                    {"id": "D", "text": "O(1)", "correct": False}
                ],
                "marks": 5,
                "eediIndex": 1,
                "eediTerm": "Algorithm Complexity"
            },
            {
                "id": "q-2",
                "text": "Which data structure uses LIFO order?",
                "options": [
                    {"id": "A", "text": "Queue", "correct": False},
                    {"id": "B", "text": "Stack", "correct": True},
                    {"id": "C", "text": "Array", "correct": False},
                    {"id": "D", "text": "Linked List", "correct": False}
                ],
                "marks": 5,
                "eediIndex": 2,
                "eediTerm": "Data Structures"
            }
        ]
    }

    res = await trainer.post("/trainer/assessments", json=payload)
    assert res.status_code == 201, f"Failed to create quiz: {res.text}"
    created = res.json()["data"]
    quiz_id = created["id"]
    assert created["title"] == payload["title"]
    assert created["durationMinutes"] == 45
    assert created["batchCount"] == 1

    # Trainer lists quizzes
    list_res = await trainer.get("/trainer/assessments")
    assert list_res.status_code == 200
    quizzes = list_res.json()["data"]
    matching = [q for q in quizzes if q["id"] == quiz_id]
    assert len(matching) == 1
    assigned_batch_ids = [b["batchId"] for b in matching[0]["assignedBatches"]]
    assert str(batch_id) in assigned_batch_ids


@pytest.mark.asyncio
async def test_unauthorized_batch_assignment_rejection(client: AsyncClient, trainer: Session):
    """Test that trainer CANNOT assign quiz to a batch they do not manage (Strict Access Control)."""
    async with get_pg_connection() as conn:
        u = await conn.fetchrow("SELECT id, institution_id, department_id FROM users WHERE email = $1", trainer.user["email"])
        trainer_id = u["id"]
        inst_id = u["institution_id"]
        dept_id = u["department_id"]

        # Create an unauthorized batch that trainer does NOT teach
        unauthorized_batch_id = uuid.uuid4()
        unauth_code = f"UB-{uuid.uuid4().hex[:6]}"
        await conn.execute(
            """
            INSERT INTO batches (id, institution_id, department_id, name, code)
            VALUES ($1, $2, $3, 'Unauthorized Batch', $4)
            """,
            unauthorized_batch_id, inst_id, dept_id, unauth_code
        )

        # Ensure no batch_trainers link exists
        await conn.execute(
            "DELETE FROM batch_trainers WHERE batch_id = $1 AND trainer_user_id = $2",
            unauthorized_batch_id, trainer_id
        )

    # Attempt to create quiz with unauthorized batch
    payload = {
        "title": "Unauthorized Batch Test",
        "durationMinutes": 30,
        "batchIds": [str(unauthorized_batch_id)],
        "questions": [
            {
                "id": "q-1",
                "text": "Sample Question?",
                "options": [
                    {"id": "A", "text": "Option A", "correct": True},
                    {"id": "B", "text": "Option B", "correct": False}
                ],
                "marks": 5
            }
        ]
    }
    res = await trainer.post("/trainer/assessments", json=payload)
    assert res.status_code == 403, f"Expected 403 when assigning unauthorized batch, got {res.status_code}: {res.text}"


@pytest.mark.asyncio
async def test_student_batch_access_and_proctored_submission(client: AsyncClient, trainer: Session, student: Session):
    """Test student access to assigned batch quiz, anti-cheat proctoring, and submission without EEDI leakage."""
    async with get_pg_connection() as conn:
        trainer_user = await conn.fetchrow("SELECT id, institution_id, department_id FROM users WHERE email = $1", trainer.user["email"])
        student_user = await conn.fetchrow("SELECT id, institution_id, department_id FROM users WHERE email = $1", student.user["email"])
        trainer_id = trainer_user["id"]
        student_id = student_user["id"]
        inst_id = trainer_user["institution_id"]
        dept_id = trainer_user["department_id"]

        assigned_batch_id = uuid.uuid4()
        other_batch_id = uuid.uuid4()
        await conn.execute(
            """
            INSERT INTO batches (id, institution_id, department_id, name, code)
            VALUES ($1, $2, $3, 'Assigned Batch', $4)
            """,
            assigned_batch_id, inst_id, dept_id, f"AB-{uuid.uuid4().hex[:6]}"
        )
        await conn.execute(
            """
            INSERT INTO batches (id, institution_id, department_id, name, code)
            VALUES ($1, $2, $3, 'Other Batch', $4)
            """,
            other_batch_id, inst_id, dept_id, f"OB-{uuid.uuid4().hex[:6]}"
        )

        await conn.execute(
            """
            INSERT INTO batch_trainers (id, batch_id, trainer_user_id, institution_id, status)
            VALUES ($1, $2, $3, $4, 'ACTIVE')
            ON CONFLICT (batch_id, trainer_user_id) DO NOTHING
            """,
            uuid.uuid4(), assigned_batch_id, trainer_id, inst_id
        )

        await conn.execute(
            "UPDATE student_profiles SET batch_id = $1, institution_id = $2 WHERE user_id = $3",
            assigned_batch_id, inst_id, student_id
        )

    # 1. Trainer creates quiz assigned to assigned_batch
    create_payload = {
        "title": "EEDI Proctored Assessment",
        "durationMinutes": 30,
        "maxScore": 20,
        "batchIds": [str(assigned_batch_id)],
        "settings": {
            "isProctored": True,
            "maxWarnings": 2
        },
        "questions": [
            {
                "id": "q-1",
                "text": "What does SQL stand for?",
                "options": [
                    {"id": "A", "text": "Structured Query Language", "correct": True},
                    {"id": "B", "text": "Simple Quick Logic", "correct": False},
                    {"id": "C", "text": "System Question Language", "correct": False},
                    {"id": "D", "text": "None", "correct": False}
                ],
                "marks": 10,
                "eediIndex": 10,
                "eediTerm": "Databases"
            },
            {
                "id": "q-2",
                "text": "Which SQL keyword is used to retrieve data?",
                "options": [
                    {"id": "A", "text": "GET", "correct": False},
                    {"id": "B", "text": "RETRIEVE", "correct": False},
                    {"id": "C", "text": "SELECT", "correct": True},
                    {"id": "D", "text": "FETCH", "correct": False}
                ],
                "marks": 10,
                "eediIndex": 11,
                "eediTerm": "SQL Syntax"
            }
        ]
    }
    create_res = await trainer.post("/trainer/assessments", json=create_payload)
    assert create_res.status_code == 201, f"Create failed: {create_res.text}"
    quiz_id = create_res.json()["data"]["id"]

    # 2. Student lists assessments - should see this quiz
    s_list_res = await student.get("/student/assessments")
    assert s_list_res.status_code == 200
    s_quizzes = s_list_res.json()["data"]
    assert any(q["id"] == quiz_id for q in s_quizzes), "Assigned quiz must appear in student's assessment list"

    # 3. Student generates launch-token for proctored examination
    launch_res = await student.post(f"/student/assessments/{quiz_id}/launch-token")
    assert launch_res.status_code == 200
    launch_data = launch_res.json()["data"]
    assert "launchToken" in launch_data
    assert launch_data["quizId"] == quiz_id

    # 4. Student submits attempt with anti-cheat warnings and device ID
    attempt_payload = {
        "answers": [
            {"questionId": "q-1", "optionId": "A"},  # Correct (10 marks)
            {"questionId": "q-2", "optionId": "C"}   # Correct (10 marks)
        ],
        "durationSeconds": 180,
        "deviceId": "browser-fingerprint-test-xyz",
        "warnings": [
            {"type": "tab_switch", "timestamp": "2026-11-16T08:00:00Z", "detail": "User switched tabs"}
        ]
    }
    submit_res = await student.post(f"/student/assessments/{quiz_id}/attempts", json=attempt_payload)
    assert submit_res.status_code == 201, f"Submit failed: {submit_res.text}"
    attempt_result = submit_res.json()["data"]
    assert attempt_result["score"] == 20
    assert attempt_result["percentage"] == 100.0
    assert attempt_result["passed"] is True
    # CRITICAL: Verify NO EEDI scores are returned to student
    assert "eedi_results" not in attempt_result
    assert "eediResults" not in attempt_result
    assert "eedi" not in attempt_result

    # 5. Student cannot access trainer EEDI analytics endpoint (HTTP 403)
    s_eedi_res = await student.get(f"/trainer/assessments/{quiz_id}/eedi-analytics")
    assert s_eedi_res.status_code in (401, 403), "Student must be forbidden from accessing trainer analytics"

    # 6. Authorized Trainer accesses EEDI analytics
    t_eedi_res = await trainer.get(f"/trainer/assessments/{quiz_id}/eedi-analytics")
    assert t_eedi_res.status_code == 200, f"EEDI analytics failed: {t_eedi_res.text}"
    analytics = t_eedi_res.json()["data"]
    assert "eediSummary" in analytics
    assert "studentBreakdown" in analytics
    assert len(analytics["eediSummary"]) >= 1
    assert len(analytics["studentBreakdown"]) >= 1

    # Verify student in unassigned batch is BLOCKED (403)
    async with get_pg_connection() as conn:
        # Move student to other_batch
        await conn.execute(
            "UPDATE student_profiles SET batch_id = $1 WHERE user_id = $2",
            other_batch_id, student_id
        )

    # Now fetching the quiz must fail for the student
    blocked_res = await student.get(f"/student/assessments/{quiz_id}")
    assert blocked_res.status_code == 403, f"Expected 403 for unassigned batch, got {blocked_res.status_code}"


@pytest.mark.asyncio
async def test_trainer_csv_questions_upload(client: AsyncClient, trainer: Session):
    """Test trainer uploading a CSV file to populate assessment questions with EEDI tags."""
    async with get_pg_connection() as conn:
        u = await conn.fetchrow("SELECT id, institution_id, department_id FROM users WHERE email = $1", trainer.user["email"])
        trainer_id = u["id"]
        inst_id = u["institution_id"]
        dept_id = u["department_id"]

        batch_id = uuid.uuid4()
        batch_code = f"TB-{uuid.uuid4().hex[:6]}"
        await conn.execute(
            """
            INSERT INTO batches (id, institution_id, department_id, name, code)
            VALUES ($1, $2, $3, 'CSV Test Batch', $4)
            """,
            batch_id, inst_id, dept_id, batch_code
        )

        await conn.execute(
            """
            INSERT INTO batch_trainers (id, batch_id, trainer_user_id, institution_id, status)
            VALUES ($1, $2, $3, $4, 'ACTIVE')
            ON CONFLICT (batch_id, trainer_user_id) DO NOTHING
            """,
            uuid.uuid4(), batch_id, trainer_id, inst_id
        )

    # 1. Create a quiz with default questions
    create_payload = {
        "title": "CSV Ingestion Test Assessment",
        "durationMinutes": 20,
        "maxScore": 20,
        "batchIds": [str(batch_id)],
        "questions": [
            {
                "id": "q-placeholder",
                "text": "Initial placeholder question",
                "options": [
                    {"id": "A", "text": "A", "correct": True},
                    {"id": "B", "text": "B", "correct": False}
                ],
                "marks": 5
            }
        ]
    }
    create_res = await trainer.post("/trainer/assessments", json=create_payload)
    assert create_res.status_code == 201, f"Quiz create failed: {create_res.text}"
    quiz_id = create_res.json()["data"]["id"]

    # 2. Upload CSV with eedi_index and eedi_term
    csv_content = (
        "question,option_a,option_b,option_c,option_d,correct,marks,explanation,eedi_index,eedi_term\n"
        "What is polymorphism?,Many forms,Single form,No form,Inheritance,A,5,OOP principle,201,OOP Concepts\n"
        "What is encapsulation?,Bundling data,Looping,Sorting,Testing,A,5,Data hiding,202,OOP Concepts\n"
    ).encode("utf-8")

    files = {"file": ("test_questions.csv", csv_content, "text/csv")}
    upload_res = await trainer.post(f"/trainer/assessments/{quiz_id}/upload-csv", files=files)
    assert upload_res.status_code == 200, f"CSV upload failed: {upload_res.text}"
    assert upload_res.json()["questionCount"] == 2

    # 3. Verify updated quiz questions
    detail_res = await trainer.get(f"/trainer/assessments/{quiz_id}")
    assert detail_res.status_code == 200
    quiz_detail = detail_res.json()["data"]
    questions = quiz_detail["questions"]
    assert len(questions) == 2
    assert questions[0]["text"] == "What is polymorphism?"
    assert questions[0]["eediIndex"] == 201
    assert questions[0]["eediTerm"] == "OOP Concepts"
    assert questions[1]["text"] == "What is encapsulation?"
    assert questions[1]["eediIndex"] == 202


@pytest.mark.asyncio
async def test_exact_configured_duration_and_timer_persistence(trainer: Session, student: Session):
    """Verify that a 5-minute assessment starts with exactly 300s, launch token carries 5m, and timer does not reset."""
    import jwt
    trainer_id = uuid.UUID(trainer.user["id"])
    student_id = uuid.UUID(student.user["id"])
    inst_id = uuid.UUID(trainer.user["collegeId"])
    dept_id = uuid.UUID(trainer.user["departmentId"]) if trainer.user.get("departmentId") else None

    # 1. Setup shared batch for trainer and student
    batch_id = uuid.uuid4()
    batch_code = f"TB-5M-{uuid.uuid4().hex[:6]}"
    async with get_pg_connection() as conn:
        await conn.execute(
            """
            INSERT INTO batches (id, institution_id, department_id, name, code)
            VALUES ($1, $2, $3, '5-Minute Test Batch', $4)
            """,
            batch_id, inst_id, dept_id, batch_code
        )
        await conn.execute(
            """
            INSERT INTO batch_trainers (id, batch_id, trainer_user_id, institution_id, status)
            VALUES ($1, $2, $3, $4, 'ACTIVE')
            ON CONFLICT (batch_id, trainer_user_id) DO NOTHING
            """,
            uuid.uuid4(), batch_id, trainer_id, inst_id
        )
        await conn.execute(
            """
            INSERT INTO student_profiles (id, user_id, batch_id, institution_id, roll_number)
            VALUES (gen_random_uuid(), $1, $2, $3, 'ST-5M-01')
            ON CONFLICT (user_id) DO UPDATE SET batch_id = $2
            """,
            student_id, batch_id, inst_id
        )

    target_batch_id = str(batch_id)

    # 2. Trainer creates a 5-minute assessment (durationMinutes = 5)
    create_payload = {
        "title": "5-Minute Timed Precision Assessment",
        "durationMinutes": 5,
        "maxScore": 20,
        "batchIds": [target_batch_id],
        "settings": {
            "is_proctored": True,
            "camera_required": True,
            "fullscreen_required": True,
            "enable_timed_questions": False,
        },
        "questions": [
            {
                "id": "q1",
                "text": "What is 5 x 5?",
                "options": [{"id": "A", "text": "25", "correct": True}, {"id": "B", "text": "30", "correct": False}],
                "marks": 10,
            },
            {
                "id": "q2",
                "text": "What is 10 x 10?",
                "options": [{"id": "A", "text": "100", "correct": True}, {"id": "B", "text": "200", "correct": False}],
                "marks": 10,
            }
        ],
    }
    create_res = await trainer.post("/trainer/assessments", json=create_payload)
    assert create_res.status_code == 201, create_res.text
    quiz_id = create_res.json()["data"]["id"]

    # 3. Student fetches assessment detail -> durationMinutes must be 5
    detail_res = await student.get(f"/student/assessments/{quiz_id}")
    assert detail_res.status_code == 200, detail_res.text
    data = detail_res.json()["data"]
    assert data["durationMinutes"] == 5
    assert data["timingState"]["total_duration_seconds"] == 300
    assert data["timingState"]["remaining_seconds"] == 300

    # 4. Student generates launch token -> launch token claims MUST contain durationMinutes = 5
    token_res = await student.post(f"/student/assessments/{quiz_id}/launch-token")
    assert token_res.status_code == 200, token_res.text
    launch_token = token_res.json()["data"]["launchToken"]
    claims = jwt.decode(launch_token, options={"verify_signature": False})
    assert claims.get("durationMinutes") == 5, f"Expected durationMinutes=5 in token, got {claims.get('durationMinutes')}"

    # 5. Student starts attempt -> server returns timingState with total_duration_seconds = 300
    start_res = await student.post(f"/student/assessments/{quiz_id}/start")
    assert start_res.status_code == 200, start_res.text
    timing = start_res.json()["data"]["timingState"]
    assert timing["total_duration_seconds"] == 300
    assert 295 <= timing["remaining_seconds"] <= 300

    # 6. Reconnect / refresh simulation: fetching detail again must restore remaining time without resetting to 300
    refresh_res = await student.get(f"/student/assessments/{quiz_id}")
    assert refresh_res.status_code == 200
    refresh_timing = refresh_res.json()["data"]["timingState"]
    assert refresh_timing["total_duration_seconds"] == 300
    assert refresh_timing["remaining_seconds"] <= timing["remaining_seconds"]
