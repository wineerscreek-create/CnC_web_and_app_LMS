"""Feedback, Course Reviews & Testimonial Management Repository.

Serves PostgreSQL queries for:
- Public platform reviews and suggestions
- Course-specific feedback with draft/final submissions and completion gating
- Moderation workflow (pending, approved, rejected, hidden)
- Homepage testimonial publication controls
- Live analytics and statistics
- Newsletter subscriptions
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.core.errors import NotFound, ValidationError, ScopeForbidden, RoleForbidden
from app.core.logging import get_logger
from app.db.postgres import get_pg_connection, pg_transaction

log = get_logger("app.feedback_repo")

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


class FeedbackRepository:
    # -------------------------------------------------------------------------
    # 1. PUBLIC PLATFORM FEEDBACK
    # -------------------------------------------------------------------------
    @staticmethod
    async def submit_platform_feedback(
        *,
        overall_platform_rating: int,
        ease_of_use_rating: int,
        learning_quality_rating: int,
        practical_experience_rating: int,
        recommendation_rating: int,
        written_feedback: str,
        suggestions: str | None = None,
        greeting_message: str | None = None,
        display_name: str | None = None,
        email: str | None = None,
        public_display_consent: bool = False,
        user_category: str = "EXTERNAL",
        user_id: UUID | str | None = None,
        ip_address: str | None = None,
    ) -> dict[str, Any]:
        ratings = [
            overall_platform_rating,
            ease_of_use_rating,
            learning_quality_rating,
            practical_experience_rating,
            recommendation_rating,
        ]
        for r in ratings:
            if not isinstance(r, int) or r < 1 or r > 5:
                raise ValidationError("All rating dimensions must be an integer between 1 and 5 stars.")

        if not written_feedback or len(written_feedback.strip()) < 10:
            raise ValidationError("Please provide constructive written feedback of at least 10 characters.")

        if email and not EMAIL_REGEX.match(email.strip()):
            raise ValidationError("Please provide a valid email address.")

        uid = UUID(str(user_id)) if user_id else None
        cleaned_name = (display_name or "").strip() or ("Anonymous Learner" if not uid else "Verified Learner")

        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO platform_feedback (
                    user_id, display_name, email, user_category,
                    overall_platform_rating, ease_of_use_rating, learning_quality_rating,
                    practical_experience_rating, recommendation_rating,
                    written_feedback, suggestions, greeting_message,
                    public_display_consent, moderation_status, ip_address
                ) VALUES (
                    $1, $2, $3, $4,
                    $5, $6, $7,
                    $8, $9,
                    $10, $11, $12,
                    $13, 'PENDING', $14
                )
                RETURNING id, display_name, user_category, overall_platform_rating,
                          moderation_status, public_display_consent, created_at
                """,
                uid,
                cleaned_name,
                email.strip() if email else None,
                user_category,
                overall_platform_rating,
                ease_of_use_rating,
                learning_quality_rating,
                practical_experience_rating,
                recommendation_rating,
                written_feedback.strip(),
                suggestions.strip() if suggestions else None,
                greeting_message.strip() if greeting_message else None,
                bool(public_display_consent),
                ip_address,
            )
            return dict(row)

    # -------------------------------------------------------------------------
    # 2. HOMEPAGE APPROVED TESTIMONIALS (Public Safe View)
    # -------------------------------------------------------------------------
    @staticmethod
    async def get_public_homepage_testimonials() -> list[dict[str, Any]]:
        """Returns approved and published testimonials for public display.
        Never reveals private email addresses or unapproved feedback.
        """
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT id, display_name, user_category,
                       overall_platform_rating as rating,
                       written_feedback as text,
                       greeting_message,
                       published_at,
                       'PLATFORM' as feedback_source,
                       NULL as course_title
                FROM platform_feedback
                WHERE moderation_status = 'APPROVED'
                  AND is_published_to_homepage = TRUE
                  AND public_display_consent = TRUE
                
                UNION ALL
                
                SELECT cf.id, u.name as display_name, 'STUDENT' as user_category,
                       cf.overall_course_rating as rating,
                       COALESCE(cf.testimonial_text, cf.positive_feedback, cf.learning_outcome) as text,
                       cf.greeting_message,
                       cf.published_at,
                       'COURSE' as feedback_source,
                       c.title as course_title
                FROM course_feedback cf
                JOIN users u ON u.id = cf.participant_id
                JOIN courses c ON c.id = cf.course_id
                WHERE cf.moderation_status = 'APPROVED'
                  AND cf.is_published_to_homepage = TRUE
                  AND cf.public_display_consent = TRUE
                
                ORDER BY published_at DESC NULLS LAST
                LIMIT 12;
                """
            )
            return [dict(r) for r in rows]

    # -------------------------------------------------------------------------
    # 3. COURSE FEEDBACK (Draft, Final & Mandatory Completion Gating)
    # -------------------------------------------------------------------------
    @staticmethod
    async def get_course_feedback(course_id: UUID | str, participant_id: UUID | str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, course_id, enrollment_id, participant_id,
                       content_rating, trainer_rating, practical_activity_rating,
                       learning_material_rating, overall_course_rating,
                       learning_outcome, positive_feedback, improvement_suggestions,
                       future_batch_suggestions, greeting_message, testimonial_text,
                       public_display_consent, submission_type, is_final_submission,
                       moderation_status, submitted_at, created_at, updated_at
                FROM course_feedback
                WHERE course_id = $1::uuid AND participant_id = $2::uuid;
                """,
                UUID(str(course_id)),
                UUID(str(participant_id)),
            )
            return dict(row) if row else None

    @staticmethod
    async def check_completion_gate(
        course_id: UUID | str, participant_id: UUID | str
    ) -> dict[str, Any]:
        """Checks if participant has met learning criteria and submitted mandatory final feedback."""
        async with get_pg_connection() as conn:
            # Check enrollment
            enrollment = await conn.fetchrow(
                """
                SELECT id, enrollment_status, access_status
                FROM enrollments
                WHERE course_id = $1::uuid AND participant_user_id = $2::uuid;
                """,
                UUID(str(course_id)),
                UUID(str(participant_id)),
            )

            # Check feedback
            feedback = await conn.fetchrow(
                """
                SELECT is_final_submission, submitted_at
                FROM course_feedback
                WHERE course_id = $1::uuid AND participant_id = $2::uuid;
                """,
                UUID(str(course_id)),
                UUID(str(participant_id)),
            )

            is_already_completed = enrollment and enrollment["enrollment_status"] == "COMPLETED"
            has_final_feedback = bool(feedback and feedback["is_final_submission"])

            return {
                "enrolled": bool(enrollment),
                "enrollmentId": str(enrollment["id"]) if enrollment else None,
                "enrollmentStatus": enrollment["enrollment_status"] if enrollment else "NONE",
                "isCompleted": is_already_completed,
                "hasFinalFeedback": has_final_feedback,
                "feedbackSubmittedAt": feedback["submitted_at"] if feedback else None,
                "feedbackRequired": not has_final_feedback and not is_already_completed,
            }

    @staticmethod
    async def save_course_feedback(
        course_id: UUID | str,
        participant_id: UUID | str,
        payload: dict[str, Any],
        is_final: bool = False,
    ) -> dict[str, Any]:
        """Save draft or submit final course feedback.
        If is_final=True, validates learning completion requirements and marks enrollment COMPLETED!
        """
        cid = UUID(str(course_id))
        pid = UUID(str(participant_id))

        async with pg_transaction() as conn:
            # Verify active or valid enrollment
            enrollment = await conn.fetchrow(
                """
                SELECT id, enrollment_status
                FROM enrollments
                WHERE course_id = $1 AND participant_user_id = $2
                FOR UPDATE;
                """,
                cid,
                pid,
            )
            if not enrollment:
                raise ScopeForbidden("You must be enrolled in this course to submit course feedback.")

            eid = enrollment["id"]
            current_status = enrollment["enrollment_status"]

            # If final submission, validate ratings and required feedback
            if is_final:
                ratings = [
                    payload.get("contentRating", 5),
                    payload.get("trainerRating", 5),
                    payload.get("practicalActivityRating", 5),
                    payload.get("learningMaterialRating", 5),
                    payload.get("overallCourseRating", 5),
                ]
                for r in ratings:
                    if not isinstance(r, int) or r < 1 or r > 5:
                        raise ValidationError("All course rating categories must be between 1 and 5 stars.")

                if not payload.get("learningOutcome") or len(str(payload.get("learningOutcome")).strip()) < 5:
                    raise ValidationError("Please share what you learned in this course.")

            submission_type = "FINAL" if is_final else "DRAFT"

            # Upsert into course_feedback
            row = await conn.fetchrow(
                """
                INSERT INTO course_feedback (
                    course_id, enrollment_id, participant_id,
                    content_rating, trainer_rating, practical_activity_rating,
                    learning_material_rating, overall_course_rating,
                    learning_outcome, positive_feedback, improvement_suggestions,
                    future_batch_suggestions, greeting_message, testimonial_text,
                    public_display_consent, submission_type, is_final_submission,
                    moderation_status, submitted_at, updated_at
                ) VALUES (
                    $1, $2, $3,
                    $4, $5, $6,
                    $7, $8,
                    $9, $10, $11,
                    $12, $13, $14,
                    $15, $16, $17,
                    'PENDING', CASE WHEN $17 = TRUE THEN NOW() ELSE NULL END, NOW()
                )
                ON CONFLICT (course_id, participant_id)
                DO UPDATE SET
                    content_rating = EXCLUDED.content_rating,
                    trainer_rating = EXCLUDED.trainer_rating,
                    practical_activity_rating = EXCLUDED.practical_activity_rating,
                    learning_material_rating = EXCLUDED.learning_material_rating,
                    overall_course_rating = EXCLUDED.overall_course_rating,
                    learning_outcome = EXCLUDED.learning_outcome,
                    positive_feedback = EXCLUDED.positive_feedback,
                    improvement_suggestions = EXCLUDED.improvement_suggestions,
                    future_batch_suggestions = EXCLUDED.future_batch_suggestions,
                    greeting_message = EXCLUDED.greeting_message,
                    testimonial_text = EXCLUDED.testimonial_text,
                    public_display_consent = EXCLUDED.public_display_consent,
                    submission_type = EXCLUDED.submission_type,
                    is_final_submission = course_feedback.is_final_submission OR EXCLUDED.is_final_submission,
                    submitted_at = COALESCE(course_feedback.submitted_at, EXCLUDED.submitted_at),
                    updated_at = NOW()
                RETURNING id, course_id, participant_id, content_rating, trainer_rating,
                          practical_activity_rating, learning_material_rating, overall_course_rating,
                          learning_outcome, positive_feedback, improvement_suggestions,
                          future_batch_suggestions, greeting_message, testimonial_text,
                          public_display_consent, submission_type, is_final_submission,
                          moderation_status, submitted_at, updated_at;
                """,
                cid,
                eid,
                pid,
                int(payload.get("contentRating", 5)),
                int(payload.get("trainerRating", 5)),
                int(payload.get("practicalActivityRating", 5)),
                int(payload.get("learningMaterialRating", 5)),
                int(payload.get("overallCourseRating", 5)),
                payload.get("learningOutcome"),
                payload.get("positiveFeedback"),
                payload.get("improvementSuggestions"),
                payload.get("futureBatchSuggestions"),
                payload.get("greetingMessage"),
                payload.get("testimonialText"),
                bool(payload.get("publicDisplayConsent", False)),
                submission_type,
                is_final,
            )

            # If final submission and not already completed, update enrollment status to COMPLETED
            course_completed = False
            if is_final:
                if current_status != "COMPLETED":
                    await conn.execute(
                        """
                        UPDATE enrollments
                        SET enrollment_status = 'COMPLETED',
                            updated_at = NOW()
                        WHERE id = $1;
                        """,
                        eid,
                    )
                    course_completed = True
                else:
                    course_completed = True

            return {
                "feedback": dict(row),
                "isFinal": is_final,
                "courseCompleted": course_completed,
                "message": (
                    "Thank you! Your final course feedback has been received and your course completion is finalized."
                    if is_final
                    else "Course feedback draft saved successfully."
                ),
            }

    # -------------------------------------------------------------------------
    # 4. SUPER ADMIN CONTROL CENTER & METRICS
    # -------------------------------------------------------------------------
    @staticmethod
    async def get_admin_summary(institution_id: UUID | str | None = None) -> dict[str, Any]:
        """Aggregated live metrics for Super Admin and Institution Admins."""
        async with get_pg_connection() as conn:
            # Platform review counts
            platform_stats = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_platform,
                    COUNT(*) FILTER (WHERE moderation_status = 'PENDING') as pending_platform,
                    COUNT(*) FILTER (WHERE moderation_status = 'APPROVED') as approved_platform,
                    COUNT(*) FILTER (WHERE moderation_status IN ('REJECTED', 'HIDDEN')) as rejected_platform,
                    COUNT(*) FILTER (WHERE is_published_to_homepage = TRUE) as published_platform,
                    COALESCE(ROUND(AVG(overall_platform_rating), 2), 5.0) as avg_platform_rating,
                    COUNT(*) FILTER (WHERE suggestions IS NOT NULL AND length(suggestions) > 3) as suggestions_count
                FROM platform_feedback;
                """
            )

            # Course review counts
            course_stats = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_course,
                    COUNT(*) FILTER (WHERE moderation_status = 'PENDING') as pending_course,
                    COUNT(*) FILTER (WHERE moderation_status = 'APPROVED') as approved_course,
                    COUNT(*) FILTER (WHERE moderation_status IN ('REJECTED', 'HIDDEN')) as rejected_course,
                    COUNT(*) FILTER (WHERE is_published_to_homepage = TRUE) as published_course,
                    COALESCE(ROUND(AVG(overall_course_rating), 2), 5.0) as avg_course_rating,
                    COUNT(*) FILTER (WHERE improvement_suggestions IS NOT NULL AND length(improvement_suggestions) > 3) as suggestions_count
                FROM course_feedback;
                """
            )

            p = dict(platform_stats) if platform_stats else {}
            c = dict(course_stats) if course_stats else {}

            total_platform = int(p.get("total_platform", 0))
            total_course = int(c.get("total_course", 0))
            pending = int(p.get("pending_platform", 0)) + int(c.get("pending_course", 0))
            approved = int(p.get("approved_platform", 0)) + int(c.get("approved_course", 0))
            rejected = int(p.get("rejected_platform", 0)) + int(c.get("rejected_course", 0))
            published = int(p.get("published_platform", 0)) + int(c.get("published_course", 0))
            total_suggestions = int(p.get("suggestions_count", 0)) + int(c.get("suggestions_count", 0))

            return {
                "totalPlatformReviews": total_platform,
                "totalCourseReviews": total_course,
                "totalReviews": total_platform + total_course,
                "pendingReviews": pending,
                "approvedReviews": approved,
                "rejectedReviews": rejected,
                "publishedTestimonials": published,
                "averagePlatformRating": float(p.get("avg_platform_rating", 5.0)),
                "averageCourseRating": float(c.get("avg_course_rating", 5.0)),
                "totalSuggestions": total_suggestions,
            }

    @staticmethod
    async def get_admin_feedback_list(
        *,
        tab: str = "all",
        status: str | None = None,
        rating: int | None = None,
        search: str | None = None,
        course_id: UUID | str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Unified paginated feedback list for moderation and inspection."""
        async with get_pg_connection() as conn:
            items: list[dict[str, Any]] = []

            # Platform feedback query
            include_platform = tab in ("all", "platform", "pending", "approved", "rejected_hidden", "homepage")
            include_course = tab in ("all", "course", "pending", "approved", "rejected_hidden", "homepage")

            if include_platform:
                p_conditions = ["1=1"]
                p_params: list[Any] = []

                if status:
                    p_params.append(status.upper())
                    p_conditions.append(f"pf.moderation_status = ${len(p_params)}")
                elif tab == "pending":
                    p_conditions.append("pf.moderation_status = 'PENDING'")
                elif tab == "approved":
                    p_conditions.append("pf.moderation_status = 'APPROVED'")
                elif tab == "rejected_hidden":
                    p_conditions.append("pf.moderation_status IN ('REJECTED', 'HIDDEN')")
                elif tab == "homepage":
                    p_conditions.append("pf.is_published_to_homepage = TRUE")

                if rating:
                    p_params.append(int(rating))
                    p_conditions.append(f"pf.overall_platform_rating = ${len(p_params)}")

                if search:
                    p_params.append(f"%{search.strip()}%")
                    idx = len(p_params)
                    p_conditions.append(f"(pf.display_name ILIKE ${idx} OR pf.written_feedback ILIKE ${idx} OR pf.email ILIKE ${idx})")

                p_sql = f"""
                    SELECT pf.id, 'PLATFORM' as feedback_type,
                           pf.display_name, pf.email, pf.user_category,
                           pf.overall_platform_rating as rating,
                           pf.ease_of_use_rating, pf.learning_quality_rating,
                           pf.practical_experience_rating, pf.recommendation_rating,
                           pf.written_feedback as text,
                           pf.suggestions, pf.greeting_message,
                           NULL as testimonial_text,
                           NULL as course_id, NULL as course_title,
                           pf.public_display_consent, pf.moderation_status,
                           pf.is_published_to_homepage, pf.published_at,
                           pf.moderator_note, pf.created_at, pf.updated_at
                    FROM platform_feedback pf
                    WHERE {' AND '.join(p_conditions)}
                    ORDER BY pf.created_at DESC
                    LIMIT {limit};
                """
                p_rows = await conn.fetch(p_sql, *p_params)
                items.extend([dict(r) for r in p_rows])

            if include_course:
                c_conditions = ["1=1"]
                c_params: list[Any] = []

                if status:
                    c_params.append(status.upper())
                    c_conditions.append(f"cf.moderation_status = ${len(c_params)}")
                elif tab == "pending":
                    c_conditions.append("cf.moderation_status = 'PENDING'")
                elif tab == "approved":
                    c_conditions.append("cf.moderation_status = 'APPROVED'")
                elif tab == "rejected_hidden":
                    c_conditions.append("cf.moderation_status IN ('REJECTED', 'HIDDEN')")
                elif tab == "homepage":
                    c_conditions.append("cf.is_published_to_homepage = TRUE")

                if rating:
                    c_params.append(int(rating))
                    c_conditions.append(f"cf.overall_course_rating = ${len(c_params)}")

                if course_id:
                    c_params.append(UUID(str(course_id)))
                    c_conditions.append(f"cf.course_id = ${len(c_params)}")

                if search:
                    c_params.append(f"%{search.strip()}%")
                    idx = len(c_params)
                    c_conditions.append(f"(u.name ILIKE ${idx} OR c.title ILIKE ${idx} OR cf.learning_outcome ILIKE ${idx} OR cf.positive_feedback ILIKE ${idx})")

                c_sql = f"""
                    SELECT cf.id, 'COURSE' as feedback_type,
                           u.name as display_name, u.email, 'STUDENT' as user_category,
                           cf.overall_course_rating as rating,
                           cf.content_rating, cf.trainer_rating,
                           cf.practical_activity_rating, cf.learning_material_rating,
                           5 as recommendation_rating,
                           COALESCE(cf.testimonial_text, cf.positive_feedback, cf.learning_outcome) as text,
                           cf.improvement_suggestions as suggestions, cf.greeting_message,
                           cf.testimonial_text,
                           cf.course_id, c.title as course_title,
                           cf.public_display_consent, cf.moderation_status,
                           cf.is_published_to_homepage, cf.published_at,
                           cf.moderator_note, cf.created_at, cf.updated_at
                    FROM course_feedback cf
                    JOIN users u ON u.id = cf.participant_id
                    JOIN courses c ON c.id = cf.course_id
                    WHERE {' AND '.join(c_conditions)}
                    ORDER BY cf.created_at DESC
                    LIMIT {limit};
                """
                c_rows = await conn.fetch(c_sql, *c_params)
                items.extend([dict(r) for r in c_rows])

            # Sort combined items by created_at DESC
            items.sort(key=lambda x: x["created_at"], reverse=True)
            paginated = items[offset : offset + limit]

            return {
                "items": paginated,
                "total": len(items),
                "limit": limit,
                "offset": offset,
            }

    @staticmethod
    async def moderate_feedback(
        *,
        feedback_type: str,
        feedback_id: UUID | str,
        action: str,
        moderator_id: UUID | str,
        internal_note: str | None = None,
    ) -> dict[str, Any]:
        """Approve, Reject, Hide, or Restore feedback with full audit trail."""
        ftype = feedback_type.upper()
        if ftype not in ("PLATFORM", "COURSE"):
            raise ValidationError("Invalid feedback type.")

        act = action.upper()
        status_map = {
            "APPROVE": "APPROVED",
            "REJECT": "REJECTED",
            "HIDE": "HIDDEN",
            "RESTORE": "PENDING",
        }
        new_status = status_map.get(act)
        if not new_status:
            raise ValidationError(f"Invalid action {action}. Expected APPROVE, REJECT, HIDE, RESTORE.")

        table = "platform_feedback" if ftype == "PLATFORM" else "course_feedback"
        fid = UUID(str(feedback_id))
        mid = UUID(str(moderator_id))

        async with pg_transaction() as conn:
            existing = await conn.fetchrow(f"SELECT id, moderation_status FROM {table} WHERE id = $1 FOR UPDATE;", fid)
            if not existing:
                raise NotFound(f"{ftype} feedback record not found.")

            prev_status = existing["moderation_status"]

            # If rejecting or hiding, automatically remove from homepage if active
            update_published = ", is_published_to_homepage = FALSE" if new_status in ("REJECTED", "HIDDEN") else ""

            updated = await conn.fetchrow(
                f"""
                UPDATE {table}
                SET moderation_status = $2,
                    moderator_note = COALESCE($3, moderator_note),
                    moderated_by = $4,
                    moderated_at = NOW(),
                    updated_at = NOW()
                    {update_published}
                WHERE id = $1
                RETURNING id, moderation_status, is_published_to_homepage, moderator_note, moderated_at;
                """,
                fid,
                new_status,
                internal_note.strip() if internal_note else None,
                mid,
            )

            # Record audit trail
            await conn.execute(
                """
                INSERT INTO feedback_moderation_log (
                    feedback_type, feedback_id, moderator_id, action,
                    previous_status, new_status, internal_note
                ) VALUES ($1, $2, $3, $4, $5, $6, $7);
                """,
                ftype,
                fid,
                mid,
                act,
                prev_status,
                new_status,
                internal_note,
            )

            return dict(updated)

    @staticmethod
    async def toggle_homepage_publication(
        *,
        feedback_type: str,
        feedback_id: UUID | str,
        is_published: bool,
        moderator_id: UUID | str,
    ) -> dict[str, Any]:
        """Publish or unpublish approved feedback to the public homepage."""
        ftype = feedback_type.upper()
        table = "platform_feedback" if ftype == "PLATFORM" else "course_feedback"
        fid = UUID(str(feedback_id))
        mid = UUID(str(moderator_id))

        async with pg_transaction() as conn:
            existing = await conn.fetchrow(
                f"""
                SELECT id, moderation_status, public_display_consent, is_published_to_homepage
                FROM {table}
                WHERE id = $1
                FOR UPDATE;
                """,
                fid,
            )
            if not existing:
                raise NotFound(f"{ftype} feedback record not found.")

            if is_published:
                if existing["moderation_status"] != "APPROVED":
                    raise ValidationError("Only APPROVED feedback can be published to the public homepage.")
                if not existing["public_display_consent"]:
                    raise ValidationError("Cannot publish testimonial without explicit user consent for public display.")

            updated = await conn.fetchrow(
                f"""
                UPDATE {table}
                SET is_published_to_homepage = $2,
                    published_at = CASE WHEN $2 = TRUE THEN NOW() ELSE NULL END,
                    updated_at = NOW()
                WHERE id = $1
                RETURNING id, moderation_status, is_published_to_homepage, published_at;
                """,
                fid,
                is_published,
            )

            act = "PUBLISH_HOMEPAGE" if is_published else "UNPUBLISH_HOMEPAGE"
            await conn.execute(
                """
                INSERT INTO feedback_moderation_log (
                    feedback_type, feedback_id, moderator_id, action,
                    previous_status, new_status, internal_note
                ) VALUES ($1, $2, $3, $4, $5, $6, $7);
                """,
                ftype,
                fid,
                mid,
                act,
                existing["moderation_status"],
                existing["moderation_status"],
                f"Homepage display set to {is_published}",
            )

            return dict(updated)

    @staticmethod
    async def get_admin_analytics() -> dict[str, Any]:
        """Comprehensive rating breakdown and trends for the Super Admin analytics tab."""
        async with get_pg_connection() as conn:
            # Platform rating breakdown
            p_dist = await conn.fetch(
                """
                SELECT overall_platform_rating as rating, COUNT(*) as count
                FROM platform_feedback
                GROUP BY overall_platform_rating
                ORDER BY rating DESC;
                """
            )

            # Course rating breakdown
            c_dist = await conn.fetch(
                """
                SELECT overall_course_rating as rating, COUNT(*) as count
                FROM course_feedback
                GROUP BY overall_course_rating
                ORDER BY rating DESC;
                """
            )

            # Course-wise volume & average rating
            course_breakdown = await conn.fetch(
                """
                SELECT c.id, c.title,
                       COUNT(cf.id) as review_count,
                       ROUND(AVG(cf.overall_course_rating), 1) as avg_rating,
                       ROUND(AVG(cf.trainer_rating), 1) as avg_trainer_rating
                FROM courses c
                LEFT JOIN course_feedback cf ON cf.course_id = c.id
                WHERE c.published = TRUE AND c.deleted_at IS NULL
                GROUP BY c.id, c.title
                ORDER BY review_count DESC, avg_rating DESC
                LIMIT 10;
                """
            )

            # Monthly submissions trend (last 6 months)
            trends = await conn.fetch(
                """
                SELECT TO_CHAR(created_at, 'Mon YYYY') as month,
                       DATE_TRUNC('month', created_at) as sort_key,
                       COUNT(*) as count
                FROM (
                    SELECT created_at FROM platform_feedback
                    UNION ALL
                    SELECT created_at FROM course_feedback
                ) all_fb
                WHERE created_at >= NOW() - INTERVAL '6 months'
                GROUP BY month, sort_key
                ORDER BY sort_key ASC;
                """
            )

            return {
                "platformRatingDistribution": [dict(r) for r in p_dist],
                "courseRatingDistribution": [dict(r) for r in c_dist],
                "courseBreakdown": [dict(r) for r in course_breakdown],
                "monthlyTrends": [
                    {"month": r["month"], "count": int(r["count"])} for r in trends
                ],
            }

    # -------------------------------------------------------------------------
    # 5. NEWSLETTER SUBSCRIPTION
    # -------------------------------------------------------------------------
    @staticmethod
    async def subscribe_newsletter(email: str, ip_address: str | None = None) -> dict[str, Any]:
        clean_email = (email or "").strip().lower()
        if not clean_email or not EMAIL_REGEX.match(clean_email):
            raise ValidationError("Please provide a valid email address.")

        async with get_pg_connection() as conn:
            existing = await conn.fetchrow(
                "SELECT id, email, status FROM newsletter_subscriptions WHERE email = $1;",
                clean_email,
            )
            if existing:
                return {
                    "success": True,
                    "alreadySubscribed": True,
                    "message": "You are already subscribed to the Winners Creek newsletter.",
                }

            row = await conn.fetchrow(
                """
                INSERT INTO newsletter_subscriptions (email, ip_address)
                VALUES ($1, $2)
                RETURNING id, email, created_at;
                """,
                clean_email,
                ip_address,
            )
            return {
                "success": True,
                "alreadySubscribed": False,
                "message": "Thank you for subscribing! You will receive our latest curriculum updates and career insights.",
            }
