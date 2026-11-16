"""
Results + analytics computed on the fly from in-memory session data. Nothing
here is cached to disk; every call recomputes from `store`.
"""
from app.memory.store import store


def build_results(quiz_id: str) -> dict:
    quiz = store.get_quiz(quiz_id)
    sessions = [s for s in store.list_sessions_for_quiz(quiz_id) if s.result]
    ranked = sorted(sessions, key=lambda s: s.result["total_marks"], reverse=True)

    rows = []
    for rank, s in enumerate(ranked, start=1):
        rows.append({
            "rank": rank,
            "roll_number": s.roll_number,
            "name": s.name,
            "correct": s.result["correct"],
            "wrong": s.result["wrong"],
            "skipped": s.result["skipped"],
            "marks": s.result["total_marks"],
            "max_marks": s.result["max_marks"],
            "percentage": s.result["percentage"],
            "passed": s.result["passed"],
            "warnings": s.result["warnings"],
        })

    return {
        "quiz_name": quiz.name if quiz else "",
        "total_participants": len(sessions),
        "results": rows,
    }


def build_analytics(quiz_id: str) -> dict:
    quiz = store.get_quiz(quiz_id)
    sessions = [s for s in store.list_sessions_for_quiz(quiz_id) if s.result]

    if not sessions:
        return {"question_analysis": [], "topper_list": [], "average_score": 0,
                "average_percentage": 0, "difficulty_analysis": [], "pass_fail": {"passed": 0, "failed": 0},
                "highest_score": 0, "lowest_score": 0, "hardest_question": None, "easiest_question": None}

    # ---- question-wise correct/wrong % ----
    question_stats = {}
    for s in sessions:
        for pq in s.result["per_question"]:
            qid = pq["question_id"]
            stat = question_stats.setdefault(qid, {"correct": 0, "wrong": 0, "skipped": 0, "total": 0})
            stat[pq["outcome"]] += 1
            stat["total"] += 1

    question_analysis = []
    difficulty_analysis = []
    for qid, stat in question_stats.items():
        correct_pct = round(stat["correct"] / stat["total"] * 100, 1) if stat["total"] else 0
        wrong_pct = round(stat["wrong"] / stat["total"] * 100, 1) if stat["total"] else 0
        skipped_pct = round(stat["skipped"] / stat["total"] * 100, 1) if stat["total"] else 0
        question_analysis.append({
            "question_id": qid, "correct_pct": correct_pct, "wrong_pct": wrong_pct, "skipped_pct": skipped_pct,
        })
        # difficulty heuristic: lower correct% = harder
        if correct_pct >= 70:
            difficulty = "easy"
        elif correct_pct >= 40:
            difficulty = "medium"
        else:
            difficulty = "hard"
        difficulty_analysis.append({"question_id": qid, "difficulty": difficulty, "correct_pct": correct_pct})

    # ---- topper list (top 10) ----
    ranked = sorted(sessions, key=lambda s: s.result["total_marks"], reverse=True)[:10]
    topper_list = [
        {"rank": i + 1, "name": s.name, "roll_number": s.roll_number, "marks": s.result["total_marks"]}
        for i, s in enumerate(ranked)
    ]

    # ---- averages ----
    avg_score = round(sum(s.result["total_marks"] for s in sessions) / len(sessions), 2)
    avg_percentage = round(sum(s.result["percentage"] for s in sessions) / len(sessions), 2)

    passed = len([s for s in sessions if s.result["passed"]])
    failed = len(sessions) - passed

    highest_score = max(s.result["total_marks"] for s in sessions)
    lowest_score = min(s.result["total_marks"] for s in sessions)

    hardest_question = min(difficulty_analysis, key=lambda d: d["correct_pct"]) if difficulty_analysis else None
    easiest_question = max(difficulty_analysis, key=lambda d: d["correct_pct"]) if difficulty_analysis else None

    return {
        "question_analysis": question_analysis,
        "topper_list": topper_list,
        "average_score": avg_score,
        "average_percentage": avg_percentage,
        "difficulty_analysis": difficulty_analysis,
        "pass_fail": {"passed": passed, "failed": failed},
        "highest_score": highest_score,
        "lowest_score": lowest_score,
        "hardest_question": hardest_question,
        "easiest_question": easiest_question,
    }
