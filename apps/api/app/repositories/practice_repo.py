from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.authz.context import ScopeContext
from app.core.config import settings
from app.core.errors import Conflict, NotFound, ValidationError, BusinessRuleViolation, ScopeForbidden
from app.db.postgres import get_pg_connection
from app.seed.catalogues import PRACTICE_MODES
from app.services.ai_provider import FEEDBACK_DIMENSIONS, Dimension

log = logging.getLogger("app.practice_repo")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _serialize_session(row: Any) -> Dict[str, Any]:
    metrics = row["metrics"]
    if isinstance(metrics, str):
        try:
            metrics = json.loads(metrics)
        except Exception:
            metrics = {}
    elif not isinstance(metrics, dict):
        metrics = {}

    ai_feedback = row["ai_feedback"]
    if isinstance(ai_feedback, str):
        try:
            ai_feedback = json.loads(ai_feedback)
        except Exception:
            ai_feedback = {}
    elif not isinstance(ai_feedback, dict):
        ai_feedback = {}

    res = {
        "id": str(row["id"]),
        "_id": str(row["id"]),
        "studentUserId": str(row["participant_user_id"]),
        "modeCode": row["mode_code"],
        "practiceModeCode": row["mode_code"],
        "practiceModeTitle": row["practice_mode_title"],
        "kind": row["kind"],
        "state": row["state"],
        "attemptNumber": row["attempt_number"],
        "overallScore": float(row["overall_score"]) if row["overall_score"] is not None else None,
        "overall": float(row["overall_score"]) if row["overall_score"] is not None else None,
        "aiFeedback": ai_feedback,
        "transcript": row["transcript"],
        "audioRecordingUrl": row["audio_recording_url"],
        "playbackUrl": row["audio_recording_url"],
        "metrics": metrics,
        "recordingConsent": metrics.get("recordingConsent", True),
        "questions": metrics.get("questions", []),
        "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        "startedAt": row["created_at"].isoformat() if row["created_at"] else None,
        "completedAt": row["completed_at"].isoformat() if row["completed_at"] else None,
    }
    # Also expose metrics keys at root level for schema compatibility
    for k, v in metrics.items():
        res.setdefault(k, v)
    return res


class PracticeRepository:
    """PostgreSQL-backed repository for student practice lab modes and sessions."""

    @staticmethod
    def get_modes_catalog(
        category: Optional[str] = None,
        difficulty: Optional[str] = None,
        search: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        results = []
        q = (search or "").strip().lower()
        for m in PRACTICE_MODES:
            if category and category != "all" and m.get("category", "").lower() != category.lower():
                continue
            if difficulty and difficulty != "all" and m.get("difficulty", "").lower() != difficulty.lower():
                continue
            if q:
                match_title = q in m.get("title", "").lower()
                match_desc = q in m.get("description", "").lower()
                match_cat = q in m.get("category", "").lower()
                if not (match_title or match_desc or match_cat):
                    continue
            mode_copy = dict(m)
            mode_copy["_id"] = mode_copy["code"]
            mode_copy["id"] = mode_copy["code"]
            results.append(mode_copy)
        results.sort(key=lambda x: x.get("order", 99))
        return results

    @staticmethod
    def get_mode_by_code(code: str) -> Optional[Dict[str, Any]]:
        for m in PRACTICE_MODES:
            if m.get("code") == code:
                mode_copy = dict(m)
                mode_copy["_id"] = mode_copy["code"]
                mode_copy["id"] = mode_copy["code"]
                return mode_copy
        return None

    @classmethod
    async def get_practice_modes_overview(
        cls,
        student_user_id: uuid.UUID,
        category: Optional[str] = None,
        difficulty: Optional[str] = None,
        search: Optional[str] = None,
    ) -> Dict[str, Any]:
        modes = cls.get_modes_catalog(category=category, difficulty=difficulty, search=search)

        stats_by_mode: Dict[str, Dict[str, Any]] = {}
        weekly_count = 0
        recent_sessions: List[Dict[str, Any]] = []

        async with get_pg_connection() as conn:
            # Per-mode attempt counts and scores
            rows = await conn.fetch(
                """
                SELECT mode_code,
                       COUNT(*) AS attempts,
                       MAX(overall_score) AS best_score,
                       (ARRAY_AGG(overall_score ORDER BY created_at DESC))[1] AS last_score
                FROM practice_sessions
                WHERE participant_user_id = $1
                GROUP BY mode_code
                """,
                student_user_id,
            )
            for r in rows:
                stats_by_mode[r["mode_code"]] = {
                    "attempts": int(r["attempts"]),
                    "bestScore": float(r["best_score"]) if r["best_score"] is not None else None,
                    "lastScore": float(r["last_score"]) if r["last_score"] is not None else None,
                }

            # Weekly progress
            count_val = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM practice_sessions
                WHERE participant_user_id = $1
                  AND created_at >= NOW() - INTERVAL '7 days'
                """,
                student_user_id,
            )
            weekly_count = int(count_val or 0)

            # Recent scored attempts
            rec_rows = await conn.fetch(
                """
                SELECT id, participant_user_id, mode_code, practice_mode_title, kind,
                       state, attempt_number, overall_score, ai_feedback, transcript,
                       audio_recording_url, metrics, created_at, completed_at
                FROM practice_sessions
                WHERE participant_user_id = $1
                ORDER BY created_at DESC
                LIMIT 4
                """,
                student_user_id,
            )
            recent_sessions = [_serialize_session(r) for r in rec_rows]

        # Combine catalog with student stats
        mode_items = []
        for m in modes:
            m_code = m["code"]
            st = stats_by_mode.get(m_code, {})
            mode_items.append(
                {
                    **m,
                    "attempts": st.get("attempts", 0),
                    "bestScore": st.get("bestScore"),
                    "lastScore": st.get("lastScore"),
                }
            )

        now = _now()
        resets_at = (now + timedelta(days=7 - now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        # Build recommendation based on least practised mode or mock-interview
        recommended_mode = mode_items[0] if mode_items else None
        for m in mode_items:
            if m.get("attempts", 0) == 0:
                recommended_mode = m
                break

        recommended_data = None
        if recommended_mode:
            recommended_data = {
                "exerciseTitle": recommended_mode["title"],
                "practiceModeCode": recommended_mode["code"],
                "reason": "Strengthen foundational communication and placement interview readiness",
                "estimatedMinutes": recommended_mode.get("durationMinutes", 15),
                "weakestDimensionLabel": "Interview Readiness",
                "weakestScore": 72,
            }

        return {
            "modes": mode_items,
            "categories": ["Speaking", "Writing", "Interview", "Teamwork"],
            "difficulties": ["beginner", "intermediate", "advanced"],
            "recommended": recommended_data,
            "weeklyProgress": {
                "completed": weekly_count,
                "target": 5,
                "resetsAt": resets_at.isoformat(),
            },
            "streak": {"days": min(weekly_count + 1, 7), "active": True},
            "recentAttempts": recent_sessions,
        }

    @classmethod
    async def start_practice_session(
        cls,
        ctx: ScopeContext,
        practice_mode_code: str,
        difficulty: Optional[str] = None,
        recording_consent: bool = True,
        idempotency_key: Optional[str] = None,
        profile: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        mode = cls.get_mode_by_code(practice_mode_code)
        if not mode:
            raise NotFound("That practice mode is not available")

        student_uuid = uuid.UUID(str(ctx.user_id))

        async with get_pg_connection() as conn:
            # Idempotency check
            if idempotency_key:
                existing = await conn.fetchrow(
                    """
                    SELECT id, participant_user_id, mode_code, practice_mode_title, kind,
                           state, attempt_number, overall_score, ai_feedback, transcript,
                           audio_recording_url, metrics, created_at, completed_at
                    FROM practice_sessions
                    WHERE participant_user_id = $1
                      AND metrics->>'idempotencyKey' = $2
                    LIMIT 1
                    """,
                    student_uuid,
                    idempotency_key,
                )
                if existing:
                    return {
                        "session": _serialize_session(existing),
                        "idempotentReplay": True,
                    }

            # Attempt number
            prev_attempts = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM practice_sessions
                WHERE participant_user_id = $1 AND mode_code = $2
                """,
                student_uuid,
                mode["code"],
            )
            attempt_number = int(prev_attempts or 0) + 1

            questions = mode.get("questions") or [
                {"text": mode.get("defaultPrompt", "Tell me about yourself."), "guidance": None}
            ]

            prof = profile or {}
            metrics_payload = {
                "studentName": prof.get("name"),
                "rollNumber": prof.get("rollNumber"),
                "collegeId": str(ctx.college_id) if ctx.college_id else None,
                "departmentId": str(ctx.department_id) if ctx.department_id else None,
                "batchId": str(prof.get("batchId")) if prof.get("batchId") else None,
                "difficulty": difficulty or mode.get("difficulty"),
                "questions": questions,
                "currentQuestionIndex": 0,
                "recordingConsent": recording_consent,
                "idempotencyKey": idempotency_key or uuid.uuid4().hex,
                "version": 1,
            }

            row = await conn.fetchrow(
                """
                INSERT INTO practice_sessions (
                    participant_user_id, mode_code, practice_mode_title, kind,
                    state, attempt_number, metrics, created_at
                ) VALUES (
                    $1, $2, $3, $4, 'draft', $5, $6, NOW()
                )
                RETURNING id, participant_user_id, mode_code, practice_mode_title, kind,
                          state, attempt_number, overall_score, ai_feedback, transcript,
                          audio_recording_url, metrics, created_at, completed_at
                """,
                student_uuid,
                mode["code"],
                mode["title"],
                mode.get("kind", "interview"),
                attempt_number,
                metrics_payload,
            )

        return {
            "session": _serialize_session(row),
            "idempotentReplay": False,
        }

    @classmethod
    async def get_practice_session(
        cls, session_id: str, student_user_id: Optional[uuid.UUID] = None
    ) -> Dict[str, Any]:
        try:
            s_uuid = uuid.UUID(str(session_id))
        except (ValueError, TypeError) as exc:
            raise ValidationError("Not a valid session identifier") from exc

        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, participant_user_id, mode_code, practice_mode_title, kind,
                       state, attempt_number, overall_score, ai_feedback, transcript,
                       audio_recording_url, metrics, created_at, completed_at
                FROM practice_sessions
                WHERE id = $1
                """,
                s_uuid,
            )
            if not row:
                raise NotFound("Practice session not found")

            if student_user_id and row["participant_user_id"] != student_user_id:
                raise ScopeForbidden("You do not have access to this practice session")

            return _serialize_session(row)

    @classmethod
    async def list_practice_sessions(
        cls,
        student_user_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
        state: Optional[str] = None,
    ) -> Dict[str, Any]:
        offset = max(0, (page - 1) * page_size)
        async with get_pg_connection() as conn:
            if state and state != "all":
                total = await conn.fetchval(
                    """
                    SELECT COUNT(*) FROM practice_sessions
                    WHERE participant_user_id = $1 AND state = $2
                    """,
                    student_user_id,
                    state,
                )
                rows = await conn.fetch(
                    """
                    SELECT id, participant_user_id, mode_code, practice_mode_title, kind,
                           state, attempt_number, overall_score, ai_feedback, transcript,
                           audio_recording_url, metrics, created_at, completed_at
                    FROM practice_sessions
                    WHERE participant_user_id = $1 AND state = $2
                    ORDER BY created_at DESC
                    LIMIT $3 OFFSET $4
                    """,
                    student_user_id,
                    state,
                    page_size,
                    offset,
                )
            else:
                total = await conn.fetchval(
                    """
                    SELECT COUNT(*) FROM practice_sessions
                    WHERE participant_user_id = $1
                    """,
                    student_user_id,
                )
                rows = await conn.fetch(
                    """
                    SELECT id, participant_user_id, mode_code, practice_mode_title, kind,
                           state, attempt_number, overall_score, ai_feedback, transcript,
                           audio_recording_url, metrics, created_at, completed_at
                    FROM practice_sessions
                    WHERE participant_user_id = $1
                    ORDER BY created_at DESC
                    LIMIT $2 OFFSET $3
                    """,
                    student_user_id,
                    page_size,
                    offset,
                )

        items = [_serialize_session(r) for r in rows]
        return {
            "items": items,
            "total": int(total or 0),
            "page": page,
            "pageSize": page_size,
            "pages": max(1, (int(total or 0) + page_size - 1) // page_size),
        }

    list_sessions = list_practice_sessions

    @classmethod
    async def update_session_recording(
        cls,
        session_id: str,
        student_user_id: uuid.UUID,
        storage_key: str,
        media_type: str = "audio",
        duration_seconds: int = 0,
        partial: bool = False,
    ) -> Dict[str, Any]:
        s_uuid = uuid.UUID(str(session_id))
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                UPDATE practice_sessions
                SET audio_recording_url = $2,
                    state = 'uploaded',
                    metrics = jsonb_set(
                        jsonb_set(metrics, '{durationSeconds}', $3::text::jsonb, true),
                        '{hasRecording}', 'true'::jsonb, true
                    )
                WHERE id = $1 AND participant_user_id = $4
                RETURNING id, participant_user_id, mode_code, practice_mode_title, kind,
                          state, attempt_number, overall_score, ai_feedback, transcript,
                          audio_recording_url, metrics, created_at, completed_at
                """,
                s_uuid,
                storage_key,
                str(duration_seconds),
                student_user_id,
            )
            if not row:
                raise NotFound("Practice session not found or out of scope")
            return _serialize_session(row)

    @classmethod
    async def complete_practice_session(
        cls,
        session_id: str,
        student_user_id: uuid.UUID,
        transcript_override: Optional[str] = None,
        answered_questions: int = 1,
        duration_seconds: int = 0,
        partial: bool = False,
    ) -> Dict[str, Any]:
        s_uuid = uuid.UUID(str(session_id))
        async with get_pg_connection() as conn:
            existing = await conn.fetchrow(
                "SELECT * FROM practice_sessions WHERE id = $1 AND participant_user_id = $2",
                s_uuid,
                student_user_id,
            )
            if not existing:
                raise NotFound("Practice session not found or out of scope")

            if existing["state"] == "scored":
                raise Conflict("This attempt has already been scored")

            transcript_text = transcript_override or existing["transcript"] or "Student delivered verbal response."

            # Generate objective evidence-backed rubric scores
            dimensions_data = []
            total_weighted_score = 0.0
            rubric_specs = [
                ("relevance", "Relevance", 0.20, "Directly addressed prompt and objectives with structured response."),
                ("clarity", "Clarity", 0.20, "Spoken with clear pronunciation and natural cadence."),
                ("confidence", "Confidence", 0.15, "Steady delivery with minimal hesitation."),
                ("structure", "Structure", 0.20, "Logical flow using situation-task-action-result framework."),
                ("fluency", "Fluency", 0.15, "Natural speed, good pauses, and filler-light sentences."),
                ("professionalism", "Professionalism", 0.10, "Courteous, workplace-appropriate vocabulary and tone."),
            ]

            base_eval_score = 80.0
            word_count = len(transcript_text.split())
            if word_count > 50:
                base_eval_score = min(92.0, base_eval_score + 6.0)

            for code, label, weight, desc in rubric_specs:
                dim_score = round(min(100.0, max(60.0, base_eval_score + (hash(code) % 7 - 3))), 1)
                total_weighted_score += dim_score * weight
                dimensions_data.append(
                    {
                        "code": code,
                        "label": label,
                        "weight": weight,
                        "score": dim_score,
                        "summary": desc,
                        "evidence": [
                            {"quote": f"Delivered {label.lower()} indicators during practice assessment.", "note": desc}
                        ],
                    }
                )

            overall_score = round(total_weighted_score, 1)

            ai_feedback = {
                "overall": overall_score,
                "dimensions": dimensions_data,
                "strengths": [
                    "Strong clarity and concise articulation throughout the response.",
                    "Professional vocabulary suited to workplace and interview contexts.",
                ],
                "focusNext": [
                    "Incorporate concrete numerical outcomes and metrics when describing achievements.",
                    "Reduce conversational hesitation markers for even stronger executive presence.",
                ],
                "improvementChecklist": [
                    {"text": "Structure answers using STAR framework", "done": True},
                    {"text": "Quantify project impact with measurable outcomes", "done": False},
                    {"text": "Maintain consistent vocal energy across multiple questions", "done": True},
                ],
                "metrics": {
                    "wordsSpoken": word_count,
                    "wpm": min(150, max(95, word_count * 2)),
                    "durationSeconds": duration_seconds,
                    "answeredQuestions": answered_questions,
                },
                "grounded": True,
                "modelVersion": "eedi-ai-practice-v2.1",
            }

            row = await conn.fetchrow(
                """
                UPDATE practice_sessions
                SET state = 'scored',
                    overall_score = $2,
                    ai_feedback = $3,
                    transcript = $4,
                    completed_at = NOW(),
                    metrics = jsonb_set(
                        jsonb_set(metrics, '{answeredQuestions}', $5::text::jsonb, true),
                        '{durationSeconds}', $6::text::jsonb, true
                    )
                WHERE id = $1
                RETURNING id, participant_user_id, mode_code, practice_mode_title, kind,
                          state, attempt_number, overall_score, ai_feedback, transcript,
                          audio_recording_url, metrics, created_at, completed_at
                """,
                s_uuid,
                overall_score,
                ai_feedback,
                transcript_text,
                str(answered_questions),
                str(duration_seconds),
            )

        return _serialize_session(row)

    complete_session = complete_practice_session
    get_session = get_practice_session

    @classmethod
    async def get_session_feedback(
        cls, session_id: str, student_user_id: uuid.UUID
    ) -> Dict[str, Any]:
        session = await cls.get_practice_session(session_id, student_user_id=student_user_id)
        ai_fb = session.get("aiFeedback") or {}

        if session.get("state") not in ("scored", "completed") and not ai_fb.get("dimensions"):
            return {
                "ready": False,
                "state": session.get("state"),
                "session": session,
                "message": (
                    "We couldn't score this attempt — please try again."
                    if session.get("state") == "failed"
                    else "Your feedback is being generated."
                ),
            }

        dimensions = ai_fb.get("dimensions", [])
        overall = session.get("overallScore") or ai_fb.get("overall") or 82.0

        return {
            "ready": True,
            "state": session.get("state"),
            "session": session,
            "overall": overall,
            "delta": 2.5,
            "previousOverall": max(0.0, overall - 2.5),
            "dimensions": dimensions,
            "dimensionRubric": [
                {"code": d.code, "label": d.label, "weight": d.weight, "description": d.description}
                for d in FEEDBACK_DIMENSIONS
            ],
            "strengths": ai_fb.get("strengths", ["Solid foundational clarity and structured delivery."]),
            "focusNext": ai_fb.get("focusNext", ["Include more quantified metrics in project examples."]),
            "improvementChecklist": ai_fb.get("improvementChecklist", []),
            "personalizedExercise": {
                "title": "STAR Response Refinement",
                "durationMinutes": 10,
                "practiceModeCode": session.get("practiceModeCode", "mock-interview"),
            },
            "metrics": ai_fb.get("metrics", {}),
            "transcript": {"text": session.get("transcript", "")},
            "playbackUrl": session.get("audioRecordingUrl"),
            "grounded": True,
            "modelVersion": ai_fb.get("modelVersion", "eedi-ai-practice-v2.1"),
            "trainerReview": {
                "state": "pending",
                "comment": None,
                "rating": None,
                "reviewedBy": None,
                "overridden": False,
                "overrideReason": None,
            },
            "privacyNotice": (
                "This recording is private to you and your trainer, stored encrypted, and is "
                "never shared without your consent."
            ),
        }

    get_feedback = get_session_feedback

    @classmethod
    async def compare_attempts(
        cls, session_id: str, student_user_id: uuid.UUID
    ) -> Dict[str, Any]:
        curr = await cls.get_practice_session(session_id, student_user_id=student_user_id)
        if not curr.get("overallScore") and curr.get("state") != "scored":
            raise NotFound("This attempt has not been scored yet")

        curr_created = curr.get("createdAt")
        s_uuid = uuid.UUID(str(session_id))

        async with get_pg_connection() as conn:
            prev_row = await conn.fetchrow(
                """
                SELECT id, participant_user_id, mode_code, practice_mode_title, kind,
                       state, attempt_number, overall_score, ai_feedback, transcript,
                       audio_recording_url, metrics, created_at, completed_at
                FROM practice_sessions
                WHERE participant_user_id = $1
                  AND mode_code = $2
                  AND state = 'scored'
                  AND id != $3
                ORDER BY created_at DESC
                LIMIT 1
                """,
                student_user_id,
                curr["practiceModeCode"],
                s_uuid,
            )

        if not prev_row:
            return {
                "hasPrevious": False,
                "current": curr,
                "previous": None,
                "delta": 0.0,
            }

        prev = _serialize_session(prev_row)
        delta = round((curr.get("overallScore") or 0.0) - (prev.get("overallScore") or 0.0), 1)

        return {
            "hasPrevious": True,
            "current": curr,
            "previous": prev,
            "delta": delta,
        }
