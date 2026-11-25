import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone
import pytest

from app.authz.roles import Role
from app.db.postgres import get_pg_connection
from app.repositories.assignment_quiz_repo import QuizRepository
from app.repositories.offline_repo import OfflineRepository
from app.routers.assessment_realtime import get_assessment_monitor_data


class DummyScope:
    def __init__(self, user_id: uuid.UUID, role: Role = Role.STUDENT, college_id: uuid.UUID | None = None):
        self.user_id = user_id
        self.role = role
        self.college_id = college_id or uuid.uuid4()
        self.department_id = uuid.uuid4()
        self.session_id = f"sess-{user_id}"
        self.email = f"u_{user_id}@test.com"


QUESTIONS = [
    {
        "id": "q1",
        "marks": 10,
        "negative": 2,
        "question_type": "mcq_single",
        "options": [{"id": "a", "correct": True}, {"id": "b", "correct": False}],
    },
    {
        "id": "q2",
        "marks": 10,
        "negative": 2,
        "question_type": "mcq_single",
        "options": [{"id": "a", "correct": False}, {"id": "b", "correct": True}],
    },
    {
        "id": "q3",
        "marks": 10,
        "negative": 2,
        "question_type": "mcq_single",
        "options": [{"id": "a", "correct": True}, {"id": "b", "correct": False}],
    },
]


@pytest.mark.asyncio
async def test_connection_loss_grace_period_autosubmit_scoring_and_reconciliation():
    """Covers Phases 1–8: 15s grace timer, reconnect cancel, auto-submit scoring, race safety, late-sync & counters."""
    inst_id = uuid.uuid4()
    dept_id = uuid.uuid4()
    batch_id = uuid.uuid4()
    trainer_id = uuid.uuid4()
    quiz_id = uuid.uuid4()

    stu_manual = uuid.uuid4()
    stu_reconn = uuid.uuid4()
    stu_timeout = uuid.uuid4()
    stu_race = uuid.uuid4()

    trainer_ctx = DummyScope(trainer_id, Role.TRAINER, inst_id)

    async with get_pg_connection() as conn:
        await conn.execute(
            "INSERT INTO institutions (id, name, code) VALUES ($1, 'Grace Inst', $2)",
            inst_id, f"GI-{str(inst_id)[:6]}",
        )
        await conn.execute(
            "INSERT INTO departments (id, institution_id, name, code) VALUES ($1, $2, 'Grace Dept', $3)",
            dept_id, inst_id, f"GD-{str(dept_id)[:6]}",
        )
        await conn.execute(
            "INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'Trainer', $2, 'h', 'TRAINER', 'ACTIVE')",
            trainer_id, f"t_{trainer_id}@grace.com",
        )
        await conn.execute(
            "INSERT INTO batches (id, institution_id, department_id, name, code, status) VALUES ($1, $2, $3, 'GraceBatch', 'GB1', 'ACTIVE')",
            batch_id, inst_id, dept_id,
        )
        await conn.execute(
            """
            INSERT INTO quizzes (
                id, creator_trainer_id, institution_id, batch_id, title, kind,
                duration_minutes, max_score, questions, allow_retake, connection_grace_seconds, status
            ) VALUES ($1, $2, $3, $4, 'Grace Quiz', 'quiz', 30, 30, $5::jsonb, FALSE, 15, 'active')
            """,
            quiz_id, trainer_id, inst_id, batch_id, json.dumps(QUESTIONS),
        )
        await conn.execute(
            "INSERT INTO quiz_batch_assignments (id, quiz_id, batch_id, institution_id, assigned_by, status) VALUES (gen_random_uuid(), $1, $2, $3, $4, 'ACTIVE')",
            quiz_id, batch_id, inst_id, trainer_id,
        )

        for uid, roll in [(stu_manual, "G01"), (stu_reconn, "G02"), (stu_timeout, "G03"), (stu_race, "G04")]:
            await conn.execute(
                "INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, $2, $3, 'h', 'STUDENT', 'ACTIVE')",
                uid, f"Student {roll}", f"{roll.lower()}_{uid}@grace.com",
            )
            await conn.execute(
                "INSERT INTO student_profiles (id, user_id, institution_id, batch_id, roll_number) VALUES (gen_random_uuid(), $1, $2, $3, $4)",
                uid, inst_id, batch_id, roll,
            )

        # Seed active attempts with server-persisted answers
        for uid, ans in [
            (stu_manual, {"q1": "a", "q2": "b", "q3": "a"}),
            (stu_reconn, {"q1": "a"}),
            # G03: q1 correct (+10), q2 wrong (-2), q3 unattempted (0) -> score 8/30
            (stu_timeout, {"q1": "a", "q2": "a"}),
            (stu_race, {"q1": "a", "q2": "b"}),
        ]:
            await conn.execute(
                """
                INSERT INTO quiz_attempts (
                    id, quiz_id, student_user_id, batch_id, institution_id,
                    answers, status, candidate_status, last_heartbeat_at, created_at
                ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, 'in_progress', 'IN_PROGRESS', NOW(), NOW())
                """,
                quiz_id, uid, batch_id, inst_id, json.dumps(ans),
            )

    # 1. Manual submission -> COMPLETED
    manual_res = await QuizRepository.submit_quiz_attempt(
        DummyScope(stu_manual, Role.STUDENT, inst_id),
        str(quiz_id),
        answers={"q1": "a", "q2": "b", "q3": "a"},
    )
    assert manual_res["candidateStatus"] == "COMPLETED"
    assert manual_res["score"] == 30

    # 2. Connection loss for 5s -> SUBMISSION_PROCESSING, NO auto-submit
    g1 = await QuizRepository.mark_connection_lost_if_active(str(quiz_id), str(stu_reconn))
    assert g1 is not None and g1["graceSeconds"] == 15
    # Duplicate disconnect does NOT reset deadline
    g1_dup = await QuizRepository.mark_connection_lost_if_active(str(quiz_id), str(stu_reconn))
    assert g1_dup is not None and g1_dup["alreadyPending"] is True
    assert g1_dup["graceDeadlineAt"] == g1["graceDeadlineAt"]

    swept_early = await QuizRepository.sweep_expired_grace_deadlines(str(quiz_id))
    assert len(swept_early) == 0

    # 3. Reconnection at 10s (before 15s deadline) -> timer cancelled, ACTIVE restored, no duplicate attempt
    reconn_res = await QuizRepository.cancel_connection_loss_on_reconnect(str(quiz_id), str(stu_reconn))
    assert reconn_res["restored"] is True and reconn_res["finalized"] is False

    # 4 & 5 & 6 & 10. Connection loss expired (simulating backend restart retaining DB grace_deadline_at) -> auto-submit + accurate negative-marked score
    await QuizRepository.mark_connection_lost_if_active(str(quiz_id), str(stu_timeout))
    async with get_pg_connection() as conn:
        await conn.execute(
            "UPDATE quiz_attempts SET grace_deadline_at = NOW() - INTERVAL '1 second' WHERE quiz_id = $1 AND student_user_id = $2",
            quiz_id, stu_timeout,
        )
    swept = await QuizRepository.sweep_expired_grace_deadlines(str(quiz_id))
    assert len(swept) == 1
    assert swept[0]["candidateStatus"] == "AUTO_SUBMITTED"
    assert swept[0]["submissionReason"] == "AUTO_SUBMITTED_CONNECTION_TIMEOUT"
    assert swept[0]["score"] == 8  # 10 - 2 negative marking
    assert swept[0]["correctCount"] == 1
    assert swept[0]["incorrectCount"] == 1
    assert swept[0]["unattemptedCount"] == 1

    # 8. Late heartbeat after submission -> remains completed / AUTO_SUBMITTED, never reopens
    late_hb = await QuizRepository.record_student_heartbeat(
        DummyScope(stu_timeout, Role.STUDENT, inst_id),
        str(quiz_id),
    )
    assert late_hb["active"] is False
    assert late_hb["status"] == "completed"

    # 9 & 14. Manual and automatic submission race -> exactly one final result & one report
    await QuizRepository.mark_connection_lost_if_active(str(quiz_id), str(stu_race))
    async with get_pg_connection() as conn:
        await conn.execute(
            "UPDATE quiz_attempts SET grace_deadline_at = NOW() - INTERVAL '1 second' WHERE quiz_id = $1 AND student_user_id = $2",
            quiz_id, stu_race,
        )
    r_manual, r_sweep = await asyncio.gather(
        QuizRepository.submit_quiz_attempt(DummyScope(stu_race, Role.STUDENT, inst_id), str(quiz_id), answers=None),
        QuizRepository.sweep_expired_grace_deadlines(str(quiz_id)),
    )
    assert r_manual["score"] == 20
    assert len(r_sweep) <= 1
    async with get_pg_connection() as conn:
        att_rows = await conn.fetch(
            "SELECT id FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
            quiz_id, stu_race,
        )
        assert len(att_rows) == 1
        rep_cnt = await conn.fetchval(
            "SELECT COUNT(*) FROM assessment_reports WHERE attempt_id = $1",
            att_rows[0]["id"],
        )
        assert rep_cnt == 1

    # 7. Safe late-sync reconciliation for unsynced offline answers after AUTO_SUBMITTED_CONNECTION_TIMEOUT
    op_id = uuid.uuid4()
    sync_res = await OfflineRepository.process_sync_batch(
        DummyScope(stu_timeout, Role.STUDENT, inst_id),
        [
            {
                "operationId": str(op_id),
                "resourceType": "ASSESSMENT_SUBMISSION",
                "resourceId": str(quiz_id),
                "payload": {
                    "quizId": str(quiz_id),
                    "answers": [
                        {"questionId": "q1", "optionId": "a"},
                        {"questionId": "q2", "optionId": "b"},
                        {"questionId": "q3", "optionId": "a"},
                    ],
                    "durationSeconds": 120,
                    "localSubmittedAt": datetime.now(timezone.utc).isoformat(),
                },
            }
        ],
    )
    assert sync_res[0]["status"] == "PROCESSED"

    # Existing manual completed attempt must NOT be overwritten by late offline sync (CONFLICT)
    conflict_res = await OfflineRepository.process_sync_batch(
        DummyScope(stu_manual, Role.STUDENT, inst_id),
        [
            {
                "operationId": str(uuid.uuid4()),
                "resourceType": "ASSESSMENT_SUBMISSION",
                "resourceId": str(quiz_id),
                "payload": {
                    "quizId": str(quiz_id),
                    "answers": [{"questionId": "q1", "optionId": "b"}],
                    "durationSeconds": 60,
                },
            }
        ],
    )
    assert conflict_res[0]["status"] == "CONFLICT"

    # 15. Monitor counters & statuses match submission lifecycle
    mon = await get_assessment_monitor_data(str(quiz_id), ctx=trainer_ctx, status_filter="ALL_STARTED")
    counters = mon["data"]["counters"]
    assert counters["totalCandidates"] == 4
    assert counters["startedCount"] == 4
    assert counters["completedCount"] >= 1
    assert counters["offlineSubmittedCount"] == 1
    assert counters["activeCount"] == 1
    by_roll = {s["roll_number"]: s for s in mon["data"]["students"]}
    assert by_roll["G01"]["candidate_status"] == "COMPLETED"
    assert by_roll["G02"]["candidate_status"] == "ACTIVE"
    assert by_roll["G03"]["candidate_status"] == "OFFLINE_SUBMITTED"
    assert "DISCONNECTED" not in {s["candidate_status"] for s in mon["data"]["students"]}
