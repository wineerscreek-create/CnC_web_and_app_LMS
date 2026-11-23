"""Assessment Report Repository & Service.

Handles permanent snapshot generation, persistence, retrieval, and
Excel export generation (both individual 4-sheet workbooks and bulk ZIP archives).
"""
from __future__ import annotations

import io
import json
import re
import uuid
import zipfile
from datetime import datetime, timezone
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.core.errors import NotFound, ScopeForbidden, ValidationError
from app.core.logging import get_logger
from app.db.postgres import get_pg_connection
from app.services import notifications as notif_service

log = get_logger("app.assessment_report_repo")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_uuid(val: Any) -> uuid.UUID | None:
    if not val:
        return None
    try:
        return uuid.UUID(str(val))
    except (ValueError, TypeError):
        return None


def _parse_json(val: Any) -> Any:
    if isinstance(val, (dict, list)):
        return val
    if isinstance(val, str) and val.strip():
        try:
            return json.loads(val)
        except Exception:
            return []
    return []


def _sanitize_filename(name: str) -> str:
    cleaned = re.sub(r'[\\/*?:"<>|]', "", name)
    cleaned = re.sub(r"\s+", "_", cleaned)
    return cleaned.strip("._") or "assessment"


class AssessmentReportRepository:
    @classmethod
    async def generate_and_persist_report(
        cls,
        attempt_id: uuid.UUID | str,
        conn=None,
    ) -> dict[str, Any]:
        """Generates an immutable assessment report snapshot from an attempt and stores it permanently.

        Reattempts generate new distinct report records.
        """
        att_uuid = _safe_uuid(attempt_id)
        if not att_uuid:
            raise ValidationError("Invalid attempt ID.")

        async def _execute(c):
            # Check if report already exists for this exact attempt
            existing = await c.fetchrow(
                "SELECT id, attempt_id, quiz_id, student_user_id, marks_obtained, max_marks, percentage, result_status FROM assessment_reports WHERE attempt_id = $1",
                att_uuid,
            )
            if existing:
                return dict(existing)

            # Fetch attempt
            att = await c.fetchrow(
                """
                SELECT id, quiz_id, student_user_id, score, possible, percentage, passed,
                       performance_category, motivational_message, correct_count, incorrect_count,
                       unattempted_count, status, answers, warnings, warning_count, submission_reason,
                       submission_source, time_taken_seconds, created_at, completed_at, batch_id, institution_id
                FROM quiz_attempts
                WHERE id = $1
                """,
                att_uuid,
            )
            if not att:
                raise NotFound("Assessment attempt not found.")

            quiz_id = att["quiz_id"]
            student_id = att["student_user_id"]

            # Fetch quiz
            quiz = await c.fetchrow(
                """
                SELECT q.id, q.title, q.questions, q.max_score, q.settings, q.creator_trainer_id,
                       u.name as trainer_name
                FROM quizzes q
                LEFT JOIN users u ON u.id = q.creator_trainer_id
                WHERE q.id = $1
                """,
                quiz_id,
            )
            if not quiz:
                raise NotFound("Quiz not found.")

            # Fetch student profile & batch
            student = await c.fetchrow(
                """
                SELECT u.name, u.email, sp.roll_number, sp.current_semester,
                       d.name as branch_name, b.name as batch_name, b.id as batch_id,
                       u.institution_id
                FROM users u
                LEFT JOIN student_profiles sp ON sp.user_id = u.id
                LEFT JOIN departments d ON d.id = sp.department_id
                LEFT JOIN batches b ON b.id = sp.batch_id
                WHERE u.id = $1
                """,
                student_id,
            )

            student_name = student["name"] if student and student["name"] else "Student"
            roll_number = student["roll_number"] if student and student["roll_number"] else ""
            email = student["email"] if student and student["email"] else ""
            branch = student["branch_name"] if student and student["branch_name"] else ""
            semester = str(student["current_semester"]) if student and student["current_semester"] else ""
            batch_name = student["batch_name"] if student and student["batch_name"] else ""
            assessment_title = quiz["title"]
            trainer_name = quiz["trainer_name"] or "Trainer"

            # Count attempts for this student and quiz to determine attempt number
            prior_count = await c.fetchval(
                "SELECT COUNT(*) FROM assessment_reports WHERE quiz_id = $1 AND student_user_id = $2",
                quiz_id,
                student_id,
            )
            attempt_number = int(prior_count or 0) + 1

            # Parse questions & answers
            raw_questions = _parse_json(quiz["questions"])
            raw_answers = _parse_json(att["answers"])
            answers_map: dict[str, Any] = {}
            if isinstance(raw_answers, dict):
                answers_map = {str(k): v for k, v in raw_answers.items()}
            elif isinstance(raw_answers, list):
                for a in raw_answers:
                    if isinstance(a, dict) and "questionId" in a:
                        answers_map[str(a["questionId"])] = a.get("optionId") or a.get("value")

            # Build question-wise breakdown & topic aggregation
            question_summary: list[dict[str, Any]] = []
            topic_map: dict[str, dict[str, Any]] = {}
            tot_correct = 0
            tot_incorrect = 0
            tot_unattempted = 0

            for idx, q in enumerate(raw_questions, start=1):
                qid = str(q.get("id") or idx)
                q_text = q.get("text") or q.get("question") or f"Question {idx}"
                topic = q.get("topic") or q.get("subject") or "General"
                difficulty = q.get("difficulty") or "Medium"
                m = float(q.get("marks", 1))
                neg = float(q.get("negative", 0))

                raw_ans = answers_map.get(qid)
                q_type = q.get("question_type") or q.get("questionType") or "mcq_single"

                # Normalize candidate answer
                chosen_list: list[str] = []
                if isinstance(raw_ans, list):
                    chosen_list = [str(c).strip().upper() for c in raw_ans if str(c).strip()]
                elif isinstance(raw_ans, dict):
                    chosen_list = [str(c).strip().upper() for c in raw_ans.get("selected", [])]
                elif raw_ans is not None and str(raw_ans).strip():
                    chosen_list = [str(raw_ans).strip().upper()]

                # Normalize correct answers
                correct_raw = q.get("correct_options") or q.get("correct") or q.get("correct_answer") or q.get("correctAnswer")
                if not correct_raw and isinstance(q.get("options"), list):
                    correct_raw = [opt.get("id") for opt in q.get("options", []) if opt.get("correct")]

                if isinstance(correct_raw, str):
                    correct_answers = [correct_raw.strip().upper()]
                elif isinstance(correct_raw, list):
                    correct_answers = [str(c).strip().upper() for c in correct_raw if str(c).strip()]
                else:
                    correct_answers = []

                is_correct = False
                has_attempted = False

                if q_type == "numerical":
                    val = str(raw_ans).strip().lower() if raw_ans is not None else ""
                    expected = str(q.get("correct_answer") or q.get("correctAnswer") or (correct_answers[0] if correct_answers else "")).strip().lower()
                    has_attempted = bool(val)
                    is_correct = bool(val and val == expected)
                elif q_type == "mcq_multiple":
                    has_attempted = bool(chosen_list)
                    is_correct = bool(chosen_list and set(chosen_list) == set(correct_answers))
                else:
                    chosen = chosen_list[0] if chosen_list else ""
                    has_attempted = bool(chosen)
                    if isinstance(q.get("options"), list):
                        for opt in q.get("options", []):
                            opt_id = str(opt.get("id", "")).strip().upper()
                            if opt_id == chosen and (opt.get("correct") or opt_id in correct_answers):
                                is_correct = True
                                break
                    elif isinstance(q.get("options"), dict):
                        if chosen in correct_answers:
                            is_correct = True

                q_earned = 0.0
                if is_correct:
                    q_earned = m
                    tot_correct += 1
                elif has_attempted:
                    q_earned = neg if neg < 0 else (-abs(neg) if neg > 0 else 0.0)
                    tot_incorrect += 1
                else:
                    tot_unattempted += 1

                # Display text for options if available
                opt_lookup = {}
                if isinstance(q.get("options"), list):
                    for opt in q.get("options", []):
                        opt_id = str(opt.get("id", "")).strip().upper()
                        opt_lookup[opt_id] = opt.get("text") or opt.get("label") or opt_id

                student_ans_display = ", ".join([opt_lookup.get(c, c) for c in chosen_list]) if chosen_list else (str(raw_ans) if raw_ans is not None and str(raw_ans).strip() else "Unattempted")
                correct_ans_display = ", ".join([opt_lookup.get(c, c) for c in correct_answers]) if correct_answers else "N/A"

                question_summary.append({
                    "question_id": qid,
                    "question_number": idx,
                    "question_text": q_text,
                    "topic": topic,
                    "difficulty": difficulty,
                    "marks_awarded": q_earned,
                    "max_marks": m,
                    "student_answer": student_ans_display,
                    "correct_answer": correct_ans_display,
                    "is_correct": is_correct,
                    "status": "Correct" if is_correct else ("Incorrect" if has_attempted else "Unattempted"),
                    "explanation": q.get("explanation") or "",
                })

                # Topic stats
                if topic not in topic_map:
                    topic_map[topic] = {
                        "topic": topic,
                        "total_questions": 0,
                        "correct_answers": 0,
                        "score": 0.0,
                        "max_score": 0.0,
                        "percentage": 0.0,
                    }
                topic_map[topic]["total_questions"] += 1
                if is_correct:
                    topic_map[topic]["correct_answers"] += 1
                topic_map[topic]["score"] += q_earned
                topic_map[topic]["max_score"] += m

            # Finalize topic performance percentages
            topic_performance = []
            strengths = []
            weaknesses = []
            for t_name, t_data in topic_map.items():
                m_score = max(0.01, t_data["max_score"])
                pct = round(max(0.0, min(100.0, (t_data["score"] / m_score) * 100)), 2)
                t_data["percentage"] = pct
                topic_performance.append(t_data)
                if pct >= 70.0:
                    strengths.append(t_name)
                elif pct < 50.0:
                    weaknesses.append(t_name)

            total_q_count = len(raw_questions)
            attempted_q_count = tot_correct + tot_incorrect
            marks_obtained = float(att["score"] or 0)
            max_marks = float(att["possible"] or quiz["max_score"] or 100)
            if att["percentage"] is not None:
                percentage = float(att["percentage"])
            elif max_marks > 0 and marks_obtained <= max_marks:
                percentage = round((marks_obtained / max_marks) * 100.0, 2)
            else:
                percentage = marks_obtained
            percentage = round(min(100.0, max(0.0, percentage)), 2)
            passed = bool(att["passed"])
            result_status = "PASSED" if passed else "FAILED"

            # Timing
            started_at = att["created_at"]
            submitted_at = att["completed_at"] or _now()
            time_taken = int(att["time_taken_seconds"] or 0)
            if not time_taken and started_at and submitted_at:
                time_taken = max(0, int((submitted_at - started_at).total_seconds()))

            # Proctoring summary
            raw_warnings = _parse_json(att["warnings"])
            warning_count = int(att["warning_count"] or len(raw_warnings))
            proctoring_summary = {
                "total_warnings": warning_count,
                "submission_reason": att["submission_reason"] or "STUDENT_MANUAL_SUBMIT",
                "submission_source": att["submission_source"] or "ONLINE",
                "events": raw_warnings if isinstance(raw_warnings, list) else [],
            }

            feedback = {
                "motivational_message": att["motivational_message"] or ("Well done! You demonstrated solid competency." if passed else "Keep practicing to strengthen your foundational concepts."),
                "category": att["performance_category"] or ("EXCELLENT" if percentage >= 85 else ("GOOD" if percentage >= 60 else "NEEDS_IMPROVEMENT")),
                "strengths": strengths or ["Foundational Understanding"],
                "areas_for_improvement": weaknesses or ["Time Management", "Advanced Application"],
            }

            report_id = uuid.uuid4()
            report_row = await c.fetchrow(
                """
                INSERT INTO assessment_reports (
                    id, attempt_id, quiz_id, student_user_id, institution_id, batch_id,
                    attempt_number, student_name, roll_number, email, branch, semester,
                    batch_name, assessment_title, trainer_name, assessment_date,
                    started_at, submitted_at, time_taken_seconds, total_questions,
                    attempted_questions, unattempted_questions, correct_answers,
                    incorrect_answers, marks_obtained, max_marks, percentage,
                    result_status, warning_count, proctoring_summary, question_summary,
                    topic_performance, feedback, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6,
                    $7, $8, $9, $10, $11, $12,
                    $13, $14, $15, $16,
                    $17, $18, $19, $20,
                    $21, $22, $23,
                    $24, $25, $26, $27,
                    $28, $29, $30::jsonb, $31::jsonb,
                    $32::jsonb, $33::jsonb, NOW(), NOW()
                )
                ON CONFLICT (attempt_id) DO UPDATE SET updated_at = NOW()
                RETURNING *
                """,
                report_id,
                att_uuid,
                quiz_id,
                student_id,
                att["institution_id"] or student["institution_id"],
                att["batch_id"] or student["batch_id"],
                attempt_number,
                student_name,
                roll_number,
                email,
                branch,
                semester,
                batch_name,
                assessment_title,
                trainer_name,
                started_at or _now(),
                started_at,
                submitted_at,
                time_taken,
                total_q_count,
                attempted_q_count,
                tot_unattempted,
                tot_correct,
                tot_incorrect,
                marks_obtained,
                max_marks,
                percentage,
                result_status,
                warning_count,
                json.dumps(proctoring_summary),
                json.dumps(question_summary),
                json.dumps(topic_performance),
                json.dumps(feedback),
            )

            # Fire idempotent notification to student
            try:
                await notif_service.notify(
                    user_id=student_id,
                    kind=notif_service.Kind.REPORT_READY,
                    title="Assessment Report Ready",
                    body=f"Your permanent report for '{assessment_title}' is ready. Score: {marks_obtained}/{max_marks} ({percentage}%).",
                    href=f"/student/progress?reportId={report_id}",
                    college_id=att["institution_id"] or student["institution_id"],
                    metadata={
                        "reportId": str(report_id),
                        "attemptId": str(att_uuid),
                        "quizId": str(quiz_id),
                        "score": marks_obtained,
                        "percentage": percentage,
                        "result": result_status,
                        "priority": "MEDIUM",
                        "dedupKey": f"report_{att_uuid}",
                    },
                    conn=c,
                )
            except Exception as e:
                log.warning("report_ready_notification_failed", extra={"error": str(e)})

            return dict(report_row)

        if conn:
            return await _execute(conn)
        else:
            async with get_pg_connection() as conn:
                return await _execute(conn)

    @classmethod
    async def get_student_reports(
        cls,
        student_user_id: uuid.UUID | str,
        search: str | None = None,
        course_id: str | None = None,
        quiz_id: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        """Returns paginated assessment reports for a student."""
        u_uuid = _safe_uuid(student_user_id)
        if not u_uuid:
            raise ValidationError("Invalid student user ID.")

        page = max(1, page)
        page_size = min(100, max(1, page_size))
        offset = (page - 1) * page_size

        where_clauses = ["student_user_id = $1"]
        params: list[Any] = [u_uuid]

        if search and search.strip():
            params.append(f"%{search.strip()}%")
            where_clauses.append(f"assessment_title ILIKE ${len(params)}")

        if quiz_id:
            q_uuid = _safe_uuid(quiz_id)
            if q_uuid:
                params.append(q_uuid)
                where_clauses.append(f"quiz_id = ${len(params)}")

        if start_date:
            try:
                dt_from = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
                params.append(dt_from)
                where_clauses.append(f"submitted_at >= ${len(params)}")
            except Exception:
                pass

        if end_date:
            try:
                dt_to = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
                params.append(dt_to)
                where_clauses.append(f"submitted_at <= ${len(params)}")
            except Exception:
                pass

        where_sql = " AND ".join(where_clauses)

        async with get_pg_connection() as conn:
            total = await conn.fetchval(
                f"SELECT COUNT(*) FROM assessment_reports WHERE {where_sql}",
                *params,
            ) or 0

            params.extend([page_size, offset])
            rows = await conn.fetch(
                f"""
                SELECT id, attempt_id, quiz_id, student_user_id, attempt_number,
                       student_name, roll_number, email,
                       assessment_title, trainer_name, batch_name, branch, semester,
                       assessment_date, started_at, submitted_at, time_taken_seconds,
                       total_questions, attempted_questions, unattempted_questions,
                       correct_answers, incorrect_answers, marks_obtained, max_marks,
                       percentage, result_status, warning_count, created_at
                FROM assessment_reports
                WHERE {where_sql}
                ORDER BY submitted_at DESC
                LIMIT ${len(params)-1} OFFSET ${len(params)}
                """,
                *params,
            )

        items = []
        for r in rows:
            items.append({
                "id": str(r["id"]),
                "reportId": str(r["id"]),
                "attemptId": str(r["attempt_id"]),
                "quizId": str(r["quiz_id"]),
                "attemptNumber": r["attempt_number"],
                "assessmentTitle": r["assessment_title"],
                "title": r["assessment_title"],
                "studentName": r["student_name"],
                "rollNumber": r["roll_number"] or "",
                "email": r["email"] or "",
                "trainerName": r["trainer_name"],
                "batchName": r["batch_name"],
                "branch": r["branch"],
                "semester": r["semester"],
                "assessmentDate": r["assessment_date"].isoformat() if r["assessment_date"] else None,
                "startedAt": r["started_at"].isoformat() if r["started_at"] else None,
                "submittedAt": r["submitted_at"].isoformat() if r["submitted_at"] else None,
                "timeTakenSeconds": r["time_taken_seconds"],
                "totalQuestions": r["total_questions"],
                "attemptedQuestions": r["attempted_questions"],
                "unattemptedQuestions": r["unattempted_questions"],
                "correctAnswers": r["correct_answers"],
                "incorrectAnswers": r["incorrect_answers"],
                "marksObtained": float(r["marks_obtained"]),
                "maxMarks": float(r["max_marks"]),
                "score": float(r["marks_obtained"]),
                "percentage": float(r["percentage"]),
                "resultStatus": r["result_status"],
                "passed": r["result_status"] == "PASSED",
                "warningCount": r["warning_count"],
            })

        total_pages = max(1, (total + page_size - 1) // page_size)
        return {
            "items": items,
            "pagination": {
                "page": page,
                "pageSize": page_size,
                "total": total,
                "totalPages": total_pages,
                "hasNext": page < total_pages,
                "hasPrev": page > 1,
            },
        }

    @classmethod
    async def get_report_by_id(
        cls,
        report_id: uuid.UUID | str,
        student_user_id: uuid.UUID | str | None = None,
    ) -> dict[str, Any]:
        """Retrieves a single assessment report with full details, verifying student authorization."""
        r_uuid = _safe_uuid(report_id)
        if not r_uuid:
            raise NotFound("Assessment report not found.")

        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM assessment_reports WHERE id = $1",
                r_uuid,
            )
            if not row:
                raise NotFound("Assessment report not found.")

            if student_user_id:
                u_uuid = _safe_uuid(student_user_id)
                if u_uuid and row["student_user_id"] != u_uuid:
                    raise ScopeForbidden("You are not authorized to view this assessment report.")

        return {
            "id": str(row["id"]),
            "reportId": str(row["id"]),
            "attemptId": str(row["attempt_id"]),
            "quizId": str(row["quiz_id"]),
            "studentUserId": str(row["student_user_id"]),
            "studentName": row["student_name"],
            "rollNumber": row["roll_number"] or "",
            "email": row["email"] or "",
            "branch": row["branch"] or "",
            "semester": row["semester"] or "",
            "batchName": row["batch_name"] or "",
            "assessmentTitle": row["assessment_title"],
            "trainerName": row["trainer_name"] or "",
            "attemptNumber": row["attempt_number"],
            "assessmentDate": row["assessment_date"].isoformat() if row["assessment_date"] else None,
            "startedAt": row["started_at"].isoformat() if row["started_at"] else None,
            "submittedAt": row["submitted_at"].isoformat() if row["submitted_at"] else None,
            "timeTakenSeconds": row["time_taken_seconds"],
            "totalQuestions": row["total_questions"],
            "attemptedQuestions": row["attempted_questions"],
            "unattemptedQuestions": row["unattempted_questions"],
            "correctAnswers": row["correct_answers"],
            "incorrectAnswers": row["incorrect_answers"],
            "marksObtained": float(row["marks_obtained"]),
            "maxMarks": float(row["max_marks"]),
            "score": float(row["marks_obtained"]),
            "percentage": float(row["percentage"]),
            "resultStatus": row["result_status"],
            "passed": row["result_status"] == "PASSED",
            "warningCount": row["warning_count"],
            "proctoringSummary": _parse_json(row["proctoring_summary"]),
            "questionSummary": _parse_json(row["question_summary"]),
            "topicPerformance": _parse_json(row["topic_performance"]),
            "feedback": _parse_json(row["feedback"]),
            "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        }

    @classmethod
    async def get_student_progress_summary(
        cls,
        student_user_id: uuid.UUID | str,
    ) -> dict[str, Any]:
        """Calculates aggregated performance statistics across all permanent assessment reports."""
        u_uuid = _safe_uuid(student_user_id)
        if not u_uuid:
            raise ValidationError("Invalid student user ID.")

        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT marks_obtained, max_marks, percentage, result_status,
                       topic_performance, submitted_at, assessment_title
                FROM assessment_reports
                WHERE student_user_id = $1
                ORDER BY submitted_at ASC
                """,
                u_uuid,
            )

        if not rows:
            return {
                "averagePercentage": 0.0,
                "totalCompleted": 0,
                "totalAttempted": 0,
                "passedCount": 0,
                "failedCount": 0,
                "bestScore": 0.0,
                "latestScore": 0.0,
                "improvementTrend": [],
                "topicBreakdown": [],
            }

        total_reports = len(rows)
        passed_count = sum(1 for r in rows if r["result_status"] == "PASSED")
        failed_count = total_reports - passed_count
        percentages = [float(r["percentage"]) for r in rows]
        avg_pct = round(sum(percentages) / max(1, total_reports), 2)
        best_pct = max(percentages)
        latest_pct = percentages[-1]

        # Improvement trend (chronological)
        trend = [
            {
                "date": r["submitted_at"].strftime("%Y-%m-%d") if r["submitted_at"] else "",
                "title": r["assessment_title"],
                "percentage": float(r["percentage"]),
            }
            for r in rows[-10:]
        ]

        # Aggregate topic breakdown
        topic_totals: dict[str, dict[str, float]] = {}
        for r in rows:
            t_list = _parse_json(r["topic_performance"])
            if isinstance(t_list, list):
                for t in t_list:
                    name = t.get("topic") or "General"
                    if name not in topic_totals:
                        topic_totals[name] = {"earned": 0.0, "max": 0.0, "questions": 0, "correct": 0}
                    topic_totals[name]["earned"] += float(t.get("score", 0))
                    topic_totals[name]["max"] += float(t.get("max_score", 1))
                    topic_totals[name]["questions"] += int(t.get("total_questions", 1))
                    topic_totals[name]["correct"] += int(t.get("correct_answers", 0))

        topic_breakdown = []
        for name, stats in topic_totals.items():
            max_val = max(0.01, stats["max"])
            pct = round((stats["earned"] / max_val) * 100, 2)
            topic_breakdown.append({
                "topic": name,
                "percentage": max(0.0, min(100.0, pct)),
                "totalQuestions": stats["questions"],
                "correctAnswers": stats["correct"],
            })

        topic_breakdown.sort(key=lambda x: x["percentage"], reverse=True)

        return {
            "averagePercentage": avg_pct,
            "totalCompleted": total_reports,
            "totalAttempted": total_reports,
            "passedCount": passed_count,
            "failedCount": failed_count,
            "bestScore": best_pct,
            "latestScore": latest_pct,
            "improvementTrend": trend,
            "topicBreakdown": topic_breakdown,
        }

    @classmethod
    def generate_individual_excel_report(cls, report: dict[str, Any]) -> bytes:
        """Constructs a verified 4-sheet individual assessment workbook (.xlsx).

        Sheet 1: Student Summary
        Sheet 2: Question-wise Analysis
        Sheet 3: Performance Analysis
        Sheet 4: Proctoring Summary
        """
        wb = Workbook()

        # Styles
        primary_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")  # Navy
        header_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")   # Slate 100
        pass_fill = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")     # Light green
        fail_fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")     # Light red

        title_font = Font(name="Calibri", size=14, bold=True, color="FFFFFF")
        section_font = Font(name="Calibri", size=12, bold=True, color="1E3A8A")
        header_font = Font(name="Calibri", size=10, bold=True, color="334155")
        regular_font = Font(name="Calibri", size=10, color="0F172A")
        bold_font = Font(name="Calibri", size=10, bold=True, color="0F172A")
        pass_font = Font(name="Calibri", size=10, bold=True, color="166534")
        fail_font = Font(name="Calibri", size=10, bold=True, color="991B1B")

        center_align = Alignment(horizontal="center", vertical="center")
        left_align = Alignment(horizontal="left", vertical="center")
        right_align = Alignment(horizontal="right", vertical="center")
        wrap_align = Alignment(horizontal="left", vertical="center", wrap_text=True)

        thin_border = Border(
            left=Side(style="thin", color="E2E8F0"),
            right=Side(style="thin", color="E2E8F0"),
            top=Side(style="thin", color="E2E8F0"),
            bottom=Side(style="thin", color="E2E8F0"),
        )

        def style_range(ws, min_col, min_row, max_col, max_row, font=None, fill=None, alignment=None, border=None):
            for row in ws.iter_rows(min_row=min_row, min_col=min_col, max_row=max_row, max_col=max_col):
                for cell in row:
                    if font:
                        cell.font = font
                    if fill:
                        cell.fill = fill
                    if alignment:
                        cell.alignment = alignment
                    if border:
                        cell.border = border

        # -------------------------------------------------------------
        # SHEET 1: STUDENT SUMMARY
        # -------------------------------------------------------------
        ws1 = wb.active
        ws1.title = "Student Summary"
        ws1.views.sheetView[0].showGridLines = True

        ws1.merge_cells("A1:D1")
        top_cell = ws1["A1"]
        top_cell.value = "WINNERS CREEK LMS — INDIVIDUAL ASSESSMENT REPORT"
        top_cell.font = title_font
        top_cell.fill = primary_fill
        top_cell.alignment = center_align
        ws1.row_dimensions[1].height = 36

        # Summary details table
        summary_items = [
            ("Student Name", report.get("studentName")),
            ("Roll Number", report.get("rollNumber") or "N/A"),
            ("Email", report.get("email") or "N/A"),
            ("Branch / Department", report.get("branch") or "N/A"),
            ("Semester", report.get("semester") or "N/A"),
            ("Batch Name", report.get("batchName") or "N/A"),
            ("Assessment Title", report.get("assessmentTitle")),
            ("Assessment ID", str(report.get("quizId"))),
            ("Attempt ID", str(report.get("attemptId"))),
            ("Attempt Number", str(report.get("attemptNumber", 1))),
            ("Trainer Name", report.get("trainerName") or "N/A"),
            ("Assessment Date", report.get("assessmentDate", "")[:10] if report.get("assessmentDate") else "N/A"),
            ("Started At", report.get("startedAt", "")[:19] if report.get("startedAt") else "N/A"),
            ("Submitted At", report.get("submittedAt", "")[:19] if report.get("submittedAt") else "N/A"),
            ("Time Taken", f"{int(report.get('timeTakenSeconds', 0)) // 60}m {int(report.get('timeTakenSeconds', 0)) % 60}s"),
            ("Total Questions", report.get("totalQuestions", 0)),
            ("Attempted Questions", report.get("attemptedQuestions", 0)),
            ("Unattempted Questions", report.get("unattemptedQuestions", 0)),
            ("Correct Answers", report.get("correctAnswers", 0)),
            ("Incorrect Answers", report.get("incorrectAnswers", 0)),
            ("Marks Obtained", f"{report.get('marksObtained', 0):.2f}"),
            ("Maximum Marks", f"{report.get('maxMarks', 100):.2f}"),
            ("Percentage", f"{report.get('percentage', 0):.2f}%"),
            ("Result Status", report.get("resultStatus", "FAILED")),
            ("Total Warnings", report.get("warningCount", 0)),
        ]

        curr_row = 3
        ws1.cell(row=curr_row, column=1, value="CANDIDATE & PERFORMANCE SNAPSHOT").font = section_font
        curr_row += 1

        for label, val in summary_items:
            ws1.cell(row=curr_row, column=1, value=label).font = header_font
            ws1.cell(row=curr_row, column=1).fill = header_fill
            ws1.cell(row=curr_row, column=1).border = thin_border
            ws1.cell(row=curr_row, column=1).alignment = left_align

            ws1.merge_cells(start_row=curr_row, start_column=2, end_row=curr_row, end_column=4)
            val_cell = ws1.cell(row=curr_row, column=2, value=str(val))
            val_cell.font = bold_font if label in ("Result Status", "Marks Obtained", "Percentage") else regular_font
            val_cell.alignment = left_align
            style_range(ws1, min_col=2, min_row=curr_row, max_col=4, max_row=curr_row, border=thin_border)

            if label == "Result Status":
                val_cell.fill = pass_fill if val == "PASSED" else fail_fill
                val_cell.font = pass_font if val == "PASSED" else fail_font

            ws1.row_dimensions[curr_row].height = 20
            curr_row += 1

        ws1.column_dimensions["A"].width = 28
        ws1.column_dimensions["B"].width = 24
        ws1.column_dimensions["C"].width = 24
        ws1.column_dimensions["D"].width = 24

        # -------------------------------------------------------------
        # SHEET 2: QUESTION-WISE ANALYSIS
        # -------------------------------------------------------------
        ws2 = wb.create_sheet(title="Question-wise Analysis")
        ws2.views.sheetView[0].showGridLines = True
        ws2.views.sheetView[0].state = "frozen"
        ws2.views.sheetView[0].ySplit = 1

        q_headers = [
            "Q#", "Question Text", "Topic / Subject", "Difficulty",
            "Marks Awarded", "Max Marks", "Student Answer", "Correct Answer", "Status"
        ]
        ws2.append(q_headers)
        for col_idx in range(1, len(q_headers) + 1):
            c = ws2.cell(row=1, column=col_idx)
            c.font = header_font
            c.fill = header_fill
            c.alignment = center_align
            c.border = thin_border
        ws2.row_dimensions[1].height = 26

        q_summary = report.get("questionSummary") or []
        for q in q_summary:
            status = q.get("status", "Unattempted")
            row_data = [
                q.get("question_number", ""),
                q.get("question_text", ""),
                q.get("topic", "General"),
                q.get("difficulty", "Medium"),
                f"{float(q.get('marks_awarded', 0)):.2f}",
                f"{float(q.get('max_marks', 1)):.2f}",
                str(q.get("student_answer", "Unattempted")),
                str(q.get("correct_answer", "N/A")),
                status,
            ]
            ws2.append(row_data)
            r_idx = ws2.max_row
            ws2.row_dimensions[r_idx].height = 22

            for c_idx in range(1, len(row_data) + 1):
                cell = ws2.cell(row=r_idx, column=c_idx)
                cell.border = thin_border
                cell.font = regular_font
                if c_idx in (1, 4, 5, 6, 9):
                    cell.alignment = center_align
                else:
                    cell.alignment = left_align

                if c_idx == 9:
                    if status == "Correct":
                        cell.fill = pass_fill
                        cell.font = pass_font
                    elif status == "Incorrect":
                        cell.fill = fail_fill
                        cell.font = fail_font

        ws2.column_dimensions["A"].width = 8
        ws2.column_dimensions["B"].width = 45
        ws2.column_dimensions["C"].width = 20
        ws2.column_dimensions["D"].width = 14
        ws2.column_dimensions["E"].width = 15
        ws2.column_dimensions["F"].width = 12
        ws2.column_dimensions["G"].width = 28
        ws2.column_dimensions["H"].width = 28
        ws2.column_dimensions["I"].width = 16

        # -------------------------------------------------------------
        # SHEET 3: PERFORMANCE ANALYSIS
        # -------------------------------------------------------------
        ws3 = wb.create_sheet(title="Performance Analysis")
        ws3.views.sheetView[0].showGridLines = True

        ws3.cell(row=1, column=1, value="TOPIC PERFORMANCE BREAKDOWN").font = section_font
        t_headers = ["Topic", "Total Questions", "Correct Answers", "Score Obtained", "Max Score", "Percentage"]
        ws3.append(t_headers)
        for col_idx in range(1, len(t_headers) + 1):
            c = ws3.cell(row=2, column=col_idx)
            c.font = header_font
            c.fill = header_fill
            c.alignment = center_align
            c.border = thin_border
        ws3.row_dimensions[2].height = 24

        topic_perf = report.get("topicPerformance") or []
        for t in topic_perf:
            ws3.append([
                t.get("topic", "General"),
                t.get("total_questions", 0),
                t.get("correct_answers", 0),
                f"{float(t.get('score', 0)):.2f}",
                f"{float(t.get('max_score', 1)):.2f}",
                f"{float(t.get('percentage', 0)):.2f}%",
            ])
            r_idx = ws3.max_row
            ws3.row_dimensions[r_idx].height = 20
            for c_idx in range(1, 7):
                cell = ws3.cell(row=r_idx, column=c_idx)
                cell.border = thin_border
                cell.font = regular_font
                cell.alignment = left_align if c_idx == 1 else center_align

        # Motivational Feedback Section
        fb_row = ws3.max_row + 3
        ws3.cell(row=fb_row, column=1, value="MOTIVATIONAL FEEDBACK & RECOMMENDATIONS").font = section_font
        fb = report.get("feedback") or {}

        feedback_items = [
            ("Performance Classification", fb.get("category") or report.get("resultStatus")),
            ("Motivational Message", fb.get("motivational_message") or "Good effort. Review incorrect items to master competencies."),
            ("Strengths Identified", ", ".join(fb.get("strengths", [])) if fb.get("strengths") else "Solid conceptual foundation"),
            ("Areas For Improvement", ", ".join(fb.get("areas_for_improvement", [])) if fb.get("areas_for_improvement") else "Time optimization"),
        ]

        fb_curr = fb_row + 1
        for label, val in feedback_items:
            ws3.cell(row=fb_curr, column=1, value=label).font = header_font
            ws3.cell(row=fb_curr, column=1).fill = header_fill
            ws3.cell(row=fb_curr, column=1).border = thin_border

            ws3.merge_cells(start_row=fb_curr, start_column=2, end_row=fb_curr, end_column=6)
            c_val = ws3.cell(row=fb_curr, column=2, value=str(val))
            c_val.font = regular_font
            c_val.alignment = left_align
            style_range(ws3, min_col=2, min_row=fb_curr, max_col=6, max_row=fb_curr, border=thin_border)
            ws3.row_dimensions[fb_curr].height = 22
            fb_curr += 1

        ws3.column_dimensions["A"].width = 28
        ws3.column_dimensions["B"].width = 18
        ws3.column_dimensions["C"].width = 18
        ws3.column_dimensions["D"].width = 16
        ws3.column_dimensions["E"].width = 16
        ws3.column_dimensions["F"].width = 16

        # -------------------------------------------------------------
        # SHEET 4: PROCTORING SUMMARY
        # -------------------------------------------------------------
        ws4 = wb.create_sheet(title="Proctoring Summary")
        ws4.views.sheetView[0].showGridLines = True

        ws4.cell(row=1, column=1, value="PROCTORING & INTEGRITY AUDIT").font = section_font
        proc = report.get("proctoringSummary") or {}
        tot_warnings = report.get("warningCount", 0)

        proc_meta = [
            ("Total Proctoring Warnings", tot_warnings),
            ("Proctoring Integrity Status", "CLEAN" if tot_warnings == 0 else ("FLAGGED" if tot_warnings <= 3 else "HIGH RISK")),
            ("Submission Source", proc.get("submission_source") or "ONLINE"),
            ("Submission Reason", proc.get("submission_reason") or "STUDENT_MANUAL_SUBMIT"),
        ]

        curr_p = 2
        for lbl, val in proc_meta:
            ws4.cell(row=curr_p, column=1, value=lbl).font = header_font
            ws4.cell(row=curr_p, column=1).fill = header_fill
            ws4.cell(row=curr_p, column=1).border = thin_border

            ws4.merge_cells(start_row=curr_p, start_column=2, end_row=curr_p, end_column=4)
            c_val = ws4.cell(row=curr_p, column=2, value=str(val))
            c_val.font = bold_font
            c_val.alignment = left_align
            style_range(ws4, min_col=2, min_row=curr_p, max_col=4, max_row=curr_p, border=thin_border)
            ws4.row_dimensions[curr_p].height = 20
            curr_p += 1

        events_row = curr_p + 2
        ws4.cell(row=events_row, column=1, value="PROCTORING EVENT LOG").font = section_font
        p_headers = ["Event #", "Timestamp / Elapsed", "Event Type", "Event Details"]
        ws4.append(p_headers)
        ws4.row_dimensions[events_row + 1].height = 24
        for col_idx in range(1, len(p_headers) + 1):
            c = ws4.cell(row=events_row + 1, column=col_idx)
            c.font = header_font
            c.fill = header_fill
            c.alignment = center_align
            c.border = thin_border

        events = proc.get("events") or []
        if not events:
            ws4.append(["-", "N/A", "NO_INCIDENTS_RECORDED", "The candidate completed the assessment without proctoring violations."])
            r_idx = ws4.max_row
            ws4.row_dimensions[r_idx].height = 20
            for col_idx in range(1, 5):
                cell = ws4.cell(row=r_idx, column=col_idx)
                cell.border = thin_border
                cell.font = regular_font
                cell.alignment = left_align if col_idx == 4 else center_align
        else:
            for idx, ev in enumerate(events, start=1):
                ts = ev.get("timestamp") or ev.get("client_timestamp") or f"+{ev.get('elapsed_seconds', 0)}s"
                ev_type = ev.get("type") or ev.get("event_type") or "WARNING"
                detail = ev.get("detail") or ev.get("message") or json.dumps(ev.get("metadata", {}))
                ws4.append([idx, str(ts), str(ev_type), str(detail)])
                r_idx = ws4.max_row
                ws4.row_dimensions[r_idx].height = 20
                for col_idx in range(1, 5):
                    cell = ws4.cell(row=r_idx, column=col_idx)
                    cell.border = thin_border
                    cell.font = regular_font
                    cell.alignment = left_align if col_idx in (3, 4) else center_align

        ws4.column_dimensions["A"].width = 12
        ws4.column_dimensions["B"].width = 24
        ws4.column_dimensions["C"].width = 28
        ws4.column_dimensions["D"].width = 45

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        return buf.getvalue()

    @classmethod
    async def build_bulk_zip_reports(
        cls,
        quiz_id: uuid.UUID | str,
        ctx: ScopeContext,
        batch_id: uuid.UUID | str | None = None,
    ) -> tuple[bytes, str]:
        """Generates a zip archive containing individual .xlsx reports for each eligible student attempt."""
        q_uuid = _safe_uuid(quiz_id)
        if not q_uuid:
            raise NotFound("Assessment not found.")

        b_uuid = _safe_uuid(batch_id) if batch_id else None

        async with get_pg_connection() as conn:
            quiz = await conn.fetchrow(
                "SELECT id, title, creator_trainer_id, institution_id, batch_id FROM quizzes WHERE id = $1",
                q_uuid,
            )
            if not quiz:
                raise NotFound("Assessment not found.")

            # Trainer scoping check
            if ctx.role == Role.TRAINER:
                t_uuid = _safe_uuid(ctx.user_id)
                trainer_assigned = await conn.fetchval(
                    """
                    SELECT 1 FROM quizzes q
                    WHERE q.id = $1 AND (
                        q.creator_trainer_id = $2 OR q.institution_id = $3 OR q.batch_id IS NOT NULL
                    )
                    LIMIT 1
                    """,
                    q_uuid,
                    t_uuid,
                    _safe_uuid(ctx.college_id),
                )
                if not trainer_assigned:
                    raise ScopeForbidden("You are not authorized to export reports for this assessment.")

            # Fetch attempts for this quiz
            query = """
                SELECT a.id as attempt_id
                FROM quiz_attempts a
                WHERE a.quiz_id = $1 AND a.status = 'completed'
            """
            params: list[Any] = [q_uuid]
            if b_uuid:
                params.append(b_uuid)
                query += f" AND a.batch_id = ${len(params)}"

            query += " ORDER BY a.completed_at DESC"
            attempts = await conn.fetch(query, *params)

        if not attempts:
            raise ValidationError("No completed attempts found for this assessment.")

        quiz_title = quiz["title"]
        sanitized_title = _sanitize_filename(quiz_title)

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for att in attempts:
                att_id = att["attempt_id"]
                # Fetch or generate report snapshot
                report = await cls.generate_and_persist_report(att_id)
                full_report = await cls.get_report_by_id(report["id"])

                # Determine filename: {rollNumber}_{Assessment_Title}_Report.xlsx
                roll = full_report.get("rollNumber") or ""
                s_name = full_report.get("studentName") or "Student"
                prefix = _sanitize_filename(roll) if roll.strip() else _sanitize_filename(s_name)
                report_filename = f"{prefix}_{sanitized_title}_Report.xlsx"

                excel_bytes = cls.generate_individual_excel_report(full_report)
                zf.writestr(report_filename, excel_bytes)

        zip_buffer.seek(0)
        archive_name = f"{sanitized_title}_Reports.zip"
        return zip_buffer.getvalue(), archive_name
