"""
AI proctoring: a pluggable interface plus a working rule-based baseline.

Real face/mobile-phone detection models (face-api.js / mediapipe in-browser,
or a server-side CV model) are a separate, heavy dependency that a team
would wire in during phase 7 of the roadmap. Rather than fake that here,
this module defines the extension point the frontend already calls into
(WarningType.multiple_faces / no_face / phone_detected posted to
POST /api/student/warning, see hooks/useAntiCheat.js on the frontend) and
turns the resulting warning stream into a proctoring risk score the admin
analytics screen can show today.

To add real detection later:
  1. Run a client-side model (recommended: face-api.js or mediapipe, loaded
     from CDN) inside CameraFeed.jsx, sampling every N seconds.
  2. On a detection event, POST the same WarningEvent shape this module
     already consumes -- no backend contract changes needed.
  3. Optionally replace `score_session` below with a heavier
     model-confidence-weighted score once you have real detections instead
     of simple counts.
"""
from app.memory.store import StudentSession

PROCTORING_WARNING_TYPES = {"multiple_faces", "no_face", "phone_detected"}

RISK_WEIGHTS = {
    "multiple_faces": 3,
    "phone_detected": 3,
    "no_face": 1,
    "camera_off": 2,
    "tab_switch": 1,
    "fullscreen_exit": 1,
    "devtools_open": 2,
    "copy_paste": 1,
    "right_click": 0.5,
}


def score_session(session: StudentSession) -> dict:
    """Simple weighted-sum risk score in [0, 100], plus a breakdown by type."""
    breakdown: dict[str, int] = {}
    raw = 0.0
    for w in session.warnings:
        wtype = w.get("type")
        breakdown[wtype] = breakdown.get(wtype, 0) + 1
        raw += RISK_WEIGHTS.get(wtype, 0.5)

    risk_score = min(100, round(raw * 4, 1))  # scale factor tuned so 25+ weighted points = max risk
    if risk_score >= 60:
        level = "high"
    elif risk_score >= 25:
        level = "medium"
    else:
        level = "low"

    return {
        "session_id": session.id,
        "roll_number": session.roll_number,
        "risk_score": risk_score,
        "risk_level": level,
        "breakdown": breakdown,
        "total_warnings": len(session.warnings),
    }


def score_all_sessions(sessions: list[StudentSession]) -> list[dict]:
    return sorted((score_session(s) for s in sessions), key=lambda r: r["risk_score"], reverse=True)
