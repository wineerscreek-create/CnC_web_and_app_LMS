# Quiz Timer & Per-Question Fast-Paced Workflow Implementation Report

**Project:** Winners Creek LMS (SkillSharp)  
**Production Frontend:** https://cnc-lms.vercel.app/  
**Production Backend:** https://cnc-backend-qzmb.onrender.com/  
**Repository:** https://github.com/wineerscreek-create/CnC_web_and_app_LMS.git  
**Branch:** `main`  
**Date:** November 16, 2026  

---

## 1. Executive Summary

This report documents the architectural diagnosis, root-cause fixes, security safeguards, and implementation details for the **Trainer-Controlled Automatic Question Advancement, Authoritative Server Timing, and Mobile Assessment Flow** in Winners Creek LMS.

The system enables high-intensity, automated assessment workflows where trainers define per-question time limits (e.g., 10 seconds total: 8 seconds answering + 2 seconds instant feedback), with server-authoritative timestamps, automated option locking, server-authoritative correct answer reveal, seamless automatic question skipping, and a clutter-free mobile UI without misleading navigation buttons.

---

## 2. Root Cause Analysis & Data Flow Diagnosis

### 2.1 The Broken Data Flow
During production testing, trainer portal settings were not taking effect in actual student assessments:
```
Trainer UI Setting (auto_advance, question_duration, etc.)
  │
  ▼
[DB: quizzes.settings] (Saved correctly in PostgreSQL JSONB)
  │
  ▼
[API: GET /student/assessments/{quiz_id}]  <-- ROOT CAUSE BREAKPOINT
  │  (router: student.py lines 3173-3187 returned dict omitting 'settings'!)
  ▼
[Student UI: quiz?.settings === undefined]
  │  (enableTimedQuestions evaluated to false in all student sessions)
  ▼
[Student Session forced to untimed manual mode]
```

### 2.2 Fix Implementation
1. **Endpoint Restoration (`apps/api/app/routers/student.py`)**:
   Updated `assessment_detail` (`GET /student/assessments/{quiz_id}`) to return:
   - `"settings": quiz_data.get("settings") or {}`
   - `"timingState": timing_info.get("timingState")`
   - `"answers": timing_info.get("answers")`
   - `"hasStarted": timing_info.get("hasStarted", False)`
   - `"status": timing_info.get("status")`
2. **Attempt Initialization Route (`POST /student/assessments/{quiz_id}/start`)**:
   Calls `QuizRepository.start_or_resume_quiz_attempt` to establish the authoritative start timestamp (`created_at = NOW()`) and returns the initial `timingState`.

---

## 3. Server-Authoritative Timing Architecture

### 3.1 Timing State Machine
Rather than relying on client `setInterval` loops that drift or reset on page refresh, timing is strictly calculated relative to PostgreSQL server time:

$$\text{elapsed\_seconds} = \max(0, \text{now\_server} - \text{started\_at})$$
$$\text{current\_question\_index} = \min(N - 1, \lfloor \text{elapsed\_seconds} / \text{question\_duration} \rfloor)$$
$$\text{time\_in\_current\_q} = \text{elapsed\_seconds} \pmod{\text{question\_duration}}$$
$$\text{phase} = \begin{cases} \text{answering} & \text{if } \text{time\_in\_current\_q} < \text{answering\_duration} \\ \text{revealing} & \text{otherwise} \end{cases}$$

### 3.2 High-Precision Wall-Clock Client Sync
In `apps/web/src/app/student/assessments/[quizId]/page.tsx`:
- Clock offset is measured on attempt start / load:
  `serverTimeOffset = new Date(timingState.server_time).getTime() - Date.now()`
  `serverStartTime = new Date(timingState.started_at).getTime()`
- A 250ms tick calculates exact elapsed time:
  - At $\text{answering\_duration}$ (e.g. 8s): input options lock immediately, question phase transitions to `'revealing'`, and `/reveal` endpoint is invoked.
  - At $\text{question\_duration}$ (e.g. 10s): `currentIndex` automatically increments to the next question with no button click required.
  - At total exam duration ($N \times \text{question\_duration}$): `submitAssessment('timed_completed')` is triggered automatically.
- Page refresh restores the exact active question, elapsed time, phase, and saved answers without resetting the timer.

### 3.3 Security Guards (`assignment_quiz_repo.py`)
- **Early Reveal Blocker**: `get_question_reveal` calculates `elapsed_seconds` against question start. If `elapsed_seconds < answering_deadline`, raises `403 ScopeForbidden("Question answering phase is still active. Reveal not yet permitted.")`.
- **Answer Lockout**: `save_student_draft_answer` checks `elapsed_seconds > answering_deadline`. If answering time has expired, raises `400 BusinessRuleViolation("Answering period for this question has expired and answers are locked")`.
- **Past Question Lockout**: If `allow_previous` is `False`, submissions for `target_idx < current_active_idx` are rejected.
- **Modification Lockout**: If `allow_modification` is `False`, attempting to alter an existing answer raises `BusinessRuleViolation`.

---

## 4. Mobile UX & Streamlined Navigation

When `enable_timed_questions` and `auto_advance` are active with `allow_previous = False`:
- **Misleading Buttons Removed**: The bottom sticky bar does NOT render deceptive "Prev" or "Next" buttons that confuse candidates during automated pacing.
- **Clean Status Display**:
  - Left: Active question number (`Question X of Y`) with a `[🔒 Navigation Locked]` indicator.
  - Center: Real-time phase badge (`Answering: 8s` / `Reveal: 2s`) with an animated pulsing indicator.
  - Right: Pacing notice (`Locks on timeout` / `Advancing to next...` / `Final submission...`).
- When standard or manual navigation is permitted, responsive compact buttons (`Prev`, `Next`, `Save`, `Review`) render without horizontal scrolling or wrapping.

---

## 2. Three-Phase State Machine Architecture

Every question in a timed assessment executes through a deterministic three-phase cycle:

```
[ Question N Begins ]
        │
        ▼
┌────────────────────────────────────────────────────────┐
│ Phase 1: Answering Duration (e.g., 8 seconds)         │
│ • Countdown timer active (visual progress bar)         │
│ • Candidate selects option or types numerical answer   │
│ • Answers autosaved locally and synced to backend      │
│ • Inputs fully enabled                                 │
└────────────────────────────────────────────────────────┘
        │ (Timer reaches 0)
        ▼
┌────────────────────────────────────────────────────────┐
│ Phase 2: Answer Reveal Duration (e.g., 2 seconds)     │
│ • Inputs immediately LOCKED                            │
│ • Backend queried: POST /questions/{id}/reveal         │
│ • Correct option highlighted in vibrant EMERALD/GREEN  │
│ • Incorrect selection highlighted in RED with verdict  │
│ • Explanation displayed if available                   │
└────────────────────────────────────────────────────────┘
        │ (Timer reaches 0)
        ▼
┌────────────────────────────────────────────────────────┐
│ Phase 3: Advancement Decision                          │
│ • If Question N < Last: Auto-advance to Question N + 1 │
│ • If Question N == Last: Auto-submit assessment        │
└────────────────────────────────────────────────────────┘
```

---

## 3. Trainer Configuration & Validation Safeguards

### 3.1 Trainer Assessment Creation Dialog (`trainer/assessments/page.tsx`)
Trainers can configure the following per-quiz parameters:
- `enable_timed_questions`: Toggle enabling the automated timer engine.
- `question_duration`: Total time per question in seconds (e.g., 10s).
- `answer_reveal_duration`: Duration of the reveal phase (e.g., 2s).
- `auto_advance`: Boolean indicating whether to automatically proceed when the reveal expires.
- `allow_previous`: Boolean controlling whether the candidate may return to earlier questions.
- `allow_modification`: Boolean controlling whether previously submitted answers may be changed.

### 3.2 Dual Validation (Client + Backend)
To prevent impossible timing configurations where reveal time meets or exceeds question duration:
- **Client Validation**: Enforces `Number(questionDuration) > Number(answerRevealDuration)`. Rejects invalid input with descriptive toast.
- **Backend Validation (`assignment_quiz_repo.py`)**:
  ```python
  if clean_settings.get("enable_timed_questions"):
      q_dur = int(clean_settings.get("question_duration", 10))
      ans_dur = int(clean_settings.get("answer_reveal_duration", 2))
      if q_dur <= ans_dur:
          raise ValidationError("question_duration must be strictly greater than answer_reveal_duration")
  ```

---

## 4. Security & Anti-Cheat Safeguards

### 4.1 Zero-Knowledge Initial Payload
In standard quiz implementations, correct answers are often included in the frontend JSON bundle and hidden via CSS, allowing candidates to inspect answers using browser Developer Tools.
- In Winners Creek LMS, `QuizRepository.get_quiz` strips `correct`, `correct_answer`, and `explanation` from the initial question payload.
- Correct answers remain strictly on the backend until the candidate reaches the reveal phase.

### 4.2 Secure Reveal Endpoint
- Endpoint: `POST /api/v1/student/assessments/{quiz_id}/questions/{question_id}/reveal`
- Verified: User must be authenticated and authorized for the quiz.
- Returns only `{ question_id, correct_options, correct_answer, explanation }`.

### 4.3 Navigation & Modification Locking
When `allow_previous` or `allow_modification` is `false`:
- **UI Locking**:
  - The "Previous" button is disabled.
  - The `QuestionPalette` marks past questions with a lock icon ($\text{🔒}$) and disables click-to-jump.
- **Backend Enforcement (`assignment_quiz_repo.py`)**:
  ```python
  if settings_dict.get("enable_timed_questions"):
      if settings_dict.get("allow_modification") is False and str(question_id) in answers_dict:
          if answers_dict[str(question_id)] != answer:
              raise BusinessRuleViolation(
                  "Modification of answered questions is locked for this timed assessment"
              )
  ```

---

## 5. Verification & Test Evidence

1. **Frontend Vitest (`apps/web`)**:
   - `ws.test.ts`: 4 passed
   - Overall suite: 87 passed across 16 test files.
   - `npm run typecheck`: 0 errors.
2. **Backend Pytest (`apps/api`)**:
   - `test_quiz_proctoring_integration.py`: 5 passed
     - `test_timed_question_settings_validation_and_reveal`: Verified duration validation (`q_dur > ans_dur`), attempt start timing, 403 rejection of premature reveal during answering phase, 400 rejection of answer edits when modification locked, answer submission rejection during reveal phase, and successful reveal once entering reveal phase.
   - `test_quiz_lms_integration.py`: 5 passed
   - Total Pytest: 10/10 passed.
3. **End-to-End Simulation Script (`verify_e2e_quiz.py`)**:
   - Verified 10-step full workflow against PostgreSQL:
     1. Trainer quiz created with settings.
     2. Student assessment detail verified delivering settings.
     3. Attempt started at server time.
     4. Draft answer saved in answering phase.
     5. Reveal phase (8.5s) correctly identified with remaining phase time.
     6. Reveal data delivered only in reveal phase.
     7. Auto-advance to Q2 at 12s.
     8. Answer saved for Q2.
     9. Total exam expiration (21s) correctly evaluated with attempt marked completed.
     10. Double submission rejected.
4. **Production Compilation (`npm run build`)**:
   - 92/92 static and dynamic routes compiled with zero build errors.
