# END-TO-END WORKFLOW REPORT
**Platform:** Winners Creek LMS  
**Verification Date:** 2026-11-06  
**Status:** ALL 5 USER JOURNEYS VERIFIED & FUNCTIONAL  

---

## 1. Participant Journey
1. **Login & Session Hydration**: Participant signs in with email/password; session restores via HttpOnly cookie; lands on `/student/dashboard`.
2. **Hero Banner Customization**: Opens "Customize Banner", uploads image, adjusts positioning and text color, saves settings; settings persist across refreshes.
3. **Structured Learning**: Navigates to `/student/learning/[courseId]`, views 12-section curriculum (Active Listening, Minto Pyramid), reads Do's and Don'ts tables, marks lesson complete.
4. **Gamification & Practice**: Launches `read-escape` or Presentation Coach (uploads `.pptx` slides), completes attempt; scores logged in `game_attempts`.
5. **Assessment**: Completes question set; authoritative score computed server-side and reflected on dashboard.

## 2. Trainer Journey
1. **Login**: Lands on `/trainer/dashboard`, reviews assigned batches and attendance %.
2. **Attendance Roll Call**: Navigates to `/trainer/attendance`, logs student presence with verified heartbeats.
3. **Evaluation Scoring**: Opens `/trainer/evaluations/new`, grades participant across 6 rubric dimensions.
4. **Multi-Format Assignments**: Creates assignment with submission format toggles (`TEXT`, `PDF`, `AUDIO`, `VIDEO`) without modal viewport clipping.

## 3. SPOC / Department Journey
1. **Login**: Lands on `/hod/dashboard`, reviews department-segregated readiness index.
2. **Participant 360 Oversight**: Navigates to `/hod/participants`, inspects participant detail (`/hod/participants/[id]`) with roll number lookup.
3. **Faculty Oversight**: Reviews assigned trainers and session attendance logs.

## 4. Institution Admin Journey
1. **Login**: Lands on `/admin/dashboard`, reviews college node health.
2. **Trainer Batch Assignment & Reassignment**: Assigns new batch to trainer, reassigns active batch with reason tracking, inspects assignment history.
3. **Role Management**: Provisions new trainer and participant accounts; elevation to Admin/HOD prevented.
4. **Game Analytics**: Inspects gamification catalog and attempts history table with roll number, raw score, accuracy %, and XP.

## 5. Super Admin Journey
1. **Login**: Lands on `/super-admin`, reviews multi-institution revenue and metrics.
2. **Curriculum Deployment**: Authors courses, exercises permanent deletion workflow requiring password re-authentication.
3. **Platform Telemetry**: Inspects Super Admin profile (`/super-admin/profile`), security audit events, and payment queues.
