import io
import uuid
from datetime import datetime, timedelta, timezone
import pytest
from openpyxl import load_workbook

from app.authz.roles import Role
from app.db.postgres import get_pg_connection
from app.repositories.assignment_quiz_repo import QuizRepository
from app.routers.assessment_realtime import (
    get_assessment_monitor_data,
    get_student_attempt_history,
)
from app.routers.trainer import (
    BatchExcelExportRequest,
    export_trainer_assessment_excel,
    export_trainer_assessment_excel_batch_scoped,
)
from app.websocket.assessment_ws import AssessmentHub


class DummyScope:
    def __init__(self, user_id: uuid.UUID, role: Role = Role.TRAINER):
        self.user_id = user_id
        self.role = role
        self.college_id = uuid.uuid4()
        self.department_id = uuid.uuid4()
        self.session_id = f"sess-{user_id}"
        self.email = f"u_{user_id}@test.com"


class DummyWebSocket:
    def __init__(self):
        self.sent: list[str] = []

    async def send_text(self, payload: str) -> None:
        self.sent.append(payload)


TINY_JPEG_B64 = (
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP////////////////////////////////////////"
    "//////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
)


@pytest.mark.asyncio
async def test_excel_export_deduplication_single_and_multi_batch_with_snapshots():
    """Verifies single-batch & multi-batch Excel exports, Result & Snapshot consistency, and batch isolation."""
    trainer_id = uuid.uuid4()
    inst_id = uuid.uuid4()
    dept_id = uuid.uuid4()
    batch_a = uuid.uuid4()
    batch_b = uuid.uuid4()
    quiz_id = uuid.uuid4()

    nikhil_id = uuid.uuid4()
    niraj_id = uuid.uuid4()
    nisha_id = uuid.uuid4()
    two_sub_id = uuid.uuid4()
    offline_sub_id = uuid.uuid4()

    now = datetime.now(timezone.utc)
    ctx = DummyScope(trainer_id, Role.TRAINER)

    async with get_pg_connection() as conn:
        await conn.execute(
            "INSERT INTO institutions (id, name, code) VALUES ($1, 'Test Inst', $2)",
            inst_id, f"TI-{str(inst_id)[:6]}",
        )
        await conn.execute(
            "INSERT INTO departments (id, institution_id, name, code) VALUES ($1, $2, 'CS Dept', $3)",
            dept_id, inst_id, f"CS-{str(dept_id)[:6]}",
        )
        await conn.execute(
            "INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Trainer', $2, 'h', 'TRAINER', 'ACTIVE')",
            trainer_id, f"t_{trainer_id}@test.com",
        )
        for bid, bname, bcode in [(batch_a, "CS-A", "CSA"), (batch_b, "CS-B", "CSB")]:
            await conn.execute(
                "INSERT INTO batches (id, institution_id, department_id, name, code, status) VALUES ($1, $2, $3, $4, $5, 'ACTIVE')",
                bid, inst_id, dept_id, bname, bcode,
            )
            await conn.execute(
                "INSERT INTO batch_trainers (id, batch_id, trainer_user_id, status) VALUES (gen_random_uuid(), $1, $2, 'ACTIVE')",
                bid, trainer_id,
            )

        await conn.execute(
            """
            INSERT INTO quizzes (id, creator_trainer_id, institution_id, batch_id, title, kind, duration_minutes, max_score, questions, status)
            VALUES ($1, $2, $3, $4, 'Midterm Export Test', 'quiz', 30, 100, '[{"id":"q1"}]'::jsonb, 'active')
            """,
            quiz_id, trainer_id, inst_id, batch_a,
        )
        for bid in (batch_a, batch_b):
            await conn.execute(
                "INSERT INTO quiz_batch_assignments (id, quiz_id, batch_id, institution_id, assigned_by, status) VALUES (gen_random_uuid(), $1, $2, $3, $4, 'ACTIVE')",
                quiz_id, bid, inst_id, trainer_id,
            )

        students = [
            (nikhil_id, "NIKHIL PANCHAL", "25EARCS176", batch_a),
            (niraj_id, "NIRAJ MEENA", "25EARCS178", batch_a),
            (nisha_id, "NISHA PAREEK", "25EARCS180", batch_a),
            (two_sub_id, "TWO SUBMISSIONS", "25EARCS181", batch_a),
            (offline_sub_id, "OFFLINE STUDENT", "25EARCS182", batch_b),
        ]
        for uid, name, roll, bid in students:
            await conn.execute(
                "INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, $2, $3, 'h', 'STUDENT', 'ACTIVE')",
                uid, name, f"{roll.lower()}_{uid}@test.com",
            )
            await conn.execute(
                "INSERT INTO student_profiles (id, user_id, institution_id, batch_id, roll_number) VALUES (gen_random_uuid(), $1, $2, $3, $4)",
                uid, inst_id, bid, roll,
            )

        # 1. NIKHIL PANCHAL: COMPLETED 65/100 + newer IN_PROGRESS 0/100
        nikhil_completed = uuid.uuid4()
        nikhil_inprog = uuid.uuid4()
        await conn.execute(
            """
            INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, completed_at, created_at)
            VALUES ($1, $2, $3, $4, 65, 100, 65.0, TRUE, 'completed', 'COMPLETED', $5, $6)
            """,
            nikhil_completed, quiz_id, nikhil_id, batch_a, now - timedelta(minutes=20), now - timedelta(minutes=40),
        )
        await conn.execute(
            """
            INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, created_at)
            VALUES ($1, $2, $3, $4, 0, 100, 0.0, FALSE, 'in_progress', 'IN_PROGRESS', $5)
            """,
            nikhil_inprog, quiz_id, nikhil_id, batch_a, now - timedelta(minutes=5),
        )
        # Snapshot ONLY on older in_progress, none on completed -> Snapshot sheet must NOT pull from nikhil_inprog!
        await conn.execute(
            "INSERT INTO quiz_camera_snapshots (id, quiz_id, student_user_id, attempt_id, snapshot_timestamp, event_type, image_data) VALUES (gen_random_uuid(), $1, $2, $3, $4, 'PERIODIC', $5)",
            quiz_id, nikhil_id, nikhil_inprog, now - timedelta(minutes=4), TINY_JPEG_B64,
        )

        # 2. NIRAJ MEENA: COMPLETED 83/100 + SUPERSEDED_DUPLICATE 0/100 + IN_PROGRESS 0/100
        niraj_completed = uuid.uuid4()
        niraj_sup = uuid.uuid4()
        niraj_inprog = uuid.uuid4()
        await conn.execute(
            """
            INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, completed_at, created_at)
            VALUES ($1, $2, $3, $4, 83, 100, 83.0, TRUE, 'completed', 'COMPLETED', $5, $6)
            """,
            niraj_completed, quiz_id, niraj_id, batch_a, now - timedelta(minutes=25), now - timedelta(minutes=45),
        )
        await conn.execute(
            """
            INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, submission_reason, created_at)
            VALUES ($1, $2, $3, $4, 0, 100, 0.0, FALSE, 'superseded', 'SUPERSEDED_DUPLICATE', 'RECONCILED_DUPLICATE_ACTIVE', $5)
            """,
            niraj_sup, quiz_id, niraj_id, batch_a, now - timedelta(minutes=30),
        )
        await conn.execute(
            """
            INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, created_at)
            VALUES ($1, $2, $3, $4, 0, 100, 0.0, FALSE, 'in_progress', 'IN_PROGRESS', $5)
            """,
            niraj_inprog, quiz_id, niraj_id, batch_a, now - timedelta(minutes=2),
        )
        await conn.execute(
            "INSERT INTO quiz_camera_snapshots (id, quiz_id, student_user_id, attempt_id, snapshot_timestamp, event_type, image_data) VALUES (gen_random_uuid(), $1, $2, $3, $4, 'PERIODIC', $5)",
            quiz_id, niraj_id, niraj_completed, now - timedelta(minutes=26), TINY_JPEG_B64,
        )

        # 3. NISHA PAREEK: ABANDONMENT_WARNING + SUPERSEDED_DUPLICATE
        nisha_warn = uuid.uuid4()
        nisha_sup = uuid.uuid4()
        await conn.execute(
            """
            INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, created_at)
            VALUES ($1, $2, $3, $4, 0, 100, 0.0, FALSE, 'in_progress', 'ABANDONMENT_WARNING', $5)
            """,
            nisha_warn, quiz_id, nisha_id, batch_a, now - timedelta(minutes=10),
        )
        await conn.execute(
            """
            INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, submission_reason, created_at)
            VALUES ($1, $2, $3, $4, 0, 100, 0.0, FALSE, 'superseded', 'SUPERSEDED_DUPLICATE', 'RECONCILED_DUPLICATE_ACTIVE', $5)
            """,
            nisha_sup, quiz_id, nisha_id, batch_a, now - timedelta(minutes=5),
        )

        # 4. TWO SUBMISSIONS: older COMPLETED 50/100, newer AUTO_SUBMITTED 75/100
        await conn.execute(
            """
            INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, completed_at, created_at)
            VALUES ($1, $2, $3, $4, 50, 100, 50.0, TRUE, 'completed', 'COMPLETED', $5, $6)
            """,
            uuid.uuid4(), quiz_id, two_sub_id, batch_a, now - timedelta(minutes=30), now - timedelta(minutes=50),
        )
        await conn.execute(
            """
            INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, completed_at, created_at)
            VALUES ($1, $2, $3, $4, 75, 100, 75.0, TRUE, 'completed', 'AUTO_SUBMITTED', $5, $6)
            """,
            uuid.uuid4(), quiz_id, two_sub_id, batch_a, now - timedelta(minutes=10), now - timedelta(minutes=25),
        )

        # 5. Same student (nikhil_id) also has a legitimate batch_b attempt; plus offline_sub_id in batch_b
        await conn.execute(
            """
            INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, completed_at, created_at)
            VALUES ($1, $2, $3, $4, 91, 100, 91.0, TRUE, 'completed', 'COMPLETED', $5, $6)
            """,
            uuid.uuid4(), quiz_id, nikhil_id, batch_b, now - timedelta(minutes=8), now - timedelta(minutes=15),
        )
        await conn.execute(
            """
            INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, submission_source, completed_at, local_submitted_at, created_at)
            VALUES ($1, $2, $3, $4, 88, 100, 88.0, TRUE, 'completed', 'OFFLINE_SUBMITTED', 'OFFLINE_SYNC', $5, $5, $6)
            """,
            uuid.uuid4(), quiz_id, offline_sub_id, batch_b, now - timedelta(minutes=7), now - timedelta(minutes=20),
        )

    # Test single-batch export (photos disabled)
    resp_single = await export_trainer_assessment_excel_batch_scoped(
        str(quiz_id),
        BatchExcelExportRequest(batchIds=[str(batch_a)], includePhotos=False),
        ctx=ctx,
    )
    wb_single = load_workbook(io.BytesIO(resp_single.body))
    assert wb_single.sheetnames == ["Result_CSA"]
    ws_csa = wb_single["Result_CSA"]
    rows_csa = list(ws_csa.iter_rows(min_row=2, values_only=True))
    assert len(rows_csa) == 4
    rolls_csa = [r[0] for r in rows_csa]
    assert len(rolls_csa) == len(set(rolls_csa))
    by_roll = {r[0]: r for r in rows_csa}
    assert by_roll["25EARCS176"][5] == 65 and by_roll["25EARCS176"][10] == "COMPLETED"
    assert by_roll["25EARCS178"][5] == 83 and by_roll["25EARCS178"][10] == "COMPLETED"
    assert by_roll["25EARCS180"][10] == "ABANDONMENT_WARNING"
    assert by_roll["25EARCS181"][5] == 75 and by_roll["25EARCS181"][10] == "AUTO_SUBMITTED"

    # Test multi-batch export (photos enabled)
    resp_multi = await export_trainer_assessment_excel_batch_scoped(
        str(quiz_id),
        BatchExcelExportRequest(batchIds=[str(batch_a), str(batch_b)], includePhotos=True),
        ctx=ctx,
    )
    wb_multi = load_workbook(io.BytesIO(resp_multi.body))
    assert wb_multi.sheetnames == ["Result_CSA", "Snapshot_CSA", "Result_CSB", "Snapshot_CSB"]
    rows_csb = list(wb_multi["Result_CSB"].iter_rows(min_row=2, values_only=True))
    assert len(rows_csb) == 2
    by_roll_b = {r[0]: r for r in rows_csb}
    assert by_roll_b["25EARCS176"][5] == 91
    assert by_roll_b["25EARCS182"][5] == 88 and by_roll_b["25EARCS182"][10] == "OFFLINE_SUBMITTED"

    # Verify Snapshot_CSA matches Result_CSA row-for-row and Nikhil has NO snapshot (not leaked from in_progress!)
    snap_rows_csa = list(wb_multi["Snapshot_CSA"].iter_rows(min_row=2, values_only=True))
    assert [r[0] for r in snap_rows_csa] == [r[0] for r in list(wb_multi["Result_CSA"].iter_rows(min_row=2, values_only=True))]
    snap_by_roll = {r[0]: r for r in snap_rows_csa}
    assert snap_by_roll["25EARCS176"][2] == "Unavailable"
    assert snap_by_roll["25EARCS178"][2] != "Unavailable"

    # Test GET /assessments/{quiz_id}/export-excel with batchId
    resp_get = await export_trainer_assessment_excel(str(quiz_id), batchId=str(batch_a), ctx=ctx)
    wb_get = load_workbook(io.BytesIO(resp_get.body))
    get_rows = list(wb_get["Results"].iter_rows(min_row=2, values_only=True))
    assert len(get_rows) == 4
    assert len({r[1] for r in get_rows}) == 4


@pytest.mark.asyncio
async def test_monitor_status_lifecycle_and_websocket_isolation():
    """Verifies monitor precedence, separated connection_status/submission_status, retake policy, and WS guards."""
    trainer_id = uuid.uuid4()
    inst_id = uuid.uuid4()
    dept_id = uuid.uuid4()
    batch_id = uuid.uuid4()
    quiz_id = uuid.uuid4()
    retake_quiz_id = uuid.uuid4()

    s_comp_disc = uuid.uuid4()
    s_auto_disc = uuid.uuid4()
    s_off_disc = uuid.uuid4()
    s_inprog_disc = uuid.uuid4()
    s_inprog_on = uuid.uuid4()
    s_sync_pend = uuid.uuid4()
    s_retake = uuid.uuid4()

    now = datetime.now(timezone.utc)
    ctx = DummyScope(trainer_id, Role.TRAINER)

    async with get_pg_connection() as conn:
        await conn.execute(
            "INSERT INTO institutions (id, name, code) VALUES ($1, 'Mon Inst', $2)",
            inst_id, f"MI-{str(inst_id)[:6]}",
        )
        await conn.execute(
            "INSERT INTO departments (id, institution_id, name, code) VALUES ($1, $2, 'Mon Dept', $3)",
            dept_id, inst_id, f"MD-{str(dept_id)[:6]}",
        )
        await conn.execute(
            "INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Trainer', $2, 'h', 'TRAINER', 'ACTIVE')",
            trainer_id, f"t_{trainer_id}@mon.com",
        )
        await conn.execute(
            "INSERT INTO batches (id, institution_id, department_id, name, code, status) VALUES ($1, $2, $3, 'MonBatch', 'MB1', 'ACTIVE')",
            batch_id, inst_id, dept_id,
        )
        await conn.execute(
            "INSERT INTO quizzes (id, creator_trainer_id, institution_id, batch_id, title, kind, duration_minutes, max_score, questions, allow_retake, status) VALUES ($1, $2, $3, $4, 'Monitor Lifecycle', 'quiz', 30, 100, '[]'::jsonb, FALSE, 'active')",
            quiz_id, trainer_id, inst_id, batch_id,
        )
        await conn.execute(
            "INSERT INTO quizzes (id, creator_trainer_id, institution_id, batch_id, title, kind, duration_minutes, max_score, questions, allow_retake, status) VALUES ($1, $2, $3, $4, 'Retake Quiz', 'quiz', 30, 100, '[]'::jsonb, TRUE, 'active')",
            retake_quiz_id, trainer_id, inst_id, batch_id,
        )

        for uid, roll in [
            (s_comp_disc, "R01"),
            (s_auto_disc, "R02"),
            (s_off_disc, "R03"),
            (s_inprog_disc, "R04"),
            (s_inprog_on, "R05"),
            (s_sync_pend, "R06"),
            (s_retake, "R07"),
        ]:
            await conn.execute(
                "INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, $2, $3, 'h', 'STUDENT', 'ACTIVE')",
                uid, f"Student {roll}", f"{roll.lower()}_{uid}@mon.com",
            )
            await conn.execute(
                "INSERT INTO student_profiles (id, user_id, institution_id, batch_id, roll_number) VALUES (gen_random_uuid(), $1, $2, $3, $4)",
                uid, inst_id, batch_id, roll,
            )

        # R01: COMPLETED + old/newer IN_PROGRESS duplicate + SUPERSEDED_DUPLICATE, stale heartbeat
        await conn.execute(
            "INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, completed_at, last_heartbeat_at, created_at) VALUES ($1, $2, $3, $4, 83, 100, 83, TRUE, 'completed', 'COMPLETED', $5, $5, $6)",
            uuid.uuid4(), quiz_id, s_comp_disc, batch_id, now - timedelta(minutes=20), now - timedelta(minutes=40),
        )
        await conn.execute(
            "INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, last_heartbeat_at, created_at) VALUES ($1, $2, $3, $4, 0, 100, 0, FALSE, 'in_progress', 'IN_PROGRESS', $5, $5)",
            uuid.uuid4(), quiz_id, s_comp_disc, batch_id, now - timedelta(minutes=5),
        )
        await conn.execute(
            "INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, submission_reason, created_at) VALUES ($1, $2, $3, $4, 0, 100, 0, FALSE, 'superseded', 'SUPERSEDED_DUPLICATE', 'RECONCILED_DUPLICATE_ACTIVE', $5)",
            uuid.uuid4(), quiz_id, s_comp_disc, batch_id, now - timedelta(minutes=15),
        )

        # R02: AUTO_SUBMITTED + stale heartbeat
        await conn.execute(
            "INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, completed_at, last_heartbeat_at, created_at) VALUES ($1, $2, $3, $4, 70, 100, 70, TRUE, 'completed', 'AUTO_SUBMITTED', $5, $5, $6)",
            uuid.uuid4(), quiz_id, s_auto_disc, batch_id, now - timedelta(minutes=15), now - timedelta(minutes=30),
        )

        # R03: OFFLINE_SUBMITTED + disconnected
        await conn.execute(
            "INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, submission_source, completed_at, created_at) VALUES ($1, $2, $3, $4, 78, 100, 78, TRUE, 'completed', 'OFFLINE_SUBMITTED', 'OFFLINE_SYNC', $5, $6)",
            uuid.uuid4(), quiz_id, s_off_disc, batch_id, now - timedelta(minutes=12), now - timedelta(minutes=30),
        )

        # R04: IN_PROGRESS + stale heartbeat -> DISCONNECTED
        await conn.execute(
            "INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, last_heartbeat_at, created_at) VALUES ($1, $2, $3, $4, 0, 100, 0, FALSE, 'in_progress', 'IN_PROGRESS', $5, $6)",
            uuid.uuid4(), quiz_id, s_inprog_disc, batch_id, now - timedelta(minutes=5), now - timedelta(minutes=20),
        )

        # R05: IN_PROGRESS + fresh heartbeat -> ACTIVE + ONLINE
        await conn.execute(
            "INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, last_heartbeat_at, created_at) VALUES ($1, $2, $3, $4, 0, 100, 0, FALSE, 'in_progress', 'IN_PROGRESS', $5, $6)",
            uuid.uuid4(), quiz_id, s_inprog_on, batch_id, now - timedelta(seconds=5), now - timedelta(minutes=10),
        )

        # R06: OFFLINE_SYNC_PENDING + disconnected
        await conn.execute(
            "INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, last_heartbeat_at, created_at) VALUES ($1, $2, $3, $4, 0, 100, 0, FALSE, 'in_progress', 'OFFLINE_SYNC_PENDING', $5, $6)",
            uuid.uuid4(), quiz_id, s_sync_pend, batch_id, now - timedelta(minutes=4), now - timedelta(minutes=15),
        )

        # R07 on retake_quiz_id (allow_retake=TRUE): COMPLETED earlier, legitimate newer IN_PROGRESS retake
        await conn.execute(
            "INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, completed_at, created_at) VALUES ($1, $2, $3, $4, 60, 100, 60, TRUE, 'completed', 'COMPLETED', $5, $6)",
            uuid.uuid4(), retake_quiz_id, s_retake, batch_id, now - timedelta(minutes=30), now - timedelta(minutes=45),
        )
        await conn.execute(
            "INSERT INTO quiz_attempts (id, quiz_id, student_user_id, batch_id, score, possible, percentage, passed, status, candidate_status, last_heartbeat_at, created_at) VALUES ($1, $2, $3, $4, 0, 100, 0, FALSE, 'in_progress', 'IN_PROGRESS', $5, $6)",
            uuid.uuid4(), retake_quiz_id, s_retake, batch_id, now - timedelta(seconds=5), now - timedelta(minutes=2),
        )

    mon = await get_assessment_monitor_data(str(quiz_id), ctx=ctx, status_filter="ALL_STARTED")
    data = mon["data"]
    by_roll = {s["roll_number"]: s for s in data["students"]}

    assert by_roll["R01"]["candidate_status"] == "COMPLETED"
    assert by_roll["R01"]["submission_status"] == "COMPLETED"
    assert by_roll["R01"]["connection_status"] == "DISCONNECTED"
    assert by_roll["R01"]["camera_status"] == "DONE"
    assert by_roll["R01"]["attempt_count"] == 2  # excludes SUPERSEDED_DUPLICATE

    assert by_roll["R02"]["candidate_status"] == "AUTO_SUBMITTED"
    assert by_roll["R02"]["connection_status"] == "DISCONNECTED"

    assert by_roll["R03"]["candidate_status"] == "OFFLINE_SUBMITTED"
    assert by_roll["R03"]["connection_status"] == "OFFLINE"

    assert by_roll["R04"]["candidate_status"] == "DISCONNECTED"
    assert by_roll["R04"]["submission_status"] == "IN_PROGRESS"
    assert by_roll["R04"]["connection_status"] == "DISCONNECTED"

    assert by_roll["R05"]["candidate_status"] == "ACTIVE"
    assert by_roll["R05"]["submission_status"] == "IN_PROGRESS"
    assert by_roll["R05"]["connection_status"] == "ONLINE"

    assert by_roll["R06"]["candidate_status"] == "OFFLINE_SYNC_PENDING"
    assert by_roll["R06"]["submission_status"] == "SYNC_PENDING"
    assert by_roll["R06"]["connection_status"] == "OFFLINE"

    counters = data["counters"]
    assert counters["startedCount"] == 6
    assert counters["completedCount"] == 1
    assert counters["autoSubmittedCount"] == 1
    assert counters["offlineSubmittedCount"] == 1
    assert counters["disconnectedCount"] == 1
    assert counters["activeCount"] == 1
    assert counters["syncPendingCount"] == 1

    # Attempt history preserves all 3 attempts including SUPERSEDED_DUPLICATE for R01
    hist = await get_student_attempt_history(str(quiz_id), str(s_comp_disc), ctx=ctx)
    assert len(hist["data"]["attempts"]) == 3

    # Legitimate retake when allow_retake=TRUE selects active retake
    mon_retake = await get_assessment_monitor_data(str(retake_quiz_id), ctx=ctx, status_filter="ALL_STARTED")
    r07 = next(s for s in mon_retake["data"]["students"] if s["roll_number"] == "R07")
    assert r07["candidate_status"] == "ACTIVE"
    assert r07["submission_status"] == "IN_PROGRESS"

    # WebSocket disconnect / heartbeat / reconnect after submit must preserve is_finalized=True
    hub = AssessmentHub()
    trainer_ws = DummyWebSocket()
    student_ws = DummyWebSocket()
    await hub.register_trainer(str(quiz_id), trainer_ws, str(trainer_id))
    await hub.register_student(str(quiz_id), str(s_comp_disc), student_ws, "Student R01", "R01")
    await hub.handle_submit(str(quiz_id), str(s_comp_disc), {"candidate_status": "COMPLETED"})
    await hub.unregister_student(str(quiz_id), str(s_comp_disc), student_ws)
    await hub.handle_heartbeat(str(quiz_id), str(s_comp_disc))
    await hub.register_student(str(quiz_id), str(s_comp_disc), student_ws, "Student R01", "R01")
    assert hub.student_states[str(quiz_id)][str(s_comp_disc)]["is_finalized"] is True
    assert hub.student_states[str(quiz_id)][str(s_comp_disc)]["submission_status"] == "COMPLETED"
