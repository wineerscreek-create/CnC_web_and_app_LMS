"""
APScheduler jobs for the privacy-first lifecycle:

    Quiz Create -> Live -> Students Attempt -> Auto Evaluation
        -> Report Generated -> Admin Downloads
        -> Admin clicks "Delete Session" (explicit, immediate)
           OR report_retention_minutes elapses (automatic safety net)
        -> RAM wiped (questions, answers, sessions, tokens implicitly)
           AND temp/session_<id>/ (report files) deleted from disk
        -> nothing remains

Data is intentionally NOT wiped the instant a quiz ends -- see
admin_routes.end_quiz -- because the report generator
(export_service.generate_full_report_zip) needs the real question text and
per-student answers to build Question Analysis / Student Report. The
`_purge_expired_quizzes` job is the backstop for admins who forget to click
"Delete Session": it removes both the in-memory quiz record and its on-disk
report folder together, so neither lingers past the retention window even
if nobody downloaded anything.

Separately, `schedule_report_cleanup` handles the *shorter* per-report
window: once a specific report ZIP has actually been downloaded, it's
deleted `report_post_download_grace_minutes` later even if the quiz itself
is still live/within its longer retention window -- see admin_routes.py's
bundle_download, which calls this from a response `background` callback that
only fires after the download has fully streamed to the client.

Also runs a "reap disconnected/expired student sessions" tick so students
who vanish mid-quiz (closed tab, dead device) don't linger forever in the
live-monitoring view, plus the crash-recovery backup tick (see
scheduler/backup_scheduler.py) if enabled.
"""
import os
import time
import gc
import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler

from app.memory.store import store
from app.utils.helpers import write_log
from app.utils.session_storage import delete_session_dir
from app.config.settings import settings

logger = logging.getLogger("quiz_scheduler")

CHECK_INTERVAL_SECONDS = 300


def _purge_expired_quizzes():
    now = time.time()
    retention_seconds = settings.report_retention_minutes * 60
    for quiz in list(store.quizzes.values()):
        if quiz.status == "ended" and quiz.ended_at and (now - quiz.ended_at) > retention_seconds:
            # NOTE: quiz_id deliberately omitted from both log calls below --
            # store.delete_quiz() strips every log entry tagged with this
            # quiz_id as part of the wipe, which would delete the very
            # entries recording that the wipe happened. Untagged entries
            # (quiz_id=None) survive in the in-memory log; the full record
            # also always lands in logs/audit.log on disk regardless.
            write_log(actor="system", action="auto_purged",
                       detail=f"{quiz.name} ({quiz.code}) -- retention window "
                               f"({settings.report_retention_minutes}m) elapsed")
            from app.memory.report_jobs import report_jobs
            report_jobs.delete_for_quiz(quiz.id)
            store.delete_quiz(quiz.id)
            delete_session_dir(quiz.id)
            write_log(actor="system", action="cleanup_done",
                       detail=f"{quiz.name} ({quiz.code}) -- RAM + disk fully wiped (auto)")
    gc.collect()


def _mark_deadline_expired_sessions_submitted():
    """Server-timer enforcement net: if a student's browser died right at
    the deadline and never called /submit, force it here so results/exports
    are complete without waiting on the client."""
    from app.services.quiz_service import submit_quiz, get_remaining_seconds
    for quiz in list(store.quizzes.values()):
        if quiz.status != "live":
            continue
        for session in store.list_sessions_for_quiz(quiz.id):
            if session.status == "in_progress" and get_remaining_seconds(session) <= 0:
                submit_quiz(session, reason="auto_timeout")
                write_log(actor=session.roll_number, action="auto_submitted", quiz_id=quiz.id,
                           session_id=session.id, detail="server deadline reached")


def _cleanup_report_job(job_id: str):
    from app.memory.report_jobs import report_jobs
    job = report_jobs.get(job_id)
    if job and job.path and os.path.isfile(job.path):
        try:
            os.remove(job.path)
        except OSError:
            pass
    if job:
        write_log(actor="system", action="report_bundle_expired", quiz_id=job.quiz_id, detail=job_id)
    report_jobs.delete(job_id)


def schedule_report_cleanup(job_id: str, delay_seconds: int | None = None):
    """Called right after a report ZIP finishes streaming to the admin's
    browser (see admin_routes.bundle_download) -- deletes just that ZIP
    (and its job record) after the grace period, independent of the quiz's
    own longer retention window."""
    delay = delay_seconds if delay_seconds is not None else settings.report_post_download_grace_minutes * 60
    run_date = datetime.now() + timedelta(seconds=delay)
    _scheduler.add_job(_cleanup_report_job, "date", run_date=run_date, args=[job_id],
                        id=f"cleanup_report_{job_id}", misfire_grace_time=None)


_scheduler = BackgroundScheduler()


def start_scheduler():
    _scheduler.add_job(_purge_expired_quizzes, "interval", seconds=CHECK_INTERVAL_SECONDS, id="purge_expired_quizzes")
    _scheduler.add_job(_mark_deadline_expired_sessions_submitted, "interval", seconds=10, id="enforce_deadlines")

    from app.middleware.rate_limit_middleware import sweep_rate_limiter
    _scheduler.add_job(sweep_rate_limiter, "interval", seconds=CHECK_INTERVAL_SECONDS, id="sweep_rate_limiter")

    if settings.enable_crash_recovery_backup:
        from app.scheduler.backup_scheduler import backup_live_quizzes
        _scheduler.add_job(backup_live_quizzes, "interval", seconds=settings.backup_interval_seconds,
                            id="crash_recovery_backup")

    _scheduler.start()
    logger.info("Cleanup scheduler started")


def shutdown_scheduler():
    _scheduler.shutdown(wait=False)
