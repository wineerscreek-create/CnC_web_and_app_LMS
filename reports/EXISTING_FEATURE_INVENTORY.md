# EXISTING FEATURE INVENTORY
**Platform:** Winners Creek LMS  
**Verification Date:** 2026-11-06  
**Status:** All features verified, active, and operational.

---

## 1. Participant Portal (`/student/*`)
- **Dashboard (`/student/dashboard`)**: Hero banner with custom profile imagery, readiness score index, streak count, weekly hours, leaderboard rank, upcoming sessions.
- **My Learning (`/student/learning`, `/student/learning/[courseId]`)**: Curriculum player with 12-section structured content viewer, class materials downloads, recordings player, session attendance marking.
- **Practice Lab (`/student/practice`)**: 8 AI-powered practice modes (Scenario-based learning, Presentation Coach with PowerPoint `.pptx` & `.ppt` upload, Audio context labs, Resume ATS analyzer).
- **Assessments (`/student/assessments`, `/student/assessments/[quizId]`)**: Card-based question flow, timer, score evaluation.
- **Games & Gamification (`/student/games`, `/student/games/[gameId]/play`)**: 7 games (`read-escape`, `reading-detective`, `snake-ladder`, `email-escape`, `inbox-rescue`, `listening-quest`, `pubspeak-arena`) with real EEDI scoring.
- **Achievements (`/student/achievements`)**: Badges, milestones, XP tracking.
- **Payments (`/student/payments`)**: Direct course purchase, UPI verification, trial status tracking.
- **Profile & Plan (`/student/profile`, `/student/settings`)**: Account details, banner settings, theme toggle.

## 2. Trainer Portal (`/trainer/*`)
- **Dashboard (`/trainer/dashboard`)**: Hero banner, assigned batches overview, attendance percentage, pending evaluations queue.
- **My Batches (`/trainer/batches`, `/trainer/batches/[batchId]`)**: Batch rosters, attendance logs, schedule review.
- **Today's Classes (`/trainer/classes`)**: Daily schedule, live meeting room launch, WebRTC signaling.
- **Attendance (`/trainer/attendance`, `/trainer/attendance/[sessionId]`)**: Real-time roll call, heartbeat verification.
- **Participants (`/trainer/students`, `/trainer/students/[studentId]`)**: 360° participant performance, competency radar.
- **Evaluations (`/trainer/evaluations`, `/trainer/evaluations/new`)**: 6-parameter rubric scoring (Verbal, Non-Verbal, Content, Grammar, Confidence, Professional Presence).
- **Assignments (`/trainer/assignments`)**: Non-clipped modal, multi-format submissions (`TEXT`, `PDF`, `AUDIO`, `VIDEO`).
- **Course Progress (`/trainer/course-progress`)**: Cohort syllabus tracking.

## 3. SPOC / Department Portal (`/hod/*`)
- **Dashboard (`/hod/dashboard`)**: Department-scoped hero banner, participant readiness index, faculty assignments.
- **Participants (`/hod/participants`, `/hod/participants/[participantId]`)**: Department roster, 360° analytics, roll number lookup.
- **Session Attendance (`/hod/attendance`)**: Department session logs, attendance thresholds.
- **Trainers (`/hod/trainers`)**: Assigned faculty list and performance metrics.
- **Skill Assessment (`/hod/assessments`)**: Departmental score distribution.
- **Games & Activities (`/hod/games`)**: Cohort attempt history.
- **Enrollment (`/hod/enrollment`)**: Semester cohort assignment review.
- **Reports (`/hod/reports`)**: Department-segregated attendance, performance, and progress exports.

## 4. Institution Admin Portal (`/admin/*`)
- **Dashboard (`/admin/dashboard`)**: Institutional hero banner, multi-department metrics, trainer workload.
- **Departments & Batches (`/admin/departments`, `/admin/batches`)**: Department CRUD, HOD linking, batch creation.
- **Trainers & Access (`/admin/trainers`)**: Trainer directory, batch assignment and reassignment workflow with audit tracking.
- **Users & Roles (`/admin/users`)**: User creation and role changes strictly restricted to `TRAINER` and `STUDENT`.
- **Games (`/admin/games`)**: Read-only gamification catalog and attempt history analytics.
- **Reports & Analytics (`/admin/reports`)**: Institution-wide reports with `LEFT JOIN` safety on unassigned students.
- **Payments (`/admin/payments`)**: Institutional revenue and fee collection summary.
- **Bulk Import (`/admin/bulk-import`)**: CSV import with row-by-row validation.
- **System Health (`/admin/system`)**: Redis, PostgreSQL, and background worker telemetry.

## 5. Super Admin Portal (`/super-admin/*`)
- **Dashboard (`/super-admin`)**: Platform revenue, multi-campus metrics, global telemetry.
- **Colleges & Campuses (`/super-admin/colleges`)**: Institution onboarding and license management.
- **Users & Roles (`/super-admin/users`)**: Global user provisioning across all roles.
- **Courses & Catalog (`/super-admin/courses`, `[courseId]`)**: Curriculum authoring, permanent course deletion with re-authentication.
- **eBooks Publishing (`/super-admin/ebooks`)**: Review, approval, and publishing pipeline.
- **Payments & Revenue (`/super-admin/payments`)**: Transaction queue, payment verification.
- **Games Management (`/super-admin/games`)**: Question set publishing, difficulty calibration.
- **Super Admin Profile (`/super-admin/profile`)**: Personal telemetry, security events, active node counts.
- **AI & Telemetry (`/super-admin/system`)**: Global LLM and infrastructure monitoring.

