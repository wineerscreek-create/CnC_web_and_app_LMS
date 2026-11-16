"""
Socket.IO layer for live monitoring: admin dashboards subscribe to a quiz
"room" and receive student_joined / student_status / answer_saved / warning /
submit / quiz_end events in real time. Students' browsers also connect (one
socket each) so we can push camera-frame relays and forced-submit/quiz_end
notifications to them.

Rooms used:
  admin:{quiz_id}    -- all admin dashboards currently monitoring this quiz
  student:{quiz_id}  -- all student clients currently taking this quiz

Two layers of "is this student still here":
  1. Transport heartbeat (engine.io ping/pong, ws_ping_interval /
     ws_ping_timeout in settings) -- socket.io's own liveness check; a
     missed pong fires our `disconnect` handler automatically. socket.io-client
     on the frontend reconnects on its own by default, and our `connect`
     handler re-associates the new socket with the existing session (looked
     up by the JWT's session_id, same as any REST call) -- there's no
     separate "resume the socket" step needed.
  2. Application heartbeat (`heartbeat` event, emitted by the student client
     every heartbeat_interval_seconds) -- updates StudentSession.last_seen
     so the admin Monitor screen can flag a session "stale" well before the
     longer transport timeout would notice a real problem (e.g. the tab is
     backgrounded and throttled but the socket is technically still open).
"""
import time
import socketio

from app.memory.store import store, StudentSession
from app.security.jwt_handler import decode_token, TokenError
from app.config.settings import settings
from app.utils.helpers import write_log
from app.services import quiz_service

sio = socketio.AsyncServer(
    async_mode="asgi",
    # Same allow-list as the REST API's CORSMiddleware (settings.cors_origins,
    # see app/main.py) rather than "*" -- same-origin deployments (local dev
    # via the Vite proxy, Cloudflare Tunnel, Nginx, or the backend serving
    # the built frontend itself) don't need this at all since same-origin
    # requests aren't subject to CORS in the first place. It only matters
    # for a genuinely split-origin deployment (e.g. frontend on Vercel,
    # backend on Render -- see DEPLOYMENT.md), where it should be the
    # frontend's real origin, not a wildcard.
    cors_allowed_origins=settings.cors_origins,
    ping_interval=settings.ws_ping_interval,
    ping_timeout=settings.ws_ping_timeout,
)
# NOTE: the combined ASGI app (FastAPI + this Socket.IO server) is built in
# app/main.py via `socketio.ASGIApp(sio, other_asgi_app=app)` -- that's the
# object uvicorn actually serves. We only define the AsyncServer here.


def _admin_room(quiz_id: str) -> str:
    return f"admin:{quiz_id}"


def _student_room(quiz_id: str) -> str:
    return f"student:{quiz_id}"


@sio.event
async def connect(sid, environ, auth):
    """auth = {"token": "...", "role": "admin"|"student", "quiz_id": "..."}
    Fires on both the initial connection AND every automatic reconnect --
    socket.io-client doesn't distinguish them at this layer, so a
    reconnect just re-runs this handler with a fresh sid, which is exactly
    what re-associates it with the existing session."""
    if not auth or "token" not in auth:
        return False
    try:
        payload = decode_token(auth["token"])
    except TokenError:
        return False

    quiz_id = auth.get("quiz_id")
    if payload.get("type") == "admin":
        if quiz_id:
            await sio.enter_room(sid, _admin_room(quiz_id))
        await sio.save_session(sid, {"type": "admin", "quiz_id": quiz_id})
    elif payload.get("type") == "student":
        session = store.get_session(payload["sub"])
        if not session:
            return False
        was_offline = not session.online
        session.socket_sid = sid
        session.online = True
        session.last_seen = time.time()
        await sio.enter_room(sid, _student_room(session.quiz_id))
        await sio.save_session(sid, {"type": "student", "quiz_id": session.quiz_id, "session_id": session.id})
        await sio.emit("student_status", {"session_id": session.id, "online": True}, room=_admin_room(session.quiz_id))
        if was_offline:
            write_log(actor=session.roll_number, action="socket_reconnected", quiz_id=session.quiz_id,
                       session_id=session.id)
    return True


@sio.event
async def disconnect(sid):
    sess = await sio.get_session(sid)
    if not sess:
        return
    if sess.get("type") == "student":
        student_session = store.get_session(sess.get("session_id"))
        if student_session:
            student_session.online = False
            await sio.emit(
                "student_status",
                {"session_id": student_session.id, "online": False},
                room=_admin_room(student_session.quiz_id),
            )
            write_log(actor=student_session.roll_number, action="socket_disconnected",
                       quiz_id=student_session.quiz_id, session_id=student_session.id)


@sio.event
async def heartbeat(sid, data=None):
    """Application-level "still here" signal, distinct from the transport
    ping/pong -- see module docstring. Cheap by design: just a timestamp
    update, no broadcast, so it can fire every 15s per student without
    generating admin-facing traffic.

    Also doubles as the timer-resync channel: python-socketio sends
    whatever this handler *returns* back to the caller as an ack, so the
    student client's periodic heartbeat (already happening every 15s
    regardless) now carries the server-authoritative remaining_seconds
    piggybacked on it -- no separate REST poll needed just to keep the
    on-screen countdown honest (see frontend hooks/useTimer.js /
    pages/student/QuizEngine.jsx). The independent deadline-enforcement
    sweep in scheduler/cleanup_scheduler.py still force-submits on time
    regardless of whether any heartbeat/ack made it through."""
    sess = await sio.get_session(sid)
    if not sess or sess.get("type") != "student":
        return None
    student_session = store.get_session(sess.get("session_id"))
    if not student_session:
        return None
    student_session.last_seen = time.time()
    if not student_session.online:
        student_session.online = True
        await sio.emit("student_status", {"session_id": student_session.id, "online": True},
                        room=_admin_room(student_session.quiz_id))
    return {"remaining_seconds": quiz_service.get_remaining_seconds(student_session)}


@sio.event
async def camera_frame(sid, data):
    """Student pushes a base64 JPEG snapshot every few seconds; we relay it
    to any admin currently watching the live camera grid for that quiz.
    Frames are never written to disk -- pure in-memory relay."""
    sess = await sio.get_session(sid)
    if not sess or sess.get("type") != "student":
        return
    student_session = store.get_session(sess.get("session_id"))
    if not student_session:
        return
    await sio.emit(
        "camera_frame",
        {"session_id": student_session.id, "roll_number": student_session.roll_number, "frame": data.get("frame")},
        room=_admin_room(student_session.quiz_id),
    )


# ---- server -> admin room broadcast helpers, called from REST handlers ----

async def emit_student_joined(quiz_id: str, session: StudentSession):
    await sio.emit("student_joined", {
        "session_id": session.id, "name": session.name, "roll_number": session.roll_number,
    }, room=_admin_room(quiz_id))


async def emit_answer_saved(quiz_id: str, session: StudentSession, question_id: str):
    await sio.emit("answer_saved", {
        "session_id": session.id, "roll_number": session.roll_number, "question_id": question_id,
    }, room=_admin_room(quiz_id))


async def emit_warning(quiz_id: str, session: StudentSession, warning_type: str, count: int):
    await sio.emit("warning", {
        "session_id": session.id, "roll_number": session.roll_number,
        "warning_type": warning_type, "count": count,
    }, room=_admin_room(quiz_id))


async def emit_submit(quiz_id: str, session: StudentSession):
    await sio.emit("submit", {
        "session_id": session.id, "roll_number": session.roll_number, "result": session.result,
    }, room=_admin_room(quiz_id))


async def emit_quiz_ended(quiz_id: str):
    await sio.emit("quiz_end", {"quiz_id": quiz_id}, room=_admin_room(quiz_id))
    await sio.emit("quiz_end", {"quiz_id": quiz_id}, room=_student_room(quiz_id))
