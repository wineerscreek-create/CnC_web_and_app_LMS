# QUIZ & LMS INTEGRATION SECURITY AND COMPATIBILITY AUDIT

**Document:** `QUIZ_LMS_SECURITY_AUDIT.md`  
**Security Standard:** Enterprise Educational Security & OWASP Top 10 Compliance  
**Verification Date:** November 2026  
**Auditor:** Senior Security Architect & Penetration Tester  

---

## EXECUTIVE SECURITY ASSESSMENT

This security audit evaluates vulnerabilities, attack surfaces, data integrity risks, and privacy boundaries across the Original Quiz Platform, the Winners Creek LMS, and their unified integration.

---

## 1. AUTHENTICATION & TOKEN VERIFICATION

### 1.1 Original Quiz Platform Vulnerabilities
1. **Query Parameter Token Exposure:**
   In `frontend/src/services/socket.js:14`, authentication tokens are passed via WebSocket URL query parameters:
   `ws = new WebSocket(`${url}?token=${encodeURIComponent(token)}&role=${role}&quiz_id=${quizId}`);`
   *Risk:* Query parameters are logged in plaintext by intermediate proxies, Cloudflare access logs, and browser history.
   *Remediation in LMS:* Pass JWT tokens via the WebSocket upgrade request `Authorization: Bearer <token>` header or during the initial post-handshake connection frame.

2. **Dual-Key Secret Desynchronization:**
   The original platform supports both Cloudflare (`env.JWT_SECRET`) and FastAPI (`settings.jwt_secret`). If these secrets diverge, tokens issued by one runtime cannot be validated by the other.
   *Remediation in LMS:* All tokens are issued and verified against the authoritative LMS JWT secret managed by `app.core.config.settings.SECRET_KEY`.

### 1.2 SSO Launch Token Hardening
- **Source File:** `apps/api/app/routers/student.py:3216–3265`
- Launch tokens are short-lived ($TTL \le 30\text{ minutes}$), cryptographically signed (`HS256`), and bound to specific claims (`sub`, `quiz_id`, `batch_id`, `iss: "skillsharp-lms"`, `aud: "quiz-system"`).
- **Anti-Replay Protection:** Attempt submissions check `quiz_attempts` for existing submissions with the same `(quiz_id, student_user_id)` pair. If already submitted, subsequent attempts are rejected with `BusinessRuleViolation("You have already submitted this assessment")`.

---

## 2. INSECURE DIRECT OBJECT REFERENCES (IDOR) & ACCESS CONTROL

### 2.1 Multi-Batch Authorization Isolation
- **Attack Vector:** An attacker with a valid student token modifies `quiz_id` or `batch_id` to access unassigned exams or submit answers for another student's cohort.
- **LMS Protection:** `apps/api/app/repositories/assignment_quiz_repo.py:270–305`:
  - The repository looks up the student's authoritative `batch_id` directly from `student_profiles` using `student_user_id` from the decoded JWT.
  - It then executes a parameterized query against `quiz_batch_assignments`:
    ```sql
    SELECT 1 FROM quiz_batch_assignments
    WHERE quiz_id = $1 AND batch_id = $2 AND status = 'ACTIVE'
    ```
  - If no active assignment exists, access is refused (`NotFound("Quiz not found")`), completely neutralizing client-supplied batch spoofing.

### 2.2 Trainer Batch Boundary Enforcement
- **Attack Vector:** A trainer modifies the URL or payload to assign an assessment to a batch they do not instruct, or inspects results belonging to another department.
- **LMS Protection:** `apps/api/app/repositories/assignment_quiz_repo.py:628–641`:
  - When creating a quiz or assigning batches, every target batch is validated against `batch_trainers`:
    ```sql
    SELECT 1 FROM batch_trainers
    WHERE trainer_user_id = $1 AND batch_id = $2 AND (status = 'ACTIVE' OR status IS NULL)
    ```
  - Unauthorized batch assignments raise `ScopeForbidden`.
  - In `get_trainer_quiz_results` and `get_trainer_quiz_eedi_analytics`, SQL joins enforce that trainers can only query attempts from batches mapped to their `trainer_user_id`.

---

## 3. QUESTION LEAKAGE & EVALUATION INTEGRITY

### 3.1 Critical Finding: Answer Leakage in Original Code
- **Vulnerability Location:** `cloudflare/src/index.js:195` and `frontend/src/pages/student/QuizEngine.jsx:175–177`:
  ```javascript
  // cloudflare/src/index.js:195
  return json({
    question_id: q.id,
    question: q.question,
    options: session.optionOrder[q.id].map((key) => ({ key, text: q.options[key] })),
    correct_answer: q.correct // CRITICAL LEAK: Exposes correct answer to student client
  });
  ```
- **Impact:** Any tech-savvy student can open DevTools Network tab or run a simple browser script to read `correct_answer` from the JSON response before submitting.
- **Remediation in Integrated LMS:**
  1. `apps/api/app/repositories/assignment_quiz_repo.py:290–330` strips all correct answer flags, explanations, and grading keys before transmitting questions to students.
  2. The student's payload contains only `{ id, text, marks, options: [{ id, text }] }`.
  3. Answers are evaluated strictly **on the server** upon final submission. Correct answers and explanations are returned only after submission is persisted, or withheld entirely if the quiz settings specify `hide_results_until_closed`.

---

## 4. CAMERA SNAPSHOT PRIVACY & PROCTORING INTEGRITY

### 4.1 Frame Relay Privacy & Ephemeral In-Memory Storage
- **Privacy Standard:** Student webcam snapshots represent sensitive biometric/personal data and should not be stored permanently without explicit consent and compliance retention policies.
- **Original Platform Architecture:**
  - Snapshots are captured at `640x480` JPEG ($0.62$ quality) and transmitted via WebSocket.
  - The server relays snapshots to the admin room in memory only. Frames are **never written to disk or stored in SQLite/PostgreSQL**.
  - In the browser, `Monitor.jsx:36–50` revokes object URLs immediately when newer frames arrive or sessions end (`URL.revokeObjectURL`).
- **Integration Policy:**
  - Maintain ephemeral, in-memory relay for live monitoring.
  - Store at most 10 representative frames per student in browser session memory via Reservoir Sampling (`cameraSnapshots.js`) for the duration of the trainer's session.
  - If institutional archival is required, snapshots must be encrypted at rest with AES-GCM and subjected to a strict 30-day retention schedule.

### 4.2 Snapshot Spoofing & Injection Mitigation
- **Attack Vector:** A student attempts to replay a pre-recorded loop of themselves looking at the screen by injecting mock base64 frames into the WebSocket.
- **Mitigation:**
  - Enforce server-side rate limits on camera snapshots: maximum 1 snapshot per 4 seconds. Rapid bursts indicate script injection.
  - Payload size validation: enforce base64 length $\le 260,000$ characters and byte size $\le 200\text{ KB}$ (`cloudflare/src/index.js:223–225`).
  - Correlate camera activity with client focus events: if snapshots continue streaming normally while `tab_switch` or `fullscreen_exit` events are firing, flag the attempt for manual inspection.

---

## 5. ANTI-CHEAT ENFORCEMENT & TAMPER RESISTANCE

### 5.1 Comprehensive Event Protection
| Threat | Anti-Cheat Detection Mechanism | Countermeasure |
| :--- | :--- | :--- |
| **Exiting Fullscreen** | `fullscreenchange` event | Immediate warning toast + POST `/student/warning` |
| **Opening Another Tab** | `visibilitychange` (`document.hidden`) + `window.onblur` | Recorded as `tab_switch` warning |
| **Opening DevTools** | Shortcut block (`F12`, `Ctrl+Shift+I/J/C`, `Ctrl+U`) + window dimension delta heuristic ($>160\text{px}$) | Warning recorded + automatic submission on limit |
| **Copying Question Text** | `contextmenu`, `copy`, `cut`, `selectstart` cancelled | Content selection disabled |
| **Navigating Back** | `window.onpopstate` listener + `history.pushState` trap | Back navigation cancelled + warning recorded |
| **Page Reload** | `window.onbeforeunload` handler | Native browser confirmation modal prevents accidental departure |

### 5.2 Server-Authoritative Auto-Submit on Warning Threshold
- The backend increments the student's warning count in `quiz_attempts.warning_count`.
- When `warning_count >= max_warnings` (default: 3), the server rejects further answer submissions and locks the attempt as `auto_submitted`.

---

## 6. EEDI ANALYTICS CONFIDENTIALITY

### 6.1 Strict Data Sequestering
- **Requirement:** EEDI (Diagnostic Assessment) competency scores, misconception tags, and index performance metrics are designed exclusively for trainer curriculum analysis and must never be exposed to students.
- **Enforcement:**
  - `quiz_eedi_results` queries exist only within `apps/api/app/repositories/assignment_quiz_repo.py:968–1040` (`get_trainer_quiz_eedi_analytics`).
  - Endpoint `GET /trainer/assessments/{quiz_id}/eedi-analytics` requires `TrainerCtx` or `AdminCtx`.
  - No student router imports or exposes EEDI tables or analytics summaries.
