"""Student Dashboard Service.

Resolves dynamic context-aware CTA according to the strict 9-tier priority hierarchy,
and delivers recent assessment results, upcoming events, and performance summaries.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from app.db.postgres import get_pg_connection


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_uuid(val: Any) -> uuid.UUID | None:
    if not val:
        return None
    try:
        return uuid.UUID(str(val))
    except (ValueError, TypeError):
        return None


class StudentDashboardService:
    @classmethod
    async def resolve_next_action(
        cls,
        student_user_id: uuid.UUID | str,
        college_id: uuid.UUID | str | None = None,
    ) -> dict[str, Any]:
        """Evaluates student state against strict 9-tier priority rules:

        1. Active assessment (in progress)
        2. Live class running right now
        3. Assessment starting soon (<= 30 mins)
        4. Class starting soon (<= 30 mins)
        5. Assignment deadline approaching (<= 24 hours)
        6. Next live class (> 30 mins)
        7. Next assessment (> 30 mins)
        8. Pending learning task / course
        9. Fallback: "Practice Now"
        """
        u_uuid = _safe_uuid(student_user_id)
        if not u_uuid:
            return cls._fallback_cta()

        now_utc = _now()

        async with get_pg_connection() as conn:
            # Look up student's batch and institution
            b_row = await conn.fetchrow(
                "SELECT batch_id, institution_id FROM student_profiles WHERE user_id = $1",
                u_uuid,
            )
            batch_id = b_row["batch_id"] if b_row else None
            inst_id = b_row["institution_id"] if b_row else _safe_uuid(college_id)

            # -------------------------------------------------------------
            # TIER 1: Active assessment in progress
            # -------------------------------------------------------------
            active_attempt = await conn.fetchrow(
                """
                SELECT a.id, a.quiz_id, a.remaining_seconds, a.created_at,
                       q.title as quiz_title, q.duration_minutes
                FROM quiz_attempts a
                JOIN quizzes q ON q.id = a.quiz_id
                WHERE a.student_user_id = $1 AND a.status = 'in_progress'
                ORDER BY a.created_at DESC
                LIMIT 1
                """,
                u_uuid,
            )
            if active_attempt:
                return {
                    "priority": 1,
                    "type": "ASSESSMENT_IN_PROGRESS",
                    "title": "Resume Assessment",
                    "description": f"You have an ongoing attempt for '{active_attempt['quiz_title']}'.",
                    "buttonText": "Resume Assessment",
                    "actionUrl": f"/student/assessments/{active_attempt['quiz_id']}",
                    "urgency": "URGENT",
                    "remainingSeconds": active_attempt["remaining_seconds"],
                    "id": str(active_attempt["quiz_id"]),
                    "attemptId": str(active_attempt["id"]),
                }

            # -------------------------------------------------------------
            # TIER 2: Live class running right now
            # -------------------------------------------------------------
            active_class = await conn.fetchrow(
                """
                SELECT id, title, starts_at, ends_at, meeting_link, meeting_url
                FROM live_classes
                WHERE (batch_id = $1 OR (batch_id IS NULL AND institution_id = $2))
                  AND (
                      (starts_at <= $3 AND (ends_at IS NULL OR ends_at >= $3))
                      OR UPPER(status) = 'LIVE'
                  )
                  AND UPPER(status) NOT IN ('CANCELLED', 'COMPLETED')
                ORDER BY starts_at ASC
                LIMIT 1
                """,
                batch_id,
                inst_id,
                now_utc,
            )
            if active_class:
                join_link = active_class["meeting_url"] or active_class["meeting_link"] or f"/student/live-classes/{active_class['id']}"
                return {
                    "priority": 2,
                    "type": "LIVE_CLASS_NOW",
                    "title": "Live Class in Progress",
                    "description": f"'{active_class['title']}' is live right now.",
                    "buttonText": "Join Class Now",
                    "actionUrl": join_link,
                    "urgency": "URGENT",
                    "id": str(active_class["id"]),
                    "endsAt": active_class["ends_at"].isoformat() if active_class["ends_at"] else None,
                }

            # -------------------------------------------------------------
            # TIER 3: Assessment starting soon (within 30 minutes)
            # -------------------------------------------------------------
            thirty_mins = now_utc + timedelta(minutes=30)
            starting_quiz = await conn.fetchrow(
                """
                SELECT q.id, q.title, q.opens_at
                FROM quizzes q
                LEFT JOIN quiz_batch_assignments qba ON qba.quiz_id = q.id AND qba.batch_id = $1
                WHERE (q.batch_id = $1 OR qba.batch_id = $1 OR (q.batch_id IS NULL AND q.institution_id = $2))
                  AND q.status = 'active'
                  AND q.opens_at IS NOT NULL
                  AND q.opens_at > $3
                  AND q.opens_at <= $4
                ORDER BY q.opens_at ASC
                LIMIT 1
                """,
                batch_id,
                inst_id,
                now_utc,
                thirty_mins,
            )
            if starting_quiz:
                diff_mins = max(1, int((starting_quiz["opens_at"] - now_utc).total_seconds() // 60))
                return {
                    "priority": 3,
                    "type": "ASSESSMENT_STARTING_SOON",
                    "title": "Assessment Starting Soon",
                    "description": f"'{starting_quiz['title']}' starts in {diff_mins} minutes.",
                    "buttonText": "Go to Assessment",
                    "actionUrl": f"/student/assessments/{starting_quiz['id']}",
                    "urgency": "HIGH",
                    "startsAt": starting_quiz["opens_at"].isoformat(),
                    "id": str(starting_quiz["id"]),
                }

            # -------------------------------------------------------------
            # TIER 4: Live class starting soon (within 30 minutes)
            # -------------------------------------------------------------
            starting_class = await conn.fetchrow(
                """
                SELECT id, title, starts_at, meeting_link, meeting_url
                FROM live_classes
                WHERE (batch_id = $1 OR (batch_id IS NULL AND institution_id = $2))
                  AND starts_at > $3
                  AND starts_at <= $4
                  AND UPPER(status) NOT IN ('CANCELLED', 'COMPLETED')
                ORDER BY starts_at ASC
                LIMIT 1
                """,
                batch_id,
                inst_id,
                now_utc,
                thirty_mins,
            )
            if starting_class:
                diff_mins = max(1, int((starting_class["starts_at"] - now_utc).total_seconds() // 60))
                return {
                    "priority": 4,
                    "type": "CLASS_STARTING_SOON",
                    "title": "Live Class Starting Soon",
                    "description": f"'{starting_class['title']}' starts in {diff_mins} minutes.",
                    "buttonText": "View Class Details",
                    "actionUrl": "/student/live-classes",
                    "urgency": "HIGH",
                    "startsAt": starting_class["starts_at"].isoformat(),
                    "id": str(starting_class["id"]),
                }

            # -------------------------------------------------------------
            # TIER 5: Assignment deadline approaching (within 24 hours, not submitted)
            # -------------------------------------------------------------
            twenty_four_hours = now_utc + timedelta(hours=24)
            due_assignment = await conn.fetchrow(
                """
                SELECT a.id, a.title, a.due_at
                FROM assignments a
                LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_user_id = $1
                WHERE (a.batch_id = $2 OR (a.batch_id IS NULL AND a.institution_id = $3))
                  AND a.due_at IS NOT NULL
                  AND a.due_at > $4
                  AND a.due_at <= $5
                  AND a.status = 'open'
                  AND s.id IS NULL
                ORDER BY a.due_at ASC
                LIMIT 1
                """,
                u_uuid,
                batch_id,
                inst_id,
                now_utc,
                twenty_four_hours,
            )
            if due_assignment:
                hours_left = max(1, int((due_assignment["due_at"] - now_utc).total_seconds() // 3600))
                return {
                    "priority": 5,
                    "type": "ASSIGNMENT_DEADLINE",
                    "title": "Assignment Due Soon",
                    "description": f"'{due_assignment['title']}' is due in {hours_left} hours.",
                    "buttonText": "Submit Assignment",
                    "actionUrl": "/student/assignments",
                    "urgency": "HIGH",
                    "dueAt": due_assignment["due_at"].isoformat(),
                    "id": str(due_assignment["id"]),
                }

            # -------------------------------------------------------------
            # TIER 6: Next live class (> 30 mins)
            # -------------------------------------------------------------
            next_class = await conn.fetchrow(
                """
                SELECT id, title, starts_at
                FROM live_classes
                WHERE (batch_id = $1 OR (batch_id IS NULL AND institution_id = $2))
                  AND starts_at > $3
                  AND UPPER(status) NOT IN ('CANCELLED', 'COMPLETED')
                ORDER BY starts_at ASC
                LIMIT 1
                """,
                batch_id,
                inst_id,
                thirty_mins,
            )
            if next_class:
                date_str = next_class["starts_at"].strftime("%b %d, %I:%M %p")
                return {
                    "priority": 6,
                    "type": "NEXT_LIVE_CLASS",
                    "title": "Upcoming Live Class",
                    "description": f"Next class: '{next_class['title']}' on {date_str}.",
                    "buttonText": "View Schedule",
                    "actionUrl": "/student/live-classes",
                    "urgency": "MEDIUM",
                    "startsAt": next_class["starts_at"].isoformat(),
                    "id": str(next_class["id"]),
                }

            # -------------------------------------------------------------
            # TIER 7: Next upcoming assessment (> 30 mins)
            # -------------------------------------------------------------
            next_quiz = await conn.fetchrow(
                """
                SELECT q.id, q.title, q.opens_at
                FROM quizzes q
                LEFT JOIN quiz_batch_assignments qba ON qba.quiz_id = q.id AND qba.batch_id = $1
                WHERE (q.batch_id = $1 OR qba.batch_id = $1 OR (q.batch_id IS NULL AND q.institution_id = $2))
                  AND q.status = 'active'
                  AND q.opens_at IS NOT NULL
                  AND q.opens_at > $3
                ORDER BY q.opens_at ASC
                LIMIT 1
                """,
                batch_id,
                inst_id,
                thirty_mins,
            )
            if next_quiz:
                date_str = next_quiz["opens_at"].strftime("%b %d, %I:%M %p")
                return {
                    "priority": 7,
                    "type": "NEXT_ASSESSMENT",
                    "title": "Upcoming Assessment",
                    "description": f"Next assessment: '{next_quiz['title']}' on {date_str}.",
                    "buttonText": "View Assessments",
                    "actionUrl": "/student/assessments",
                    "urgency": "MEDIUM",
                    "startsAt": next_quiz["opens_at"].isoformat(),
                    "id": str(next_quiz["id"]),
                }

            # -------------------------------------------------------------
            # TIER 8: Pending learning task / course in progress
            # -------------------------------------------------------------
            course_in_prog = await conn.fetchrow(
                """
                SELECT c.id, c.title
                FROM enrollments ce
                JOIN courses c ON c.id = ce.course_id
                WHERE ce.participant_user_id = $1 AND ce.enrollment_status::text = 'CONFIRMED'
                ORDER BY ce.created_at DESC
                LIMIT 1
                """,
                u_uuid,
            )
            if course_in_prog:
                return {
                    "priority": 8,
                    "type": "PENDING_LEARNING",
                    "title": "Continue Learning",
                    "description": f"Resume '{course_in_prog['title']}'.",
                    "buttonText": "Resume Course",
                    "actionUrl": f"/student/courses/{course_in_prog['id']}",
                    "urgency": "LOW",
                    "id": str(course_in_prog["id"]),
                }

        # -------------------------------------------------------------
        # TIER 9: Fallback: Practice Now
        # -------------------------------------------------------------
        return cls._fallback_cta()

    @classmethod
    def _fallback_cta(cls) -> dict[str, Any]:
        return {
            "priority": 9,
            "type": "PRACTICE_FALLBACK",
            "title": "Practice & Sharpen Skills",
            "description": "Strengthen your conceptual mastery with interactive challenges.",
            "buttonText": "Practice Now",
            "actionUrl": "/student/practice",
            "urgency": "LOW",
        }

    @classmethod
    async def get_dashboard_summary(
        cls,
        student_user_id: uuid.UUID | str,
        college_id: uuid.UUID | str | None = None,
    ) -> dict[str, Any]:
        """Provides recent assessment results, upcoming events, and performance snapshot."""
        u_uuid = _safe_uuid(student_user_id)
        if not u_uuid:
            return {"recentResults": [], "upcomingEvents": [], "performanceSnapshot": {}}

        now_utc = _now()

        async with get_pg_connection() as conn:
            # 1. Recent Assessment Results (top 5 from permanent assessment_reports)
            rep_rows = await conn.fetch(
                """
                SELECT id, attempt_id, quiz_id, assessment_title, marks_obtained,
                       max_marks, percentage, result_status, submitted_at
                FROM assessment_reports
                WHERE student_user_id = $1
                ORDER BY submitted_at DESC
                LIMIT 5
                """,
                u_uuid,
            )
            recent_results = [
                {
                    "reportId": str(r["id"]),
                    "attemptId": str(r["attempt_id"]),
                    "quizId": str(r["quiz_id"]),
                    "title": r["assessment_title"],
                    "marksObtained": float(r["marks_obtained"]),
                    "maxMarks": float(r["max_marks"]),
                    "score": float(r["marks_obtained"]),
                    "percentage": float(r["percentage"]),
                    "resultStatus": r["result_status"],
                    "passed": r["result_status"] == "PASSED",
                    "submittedAt": r["submitted_at"].isoformat() if r["submitted_at"] else None,
                }
                for r in rep_rows
            ]

            # 2. Upcoming Events (Assessments & Live Classes within next 7 days)
            b_row = await conn.fetchrow(
                "SELECT batch_id, institution_id FROM student_profiles WHERE user_id = $1",
                u_uuid,
            )
            batch_id = b_row["batch_id"] if b_row else None
            inst_id = b_row["institution_id"] if b_row else _safe_uuid(college_id)
            seven_days = now_utc + timedelta(days=7)

            upcoming_events = []

            # Quizzes
            quizzes = await conn.fetch(
                """
                SELECT q.id, q.title, q.opens_at, q.closes_at
                FROM quizzes q
                LEFT JOIN quiz_batch_assignments qba ON qba.quiz_id = q.id AND qba.batch_id = $1
                WHERE (q.batch_id = $1 OR qba.batch_id = $1 OR (q.batch_id IS NULL AND q.institution_id = $2))
                  AND q.status = 'active'
                  AND q.opens_at IS NOT NULL
                  AND q.opens_at > $3
                  AND q.opens_at <= $4
                ORDER BY q.opens_at ASC
                LIMIT 5
                """,
                batch_id,
                inst_id,
                now_utc,
                seven_days,
            )
            for q in quizzes:
                upcoming_events.append({
                    "id": str(q["id"]),
                    "type": "ASSESSMENT",
                    "title": q["title"],
                    "eventDate": q["opens_at"].isoformat(),
                    "actionUrl": f"/student/assessments/{q['id']}",
                    "buttonText": "View Assessment",
                })

            # Live Classes
            classes = await conn.fetch(
                """
                SELECT id, title, starts_at, ends_at, meeting_link, meeting_url
                FROM live_classes
                WHERE (batch_id = $1 OR (batch_id IS NULL AND institution_id = $2))
                  AND starts_at > $3
                  AND starts_at <= $4
                  AND UPPER(status) NOT IN ('CANCELLED', 'COMPLETED')
                ORDER BY starts_at ASC
                LIMIT 5
                """,
                batch_id,
                inst_id,
                now_utc,
                seven_days,
            )
            for c in classes:
                upcoming_events.append({
                    "id": str(c["id"]),
                    "type": "LIVE_CLASS",
                    "title": c["title"],
                    "eventDate": c["starts_at"].isoformat(),
                    "actionUrl": c["meeting_url"] or c["meeting_link"] or "/student/live-classes",
                    "buttonText": "Join Class",
                })

            upcoming_events.sort(key=lambda x: x["eventDate"])

            # 3. Overall Performance Snapshot
            perf_rows = await conn.fetch(
                "SELECT percentage, result_status FROM assessment_reports WHERE student_user_id = $1",
                u_uuid,
            )
            tot = len(perf_rows)
            avg = round(sum(float(r["percentage"]) for r in perf_rows) / max(1, tot), 2) if tot > 0 else 0.0
            passed = sum(1 for r in perf_rows if r["result_status"] == "PASSED")

            performance_snapshot = {
                "overallAverage": avg,
                "completedCount": tot,
                "passedCount": passed,
                "failedCount": tot - passed,
            }

        return {
            "recentResults": recent_results,
            "upcomingEvents": upcoming_events,
            "performanceSnapshot": performance_snapshot,
        }
