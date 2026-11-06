# EXISTING FEATURE INVENTORY — WINNERS CREEK LMS

**Platform Architecture:**
- **Frontend:** Next.js 15 (App Router, Tailwind CSS, TypeScript, Redux Toolkit, Vitest)
- **Backend:** FastAPI (Python 3.13, Pydantic v2, Asyncpg, Httpx, Pytest)
- **Database:** PostgreSQL 16 (Primary transactional store with 45+ tables)
- **Cache & Sessions:** Redis Key-Value Store (`cnc-redis`)
- **Storage:** S3-compatible / Local Object Storage Driver

---

## 1. Authentication & Security Module

| Feature | Frontend Path / Component | Backend Router / Service | Persisted Store | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Direct Login** | `/(auth)/login/page.tsx` | `POST /api/v1/auth/login` | PostgreSQL `users` table | OPERATIONAL |
| **Token Refresh** | `authSlice.ts` | `POST /api/v1/auth/refresh` | HTTP-only cookie + Redis session | OPERATIONAL |
| **Logout & Session Revocation** | `authSlice.ts`, `portal-shell.tsx` | `POST /api/v1/auth/logout` | Redis token family revocation | OPERATIONAL |
| **Forgot Password** | `/(auth)/forgot-password/page.tsx` | `POST /api/v1/auth/forgot-password` | PostgreSQL `reset_password_token_hash` | OPERATIONAL |
| **Reset Password** | `/(auth)/reset-password/page.tsx` | `POST /api/v1/auth/reset-password` | PostgreSQL `users.password_hash` | OPERATIONAL |
| **Role-based Redirection** | `middleware.ts`, `route-guard.tsx` | `GET /api/v1/auth/me` | JWT claims + DB scope | OPERATIONAL |

---

## 2. Super Admin Module

| Feature | Frontend Path | Backend Endpoints | Persisted Store | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Dashboard Metrics** | `/super-admin/page.tsx` | `GET /super-admin/dashboard` | PostgreSQL aggregates | OPERATIONAL |
| **Institution Management** | `/super-admin/colleges/page.tsx` | `GET/POST /super-admin/colleges` | `institutions` table | OPERATIONAL |
| **Course Lifecycle** | `/super-admin/courses/page.tsx` | `GET/POST /super-admin/courses` | `courses` table | PARTIAL (Needs Permanent Delete & Unpublish hardening) |
| **Platform Ebooks Moderation** | `/super-admin/ebooks/page.tsx` | `GET /super-admin/ebooks/requests` | `ebooks`, `ebook_publish_requests` | OPERATIONAL |
| **Game Lifecycle & Analytics** | `/super-admin/games/page.tsx` | `GET /super-admin/games` | `game_configurations` | OPERATIONAL |
| **Platform Payments Queue** | `/super-admin/payments/page.tsx` | `GET /super-admin/payments` | `payments` table | OPERATIONAL |
| **System Telemetry & Health** | `/super-admin/system/page.tsx` | `GET /super-admin/system` | DB + Redis telemetry | OPERATIONAL (PostgreSQL 16) |
| **Super Admin Profile** | `/super-admin/profile` | `GET/PATCH /super-admin/profile` | `users` table | BROKEN (404 Page Not Found) |

---

## 3. Admin (College / Institutional) Module

| Feature | Frontend Path | Backend Endpoints | Persisted Store | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Admin Dashboard** | `/admin/dashboard/page.tsx` | `GET /admin/dashboard` | PostgreSQL college scope | OPERATIONAL |
| **Departments** | `/admin/departments/page.tsx` | `GET/POST /admin/departments` | `departments` table | BROKEN ("Something went wrong" on production) |
| **Batches** | `/admin/batches/[batchId]/page.tsx` | `GET/POST /admin/batches` | `batches` table | PARTIAL (Batch assignments need full workflow) |
| **Trainer Management** | `/admin/trainers/page.tsx` | `GET /admin/trainers` | `trainer_profiles`, `batch_trainers` | PARTIAL (Needs complete reassign/edit workflow) |
| **User Directory** | `/admin/users/page.tsx` | `GET/POST /admin/users` | `users` table | PARTIAL (Needs restriction to Trainer & Participant only) |
| **Institutional Games** | `/admin/games/page.tsx` | `GET /admin/games` | `game_attempts` | PARTIAL (Needs real persisted attempt analytics) |
| **Institutional Reports** | `/admin/reports/page.tsx` | `GET/POST /admin/reports` | Celery / CSV generation | PARTIAL (Needs full student cohort & working downloads) |

---

## 4. Trainer Module

| Feature | Frontend Path | Backend Endpoints | Persisted Store | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Trainer Dashboard** | `/trainer/dashboard/page.tsx` | `GET /trainer/dashboard` | Assigned batches scope | OPERATIONAL |
| **Batch Schedules & Sessions**| `/trainer/sessions`, `/batches` | `GET /trainer/sessions` | `training_sessions` | OPERATIONAL |
| **Attendance Marking** | `/trainer/attendance/[sessionId]` | `POST /trainer/attendance` | `attendance_records` | OPERATIONAL |
| **Live Classroom** | `/trainer/classes/page.tsx` | `GET/POST /live-classes` | `live_classes` table | PARTIAL (Real-time participant visibility & auto-attendance) |
| **Assignment Management** | `/trainer/assignments/page.tsx` | `GET/POST /trainer/assignments` | `assignments` table | PARTIAL (Dialog hides fields on text toggle; multimedia uploads) |
| **E-Book Device Upload** | `/trainer/ebooks/page.tsx` | `POST /trainer/ebooks/upload` | Object storage + `ebooks` | PARTIAL (Upload progress & validation UI fixes needed) |
| **Mentor-Student Messaging** | `/trainer/chat/page.tsx` | `GET/POST /trainer/chat/*` | `conversations`, `messages` | PARTIAL (Permission boundaries & incremental search needed) |
| **Batch Insights & Weak Skills** | `/trainer/games/page.tsx` | `GET /trainer/games` | `game_attempts` | PARTIAL (Needs competency mapping from actual attempts) |
| **Payments Section** | `/trainer/payments/page.tsx` | `GET /trainer/payments` | N/A | OBSOLETE (Must be removed per specifications) |

---

## 5. SPOC / HOD Module

| Feature | Frontend Path | Backend Endpoints | Persisted Store | Status |
| :--- | :--- | :--- | :--- | :--- |
| **HOD Dashboard** | `/hod/dashboard/page.tsx` | `GET /hod/dashboard` | Department scope | OPERATIONAL |
| **Participant Directory** | `/hod/participants/page.tsx` | `GET /hod/participants` | `student_profiles` | PARTIAL (Filters & pagination consistency needed) |
| **Participant Detail View** | `/hod/participants/[id]` | `GET /hod/participants/{id}` | Student composite profiles | BROKEN ("Participant not found" error c337169b) |
| **Department Attendance** | `/hod/attendance/page.tsx` | `GET /hod/attendance` | `attendance_records` | PARTIAL (Discrepancy with Admin reports) |
| **Department Assessments** | `/hod/assessments/page.tsx` | `GET /hod/assessments` | `quizzes`, `assessments` | OPERATIONAL |
| **Irrelevant Scope UI** | `/hod/*` | N/A | N/A | OBSOLETE (Other Departments/Colleges must be removed) |

---

## 6. Participant (Student) Module

| Feature | Frontend Path | Backend Endpoints | Persisted Store | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Student Dashboard** | `/student/dashboard/page.tsx` | `GET /student/dashboard` | Student batch & enrollments | OPERATIONAL |
| **Course & Learning Content** | `/student/learning/page.tsx` | `GET /student/courses` | `courses`, `enrollments` | OPERATIONAL |
| **Learning Path** | `/student/learning-path` | `GET /student/learning-path` | Course progress | OPERATIONAL |
| **Student Profile** | `/student/profile/page.tsx` | `GET/PATCH /student/profile` | `student_profiles`, `users` | OPERATIONAL |
| **Live Classes & Recordings** | `/student/live-classes/page.tsx`| `GET /live-classes/my` | `live_classes`, `live_recordings` | OPERATIONAL |
| **E-Book Reader** | `/student/ebooks/page.tsx` | `GET /student/ebooks` | `ebooks` table | PARTIAL (Reader resume & reading progress tracking) |
| **Practice Lab & Presentation**| `/student/practice/presentation-coach`| `POST /practice/analyze` | Client STT / AI Provider | PARTIAL (Add PPT/PPTX file upload and analysis) |
| **7 Interactive Gamified Labs**| `/student/games/page.tsx` | `GET/POST /student/games/*`| `game_attempts` | PARTIAL (Audio playback & next level navigation fixes) |

---

## 7. Obsolete & Deprecated Features to Remove

| Obsolete Feature | Current Location | Deletion Action |
| :--- | :--- | :--- |
| **Certificate Pages & Nav** | `/student/achievements`, `/hod/certificates`, APIs | Full removal of certificate routes, nav items, and components |
| **Placement Readiness** | `/placement`, `/recruiter`, `/student/placement-goal`, reports | Full removal of placement routes, reports, and obsolete components |
| **Trainer Payments** | `/trainer/payments/page.tsx`, `/api/v1/trainer/payments` | Full removal from Trainer portal UI and router |
| **AI Usage from Non-Super-Admins** | `/admin/ai-usage`, `/trainer/ai-usage`, etc. | Restrict AI usage visibility strictly to Super Admin |
