# IMPLEMENTATION ROADMAP — WINNERS CREEK LMS

**Execution Strategy:** Strict adherence to Phase execution order (Phase 1 through Phase 13), addressing root causes, enforcing server-side tenant isolation, eliminating obsolete features (Certificates, Placements, Trainer Payments), and validating each checkpoint against live database integration and end-to-end tests.

---

## Roadmap Checkpoints & Execution Order

```
[Phase 0: Reconciliation & Baseline Validation] -> COMPLETED
       │
[Phase 1: Core Architecture, Hierarchy & Security]
       │
[Phase 2: Admin Portal (Departments, Batches, Trainer Assignments, Reports)]
       │
[Phase 3: Admin Game Analytics (Read-Only Persistent Attempts)]
       │
[Phase 4: Trainer Portal (Live Classroom WebRTC, Assignments, E-Books, Messaging)]
       │
[Phase 5: SPOC / HOD Portal (Participant Directory, Detail View c337169b Fix, Attendance)]
       │
[Phase 6: Super Admin Portal (Game Lifecycle, Course Lifecycle, Profile 404 Fix)]
       │
[Phase 7: Participant Portal (E-Book Reader, PPT Presentation Coach, Audio Games)]
       │
[Phase 8: Removal of Certificates and Placement Functionality]
       │
[Phase 9: Database & Data Integrity Audit]
       │
[Phase 10: UI/UX Consistency & Layout Fixes]
       │
[Phase 11: End-to-End Automated & Integration Testing]
       │
[Phase 12: Automated Quality Gates (Build, Typecheck, Pytest, Lint)]
       │
[Phase 13: Final Production Readiness Verification & Reports]
```

---

## Detailed Task Matrix by Phase

### Phase 1: Core Architecture & Role Hierarchy
- **Hierarchy:** `SUPER_ADMIN` $\rightarrow$ `ADMIN` $\rightarrow$ `SPOC` $\rightarrow$ `TRAINER` $\rightarrow$ `PARTICIPANT`.
- **Tenant Isolation:** Enforce `institution_id` checks on all endpoints; prevent cross-institution user creation or assignment.
- **Display Names & Salutations:** Implement configurable/neutral professional titles (Dr., Prof., Mr., Ms., etc.) for Trainers, Admins, Super Admins, and SPOCs. Participants must not have salutations.
- **Admin User Management Filter:** Expose only `TRAINER` and `PARTICIPANT` roles in the Admin creation UI and API.

### Phase 2: Admin Portal Stabilization
- **Task 2.1: Fix Departments Page Crash (`/admin/departments`):**
  - Diagnose error on `GET /api/v1/admin/departments` and Next.js page state.
  - Ensure department listing, creation, editing, deletion, and semester mapping query PostgreSQL correctly.
- **Task 2.2: Complete Trainer-Batch Assignment Management:**
  - Full workflow: View assigned batches $\rightarrow$ Assign new batch $\rightarrow$ Edit assignment (schedule, dates) $\rightarrow$ Reassign to another batch $\rightarrow$ Unassign (preserving historical attendance/scores).
  - Prevent duplicate active assignments; validate trainer availability.
- **Task 2.3: Restrict Role Creation to Trainer & Participant:**
  - Remove all other roles from Admin user creation modal and enforce server-side validation.
- **Task 2.4: Fix Reporting Pipeline & Downloads:**
  - Implement complete authorized dataset pagination avoiding truncation.
  - Add filters: Department, Academic Year, Semester, Batch, Enrollment Status, Attendance Range, Date Range.
  - Delete Placement Readiness and Certification reports completely.

### Phase 3: Admin Game Management
- **Read-Only Analytics:** Admin can view games, attempts, accuracy, time taken, score, and skill competency evidence per participant/batch/department.
- **Restriction:** Remove ability for Admin to publish/unpublish or disable games (Super Admin only).
- **Persistent Data:** Ensure all analytics query `game_attempts` table.

### Phase 4: Trainer Portal
- **Task 4.1: Live Classroom (WebRTC & Server Attendance):**
  - Visibility rules: Participant sees Trainer & Screen only (no other participants); Trainer sees all participants and connection states.
  - Server-calculated attendance threshold (e.g. 75% duration via periodic server heartbeats, not frontend timers).
- **Task 4.2: Assignment Management:**
  - Fix assignment dialog bug (controls hidden on text toggle).
  - Multimedia submission support: Text, PDF, Audio recording/upload, Video recording/upload.
- **Task 4.3: E-Book Upload:**
  - Direct device upload (PDF, EPUB) with upload progress, validation, and metadata.
- **Task 4.4: Messaging System:**
  - Strict permissions: Participants can only message assigned Trainers; Trainers can only message authorized batch participants; no cross-institution chats.
  - Incremental debounced search by Name or Institution ID.
- **Task 4.5: Batch Insights & Weak Skills:**
  - Real-time batch monitoring from persisted `game_attempts`.
- **Task 4.6: Remove Trainer Payments:**
  - Delete `/trainer/payments` route, sidebar menu entry, and backend router access.
- **Task 4.7: Direct Learning Material Uploads & Protected Playback:**
  - Direct device upload for PDFs, presentations, audio, video, and class recordings.
  - Authenticated streaming, signed expiring URLs, and playback progress tracking for recorded classes.

### Phase 5: SPOC / HOD Portal
- **Task 5.1: Remove Irrelevant Scope UI:**
  - Remove "Other Departments" and "Other Colleges" sections from HOD portal.
- **Task 5.2: Participant Directory:**
  - Add filters: Academic Year, Branch, Semester, Batch, Attendance Criteria, Enrollment Status.
  - Fix multi-page pagination.
- **Task 5.3: Fix Participant Detail Page ("Participant not found" error `c337169b`):**
  - Resolve identifier mismatch between UUID and roll number in `/hod/participants/[participantId]`.
  - Display unified 10-section profile populated from PostgreSQL.
- **Task 5.4: Attendance & Assessment Consistency:**
  - Harmonize calculations between Admin reports and HOD attendance records.

### Phase 6: Super Admin Portal
- **Task 6.1: Game Lifecycle:**
  - Create, edit, publish, unpublish, archive, configure, and inspect platform games.
- **Task 6.2: Course Lifecycle & Permanent Deletion:**
  - Unpublish: Remove from discovery while preserving historical records.
  - Permanent Deletion: Require Super Admin password reauthentication, explicit confirmation dialog, dependency check, and audit log.
- **Task 6.3: College & Campus Management:**
  - Comprehensive institution overview; permanent delete with reauthentication.
- **Task 6.4: Fix Super Admin Profile (`/super_admin/profile` 404):**
  - Implement `/super-admin/profile` route and API integration.
- **Task 6.5: Restrict AI Usage Telemetry:**
  - Remove AI usage sections from Admin, Trainer, SPOC, and Student portals; expose strictly to Super Admin.

### Phase 7: Participant Portal
- **Task 7.1: E-Book Reader:**
  - Resume reading, progress tracking, and clear error messaging.
- **Task 7.2: Practice Lab PowerPoint Upload:**
  - PPT/PPTX file upload and analysis in Presentation Coach.
- **Task 7.3: Gamified Labs & Audio Fixes:**
  - Audit all 7 games: `read-escape`, `reading-detective`, `snake-ladder`, `email-escape`, `inbox-rescue`, `listening-quest`, `pubspeak-arena`.
  - Fix audio context playback, user-initiated unlocks, next-level question navigation, and attempt persistence.

### Phase 8: Certificates & Placement Removal
- Delete all Certificate routes (`/student/achievements` certs, `/hod/certificates`), components, reports, and API handlers.
- Delete all Placement routes (`/placement`, `/recruiter`, `/student/placement-goal`), components, reports, and API handlers.

### Phase 9: Database & Data Integrity Audit
- Audit PostgreSQL foreign keys, unique indexes, cascading rules, tenant isolation, and UUID consistency.

### Phase 10: UI/UX Consistency
- Audit dialogs, forms, empty states, error states, and responsive layouts across all 4 roles.

### Phase 11: End-to-End Automated & Integration Testing
- Execute the 11 comprehensive end-to-end integration workflows with isolated test accounts.

### Phase 12: Automated Quality Gates
- TypeScript typecheck, Vitest unit suite, Pytest suite, and Next.js production build.

### Phase 13: Final Reports & Production Verification
- Generate final production readiness documentation.
