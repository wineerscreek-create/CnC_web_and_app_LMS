import pytest
import uuid
import json
import io
import base64
from openpyxl import load_workbook
from PIL import Image as PILImage

from app.authz.context import ScopeContext, Role
from app.db.postgres import get_pg_connection
from app.repositories.assignment_quiz_repo import QuizRepository, _safe_uuid
from app.schemas.requests import QuizFeedbackCreate
from app.core.errors import Conflict, NotFound, ScopeForbidden, ValidationError, BusinessRuleViolation


def create_dummy_base64_image(color="blue", size=(100, 100)) -> str:
    img = PILImage.new("RGB", size, color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")


@pytest.mark.asyncio
async def test_quiz_feedback_lifecycle_and_rules():
    """Verifies end-to-end feedback submission, validation rules, duplicate prevention, and trainer retrieval."""
    test_inst_id = uuid.UUID("9caf9546-65e8-5f1a-87f7-02ce97c3a245")
    other_inst_id = uuid.UUID("5a1ba6f9-bc13-444b-8801-6abd2c4a9b01")

    student_id = uuid.uuid4()
    other_student_id = uuid.uuid4()
    trainer_id = uuid.uuid4()
    other_trainer_id = uuid.uuid4()

    quiz_id = uuid.uuid4()
    attempt_id = uuid.uuid4()
    in_progress_attempt_id = uuid.uuid4()

    async with get_pg_connection() as conn:
        # Create users
        u_suffix = uuid.uuid4().hex[:8]
        await conn.execute(
            f"""
            INSERT INTO users (id, name, email, password_hash, role, institution_id, created_at, updated_at)
            VALUES 
                ($1, 'Student Alpha', 'student.alpha.{u_suffix}@test.com', 'mock_hash', 'STUDENT', $3, NOW(), NOW()),
                ($2, 'Student Beta', 'student.beta.{u_suffix}@test.com', 'mock_hash', 'STUDENT', $3, NOW(), NOW()),
                ($4, 'Trainer T1', 'trainer.t1.{u_suffix}@test.com', 'mock_hash', 'TRAINER', $3, NOW(), NOW()),
                ($5, 'Trainer Other', 'trainer.other.{u_suffix}@test.com', 'mock_hash', 'TRAINER', $6, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING
            """,
            student_id, other_student_id, test_inst_id, trainer_id, other_trainer_id, other_inst_id
        )

        # Create student profile with roll number
        stu_roll = f"ROLL-{u_suffix}"
        await conn.execute(
            f"""
            INSERT INTO student_profiles (user_id, roll_number, institution_id)
            VALUES ($1, '{stu_roll}', $2)
            ON CONFLICT (user_id) DO UPDATE SET roll_number = '{stu_roll}'
            """,
            student_id, test_inst_id
        )

        # Create Quiz
        await conn.execute(
            """
            INSERT INTO quizzes (id, title, creator_trainer_id, institution_id, duration_minutes, max_score, created_at, updated_at)
            VALUES ($1, 'Feedback Integration Test Quiz', $2, $3, 30, 100, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING
            """,
            quiz_id, trainer_id, test_inst_id
        )

        # Create completed attempt for student_id
        await conn.execute(
            """
            INSERT INTO quiz_attempts (
                id, quiz_id, student_user_id, score, possible, answers, status, candidate_status, completed_at, institution_id
            ) VALUES (
                $1, $2, $3, 85, 100, '{"q1": ["optA"]}'::jsonb, 'completed', 'SUBMITTED', NOW(), $4
            )
            ON CONFLICT (id) DO NOTHING
            """,
            attempt_id, quiz_id, student_id, test_inst_id
        )

        # Create IN_PROGRESS attempt (not completed)
        await conn.execute(
            """
            INSERT INTO quiz_attempts (
                id, quiz_id, student_user_id, score, possible, answers, status, candidate_status, institution_id
            ) VALUES (
                $1, $2, $3, 0, 100, '{}'::jsonb, 'in_progress', 'IN_PROGRESS', $4
            )
            ON CONFLICT (id) DO NOTHING
            """,
            in_progress_attempt_id, quiz_id, student_id, test_inst_id
        )

    # 1. Student cannot submit feedback for an IN_PROGRESS attempt
    ctx_student = ScopeContext(
        user_id=student_id,
        role=Role.STUDENT,
        college_id=test_inst_id,
        department_id=None,
        session_id="sess_stu_1",
    )

    with pytest.raises(BusinessRuleViolation) as exc_in_prog:
        await QuizRepository.submit_quiz_feedback(
            ctx=ctx_student,
            quiz_id=str(quiz_id),
            attempt_id=str(in_progress_attempt_id),
            overall_rating=5,
            difficulty="Moderate",
            question_quality_rating=4,
            time_management="Sufficient",
            written_feedback="Great test",
        )
    assert "Feedback can only be submitted after completing" in str(exc_in_prog.value)

    # 2. Student cannot submit feedback for another student's attempt
    ctx_other_student = ScopeContext(
        user_id=other_student_id,
        role=Role.STUDENT,
        college_id=test_inst_id,
        department_id=None,
        session_id="sess_stu_2",
    )

    with pytest.raises(ScopeForbidden) as exc_authz:
        await QuizRepository.submit_quiz_feedback(
            ctx=ctx_other_student,
            quiz_id=str(quiz_id),
            attempt_id=str(attempt_id),
            overall_rating=5,
            difficulty="Moderate",
            question_quality_rating=4,
            time_management="Sufficient",
        )
    assert "not authorized to submit feedback for another student" in str(exc_authz.value)

    # 3. Invalid ratings / bounds are rejected
    with pytest.raises(ValidationError):
        await QuizRepository.submit_quiz_feedback(
            ctx=ctx_student,
            quiz_id=str(quiz_id),
            attempt_id=str(attempt_id),
            overall_rating=6,  # Invalid: > 5
            difficulty="Moderate",
            question_quality_rating=4,
            time_management="Sufficient",
        )

    with pytest.raises(ValidationError):
        await QuizRepository.submit_quiz_feedback(
            ctx=ctx_student,
            quiz_id=str(quiz_id),
            attempt_id=str(attempt_id),
            overall_rating=4,
            difficulty="Impossible",  # Invalid enum
            question_quality_rating=4,
            time_management="Sufficient",
        )

    # 4. Valid feedback submission succeeds
    sub_res = await QuizRepository.submit_quiz_feedback(
        ctx=ctx_student,
        quiz_id=str(quiz_id),
        attempt_id=str(attempt_id),
        overall_rating=5,
        difficulty="Moderate",
        question_quality_rating=4,
        time_management="Sufficient",
        written_feedback="Clear questions and fair timing.",
    )
    assert sub_res["overallRating"] == 5
    assert sub_res["difficulty"] == "Moderate"
    assert sub_res["questionQualityRating"] == 4
    assert sub_res["timeManagement"] == "Sufficient"
    assert sub_res["writtenFeedback"] == "Clear questions and fair timing."

    # Verify attempt answers and score were NOT modified
    async with get_pg_connection() as conn:
        att_check = await conn.fetchrow("SELECT score, status, answers FROM quiz_attempts WHERE id = $1", attempt_id)
        assert att_check["score"] == 85
        assert att_check["status"] == "completed"
        raw_ans = att_check["answers"]
        ans_dict = json.loads(raw_ans) if isinstance(raw_ans, str) else raw_ans
        assert ans_dict == {"q1": ["optA"]}

    # 5. Duplicate feedback for the same attempt is rejected with Conflict
    with pytest.raises(Conflict) as exc_dup:
        await QuizRepository.submit_quiz_feedback(
            ctx=ctx_student,
            quiz_id=str(quiz_id),
            attempt_id=str(attempt_id),
            overall_rating=4,
            difficulty="Easy",
            question_quality_rating=3,
            time_management="Insufficient",
        )
    assert "already been submitted" in str(exc_dup.value)

    # 6. Student can retrieve their persisted feedback (survives logout/login)
    stu_fb = await QuizRepository.get_student_quiz_feedback(
        ctx=ctx_student,
        quiz_id=str(quiz_id),
        attempt_id=str(attempt_id),
    )
    assert stu_fb is not None
    assert stu_fb["overallRating"] == 5
    assert stu_fb["difficulty"] == "Moderate"

    # Other student cannot see this feedback
    other_fb = await QuizRepository.get_student_quiz_feedback(
        ctx=ctx_other_student,
        quiz_id=str(quiz_id),
        attempt_id=str(attempt_id),
    )
    assert other_fb is None

    # 7. Authorized Trainer can retrieve aggregated summary and student feedback table
    ctx_trainer = ScopeContext(
        user_id=trainer_id,
        role=Role.TRAINER,
        college_id=test_inst_id,
        department_id=None,
        session_id="sess_tr_1",
    )

    trainer_fb = await QuizRepository.get_trainer_quiz_feedback(
        ctx=ctx_trainer,
        quiz_id=str(quiz_id),
        page=1,
        limit=20,
    )
    assert trainer_fb["quizId"] == str(quiz_id)
    summary = trainer_fb["summary"]
    assert summary["totalSubmissions"] == 1
    assert summary["averageOverallRating"] == 5.0
    assert summary["averageQuestionQualityRating"] == 4.0
    assert summary["difficultyDistribution"]["Moderate"] == 1
    assert summary["timeDistribution"]["Sufficient"] == 1

    items = trainer_fb["items"]
    assert len(items) == 1
    assert items[0]["studentName"] == "Student Alpha"
    assert items[0]["rollNumber"] == stu_roll
    assert items[0]["writtenFeedback"] == "Clear questions and fair timing."

    # 8. Trainer from another tenant cannot access feedback
    ctx_other_trainer = ScopeContext(
        user_id=other_trainer_id,
        role=Role.TRAINER,
        college_id=other_inst_id,
        department_id=None,
        session_id="sess_tr_other",
    )

    with pytest.raises(ScopeForbidden):
        await QuizRepository.get_trainer_quiz_feedback(
            ctx=ctx_other_trainer,
            quiz_id=str(quiz_id),
            page=1,
            limit=20,
        )


@pytest.mark.asyncio
async def test_excel_export_structure_and_camera_snapshots():
    """Verifies Excel workbook generation, 2 sheets, exact column counts, 10 representative image limit, and formatting."""
    from app.routers.trainer import export_trainer_assessment_excel

    test_inst_id = uuid.UUID("9caf9546-65e8-5f1a-87f7-02ce97c3a245")
    trainer_id = uuid.uuid4()
    student1_id = uuid.uuid4()
    student2_id = uuid.uuid4()

    quiz_id = uuid.uuid4()
    attempt1_id = uuid.uuid4()
    attempt2_id = uuid.uuid4()

    dummy_img = create_dummy_base64_image(color="green", size=(120, 90))

    async with get_pg_connection() as conn:
        # Create users
        u_suffix2 = uuid.uuid4().hex[:8]
        await conn.execute(
            f"""
            INSERT INTO users (id, name, email, password_hash, role, institution_id, created_at, updated_at)
            VALUES 
                ($1, 'Candidate One', 'cand1.{u_suffix2}@test.com', 'mock_hash', 'STUDENT', $3, NOW(), NOW()),
                ($2, 'Candidate Two', 'cand2.{u_suffix2}@test.com', 'mock_hash', 'STUDENT', $3, NOW(), NOW()),
                ($4, 'Trainer Alpha', 'trainer.alpha.{u_suffix2}@test.com', 'mock_hash', 'TRAINER', $3, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING
            """,
            student1_id, student2_id, test_inst_id, trainer_id
        )

        roll1 = f"ROLL1-{u_suffix2}"
        roll2 = f"ROLL2-{u_suffix2}"
        await conn.execute(
            f"""
            INSERT INTO student_profiles (user_id, roll_number, institution_id)
            VALUES 
                ($1, '{roll1}', $3),
                ($2, '{roll2}', $3)
            ON CONFLICT (user_id) DO NOTHING
            """,
            student1_id, student2_id, test_inst_id
        )

        # Create Quiz
        await conn.execute(
            """
            INSERT INTO quizzes (id, title, creator_trainer_id, institution_id, duration_minutes, max_score, created_at, updated_at)
            VALUES ($1, 'Excel Export Comprehensive Test', $2, $3, 45, 100, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING
            """,
            quiz_id, trainer_id, test_inst_id
        )

        # Create attempt 1 with 2 warnings
        await conn.execute(
            """
            INSERT INTO quiz_attempts (
                id, quiz_id, student_user_id, score, possible, percentage, passed, warnings, warning_count,
                status, candidate_status, submission_reason, completed_at, institution_id
            ) VALUES (
                $1, $2, $3, 92, 100, 92.0, true, 
                '[{"eventType": "TAB_SWITCH"}, {"eventType": "FULLSCREEN_EXIT"}]'::jsonb, 
                2, 'completed', 'SUBMITTED', 'STUDENT_MANUAL_SUBMIT', NOW(), $4
            )
            ON CONFLICT (id) DO NOTHING
            """,
            attempt1_id, quiz_id, student1_id, test_inst_id
        )

        # Create attempt 2 with 0 warnings
        await conn.execute(
            """
            INSERT INTO quiz_attempts (
                id, quiz_id, student_user_id, score, possible, percentage, passed, warnings, warning_count,
                status, candidate_status, submission_reason, completed_at, institution_id
            ) VALUES (
                $1, $2, $3, 76, 100, 76.0, true, '[]'::jsonb, 0, 'completed', 'SUBMITTED', 'STUDENT_MANUAL_SUBMIT', NOW(), $4
            )
            ON CONFLICT (id) DO NOTHING
            """,
            attempt2_id, quiz_id, student2_id, test_inst_id
        )

        # Insert 18 snapshots for Student 1 (to test 10 representative selection when > 10)
        for i in range(18):
            snap_id = uuid.uuid4()
            await conn.execute(
                f"""
                INSERT INTO quiz_camera_snapshots (
                    id, quiz_id, student_user_id, attempt_id, snapshot_timestamp, event_type, image_data, created_at
                ) VALUES (
                    $1, $2, $3, $4, NOW() - INTERVAL '{18 - i}0 seconds', 'PERIODIC', $5, NOW()
                )
                """,
                snap_id, quiz_id, student1_id, attempt1_id, dummy_img
            )

        # Insert 3 snapshots for Student 2 (to test unavailable slots when < 10)
        for i in range(3):
            snap_id = uuid.uuid4()
            await conn.execute(
                f"""
                INSERT INTO quiz_camera_snapshots (
                    id, quiz_id, student_user_id, attempt_id, snapshot_timestamp, event_type, image_data, created_at
                ) VALUES (
                    $1, $2, $3, $4, NOW() - INTERVAL '{3 - i}0 seconds', 'PERIODIC', $5, NOW()
                )
                """,
                snap_id, quiz_id, student2_id, attempt2_id, dummy_img
            )

    ctx_trainer = ScopeContext(
        user_id=trainer_id,
        role=Role.TRAINER,
        college_id=test_inst_id,
        department_id=None,
        session_id="sess_tr_excel",
    )

    response = await export_trainer_assessment_excel(
        quiz_id=str(quiz_id),
        batchId=None,
        ctx=ctx_trainer,
    )

    # 1. Verify response status and media type
    assert response.status_code == 200
    assert response.media_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    content = response.body
    assert len(content) > 1000

    # 2. Open workbook with openpyxl
    wb = load_workbook(io.BytesIO(content))
    sheet_names = wb.sheetnames
    # Exactly TWO worksheets
    assert len(sheet_names) == 2
    assert sheet_names == ["Results", "Camera Snapshots"]

    # 3. Verify Sheet 1: Results
    ws_results = wb["Results"]
    res_headers = [cell.value for cell in ws_results[1]]
    expected_res_headers = [
        "Rank", "Roll Number", "Student Name", "Batch",
        "Marks", "Max Marks", "Percentage", "Result", "Warnings",
        "Submission Timestamp", "Attempt Status", "Submission Reason",
        "Assessment ID", "Attempt ID", "Warning Count", "Event Type"
    ]
    assert res_headers == expected_res_headers

    # Check rows in Results
    assert ws_results.max_row == 3  # Header + 2 students
    row2 = [cell.value for cell in ws_results[2]]
    assert row2[1] == roll1
    assert row2[2] == "Candidate One"
    assert row2[4] == 92  # Marks
    assert row2[8] == 2   # Warnings count accurately preserved!
    assert "TAB_SWITCH" in str(row2[15]) or "FULLSCREEN_EXIT" in str(row2[15])

    row3 = [cell.value for cell in ws_results[3]]
    assert row3[1] == roll2
    assert row3[4] == 76  # Marks
    assert row3[8] == 0   # 0 warnings accurately preserved!

    # 4. Verify Sheet 2: Camera Snapshots
    ws_camera = wb["Camera Snapshots"]
    cam_headers = [cell.value for cell in ws_camera[1]]
    expected_cam_headers = [
        "Student Name", "Roll Number",
        "Snapshot 1", "Snapshot 2", "Snapshot 3", "Snapshot 4", "Snapshot 5",
        "Snapshot 6", "Snapshot 7", "Snapshot 8", "Snapshot 9", "Snapshot 10"
    ]
    assert cam_headers == expected_cam_headers
    assert len(cam_headers) == 12

    # Exactly ONE row per student attempt!
    assert ws_camera.max_row == 3  # Header + 2 student rows!

    # Check student 1 (had 18 snapshots -> selected exactly 10 representative)
    stu1_row = [cell.value for cell in ws_camera[2]]
    assert stu1_row[0] == "Candidate One"
    assert stu1_row[1] == roll1
    # All 10 snapshot slots must be populated with timestamp text
    for slot_idx in range(2, 12):
        val = str(stu1_row[slot_idx])
        assert val != "Unavailable"
        assert len(val.strip()) > 5

    # Check student 2 (had 3 snapshots -> 3 available, 7 marked "Unavailable")
    stu2_row = [cell.value for cell in ws_camera[3]]
    assert stu2_row[0] == "Candidate Two"
    assert stu2_row[1] == roll2
    # Slots 0, 1, 2 populated
    for slot_idx in range(2, 5):
        val = str(stu2_row[slot_idx])
        assert val != "Unavailable"
    # Slots 3 to 9 marked Unavailable
    for slot_idx in range(5, 12):
        val = str(stu2_row[slot_idx])
        assert val == "Unavailable"

    # Verify embedded openpyxl images exist in ws_camera
    assert len(ws_camera._images) >= 13  # 10 for stu1 + 3 for stu2
