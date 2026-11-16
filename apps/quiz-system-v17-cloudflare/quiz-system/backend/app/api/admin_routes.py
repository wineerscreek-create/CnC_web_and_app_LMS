import os
import time
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.config.settings import settings
from app.models.schemas import QuizCreateRequest, QuizUpdateRequest, CSVValidationResult
from app.memory.store import store, QuizRecord, AdminRecord
from app.memory.report_jobs import report_jobs
from app.security.dependencies import get_current_admin, require_role
from app.services.csv_service import parse_and_validate_csv
from app.services import export_service, analytics_service
from app.utils.helpers import write_log, gen_quiz_code
from app.utils.session_storage import delete_session_dir
from app.websocket.socket_manager import emit_quiz_ended
from app.scheduler.cleanup_scheduler import schedule_report_cleanup

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ------------------------------------------------------------- dashboard ---

@router.get("/dashboard")
def dashboard(admin: AdminRecord = Depends(get_current_admin)):
    quizzes = store.list_quizzes(admin.id if admin.role != "super_admin" else None)
    today_start = time.time() - (time.time() % 86400)
    todays = [q for q in quizzes if q.created_at >= today_start]

    online = submitted = warnings = 0
    for q in quizzes:
        for s in store.list_sessions_for_quiz(q.id):
            if s.online and s.status == "in_progress":
                online += 1
            if s.status in ("submitted", "auto_submitted"):
                submitted += 1
            warnings += len(s.warnings)

    return {
        "todays_quiz_count": len(todays),
        "total_quizzes": len(quizzes),
        "students_online": online,
        "students_submitted": submitted,
        "total_warnings": warnings,
        "quizzes": [_quiz_summary(q) for q in quizzes],
    }


def _quiz_summary(q: QuizRecord) -> dict:
    sessions = store.list_sessions_for_quiz(q.id)
    return {
        "id": q.id, "code": q.code, "name": q.name, "status": q.status,
        "joined": len(sessions),
        "submitted": len([s for s in sessions if s.status in ("submitted", "auto_submitted")]),
        "settings": q.settings,
        "created_at": q.created_at,
    }


# --------------------------------------------------------- quiz lifecycle --

@router.post("/quizzes")
def create_quiz(body: QuizCreateRequest, admin: AdminRecord = Depends(require_role("super_admin", "faculty"))):
    code = body.settings.quiz_code or gen_quiz_code()
    if store.get_quiz_by_code(code):
        raise HTTPException(status_code=400, detail="Quiz code already in use")
    quiz = QuizRecord(
        id=str(uuid.uuid4()), code=code, name=body.settings.quiz_name,
        admin_id=admin.id, settings=body.settings.model_dump(mode="json"),
        status="draft",
    )
    store.add_quiz(quiz)
    write_log(actor=admin.username, action="quiz_created", detail=quiz.name, quiz_id=quiz.id)
    return _quiz_summary(quiz)


@router.get("/quizzes")
def list_quizzes(admin: AdminRecord = Depends(get_current_admin)):
    quizzes = store.list_quizzes(admin.id if admin.role != "super_admin" else None)
    return [_quiz_summary(q) for q in quizzes]


@router.get("/quizzes/{quiz_id}")
def get_quiz(quiz_id: str, admin: AdminRecord = Depends(get_current_admin)):
    quiz = _require_quiz(quiz_id)
    return _quiz_summary(quiz)


@router.put("/quizzes/{quiz_id}")
def update_quiz(quiz_id: str, body: QuizUpdateRequest, admin: AdminRecord = Depends(require_role("super_admin", "faculty"))):
    quiz = _require_quiz(quiz_id)
    if quiz.status == "live":
        raise HTTPException(status_code=400, detail="Cannot edit a live quiz")
    quiz.settings = body.settings.model_dump(mode="json")
    quiz.name = body.settings.quiz_name
    write_log(actor=admin.username, action="quiz_updated", quiz_id=quiz.id)
    return _quiz_summary(quiz)


@router.delete("/quizzes/{quiz_id}")
def delete_quiz(quiz_id: str, admin: AdminRecord = Depends(require_role("super_admin", "faculty"))):
    quiz = _require_quiz(quiz_id)
    store.delete_quiz(quiz_id)
    write_log(actor=admin.username, action="quiz_deleted", detail=quiz.name)
    return {"deleted": True}


@router.post("/quizzes/{quiz_id}/clone")
def clone_quiz(quiz_id: str, admin: AdminRecord = Depends(require_role("super_admin", "faculty"))):
    quiz = _require_quiz(quiz_id)
    new_code = gen_quiz_code()
    while store.get_quiz_by_code(new_code):
        new_code = gen_quiz_code()
    clone = QuizRecord(
        id=str(uuid.uuid4()), code=new_code, name=f"{quiz.name} (Copy)",
        admin_id=admin.id, settings={**quiz.settings, "quiz_code": new_code}, status="draft",
        encrypted_questions=list(quiz.encrypted_questions), question_ids=list(quiz.question_ids),
    )
    store.add_quiz(clone)
    write_log(actor=admin.username, action="quiz_cloned", quiz_id=clone.id, detail=f"from {quiz_id}")
    return _quiz_summary(clone)


@router.post("/quizzes/{quiz_id}/schedule")
def schedule_quiz(quiz_id: str, admin: AdminRecord = Depends(require_role("super_admin", "faculty"))):
    quiz = _require_quiz(quiz_id)
    if not quiz.question_ids:
        raise HTTPException(status_code=400, detail="Upload questions before scheduling")
    quiz.status = "scheduled"
    write_log(actor=admin.username, action="quiz_scheduled", quiz_id=quiz.id)
    return _quiz_summary(quiz)


@router.post("/quizzes/{quiz_id}/start")
def start_quiz(quiz_id: str, admin: AdminRecord = Depends(require_role("super_admin", "faculty"))):
    quiz = _require_quiz(quiz_id)
    if not quiz.question_ids:
        raise HTTPException(status_code=400, detail="No questions uploaded")
    quiz.status = "live"
    quiz.started_at = time.time()
    write_log(actor=admin.username, action="quiz_started", quiz_id=quiz.id)
    return _quiz_summary(quiz)


@router.post("/quizzes/{quiz_id}/end")
async def end_quiz(quiz_id: str, admin: AdminRecord = Depends(require_role("super_admin", "faculty"))):
    from app.services.quiz_service import submit_quiz
    quiz = _require_quiz(quiz_id)
    quiz.status = "ended"
    quiz.ended_at = time.time()
    # force-submit anyone still in progress so results are complete
    for s in store.list_sessions_for_quiz(quiz_id):
        if s.status == "in_progress":
            submit_quiz(s, reason="forced_by_admin")
    write_log(actor=admin.username, action="quiz_ended", quiz_id=quiz.id)
    await emit_quiz_ended(quiz_id)
    # NOTE: we deliberately do NOT wipe the question bank / session data here.
    # The report generator (export_service.generate_full_report_zip) needs
    # the real question text and per-student answers to build Question
    # Analysis / Student Report. Full lifecycle is:
    #   quiz ends -> data stays in RAM -> admin generates + downloads report
    #   -> admin clicks "Delete Session" (or report_retention_minutes elapses
    #   automatically) -> store.delete_quiz() wipes everything, including the
    #   temp/session_<id>/ report files on disk.
    # See delete_session_data() below and scheduler/cleanup_scheduler.py.
    return _quiz_summary(quiz)


def _require_quiz(quiz_id: str) -> QuizRecord:
    quiz = store.get_quiz(quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz


# ------------------------------------------------------------- CSV upload --

@router.post("/quizzes/{quiz_id}/upload-csv", response_model=CSVValidationResult)
async def upload_csv(quiz_id: str, file: UploadFile = File(...),
                      admin: AdminRecord = Depends(require_role("super_admin", "faculty"))):
    quiz = _require_quiz(quiz_id)
    if quiz.status == "live":
        raise HTTPException(status_code=400, detail="Cannot change questions on a live quiz")
    content = await file.read()
    result, questions = parse_and_validate_csv(content)
    if result.accepted:
        store.set_questions(quiz_id, questions)
        write_log(actor=admin.username, action="csv_uploaded", quiz_id=quiz.id,
                   detail=f"{result.valid_rows} questions accepted")
    else:
        write_log(actor=admin.username, action="csv_rejected", quiz_id=quiz.id,
                   detail=f"{result.invalid_rows} invalid rows")
    return result


@router.get("/quizzes/{quiz_id}/preview")
def preview_quiz(quiz_id: str, admin: AdminRecord = Depends(get_current_admin)):
    quiz = _require_quiz(quiz_id)
    questions = store.get_all_questions_decrypted(quiz_id)
    return {
        "quiz": _quiz_summary(quiz),
        "questions": [
            {"id": q.id, "question": q.question, "image": q.image, "options": q.options,
             "correct": q.correct, "marks": q.marks, "negative": q.negative}
            for q in questions
        ],
    }


# ------------------------------------------------------------ monitoring ---

@router.get("/quizzes/{quiz_id}/monitor")
def monitor_quiz(quiz_id: str, admin: AdminRecord = Depends(get_current_admin)):
    quiz = _require_quiz(quiz_id)
    sessions = store.list_sessions_for_quiz(quiz_id)
    from app.services.quiz_service import get_remaining_seconds
    now = time.time()
    return {
        "quiz": _quiz_summary(quiz),
        "students": [
            {
                "session_id": s.id, "name": s.name, "roll_number": s.roll_number,
                "current_question": s.current_question_index, "total_questions": len(s.question_order),
                "remaining_seconds": get_remaining_seconds(s), "warnings": len(s.warnings),
                "camera_on": s.camera_on, "fullscreen": s.fullscreen, "online": s.online,
                # "online" reflects the socket's own connect/disconnect state;
                # "stale" catches the gap where the socket thinks it's still
                # connected but we haven't heard an application heartbeat in
                # a while (backgrounded tab, flaky network) -- see
                # websocket/socket_manager.py's heartbeat handler.
                "last_seen_seconds_ago": round(now - s.last_seen, 1),
                "stale": s.status == "in_progress" and (now - s.last_seen) > settings.stale_after_seconds,
                "status": s.status,
            }
            for s in sessions
        ],
    }


@router.get("/quizzes/{quiz_id}/logs")
def quiz_logs(quiz_id: str, admin: AdminRecord = Depends(get_current_admin)):
    return [{"actor": l.actor, "action": l.action, "detail": l.detail, "timestamp": l.timestamp}
            for l in store.logs_for_quiz(quiz_id)]


# ------------------------------------------------------- results / export --

@router.get("/quizzes/{quiz_id}/results")
def quiz_results(quiz_id: str, admin: AdminRecord = Depends(get_current_admin)):
    return analytics_service.build_results(quiz_id)


@router.get("/quizzes/{quiz_id}/analytics")
def quiz_analytics(quiz_id: str, admin: AdminRecord = Depends(get_current_admin)):
    return analytics_service.build_analytics(quiz_id)


@router.get("/quizzes/{quiz_id}/proctoring")
def quiz_proctoring(quiz_id: str, admin: AdminRecord = Depends(get_current_admin)):
    from app.services import proctoring_service
    sessions = store.list_sessions_for_quiz(quiz_id)
    return {"sessions": proctoring_service.score_all_sessions(sessions)}


@router.get("/quizzes/{quiz_id}/export/{fmt}")
def export_results(quiz_id: str, fmt: str, admin: AdminRecord = Depends(get_current_admin)):
    _require_quiz(quiz_id)
    if fmt not in ("excel", "csv", "pdf"):
        raise HTTPException(status_code=400, detail="Format must be excel, csv, or pdf")
    path = export_service.export_results(quiz_id, fmt)
    write_log(actor=admin.username, action="results_exported", quiz_id=quiz_id, detail=fmt)
    media_types = {
        "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "csv": "text/csv",
        "pdf": "application/pdf",
    }
    return FileResponse(path, media_type=media_types[fmt], filename=path.split("/")[-1])


# ---- full report bundle: queued through a single worker with progress
# polling. Building this ZIP for a large quiz (hundreds of students x dozens
# of questions) can take several seconds of CPU-bound work
# (pandas/openpyxl/reportlab). Rather than spawning one thread per request
# -- which would have concurrent exports from multiple admins fight each
# other for CPU -- every export goes through one FIFO queue processed by a
# single worker thread (services/report_worker.py, started once at app
# startup). /start just enqueues and returns instantly; poll /status for
# either a queue position or generation progress, then /download once ready.

@router.post("/quizzes/{quiz_id}/export/bundle/start")
def start_bundle_export(quiz_id: str, admin: AdminRecord = Depends(get_current_admin)):
    """Enqueues report generation and returns a job_id immediately -- the
    headline feature: Result.xlsx, Result.csv, QuestionAnalysis.xlsx,
    StudentReport.xlsx, Leaderboard.pdf, Summary.pdf, Logs.txt, zipped
    together. Poll /export/bundle/status/{job_id} for progress, then GET
    /export/bundle/download/{job_id} once status is "ready"."""
    _require_quiz(quiz_id)
    job = report_jobs.create(quiz_id)
    write_log(actor=admin.username, action="export_started", quiz_id=quiz_id, detail=job.id)
    return {"job_id": job.id, "status": job.status, "progress": job.progress}


@router.get("/quizzes/{quiz_id}/export/bundle/status/{job_id}")
def bundle_status(quiz_id: str, job_id: str, admin: AdminRecord = Depends(get_current_admin)):
    job = report_jobs.get(job_id)
    if not job or job.quiz_id != quiz_id:
        raise HTTPException(status_code=404, detail="Report job not found")
    response = {"status": job.status, "progress": job.progress, "error": job.error}
    if job.status == "queued":
        response["queue_position"] = report_jobs.queue_position(job_id)
    if job.status == "ready" and job.ready_at and not job.error:
        write_log(actor=admin.username, action="export_finished", quiz_id=quiz_id, detail=job_id)
    return response


@router.get("/quizzes/{quiz_id}/export/bundle/download/{job_id}")
def bundle_download(quiz_id: str, job_id: str, admin: AdminRecord = Depends(get_current_admin)):
    job = report_jobs.get(job_id)
    if not job or job.quiz_id != quiz_id:
        raise HTTPException(status_code=404, detail="Report job not found")
    if job.status == "error":
        raise HTTPException(status_code=500, detail=f"Report generation failed: {job.error}")
    if job.status != "ready" or not job.path or not os.path.isfile(job.path):
        raise HTTPException(status_code=409, detail=f"Report is not ready yet (status: {job.status})")

    write_log(actor=admin.username, action="report_bundle_downloaded", quiz_id=quiz_id, detail=job_id)

    def _after_fully_sent():
        # Starlette runs this only after the response has finished
        # streaming to the client -- i.e. genuinely "download complete",
        # not just "download started". That's when the grace-period clock
        # starts, per Generate -> READY -> Download complete -> Delete
        # after N minutes.
        report_jobs.mark_downloaded(job_id)
        schedule_report_cleanup(job_id)

    return FileResponse(job.path, media_type="application/zip", filename=job.path.split("/")[-1],
                         background=BackgroundTask(_after_fully_sent))


@router.delete("/quizzes/{quiz_id}/session")
def delete_session_data(quiz_id: str, admin: AdminRecord = Depends(require_role("super_admin", "faculty"))):
    """'Delete Session' step of the admin workflow -- wipes all runtime data
    (questions, answers, sessions) for a quiz that has ended, AND deletes its
    temp/session_<id>/ folder on disk (report ZIPs included). Nothing about
    this quiz survives after this call."""
    quiz = _require_quiz(quiz_id)
    if quiz.status != "ended":
        raise HTTPException(status_code=400, detail="Only ended quizzes can be purged")
    report_jobs.delete_for_quiz(quiz_id)
    store.delete_quiz(quiz_id)
    delete_session_dir(quiz_id)
    write_log(actor=admin.username, action="session_deleted", detail=quiz.name)
    write_log(actor="system", action="cleanup_done", detail=f"{quiz.name} ({quiz.code}) -- RAM + disk fully wiped")
    import gc
    gc.collect()
    return {"deleted": True}


# ----------------------------------------------------------- operations ---

@router.get("/system/memory-stats")
def memory_stats(admin: AdminRecord = Depends(require_role("super_admin"))):
    """Diagnostic snapshot for catching leaks before they page you at 2am --
    every dict/list in the app that could theoretically grow unbounded, plus
    process RSS. Expected pattern in a healthy deployment: these numbers
    track "quizzes + students currently live," not "quizzes + students ever
    created" -- run a quiz through its full create -> live -> end -> delete
    lifecycle and confirm sessions/quizzes/logs drop back down rather than
    accumulating. See app/utils/memory_stats.py."""
    from app.utils.memory_stats import collect_stats
    return collect_stats()


@router.post("/system/reencrypt")
def reencrypt(admin: AdminRecord = Depends(require_role("super_admin"))):
    """Operational endpoint for encryption key rotation: after adding the
    old ENCRYPTION_KEY to ENCRYPTION_KEY_PREVIOUS and restarting with a new
    ENCRYPTION_KEY, call this once to re-encrypt every currently-loaded
    quiz's question bank under the new key -- after which the old key can be
    removed from ENCRYPTION_KEY_PREVIOUS entirely. See
    security/encryption.py's module docstring for the full procedure."""
    from app.security.encryption import reencrypt_all_quizzes
    touched = reencrypt_all_quizzes()
    write_log(actor=admin.username, action="encryption_key_rotated", detail=f"{touched} quiz(zes) re-encrypted")
    return {"quizzes_reencrypted": touched}


# --------------------------------------------------------------- roles -----

@router.post("/admins")
def create_sub_admin(username: str, password: str, role: str = "faculty",
                      admin: AdminRecord = Depends(require_role("super_admin"))):
    from app.services import auth_service
    try:
        new_admin = auth_service.create_admin(username, password, role)
    except auth_service.AuthError as e:
        raise HTTPException(status_code=400, detail=str(e))
    write_log(actor=admin.username, action="admin_created", detail=f"{username} ({role})")
    return {"id": new_admin.id, "username": new_admin.username, "role": new_admin.role}
