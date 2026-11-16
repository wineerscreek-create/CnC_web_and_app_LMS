# Quiz System - CNC LMS Native Integration Guide

**Document Version**: 1.0.0  
**Target Environments**: Vercel (Frontend), Render (FastAPI Backend), Cloudflare Workers (Edge Engine), Neon/Render PostgreSQL  
**Status**: Ready for Production Deployment

---

## 1. Updated API Documentation

### 1.1 Trainer Assessment Endpoints

All trainer assessment endpoints require a valid Bearer token for a user with the `TRAINER` (or `ADMIN`/`SUPER_ADMIN`) role. All batch operations verify that the authenticated trainer is actively assigned to the target batch in `batch_trainers`.

| Endpoint | Method | Description | Security / Scope Scrutiny |
|---|---|---|---|
| `/api/v1/trainer/assessments` | `GET` | List assessments created by this trainer or assigned to their batches. Supports `?batchId=<uuid>`. | Returns assessment details, total and submitted attempt counts, and assigned batch list. |
| `/api/v1/trainer/assessments` | `POST` | Create a new assessment with proctoring settings, questions, and assigned batches. | Validates that the trainer is assigned to **every** batch in `batchIds`. Rejects with `403` if unauthorized. Returns `201 Created`. |
| `/api/v1/trainer/assessments/{quiz_id}` | `GET` | Retrieve complete details of an assessment including questions, settings, and batches. | Validates creator ownership or batch association. Rejects unauthorized access with `403`. |
| `/api/v1/trainer/assessments/{quiz_id}` | `PATCH` | Update assessment details (title, duration, max score, questions, settings, status). | Validates creator ownership or admin role. |
| `/api/v1/trainer/assessments/{quiz_id}` | `DELETE` | Soft-deletes or archives the assessment. | Validates creator ownership or admin role. |
| `/api/v1/trainer/assessments/{quiz_id}/batches` | `POST` | Atomically assign or replace target batches for the assessment (`{"batchIds": [...]}`). | Enforces that trainer is authorized for all requested batches via `batch_trainers`. |
| `/api/v1/trainer/assessments/{quiz_id}/upload-csv` | `POST` | Upload questions CSV (`multipart/form-data`, field: `file`) to populate questions. | Standard library CSV parser validates required columns, extracts optional `eedi_index` and `eedi_term`, and converts to structured question objects. |
| `/api/v1/trainer/assessments/{quiz_id}/results` | `GET` | View student submissions and scores for batches taught by this trainer. | Filters submissions to batches the trainer is permitted to see. |
| `/api/v1/trainer/assessments/{quiz_id}/eedi-analytics` | `GET` | **Confidential Competency Analytics**. Returns aggregate and student-level EEDI index/term mastery. | **STRICTLY TRAINER-ONLY**. Blocked for students and public callers. Scoped to trainer's batches. |

#### Sample Create Assessment Payload (`POST /api/v1/trainer/assessments`):
```json
{
  "title": "Module 3: Database Design & Normalization",
  "durationMinutes": 45,
  "maxScore": 50,
  "batchIds": ["34bddca5-364e-4028-ae3d-99d2dd349016"],
  "settings": {
    "isProctored": true,
    "maxWarnings": 3
  },
  "questions": [
    {
      "id": "q1",
      "text": "Which normal form eliminates partial functional dependencies?",
      "options": [
        {"id": "A", "text": "1NF", "correct": false},
        {"id": "B", "text": "2NF", "correct": true},
        {"id": "C", "text": "3NF", "correct": false},
        {"id": "D", "text": "BCNF", "correct": false}
      ],
      "marks": 5,
      "eediIndex": 12,
      "eediTerm": "Relational Theory"
    }
  ]
}
```

---

### 1.2 Student Assessment Endpoints

All student assessment endpoints require a valid Bearer token for an active user with the `STUDENT` role.

| Endpoint | Method | Description | Security / Proctoring |
|---|---|---|---|
| `/api/v1/student/assessments` | `GET` | List active assessments assigned to the student's enrolled batch. | Only assessments linked to `student_profiles.batch_id` via `quiz_batch_assignments` are returned. |
| `/api/v1/student/assessments/{quiz_id}` | `GET` | Fetch assessment details and questions for taking the test. | Verifies student is enrolled in an assigned batch. Omits correct answers and explanations. |
| `/api/v1/student/assessments/{quiz_id}/launch-token` | `POST` | Generate a short-lived signed launch token for the proctored examination interface. | Signed with `JWT_SECRET`; includes student identifier, quiz code, roll number, and expiration. |
| `/api/v1/student/assessments/{quiz_id}/attempts` | `POST` | Submit completed attempt answers, proctoring warnings, and device ID. | Verifies deadline and retake rules. Evaluates marks and calculates user-facing percentage. Computes internal EEDI competency scores and stores them in `quiz_eedi_results`. **NEVER returns EEDI scores in response**. |

#### Sample Attempt Submission Payload (`POST /api/v1/student/assessments/{quiz_id}/attempts`):
```json
{
  "answers": [
    {"questionId": "q1", "optionId": "B"}
  ],
  "durationSeconds": 420,
  "deviceId": "fp-browser-882ab0",
  "warnings": [
    {
      "type": "tab_switch",
      "timestamp": "2026-11-16T08:15:20Z",
      "detail": "User switched application tab"
    }
  ]
}
```

---

## 2. Updated Environment Variables Documentation

### 2.1 LMS Backend (`apps/api`)

The following environment variables configure the assessment and proctoring integration:

| Variable | Type | Default | Description |
|---|---|---|---|
| `USE_POSTGRES` | Boolean | `true` | Enables PostgreSQL database backend for quizzes, attempts, and multi-batch assignments. |
| `DATABASE_URL` | String | (Render DB URL) | Connection string for the PostgreSQL database (`cnc` database). |
| `MIGRATION_DATABASE_URL` | String | Optional | Elevated connection string used when running DDL schema migrations in production. |
| `JWT_SECRET` | String | (Secret Key) | Used for signing student proctored launch tokens and authentication sessions. |
| `ACCESS_TOKEN_TTL_MINUTES` | Integer | `30` | Time-to-live for authentication and examination launch tokens. |

### 2.2 LMS Web Frontend (`apps/web`)

| Variable | Type | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | String | `https://cnc-backend-qzmb.onrender.com/api/v1` | Production API endpoint for LMS backend services. |
| `NEXT_PUBLIC_QUIZ_SYSTEM_URL` | String | `https://quiz.skillsharp.in` | Optional standalone Quiz System URL for SSO redirection if running outside the iframe. |

### 2.3 Standalone Quiz System Backend (`apps/quiz-system-v17-cloudflare/quiz-system/backend`)

| Variable | Type | Default | Description |
|---|---|---|---|
| `SECRET_KEY` | String | `...` | Standalone backend cryptographic key for session tokens. |
| `ENCRYPTION_MASTER_KEY` | String | `...` | Base64-encoded 32-byte Fernet key used for encrypting question banks in memory store. |
| `CORS_ORIGINS` | String | `*` | Allowed CORS origins. Include `https://cnc-lms.vercel.app` in production. |

---

## 3. Integration Deployment Guide

Both Vercel (Frontend) and Render (Backend) have automatic CI/CD deployment configured on commits to the `main` branch.

### Step 1: Database Migration Execution
Before or immediately upon deploying the new backend code, ensure database migration `021_quiz_batch_assignments_and_eedi.sql` is applied.

1. **Automatic Migration (Application Startup)**:
   The backend automatically applies unapplied migrations from `apps/api/migrations` during startup in `app.main.py` using PostgreSQL advisory locks (`ADVISORY_LOCK_ID = 847291048`).
2. **Manual Migration (CLI)**:
   If preferred to run migrations ahead of release:
   ```bash
   python -m app.db.postgres
   ```
   Or connect to PostgreSQL using `psql`:
   ```bash
   psql "$DATABASE_URL" -f apps/api/migrations/021_quiz_batch_assignments_and_eedi.sql
   ```

### Step 2: Push Code to GitHub
Push the verified changes to `origin main`:
```bash
git push origin main
```

### Step 3: Deployment Verification
1. **Render (Backend)**:
   - Monitor the deployment build log on Render.
   - Verify health endpoint: `GET https://cnc-backend-qzmb.onrender.com/healthz`
   - Response will report `"postgres": {"ok": true, "migrations_ready": true}`.
2. **Vercel (Frontend)**:
   - Monitor the Vercel build log.
   - Verify `/trainer/assessments` renders properly with authentication.
   - Verify student assessment view at `/student/assessments`.

---

## 4. Rollback Guide

If an issue arises in production, follow these steps to restore previous behavior without data loss:

### 4.1 Backend Rollback
1. Revert to the previous git commit on `main` and push, or trigger a manual rollback in the Render dashboard to the previous release.
2. The database schema changes made by `021_quiz_batch_assignments_and_eedi.sql` are purely additive:
   - Added columns to `quizzes` have defaults or are nullable.
   - Added `quiz_batch_assignments` and `quiz_eedi_results` tables do not interfere with legacy single-batch queries (`quizzes.batch_id`).
   - Reverting the code will not cause database errors.

### 4.2 Database Rollback (If strictly required)
To drop the new tables and extra columns:
```sql
BEGIN;
DROP TABLE IF EXISTS quiz_eedi_results;
DROP TABLE IF EXISTS quiz_batch_assignments;
ALTER TABLE quizzes DROP COLUMN IF EXISTS creator_trainer_id;
ALTER TABLE quizzes DROP COLUMN IF EXISTS quiz_code;
ALTER TABLE quizzes DROP COLUMN IF EXISTS settings;
ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS batch_id;
ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS institution_id;
ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS device_id;
ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS warnings;
ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS warning_count;
ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS status;
ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS percentage;
ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS passed;
DELETE FROM schema_migrations WHERE version = '021_quiz_batch_assignments_and_eedi.sql';
COMMIT;
```

---

## 5. Complete Inventory of Modified Files

| File Path | Component | Purpose & Changes |
|---|---|---|
| `apps/api/migrations/021_quiz_batch_assignments_and_eedi.sql` | Database Migration | Creates `quiz_batch_assignments` and `quiz_eedi_results` tables; adds `creator_trainer_id`, `settings`, `quiz_code` to `quizzes`; adds proctoring columns to `quiz_attempts`. |
| `apps/api/app/repositories/assignment_quiz_repo.py` | LMS Backend Repository | Implements multi-batch access checks, batch-scoped quiz creation, proctoring warning storage, EEDI score breakdown isolation, and trainer competency analytics. |
| `apps/api/app/schemas/requests.py` | LMS API Schemas | Adds `TrainerQuizCreateRequest`, `TrainerQuizUpdateRequest`, `BatchAssignRequest`, and extends `QuizAttemptRequest` with `deviceId` and `warnings`. |
| `apps/api/app/routers/trainer.py` | LMS API Endpoints | Exposes 8 trainer assessment endpoints under `/trainer/assessments`: listing, creation, CSV question upload, batch assignment, submission results, and confidential EEDI analytics. |
| `apps/api/app/routers/student.py` | LMS API Endpoints | Adds `/student/assessments/{quiz_id}/launch-token` and updates attempt submission endpoint with anti-cheat warnings and device ID. |
| `apps/api/tests/test_quiz_lms_integration.py` | LMS Test Suite | Automated regression test suite covering RBAC, multi-batch access control, launch tokens, anti-cheat submissions, EEDI isolation, and CSV compatibility. |
| `apps/web/src/lib/nav.ts` | LMS Frontend Navigation | Adds "Assessments" navigation link with `Target` icon to the Trainer portal sidebar. |
| `apps/web/src/app/trainer/assessments/page.tsx` | LMS Frontend Page | Full Trainer Assessment Management Portal: quiz list, create modal with proctoring config, CSV question uploader, multi-batch assigner, results table, and EEDI competency analytics modal. |
| `apps/web/src/app/student/assessments/[quizId]/page.tsx` | LMS Frontend Page | Adds browser anti-cheat protections (tab switch tracking with `visibilitychange`, warning toasts, auto-submit on limit), device fingerprinting, and launch token integration. |
| `apps/quiz-system-v17-cloudflare/quiz-system/backend/app/models/schemas.py` | Standalone Quiz System | Adds optional `eedi_index` and `eedi_term` fields to `QuestionCSVRow`. |
| `apps/quiz-system-v17-cloudflare/quiz-system/backend/app/memory/store.py` | Standalone Quiz System | Adds `eedi_index` and `eedi_term` to `QuestionRecord`; adds safe lazy imports for encryption. |
| `apps/quiz-system-v17-cloudflare/quiz-system/backend/app/services/csv_service.py` | Standalone Quiz System | Parses optional `eedi_index` and `eedi_term` columns; provides standard library CSV fallback. |
| `apps/quiz-system-v17-cloudflare/quiz-system/backend/app/services/export_service.py` | Standalone Quiz System | Exports EEDI Index and EEDI Term in Excel question analysis reports. |
| `apps/quiz-system-v17-cloudflare/quiz-system/cloudflare/src/index.js` | Cloudflare Edge Worker | Extends Worker CSV parser to extract and preserve `_eedi_index` and `_eedi_term` in question options. |
| `QUIZ_LMS_INTEGRATION_AUDIT.md` | Documentation | Architectural analysis of both systems, workflow mappings, and non-regression guarantees. |
| `QUIZ_LMS_INTEGRATION_ARCHITECTURE.md` | Documentation | Sequence diagrams, data flow models, PostgreSQL schema specifications, and RBAC rules. |
| `QUIZ_LMS_SECURITY_AUDIT.md` | Documentation | Threat model, attack vector analysis (IDOR, BOLA, EEDI leakage, CSV injection), and audit matrix. |
| `QUIZ_LMS_TEST_REPORT.md` | Documentation | Automated test execution report with outputs and verification sign-offs. |
| `QUIZ_LMS_INTEGRATION_GUIDE.md` | Documentation | Endpoints, environment variables, deployment instructions, rollback steps, and file directory. |
