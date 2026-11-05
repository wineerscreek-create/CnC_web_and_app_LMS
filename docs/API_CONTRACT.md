# SkillSharp Platform API Contract Specification

**API Version:** `v1` (`/api/v1`)
**Primary Backend:** FastAPI (Python 3.11+, PostgreSQL authoritative, Redis session store)
**Frontend Consumer:** Next.js 15 App Router (`apps/web`)

---

## 1. Global Envelope & Conventions

All endpoints adhere to the standard JSON API envelope:

### Success Response Envelope (HTTP 200, 201, 202)
```json
{
  "success": true,
  "message": "Optional human-readable confirmation message",
  "data": { ... } | [ ... ]
}
```

### Error Response Envelope (HTTP 400, 401, 403, 404, 409, 422, 500)
```json
{
  "success": false,
  "error": "ERROR_CODE_STRING",
  "message": "Human-readable explanation of error",
  "fieldErrors": {
    "fieldName": "Specific validation failure message"
  }
}
```

### Authentication Header
- `Authorization: Bearer <access_token>`
- Cookie fallback: `access_token` and `refresh_token` set with `HttpOnly; SameSite=Lax; Path=/`

---

## 2. Authentication & Session Endpoints (`/api/v1/auth`)

| Method | Path | Auth / Roles | Request Body | Response Shape / Data | Notes |
|---|---|---|---|---|---|
| `POST` | `/auth/signup` | Public | `{ name, email, password, confirmPassword, role="STUDENT", collegeCode?, departmentCode?, institutionId? }` | `{ success: true, message: "Verification email sent", data: { userId, email } }` | Participant self-enrollment |
| `POST` | `/auth/login` | Public | `{ identifier, password, rememberMe? }` | `{ success: true, data: { accessToken, user: { id, name, email, role, home, collegeId?, departmentId? } } }` | Accepts email or student roll ID |
| `POST` | `/auth/verify-email` | Public | `{ email, otp }` | `{ success: true, message: "Email verified successfully" }` | Activates account if email verification required |
| `POST` | `/auth/resend-otp` | Public | `{ email, purpose: "verify" \| "reset" }` | `{ success: true, message: "Code dispatched" }` | Rate limited to 1 request / 60 seconds |
| `POST` | `/auth/forgot-password` | Public | `{ identifier }` *(legacy `email` supported)* | `{ success: true, message: "If account exists, reset instructions have been dispatched" }` | Sends secure reset link (`/reset-password?token=...`) |
| `POST` | `/auth/reset-password` | Public | `{ token, password, confirmPassword }` | `{ success: true, message: "Password updated successfully" }` | Validates token expiry (15m) and revokes all active sessions |
| `POST` | `/auth/refresh` | Public | `{ refreshToken? }` (or cookie) | `{ success: true, data: { accessToken } }` | Rotates session tokens |
| `POST` | `/auth/logout` | Authenticated | `{}` | `{ success: true }` | Clears cookies and redis session |
| `POST` | `/auth/logout-all` | Authenticated | `{}` | `{ success: true }` | Revokes all active user sessions across devices |
| `GET` | `/auth/me` | Authenticated | None | `{ success: true, data: { user: UserProfile } }` | Rehydrates client auth state |
| `POST` | `/auth/switch-role` | Authenticated | `{ targetRole }` | `{ success: true, data: { accessToken, user } }` | For multi-role faculty/admins |

---

## 3. Student / Participant Endpoints (`/api/v1/student`)

| Method | Path | Roles | Description & Response Data |
|---|---|---|---|
| `GET` | `/student/dashboard` | `STUDENT` | Returns student KPI metrics, active courses, upcoming live classes, streak count, and daily practice recommendations |
| `GET` | `/student/learning-path` | `STUDENT` | Returns stage progress across 4 pillars: Foundation, Communication, Technical, Interview Ready |
| `GET` | `/student/courses` | `STUDENT` | Catalog of enrolled courses, batch schedules, completion percentages |
| `GET` | `/student/courses/{course_id}` | `STUDENT` | Detailed course curriculum, syllabus modules, lessons, attached assignments, and quiz links |
| `GET` | `/student/classes` | `STUDENT` | Today's and upcoming live video sessions |
| `GET` | `/student/live-classes/{id}/token` | `STUDENT` | WebRTC live video room session token and credentials |
| `GET` | `/student/assessments` | `STUDENT` | Available, in-progress, and completed quizzes and diagnostics |
| `POST` | `/student/assessments/{quiz_id}/start` | `STUDENT` | Initiates timed assessment session and returns first batch of randomized questions |
| `POST` | `/student/assessments/{quiz_id}/submit` | `STUDENT` | Submits answers, triggers instant auto-evaluation, updates EEDI pillar scores |
| `GET` | `/student/practice/modes` | `STUDENT` | Available AI practice labs (Speech & Pitch, Q&A, Technical Composure) |
| `POST` | `/student/practice/sessions` | `STUDENT` | Starts practice recording session |
| `POST` | `/student/practice/sessions/{id}/evaluate` | `STUDENT` | Submits audio/transcript for multi-dimensional AI scoring |
| `GET` | `/student/achievements` | `STUDENT` | Badges, streaks, certified milestones, and leaderboard ranking |
| `GET` | `/student/resume-analyzer` | `STUDENT` | ATS compatibility history, keyword gaps, and resume formatting scores |
| `POST` | `/student/resume-analyzer/scan` | `STUDENT` | Uploads PDF resume for ATS parsing and deterministic scoring against target job roles |
| `GET` | `/student/payments/history` | `STUDENT` | Direct fee records, transactions, receipt generation |

---

## 4. Trainer Endpoints (`/api/v1/trainer`)

| Method | Path | Roles | Description & Response Data |
|---|---|---|---|
| `GET` | `/trainer/dashboard` | `TRAINER` | Overview of assigned batches, sessions today, pending evaluations, student defaulters |
| `GET` | `/trainer/batches` | `TRAINER` | All cohorts assigned to the trainer with student count and attendance velocity |
| `GET` | `/trainer/batches/{id}/students`| `TRAINER` | Student roster with contact, attendance, readiness scores |
| `GET` | `/trainer/classes/today` | `TRAINER` | Scheduled live classroom sessions for today |
| `POST` | `/trainer/sessions` | `TRAINER` | Schedules a new classroom session |
| `POST` | `/trainer/attendance` | `TRAINER` | Records bulk student session attendance (`present`, `absent`, `late`, `leave`) |
| `GET` | `/trainer/evaluations` | `TRAINER` | Pending and completed student rubric evaluations |
| `POST` | `/trainer/evaluations` | `TRAINER` | Submits detailed 7-pillar EEDI qualitative score and trainer recommendations |
| `GET` | `/trainer/assignments` | `TRAINER` | Course assignments, submission deadlines, pending grading queues |
| `PATCH` | `/trainer/submissions/{id}` | `TRAINER` | Grades student assignment submission with feedback |
| `GET` | `/trainer/alerts` | `TRAINER` | At-risk student alerts (attendance drop below threshold, diagnostic regressions) |
| `PATCH` | `/trainer/alerts/{id}` | `TRAINER` | Acknowledges or resolves student alert |
| `GET` | `/trainer/reports` | `TRAINER` | Cohort performance reports and PDF exports |

---

## 5. HOD / SPOC Department Endpoints (`/api/v1/hod`)

| Method | Path | Roles | Description & Response Data |
|---|---|---|---|
| `GET` | `/hod/dashboard` | `HOD`, `SPOC` | Department-scoped KPI aggregates: participants, faculty, attendance %, average skill score |
| `GET` | `/hod/participants` | `HOD`, `SPOC` | Department student list with roll numbers, batch allocations, and readiness index |
| `GET` | `/hod/attendance` | `HOD`, `SPOC` | Weekly department attendance velocities and defaulter rosters |
| `GET` | `/hod/trainers` | `HOD`, `SPOC` | Faculty assigned to department batches with teaching loads and evaluation pacing |
| `GET` | `/hod/assessments` | `HOD`, `SPOC` | Department benchmark skill distributions and exam compliance |
| `GET` | `/hod/enrollment` | `HOD`, `SPOC` | Department enrollment audit logs and transfer history |
| `GET` | `/hod/reports` | `HOD`, `SPOC` | Departmental placement readiness and analytical reporting |

---

## 6. Institution Admin Endpoints (`/api/v1/admin`)

| Method | Path | Roles | Description & Response Data |
|---|---|---|---|
| `GET` | `/admin/dashboard` | `ADMIN` | Campus-level multi-department metrics, live operations, student status breakdown |
| `GET` | `/admin/departments` | `ADMIN` | College departments, HOD designations, participant capacities |
| `POST` | `/admin/departments` | `ADMIN` | Creates new department within college scope |
| `GET` | `/admin/batches` | `ADMIN` | All college batches, semester assignments, assigned trainers |
| `POST` | `/admin/batches` | `ADMIN` | Creates new student cohort batch |
| `POST` | `/admin/batches/{id}/students` | `ADMIN` | Bulk assigns students to batch |
| `POST` | `/admin/batches/{id}/trainers` | `ADMIN` | Assigns trainers with day/time schedules |
| `GET` | `/admin/trainers` | `ADMIN` | College trainers roster, credential permissions, workload |
| `GET` | `/admin/users` | `ADMIN` | User directory across college (students, trainers, HODs) |
| `POST` | `/admin/users` | `ADMIN` | Provisions institutional staff member with invite link |
| `POST` | `/admin/import/{entity}` | `ADMIN` | Processes bulk CSV/Excel import for students or staff |
| `GET` | `/admin/import/jobs` | `ADMIN` | Historical bulk import job statuses and error logs |
| `GET` | `/admin/payments` | `ADMIN` | Campus fee collections, invoice reconciliation, student payment status |
| `GET` | `/admin/system-health` | `ADMIN` | 24-hour diagnostic metrics: database connection, AI quotas, error rates |

---

## 7. Platform / Super Admin Endpoints (`/api/v1/super-admin`)

| Method | Path | Roles | Description & Response Data |
|---|---|---|---|
| `GET` | `/super-admin/dashboard` | `SUPER_ADMIN` | Global platform health, multi-tenant college counts, revenue stream, active sessions |
| `GET` | `/super-admin/colleges` | `SUPER_ADMIN` | All onboarded institutions, campus domain slugs, quotas, primary admin provisioning |
| `POST` | `/super-admin/colleges` | `SUPER_ADMIN` | Provisions new institutional tenant with isolated database schemas and admin invite |
| `GET` | `/super-admin/courses` | `SUPER_ADMIN` | Master curriculum catalog, delivery mode configurations (Campus vs Online) |
| `POST` | `/super-admin/courses` | `SUPER_ADMIN` | Creates global master course |
| `POST` | `/super-admin/courses/{id}/publish` | `SUPER_ADMIN` | Publishes course to college catalogs |
| `GET` | `/super-admin/ebooks` | `SUPER_ADMIN` | E-book repository, publishing submissions, feature pins |
| `POST` | `/super-admin/ebooks/upload` | `SUPER_ADMIN` | Uploads new e-book with EPUB/PDF storage and cover asset indexing |
| `GET` | `/super-admin/games` | `SUPER_ADMIN` | Manages 34+ interactive simulation mechanics, tenant access rules |
| `GET` | `/super-admin/payments` | `SUPER_ADMIN` | Cross-tenant revenue analytics, gateway reconciliation, refunds |
| `GET` | `/super-admin/system` | `SUPER_ADMIN` | Deep telemetry, Redis cache status, background worker queues, memory/CPU |

---

## 8. Interactive Gamification & Simulation (`/api/v1/gamification`)

| Method | Path | Roles | Description |
|---|---|---|---|
| `GET` | `/gamification/student/games` | `STUDENT` | Lists simulation games unlocked for student |
| `POST` | `/gamification/student/games/{id}/start` | `STUDENT` | Initializes game attempt session and random scenario seeds |
| `POST` | `/gamification/student/games/{attempt_id}/submit` | `STUDENT` | Evaluates turn decision, grants points and XP |
| `POST` | `/gamification/student/games/{attempt_id}/finish` | `STUDENT` | Finalizes game session, outputs score breakdown and badge awards |
