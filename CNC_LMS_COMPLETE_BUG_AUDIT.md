# CNC LMS / Winners Creek — Complete Bug Audit Report

**Date:** November 15, 2026  
**Auditor:** Senior Full-Stack Engineer, QA Automation Engineer, Backend Architect & DevOps Engineer  
**Repository:** `C:\Users\SANDEEP\Desktop\skillsharp`  
**Git Branch:** `main`  
**Active Production Commit:** `1e8ec4a`  
**Production Backend:** `https://cnc-backend-qzmb.onrender.com`  
**Production Frontend:** `https://cnc-lms.vercel.app`  

---

## 1. Consolidated Defect Register

| Issue ID | Original Description | Affected Role & Page | Severity | Previous Fix Claimed | Reproduction Result | Current Code Status | Final Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **BUG-001** | Sign-in redirect destination lost on login | All Roles (`/login`) | Major | Query param preservation (`next`, `returnUrl`) | Preserved in `useSearchParams` and route guard | Fully active in auth flow | **ALREADY FIXED** |
| **BUG-002** | False duplicate roll number across institutions | Student / Registration (`/auth/signup`) | High | Scoped roll number uniqueness by `institution_id` | Scoped in `auth_repo.py` queries | Verified in `test_auth.py` | **ALREADY FIXED** |
| **BUG-003** | Missing password visibility eye toggle | All Roles (`/(auth)/*`) | Minor | Eye / EyeOff accessible button added | Present in login, signup, reset | Verified in `password-strength.test.tsx` | **ALREADY FIXED** |
| **BUG-004** | Missing academic year class grouping | HOD (`/hod/participants`) | Medium | Mapped academic year to semester cohorts (3-4, 5-6, 7-8) | Filter verified across batches & semesters | Verified in `test_hod_portal.py` | **ALREADY FIXED** |
| **BUG-005** | Super Admin Arya College Control Center resolution failure | Super Admin (`/super-admin/colleges/{id}`) | Critical | Resolves Arya College UUID and ACEIT code | Returns complete operational data without 500 | Verified in `test_operations_center.py` | **ALREADY FIXED** |
| **BUG-006** | Text overflow in Courses and Catalog cards | Public / Student (`/courses`) | Minor | Responsive flex grids with `min-w-0` and truncation | Active on course cards and catalog | Verified in unit tests | **ALREADY FIXED** |
| **BUG-007** | YouTube link does not open | Student / Learning | Minor | Destination link corrected with safe z-index | Opens in external tab safely | Verified | **ALREADY FIXED** |
| **BUG-S01** | Course Learning navigation tab bar overflow on small viewports (320px–430px) | Student (`/student/learning/[courseId]`) | High | Claimed responsive layout | **CONFIRMED REPRODUCED**: 5 action tabs with `w-fit` lacked horizontal scroll container, causing 665px width overflow on mobile screens | Wrapped in `w-full overflow-x-auto scroll-thin` with `shrink-0 whitespace-nowrap` | **FIXED AND VERIFIED** |
| **BUG-S02** | Student Information and Profile field clipping on small screens | Student (`/student/profile`) | Medium | Claimed responsive layout | **CONFIRMED REPRODUCED**: `DetailList` component rendered side-by-side flex without `min-w-0` or `break-words`, clipping long emails and batches | Converted to responsive `flex-col sm:flex-row` with `break-words min-w-0` | **FIXED AND VERIFIED** |
| **BUG-S03** | Live Classroom mobile controls outside viewport | Student / Trainer (`/live-classes/[id]/room`) | High | Safe area padding & touch manipulation | Verified touch-manipulation padding and responsive button sizing | Verified in `test_live_classes.py` (4/4 passed) | **ALREADY FIXED** |
| **BUG-S04** | Resume Analyzer upload failure for legacy binary Word documents (.doc) | Student (`/student/resume-analyzer`) | High | Multi-format support claimed | **CONFIRMED REPRODUCED**: While `.doc` was whitelisted in content validation, `upload_resume` had no extractor for `.doc`, leaving text empty | Added regex-based binary stream text parser for `.doc` files; added `.md` to picker | **FIXED AND VERIFIED** |
| **BUG-T01** | New Evaluation student selection matching mismatch | Trainer (`/trainer/evaluations/new`) | High | Scoped batch student list claimed | **CONFIRMED REPRODUCED**: Student selection looked up only `row.userId`, failing if query parameter or route returned `row.id` | Implemented resilient lookup matching `row.userId \|\| row.id` | **FIXED AND VERIFIED** |
| **BUG-T02** | AI Practice Scores pagination controls undefined | Trainer (`/trainer/evaluations`) | Medium | Practice score retrieval claimed | **CONFIRMED REPRODUCED**: Backend returns top-level `page`/`pageSize`/`total`/`pages`, leaving `raw.pagination` undefined on frontend | Added fallback pagination normalization object | **FIXED AND VERIFIED** |
| **BUG-T03** | Interactive Games Snake & Ladder and GameRunner HUD mobile overflow | Student / Games (`/student/games/*`) | High | Responsive games claimed | **CONFIRMED REPRODUCED**: GameRunner HUD status bar lacked `flex-wrap`, and Snake & Ladder 10x10 board cells overflowed on 320px viewports | Added `flex-wrap` to HUD and compact mobile cell styles (`p-0.5`, `text-[8px]`) | **FIXED AND VERIFIED** |
| **TRN001-011** | Trainer Portal 11 Reported Issues (Banner, Capacity, Sessions, Attention, Evaluations, AI Scores, Assignments, Analytics, Reports, Logo) | Trainer Portal | Various | Engineering fixes applied | Verified against PostgreSQL database tables | 29/29 tests passed in `test_trainer_workflows.py` | **ALREADY FIXED** |
| **STU001-006** | Student Portal & Practice Lab (PDF, Audio, Lesson Complete, Presentation, ATS, Live Controls) | Student Portal | Various | Engineering fixes applied | Verified against endpoints and database | 35/35 tests passed in `test_student_journey.py` | **ALREADY FIXED** |
| **DEF-EXT-001** | Third-Party Hosted AI Provider Credentials | Production AI | External | Vendor API keys configured in `.env` | Render Dashboard UI requires manual key entry | Documented in `CNC_LMS_RENDER_CONFIGURATION_REPORT.md` | **BLOCKED (External Credential Entry)** |
| **DEF-EXT-002** | Outbound Production SMTP Credentials | Authentication / Email | External | Verification bypass enabled in staging | SES / SendGrid credentials required for outbound mail | Operational risk noted | **INFORMATIONAL** |

---

## 2. In-Depth Verification of the Six Specific Audit Issues

### A. Student / Participant Portal
1. **Course Learning, Student Information & Profile Overflow (Bug 1)**
   - **Test Viewports:** 320px, 360px, 375px, 390px, 430px, 768px, 1024px, 1366px.
   - **Findings:** `apps/web/src/app/student/learning/[courseId]/page.tsx` line 190 contained 5 action buttons in a `w-fit` flex container totaling 665px. Fixed by introducing an outer `w-full overflow-x-auto scroll-thin pb-1` scroll wrapper and `shrink-0 whitespace-nowrap` on all tab triggers. In `apps/web/src/components/shared/misc.tsx`, `DetailList` was updated to `flex-col sm:flex-row min-w-0 break-words`.
   - **Status:** **FIXED AND VERIFIED**.
2. **Live Classroom Meeting Controls (Bug 2)**
   - **Verification:** Verified `apps/web/src/app/live-classes/[id]/room/page.tsx` footer controls: mic toggle, camera toggle, screen sharing, raise hand, chat drawer, participants list, leave/end class. Safe-area inset `pb-[max(0.625rem,env(safe-area-inset-bottom))]` and `touch-manipulation` classes verified.
   - **Status:** **ALREADY FIXED & VERIFIED** (`test_live_classes.py` 4/4 passed).
3. **Resume Analyzer Upload Failure (Bug 3)**
   - **Findings:** In `apps/api/app/routers/student.py`, `.doc` files were accepted by the extension whitelist but fell through all `if/elif` blocks, leaving `text = ""` and triggering "Uploaded resume text is too short or empty". Implemented binary stream ASCII/UTF-16 text extraction for Word 97-2003 `.doc` files. Added `.md` support to `accept` in `apps/web/src/app/student/resume-analyzer/page.tsx`.
   - **Status:** **FIXED AND VERIFIED** (`test_resume_doc_parsing.py` passed).

### B. Trainer Portal
4. **New Evaluation — Student Name Selection (Bug 4)**
   - **Findings:** In `apps/web/src/app/trainer/evaluations/new/page.tsx`, selection matching compared only `row.userId === studentUserId`. If a route or query passed `row.id`, the chosen student details remained unrendered. Updated to `(row.userId === studentUserId || row.id === studentUserId)`. Scoping via `batch_trainers` confirmed in backend (`test_trainer_workflows.py`).
   - **Status:** **FIXED AND VERIFIED**.
5. **AI Practice Scores Not Loading (Bug 5)**
   - **Findings:** The backend endpoint `/trainer/ai-scores` returns top-level `page`, `pageSize`, `total`, `pages`. In `apps/web/src/app/trainer/evaluations/page.tsx`, `select` mapped `raw.pagination`, which was `undefined`. Added fallback normalization `raw.pagination ?? { page: raw.page, pageSize: raw.pageSize, total: raw.total, pages: raw.pages }`.
   - **Status:** **FIXED AND VERIFIED**.
6. **Interactive Games Mobile Overflow (Bug 6)**
   - **Findings:** In `apps/web/src/components/games/GameRunner.tsx`, the top HUD status row contained 6 items in an unwrap flex container reaching 350px width, clipping on 320px screens. Added `flex-wrap gap-1.5 sm:gap-3`. In `SnakeAndLadderGame.tsx`, the 10x10 board cells now feature responsive padding (`p-0.5 sm:p-1`), compact cell sizing, and truncated badges to fit mobile viewports cleanly.
   - **Status:** **FIXED AND VERIFIED**.
