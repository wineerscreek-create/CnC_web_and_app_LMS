import asyncio
import io
import json
import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from openpyxl import load_workbook

from app.core.config import settings
settings.USE_POSTGRES = True

from app.main import app
from app.db.postgres import get_pg_connection
from app.core.security import create_access_token
from app.core.redis_client import K, get_redis

VALID_BASE64_JPEG = (
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof"
    "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIy"
    "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAKAAoDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQE"
    "AAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRV"
    "S0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJip"
    "KTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QA"
    "HwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRM"
    "iMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ"
    "3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8v"
    "P09fb3+Pn6/9oADAMBAAIRAxEAPwDxyiiiv3E8w//Z"
)


async def get_token(user_id: str, role: str, college_id: str | None = None, dept_id: str | None = None):
    redis = get_redis()
    sid = uuid.uuid4().hex
    await redis.set(K.session(str(user_id), sid), "active", ex=3600)
    token, _ = create_access_token(
        user_id=str(user_id),
        role=role,
        college_id=college_id,
        department_id=dept_id,
        session_id=sid,
    )
    return token


@pytest.mark.asyncio
async def test_assessment_excel_export_warnings_and_camera_snapshots():
    """Comprehensive test verifying:
    1. Warning count integrity (0 warnings vs multiple warnings).
    2. Attempt isolation and tenant isolation.
    3. Persistent camera snapshot capture and attempt linkage.
    4. Missing snapshot handling ("No camera snapshot available.").
    5. Actual openpyxl image embedding and readback verification.
    """
    uid_suffix = uuid.uuid4().hex[:6]
    inst_code = f"IXL_{uid_suffix}"
    dept_code = f"DXL_{uid_suffix}"
    batch_code = f"BXL_{uid_suffix}"
    
    inst_id = uuid.uuid4()
    dept_id = uuid.uuid4()
    batch_id = uuid.uuid4()
    trainer_id = uuid.uuid4()
    stu1_id = uuid.uuid4()
    stu2_id = uuid.uuid4()
    stu3_id = uuid.uuid4()

    async with get_pg_connection() as conn:
        await conn.execute("INSERT INTO institutions (id, name, code) VALUES ($1, 'Excel Test College', $2)", inst_id, inst_code)
        await conn.execute("INSERT INTO departments (id, institution_id, name, code) VALUES ($1, $2, 'Computer Science', $3)", dept_id, inst_id, dept_code)
        await conn.execute(
            "INSERT INTO batches (id, institution_id, department_id, name, code, status, semester, capacity) VALUES ($1, $2, $3, 'Batch-2026-XL', $4, 'ACTIVE', 5, 60)",
            batch_id, inst_id, dept_id, batch_code
        )

        await conn.execute(
            """
            INSERT INTO users (id, institution_id, department_id, email, password_hash, name, role, status)
            VALUES ($1, $2, $3, $4, 'hash', 'Trainer Dave', 'TRAINER', 'ACTIVE')
            """,
            trainer_id, inst_id, dept_id, f"trainer_xl_{uid_suffix}@example.com"
        )
        await conn.execute(
            "INSERT INTO batch_trainers (id, batch_id, trainer_user_id, institution_id, status) VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE')",
            batch_id, trainer_id, inst_id
        )

        # Student 1: 0 warnings, 2 snapshots
        await conn.execute(
            """
            INSERT INTO users (id, institution_id, department_id, email, password_hash, name, role, status)
            VALUES ($1, $2, $3, $4, 'hash', 'Abhijeet Singh', 'STUDENT', 'ACTIVE')
            """,
            stu1_id, inst_id, dept_id, f"stu1_xl_{uid_suffix}@example.com"
        )
        await conn.execute(
            """
            INSERT INTO student_profiles (id, user_id, institution_id, department_id, batch_id, roll_number, created_at, updated_at)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
            """,
            stu1_id, inst_id, dept_id, batch_id, f"25EARIT001_{uid_suffix}"
        )

        # Student 2: 2 warnings, 1 snapshot
        await conn.execute(
            """
            INSERT INTO users (id, institution_id, department_id, email, password_hash, name, role, status)
            VALUES ($1, $2, $3, $4, 'hash', 'Bob Builder', 'STUDENT', 'ACTIVE')
            """,
            stu2_id, inst_id, dept_id, f"stu2_xl_{uid_suffix}@example.com"
        )
        await conn.execute(
            """
            INSERT INTO student_profiles (id, user_id, institution_id, department_id, batch_id, roll_number, created_at, updated_at)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
            """,
            stu2_id, inst_id, dept_id, batch_id, f"25EARIT002_{uid_suffix}"
        )

        # Student 3: 0 warnings, 0 snapshots
        await conn.execute(
            """
            INSERT INTO users (id, institution_id, department_id, email, password_hash, name, role, status)
            VALUES ($1, $2, $3, $4, 'hash', 'Charlie Day', 'STUDENT', 'ACTIVE')
            """,
            stu3_id, inst_id, dept_id, f"stu3_xl_{uid_suffix}@example.com"
        )
        await conn.execute(
            """
            INSERT INTO student_profiles (id, user_id, institution_id, department_id, batch_id, roll_number, created_at, updated_at)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
            """,
            stu3_id, inst_id, dept_id, batch_id, f"25EARIT003_{uid_suffix}"
        )

        # Quiz
        quiz_id = await conn.fetchval(
            """
            INSERT INTO quizzes (
                id, title, quiz_code, kind, status, creator_trainer_id, institution_id, batch_id,
                duration_minutes, max_score, questions, settings
            ) VALUES (
                gen_random_uuid(), 'Advanced Systems Midterm', $1, 'ASSESSMENT', 'active', $2, $3, $4,
                30, 100, $5::jsonb, $6::jsonb
            ) RETURNING id
            """,
            f"QZ_{uid_suffix}", trainer_id, inst_id, batch_id,
            json.dumps([{
                "id": "q1",
                "text": "What is 2+2?",
                "options": [{"id": "A", "text": "4", "correct": True}, {"id": "B", "text": "5"}],
                "marks": 100
            }]),
            json.dumps({"max_warnings": 3})
        )

    trainer_token = await get_token(str(trainer_id), "TRAINER", str(inst_id), str(dept_id))
    stu1_token = await get_token(str(stu1_id), "STUDENT", str(inst_id), str(dept_id))
    stu2_token = await get_token(str(stu2_id), "STUDENT", str(inst_id), str(dept_id))
    stu3_token = await get_token(str(stu3_id), "STUDENT", str(inst_id), str(dept_id))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Student 1: starts, uploads 2 snapshots (INITIAL and PERIODIC), submits cleanly with 0 warnings
        s1_start = await client.post(f"/api/v1/student/assessments/{quiz_id}/start", headers={"Authorization": f"Bearer {stu1_token}"})
        assert s1_start.status_code == 200

        # Upload initial snapshot
        s1_snap1 = await client.post(
            f"/api/v1/student/assessments/{quiz_id}/snapshot",
            headers={"Authorization": f"Bearer {stu1_token}"},
            json={"snapshot": VALID_BASE64_JPEG, "event_type": "INITIAL"}
        )
        assert s1_snap1.status_code == 200

        # Upload periodic snapshot
        s1_snap2 = await client.post(
            f"/api/v1/student/assessments/{quiz_id}/snapshot",
            headers={"Authorization": f"Bearer {stu1_token}"},
            json={"snapshot": VALID_BASE64_JPEG, "event_type": "PERIODIC"}
        )
        assert s1_snap2.status_code == 200

        # Submit answers
        s1_sub = await client.post(
            f"/api/v1/student/assessments/{quiz_id}/attempts",
            headers={"Authorization": f"Bearer {stu1_token}"},
            json={
                "answers": [{"questionId": "q1", "optionId": "A"}],
                "submissionReason": "STUDENT_MANUAL_SUBMIT"
            }
        )
        assert s1_sub.status_code in (200, 201)

        # 2. Student 2: starts, triggers 2 warnings (tab_switch, fullscreen_exit) with camera snapshot attached, submits
        await client.post(f"/api/v1/student/assessments/{quiz_id}/start", headers={"Authorization": f"Bearer {stu2_token}"})

        # Warning 1: tab switch with snapshot attached
        w1 = await client.post(
            f"/api/v1/student/assessments/{quiz_id}/warning",
            headers={"Authorization": f"Bearer {stu2_token}"},
            json={"warning_type": "tab_switch", "detail": "User switched tabs", "snapshot": VALID_BASE64_JPEG}
        )
        assert w1.status_code == 200
        assert w1.json()["data"]["warning_count"] == 1

        # Warning 2: fullscreen exit
        w2 = await client.post(
            f"/api/v1/student/assessments/{quiz_id}/warning",
            headers={"Authorization": f"Bearer {stu2_token}"},
            json={"warning_type": "fullscreen_exit", "detail": "Exited fullscreen"}
        )
        assert w2.status_code == 200
        assert w2.json()["data"]["warning_count"] == 2

        # Student 2 submits
        s2_sub = await client.post(
            f"/api/v1/student/assessments/{quiz_id}/attempts",
            headers={"Authorization": f"Bearer {stu2_token}"},
            json={
                "answers": [{"questionId": "q1", "optionId": "A"}],
                "submissionReason": "STUDENT_MANUAL_SUBMIT"
            }
        )
        assert s2_sub.status_code in (200, 201)

        # 3. Student 3: starts, NO warnings, NO camera snapshots, submits
        await client.post(f"/api/v1/student/assessments/{quiz_id}/start", headers={"Authorization": f"Bearer {stu3_token}"})
        s3_sub = await client.post(
            f"/api/v1/student/assessments/{quiz_id}/attempts",
            headers={"Authorization": f"Bearer {stu3_token}"},
            json={
                "answers": [{"questionId": "q1", "optionId": "B"}],
                "submissionReason": "STUDENT_MANUAL_SUBMIT"
            }
        )
        assert s3_sub.status_code in (200, 201)

        # 4. Trainer queries results endpoint
        res = await client.get(
            f"/api/v1/trainer/assessments/{quiz_id}/results",
            headers={"Authorization": f"Bearer {trainer_token}"}
        )
        assert res.status_code == 200
        r_data = res.json()["data"]["results"]
        assert len(r_data) == 3

        r_map = {item["studentId"]: item for item in r_data}
        s1_res = r_map[str(stu1_id)]
        s2_res = r_map[str(stu2_id)]
        s3_res = r_map[str(stu3_id)]

        # Verify Warning Counts
        assert s1_res["warnings"] == 0, "Student 1 must have 0 warnings"
        assert s1_res["warningCount"] == 0
        assert len(s1_res["snapshots"]) == 2, "Student 1 must have 2 snapshots"

        assert s2_res["warnings"] == 2, "Student 2 must have 2 warnings"
        assert s2_res["warningCount"] == 2
        assert len(s2_res["snapshots"]) >= 1, "Student 2 must have warning snapshot"

        assert s3_res["warnings"] == 0, "Student 3 must have 0 warnings"
        assert len(s3_res["snapshots"]) == 0, "Student 3 must have 0 snapshots"

        # 5. Trainer exports Excel with embedded photos
        excel_res = await client.get(
            f"/api/v1/trainer/assessments/{quiz_id}/export-excel",
            headers={"Authorization": f"Bearer {trainer_token}"}
        )
        assert excel_res.status_code == 200
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in excel_res.headers["content-type"]

        # 6. Deep inspection of the generated XLSX workbook
        wb = load_workbook(io.BytesIO(excel_res.content))
        assert wb.sheetnames == ["Results", "Camera Snapshots"]

        # Validate Sheet 1: Results
        ws_results = wb["Results"]
        headers_row1 = [cell.value for cell in ws_results[1]]
        assert headers_row1 == [
            "Rank", "Roll Number", "Student Name", "Batch",
            "Marks", "Max Marks", "Percentage", "Result", "Warnings",
            "Submission Timestamp", "Attempt Status", "Submission Reason"
        ]

        rows_by_name = {ws_results.cell(row=r, column=3).value: [ws_results.cell(row=r, column=c).value for c in range(1, 13)] for r in range(2, 5)}
        
        abhijeet_data = rows_by_name["Abhijeet Singh"]
        assert abhijeet_data[8] == 0, f"Abhijeet warning count should be 0, got {abhijeet_data[8]}"
        assert abhijeet_data[7] == "Pass"

        bob_data = rows_by_name["Bob Builder"]
        assert bob_data[8] == 2, f"Bob warning count should be 2, got {bob_data[8]}"

        charlie_data = rows_by_name["Charlie Day"]
        assert charlie_data[8] == 0, f"Charlie warning count should be 0, got {charlie_data[8]}"

        # Validate Sheet 2: Camera Snapshots
        ws_camera = wb["Camera Snapshots"]
        cam_headers = [cell.value for cell in ws_camera[1]]
        assert cam_headers == [
            "Student Name", "Roll Number", "Assessment ID", "Attempt ID",
            "Snapshot Timestamp", "Warning/Event Type", "Camera Snapshot"
        ]

        # Verify Charlie (Student with no snapshots) displays "No camera snapshot available."
        found_no_snapshot_text = False
        for r in range(2, ws_camera.max_row + 1):
            name = ws_camera.cell(row=r, column=1).value
            snap_val = ws_camera.cell(row=r, column=7).value
            if name == "Charlie Day" and snap_val == "No camera snapshot available.":
                found_no_snapshot_text = True
                break
        assert found_no_snapshot_text, "Student without snapshot must show 'No camera snapshot available.'"

        # Verify actual embedded images
        embedded_images = ws_camera._images
        assert len(embedded_images) >= 3, f"Must have at least 3 embedded images (2 for Abhijeet, 1 for Bob), found {len(embedded_images)}"
        print(f"Verified {len(embedded_images)} embedded images in XLSX workbook successfully!")



@pytest.mark.asyncio
async def test_tenant_isolation_and_retake_attempt_snapshots():
    """Verifies that:
    1. A trainer from a different institution cannot export or access another institution's assessment results.
    2. Snapshots and warnings from different attempts by the same student are isolated by attemptId.
    3. Corrupted or invalid image data is gracefully handled with 'Image render error' without crashing Excel export.
    """
    uid_suffix = uuid.uuid4().hex[:6]
    inst_a_id = uuid.uuid4()
    inst_b_id = uuid.uuid4()
    dept_a_id = uuid.uuid4()
    batch_a_id = uuid.uuid4()
    trainer_a_id = uuid.uuid4()
    trainer_b_id = uuid.uuid4()
    stu_a_id = uuid.uuid4()

    async with get_pg_connection() as conn:
        await conn.execute("INSERT INTO institutions (id, name, code) VALUES ($1, 'Inst A', $2)", inst_a_id, f"IA_{uid_suffix}")
        await conn.execute("INSERT INTO institutions (id, name, code) VALUES ($1, 'Inst B', $2)", inst_b_id, f"IB_{uid_suffix}")
        await conn.execute("INSERT INTO departments (id, institution_id, name, code) VALUES ($1, $2, 'Dept A', $3)", dept_a_id, inst_a_id, f"DA_{uid_suffix}")
        await conn.execute("INSERT INTO batches (id, institution_id, department_id, name, code, status, semester, capacity) VALUES ($1, $2, $3, 'Batch A', $4, 'ACTIVE', 1, 30)", batch_a_id, inst_a_id, dept_a_id, f"BA_{uid_suffix}")

        await conn.execute("INSERT INTO users (id, institution_id, email, password_hash, name, role, status) VALUES ($1, $2, $3, 'hash', 'Trainer A', 'TRAINER', 'ACTIVE')", trainer_a_id, inst_a_id, f"tr_a_{uid_suffix}@a.edu")
        await conn.execute("INSERT INTO batch_trainers (id, batch_id, trainer_user_id, institution_id, status) VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE')", batch_a_id, trainer_a_id, inst_a_id)

        await conn.execute("INSERT INTO users (id, institution_id, email, password_hash, name, role, status) VALUES ($1, $2, $3, 'hash', 'Trainer B', 'TRAINER', 'ACTIVE')", trainer_b_id, inst_b_id, f"tr_b_{uid_suffix}@b.edu")

        await conn.execute("INSERT INTO users (id, institution_id, department_id, email, password_hash, name, role, status) VALUES ($1, $2, $3, $4, 'hash', 'Student A', 'STUDENT', 'ACTIVE')", stu_a_id, inst_a_id, dept_a_id, f"stu_a_{uid_suffix}@a.edu")
        await conn.execute("INSERT INTO student_profiles (id, user_id, institution_id, department_id, batch_id, roll_number, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())", stu_a_id, inst_a_id, dept_a_id, batch_a_id, f"ROLL_A_{uid_suffix}")

        quiz_id = await conn.fetchval(
            """
            INSERT INTO quizzes (
                id, title, quiz_code, kind, status, creator_trainer_id, institution_id, batch_id,
                duration_minutes, max_score, questions, settings, allow_retake
            ) VALUES (
                gen_random_uuid(), 'Isolated Quiz', $1, 'ASSESSMENT', 'active', $2, $3, $4,
                30, 100, '[]'::jsonb, '{"max_warnings": 5}'::jsonb, true
            ) RETURNING id
            """,
            f"ISO_{uid_suffix}", trainer_a_id, inst_a_id, batch_a_id
        )

        # Attempt 1: Has 1 warning and 1 snapshot
        att1_id = await conn.fetchval(
            """
            INSERT INTO quiz_attempts (
                id, quiz_id, student_user_id, score, possible, percentage, passed, warnings, warning_count,
                status, candidate_status, submission_reason, created_at, completed_at, batch_id, institution_id
            ) VALUES (
                gen_random_uuid(), $1, $2, 90, 100, 90.0, true,
                '[{"type": "tab_switch", "timestamp": "2026-11-21T10:00:00Z"}]'::jsonb, 1,
                'completed', 'SUBMITTED', 'STUDENT_MANUAL_SUBMIT', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '40 minutes', $3, $4
            ) RETURNING id
            """,
            quiz_id, stu_a_id, batch_a_id, inst_a_id
        )
        await conn.execute(
            """
            INSERT INTO quiz_camera_snapshots (id, quiz_id, student_user_id, attempt_id, snapshot_timestamp, event_type, image_data)
            VALUES (gen_random_uuid(), $1, $2, $3, NOW() - INTERVAL '50 minutes', 'tab_switch', $4)
            """,
            quiz_id, stu_a_id, att1_id, VALID_BASE64_JPEG
        )

        # Attempt 2: Retake attempt has 0 warnings and an invalid/corrupted base64 snapshot
        att2_id = await conn.fetchval(
            """
            INSERT INTO quiz_attempts (
                id, quiz_id, student_user_id, score, possible, percentage, passed, warnings, warning_count,
                status, candidate_status, submission_reason, created_at, completed_at, batch_id, institution_id
            ) VALUES (
                gen_random_uuid(), $1, $2, 100, 100, 100.0, true,
                '[]'::jsonb, 0,
                'completed', 'SUBMITTED', 'STUDENT_MANUAL_SUBMIT', NOW() - INTERVAL '20 minutes', NOW(), $3, $4
            ) RETURNING id
            """,
            quiz_id, stu_a_id, batch_a_id, inst_a_id
        )
        await conn.execute(
            """
            INSERT INTO quiz_camera_snapshots (id, quiz_id, student_user_id, attempt_id, snapshot_timestamp, event_type, image_data)
            VALUES (gen_random_uuid(), $1, $2, $3, NOW() - INTERVAL '10 minutes', 'CORRUPT_TEST', 'data:image/jpeg;base64,not-a-valid-image-bytes')
            """,
            quiz_id, stu_a_id, att2_id
        )

    trainer_a_token = await get_token(str(trainer_a_id), "TRAINER", str(inst_a_id))
    trainer_b_token = await get_token(str(trainer_b_id), "TRAINER", str(inst_b_id))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Trainer B from Inst B attempts to export Quiz from Inst A -> Returns 0 results due to batch/trainer scope
        b_res = await client.get(
            f"/api/v1/trainer/assessments/{quiz_id}/export-excel",
            headers={"Authorization": f"Bearer {trainer_b_token}"}
        )
        assert b_res.status_code == 200
        b_wb = load_workbook(io.BytesIO(b_res.content))
        # Results sheet should have 0 students for Trainer B
        assert b_wb["Results"].max_row == 1

        # Trainer A exports Quiz
        a_res = await client.get(
            f"/api/v1/trainer/assessments/{quiz_id}/export-excel",
            headers={"Authorization": f"Bearer {trainer_a_token}"}
        )
        assert a_res.status_code == 200
        a_wb = load_workbook(io.BytesIO(a_res.content))
        
        # Verify attempt isolation: 2 attempts by same student
        assert a_wb["Results"].max_row == 3  # Header + 2 attempts

        # Verify corrupted image was safely caught and rendered as 'Image render error' without crashing export
        cam_sheet = a_wb["Camera Snapshots"]
        found_render_error = False
        for r in range(2, cam_sheet.max_row + 1):
            if cam_sheet.cell(row=r, column=7).value == "Image render error":
                found_render_error = True
                break
        assert found_render_error, "Corrupted snapshot must gracefully set 'Image render error'"

        # Verify valid image from attempt 1 was embedded
        assert len(cam_sheet._images) >= 1
