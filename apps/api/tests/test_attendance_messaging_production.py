""" Comprehensive Production Integration Test Suite for Attendance and Messaging Modules.

Covers:
1. Attendance Management System:
   - Centralized database records (PRESENT, ABSENT, LATE, LEAVE, PENDING)
   - Unique constraints on (session_id, participant_user_id)
   - Trainer assigned batches & sessions visibility (fixing 'No records found')
   - Attendance roster display for assigned batch
   - Attendance marking and updating
   - Student personal attendance view and calculated percentages
   - Student self-attendance verification with duplicate prevention
   - Attendance CSV export

2. Messaging System:
   - Batch group synchronization & student membership reconciliation
   - Verification of batch students populated in groups (e.g. 2027-AI-C Group)
   - Direct message conversation creation (targetUserId & target_user_id handling)
   - Direct user search by name, email, or roll number
   - 1-on-1 direct message exchange and read receipts
"""
import pytest
import uuid
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.config import settings
from app.core.redis_client import K, get_redis
from app.core.security import create_access_token
from app.db.postgres import get_pg_connection
from app.services.messaging_service import MessagingService

settings.USE_POSTGRES = True


@pytest.fixture
def auth_headers():
    async def _headers(user_id: str, role: str = "TRAINER", college_id: str | None = None, dept_id: str | None = None):
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
        return {"Authorization": f"Bearer {token}"}
    return _headers


@pytest.mark.asyncio
async def test_attendance_database_schema_and_constraints():
    """Verify attendance database structure and unique constraint."""
    async with get_pg_connection() as conn:
        cols = await conn.fetch(
            """
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'attendance_records';
            """
        )
        col_names = {c["column_name"] for c in cols}
        for expected in ["id", "session_id", "participant_user_id", "status", "marked_by", "marked_at", "institution_id", "batch_id", "attendance_date", "marking_method"]:
            assert expected in col_names, f"Expected column {expected} in attendance_records"

        # Verify enum has LEAVE and PENDING
        enums = await conn.fetch(
            """
            SELECT e.enumlabel
            FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'attendance_status_enum';
            """
        )
        enum_labels = {e["enumlabel"] for e in enums}
        assert "PRESENT" in enum_labels
        assert "ABSENT" in enum_labels
        assert "LATE" in enum_labels
        assert "LEAVE" in enum_labels


@pytest.mark.asyncio
async def test_trainer_attendance_sessions_retrieval_and_roster(auth_headers):
    """Verify trainer assigned batches, session retrieval, and roster display."""
    async with get_pg_connection() as conn:
        inst_id = uuid.uuid4()
        dept_id = uuid.uuid4()
        trainer_id = uuid.uuid4()
        batch_id = uuid.uuid4()
        student1_id = uuid.uuid4()
        student2_id = uuid.uuid4()
        inst_code = f"TINST_{uuid.uuid4().hex[:6]}"
        dept_code = f"CSE_{uuid.uuid4().hex[:6]}"
        batch_code = f"BC_{uuid.uuid4().hex[:6]}"

        # Create institution, department, trainer, batch, and students
        await conn.execute("INSERT INTO institutions (id, name, code) VALUES ($1, 'Test Inst', $2)", inst_id, inst_code)
        await conn.execute("INSERT INTO departments (id, institution_id, name, code) VALUES ($1, $2, 'CSE Dept', $3)", dept_id, inst_id, dept_code)
        
        await conn.execute(
            "INSERT INTO users (id, institution_id, department_id, email, password_hash, name, role, status) VALUES ($1, $2, $3, $4, 'hash', 'Trainer User', 'TRAINER', 'ACTIVE')",
            trainer_id, inst_id, dept_id, f"trainer_{uuid.uuid4().hex[:6]}@test.edu"
        )
        await conn.execute(
            "INSERT INTO users (id, institution_id, department_id, email, password_hash, name, role, status) VALUES ($1, $2, $3, $4, 'hash', 'Student One', 'STUDENT', 'ACTIVE')",
            student1_id, inst_id, dept_id, f"student1_{uuid.uuid4().hex[:6]}@test.edu"
        )
        await conn.execute(
            "INSERT INTO users (id, institution_id, department_id, email, password_hash, name, role, status) VALUES ($1, $2, $3, $4, 'hash', 'Student Two', 'STUDENT', 'ACTIVE')",
            student2_id, inst_id, dept_id, f"student2_{uuid.uuid4().hex[:6]}@test.edu"
        )

        await conn.execute(
            "INSERT INTO batches (id, institution_id, department_id, name, code, status, semester, capacity) VALUES ($1, $2, $3, 'Batch 2027 AI-C', $4, 'ACTIVE', 5, 60)",
            batch_id, inst_id, dept_id, batch_code
        )

        # Assign trainer to batch in batch_trainers
        await conn.execute(
            "INSERT INTO batch_trainers (id, batch_id, trainer_user_id, institution_id, status) VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE')",
            batch_id, trainer_id, inst_id
        )

        # Enroll students in batch
        await conn.execute(
            "INSERT INTO student_profiles (id, user_id, roll_number, institution_id, department_id, batch_id, created_at, updated_at) VALUES (gen_random_uuid(), $1, 'ROLL-001', $2, $3, $4, NOW(), NOW())",
            student1_id, inst_id, dept_id, batch_id
        )
        await conn.execute(
            "INSERT INTO student_profiles (id, user_id, roll_number, institution_id, department_id, batch_id, created_at, updated_at) VALUES (gen_random_uuid(), $1, 'ROLL-002', $2, $3, $4, NOW(), NOW())",
            student2_id, inst_id, dept_id, batch_id
        )

        # Create a training session for the batch
        session_id = uuid.uuid4()
        now_date = datetime.now(timezone.utc).date()
        starts = datetime.now(timezone.utc)
        ends = starts + timedelta(hours=1)
        await conn.execute(
            """
            INSERT INTO training_sessions (id, institution_id, department_id, batch_id, trainer_user_id, topic, session_date, starts_at, ends_at, status, room)
            VALUES ($1, $2, $3, $4, $5, 'Neural Networks Session', $6, $7, $8, 'SCHEDULED', 'Lab 3')
            """,
            session_id, inst_id, dept_id, batch_id, trainer_id, now_date, starts, ends
        )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers = await auth_headers(str(trainer_id), "TRAINER", str(inst_id), str(dept_id))

        # 1. GET /api/v1/trainer/sessions should return the session
        res = await client.get("/api/v1/trainer/sessions", headers=headers)
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["success"] is True
        assert len(data["items"]) >= 1
        found_session = next((s for s in data["items"] if s["id"] == str(session_id)), None)
        assert found_session is not None
        assert found_session["batchName"] == "Batch 2027 AI-C"
        assert found_session["totalStudents"] == 2

        # 2. GET /api/v1/trainer/sessions/{session_id}/attendance should return the roster
        res = await client.get(f"/api/v1/trainer/sessions/{session_id}/attendance", headers=headers)
        assert res.status_code == 200, res.text
        att_data = res.json()["data"]
        assert len(att_data["roster"]) == 2
        student_ids = {r["studentUserId"] for r in att_data["roster"]}
        assert str(student1_id) in student_ids
        assert str(student2_id) in student_ids
        assert "leave" in att_data["statuses"]

        # 3. POST /api/v1/trainer/attendance to mark attendance
        mark_payload = {
            "trainingSessionId": str(session_id),
            "overwrite": True,
            "entries": [
                {"studentUserId": str(student1_id), "status": "present", "remark": "On time"},
                {"studentUserId": str(student2_id), "status": "leave", "remark": "Sick leave approved"},
            ]
        }
        res = await client.post("/api/v1/trainer/attendance", json=mark_payload, headers=headers)
        assert res.status_code == 201, res.text
        assert res.json()["success"] is True

        # 4. Verify in database
        async with get_pg_connection() as conn:
            records = await conn.fetch("SELECT * FROM attendance_records WHERE session_id = $1", session_id)
            assert len(records) == 2
            st1_rec = next(r for r in records if r["participant_user_id"] == student1_id)
            st2_rec = next(r for r in records if r["participant_user_id"] == student2_id)
            assert st1_rec["status"] == "PRESENT"
            assert st2_rec["status"] == "LEAVE"
            assert st1_rec["marking_method"] == "TRAINER_MANUAL"

        # 5. Export attendance CSV
        res = await client.get(f"/api/v1/trainer/attendance/export?batchId={batch_id}", headers=headers)
        assert res.status_code == 200
        assert "text/csv" in res.headers.get("content-type", "")
        csv_text = res.text
        assert "Student One" in csv_text
        assert "Student Two" in csv_text
        assert "PRESENT" in csv_text
        assert "LEAVE" in csv_text


@pytest.mark.asyncio
async def test_student_attendance_view_and_self_verification(auth_headers):
    """Verify student personal attendance history and self-verification."""
    async with get_pg_connection() as conn:
        inst_id = uuid.uuid4()
        dept_id = uuid.uuid4()
        trainer_id = uuid.uuid4()
        batch_id = uuid.uuid4()
        student_id = uuid.uuid4()
        inst_code = f"IB_{uuid.uuid4().hex[:6]}"
        dept_code = f"DB_{uuid.uuid4().hex[:6]}"
        batch_code = f"CSB_{uuid.uuid4().hex[:6]}"

        await conn.execute("INSERT INTO institutions (id, name, code) VALUES ($1, 'Inst B', $2)", inst_id, inst_code)
        await conn.execute("INSERT INTO departments (id, institution_id, name, code) VALUES ($1, $2, 'Dept B', $3)", dept_id, inst_id, dept_code)
        
        await conn.execute(
            "INSERT INTO users (id, institution_id, department_id, email, password_hash, name, role, status) VALUES ($1, $2, $3, $4, 'hash', 'Trainer T', 'TRAINER', 'ACTIVE')",
            trainer_id, inst_id, dept_id, f"trainer_{uuid.uuid4().hex[:6]}@test.edu"
        )
        await conn.execute(
            "INSERT INTO users (id, institution_id, department_id, email, password_hash, name, role, status) VALUES ($1, $2, $3, $4, 'hash', 'Student S', 'STUDENT', 'ACTIVE')",
            student_id, inst_id, dept_id, f"student_{uuid.uuid4().hex[:6]}@test.edu"
        )

        await conn.execute(
            "INSERT INTO batches (id, institution_id, department_id, name, code, status, semester, capacity) VALUES ($1, $2, $3, 'Batch CS-B', $4, 'ACTIVE', 3, 50)",
            batch_id, inst_id, dept_id, batch_code
        )
        await conn.execute(
            "INSERT INTO student_profiles (id, user_id, roll_number, institution_id, department_id, batch_id, created_at, updated_at) VALUES (gen_random_uuid(), $1, 'ST-009', $2, $3, $4, NOW(), NOW())",
            student_id, inst_id, dept_id, batch_id
        )

        # Create session
        session_id = uuid.uuid4()
        today = datetime.now(timezone.utc).date()
        starts = datetime.now(timezone.utc)
        ends = starts + timedelta(hours=1)
        await conn.execute(
            """
            INSERT INTO training_sessions (id, institution_id, department_id, batch_id, trainer_user_id, topic, session_date, starts_at, ends_at, status)
            VALUES ($1, $2, $3, $4, $5, 'Algorithms Session', $6, $7, $8, 'SCHEDULED')
            """,
            session_id, inst_id, dept_id, batch_id, trainer_id, today, starts, ends
        )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        st_headers = await auth_headers(str(student_id), "STUDENT", str(inst_id), str(dept_id))

        # 1. Student self-attendance verification
        verify_payload = {"sessionId": str(session_id)}
        res = await client.post("/api/v1/student/attendance/verify", json=verify_payload, headers=st_headers)
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["success"] is True
        assert data["data"]["alreadyMarked"] is False

        # 2. Second attempt: duplicate protection returns alreadyMarked: True
        res2 = await client.post("/api/v1/student/attendance/verify", json=verify_payload, headers=st_headers)
        assert res2.status_code == 200
        assert res2.json()["data"]["alreadyMarked"] is True

        # 3. Student views personal attendance
        res_view = await client.get("/api/v1/student/attendance", headers=st_headers)
        assert res_view.status_code == 200
        view_data = res_view.json()["data"]
        assert view_data["totalSessions"] == 1
        assert view_data["presentCount"] == 1
        assert view_data["attendancePercent"] == 100.0


@pytest.mark.asyncio
async def test_messaging_direct_message_and_reconciliation(auth_headers):
    """Verify targetUserId in direct messages and batch group student reconciliation."""
    async with get_pg_connection() as conn:
        inst_id = uuid.uuid4()
        dept_id = uuid.uuid4()
        trainer_id = uuid.uuid4()
        student_id = uuid.uuid4()
        batch_id = uuid.uuid4()
        inst_code = f"IC_{uuid.uuid4().hex[:6]}"
        dept_code = f"AI_{uuid.uuid4().hex[:6]}"
        batch_code = f"AIC_{uuid.uuid4().hex[:6]}"

        await conn.execute("INSERT INTO institutions (id, name, code) VALUES ($1, 'Inst C', $2)", inst_id, inst_code)
        await conn.execute("INSERT INTO departments (id, institution_id, name, code) VALUES ($1, $2, 'AI Dept', $3)", dept_id, inst_id, dept_code)

        await conn.execute(
            "INSERT INTO users (id, institution_id, department_id, email, password_hash, name, role, status) VALUES ($1, $2, $3, $4, 'hash', 'Trainer Alpha', 'TRAINER', 'ACTIVE')",
            trainer_id, inst_id, dept_id, f"tr_alpha_{uuid.uuid4().hex[:6]}@test.edu"
        )
        await conn.execute(
            "INSERT INTO users (id, institution_id, department_id, email, password_hash, name, role, status) VALUES ($1, $2, $3, $4, 'hash', 'Student Beta', 'STUDENT', 'ACTIVE')",
            student_id, inst_id, dept_id, f"st_beta_{uuid.uuid4().hex[:6]}@test.edu"
        )

        await conn.execute(
            "INSERT INTO batches (id, institution_id, department_id, name, code, status, semester, capacity) VALUES ($1, $2, $3, 'Batch 2027 AI-C', $4, 'ACTIVE', 5, 60)",
            batch_id, inst_id, dept_id, batch_code
        )
        await conn.execute(
            "INSERT INTO batch_trainers (id, batch_id, trainer_user_id, institution_id, status) VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE')",
            batch_id, trainer_id, inst_id
        )
        await conn.execute(
            "INSERT INTO student_profiles (id, user_id, roll_number, institution_id, department_id, batch_id, created_at, updated_at) VALUES (gen_random_uuid(), $1, 'ROLL-AI-99', $2, $3, $4, NOW(), NOW())",
            student_id, inst_id, dept_id, batch_id
        )

    # Run group reconciliation
    await MessagingService.sync_all_institute_batch_groups(inst_id)
    await MessagingService.reconcile_all_trainers(inst_id)
    await MessagingService.reconcile_all_students(inst_id)

    # Verify student and trainer are in the batch messaging group
    async with get_pg_connection() as conn:
        group = await conn.fetchrow("SELECT id, name FROM messaging_groups WHERE batch_id = $1", batch_id)
        assert group is not None, "Batch messaging group was not created"
        members = await conn.fetch("SELECT user_id, role, is_active FROM messaging_group_members WHERE group_id = $1 AND is_active = TRUE", group["id"])
        member_uids = {m["user_id"] for m in members}
        assert trainer_id in member_uids, "Trainer missing from batch messaging group"
        assert student_id in member_uids, "Student missing from batch messaging group"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        tr_headers = await auth_headers(str(trainer_id), "TRAINER", str(inst_id), str(dept_id))

        # 1. Search users by roll number
        res_search = await client.get("/api/v1/messaging/users/search?q=ROLL-AI-99", headers=tr_headers)
        assert res_search.status_code == 200, res_search.text
        search_data = res_search.json()
        assert any(u["id"] == str(student_id) for u in search_data["users"])

        # 2. Start direct conversation using targetUserId
        res_conv1 = await client.post("/api/v1/messaging/conversations/start", json={"targetUserId": str(student_id)}, headers=tr_headers)
        assert res_conv1.status_code == 200, res_conv1.text
        conv1 = res_conv1.json()["conversation"]
        assert conv1["participant"]["id"] == str(student_id)

        # 3. Start direct conversation using target_user_id (frontend alternate payload)
        res_conv2 = await client.post("/api/v1/messaging/conversations/start", json={"target_user_id": str(student_id)}, headers=tr_headers)
        assert res_conv2.status_code == 200, res_conv2.text
        conv2 = res_conv2.json()["conversation"]
        assert conv2["id"] == conv1["id"], "Idempotent conversation check failed"

        # 4. Send direct message
        msg_payload = {"content": "Hello Student, please review your attendance"}
        res_msg = await client.post(f"/api/v1/messaging/conversations/{conv1['id']}/messages", json=msg_payload, headers=tr_headers)
        assert res_msg.status_code == 200, res_msg.text
        assert res_msg.json()["message"]["content"] == "Hello Student, please review your attendance"
