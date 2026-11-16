# QUIZ & LMS INTEGRATION SECURITY AUDIT & THREAT MODEL

**Document:** `QUIZ_LMS_SECURITY_AUDIT.md`  
**Date:** November 16, 2026  
**Auditor:** Antigravity Autonomous Security Engineer  
**Classification:** Internal Technical Architecture  

---

## 1. THREAT MODEL & ATTACK VECTORS

```
                  ┌───────────────────────────────────────────────┐
                  │               ATTACK SURFACES                 │
                  └──────────────────────┬────────────────────────┘
                                         │
        ┌───────────────────┬────────────┴───────┬───────────────────┐
        ▼                   ▼                    ▼                   ▼
┌──────────────┐    ┌──────────────┐     ┌──────────────┐    ┌──────────────┐
│  Vector 1:   │    │  Vector 2:   │     │  Vector 3:   │    │  Vector 4:   │
│ Cross-Batch  │    │ Broken Obj   │     │  Trainer-Only│    │     CSV      │
│ Authorization│    │ Level Auth   │     │ EEDI Leakage │    │  Injection & │
│ (IDOR)       │    │ (BOLA / IDOR)│     │ to Students  │    │  XSS Attack  │
└──────────────┘    └──────────────┘     └──────────────┘    └──────────────┘
```

### 1.1 Vector 1: Cross-Batch Authorization Bypass (Highest Risk)
- **Threat Scenario:** A student enrolled in Batch D discovers the `quiz_id` or `code` for an assessment assigned exclusively to Batch B and Batch C. The student crafts a manual API request to `/api/v1/student/assessments/{quiz_id}` or submits an attempt to `/api/v1/student/assessments/{quiz_id}/submit`.
- **Impact:** Compromises academic integrity; unauthorized examination access; unearned grades and credentials.
- **Root Cause Vulnerability:** Trusting client-side parameters, relying on UI button states, or checking only that a quiz is "active" without validating the user's batch membership in the database.
- **Enforced Mitigation:** Every single student endpoint must independently fetch the student's active batch from `student_profiles` and perform an SQL `EXISTS` check against `quiz_batch_assignments`:
  ```sql
  SELECT 1 FROM quiz_batch_assignments qba
  JOIN student_profiles sp ON sp.batch_id = qba.batch_id
  WHERE qba.quiz_id = $1 AND sp.user_id = $2 AND qba.status = 'ACTIVE';
  ```
  If no record matches, return **HTTP 403 Forbidden** immediately without leaking quiz metadata.

### 1.2 Vector 2: Broken Object-Level Authorization (Trainer Privilege Escalation)
- **Threat Scenario:** Trainer A (authorized only for Batches B and C) attempts to assign an assessment to Batch D (managed by Trainer B), or attempts to view submission reports or EEDI scores for Batch D by submitting `batch_id="batch_d_uuid"` in request payloads.
- **Impact:** Cross-cohort data leakage, unauthorized trainer intervention in other trainers' classrooms.
- **Enforced Mitigation:** When a trainer creates an assessment or updates batch assignments, the backend verifies that **every single batch ID** in the request exists in `batch_trainers` for `trainer_user_id == ctx.user_id AND status = 'ACTIVE'`. If any batch is unauthorized, the entire transaction is rejected with **HTTP 403 Forbidden**.

### 1.3 Vector 3: EEDI Score Leakage to Students or Public Endpoints
- **Threat Scenario:** Student inspects network traffic or queries API endpoints to view question-level EEDI indexes, terms, or calculated readiness competencies.
- **Impact:** Violates the strict requirement that EEDI scores remain exclusively inside the authorized Trainer Portal. Exposes preliminary evaluation metrics to students.
- **Enforced Mitigation:**
  1. No student endpoint (`/student/assessments/*`) shall ever serialize `eedi_index`, `eedi_term`, or `quiz_eedi_results`.
  2. Question payloads returned to students only contain `id`, `text`, `options`, and `marks`. EEDI columns are stripped server-side.
  3. The `quiz_eedi_results` table is queried **exclusively** by endpoints guarded by `ScopeContext.require_role(Role.TRAINER)` and filtered by `batch_id IN (SELECT batch_id FROM batch_trainers WHERE trainer_user_id = :id)`.

### 1.4 Vector 4: CSV Malformation, Injection & Formula Attacks
- **Threat Scenario:** An attacker uploads a CSV file containing malicious formula expressions (e.g. `=cmd|' /C calc'!A0`, `@SUM(...)`), embedded script tags in `question` or `eedi_term`, or negative/NaN values in marks.
- **Impact:** Remote code execution (in Excel upon report export), stored XSS in trainer dashboard, or corrupted score calculations.
- **Enforced Mitigation:**
  1. The CSV parser strips leading formula characters (`=`, `+`, `-`, `@`) when exporting to Excel/CSV.
  2. All text strings (`question`, options, `eedi_term`) are sanitized.
  3. Numerical fields (`marks`, `negative`, `eedi_index`) are strictly cast and validated with Pydantic; non-numeric values trigger immediate validation errors and rejection.

### 1.5 Vector 5: Token Tampering & Session Forgery
- **Threat Scenario:** A student alters their JWT payload to change `sub` or `batch_id` to masquerade as another student or bypass batch restrictions.
- **Impact:** Identity theft, unauthorized examination completion.
- **Enforced Mitigation:**
  1. All tokens are cryptographically signed using HMAC-SHA256 with a high-entropy secret key.
  2. Token signatures are validated on every request.
  3. The server never reads batch membership from token claims for authorization; it queries the PostgreSQL database in real time.

---

## 2. SECURITY TEST MATRIX & AUTOMATED ASSERTIONS

| Test Identifier | Vulnerability Target | Test Method | Expected Outcome |
| :--- | :--- | :--- | :--- |
| **SEC-01** | Student Cross-Batch Access | Student in Batch 2 requests details for Quiz assigned strictly to Batch 1. | **HTTP 403 Forbidden** |
| **SEC-02** | Student Direct Submit to Unassigned Quiz | Student in Batch 2 posts answers to Quiz assigned strictly to Batch 1. | **HTTP 403 Forbidden** |
| **SEC-03** | Trainer Unauthorized Batch Assignment | Trainer 1 attempts to assign a quiz to Batch 3 (managed by Trainer 2). | **HTTP 403 Forbidden** |
| **SEC-04** | Trainer Cross-Batch Result Viewing | Trainer 1 attempts to query submissions for Batch 3. | **HTTP 403 Forbidden** |
| **SEC-05** | Student EEDI Metric Access | Student requests `/trainer/assessments/{id}/eedi-analytics` or attempts to find EEDI fields in submission response. | **HTTP 403 Forbidden** (EEDI fields omitted) |
| **SEC-06** | Cross-Tenant Institution Leakage | Institution A user requests Quiz belonging to Institution B. | **HTTP 404 / 403** |
| **SEC-07** | Expired Token Reuse | Client submits attempt with expired SSO token. | **HTTP 401 Unauthorized** |
| **SEC-08** | CSV Formula Injection | Upload CSV containing `=HYPERLINK(...)` or script tags. | Formula characters neutralized; text sanitized. |
| **SEC-09** | Duplicate Submission (No Retake) | Student submits attempt twice when `allow_retake = false`. | **HTTP 400 / 409 Conflict** |

---

## 3. COMPLIANCE & ACCEPTANCE STATEMENT

Every mitigation in this security audit must be verified with automated backend tests prior to deployment.
