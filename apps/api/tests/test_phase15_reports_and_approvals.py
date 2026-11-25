import json
import uuid
from datetime import datetime, timezone
import pytest

from app.authz.roles import Role
from app.core.errors import ScopeForbidden
from app.db.postgres import get_pg_connection
from app.repositories.assessment_report_repo import AssessmentReportRepository
from app.repositories.assignment_quiz_repo import QuizRepository
from app.repositories.offline_repo import OfflineRepository
from app.services.offline_crypto import OfflineCryptoService


class DummyScope:
    def __init__(self, user_id, role=Role.TRAINER, college_id=None):
        self.user_id = user_id
        self.role = role
        self.college_id = college_id or uuid.uuid4()
        self.department_id = uuid.uuid4()
        self.session_id = f"sess-{user_id}"
        self.email = f"u_{user_id}@test.com"


@pytest.mark.asyncio
async def test_phase15_historical_reports_approval_and_recovery_consistency():
    """Phase 15: Verifies historical report immutability, PENDING/APPROVED/REJECTED workflow, idempotency, and recovery."""
    trainer_id = uuid.uuid4()
    other_trainer_id = uuid.uuid4()
    student_id = uuid.uuid4()
    quiz_id = uuid.uuid4()
    inst_id = uuid.uuid4()
    dept_id = uuid.uuid4()
    batch_id = uuid.uuid4()

    questions = [
        {
            "id": "q1",
            "text": "Capital of France?",
            "marks": 10,
            "options": [
                {"id": "o1", "text": "Paris", "correct": True},
                {"id": "o2", "text": "Berlin", "correct": False},
            ],
        }
    ]

    async with get_pg_connection() as conn:
        await conn.execute(
            "INSERT INTO institutions (id, name, code, created_at, updated_at) VALUES ($1, 'R Inst', $2, NOW(), NOW()) ON CONFLICT DO NOTHING",
            inst_id, f"RI-{str(inst_id)[:6]}",
        )
        await conn.execute(
            "INSERT INTO departments (id, institution_id, name, code, created_at, updated_at) VALUES ($1, $2, 'CS', $3, NOW(), NOW()) ON CONFLICT DO NOTHING",
            dept_id, inst_id, f"RD-{str(dept_id)[:6]}",
        )
        await conn.execute(
            "INSERT INTO batches (id, institution_id, department_id, name, code, semester, created_at, updated_at) VALUES ($1, $2, $3, 'R Batch', $4, 1, NOW(), NOW()) ON CONFLICT DO NOTHING",
            batch_id, inst_id, dept_id, f"RB-{str(batch_id)[:6]}",
        )
        for uid, role, name in [
            (trainer_id, "TRAINER", "Report Trainer"),
            (other_trainer_id, "TRAINER", "Unauth Trainer"),
            (student_id, "STUDENT", "Report Student"),
        ]:
            await conn.execute(
                "INSERT INTO users (id, name, email, password_hash, role, status, created_at, updated_at) VALUES ($1, $2, $3, 'h', $4, 'ACTIVE', NOW(), NOW())",
                uid, name, f"{uid}@r.com", role,
            )
        await conn.execute(
            "INSERT INTO student_profiles (id, user_id, roll_number, institution_id, department_id, batch_id, created_at, updated_at) VALUES (gen_random_uuid(), $1, 'REP-001', $2, $3, $4, NOW(), NOW())",
            student_id, inst_id, dept_id, batch_id,
        )
        await conn.execute(
            """
            INSERT INTO quizzes (
                id, institution_id, batch_id, creator_trainer_id, title, kind,
                duration_minutes, max_score, allow_retake, opens_at, closes_at,
                questions, status, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, 'Phase 15 Report Exam', 'quiz',
                30, 100, true, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '2 hours',
                $5::jsonb, 'active', NOW(), NOW()
            )
            """,
            quiz_id, inst_id, batch_id, trainer_id, json.dumps(questions),
        )

    s_ctx = DummyScope(student_id, Role.STUDENT, inst_id)
    t_ctx = DummyScope(trainer_id, Role.TRAINER, inst_id)
    unauth_ctx = DummyScope(other_trainer_id, Role.TRAINER, inst_id)

    # 1. Offline attempt generates report with PENDING status
    att1_id = str(uuid.uuid4())
    op_id = str(uuid.uuid4())
    ihash = OfflineCryptoService.compute_attempt_integrity_hash(att1_id, str(quiz_id), str(student_id), {"q1": "o1"})
    await OfflineRepository.process_sync_batch(
        s_ctx,
        [
            {
                "operationId": op_id,
                "userId": str(student_id),
                "resourceType": "ASSESSMENT_SUBMISSION",
                "resourceId": str(quiz_id),
                "operationType": "SUBMIT_ASSESSMENT",
                "attemptId": att1_id,
                "payload": {
                    "quizId": str(quiz_id),
                    "answers": [{"questionId": "q1", "optionId": "o1"}],
                    "durationSeconds": 120,
                    "localSubmittedAt": datetime.now(timezone.utc).isoformat(),
                    "integrityHash": ihash,
                },
                "clientTimestamp": datetime.now(timezone.utc).isoformat(),
            }
        ],
    )

    listed = await AssessmentReportRepository.list_trainer_assessment_reports(t_ctx, str(quiz_id))
    assert listed["counts"]["total"] == 1
    assert listed["counts"]["pending"] == 1
    rep1 = listed["items"][0]
    assert rep1["approvalStatus"] == "PENDING"
    assert rep1["marksObtained"] == 100.0
    rep1_id = rep1["id"]

    # 2. Unauthorized trainer cannot approve/reject
    with pytest.raises(ScopeForbidden):
        await AssessmentReportRepository.review_assessment_report(unauth_ctx, rep1_id, "APPROVED")

    # 3. Authorized trainer approves -> persists in PostgreSQL
    app_res = await AssessmentReportRepository.review_assessment_report(t_ctx, rep1_id, "APPROVED", notes="Verified")
    assert app_res["approvalStatus"] == "APPROVED"
    assert app_res["idempotent"] is False
    assert len(app_res["approvalHistory"]) == 1

    # 4. Duplicate approval is idempotent and does not duplicate history
    dup_res = await AssessmentReportRepository.review_assessment_report(t_ctx, rep1_id, "APPROVED", notes="Dup")
    assert dup_res["idempotent"] is True
    assert len(dup_res["approvalHistory"]) == 1

    # 5. Rejecting preserves audit history
    rej_res = await AssessmentReportRepository.review_assessment_report(t_ctx, rep1_id, "REJECTED", notes="Re-review")
    assert rej_res["approvalStatus"] == "REJECTED"
    assert len(rej_res["approvalHistory"]) == 2

    # 6. Verify persisted state in PostgreSQL after simulated "refresh"
    fetched = await AssessmentReportRepository.get_report_by_id(rep1_id, student_id)
    assert fetched["approvalStatus"] == "REJECTED"
    assert fetched["rejectedAt"] is not None
    assert len(fetched["approvalHistory"]) == 2

    # 7. New retake submission creates a SECOND independent report without mutating rep1
    await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), student_id)
    sub2 = await QuizRepository.submit_quiz_attempt(s_ctx, str(quiz_id), answers={"q1": "o2"})
    assert sub2["attemptId"] != att1_id

    listed2 = await AssessmentReportRepository.list_trainer_assessment_reports(t_ctx, str(quiz_id))
    assert listed2["counts"]["total"] == 2
    by_att = {r["attemptId"]: r for r in listed2["items"]}
    assert by_att[att1_id]["approvalStatus"] == "REJECTED"
    assert by_att[att1_id]["marksObtained"] == 100.0
    assert by_att[sub2["attemptId"]]["approvalStatus"] == "PENDING"
    assert by_att[sub2["attemptId"]]["marksObtained"] == 0.0

    # 8. Recovering attempt 2 (RESUME) and re-submitting with correct answer updates attempt 2's report cleanly without touching attempt 1
    await QuizRepository.recover_assessment_attempt(t_ctx, str(quiz_id), sub2["attemptId"], "RESUME", "Tech issue")
    await QuizRepository.submit_quiz_attempt(s_ctx, str(quiz_id), answers={"q1": "o1"})

    listed3 = await AssessmentReportRepository.list_trainer_assessment_reports(t_ctx, str(quiz_id))
    assert listed3["counts"]["total"] == 2
    by_att3 = {r["attemptId"]: r for r in listed3["items"]}
    assert by_att3[att1_id]["approvalStatus"] == "REJECTED"
    assert by_att3[sub2["attemptId"]]["marksObtained"] == 100.0
