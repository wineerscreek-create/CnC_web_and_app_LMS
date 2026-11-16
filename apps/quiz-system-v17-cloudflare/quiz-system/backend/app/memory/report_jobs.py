"""
In-memory job queue for report generation.

Building Quiz_Report.zip for a large quiz (hundreds of students x dozens of
questions -> tens of thousands of StudentReport rows, several xlsx/pdf
buffers) is CPU-bound work (pandas/openpyxl/reportlab all hold the GIL for
most of it). If several admins export at once, running each on its own
thread would have them all contend for CPU simultaneously and slow every
one of them down together -- worse than doing them one at a time. So this
is a real FIFO queue with exactly ONE worker thread
(services/report_worker.py) processing jobs sequentially: request N+1 just
waits its turn instead of competing with request N for the CPU.

This is a job queue, not a database: jobs are ephemeral, live only as long
as the process does, and get cleaned up alongside the rest of a quiz's data
(see delete_for_quiz, called from admin_routes + the cleanup scheduler).
"""
import queue
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ReportJob:
    id: str
    quiz_id: str
    status: str = "queued"  # queued | generating | ready | error
    progress: int = 0
    path: Optional[str] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    ready_at: Optional[float] = None
    downloaded_at: Optional[float] = None


class ReportJobStore:
    def __init__(self):
        self._jobs: dict[str, ReportJob] = {}
        self._lock = threading.RLock()
        self.pending: "queue.Queue[str]" = queue.Queue()

    def create(self, quiz_id: str) -> ReportJob:
        job = ReportJob(id=str(uuid.uuid4()), quiz_id=quiz_id)
        with self._lock:
            self._jobs[job.id] = job
        self.pending.put(job.id)
        return job

    def get(self, job_id: str) -> Optional[ReportJob]:
        with self._lock:
            return self._jobs.get(job_id)

    def update(self, job_id: str, **fields):
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            for k, v in fields.items():
                setattr(job, k, v)

    def mark_downloaded(self, job_id: str):
        self.update(job_id, downloaded_at=time.time())

    def delete(self, job_id: str):
        with self._lock:
            self._jobs.pop(job_id, None)

    def jobs_for_quiz(self, quiz_id: str) -> list[ReportJob]:
        with self._lock:
            return [j for j in self._jobs.values() if j.quiz_id == quiz_id]

    def delete_for_quiz(self, quiz_id: str):
        with self._lock:
            for jid in [j.id for j in self._jobs.values() if j.quiz_id == quiz_id]:
                self._jobs.pop(jid, None)

    def all_jobs(self) -> list[ReportJob]:
        with self._lock:
            return list(self._jobs.values())

    def queue_position(self, job_id: str) -> int:
        """1-based position among still-queued jobs, ordered by creation
        time -- an approximation (the stdlib Queue itself isn't peekable)
        but accurate as long as jobs are only ever consumed in order, which
        report_worker.py guarantees. Returns 0 if not queued (already being
        processed, done, or unknown)."""
        with self._lock:
            job = self._jobs.get(job_id)
            if not job or job.status != "queued":
                return 0
            queued = sorted(
                (j for j in self._jobs.values() if j.status == "queued"),
                key=lambda j: j.created_at,
            )
            for i, j in enumerate(queued, start=1):
                if j.id == job_id:
                    return i
            return 0


report_jobs = ReportJobStore()
