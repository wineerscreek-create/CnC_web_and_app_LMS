"""
Introspection helpers for catching memory leaks early rather than finding
out from an OOM kill during a 500-student exam.

FastAPI/long-running-process memory leaks are almost always "a dict/list
that only ever grows" -- this module reports the size of every such
structure in the app so you can watch them over time (e.g. hit
GET /api/admin/system/memory-stats before and after a quiz's full
create->live->end->delete-session lifecycle and confirm the counts return
to baseline, not just "seem fine").
"""
import gc
import os
import resource

from app.memory.store import store
from app.memory.report_jobs import report_jobs
from app.middleware.logging_middleware import recent_requests
from app.middleware.rate_limit_middleware import rate_limiter_active_keys


def process_rss_mb() -> float:
    """Resident set size in MB. `ru_maxrss` is KB on Linux, bytes on macOS --
    normalize for Linux since that's the deployment target here."""
    kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return round(kb / 1024, 1)


def collect_stats() -> dict:
    # Every store.* accessor below already takes the module-level lock
    # internally (see memory/store.py), so no extra locking needed here --
    # this is a read-only snapshot, and a slightly-stale count under
    # concurrent load is fine for a diagnostics endpoint.
    return {
        "process_rss_mb": process_rss_mb(),
        "gc_objects": len(gc.get_objects()),
        "store": {
            "admins": len(store.admins),
            "quizzes": len(store.quizzes),
            "sessions": len(store.sessions),
            "quiz_sessions_index": len(store.quiz_sessions),
            "logs": len(store.logs),
        },
        "report_jobs": len(report_jobs.all_jobs()),
        "rate_limiter_tracked_clients": rate_limiter_active_keys(),
        "recent_requests_buffer": len(recent_requests),  # always <= 500 (deque maxlen)
        "temp_dir_session_folders": _count_session_folders(),
    }


def _count_session_folders() -> int:
    from app.config.settings import settings
    if not os.path.isdir(settings.temp_dir):
        return 0
    return len([e for e in os.listdir(settings.temp_dir) if e.startswith("session_")])
