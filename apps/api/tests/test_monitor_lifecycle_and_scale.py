import asyncio
import json
import time
import uuid
from datetime import datetime, timedelta, timezone
import pytest

from app.authz.roles import Role
from app.core.errors import ScopeForbidden
from app.db.postgres import get_pg_connection
from app.routers.assessment_realtime import (
    get_assessment_monitor_data,
    get_latest_snapshots_for_candidates,
    get_student_attempt_history,
    get_student_historical_snapshots,
)


class DummyScope:
    def __init__(self, user_id, role=Role.TRAINER, college_id=None):
        self.user_id = user_id
        self.role = role
        self.college_id = college_id or uuid.uuid4()
        self.department_id = uuid.uuid4()
        self.session_id = f"sess-{user_id}"
        self.email = f"user_{user_id}@test.com"


@pytest.mark.asyncio
async def test_monitor_dedup_auth_status_camera_and_search():
    """Verifies 1-row deduplication, trainer auth, all 8 statuses, camera DONE/HISTORICAL, search & filters."""
    trainer_id = uuid.uuid4()
    other_trainer_id = uuid.uuid4()
    quiz_id = uuid.uuid4()
    inst_id = uuid.uuid4()
    dept_id = uuid.uuid4()
    batch_id = uuid.uuid4()

    # 8 students covering all lifecycle states + 1 not started + 1 duplicate attempt student
    s_ids = [uuid.uuid4() for _ in range(9)]

    async with get_pg_connection() as conn:
        await conn.execute(
            "INSERT INTO institutions (id, name, code, created_at, updated_at) VALUES ($1, 'Test Inst', $2, NOW(), NOW()) ON CONFLICT DO NOTHING",
            inst_id, f"INST-{str(inst_id)[:6]}",
        )
        await conn.execute(
            "INSERT INTO departments (id, institution_id, name, code, created_at, updated_at) VALUES ($1, $2, 'CS', $3, NOW(), NOW()) ON CONFLICT DO NOTHING",
            dept_id, inst_id, f"DEPT-{str(dept_id)[:6]}",
        )
        await conn.execute(
            "INSERT INTO batches (id, institution_id, department_id, name, code, semester, created_at, updated_at) VALUES ($1, $2, $3, 'Batch A', $4, 1, NOW(), NOW()) ON CONFLICT DO NOTHING",
            batch_id, inst_id, dept_id, f"B-{str(batch_id)[:6]}",
        )
        for uid, role, name in [
            (trainer_id, "TRAINER", "Auth Trainer"),
            (other_trainer_id, "TRAINER", "Unauth Trainer"),
        ]:
            await conn.execute(
                "INSERT INTO users (id, name, email, password_hash, role, status, created_at, updated_at) VALUES ($1, $2, $3, 'h', $4, 'ACTIVE', NOW(), NOW())",
                uid, name, f"{uid}@t.com", role,
            )

        await conn.execute(
            """
            INSERT INTO quizzes (
                id, institution_id, batch_id, creator_trainer_id, title, kind,
                duration_minutes, max_score, allow_retake, opens_at, closes_at,
                questions, status, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, 'Monitor Lifecycle Exam', 'quiz',
                30, 100, true, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '2 hours',
                '[{"id":"q1","text":"Q1","marks":10,"options":[{"id":"o1","text":"O1","correct":true}]}]'::jsonb,
                'active', NOW(), NOW()
            )
            """,
            quiz_id, inst_id, batch_id, trainer_id,
        )

        names = [
            "Alice Active", "Bob Disconnected", "Cara SyncPending",
            "Dan OfflineSub", "Eve Completed", "Frank AutoSub",
            "Grace Abandoned", "Hank Duplicate", "Ivy NotStarted",
        ]
        for idx, sid in enumerate(s_ids):
            await conn.execute(
                "INSERT INTO users (id, name, email, password_hash, role, status, created_at, updated_at) VALUES ($1, $2, $3, 'h', 'STUDENT', 'ACTIVE', NOW(), NOW())",
                sid, names[idx], f"s{idx}_{str(sid)[:6]}@t.com",
            )
            await conn.execute(
                "INSERT INTO student_profiles (id, user_id, roll_number, institution_id, department_id, batch_id, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())",
                sid, f"25EARCS{200 + idx}", inst_id, dept_id, batch_id,
            )

        # 0: ACTIVE (recent heartbeat)
        await conn.execute(
            "INSERT INTO quiz_attempts (id, quiz_id, student_user_id, status, candidate_status, last_heartbeat_at, created_at) VALUES (gen_random_uuid(), $1, $2, 'in_progress', 'IN_PROGRESS', NOW(), NOW())",
            quiz_id, s_ids[0],
        )
        # 1: DISCONNECTED (old heartbeat, has snapshot)
        await conn.execute(
            "INSERT INTO quiz_attempts (id, quiz_id, student_user_id, status, candidate_status, last_heartbeat_at, last_camera_frame_at, created_at) VALUES (gen_random_uuid(), $1, $2, 'in_progress', 'IN_PROGRESS', NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '5 minutes', NOW())",
            quiz_id, s_ids[1],
        )
        await conn.execute(
            "INSERT INTO quiz_camera_snapshots (id, quiz_id, student_user_id, event_type, image_data, snapshot_timestamp) VALUES (gen_random_uuid(), $1, $2, 'PERIODIC', 'data:image/jpeg;base64,/9j/test', NOW() - INTERVAL '5 minutes')",
            quiz_id, s_ids[1],
        )
        # 2: OFFLINE_SYNC_PENDING (via sync_operations)
        await conn.execute(
            "INSERT INTO quiz_attempts (id, quiz_id, student_user_id, status, candidate_status, last_heartbeat_at, created_at) VALUES (gen_random_uuid(), $1, $2, 'in_progress', 'IN_PROGRESS', NOW() - INTERVAL '5 minutes', NOW())",
            quiz_id, s_ids[2],
        )
        await conn.execute(
            "INSERT INTO sync_operations (id, operation_id, user_id, resource_type, resource_id, operation_type, payload, client_timestamp, status) VALUES (gen_random_uuid(), gen_random_uuid(), $1, 'ASSESSMENT_SUBMISSION', $2, 'SUBMIT_ASSESSMENT', '{}'::jsonb, NOW(), 'PENDING')",
            s_ids[2], quiz_id,
        )
        # 3: OFFLINE_SUBMITTED
        await conn.execute(
            "INSERT INTO quiz_attempts (id, quiz_id, student_user_id, status, candidate_status, submission_source, score, completed_at, created_at) VALUES (gen_random_uuid(), $1, $2, 'completed', 'OFFLINE_SUBMITTED', 'OFFLINE_SYNC', 90, NOW(), NOW())",
            quiz_id, s_ids[3],
        )
        # 4: COMPLETED (online + warning + snapshot -> camera DONE)
        await conn.execute(
            "INSERT INTO quiz_attempts (id, quiz_id, student_user_id, status, candidate_status, submission_source, warning_count, score, last_camera_frame_at, completed_at, created_at) VALUES (gen_random_uuid(), $1, $2, 'completed', 'COMPLETED', 'ONLINE', 2, 100, NOW(), NOW(), NOW())",
            quiz_id, s_ids[4],
        )
        await conn.execute(
            "INSERT INTO quiz_camera_snapshots (id, quiz_id, student_user_id, event_type, image_data, snapshot_timestamp) VALUES (gen_random_uuid(), $1, $2, 'PERIODIC', 'data:image/jpeg;base64,/9j/done', NOW())",
            quiz_id, s_ids[4],
        )
        # 5: AUTO_SUBMITTED
        await conn.execute(
            "INSERT INTO quiz_attempts (id, quiz_id, student_user_id, status, candidate_status, submission_reason, completed_at, created_at) VALUES (gen_random_uuid(), $1, $2, 'completed', 'AUTO_SUBMITTED', 'TIMER_EXPIRED', NOW(), NOW())",
            quiz_id, s_ids[5],
        )
        # 6: ABANDONED
        await conn.execute(
            "INSERT INTO quiz_attempts (id, quiz_id, student_user_id, status, candidate_status, submission_reason, completed_at, created_at) VALUES (gen_random_uuid(), $1, $2, 'completed', 'ABANDONED', 'ABANDONMENT_TIMEOUT', NOW(), NOW())",
            quiz_id, s_ids[6],
        )
        # 7: DUPLICATE ATTEMPTS (1 older ABANDONED + 1 newer COMPLETED -> must return 1 row COMPLETED, attempt_count=2)
        await conn.execute(
            "INSERT INTO quiz_attempts (id, quiz_id, student_user_id, status, candidate_status, warning_count, completed_at, created_at) VALUES (gen_random_uuid(), $1, $2, 'completed', 'ABANDONED', 1, NOW() - INTERVAL '20 minutes', NOW() - INTERVAL '30 minutes')",
            quiz_id, s_ids[7],
        )
        await conn.execute(
            "INSERT INTO quiz_attempts (id, quiz_id, student_user_id, status, candidate_status, warning_count, score, completed_at, created_at) VALUES (gen_random_uuid(), $1, $2, 'completed', 'COMPLETED', 0, 80, NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '10 minutes')",
            quiz_id, s_ids[7],
        )
        # 8: NOT_STARTED (in student_profiles batch, no quiz_attempts row)

    # 1. Unauthorized trainer must be rejected
    unauth_ctx = DummyScope(other_trainer_id, Role.TRAINER)
    with pytest.raises(ScopeForbidden):
        await get_assessment_monitor_data(str(quiz_id), ctx=unauth_ctx)

    # 2. Authorized trainer gets deduplicated 8 started rows + 1 not started
    auth_ctx = DummyScope(trainer_id, Role.TRAINER)
    res = await get_assessment_monitor_data(str(quiz_id), status_filter="ALL_STARTED", page=1, page_size=50, ctx=auth_ctx)
    data = res["data"]
    counters = data["counters"]
    assert counters["startedCount"] == 8
    assert counters["notStartedCount"] == 1
    assert counters["totalCandidates"] == 9
    assert counters["activeCount"] == 1
    assert counters["disconnectedCount"] == 1
    assert counters["syncPendingCount"] == 1
    assert counters["offlineSubmittedCount"] == 1
    assert counters["completedCount"] == 2  # Eve + Hank (deduped)
    assert counters["autoSubmittedCount"] == 1
    assert counters["abandonedCount"] == 1
    assert counters["warningsTotal"] == 2  # Only Eve's 2 warnings (Hank's old abandoned attempt warning not double-counted)

    students_by_roll = {s["roll_number"]: s for s in data["students"]}
    assert len(data["students"]) == 8
    assert students_by_roll["25EARCS201"]["camera_status"] == "HISTORICAL"
    assert students_by_roll["25EARCS204"]["camera_status"] == "DONE"
    assert students_by_roll["25EARCS207"]["attempt_count"] == 2
    assert students_by_roll["25EARCS207"]["candidate_status"] == "COMPLETED"

    # 3. Attempt history lazy endpoint returns both attempts for Hank
    hist = await get_student_attempt_history(str(quiz_id), str(s_ids[7]), ctx=auth_ctx)
    assert len(hist["data"]["attempts"]) == 2

    # 4. Demand-based latest snapshots & history
    snaps = await get_latest_snapshots_for_candidates(str(quiz_id), student_ids=f"{s_ids[1]},{s_ids[4]}", ctx=auth_ctx)
    assert str(s_ids[1]) in snaps["data"]["snapshots"]
    assert str(s_ids[4]) in snaps["data"]["snapshots"]
    snap_hist = await get_student_historical_snapshots(str(quiz_id), str(s_ids[4]), ctx=auth_ctx)
    assert len(snap_hist["data"]["snapshots"]) == 1

    # 5. Search + filter + pagination
    filtered = await get_assessment_monitor_data(str(quiz_id), search="25EARCS203", status_filter="OFFLINE_SUBMITTED", ctx=auth_ctx)
    assert filtered["data"]["pagination"]["totalFiltered"] == 1
    assert filtered["data"]["students"][0]["name"] == "Dan OfflineSub"

    warn_only = await get_assessment_monitor_data(str(quiz_id), status_filter="WITH_WARNINGS", ctx=auth_ctx)
    assert warn_only["data"]["pagination"]["totalFiltered"] == 1
    assert warn_only["data"]["students"][0]["roll_number"] == "25EARCS204"

    # 6. Verify all 8 sorting options (asc & desc) + combined search/filter/pagination
    for sort_field in (
        "roll_number",
        "name",
        "progress",
        "remaining_seconds",
        "warnings",
        "status",
        "last_activity",
        "submission_time",
    ):
        asc_res = await get_assessment_monitor_data(
            str(quiz_id), status_filter="ALL_STARTED", sort_by=sort_field, sort_dir="asc", page=1, page_size=50, ctx=auth_ctx
        )
        desc_res = await get_assessment_monitor_data(
            str(quiz_id), status_filter="ALL_STARTED", sort_by=sort_field, sort_dir="desc", page=1, page_size=50, ctx=auth_ctx
        )
        assert len(asc_res["data"]["students"]) == 8
        assert len(desc_res["data"]["students"]) == 8

    # Name A-Z vs Z-A
    name_asc = await get_assessment_monitor_data(str(quiz_id), sort_by="name", sort_dir="asc", ctx=auth_ctx)
    name_desc = await get_assessment_monitor_data(str(quiz_id), sort_by="name", sort_dir="desc", ctx=auth_ctx)
    assert name_asc["data"]["students"][0]["name"] == "Alice Active"
    assert name_desc["data"]["students"][0]["name"] == "Hank Duplicate"

    # Warnings High to Low puts Eve (2 warnings) first
    warn_desc = await get_assessment_monitor_data(str(quiz_id), sort_by="warnings", sort_dir="desc", ctx=auth_ctx)
    assert warn_desc["data"]["students"][0]["roll_number"] == "25EARCS204"
    assert warn_desc["data"]["students"][0]["warnings"] == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("cohort_size", [10, 50, 100, 250, 500])
async def test_monitor_scale_performance(cohort_size: int):
    """Benchmarks monitor API latency and payload size at 10, 50, 100, 250, and 500 candidates."""
    trainer_id = uuid.uuid4()
    quiz_id = uuid.uuid4()
    inst_id = uuid.uuid4()
    dept_id = uuid.uuid4()
    batch_id = uuid.uuid4()

    async with get_pg_connection() as conn:
        await conn.execute(
            "INSERT INTO institutions (id, name, code, created_at, updated_at) VALUES ($1, 'Perf Inst', $2, NOW(), NOW()) ON CONFLICT DO NOTHING",
            inst_id, f"PI-{str(inst_id)[:6]}",
        )
        await conn.execute(
            "INSERT INTO departments (id, institution_id, name, code, created_at, updated_at) VALUES ($1, $2, 'CS', $3, NOW(), NOW()) ON CONFLICT DO NOTHING",
            dept_id, inst_id, f"PD-{str(dept_id)[:6]}",
        )
        await conn.execute(
            "INSERT INTO batches (id, institution_id, department_id, name, code, semester, created_at, updated_at) VALUES ($1, $2, $3, 'Perf Batch', $4, 1, NOW(), NOW()) ON CONFLICT DO NOTHING",
            batch_id, inst_id, dept_id, f"PB-{str(batch_id)[:6]}",
        )
        await conn.execute(
            "INSERT INTO users (id, name, email, password_hash, role, status, created_at, updated_at) VALUES ($1, 'Perf Trainer', $2, 'h', 'TRAINER', 'ACTIVE', NOW(), NOW())",
            trainer_id, f"pt_{trainer_id}@t.com",
        )
        await conn.execute(
            "INSERT INTO quizzes (id, institution_id, batch_id, creator_trainer_id, title, kind, duration_minutes, max_score, questions, status) VALUES ($1, $2, $3, $4, 'Scale Quiz', 'quiz', 30, 100, '[]'::jsonb, 'active')",
            quiz_id, inst_id, batch_id, trainer_id,
        )

        user_rows = []
        prof_rows = []
        att_rows = []
        for i in range(cohort_size):
            sid = uuid.uuid4()
            user_rows.append((sid, f"Student {i}", f"perf_{cohort_size}_{i}_{str(sid)[:6]}@t.com"))
            prof_rows.append((sid, f"PERF-{i:04d}", inst_id, dept_id, batch_id))
            att_rows.append((uuid.uuid4(), quiz_id, sid, "completed" if i % 2 == 0 else "in_progress", "COMPLETED" if i % 2 == 0 else "IN_PROGRESS"))

        await conn.executemany(
            "INSERT INTO users (id, name, email, password_hash, role, status, created_at, updated_at) VALUES ($1, $2, $3, 'h', 'STUDENT', 'ACTIVE', NOW(), NOW())",
            user_rows,
        )
        await conn.executemany(
            "INSERT INTO student_profiles (id, user_id, roll_number, institution_id, department_id, batch_id, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())",
            prof_rows,
        )
        await conn.executemany(
            "INSERT INTO quiz_attempts (id, quiz_id, student_user_id, status, candidate_status, last_heartbeat_at, created_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())",
            att_rows,
        )

    ctx = DummyScope(trainer_id, Role.TRAINER)
    t0 = time.perf_counter()
    res = await get_assessment_monitor_data(str(quiz_id), page=1, page_size=50, ctx=ctx)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    payload_bytes = len(json.dumps(res).encode("utf-8"))

    print(f"[SCALE {cohort_size}] latency_ms={elapsed_ms:.2f}, payload_bytes={payload_bytes}, returned_rows={len(res['data']['students'])}")
    assert res["data"]["counters"]["startedCount"] == cohort_size
    assert len(res["data"]["students"]) == min(50, cohort_size)
    assert payload_bytes < 65000  # Even at 500 candidates, paginated JSON stays tiny (<65KB, zero Base64 bloat)
