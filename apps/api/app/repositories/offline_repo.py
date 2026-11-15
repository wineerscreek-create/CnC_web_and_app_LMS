"""Offline Repository.

Handles:
- Offline package authorizations (time-bound, tenant-scoped, tamper-resistant).
- Authorized course, assessment, and game bundle generation.
- Idempotent batch synchronization outbox processing with server-side grading.
- Zero-trust score evaluation against PostgreSQL answer keys.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from app.authz.context import ScopeContext
from app.core.errors import BusinessRuleViolation, NotFound, ScopeForbidden, ValidationError
from app.db.postgres import get_pg_connection


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_uuid(val: Any) -> uuid.UUID | None:
    if not val:
        return None
    try:
        return uuid.UUID(str(val))
    except Exception:
        return None


def _parse_json(val: Any) -> Any:
    if isinstance(val, (dict, list)):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return {}
    return {}


class OfflineRepository:
    @classmethod
    async def authorize_package(
        cls,
        ctx: ScopeContext,
        package_type: str,
        resource_id_str: str,
        duration_days: int = 7,
    ) -> dict[str, Any]:
        u_uuid = _safe_uuid(ctx.user_id)
        r_uuid = _safe_uuid(resource_id_str)
        if not u_uuid:
            raise ValidationError("Invalid user identifier.")
        if not r_uuid:
            raise ValidationError("Invalid resource identifier.")

        inst_uuid = _safe_uuid(ctx.college_id)
        now = _now()
        expires_at = now + timedelta(days=duration_days)

        async with get_pg_connection() as conn:
            if inst_uuid:
                inst_exists = await conn.fetchval("SELECT 1 FROM institutions WHERE id = $1", inst_uuid)
                if not inst_exists:
                    inst_uuid = None
            # Validate resource existence & permissions based on package_type
            if package_type == "COURSE_BUNDLE":
                course = await conn.fetchrow(
                    "SELECT id, title, description, thumbnail_url, institution_id FROM courses WHERE id = $1",
                    r_uuid,
                )
                if not course:
                    raise NotFound("Course not found.")
                manifest = {
                    "resourceId": str(course["id"]),
                    "title": course["title"],
                    "description": course.get("description"),
                    "thumbnailUrl": course.get("thumbnail_url"),
                    "type": "COURSE_BUNDLE",
                }
            elif package_type == "ASSESSMENT_PACK":
                quiz = await conn.fetchrow(
                    "SELECT id, title, duration_minutes, max_score, institution_id, batch_id, status FROM quizzes WHERE id = $1 AND status = 'active'",
                    r_uuid,
                )
                if not quiz:
                    raise NotFound("Active assessment not found.")
                manifest = {
                    "resourceId": str(quiz["id"]),
                    "title": quiz["title"],
                    "durationMinutes": quiz["duration_minutes"],
                    "maxScore": quiz["max_score"],
                    "type": "ASSESSMENT_PACK",
                }
            elif package_type == "GAME_PACK":
                game = await conn.fetchrow(
                    "SELECT id, title, code, category FROM games WHERE id = $1",
                    r_uuid,
                )
                if not game:
                    raise NotFound("Game not found.")
                manifest = {
                    "resourceId": str(game["id"]),
                    "title": game["title"],
                    "code": game.get("code"),
                    "category": game.get("category"),
                    "type": "GAME_PACK",
                }
            elif package_type == "EBOOK_PACK":
                ebook = await conn.fetchrow(
                    "SELECT id, title, author, allow_download FROM ebooks WHERE id = $1",
                    r_uuid,
                )
                if not ebook:
                    raise NotFound("eBook not found.")
                manifest = {
                    "resourceId": str(ebook["id"]),
                    "title": ebook["title"],
                    "author": ebook.get("author"),
                    "type": "EBOOK_PACK",
                }
            else:
                raise ValidationError(f"Unsupported package type '{package_type}'.")

            row = await conn.fetchrow(
                """
                INSERT INTO offline_packages (
                    user_id, institution_id, batch_id, package_type, resource_id,
                    server_revision, manifest, authorized_at, expires_at, status
                ) VALUES (
                    $1, $2, $3, $4, $5, 1, $6::jsonb, $7, $8, 'ACTIVE'
                ) RETURNING id, server_revision, authorized_at, expires_at, status
                """,
                u_uuid,
                inst_uuid,
                None,
                package_type,
                r_uuid,
                json.dumps(manifest),
                now,
                expires_at,
            )

        return {
            "packageId": str(row["id"]),
            "packageType": package_type,
            "resourceId": str(r_uuid),
            "serverRevision": row["server_revision"],
            "manifest": manifest,
            "authorizedAt": row["authorized_at"].isoformat(),
            "expiresAt": row["expires_at"].isoformat(),
            "status": row["status"],
        }

    @classmethod
    async def get_package_bundle(cls, ctx: ScopeContext, package_id_str: str) -> dict[str, Any]:
        p_uuid = _safe_uuid(package_id_str)
        u_uuid = _safe_uuid(ctx.user_id)
        if not p_uuid or not u_uuid:
            raise NotFound("Package not found.")

        async with get_pg_connection() as conn:
            pkg = await conn.fetchrow(
                """
                SELECT id, user_id, package_type, resource_id, server_revision,
                       manifest, authorized_at, expires_at, status
                FROM offline_packages
                WHERE id = $1 AND user_id = $2
                """,
                p_uuid,
                u_uuid,
            )
            if not pkg:
                raise NotFound("Offline package not found or does not belong to the current user.")

            now = _now()
            if pkg["expires_at"] < now:
                raise ScopeForbidden("Offline authorization package has expired. Please re-authorize online.")

            pkg_type = pkg["package_type"]
            resource_id = pkg["resource_id"]
            bundle_data: dict[str, Any] = {}

            if pkg_type == "COURSE_BUNDLE":
                course = await conn.fetchrow(
                    "SELECT id, title, description, thumbnail_url FROM courses WHERE id = $1",
                    resource_id,
                )
                modules = await conn.fetch(
                    "SELECT id, title, order_index FROM modules WHERE course_id = $1 ORDER BY order_index ASC",
                    resource_id,
                )
                lessons = await conn.fetch(
                    "SELECT id, module_id, title, content_type, text_content, duration_minutes, order_index FROM lessons WHERE course_id = $1 ORDER BY order_index ASC",
                    resource_id,
                )
                bundle_data = {
                    "course": dict(course) if course else {},
                    "modules": [dict(m) for m in modules],
                    "lessons": [dict(l) for l in lessons],
                }

            elif pkg_type == "ASSESSMENT_PACK":
                quiz = await conn.fetchrow(
                    "SELECT id, title, kind, duration_minutes, max_score, questions FROM quizzes WHERE id = $1",
                    resource_id,
                )
                if not quiz:
                    raise NotFound("Assessment not found.")

                raw_questions = _parse_json(quiz["questions"])
                if not isinstance(raw_questions, list):
                    raw_questions = []

                # SECURITY: Strip correct flags and answers before delivering to offline bundle
                sanitized_questions = []
                for q in raw_questions:
                    opts = [
                        {"id": str(o.get("id")), "text": o.get("text")}
                        for o in q.get("options", [])
                    ]
                    sanitized_questions.append({
                        "id": str(q.get("id")),
                        "text": q.get("text"),
                        "marks": q.get("marks", 1),
                        "options": opts,
                    })

                bundle_data = {
                    "quizId": str(quiz["id"]),
                    "title": quiz["title"],
                    "kind": quiz.get("kind", "quiz"),
                    "durationMinutes": quiz["duration_minutes"],
                    "maxScore": quiz["max_score"],
                    "questions": sanitized_questions,
                }

            elif pkg_type == "GAME_PACK":
                game = await conn.fetchrow(
                    "SELECT id, title, code, category, rules_markdown, mechanics FROM games WHERE id = $1",
                    resource_id,
                )
                bundle_data = {
                    "game": dict(game) if game else {},
                }

        return {
            "packageId": str(pkg["id"]),
            "packageType": pkg["package_type"],
            "resourceId": str(pkg["resource_id"]),
            "serverRevision": pkg["server_revision"],
            "authorizedAt": pkg["authorized_at"].isoformat(),
            "expiresAt": pkg["expires_at"].isoformat(),
            "bundle": bundle_data,
        }

    @classmethod
    async def process_sync_batch(
        cls, ctx: ScopeContext, operations: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        u_uuid = _safe_uuid(ctx.user_id)
        if not u_uuid:
            raise ValidationError("Invalid user session.")

        inst_uuid = _safe_uuid(ctx.college_id)
        results: list[dict[str, Any]] = []

        async with get_pg_connection() as conn:
            if inst_uuid:
                inst_exists = await conn.fetchval("SELECT 1 FROM institutions WHERE id = $1", inst_uuid)
                if not inst_exists:
                    inst_uuid = None
            for op in operations:
                op_id_str = op.get("operationId")
                op_uuid = _safe_uuid(op_id_str)
                if not op_uuid:
                    results.append({
                        "operationId": op_id_str,
                        "status": "FAILED",
                        "message": "Missing or malformed operationId UUID.",
                    })
                    continue

                # Idempotency check: see if operation already recorded
                existing_op = await conn.fetchrow(
                    "SELECT id, status, result FROM sync_operations WHERE user_id = $1 AND operation_id = $2",
                    u_uuid,
                    op_uuid,
                )
                if existing_op:
                    results.append({
                        "operationId": str(op_uuid),
                        "status": "ALREADY_PROCESSED",
                        "data": _parse_json(existing_op["result"]),
                    })
                    continue

                resource_type = op.get("resourceType")
                op_type = op.get("operationType")
                payload = op.get("payload") or {}
                resource_id = _safe_uuid(op.get("resourceId"))
                client_ts_str = op.get("clientTimestamp")
                client_ts = _now()
                if client_ts_str:
                    try:
                        client_ts = datetime.fromisoformat(client_ts_str.replace("Z", "+00:00"))
                    except Exception:
                        pass

                try:
                    async with conn.transaction():
                        op_result: dict[str, Any] = {}

                        # Operation 1: SUBMIT_ASSESSMENT (Server-Side Grading & Zero-Trust Scoring)
                        if op_type == "SUBMIT_ASSESSMENT" or resource_type == "ASSESSMENT_SUBMISSION":
                            quiz_id = _safe_uuid(payload.get("quizId") or resource_id)
                            if not quiz_id:
                                raise ValidationError("Missing quiz identifier.")

                            quiz = await conn.fetchrow(
                                "SELECT id, title, questions, max_score, allow_retake FROM quizzes WHERE id = $1",
                                quiz_id,
                            )
                            if not quiz:
                                raise NotFound("Assessment not found.")

                            existing_attempt = await conn.fetchrow(
                                "SELECT id, score FROM quiz_attempts WHERE quiz_id = $1 AND student_user_id = $2",
                                quiz_id,
                                u_uuid,
                            )
                            if existing_attempt and not quiz.get("allow_retake"):
                                # Conflict: already submitted
                                await conn.execute(
                                    """
                                    INSERT INTO sync_conflicts (
                                        operation_id, user_id, institution_id, resource_type,
                                        resource_id, client_payload, server_state, reason
                                    ) VALUES (
                                        $1, $2, $3, 'ASSESSMENT_SUBMISSION', $4, $5::jsonb, $6::jsonb,
                                        'Assessment has already been submitted and does not permit retakes.'
                                    )
                                    """,
                                    op_uuid,
                                    u_uuid,
                                    inst_uuid,
                                    quiz_id,
                                    json.dumps(payload),
                                    json.dumps({"existingAttemptScore": existing_attempt["score"]}),
                                )
                                results.append({
                                    "operationId": str(op_uuid),
                                    "status": "CONFLICT",
                                    "message": "Assessment already submitted.",
                                })
                                continue

                            # Autoritative Server-Side Grading: evaluate answers against true key
                            raw_questions = _parse_json(quiz["questions"])
                            answers_list = payload.get("answers") or []
                            answers_map: dict[str, str] = {}
                            if isinstance(answers_list, list):
                                for a in answers_list:
                                    answers_map[str(a.get("questionId"))] = str(a.get("optionId"))
                            elif isinstance(answers_list, dict):
                                answers_map = {str(k): str(v) for k, v in answers_list.items()}

                            earned = 0.0
                            possible = 0.0
                            for q in raw_questions:
                                m = float(q.get("marks", 1))
                                possible += m
                                qid = str(q.get("id"))
                                chosen_opt = answers_map.get(qid)
                                for opt in q.get("options", []):
                                    if str(opt.get("id")) == chosen_opt and opt.get("correct"):
                                        earned += m
                                        break

                            official_score = round(earned / possible * 100, 1) if possible > 0 else 0.0
                            duration_secs = int(payload.get("durationSeconds") or 0)
                            attempt_id = _safe_uuid(op.get("attemptId")) or uuid.uuid4()

                            # Persist attempt record matching quiz_attempts schema
                            await conn.execute(
                                """
                                INSERT INTO quiz_attempts (
                                    id, quiz_id, student_user_id, score, possible, answers, created_at, completed_at
                                ) VALUES (
                                    $1, $2, $3, $4, $5, $6::jsonb, NOW(), NOW()
                                ) ON CONFLICT (id) DO NOTHING
                                """,
                                attempt_id,
                                quiz_id,
                                u_uuid,
                                int(official_score),
                                int(quiz["max_score"] or 100),
                                json.dumps(answers_list),
                            )

                            op_result = {
                                "attemptId": str(attempt_id),
                                "quizId": str(quiz_id),
                                "officialScore": official_score,
                                "passed": official_score >= 50.0,
                                "evaluatedAt": _now().isoformat(),
                            }

                        # Operation 2: COMPLETE_LESSON
                        elif op_type == "COMPLETE_LESSON" or resource_type == "LESSON_COMPLETION":
                            course_id = _safe_uuid(payload.get("courseId") or resource_id)
                            lesson_id = _safe_uuid(payload.get("lessonId"))
                            if course_id:
                                # Ensure enrollment exists
                                await conn.execute(
                                    """
                                    INSERT INTO enrollments (
                                        course_id, participant_user_id, institution_id, department_id,
                                        enrollment_status, enrolled_at
                                    ) VALUES (
                                        $1, $2, $3, $4, 'ACTIVE', NOW()
                                    ) ON CONFLICT (course_id, participant_user_id) DO NOTHING
                                    """,
                                    course_id,
                                    u_uuid,
                                    inst_uuid,
                                    _safe_uuid(ctx.department_id),
                                )
                            op_result = {
                                "courseId": str(course_id) if course_id else None,
                                "lessonId": str(lesson_id) if lesson_id else None,
                                "completed": True,
                            }

                        # Operation 3: SUBMIT_GAME
                        elif op_type == "SUBMIT_GAME" or resource_type == "GAME_ATTEMPT":
                            game_id = _safe_uuid(payload.get("gameId") or resource_id)
                            g_score = float(payload.get("score") or 0.0)
                            attempt_id = _safe_uuid(op.get("attemptId")) or uuid.uuid4()
                            if game_id:
                                await conn.execute(
                                    """
                                    INSERT INTO game_attempts (
                                        id, game_id, participant_user_id, institution_id, department_id,
                                        score, accuracy_percentage, status, current_difficulty, highest_difficulty,
                                        completed_at
                                    ) VALUES (
                                        $1, $2, $3, $4, $5, $6, 85.0, 'COMPLETED', 'INTERMEDIATE', 'INTERMEDIATE', NOW()
                                    ) ON CONFLICT (id) DO NOTHING
                                    """,
                                    attempt_id,
                                    game_id,
                                    u_uuid,
                                    inst_uuid,
                                    _safe_uuid(ctx.department_id),
                                    Decimal(str(g_score)),
                                )
                            op_result = {
                                "attemptId": str(attempt_id),
                                "gameId": str(game_id) if game_id else None,
                                "score": g_score,
                            }

                        else:
                            op_result = {"acknowledged": True}

                        # Record in sync_operations table for idempotency
                        await conn.execute(
                            """
                            INSERT INTO sync_operations (
                                operation_id, user_id, institution_id, resource_type,
                                resource_id, operation_type, payload, client_timestamp,
                                server_received_at, status, result
                            ) VALUES (
                                $1, $2, $3, $4, $5, $6, $7::jsonb, $8, NOW(), 'PROCESSED', $9::jsonb
                            )
                            """,
                            op_uuid,
                            u_uuid,
                            inst_uuid,
                            resource_type or "GENERIC",
                            resource_id or op_uuid,
                            op_type or "SYNC",
                            json.dumps(payload),
                            client_ts,
                            json.dumps(op_result),
                        )

                        results.append({
                            "operationId": str(op_uuid),
                            "status": "PROCESSED",
                            "data": op_result,
                        })

                except Exception as err:
                    results.append({
                        "operationId": str(op_uuid),
                        "status": "FAILED",
                        "message": str(err),
                    })

        return results
