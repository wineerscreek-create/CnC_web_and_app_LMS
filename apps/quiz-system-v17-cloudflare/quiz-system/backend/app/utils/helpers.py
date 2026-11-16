"""
Small shared helpers: structured logging into the in-memory log list (which
also gets flushed to a rotating file under logs/ for audit purposes -- the
spec's "Every action logged" requirement), plus a couple of formatting utils.
"""
import logging
import os
import uuid
from logging.handlers import RotatingFileHandler
from typing import Optional

from app.memory.store import store, LogEntry
from app.config.settings import settings

os.makedirs(settings.log_dir, exist_ok=True)

_file_logger = logging.getLogger("quiz_audit")
_file_logger.setLevel(logging.INFO)
if not _file_logger.handlers:
    handler = RotatingFileHandler(
        os.path.join(settings.log_dir, "audit.log"), maxBytes=5_000_000, backupCount=5
    )
    handler.setFormatter(logging.Formatter("%(asctime)s | %(message)s"))
    _file_logger.addHandler(handler)


def write_log(actor: str, action: str, detail: str = "", quiz_id: Optional[str] = None,
              session_id: Optional[str] = None):
    entry = LogEntry(
        id=str(uuid.uuid4()), quiz_id=quiz_id, session_id=session_id,
        actor=actor, action=action, detail=detail,
    )
    store.add_log(entry)
    _file_logger.info(f"actor={actor} action={action} quiz_id={quiz_id} session_id={session_id} detail={detail}")
    return entry


def gen_quiz_code(length: int = 6) -> str:
    import random
    import string
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))
