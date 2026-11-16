"""
The single worker thread that drains app/memory/report_jobs.py's queue.

Exactly one report is ever being built at a time, process-wide, regardless
of how many admins click "Download Full Report" simultaneously. Everyone
else's job just sits at status "queued" (with a queue_position) until this
loop gets to them -- see admin_routes.bundle_status. This trades a bit of
wall-clock latency under concurrent load for predictable CPU usage, which
matters because report generation is CPU-bound (pandas/openpyxl/reportlab
all hold the GIL) and running several at once would slow all of them down
together rather than finish any of them sooner.

Started once at app startup (main.py's lifespan) and left running as a
daemon thread for the life of the process.
"""
import logging
import queue
import threading
import time

from app.memory.report_jobs import report_jobs
from app.services import export_service

logger = logging.getLogger("quiz_scheduler")

_worker_thread: threading.Thread | None = None
_stop_event = threading.Event()


def _process_one(job_id: str):
    job = report_jobs.get(job_id)
    if not job:
        return
    report_jobs.update(job_id, status="generating", progress=0)
    try:
        def on_progress(pct):
            report_jobs.update(job_id, progress=pct)
        path = export_service.generate_full_report_zip(job.quiz_id, on_progress=on_progress)
        report_jobs.update(job_id, status="ready", progress=100, path=path, ready_at=time.time())
    except Exception as e:  # noqa: BLE001 -- surface to the polling admin, keep the worker alive
        logger.exception(f"Report generation failed for job {job_id} (quiz {job.quiz_id})")
        report_jobs.update(job_id, status="error", error=str(e))


def _worker_loop():
    while not _stop_event.is_set():
        try:
            job_id = report_jobs.pending.get(timeout=1)
        except queue.Empty:
            continue
        try:
            _process_one(job_id)
        finally:
            report_jobs.pending.task_done()


def start_worker():
    global _worker_thread
    if _worker_thread and _worker_thread.is_alive():
        return
    _stop_event.clear()
    _worker_thread = threading.Thread(target=_worker_loop, name="report-export-worker", daemon=True)
    _worker_thread.start()
    logger.info("Report export worker started")


def stop_worker():
    _stop_event.set()
