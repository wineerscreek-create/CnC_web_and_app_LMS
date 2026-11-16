"""
Optional crash-recovery backup: periodically snapshots every live/scheduled
quiz's RAM state (questions, students, answers, warnings) to an ENCRYPTED
file at `temp/session_<quiz_id>/backup.enc`, and reloads it on the next
process startup.

This is deliberately NOT a database:
  - it only ever holds a snapshot of what's already in RAM
  - it's encrypted with the same key as the live question bank
    (security/encryption.py -- see that module's docstring for why the key
    itself needs to persist across restarts for this to work at all)
  - it's deleted the moment the quiz's session is deleted (Delete Session /
    retention expiry), same as everything else under temp/session_<id>/
  - if disabled (ENABLE_CRASH_RECOVERY_BACKUP=false), the system behaves
    exactly like the original pure-RAM design: a crash loses in-progress
    quizzes. That's the explicit privacy/reliability trade-off from the
    original design discussion -- this module is Option B, opt-in.

Restore only rehydrates quizzes that were "live" or "scheduled" when the
backup was written -- an "ended" quiz's value is in its report, and that
lifecycle is already handled by the normal retention window, not this.
"""
import base64
import dataclasses
import json
import logging
import os
import time

from app.config.settings import settings
from app.memory.store import store, QuizRecord, StudentSession
from app.security.encryption import get_fernet
from app.utils.session_storage import session_dir

logger = logging.getLogger("quiz_scheduler")

BACKUP_FILENAME = "backup.enc"
_RESTORABLE_STATUSES = ("live", "scheduled")


def _serialize_quiz(quiz: QuizRecord) -> dict:
    d = dataclasses.asdict(quiz)
    # bytes aren't JSON-serializable -- the question bank is already
    # Fernet-encrypted bytes, so base64 it for transport inside the (also
    # encrypted) backup envelope.
    d["encrypted_questions"] = [base64.b64encode(b).decode() for b in quiz.encrypted_questions]
    return d


def _deserialize_quiz(d: dict) -> QuizRecord:
    d = dict(d)
    d["encrypted_questions"] = [base64.b64decode(s) for s in d["encrypted_questions"]]
    return QuizRecord(**d)


def backup_live_quizzes():
    if not settings.enable_crash_recovery_backup:
        return
    fernet = get_fernet()
    for quiz in list(store.quizzes.values()):
        if quiz.status not in _RESTORABLE_STATUSES:
            continue
        try:
            sessions = store.list_sessions_for_quiz(quiz.id)
            payload = {
                "quiz": _serialize_quiz(quiz),
                "sessions": [dataclasses.asdict(s) for s in sessions],
                "saved_at": time.time(),
            }
            raw = json.dumps(payload).encode()
            token = fernet.encrypt(raw)
            path = os.path.join(session_dir(quiz.id), BACKUP_FILENAME)
            # Write to a temp file then rename -- avoids leaving a half-written,
            # corrupt backup.enc if the process dies mid-write.
            tmp_path = path + ".tmp"
            with open(tmp_path, "wb") as f:
                f.write(token)
            os.replace(tmp_path, path)
        except Exception:
            logger.exception(f"Crash-recovery backup failed for quiz {quiz.id}")


def restore_from_backups() -> int:
    """Called once at startup. Returns the number of quizzes restored."""
    if not settings.enable_crash_recovery_backup:
        return 0
    if not os.path.isdir(settings.temp_dir):
        return 0

    fernet = get_fernet()
    restored = 0

    for entry in os.listdir(settings.temp_dir):
        if not entry.startswith("session_"):
            continue
        backup_path = os.path.join(settings.temp_dir, entry, BACKUP_FILENAME)
        if not os.path.isfile(backup_path):
            continue
        try:
            with open(backup_path, "rb") as f:
                token = f.read()
            raw = fernet.decrypt(token)
            payload = json.loads(raw)

            quiz = _deserialize_quiz(payload["quiz"])
            if quiz.status not in _RESTORABLE_STATUSES:
                continue
            if store.get_quiz(quiz.id):
                continue  # already present somehow -- don't clobber

            store.add_quiz(quiz)
            for sd in payload["sessions"]:
                session = StudentSession(**sd)
                store.add_session(session)
            restored += 1
        except Exception:
            # Corrupted backup, key mismatch (ENCRYPTION_KEY changed), or an
            # incompatible schema from an older version -- skip it rather
            # than fail startup over one bad file.
            logger.exception(f"Could not restore backup at {backup_path}, skipping")
            continue

    return restored
