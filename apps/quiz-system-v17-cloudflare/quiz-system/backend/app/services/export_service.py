"""
Turns in-memory quiz results into files an admin can download: single-format
exports (Excel / CSV / PDF of just the results table) and the full report
bundle (Quiz_Report_<code>.zip) that's meant to be this app's headline
feature -- one click, everything a teacher needs, nothing left behind.

Every file this module writes lands under
`temp/session_<quiz_id>/exports/` (see app/utils/session_storage.py) so it
can be deleted as a single unit alongside the quiz's RAM data -- either by
the admin's "Delete Session" action or automatically once
`settings.report_retention_minutes` elapses (see scheduler/cleanup_scheduler.py).
Nothing here is a database; these are on-demand, throwaway report files.
"""
import os
import zipfile
from datetime import datetime

import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet

from app.services.analytics_service import build_results, build_analytics
from app.memory.store import store
from app.utils.session_storage import session_export_dir


def _safe_name(name: str) -> str:
    return "".join(c for c in name if c.isalnum() or c in (" ", "_", "-")).strip() or "quiz"


def _rows_dataframe(quiz_id: str) -> tuple[pd.DataFrame, str]:
    data = build_results(quiz_id)
    df = pd.DataFrame(data["results"])
    return df, data["quiz_name"]


# ---------------------------------------------------- single-format export -

def export_results(quiz_id: str, fmt: str) -> str:
    df, quiz_name = _rows_dataframe(quiz_id)
    safe_name = _safe_name(quiz_name)
    out_dir = session_export_dir(quiz_id)

    if fmt == "csv":
        path = os.path.join(out_dir, f"{safe_name}_results.csv")
        df.to_csv(path, index=False)
        return path

    if fmt == "excel":
        path = os.path.join(out_dir, f"{safe_name}_results.xlsx")
        with pd.ExcelWriter(path, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Results")
        return path

    if fmt == "pdf":
        path = os.path.join(out_dir, f"{safe_name}_results.pdf")
        doc = SimpleDocTemplate(path, pagesize=A4)
        styles = getSampleStyleSheet()
        elements = [Paragraph(f"Results: {quiz_name}", styles["Title"]), Spacer(1, 12)]
        elements.append(_table_from_df(df))
        doc.build(elements)
        return path

    raise ValueError(f"Unsupported export format: {fmt}")


def _table_from_df(df: pd.DataFrame) -> Table:
    table_data = [list(df.columns)] + df.astype(str).values.tolist() if not df.empty else [["No submissions"]]
    table = Table(table_data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
    ]))
    return table


# ---------------------------------------------------------- full ZIP bundle -

def generate_full_report_zip(quiz_id: str, on_progress=None) -> str:
    """Builds Quiz_Report_<code>.zip containing:
      Result.xlsx, Result.csv, QuestionAnalysis.xlsx, StudentReport.xlsx,
      Leaderboard.pdf, Summary.pdf, Logs.txt
    Returns the path to the ZIP file (also written under
    temp/session_<quiz_id>/exports/).

    `on_progress`, if given, is called with an int 0-100 after each step --
    this is what powers the admin-facing progress bar when this function
    runs inside a background thread (see admin_routes.py's
    /export/bundle/start + memory/report_jobs.py). For large quizzes
    (hundreds of students x dozens of questions) this can take several
    seconds, which is exactly why it's not run inline in a request handler.
    """
    def report(pct):
        if on_progress:
            on_progress(pct)

    quiz = store.get_quiz(quiz_id)
    if not quiz:
        raise ValueError("Quiz not found")

    report(5)
    results_data = build_results(quiz_id)
    analytics = build_analytics(quiz_id)
    sessions = [s for s in store.list_sessions_for_quiz(quiz_id) if s.result]
    questions = {q.id: q for q in store.get_all_questions_decrypted(quiz_id)}
    logs = store.logs_for_quiz(quiz_id)
    report(15)

    out_dir = session_export_dir(quiz_id)
    safe_name = _safe_name(quiz.name)
    zip_path = os.path.join(out_dir, f"Quiz_Report_{safe_name}_{quiz.code}.zip")

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("Result.xlsx", _build_result_xlsx_bytes(results_data))
        zf.writestr("Result.csv", pd.DataFrame(results_data["results"]).to_csv(index=False))
        report(30)

        zf.writestr("QuestionAnalysis.xlsx", _build_question_analysis_xlsx_bytes(analytics, questions))
        report(45)

        # The big one for a large quiz -- one row per student per question.
        zf.writestr("StudentReport.xlsx", _build_student_report_xlsx_bytes(sessions, questions))
        report(75)

        zf.writestr("Leaderboard.pdf", _build_leaderboard_pdf_bytes(quiz, analytics))
        report(85)

        zf.writestr("Summary.pdf", _build_summary_pdf_bytes(quiz, analytics, results_data, questions))
        report(95)

        zf.writestr("Logs.txt", _build_logs_txt(quiz, logs))
        report(100)

    return zip_path


def _xlsx_bytes(df: pd.DataFrame, sheet_name: str) -> bytes:
    import io
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name=sheet_name[:31])
    return buf.getvalue()


def _build_result_xlsx_bytes(results_data: dict) -> bytes:
    df = pd.DataFrame(results_data["results"])
    return _xlsx_bytes(df, "Results")


def _build_question_analysis_xlsx_bytes(analytics: dict, questions: dict) -> bytes:
    rows = []
    difficulty_by_id = {d["question_id"]: d["difficulty"] for d in analytics["difficulty_analysis"]}
    for i, qa in enumerate(analytics["question_analysis"], start=1):
        q = questions.get(qa["question_id"])
        rows.append({
            "Q#": i,
            "Question": (q.question[:120] if q else qa["question_id"]),
            "Marks": q.marks if q else "",
            "Negative": q.negative if q else "",
            "EEDI Index": q.eedi_index if (q and q.eedi_index is not None) else "",
            "EEDI Term": q.eedi_term if (q and q.eedi_term) else "",
            "Correct %": qa["correct_pct"],
            "Wrong %": qa["wrong_pct"],
            "Skipped %": qa["skipped_pct"],
            "Difficulty": difficulty_by_id.get(qa["question_id"], ""),
        })
    return _xlsx_bytes(pd.DataFrame(rows), "Question Analysis")


def _build_student_report_xlsx_bytes(sessions: list, questions: dict) -> bytes:
    rows = []
    for s in sessions:
        pq_by_id = {pq["question_id"]: pq for pq in s.result.get("per_question", [])}
        for idx, qid in enumerate(s.question_order, start=1):
            q = questions.get(qid)
            answer = s.answers.get(qid, {})
            pq = pq_by_id.get(qid, {})
            if q and q.question_type == "numerical":
                selected_text = answer.get("numerical_answer") or ""
                correct_text = q.correct[0] if q.correct else ""
            else:
                selected_keys = answer.get("selected_options") or []
                selected_text = ", ".join(q.options.get(k, k) for k in selected_keys) if q else ", ".join(selected_keys)
                correct_text = ", ".join(q.options.get(k, k) for k in q.correct) if q else ""
            rows.append({
                "Roll Number": s.roll_number,
                "Name": s.name,
                "Q#": idx,
                "Question": (q.question[:120] if q else qid),
                "Selected Answer": selected_text,
                "Correct Answer": correct_text,
                "Outcome": pq.get("outcome", "skipped"),
                "Marks Awarded": pq.get("marks_awarded", 0),
                "Max Marks": pq.get("max_marks", q.marks if q else ""),
                "Time Spent (s)": round(answer.get("time_spent_seconds", 0), 1),
            })
    return _xlsx_bytes(pd.DataFrame(rows), "Student Report")


def _build_leaderboard_pdf_bytes(quiz, analytics: dict) -> bytes:
    import io
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4)
    styles = getSampleStyleSheet()
    elements = [Paragraph(f"Leaderboard: {quiz.name}", styles["Title"]), Spacer(1, 12)]

    topper_list = analytics.get("topper_list", [])
    if topper_list:
        table_data = [["Rank", "Name", "Roll Number", "Marks"]] + [
            [t["rank"], t["name"], t["roll_number"], t["marks"]] for t in topper_list
        ]
        elements.append(_table_from_df(pd.DataFrame(table_data[1:], columns=table_data[0])))
    else:
        elements.append(Paragraph("No submissions yet.", styles["Normal"]))

    doc.build(elements)
    return buf.getvalue()


def _build_summary_pdf_bytes(quiz, analytics: dict, results_data: dict, questions: dict) -> bytes:
    import io
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4)
    styles = getSampleStyleSheet()
    elements = [Paragraph(f"Summary: {quiz.name} ({quiz.code})", styles["Title"]), Spacer(1, 12)]

    hardest = analytics.get("hardest_question")
    easiest = analytics.get("easiest_question")
    hardest_text = questions[hardest["question_id"]].question[:100] if hardest and hardest["question_id"] in questions else "—"
    easiest_text = questions[easiest["question_id"]].question[:100] if easiest and easiest["question_id"] in questions else "—"

    summary_rows = [
        ["Total Participants", results_data["total_participants"]],
        ["Average Score", analytics["average_score"]],
        ["Average Percentage", f"{analytics['average_percentage']}%"],
        ["Highest Score", analytics["highest_score"]],
        ["Lowest Score", analytics["lowest_score"]],
        ["Passed", analytics["pass_fail"]["passed"]],
        ["Failed", analytics["pass_fail"]["failed"]],
        ["Hardest Question", hardest_text],
        ["Easiest Question", easiest_text],
        ["Generated At", datetime.now().strftime("%Y-%m-%d %H:%M:%S")],
    ]
    elements.append(_table_from_df(pd.DataFrame(summary_rows, columns=["Metric", "Value"])))
    doc.build(elements)
    return buf.getvalue()


def _build_logs_txt(quiz, logs: list) -> str:
    lines = [f"Audit Log: {quiz.name} ({quiz.code})", "=" * 60]
    for entry in logs:
        ts = datetime.fromtimestamp(entry.timestamp).strftime("%Y-%m-%d %H:%M:%S")
        lines.append(f"{ts} | {entry.actor:<20} | {entry.action:<20} | {entry.detail}")
    if not logs:
        lines.append("(no logged events)")
    return "\n".join(lines)
