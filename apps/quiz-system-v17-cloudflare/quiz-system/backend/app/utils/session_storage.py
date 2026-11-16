"""
Session-wise scratch space on disk: every quiz gets exactly one folder,

    temp/session_<quiz_id>/exports/...

and nothing else touches disk for that quiz. This is deliberately a single
directory per quiz (not separate top-level uploads/exports/logs folders)
so cleanup is one `rmtree` instead of hunting for files scattered across
multiple directories -- "Quiz delete hote hi session_8F3A12 folder delete
ho jayega" is the whole point: one folder in, one folder out.

Nothing in here is a database. It only ever holds admin-triggered report
exports (generated after the quiz ends) -- never live quiz state, which
stays in app/memory/store.py for as long as the quiz is running.
"""
import os
import shutil

from app.config.settings import settings


def session_dir(quiz_id: str) -> str:
    path = os.path.join(settings.temp_dir, f"session_{quiz_id}")
    os.makedirs(path, exist_ok=True)
    return path


def session_export_dir(quiz_id: str) -> str:
    path = os.path.join(session_dir(quiz_id), "exports")
    os.makedirs(path, exist_ok=True)
    return path


def delete_session_dir(quiz_id: str) -> bool:
    """Recursively removes temp/session_<quiz_id>/ (report ZIPs included).
    Safe to call even if the folder was never created."""
    path = os.path.join(settings.temp_dir, f"session_{quiz_id}")
    if os.path.isdir(path):
        shutil.rmtree(path, ignore_errors=True)
        return True
    return False
