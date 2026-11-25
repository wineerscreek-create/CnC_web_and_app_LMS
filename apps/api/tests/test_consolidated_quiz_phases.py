import io
import json
import uuid
from datetime import datetime, timedelta, timezone
import pytest
from openpyxl import load_workbook

from app.authz.roles import Role
from app.core.errors import ScopeForbidden
from app.db.postgres import get_pg_connection
from app.repositories.assignment_quiz_repo import QuizRepository, as_utc, compute_quiz_lifecycle
from app.routers.trainer import BatchExcelExportRequest, export_trainer_assessment_excel_batch_scoped


class DummyScope:
    def __init__(self, user_id, role=Role.TRAINER, college_id=None):
        self.user_id = user_id
        self.role = role
        self.college_id = college_id or uuid.uuid4()
        self.department_id = uuid.uuid4()
        self.session_id = f"sess-{user_id}"
        self.email = f"u_{user_id}@test.com"


def test_phase1_quiz_lifecycle_and_28_nov_timezone():
    """Phase 1: Verifies lifecycle separation, 28 Nov date-only/timestamp handling, and inactive != expired."""
    now = datetime(2026, 11, 25, 10, 0, 0, tzinfo=timezone.utc)

    # 1. Quiz ending 2026-11-28 must be LIVE, not EXPIRED
    lc, pub = compute_quiz_lifecycle("active", "2026-11-24", "2026-11-28", False, now_utc=now)
    assert lc == "LIVE" and pub == "ACTIVE"

    # 2. Date-only 2026-11-25 at 18:29 UTC (23:59:59 IST) is still LIVE before 18:30 UTC
    before_ist_eod = datetime(2026, 11, 25, 18, 0, 0, tzinfo=timezone.utc)
    lc2, _ = compute_quiz_lifecycle("active", "2026-11-24", "2026-11-25", False, now_utc=before_ist_eod)
    assert lc2 == "LIVE"

    # 3. Past close date -> EXPIRED
    lc3, pub3 = compute_quiz_lifecycle("active", "2026-11-20", "2026-11-24", False, now_utc=now)
    assert lc3 == "EXPIRED" and pub3 == "ACTIVE"

    # 4. Future open date -> SCHEDULED
    lc4, pub4 = compute_quiz_lifecycle("active", "2026-11-27", "2026-11-29", False, now_utc=now)
    assert lc4 == "SCHEDULED" and pub4 == "ACTIVE"

    # 5. Manually ended -> COMPLETED
    lc5, pub5 = compute_quiz_lifecycle("completed", "2026-11-24", "2026-11-28", True, now_utc=now)
    assert lc5 == "COMPLETED" and pub5 == "ACTIVE"

    # 6. Inactive past quiz -> never labelled EXPIRED
    lc6, pub6 = compute_quiz_lifecycle("inactive", "2026-11-20", "2026-11-24", False, now_utc=now)
    assert lc6 != "EXPIRED" and pub6 == "INACTIVE"


@pytest.mark.asyncio
async def test_phase2_3_4_5_edit_delete_feedback_and_batch_export():
    """Phases 2, 3, 4, 5: Quiz edit + attempt safety, soft-delete, feedback E2E, and multi-batch Excel export."""
    trainer_id = uuid.uuid4()
    other_trainer_id = uuid.uuid4()
    s1_id = uuid.uuid4()
    s2_id = uuid.uuid4()
    inst_id = uuid.uuid4()
    dept_id = uuid.uuid4()
    b_csa = uuid.uuid4()
    b_csb = uuid.uuid4()
    b_unauth = uuid.uuid4()

    tiny_jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="

    async with get_pg_connection() as conn:
        await conn.execute(
            "INSERT INTO institutions (id, name, code, created_at, updated_at) VALUES ($1, 'C Inst', $2, NOW(), NOW()) ON CONFLICT DO NOTHING",
            inst_id, f"CI-{str(inst_id)[:6]}",
        )
        await conn.execute(
            "INSERT INTO departments (id, institution_id, name, code, created_at, updated_at) VALUES ($1, $2, 'CS', $3, NOW(), NOW()) ON CONFLICT DO NOTHING",
            dept_id, inst_id, f"CD-{str(dept_id)[:6]}",
        )
        for bid, name, code in [(b_csa, "CS-A", "CS-A"), (b_csb, "CS-B", "CS-B"), (b_unauth, "Other", "OTH")]:
            await conn.execute(
                "INSERT INTO batches (id, institution_id, department_id, name, code, semester, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW()) ON CONFLICT DO NOTHING",
                bid, inst_id, dept_id, name, f"{code}-{str(bid)[:4]}",
            )
        for uid, role, name in [
            (trainer_id, "TRAINER", "Main Trainer"),
            (other_trainer_id, "TRAINER", "Other Trainer"),
            (s1_id, "STUDENT", "Student CSA"),
            (s2_id, "STUDENT", "Student CSB"),
        ]:
            await conn.execute(
                "INSERT INTO users (id, name, email, password_hash, role, institution_id, status, created_at, updated_at) VALUES ($1, $2, $3, 'h', $4, $5, 'ACTIVE', NOW(), NOW())",
                uid, name, f"{uid}@c.com", role, inst_id,
            )
        await conn.execute(
            "INSERT INTO batch_trainers (id, batch_id, trainer_user_id, institution_id, status) VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE')",
            b_csa, trainer_id, inst_id,
        )
        await conn.execute(
            "INSERT INTO batch_trainers (id, batch_id, trainer_user_id, institution_id, status) VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE')",
            b_csb, trainer_id, inst_id,
        )
        await conn.execute(
            "INSERT INTO student_profiles (id, user_id, roll_number, institution_id, department_id, batch_id) VALUES (gen_random_uuid(), $1, 'CSA-01', $2, $3, $4)",
            s1_id, inst_id, dept_id, b_csa,
        )
        await conn.execute(
            "INSERT INTO student_profiles (id, user_id, roll_number, institution_id, department_id, batch_id) VALUES (gen_random_uuid(), $1, 'CSB-01', $2, $3, $4)",
            s2_id, inst_id, dept_id, b_csb,
        )

    t_ctx = DummyScope(trainer_id, Role.TRAINER, inst_id)
    unauth_ctx = DummyScope(other_trainer_id, Role.TRAINER, inst_id)
    s1_ctx = DummyScope(s1_id, Role.STUDENT, inst_id)
    s2_ctx = DummyScope(s2_id, Role.STUDENT, inst_id)

    # Create quiz ending 28 Nov (future)
    created = await QuizRepository.create_trainer_quiz(
        t_ctx,
        title="Consolidated Exam",
        duration_minutes=30,
        max_score=100,
        opens_at=datetime.now(timezone.utc) - timedelta(hours=1),
        closes_at=datetime.now(timezone.utc) + timedelta(days=3),
        questions=[{"id": "q1", "text": "Q1", "marks": 100, "options": [{"id": "o1", "text": "Yes", "correct": True}]}],
        batch_ids=[str(b_csa), str(b_csb)],
    )
    quiz_id = created["id"]

    # Students submit attempts + snapshots + feedback
    sub1 = await QuizRepository.submit_quiz_attempt(s1_ctx, quiz_id, answers={"q1": "o1"})
    sub2 = await QuizRepository.submit_quiz_attempt(s2_ctx, quiz_id, answers={"q1": "o1"})
    await QuizRepository.save_camera_snapshot(s1_ctx, quiz_id, tiny_jpeg, attempt_id=sub1["attemptId"])
    await QuizRepository.save_camera_snapshot(s2_ctx, quiz_id, tiny_jpeg, attempt_id=sub2["attemptId"])
    await QuizRepository.submit_quiz_feedback(
        s1_ctx, quiz_id, sub1["attemptId"], overall_rating=5, difficulty="Moderate",
        question_quality_rating=5, time_management="Sufficient", written_feedback="Great exam!"
    )

    # Phase 4: Feedback visible to authorized trainer, blocked for unauthorized
    fb = await QuizRepository.get_trainer_quiz_feedback(t_ctx, quiz_id)
    assert fb["summary"]["totalSubmissions"] == 1
    assert fb["items"][0]["writtenFeedback"] == "Great exam!"
    with pytest.raises(ScopeForbidden):
        await QuizRepository.get_trainer_quiz_feedback(unauth_ctx, quiz_id)

    # Phase 2: Edit Quiz with attempt-safety + audit
    edited = await QuizRepository.update_trainer_quiz(
        t_ctx, quiz_id, title="Consolidated Exam Updated", max_score=200, duration_minutes=45
    )
    assert edited["title"] == "Consolidated Exam Updated"
    assert edited["durationMinutes"] == 45
    assert edited["maxScore"] == 100  # Protected due to existing attempts
    assert "maxScore" in edited.get("restrictedFields", [])
    with pytest.raises(ScopeForbidden):
        await QuizRepository.update_trainer_quiz(unauth_ctx, quiz_id, title="Hack")

    # Phase 5: Batch-scoped Excel export
    # 5a. 1 batch, no photos
    r1 = await export_trainer_assessment_excel_batch_scoped(
        quiz_id, BatchExcelExportRequest(batchIds=[str(b_csa)], includePhotos=False), ctx=t_ctx
    )
    wb1 = load_workbook(io.BytesIO(r1.body))
    assert len(wb1.sheetnames) == 1
    assert wb1.sheetnames[0].startswith("Result_")
    assert wb1[wb1.sheetnames[0]].max_row == 2  # Header + 1 CS-A student only

    # 5b. 2 batches, with photos -> Result_CS-A, Snapshot_CS-A, Result_CS-B, Snapshot_CS-B
    r2 = await export_trainer_assessment_excel_batch_scoped(
        quiz_id, BatchExcelExportRequest(batchIds=[str(b_csa), str(b_csb)], includePhotos=True), ctx=t_ctx
    )
    wb2 = load_workbook(io.BytesIO(r2.body))
    assert len(wb2.sheetnames) == 4
    assert wb2.sheetnames[0].startswith("Result_")
    assert wb2.sheetnames[1].startswith("Snapshot_")
    assert wb2.sheetnames[2].startswith("Result_")
    assert wb2.sheetnames[3].startswith("Snapshot_")

    # 5c. 2 batches, no photos -> only 2 Result sheets
    r3 = await export_trainer_assessment_excel_batch_scoped(
        quiz_id, BatchExcelExportRequest(batchIds=[str(b_csa), str(b_csb)], includePhotos=False), ctx=t_ctx
    )
    wb3 = load_workbook(io.BytesIO(r3.body))
    assert len(wb3.sheetnames) == 2
    assert all(s.startswith("Result_") for s in wb3.sheetnames)

    # 5d. Unauthorized batch ID -> ScopeForbidden
    with pytest.raises(ScopeForbidden):
        await export_trainer_assessment_excel_batch_scoped(
            quiz_id, BatchExcelExportRequest(batchIds=[str(b_unauth)], includePhotos=False), ctx=t_ctx
        )

    # Phase 3: Soft-delete preserves attempts & reports while hiding quiz from listings
    del_res = await QuizRepository.delete_trainer_quiz(t_ctx, quiz_id)
    assert del_res["deleted"] is True and del_res["archived"] is True
    trainer_list = await QuizRepository.list_trainer_quizzes(t_ctx)
    assert all(q["id"] != quiz_id for q in trainer_list)
    async with get_pg_connection() as conn:
        rep_cnt = await conn.fetchval("SELECT COUNT(*) FROM assessment_reports WHERE quiz_id = $1", uuid.UUID(quiz_id))
        assert rep_cnt == 2
