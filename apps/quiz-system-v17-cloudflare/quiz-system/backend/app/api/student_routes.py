import time
from fastapi import APIRouter, Depends, HTTPException

from app.models.schemas import (
    StudentJoinRequest, StudentJoinResponse, SaveAnswerRequest,
    WarningEvent, SubmitQuizRequest,
)
from app.memory.store import store, StudentSession
from app.security.dependencies import get_current_student
from app.security.jwt_handler import new_session_id
from app.services import auth_service, quiz_service
from app.utils.helpers import write_log
from app.websocket.socket_manager import emit_student_joined, emit_warning, emit_submit, emit_answer_saved

router = APIRouter(prefix="/api/student", tags=["student"])


@router.post("/join", response_model=StudentJoinResponse)
async def join_quiz(body: StudentJoinRequest):
    quiz = store.get_quiz_by_code(body.quiz_code)
    if not quiz:
        raise HTTPException(status_code=404, detail="Invalid quiz code")
    if quiz.status == "ended":
        raise HTTPException(status_code=400, detail="This quiz has already ended")
    if quiz.status != "live":
        raise HTTPException(status_code=400, detail="This quiz is not live yet")

    try:
        session = quiz_service.start_session_for_student(quiz.id, body.name, body.roll_number, body.device_id)
    except quiz_service.QuizEngineError as e:
        # A second device trying to join under the same roll number while
        # the first is still active is exactly the "duplicate login" case --
        # log it distinctly so it shows up in the audit trail / analytics,
        # not just as a generic failure.
        if "another device" in str(e):
            write_log(actor=body.roll_number, action="duplicate_login", quiz_id=quiz.id,
                       detail=f"rejected device_id={body.device_id}")
        raise HTTPException(status_code=400, detail=str(e))

    token = auth_service.issue_student_token(session.id, quiz.code, body.roll_number, body.device_id)
    write_log(actor=body.roll_number, action="student_joined", quiz_id=quiz.id, session_id=session.id,
              detail=body.name)
    await emit_student_joined(quiz.id, session)

    return StudentJoinResponse(
        access_token=token, session_id=session.id, name=session.name, roll_number=session.roll_number,
        quiz_name=quiz.name,
        duration_seconds=quiz.settings.get("duration_minutes", 30) * 60,
        remaining_seconds=quiz_service.get_remaining_seconds(session),
        total_questions=len(session.question_order),
        camera_required=quiz.settings.get("camera_required", True),
        fullscreen_required=quiz.settings.get("fullscreen_required", True),
    )


@router.get("/resume")
def resume_check(session: StudentSession = Depends(get_current_student)):
    """Server-authoritative resume check. The frontend only ever holds a
    JWT in localStorage -- it does NOT decide on its own whether resume is
    valid or what state to resume into. This endpoint is the single source
    of truth: `get_current_student` already re-verifies the token is
    unexpired AND bound to the same device_id the session was created with
    (security/dependencies.py), so a student can't resume by copying a
    token to a second device, and a token surviving a localStorage clear on
    the original device is a non-issue because it wouldn't exist to copy.

    Returns everything JoinQuiz.jsx needs to decide what to show: quiz name,
    live remaining time (server clock, not the client's), submission status,
    and whether camera/fullscreen need to be re-established (both are lost
    on a real reconnect regardless of token validity, so resume always
    routes back through the Rules screen to re-acquire them)."""
    quiz = store.get_quiz(session.quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="This quiz no longer exists")

    write_log(actor=session.roll_number, action="reconnect", quiz_id=session.quiz_id, session_id=session.id,
              detail=f"status={session.status}")
    session.last_seen = time.time()

    return {
        "quiz_name": quiz.name,
        "quiz_code": quiz.code,
        "session_status": session.status,  # in_progress | submitted | auto_submitted
        "remaining_seconds": quiz_service.get_remaining_seconds(session),
        "duration_seconds": quiz.settings.get("duration_minutes", 30) * 60,
        "total_questions": len(session.question_order),
        "camera_required": quiz.settings.get("camera_required", True),
        "fullscreen_required": quiz.settings.get("fullscreen_required", True),
        "name": session.name,
        "roll_number": session.roll_number,
    }


@router.get("/palette")
def palette(session: StudentSession = Depends(get_current_student)):
    return {
        "palette": quiz_service.get_palette(session),
        "remaining_seconds": quiz_service.get_remaining_seconds(session),
        "current_index": session.current_question_index,
    }


@router.get("/question/{question_id}")
def get_question(question_id: str, session: StudentSession = Depends(get_current_student)):
    try:
        payload = quiz_service.get_question_payload(session, question_id)
    except quiz_service.QuizEngineError as e:
        raise HTTPException(status_code=400, detail=str(e))
    session.current_question_index = payload["index"]
    return payload


@router.post("/answer")
async def save_answer(body: SaveAnswerRequest, session: StudentSession = Depends(get_current_student)):
    try:
        result = quiz_service.save_answer(
            session, body.question_id, body.selected_options, body.numerical_answer,
            body.marked_for_review, body.time_spent_seconds,
        )
    except quiz_service.QuizEngineError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await emit_answer_saved(session.quiz_id, session, body.question_id)
    return result


@router.post("/warning")
async def report_warning(body: WarningEvent, session: StudentSession = Depends(get_current_student)):
    quiz = store.get_quiz(session.quiz_id)
    max_warnings = quiz.settings.get("max_warnings", 3) if quiz else 3
    result = quiz_service.record_warning(session, body.warning_type.value, body.detail, max_warnings)
    # Logged under the specific warning type (tab_switch, fullscreen_exit,
    # camera_off, ...) rather than a generic "warning" action, so Logs.txt
    # reads as a real audit trail -- exactly which rule was violated, not
    # just that some rule was.
    write_log(actor=session.roll_number, action=body.warning_type.value, quiz_id=session.quiz_id,
              session_id=session.id, detail=body.detail or "")
    await emit_warning(session.quiz_id, session, body.warning_type.value, result["warning_count"])

    if result["auto_submit"]:
        quiz_service.submit_quiz(session, reason="auto_warning_limit")
        write_log(actor=session.roll_number, action="auto_submitted", quiz_id=session.quiz_id,
                   session_id=session.id, detail="warning limit exceeded")
        await emit_submit(session.quiz_id, session)
    return result


@router.post("/camera-status")
async def camera_status(on: bool, session: StudentSession = Depends(get_current_student)):
    session.camera_on = on
    return {"ok": True}


@router.post("/fullscreen-status")
async def fullscreen_status(on: bool, session: StudentSession = Depends(get_current_student)):
    session.fullscreen = on
    return {"ok": True}


@router.post("/submit")
async def submit(body: SubmitQuizRequest, session: StudentSession = Depends(get_current_student)):
    result = quiz_service.submit_quiz(session, reason=body.reason)
    write_log(actor=session.roll_number, action="submit", quiz_id=session.quiz_id, session_id=session.id,
              detail=body.reason)
    await emit_submit(session.quiz_id, session)
    return result


@router.get("/result")
def my_result(session: StudentSession = Depends(get_current_student)):
    if not session.result:
        raise HTTPException(status_code=400, detail="Quiz not yet submitted")
    return session.result
