# Quiz Timer & Per-Question Fast-Paced Workflow Implementation Report

**Project:** Winners Creek LMS (SkillSharp)  
**Production Frontend:** https://cnc-lms.vercel.app/  
**Production Backend:** https://cnc-backend-qzmb.onrender.com/  
**Repository:** https://github.com/wineerscreek-create/CnC_web_and_app_LMS.git  
**Branch:** `main`  
**Date:** November 16, 2026  

---

## 1. Executive Summary

This report documents the architectural design, security safeguards, and implementation details for the **Trainer-Controlled Automatic Question Timer & Secure Reveal Engine** in Winners Creek LMS.

The system enables high-intensity, automated assessment workflows where trainers define per-question time limits (e.g., 10 seconds total: 8 seconds answering + 2 seconds instant feedback), with automated option locking, server-authoritative correct answer reveal, and automated advancement.

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
2. **Backend Pytest (`apps/api`)**:
   - `test_quiz_proctoring_integration.py`: 5 passed
     - `test_timed_question_settings_validation_and_reveal`: Verified duration validation (`q_dur > ans_dur`), secure reveal payload, and modification lock enforcement.
   - `test_quiz_lms_integration.py`: 5 passed
3. **Production Compilation (`npm run build`)**:
   - 92/92 static and dynamic routes compiled with zero build errors.
