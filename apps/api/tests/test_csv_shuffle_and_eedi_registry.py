import io
import uuid
import pytest
from starlette.datastructures import UploadFile

from app.authz.roles import Role
from app.core.errors import ValidationError
from app.db.postgres import get_pg_connection
from app.repositories.assignment_quiz_repo import QuizRepository
from app.repositories.offline_repo import OfflineRepository
from app.routers.trainer import (
    download_sample_assessment_csv,
    get_trainer_eedi_indexes,
    upload_trainer_assessment_csv,
)


class DummyScope:
    def __init__(self, user_id: uuid.UUID, role: Role = Role.TRAINER, college_id: uuid.UUID | None = None):
        self.user_id = user_id
        self.role = role
        self.college_id = college_id
        self.department_id = None
        self.session_id = f"sess-{user_id}"
        self.email = f"u_{user_id}@test.com"


@pytest.mark.asyncio
async def test_combined_mcq_msq_csv_shuffling_offline_and_eedi_registry():
    """Verifies combined MCQ/MSQ CSV import, sample CSV, validation, shuffling persistence, offline sync, and EEDI."""
    inst_id = uuid.uuid4()
    dept_id = uuid.uuid4()
    batch_id = uuid.uuid4()
    trainer_id = uuid.uuid4()
    s1_id = uuid.uuid4()
    s2_id = uuid.uuid4()
    quiz_id = uuid.uuid4()

    trainer_ctx = DummyScope(trainer_id, Role.TRAINER, inst_id)
    s1_ctx = DummyScope(s1_id, Role.STUDENT, inst_id)
    s2_ctx = DummyScope(s2_id, Role.STUDENT, inst_id)

    async with get_pg_connection() as conn:
        await conn.execute(
            "INSERT INTO institutions (id, name, code) VALUES ($1, 'Shuffle Inst', $2)",
            inst_id, f"SI-{str(inst_id)[:6]}",
        )
        await conn.execute(
            "INSERT INTO departments (id, institution_id, name, code) VALUES ($1, $2, 'Shuffle Dept', $3)",
            dept_id, inst_id, f"SD-{str(dept_id)[:6]}",
        )
        await conn.execute(
            "INSERT INTO users (id, name, email, password_hash, role, institution_id, status) VALUES ($1, 'Trainer', $2, 'h', 'TRAINER', $3, 'ACTIVE')",
            trainer_id, f"t_{trainer_id}@shuf.com", inst_id,
        )
        await conn.execute(
            "INSERT INTO batches (id, institution_id, department_id, name, code, status) VALUES ($1, $2, $3, 'ShufBatch', 'SB1', 'ACTIVE')",
            batch_id, inst_id, dept_id,
        )
        for uid, roll in [(s1_id, "S01"), (s2_id, "S02")]:
            await conn.execute(
                "INSERT INTO users (id, name, email, password_hash, role, institution_id, status) VALUES ($1, $2, $3, 'h', 'STUDENT', $4, 'ACTIVE')",
                uid, f"Student {roll}", f"{roll.lower()}_{uid}@shuf.com", inst_id,
            )
            await conn.execute(
                "INSERT INTO student_profiles (id, user_id, institution_id, batch_id, roll_number) VALUES (gen_random_uuid(), $1, $2, $3, $4)",
                uid, inst_id, batch_id, roll,
            )
        await conn.execute(
            """
            INSERT INTO quizzes (
                id, creator_trainer_id, institution_id, batch_id, title, kind,
                duration_minutes, max_score, questions, settings, allow_retake, status
            ) VALUES (
                $1, $2, $3, $4, 'Combined CSV & Shuffle Quiz', 'quiz', 30, 10, '[]'::jsonb,
                '{"random_questions": true, "random_options": true}'::jsonb, FALSE, 'active'
            )
            """,
            quiz_id, trainer_id, inst_id, batch_id,
        )
        await conn.execute(
            "INSERT INTO quiz_batch_assignments (id, quiz_id, batch_id, institution_id, assigned_by, status) VALUES (gen_random_uuid(), $1, $2, $3, $4, 'ACTIVE')",
            quiz_id, batch_id, inst_id, trainer_id,
        )

    # 1. Verify EEDI index registry endpoint matches evaluation_parameters table
    eedi_resp = await get_trainer_eedi_indexes(ctx=trainer_ctx)
    assert eedi_resp["success"] is True
    codes = {item["code"] for item in eedi_resp["data"]["indexes"]}
    assert "TEC01" in codes and "TEC02" in codes and "PRB02" in codes
    assert len(codes) >= 95

    # 2. Download sample CSV & re-upload directly
    sample_resp = await download_sample_assessment_csv(ctx=trainer_ctx)
    assert sample_resp.status_code == 200
    sample_bytes = sample_resp.body
    up_sample = await upload_trainer_assessment_csv(
        str(quiz_id),
        UploadFile(filename="sample.csv", file=io.BytesIO(sample_bytes)),
        ctx=trainer_ctx,
    )
    assert up_sample["questionCount"] == 2
    assert up_sample["mcqCount"] == 1
    assert up_sample["msqCount"] == 1

    # 3. Invalid CSV validation (invalid question_type, MCQ multiple answers, bad EEDI code)
    bad_csv = (
        "question_type,question,option_a,option_b,option_c,option_d,correct_answers,marks,negative_marks,explanation,eedi_parameters\n"
        'ESSAY,"Bad type?","A","B","","",A,1,0,"","TEC01"\n'
        'MCQ,"Too many?","A","B","C","",A|B,1,0,"","TEC01"\n'
        'MCQ,"Bad EEDI?","A","B","","",A,1,0,"","INVALID_CODE"\n'
    ).encode("utf-8")
    with pytest.raises(ValidationError) as exc_info:
        await upload_trainer_assessment_csv(
            str(quiz_id),
            UploadFile(filename="bad.csv", file=io.BytesIO(bad_csv)),
            ctx=trainer_ctx,
        )
    assert "Row 2" in str(exc_info.value)

    # 4. Upload 6-question combined MCQ + MSQ CSV with negative marking & EEDI codes
    combined_csv = (
        "question_type,question,option_a,option_b,option_c,option_d,correct_answers,marks,negative_marks,explanation,eedi_parameters\n"
        'MCQ,"Q1 JVM?","Python","Java","C","HTML",B,2,1,"Java","TEC01"\n'
        'MSQ,"Q2 Langs?","Java","Python","HTML","CSS","A|B",4,1,"Java+Py","TEC02|PRB02"\n'
        'MCQ,"Q3 Web?","HTML","SQL","C","Go",A,2,1,"HTML","TEC01"\n'
        'MSQ,"Q4 DBs?","Postgres","MySQL","CSS","HTML","A|B",2,0,"SQL DBs","TEC05"\n'
    ).encode("utf-8")
    up_ok = await upload_trainer_assessment_csv(
        str(quiz_id),
        UploadFile(filename="combined.csv", file=io.BytesIO(combined_csv)),
        ctx=trainer_ctx,
    )
    assert up_ok["questionCount"] == 4
    assert up_ok["mcqCount"] == 2
    assert up_ok["msqCount"] == 2

    # 5 & 6 & 7. Start attempt for S1, verify shuffle order persists identically on refresh (get_quiz)
    await QuizRepository.start_or_resume_quiz_attempt(str(quiz_id), s1_id)
    first_load = await QuizRepository.get_quiz(str(quiz_id), s1_id)
    second_load = await QuizRepository.get_quiz(str(quiz_id), s1_id)
    q_ids_1 = [q["id"] for q in first_load["questions"]]
    q_ids_2 = [q["id"] for q in second_load["questions"]]
    assert q_ids_1 == q_ids_2
    assert set(q_ids_1) == {"q_1", "q_2", "q_3", "q_4"}
    for q1, q2 in zip(first_load["questions"], second_load["questions"]):
        assert [o["id"] for o in q1["options"]] == [o["id"] for o in q2["options"]]

    # 8. Submit S1 answers by immutable question ID and option ID -> evaluates MCQ, MSQ, negative marks, and EEDI
    sub_s1 = await QuizRepository.submit_quiz_attempt(
        s1_ctx,
        str(quiz_id),
        answers={
            "q_1": "B",            # MCQ correct (+2)
            "q_2": ["B", "A"],     # MSQ correct regardless of option order (+4)
            "q_3": "B",            # MCQ wrong (-1)
            "q_4": ["A"],          # MSQ incomplete -> wrong (0 neg)
        },
    )
    # Earned = 2 + 4 - 1 = 5 out of 10 -> score 5/10, 50%
    assert sub_s1["score"] == 5
    assert sub_s1["correctCount"] == 2
    assert sub_s1["incorrectCount"] == 2

    async with get_pg_connection() as conn:
        eedi_rows = await conn.fetch(
            "SELECT eedi_term, earned_marks, possible_marks FROM quiz_eedi_results WHERE quiz_id = $1 AND student_user_id = $2",
            quiz_id, s1_id,
        )
        by_term = {r["eedi_term"]: (float(r["earned_marks"]), float(r["possible_marks"])) for r in eedi_rows}
        assert by_term["TEC01"] == (2.0, 4.0)
        assert by_term["TEC02"] == (4.0, 4.0)
        assert by_term["PRB02"] == (4.0, 4.0)

    # 9. Offline assessment pack preserves shuffled order and evaluates MSQ + MCQ on sync
    auth_pkg = await OfflineRepository.authorize_package(s2_ctx, "ASSESSMENT_PACK", str(quiz_id))
    bundle = await OfflineRepository.get_package_bundle(s2_ctx, auth_pkg["packageId"])
    assert len(bundle["bundle"]["questions"]) == 4
    sync_res = await OfflineRepository.process_sync_batch(
        s2_ctx,
        [
            {
                "operationId": str(uuid.uuid4()),
                "resourceType": "ASSESSMENT_SUBMISSION",
                "resourceId": str(quiz_id),
                "payload": {
                    "quizId": str(quiz_id),
                    "answers": [
                        {"questionId": "q_1", "optionId": "B"},
                        {"questionId": "q_2", "optionIds": ["A", "B"]},
                        {"questionId": "q_3", "optionId": "A"},
                        {"questionId": "q_4", "optionIds": ["A", "B"]},
                    ],
                    "durationSeconds": 90,
                },
            }
        ],
    )
    assert sync_res[0]["status"] == "PROCESSED"
    async with get_pg_connection() as conn:
        s2_score = await conn.fetchval(
            "SELECT score FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
            quiz_id, s2_id,
        )
        assert s2_score == 100
