"""
The quiz engine: joining, per-student question randomization, serving one
question at a time, autosaving answers, the server-authoritative timer, and
submission/scoring.

Server timer, not browser timer -- every "time remaining" figure returned to
the client is derived from `session.server_deadline`, a unix timestamp fixed
the moment the student starts. The client only displays a countdown; it can
never grant itself more time because /remaining and /submit both re-check
this server-side value.
"""
import random
import time
import uuid
from typing import Optional

from app.memory.store import store, StudentSession, QuestionRecord
from app.security.jwt_handler import new_session_id


class QuizEngineError(Exception):
    pass


def start_session_for_student(quiz_id: str, name: str, roll_number: str, device_id: str) -> StudentSession:
    quiz = store.get_quiz(quiz_id)
    if not quiz:
        raise QuizEngineError("Quiz not found")
    if quiz.status != "live":
        raise QuizEngineError("Quiz is not currently live")

    existing = store.find_active_session(quiz_id, roll_number)
    if existing:
        if existing.device_id != device_id:
            raise QuizEngineError("This roll number is already active on another device")
        return existing  # resume (e.g. after a refresh)

    max_students = quiz.settings.get("maximum_students")
    if max_students and len(store.list_sessions_for_quiz(quiz_id)) >= max_students:
        raise QuizEngineError("Maximum number of students reached for this quiz")

    question_ids = list(quiz.question_ids)
    if quiz.settings.get("random_questions", True):
        random.shuffle(question_ids)

    option_order = {}
    if quiz.settings.get("random_options", True):
        for qid in question_ids:
            q = store.get_question(quiz_id, qid)
            keys = list(q.options.keys())
            random.shuffle(keys)
            option_order[qid] = keys

    duration_seconds = quiz.settings.get("duration_minutes", 30) * 60
    session = StudentSession(
        id=new_session_id(),
        quiz_id=quiz_id,
        quiz_code=quiz.code,
        name=name,
        roll_number=roll_number,
        device_id=device_id,
        question_order=question_ids,
        option_order=option_order,
        status="in_progress",
        server_deadline=time.time() + duration_seconds,
    )
    store.add_session(session)
    return session


def get_remaining_seconds(session: StudentSession) -> float:
    if not session.server_deadline:
        return 0
    return max(0, session.server_deadline - time.time())


def get_question_payload(session: StudentSession, question_id: str) -> dict:
    """Returns ONLY the requested question -- never the whole bank. This is
    the "server sends only Question 10, not Question 11" rule from the spec."""
    if question_id not in session.question_order:
        raise QuizEngineError("Question does not belong to this session")
    if get_remaining_seconds(session) <= 0:
        raise QuizEngineError("Time is up")

    q = store.get_question(session.quiz_id, question_id)
    if not q:
        raise QuizEngineError("Question not found")

    order = session.option_order.get(question_id, list(q.options.keys()))
    options_out = [{"key": k, "text": q.options[k]} for k in order if k in q.options]

    existing_answer = session.answers.get(question_id, {})

    return {
        "question_id": q.id,
        "question": q.question,
        "image": q.image,
        "options": options_out,
        "marks": q.marks,
        "negative": q.negative,
        "question_type": q.question_type,
        "index": session.question_order.index(question_id),
        "total": len(session.question_order),
        "saved_answer": existing_answer.get("selected_options", []),
        "marked_for_review": existing_answer.get("marked_for_review", False),
        "remaining_seconds": get_remaining_seconds(session),
    }


def get_palette(session: StudentSession) -> list[dict]:
    """Answered / not-answered / review / not-visited status for every
    question, used to render the question palette."""
    palette = []
    for i, qid in enumerate(session.question_order):
        ans = session.answers.get(qid)
        if ans is None:
            status = "not_visited"
        elif ans.get("marked_for_review"):
            status = "review"
        elif ans.get("selected_options") or ans.get("numerical_answer"):
            status = "answered"
        else:
            status = "not_answered"
        palette.append({"index": i, "question_id": qid, "status": status})
    return palette


def save_answer(session: StudentSession, question_id: str, selected_options: list,
                 numerical_answer: Optional[str], marked_for_review: bool,
                 time_spent_seconds: float):
    if get_remaining_seconds(session) <= 0:
        raise QuizEngineError("Time is up, cannot save answer")
    if question_id not in session.question_order:
        raise QuizEngineError("Question does not belong to this session")

    session.answers[question_id] = {
        "selected_options": selected_options,
        "numerical_answer": numerical_answer,
        "marked_for_review": marked_for_review,
        "time_spent_seconds": time_spent_seconds,
        "saved_at": time.time(),
    }
    return {"saved": True, "question_id": question_id}


def record_warning(session: StudentSession, warning_type: str, detail: Optional[str], max_warnings: int) -> dict:
    entry = {"type": warning_type, "detail": detail, "at": time.time()}
    session.warnings.append(entry)
    count = len(session.warnings)
    should_auto_submit = count >= max_warnings
    return {"warning_count": count, "max_warnings": max_warnings, "auto_submit": should_auto_submit}


def _score_answer(question: QuestionRecord, answer: Optional[dict]) -> tuple[float, str]:
    """Returns (marks_awarded, outcome) where outcome in
    {correct, wrong, skipped}."""
    if not answer or not (answer.get("selected_options") or answer.get("numerical_answer")):
        return 0.0, "skipped"

    if question.question_type == "numerical":
        given = (answer.get("numerical_answer") or "").strip()
        correct_val = question.correct[0] if question.correct else None
        if given and correct_val is not None and given == str(correct_val).strip():
            return question.marks, "correct"
        return question.negative, "wrong"

    given_set = set(answer.get("selected_options") or [])
    correct_set = set(question.correct)
    if given_set == correct_set:
        return question.marks, "correct"
    return question.negative, "wrong"


def submit_quiz(session: StudentSession, reason: str = "manual") -> dict:
    if session.status in ("submitted", "auto_submitted"):
        return session.result

    total_marks = 0.0
    max_marks = 0.0
    correct_count = 0
    wrong_count = 0
    skipped_count = 0
    per_question = []

    for qid in session.question_order:
        q = store.get_question(session.quiz_id, qid)
        if not q:
            continue
        max_marks += q.marks
        awarded, outcome = _score_answer(q, session.answers.get(qid))
        total_marks += awarded
        if outcome == "correct":
            correct_count += 1
        elif outcome == "wrong":
            wrong_count += 1
        else:
            skipped_count += 1
        per_question.append({"question_id": qid, "outcome": outcome, "marks_awarded": awarded, "max_marks": q.marks})

    total_marks = max(0.0, round(total_marks, 2)) if total_marks > 0 else round(total_marks, 2)
    percentage = round((total_marks / max_marks) * 100, 2) if max_marks > 0 else 0.0

    quiz = store.get_quiz(session.quiz_id)
    passing_marks = quiz.settings.get("passing_marks", 0) if quiz else 0

    result = {
        "total_marks": total_marks,
        "max_marks": max_marks,
        "percentage": percentage,
        "correct": correct_count,
        "wrong": wrong_count,
        "skipped": skipped_count,
        "passed": total_marks >= passing_marks,
        "warnings": len(session.warnings),
        "submitted_reason": reason,
        "per_question": per_question,
    }

    session.result = result
    session.status = "auto_submitted" if reason != "manual" else "submitted"
    session.submitted_at = time.time()
    return result
