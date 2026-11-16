"""
The single source of truth for the whole system: an in-process, RAM-only
data store. No MySQL / MongoDB / PostgreSQL / Firebase per the spec.

Design notes:
- Everything lives in plain dicts keyed by id, guarded by a threading.RLock
  because FastAPI can run request handlers in a threadpool (sync endpoints)
  concurrently with the asyncio event loop (async endpoints / Socket.IO).
- The question bank for each quiz is stored encrypted (see
  security/encryption.py) and only decrypted one question at a time when a
  student actually requests it -- "server sends only Question 10, not
  Question 11".
- Nothing here is persisted. A process restart wipes all quiz state by
  design. The scheduler (app/scheduler/cleanup_scheduler.py) additionally
  force-wipes a quiz's data as soon as it ends, so data doesn't even survive
  to the next restart while the process keeps running.
- If you outgrow a single process, swap this module's internals for Redis
  (the spec explicitly allows Redis as an optional scale-out backend) while
  keeping the same public functions so callers don't change.
"""
from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

try:
    from app.security.encryption import encrypt_json, decrypt_json
except ImportError:
    encrypt_json = None
    decrypt_json = None

_lock = threading.RLock()


# --------------------------------------------------------------- records ---

@dataclass
class AdminRecord:
    id: str
    username: str
    password_hash: str
    role: str  # super_admin | faculty | observer
    created_at: float = field(default_factory=time.time)


@dataclass
class QuestionRecord:
    """Decrypted shape used only transiently; the store keeps these encrypted."""
    id: str
    question: str
    image: Optional[str]
    options: dict  # {"A": "...", "B": "...", "C": "...", "D": "..."}
    correct: list  # list of correct option keys, e.g. ["A"] or ["A","C"]
    marks: float
    negative: float
    question_type: str = "mcq_single"
    eedi_index: Optional[int] = None
    eedi_term: Optional[str] = None


@dataclass
class QuizRecord:
    id: str
    code: str
    name: str
    admin_id: str
    settings: dict
    status: str = "draft"  # draft|scheduled|live|ended|archived
    encrypted_questions: list = field(default_factory=list)  # list[bytes], order = canonical order
    question_ids: list = field(default_factory=list)  # parallel to encrypted_questions
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    ended_at: Optional[float] = None


@dataclass
class StudentSession:
    id: str  # session_id (JWT sub)
    quiz_id: str
    quiz_code: str
    name: str
    roll_number: str
    device_id: str
    question_order: list = field(default_factory=list)  # shuffled question_ids
    option_order: dict = field(default_factory=dict)  # question_id -> shuffled option key order
    answers: dict = field(default_factory=dict)  # question_id -> answer dict
    warnings: list = field(default_factory=list)  # list of dicts
    status: str = "in_progress"  # joined|in_progress|submitted|auto_submitted|disconnected
    camera_on: bool = False
    fullscreen: bool = False
    online: bool = True
    current_question_index: int = 0
    joined_at: float = field(default_factory=time.time)
    submitted_at: Optional[float] = None
    server_deadline: Optional[float] = None  # unix ts -- authoritative end time
    result: Optional[dict] = None
    socket_sid: Optional[str] = None
    # Updated on every REST call and WebSocket heartbeat (see
    # websocket/socket_manager.py's "heartbeat" event) -- lets the admin
    # Monitor screen and the disconnect-reaper distinguish "briefly slow
    # network" from "actually gone" instead of relying solely on the
    # socket's own connected/disconnected state, which lags a real network
    # drop by the ping-timeout window.
    last_seen: float = field(default_factory=time.time)


@dataclass
class LogEntry:
    id: str
    quiz_id: Optional[str]
    session_id: Optional[str]
    actor: str  # roll number, admin username, or "system"
    action: str
    detail: str
    timestamp: float = field(default_factory=time.time)


# ---------------------------------------------------------------- store ----

class InMemoryStore:
    def __init__(self):
        self.admins: dict[str, AdminRecord] = {}
        self.admins_by_username: dict[str, str] = {}
        self.quizzes: dict[str, QuizRecord] = {}
        self.quizzes_by_code: dict[str, str] = {}
        self.sessions: dict[str, StudentSession] = {}
        # quiz_id -> set of session_ids, for fast "who's in this quiz"
        self.quiz_sessions: dict[str, set] = {}
        self.logs: list[LogEntry] = []

    # ---- admins ----
    def add_admin(self, admin: AdminRecord):
        with _lock:
            self.admins[admin.id] = admin
            self.admins_by_username[admin.username] = admin.id

    def get_admin_by_username(self, username: str) -> Optional[AdminRecord]:
        with _lock:
            aid = self.admins_by_username.get(username)
            return self.admins.get(aid) if aid else None

    # ---- quizzes ----
    def add_quiz(self, quiz: QuizRecord):
        with _lock:
            self.quizzes[quiz.id] = quiz
            self.quizzes_by_code[quiz.code] = quiz.id
            self.quiz_sessions[quiz.id] = set()

    def get_quiz(self, quiz_id: str) -> Optional[QuizRecord]:
        with _lock:
            return self.quizzes.get(quiz_id)

    def get_quiz_by_code(self, code: str) -> Optional[QuizRecord]:
        with _lock:
            qid = self.quizzes_by_code.get(code)
            return self.quizzes.get(qid) if qid else None

    def list_quizzes(self, admin_id: Optional[str] = None) -> list:
        with _lock:
            vals = list(self.quizzes.values())
            if admin_id:
                vals = [q for q in vals if q.admin_id == admin_id]
            return sorted(vals, key=lambda q: q.created_at, reverse=True)

    def delete_quiz(self, quiz_id: str):
        """Full wipe: questions, answers, sessions, tokens (implicit -- JWTs
        just stop resolving to anything), logs referencing this quiz."""
        with _lock:
            quiz = self.quizzes.pop(quiz_id, None)
            if quiz:
                self.quizzes_by_code.pop(quiz.code, None)
            session_ids = self.quiz_sessions.pop(quiz_id, set())
            for sid in session_ids:
                self.sessions.pop(sid, None)
            self.logs = [l for l in self.logs if l.quiz_id != quiz_id]

    # ---- questions (encrypted at rest) ----
    def set_questions(self, quiz_id: str, questions: list[QuestionRecord]):
        with _lock:
            quiz = self.quizzes[quiz_id]
            quiz.encrypted_questions = [
                encrypt_json({
                    "id": q.id, "question": q.question, "image": q.image,
                    "options": q.options, "correct": q.correct,
                    "marks": q.marks, "negative": q.negative,
                    "question_type": q.question_type,
                    "eedi_index": q.eedi_index,
                    "eedi_term": q.eedi_term,
                }) for q in questions
            ]
            quiz.question_ids = [q.id for q in questions]

    def get_question(self, quiz_id: str, question_id: str) -> Optional[QuestionRecord]:
        """Decrypts exactly one question. This is the only place plaintext
        question content briefly exists outside the client response."""
        with _lock:
            quiz = self.quizzes.get(quiz_id)
            if not quiz or question_id not in quiz.question_ids:
                return None
            idx = quiz.question_ids.index(question_id)
            data = decrypt_json(quiz.encrypted_questions[idx])
            return QuestionRecord(**data)

    def get_all_questions_decrypted(self, quiz_id: str) -> list[QuestionRecord]:
        """Admin-only / grading-only. Never exposed wholesale to students."""
        with _lock:
            quiz = self.quizzes.get(quiz_id)
            if not quiz:
                return []
            return [QuestionRecord(**decrypt_json(b)) for b in quiz.encrypted_questions]

    # ---- sessions ----
    def add_session(self, session: StudentSession):
        with _lock:
            self.sessions[session.id] = session
            self.quiz_sessions.setdefault(session.quiz_id, set()).add(session.id)

    def get_session(self, session_id: str) -> Optional[StudentSession]:
        with _lock:
            return self.sessions.get(session_id)

    def find_active_session(self, quiz_id: str, roll_number: str) -> Optional[StudentSession]:
        with _lock:
            for sid in self.quiz_sessions.get(quiz_id, set()):
                s = self.sessions.get(sid)
                if s and s.roll_number == roll_number and s.status in ("in_progress", "joined"):
                    return s
        return None

    def list_sessions_for_quiz(self, quiz_id: str) -> list[StudentSession]:
        with _lock:
            return [self.sessions[sid] for sid in self.quiz_sessions.get(quiz_id, set()) if sid in self.sessions]

    # ---- logs ----
    def add_log(self, entry: LogEntry):
        with _lock:
            self.logs.append(entry)

    def logs_for_quiz(self, quiz_id: str) -> list[LogEntry]:
        with _lock:
            return sorted([l for l in self.logs if l.quiz_id == quiz_id], key=lambda l: l.timestamp)

    # ---- optional partial wipe: drops the raw question bank while keeping
    #      session results (marks/percentage/etc, already aggregated) around.
    #      NOT called automatically -- the normal lifecycle is the full
    #      delete_quiz() wipe via "Delete Session" or the retention-window
    #      scheduler, because the report generator needs the real question
    #      text and per-student answers until the report has been built.
    #      Kept here as a building block if you want a "hide questions but
    #      keep the leaderboard visible" mode later. ----
    def clear_quiz_runtime_data(self, quiz_id: str):
        """Drops the decrypted question bank only; session.result (already
        aggregated at submit time) and warnings/logs are untouched."""
        with _lock:
            quiz = self.quizzes.get(quiz_id)
            if quiz:
                quiz.encrypted_questions = []
                quiz.question_ids = []


store = InMemoryStore()
