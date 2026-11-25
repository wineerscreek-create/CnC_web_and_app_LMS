import json
import uuid
from pathlib import Path
import pytest

from app.authz.roles import Role
from app.db.postgres import get_pg_connection
from app.routers.assessment_realtime import get_assessment_monitor_data


class DummyScope:
    def __init__(self, user_id, role=Role.TRAINER):
        self.user_id = user_id
        self.role = role
        self.college_id = uuid.uuid4()
        self.department_id = uuid.uuid4()
        self.session_id = f"sess-{user_id}"
        self.email = f"u_{user_id}@test.com"


@pytest.mark.asyncio
async def test_migration_035_reconciles_duplicate_active_attempts_non_destructively():
    """Simulates production duplicate in_progress attempts and verifies Migration 035 reconciles them safely & idempotently."""
    trainer_id = uuid.uuid4()
    student_id = uuid.uuid4()
    quiz_id = uuid.uuid4()
    att_old = uuid.uuid4()
    att_new = uuid.uuid4()

    sql_035 = Path("apps/api/migrations/035_monitor_dedup_and_offline_indexes.sql").read_text(encoding="utf-8")

    async with get_pg_connection() as conn:
        await conn.execute(
            "INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'T', $2, 'h', 'TRAINER', 'ACTIVE')",
            trainer_id, f"t_{trainer_id}@m.com",
        )
        await conn.execute(
            "INSERT INTO users (id, name, email, password_hash, role, status) VALUES ($1, 'S', $2, 'h', 'STUDENT', 'ACTIVE')",
            student_id, f"s_{student_id}@m.com",
        )
        await conn.execute(
            "INSERT INTO quizzes (id, creator_trainer_id, title, kind, duration_minutes, max_score, questions, status) VALUES ($1, $2, 'Mig35 Quiz', 'quiz', 30, 100, '[]'::jsonb, 'active')",
            quiz_id, trainer_id,
        )

        # Drop partial unique index temporarily to reproduce production pre-035 duplicate state
        await conn.execute("DROP INDEX IF EXISTS uq_quiz_attempts_active_per_student")
        await conn.execute(
            """
            INSERT INTO quiz_attempts (id, quiz_id, student_user_id, status, candidate_status, answers, last_heartbeat_at, created_at)
            VALUES ($1, $2, $3, 'in_progress', 'IN_PROGRESS', '{"q1": "a1", "q2": "old_b"}'::jsonb, NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '10 minutes')
            """,
            att_old, quiz_id, student_id,
        )
        await conn.execute(
            """
            INSERT INTO quiz_attempts (id, quiz_id, student_user_id, status, candidate_status, answers, last_heartbeat_at, created_at)
            VALUES ($1, $2, $3, 'in_progress', 'IN_PROGRESS', '{"q2": "new_b", "q3": "c3"}'::jsonb, NOW(), NOW() - INTERVAL '2 minutes')
            """,
            att_new, quiz_id, student_id,
        )

        # Execute Migration 035 (must reconcile duplicates, create unique index, and succeed)
        await conn.execute(sql_035)
        # Execute a second time to verify idempotency
        await conn.execute(sql_035)

        rows = await conn.fetch(
            "SELECT id, status, candidate_status, submission_reason, answers FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
            quiz_id, student_id,
        )
        assert len(rows) == 2  # Non-destructive: neither row deleted!
        by_id = {r["id"]: r for r in rows}

        # att_new (2 answers, newer heartbeat) is canonical
        assert by_id[att_new]["status"] == "in_progress"
        ans_canon = json.loads(by_id[att_new]["answers"]) if isinstance(by_id[att_new]["answers"], str) else by_id[att_new]["answers"]
        assert ans_canon["q1"] == "a1"      # Merged from att_old
        assert ans_canon["q2"] == "new_b"   # Preserved canonical's newer answer
        assert ans_canon["q3"] == "c3"

        # att_old is superseded, NOT deleted, NOT falsely marked completed
        assert by_id[att_old]["status"] == "superseded"
        assert by_id[att_old]["candidate_status"] == "SUPERSEDED_DUPLICATE"
        assert by_id[att_old]["submission_reason"] == "RECONCILED_DUPLICATE_ACTIVE"

        # Audit log created
        log_row = await conn.fetchrow(
            "SELECT * FROM quiz_attempt_reconciliation_logs WHERE quiz_id = $1 AND student_user_id = $2",
            quiz_id, student_id,
        )
        assert log_row is not None
        assert log_row["canonical_attempt_id"] == att_new
        assert log_row["reconciled_attempt_id"] == att_old
        assert log_row["merged_answers_count"] == 1

        # Unique index exists
        idx_exists = await conn.fetchval(
            "SELECT 1 FROM pg_indexes WHERE indexname = 'uq_quiz_attempts_active_per_student'"
        )
        assert idx_exists == 1

    # Monitor returns exactly 1 row for this student, and SYNC_PENDING filter returns 0 rows
    t_ctx = DummyScope(trainer_id, Role.TRAINER)
    mon = await get_assessment_monitor_data(str(quiz_id), ctx=t_ctx)
    assert len(mon["data"]["students"]) == 1
    assert mon["data"]["counters"]["activeCount"] == 1

    sync_only = await get_assessment_monitor_data(str(quiz_id), ctx=t_ctx, status_filter="SYNC_PENDING")
    assert len(sync_only["data"]["students"]) == 0
    assert sync_only["data"]["counters"]["activeCount"] == 1
