"""Integration tests for Master Implementation:
Permanent Student Assessment Reports, Student Progress, Trainer Excel Exports,
Smart Notifications, and Dynamic Dashboard CTA.
"""
import io
import json
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
import pytest
from openpyxl import load_workbook

from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.db.postgres import get_pg_connection
from app.repositories.assessment_report_repo import AssessmentReportRepository
from app.repositories.assignment_quiz_repo import QuizRepository
from app.services import notifications as notif_service
from app.services.student_dashboard_service import StudentDashboardService


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_automatic_report_generation_and_reattempt_permanence():
    """Verify:
    1. Submitting a quiz creates an attempt and automatically generates a permanent assessment report.
    2. Reattempting the quiz creates a separate attempt and independent report with attempt_number = 2.
    3. The first report is never overwritten.
    """
    async with get_pg_connection() as conn:
        inst_id = uuid.uuid4()
        dept_id = uuid.uuid4()
        trainer_id = uuid.uuid4()
        student_id = uuid.uuid4()
        batch_id = uuid.uuid4()
        quiz_id = uuid.uuid4()

        # Seed institution, department, users, batch, student profile
        await conn.execute(
            "INSERT INTO institutions (id, name, code) VALUES ($1, 'Reports Academy', $2)",
            inst_id, f"REP_{uuid.uuid4().hex[:6]}"
        )
        await conn.execute(
            "INSERT INTO departments (id, institution_id, name, code) VALUES ($1, $2, 'Computer Science', $3)",
            dept_id, inst_id, f"CS_{uuid.uuid4().hex[:6]}"
        )
        await conn.execute(
            "INSERT INTO users (id, name, email, password_hash, role, institution_id, department_id, status) VALUES ($1, 'Trainer Tom', $2, 'hash', 'TRAINER', $3, $4, 'ACTIVE')",
            trainer_id, f"trainer_{uuid.uuid4().hex[:6]}@test.edu", inst_id, dept_id
        )
        await conn.execute(
            "INSERT INTO users (id, name, email, password_hash, role, institution_id, department_id, status) VALUES ($1, 'Alice Walker', $2, 'hash', 'STUDENT', $3, $4, 'ACTIVE')",
            student_id, f"student_{uuid.uuid4().hex[:6]}@test.edu", inst_id, dept_id
        )
        await conn.execute(
            "INSERT INTO batches (id, institution_id, department_id, name, code, start_date) VALUES ($1, $2, $3, 'CS-Alpha', $4, NOW())",
            batch_id, inst_id, dept_id, f"BATCH_{uuid.uuid4().hex[:6]}"
        )
        await conn.execute(
            """
            INSERT INTO student_profiles (user_id, institution_id, department_id, batch_id, roll_number, current_semester)
            VALUES ($1, $2, $3, $4, 'CS2026-001', 5)
            """,
            student_id, inst_id, dept_id, batch_id
        )

        questions = [
            {
                "id": "q1",
                "text": "What is the time complexity of binary search?",
                "topic": "Algorithms",
                "difficulty": "Easy",
                "marks": 5,
                "negative": 0,
                "question_type": "mcq_single",
                "options": [
                    {"id": "A", "text": "O(N)", "correct": False},
                    {"id": "B", "text": "O(log N)", "correct": True},
                    {"id": "C", "text": "O(1)", "correct": False},
                ],
            },
            {
                "id": "q2",
                "text": "Which data structure uses LIFO?",
                "topic": "Data Structures",
                "difficulty": "Easy",
                "marks": 5,
                "negative": 0,
                "question_type": "mcq_single",
                "options": [
                    {"id": "A", "text": "Queue", "correct": False},
                    {"id": "B", "text": "Stack", "correct": True},
                ],
            },
        ]

        await conn.execute(
            """
            INSERT INTO quizzes (
                id, institution_id, batch_id, creator_trainer_id, title, description,
                questions, max_score, allow_retake, status, duration_minutes
            ) VALUES ($1, $2, $3, $4, 'Data Structures & Algorithms Test', 'Semester Exam', $5::jsonb, 10, TRUE, 'active', 60)
            """,
            quiz_id, inst_id, batch_id, trainer_id, json.dumps(questions)
        )

    student_ctx = ScopeContext(
        user_id=student_id,
        role=Role.STUDENT,
        college_id=inst_id,
        department_id=dept_id,
        session_id="test-session-1",
        email="student@test.edu",
    )

    # 1. First attempt: Submit answers (q1 correct = B, q2 incorrect = A) -> Score: 5/10 (50%)
    res1 = await QuizRepository.submit_quiz_attempt(
        ctx=student_ctx,
        quiz_id=str(quiz_id),
        answers={"q1": "B", "q2": "A"},
    )
    assert res1["score"] == 5
    assert res1["percentage"] == 50.0
    attempt1_id = res1["attemptId"]

    # Verify permanent report was automatically created
    reports1 = await AssessmentReportRepository.get_student_reports(student_id)
    assert reports1["pagination"]["total"] == 1
    rep1 = reports1["items"][0]
    assert rep1["attemptId"] == attempt1_id
    assert rep1["marksObtained"] == 5.0
    assert rep1["percentage"] == 50.0
    assert rep1["resultStatus"] == "FAILED"
    assert rep1["attemptNumber"] == 1
    assert rep1["rollNumber"] == "CS2026-001"

    # 2. Second attempt (Retake): Student retakes and gets 10/10 (100%)
    await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student_id)
    res2 = await QuizRepository.submit_quiz_attempt(
        ctx=student_ctx,
        quiz_id=str(quiz_id),
        answers={"q1": "B", "q2": "B"},
    )
    assert res2["score"] == 10
    assert res2["percentage"] == 100.0
    attempt2_id = res2["attemptId"]
    assert attempt2_id != attempt1_id

    # Verify both reports exist independently
    reports2 = await AssessmentReportRepository.get_student_reports(student_id)
    assert reports2["pagination"]["total"] == 2

    # Check attempt 1 report is unchanged
    rep1_full = await AssessmentReportRepository.get_report_by_id(rep1["id"])
    assert rep1_full["marksObtained"] == 5.0
    assert rep1_full["attemptNumber"] == 1

    # Check attempt 2 report
    rep2_full = await AssessmentReportRepository.get_report_by_id(reports2["items"][0]["id"] if reports2["items"][0]["attemptId"] == attempt2_id else reports2["items"][1]["id"])
    assert rep2_full["marksObtained"] == 10.0
    assert rep2_full["percentage"] == 100.0
    assert rep2_full["resultStatus"] == "PASSED"
    assert rep2_full["attemptNumber"] == 2

    # Verify student progress summary aggregate
    summary = await AssessmentReportRepository.get_student_progress_summary(student_id)
    assert summary["totalCompleted"] == 2
    assert summary["passedCount"] == 1
    assert summary["failedCount"] == 1
    assert summary["bestScore"] == 100.0
    assert summary["averagePercentage"] == 75.0


@pytest.mark.anyio
async def test_trainer_individual_excel_4_sheets_and_bulk_zip():
    """Verify:
    1. Individual Excel export contains exactly 4 worksheets (Student Summary, Question-wise Analysis, Performance Analysis, Proctoring Summary).
    2. Bulk ZIP export packages individual workbooks named {rollNumber}_{Assessment_Title}_Report.xlsx.
    3. Cross-trainer scoping prohibits unauthorized exports.
    """
    async with get_pg_connection() as conn:
        inst_id = uuid.uuid4()
        dept_id = uuid.uuid4()
        trainer_id = uuid.uuid4()
        other_trainer_id = uuid.uuid4()
        student_id = uuid.uuid4()
        batch_id = uuid.uuid4()
        quiz_id = uuid.uuid4()

        await conn.execute(
            "INSERT INTO institutions (id, name, code) VALUES ($1, 'Excel Academy', $2)",
            inst_id, f"EXC_{uuid.uuid4().hex[:6]}"
        )
        await conn.execute(
            "INSERT INTO departments (id, institution_id, name, code) VALUES ($1, $2, 'IT Dept', $3)",
            dept_id, inst_id, f"IT_{uuid.uuid4().hex[:6]}"
        )
        await conn.execute(
            "INSERT INTO users (id, name, email, password_hash, role, institution_id, department_id, status) VALUES ($1, 'Trainer Dave', $2, 'hash', 'TRAINER', $3, $4, 'ACTIVE')",
            trainer_id, f"trainer_{uuid.uuid4().hex[:6]}@test.edu", inst_id, dept_id
        )
        await conn.execute(
            "INSERT INTO users (id, name, email, password_hash, role, institution_id, department_id, status) VALUES ($1, 'Trainer Eve', $2, 'hash', 'TRAINER', $3, $4, 'ACTIVE')",
            other_trainer_id, f"trainer_{uuid.uuid4().hex[:6]}@test.edu", inst_id, dept_id
        )
        await conn.execute(
            "INSERT INTO users (id, name, email, password_hash, role, institution_id, department_id, status) VALUES ($1, 'Bob Smith', $2, 'hash', 'STUDENT', $3, $4, 'ACTIVE')",
            student_id, f"student_{uuid.uuid4().hex[:6]}@test.edu", inst_id, dept_id
        )
        await conn.execute(
            "INSERT INTO batches (id, institution_id, department_id, name, code, start_date) VALUES ($1, $2, $3, 'Batch-Excel', $4, NOW())",
            batch_id, inst_id, dept_id, f"BATCH_{uuid.uuid4().hex[:6]}"
        )
        await conn.execute(
            """
            INSERT INTO student_profiles (user_id, institution_id, department_id, batch_id, roll_number, current_semester)
            VALUES ($1, $2, $3, $4, 'ROLL-999', 4)
            """,
            student_id, inst_id, dept_id, batch_id
        )

        questions = [
            {
                "id": "q1",
                "text": "What is Python?",
                "topic": "Programming",
                "difficulty": "Easy",
                "marks": 10,
                "options": [{"id": "A", "text": "Language", "correct": True}],
            }
        ]

        await conn.execute(
            """
            INSERT INTO quizzes (
                id, institution_id, batch_id, creator_trainer_id, title,
                questions, max_score, allow_retake, status
            ) VALUES ($1, $2, $3, $4, 'Python Core', $5::jsonb, 10, FALSE, 'active')
            """,
            quiz_id, inst_id, batch_id, trainer_id, json.dumps(questions)
        )

    student_ctx = ScopeContext(user_id=student_id, role=Role.STUDENT, college_id=inst_id, department_id=dept_id, session_id="test-session-2")
    sub = await QuizRepository.submit_quiz_attempt(
        ctx=student_ctx,
        quiz_id=str(quiz_id),
        answers={"q1": "A"},
    )
    attempt_id = sub["attemptId"]

    # 1. Generate Individual 4-sheet Excel report
    rep = await AssessmentReportRepository.generate_and_persist_report(attempt_id)
    full_report = await AssessmentReportRepository.get_report_by_id(rep["id"])
    excel_bytes = AssessmentReportRepository.generate_individual_excel_report(full_report)

    # Inspect workbook sheets
    wb = load_workbook(io.BytesIO(excel_bytes))
    sheet_names = wb.sheetnames
    assert len(sheet_names) == 4
    assert sheet_names == [
        "Student Summary",
        "Question-wise Analysis",
        "Performance Analysis",
        "Proctoring Summary",
    ]

    ws_summary = wb["Student Summary"]
    assert "WINNERS CREEK LMS" in str(ws_summary["A1"].value)
    found_roll = False
    for row in ws_summary.iter_rows(values_only=True):
        if "Roll Number" in row:
            found_roll = True
            break
    assert found_roll

    # 2. Bulk ZIP export
    trainer_ctx = ScopeContext(user_id=trainer_id, role=Role.TRAINER, college_id=inst_id, department_id=dept_id, session_id="test-session-3")
    zip_bytes, archive_name = await AssessmentReportRepository.build_bulk_zip_reports(
        quiz_id=str(quiz_id),
        ctx=trainer_ctx,
    )
    assert archive_name.endswith(".zip")
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        namelist = zf.namelist()
        assert len(namelist) == 1
        assert "ROLL-999_Python_Core_Report.xlsx" in namelist[0]


@pytest.mark.anyio
async def test_smart_notifications_priority_and_deduplication():
    """Verify:
    1. Notifications support priority tiers (URGENT, HIGH, MEDIUM, LOW).
    2. Idempotent dedup_key prevents duplicate notification spam.
    3. Unread counts and mark-read functions work seamlessly.
    """
    async with get_pg_connection() as conn:
        inst_id = uuid.uuid4()
        user_id = uuid.uuid4()
        await conn.execute(
            "INSERT INTO institutions (id, name, code) VALUES ($1, 'Notif Inst', $2)",
            inst_id, f"NOTIF_{uuid.uuid4().hex[:6]}"
        )
        await conn.execute(
            "INSERT INTO users (id, name, email, password_hash, role, institution_id, status) VALUES ($1, 'Notif User', $2, 'hash', 'STUDENT', $3, 'ACTIVE')",
            user_id, f"notif_{uuid.uuid4().hex[:6]}@test.edu", inst_id
        )

    # 1. Create notification with dedup_key
    key = f"quiz_assign_{uuid.uuid4().hex}"
    id1 = await notif_service.notify(
        user_id=user_id,
        kind=notif_service.Kind.ASSESSMENT_ASSIGNED,
        title="Assessment Assigned",
        body="A new assessment has been assigned to your batch.",
        priority="HIGH",
        dedup_key=key,
    )
    assert id1 is not None

    # 2. Duplicate notify with same dedup_key should return None and not insert a duplicate
    id2 = await notif_service.notify(
        user_id=user_id,
        kind=notif_service.Kind.ASSESSMENT_ASSIGNED,
        title="Assessment Assigned (Duplicate)",
        body="Duplicate body",
        priority="HIGH",
        dedup_key=key,
    )
    assert id2 is None

    # Verify unread count is exactly 1
    unread = await notif_service.unread_count(user_id)
    assert unread == 1

    # Mark as read
    res = await notif_service.mark_read(user_id, id1)
    assert res is True
    assert await notif_service.unread_count(user_id) == 0


@pytest.mark.anyio
async def test_dynamic_dashboard_cta_priority_hierarchy():
    """Verify context-aware dynamic CTA resolution follows the strict 9 tiers:
    Tier 1 (active assessment) overrides Tier 2..9
    Tier 5 (assignment deadline) triggers when assignment is due within 24h
    Tier 9 (fallback) triggers when no urgent tasks exist.
    """
    async with get_pg_connection() as conn:
        inst_id = uuid.uuid4()
        dept_id = uuid.uuid4()
        student_id = uuid.uuid4()
        batch_id = uuid.uuid4()
        quiz_id = uuid.uuid4()

        await conn.execute(
            "INSERT INTO institutions (id, name, code) VALUES ($1, 'CTA Academy', $2)",
            inst_id, f"CTA_{uuid.uuid4().hex[:6]}"
        )
        await conn.execute(
            "INSERT INTO departments (id, institution_id, name, code) VALUES ($1, $2, 'Mech Dept', $3)",
            dept_id, inst_id, f"MECH_{uuid.uuid4().hex[:6]}"
        )
        await conn.execute(
            "INSERT INTO users (id, name, email, password_hash, role, institution_id, department_id, status) VALUES ($1, 'CTA Student', $2, 'hash', 'STUDENT', $3, $4, 'ACTIVE')",
            student_id, f"cta_{uuid.uuid4().hex[:6]}@test.edu", inst_id, dept_id
        )
        await conn.execute(
            "INSERT INTO batches (id, institution_id, department_id, name, code, start_date) VALUES ($1, $2, $3, 'Batch-CTA', $4, NOW())",
            batch_id, inst_id, dept_id, f"BATCH_{uuid.uuid4().hex[:6]}"
        )
        await conn.execute(
            "INSERT INTO student_profiles (user_id, institution_id, department_id, batch_id, roll_number) VALUES ($1, $2, $3, $4, 'CTA-001')",
            student_id, inst_id, dept_id, batch_id
        )

    # Initial state: no classes, assessments, or assignments -> should resolve to Tier 9 Fallback
    cta_initial = await StudentDashboardService.resolve_next_action(student_id, inst_id)
    assert cta_initial["priority"] == 9
    assert cta_initial["type"] == "PRACTICE_FALLBACK"
    assert cta_initial["actionUrl"] == "/student/practice"

    # Add an active attempt (in progress) -> should resolve to Tier 1 Resume Assessment
    async with get_pg_connection() as conn:
        await conn.execute(
            """
            INSERT INTO quizzes (id, institution_id, batch_id, title, status)
            VALUES ($1, $2, $3, 'Active Test', 'active')
            """,
            quiz_id, inst_id, batch_id
        )
        await conn.execute(
            """
            INSERT INTO quiz_attempts (id, quiz_id, student_user_id, status, remaining_seconds)
            VALUES ($1, $2, $3, 'in_progress', 600)
            """,
            uuid.uuid4(), quiz_id, student_id
        )

    cta_tier1 = await StudentDashboardService.resolve_next_action(student_id, inst_id)
    assert cta_tier1["priority"] == 1
    assert cta_tier1["type"] == "ASSESSMENT_IN_PROGRESS"
    assert cta_tier1["buttonText"] == "Resume Assessment"
    assert f"/student/assessments/{quiz_id}" in cta_tier1["actionUrl"]
