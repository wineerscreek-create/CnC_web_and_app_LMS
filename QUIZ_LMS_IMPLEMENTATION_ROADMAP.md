# QUIZ & LMS INTEGRATION IMPLEMENTATION ROADMAP

**Document:** `QUIZ_LMS_IMPLEMENTATION_ROADMAP.md`  
**Status:** Approved Technical Execution Roadmap (Pending User Implementation Approval)  
**Target Repository:** `C:\Users\SANDEEP\Desktop\skillsharp`  
**Execution Constraint:** **READ-ONLY AUDIT STAGE. NO CODE MODIFICATIONS WITHOUT EXPLICIT USER APPROVAL.**  

---

## ROADMAP OVERVIEW & EXECUTION STRATEGY

This roadmap defines a 9-phase execution plan to integrate the Original Quiz Platform (`apps/quiz-system-v17-cloudflare/quiz-system`) into Winners Creek LMS (`CnC_web_and_app_LMS`) without losing, simplifying, replacing, or breaking any existing functionality.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            EXECUTION PHASES                                 │
│                                                                             │
│  Phase 1: Token Bridge & Identity Mapping                                   │
│     │                                                                       │
│  Phase 2: Proctored Student Exam Engine (One-at-a-time, Palette, Autosave)  │
│     │                                                                       │
│  Phase 3: Camera Capture & Anti-Cheat Subsystem (CameraFeed, useAntiCheat)  │
│     │                                                                       │
│  Phase 4: Real-Time WebSocket Infrastructure (Relay Hub & Presence)         │
│     │                                                                       │
│  Phase 5: Trainer Live Monitoring Dashboard (Monitor.jsx, Live Camera Grid) │
│     │                                                                       │
│  Phase 6: Multi-Batch Assessment & CSV Question Bank Management             │
│     │                                                                       │
│  Phase 7: Result Processing & Excel Export with Embedded Photos (ExcelJS)   │
│     │                                                                       │
│  Phase 8: Offline-First Synchronization & Dexie Graceful Fallback           │
│     │                                                                       │
│  Phase 9: Comprehensive End-to-End Testing & Security Verification          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## PHASE 1: TOKEN BRIDGE & IDENTITY MAPPING

### Objective
Establish a secure, short-lived SSO launch token mechanism bridging authenticated LMS students and trainers into the proctored assessment execution environment with strict batch scoping.

### Files Likely to Change
- `apps/api/app/routers/student.py`
- `apps/api/app/routers/trainer.py`
- `apps/api/app/repositories/assignment_quiz_repo.py`
- `apps/web/src/lib/api.ts`

### Backend Work
- Verify and harden `POST /student/assessments/{quiz_id}/launch-token` to issue cryptographically signed HS256 tokens carrying `sub` (user UUID), `name`, `roll_number`, `batch_id`, `batch_name`, `quiz_id`, and `role: "student"`.
- Implement `POST /trainer/assessments/{quiz_id}/monitor-token` to issue supervisor monitoring tokens carrying trainer identity and authorized `batch_ids`.
- Validate token claims against LMS `SECRET_KEY`.

### Frontend Work
- Update assessment launch triggers to request launch tokens prior to mounting the exam engine.
- Store launch tokens in session memory (`sessionStorage`) to prevent cross-tab contamination.

### Database Changes
- None (Uses existing `users`, `student_profiles`, `batches`, and `quizzes` tables).

### Security Requirements
- Tokens must expire within 30 minutes.
- Enforce strict batch enrollment checks before issuing tokens.
- Prohibit students from generating tokens for unassigned or closed assessments.

### Test Cases
1. *Valid Student Token Generation:* Enrolled student in assigned batch receives valid token.
2. *Unenrolled Student Rejection:* Student outside assigned batch receives 403 Forbidden.
3. *Closed Assessment Rejection:* Attempting to generate token for an expired quiz receives 400 BusinessRuleViolation.

### Acceptance Criteria
- Valid JWT token returned with correct claims.
- Decoded token accurately represents student identity, roll number, and batch membership.

### Dependencies
- None.

### Estimated Complexity
- **Low** (1 day)

---

## PHASE 2: PROCTORED STUDENT EXAM ENGINE

### Objective
Restore the original sequential, one-question-at-a-time exam engine (`QuizEngine.jsx`) with question palette navigation, progress bar, multi-type questions, and instant answer persistence.

### Files Likely to Change
- `apps/web/src/app/student/assessments/[quizId]/page.tsx`
- `apps/web/src/components/quiz/QuestionPalette.tsx`
- `apps/web/src/components/quiz/Timer.tsx`
- `apps/web/src/hooks/useTimer.ts`
- `apps/api/app/routers/student.py`

### Backend Work
- Support sequential question fetching endpoint (`GET /student/assessments/{quiz_id}/questions/{question_id}`) that strictly filters out correct answer keys.
- Implement palette state endpoint (`GET /student/assessments/{quiz_id}/palette`) returning question status (`not_visited`, `answered`, `marked_for_review`).
- Implement per-question answer autosave (`POST /student/assessments/{quiz_id}/answer`).

### Frontend Work
- Port `QuizEngine.jsx` into TypeScript within `apps/web/src/app/student/assessments/[quizId]/page.tsx`.
- Replace the current vertical scroll list with the focused single-question view.
- Port `QuestionPalette.jsx` with color-coded status badges and direct question jumping.
- Port `useTimer.ts` and `Timer.tsx` with authoritative countdown synchronization.
- Implement question type renderers: `mcq_single` (radio), `mcq_multiple` (checkbox), and `numerical` (input).
- Wire instant answer save on navigation ("Previous", "Next", "Save", "Mark for Review") plus 5-second safety autosave.

### Database Changes
- None (Answer state can be held in attempt draft or persisted to `quiz_attempts.answers` JSONB).

### Security Requirements
- Ensure `correct_answer` is **never** sent to the client during the exam attempt.
- Server-side validation of question IDs to prevent out-of-bounds answer injection.

### Test Cases
1. *Sequential Navigation:* Student can navigate Next/Previous and jump via palette.
2. *Autosave Reliability:* Refreshing the page restores previously answered selections.
3. *Answer Security:* Inspecting DOM and network payloads reveals zero correct answer flags.

### Acceptance Criteria
- Questions render one at a time.
- Palette colors update dynamically as questions are answered or marked for review.
- Progress bar accurately reflects completion percentage.

### Dependencies
- Phase 1 (Launch token).

### Estimated Complexity
- **Medium** (2 days)

---

## PHASE 3: CAMERA CAPTURE & ANTI-CHEAT SUBSYSTEM

### Objective
Restore client-side canvas snapshotting (`CameraFeed.jsx`) and the comprehensive anti-cheat enforcement hook (`useAntiCheat.js`).

### Files Likely to Change
- `apps/web/src/components/quiz/CameraFeed.tsx`
- `apps/web/src/hooks/useAntiCheat.ts`
- `apps/web/src/app/student/assessments/[quizId]/page.tsx`
- `apps/api/app/routers/student.py`

### Backend Work
- Support warning logging endpoint (`POST /student/assessments/{quiz_id}/warning`) that records violation events and returns updated `warning_count` and `auto_submit: boolean`.
- Implement camera and fullscreen status tracking endpoints (`/student/camera-status`, `/student/fullscreen-status`).

### Frontend Work
- Port `CameraFeed.jsx` to `apps/web/src/components/quiz/CameraFeed.tsx`:
  - `navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })`.
  - Hidden `<canvas>` exporting JPEG blob at `quality: 0.62` every 5000ms.
  - FileReader conversion to base64 DataURL for WebSocket transmission.
  - Hardware disconnection and permission revocation error handling.
- Port `useAntiCheat.js` to `apps/web/src/hooks/useAntiCheat.ts`:
  - Fullscreen enforcement and exit detection (`fullscreenchange`).
  - Tab switch and background detection (`visibilitychange`, `window.onblur`).
  - Context menu and right-click suppression (`contextmenu`).
  - Copy, paste, cut, and text selection suppression.
  - DevTools shortcut blocking (`F12`, `Ctrl+Shift+I/J/C`, `Ctrl+U`) and window dimension delta heuristic ($> 160\text{px}$).
  - Browser back-button trapping (`popstate`, `pushState`).
  - Page refresh confirmation (`beforeunload`).
  - Auto-submit trigger when `warning_count >= max_warnings`.

### Database Changes
- None (Violations recorded in `quiz_attempts.warning_count` and warning detail arrays).

### Security Requirements
- Video stream must remain local; only compressed JPEG frames are transmitted.
- Server must validate base64 string length and reject payloads exceeding 200KB.

### Test Cases
1. *Camera Active:* Video stream displays locally; canvas captures JPEG snapshots every 5s.
2. *Fullscreen Exit Violation:* Exiting fullscreen increments warning count and displays alert.
3. *Tab Switch Violation:* Backgrounding tab triggers warning.
4. *DevTools Suppression:* Pressing F12 or Ctrl+Shift+I is blocked and logged as warning.
5. *Auto-Submit on Limit:* Reaching max warnings triggers automatic submission.

### Acceptance Criteria
- Camera feed operates smoothly without page lag.
- All 8 anti-cheat rules actively detect and report violations.

### Dependencies
- Phase 2 (Student engine).

### Estimated Complexity
- **Medium** (2 days)

---

## PHASE 4: REAL-TIME WEBSOCKET INFRASTRUCTURE

### Objective
Establish the real-time bi-directional transport connecting student exam clients to supervisor monitoring rooms for live camera snapshots, heartbeats, and warning events.

### Files Likely to Change
- `apps/api/app/websocket/hub.py` (New FastAPI WebSocket hub or integrate Socket.IO)
- `apps/api/app/main.py`
- `apps/web/src/lib/quiz/socket.ts`

### Backend Work
- Deploy a WebSocket room router supporting:
  - Room `quiz:{quiz_id}:admin`: Subscribed by authorized trainers/admins.
  - Room `quiz:{quiz_id}:student`: Subscribed by active exam candidates.
- Message routing:
  - Relay incoming `camera_snapshot` from student to `quiz:{quiz_id}:admin`.
  - Relay `warning`, `student_joined`, `student_status`, `answer_saved`, and `submit` events.
  - Handle `heartbeat` event and return authoritative `remaining_seconds`.
- Authenticate WebSocket handshakes using the JWT launch token.

### Frontend Work
- Port `socket.js` into a robust TypeScript client `apps/web/src/lib/quiz/socket.ts`:
  - Automatic reconnection with exponential backoff.
  - State management (`connected`, `reconnecting`, `disconnected`).
  - Queueing outgoing frames during brief connection hiccups.

### Database Changes
- None.

### Security Requirements
- Validate token role and batch permissions during WebSocket handshake.
- Enforce strict frame rate limiting (max 1 frame per 4s per student).

### Test Cases
1. *Socket Authentication:* Connecting with valid token succeeds; invalid token fails with 401.
2. *Room Segregation:* Trainer watching Quiz A receives zero events from Quiz B.
3. *Snapshot Relay:* Base64 camera frame emitted by student arrives at trainer socket within 250ms.

### Acceptance Criteria
- End-to-end WebSocket communication established.
- Low-latency delivery of proctoring events and snapshots.

### Dependencies
- Phase 1 (Launch tokens).

### Estimated Complexity
- **High** (3 days)

---

## PHASE 5: TRAINER LIVE MONITORING DASHBOARD

### Objective
Integrate the complete supervisor monitoring dashboard (`Monitor.jsx`) into the LMS trainer portal, providing a real-time student grid, live camera thumbnails, card gallery, and proctoring warnings.

### Files Likely to Change
- `apps/web/src/app/trainer/assessments/[quizId]/monitor/page.tsx`
- `apps/web/src/components/quiz/TrainerMonitor.tsx`
- `apps/web/src/app/trainer/assessments/page.tsx`
- `apps/api/app/routers/trainer.py`

### Backend Work
- Implement `GET /trainer/assessments/{quiz_id}/monitor` returning active candidate session states (roll number, name, current question, remaining seconds, warnings, camera status, online status, last seen age).
- Implement `POST /trainer/assessments/{quiz_id}/force-end` allowing trainers to terminate an exam and auto-submit all in-progress papers.

### Frontend Work
- Port `Monitor.jsx` into Next.js App Router:
  - Live table rendering columns: Roll Number, Name, Current Q, Time Left, Warnings, Camera Thumbnail, Fullscreen, Online, Status, Last Seen.
  - Live Camera Card Gallery rendering individual student video cards.
  - Live activity feed showing join, answer, warning, and submit toasts.
  - Memory leak protection via `URL.revokeObjectURL(url)` on snapshot updates and student disconnects.
  - Dynamic stale student highlighting when heartbeat exceeds 45 seconds.
  - "End Quiz" modal and action.
- Add "Monitor Live" button to `apps/web/src/app/trainer/assessments/page.tsx`.

### Database Changes
- None.

### Security Requirements
- Strict RBAC: trainers can only monitor assessments assigned to their authorized batches.

### Test Cases
1. *Live Candidate Grid:* All started students appear with live timers.
2. *Real-Time Thumbnail Updates:* Student camera snapshot changes every 5 seconds on the monitor.
3. *Warning Toast:* Anti-cheat violation in student browser triggers immediate alert on trainer screen.
4. *Memory Stability:* Monitoring 50 students for 30 minutes shows zero browser memory leaks.

### Acceptance Criteria
- Trainer dashboard renders live photos, student progress, and proctoring events in real time.

### Dependencies
- Phase 4 (WebSocket hub).

### Estimated Complexity
- **High** (3 days)

---

## PHASE 6: MULTI-BATCH ASSESSMENT & CSV QUESTION MANAGEMENT

### Objective
Ensure seamless creation, editing, scheduling, CSV question bank upload, and multi-batch assignment across the LMS database.

### Files Likely to Change
- `apps/web/src/app/trainer/assessments/page.tsx`
- `apps/api/app/routers/trainer.py`
- `apps/api/app/repositories/assignment_quiz_repo.py`

### Backend Work
- Verify CSV upload endpoint (`POST /trainer/assessments/{quiz_id}/upload-csv`) enforces all-or-nothing validation rules:
  - Missing options, duplicate questions, invalid answers, blank questions, positive marks, negative marks, and EEDI tags (`eedi_index`, `eedi_term`).
- Ensure multi-batch assignment endpoint (`POST /trainer/assessments/{quiz_id}/assign-batches`) enforces strict `batch_trainers` validation.

### Frontend Work
- Enhance CSV upload modal with clear error reporting highlighting specific failing row numbers and reasons.
- Ensure batch selection UI allows selecting multiple batches simultaneously with clear authorization indicators.

### Database Changes
- None (PostgreSQL schema is fully defined).

### Security Requirements
- Anti-IDOR validation on every batch ID during assignment.
- Validate CSV file size and sanitize text inputs against XSS.

### Test Cases
1. *Valid CSV Upload:* 50-question CSV with EEDI tags uploads successfully.
2. *Invalid CSV Rejection:* Row with missing Option B is rejected with explicit row error.
3. *Unauthorized Batch Assignment:* Assigning to an unauthorized batch is rejected with 403 Forbidden.

### Acceptance Criteria
- Full CSV validation matches original platform rules.
- Multi-batch assignments persist correctly in `quiz_batch_assignments`.

### Dependencies
- None.

### Estimated Complexity
- **Low** (1 day)

---

## PHASE 7: RESULT PROCESSING & EXCEL EXPORT WITH EMBEDDED PHOTOS

### Objective
Restore client-side `exceljs` export to generate professional Excel workbooks embedding up to 10 representative camera photos per student, alongside full score rankings.

### Files Likely to Change
- `apps/web/src/lib/quiz/excelExport.ts`
- `apps/web/src/lib/quiz/cameraSnapshots.ts`
- `apps/web/src/app/trainer/assessments/[quizId]/monitor/page.tsx`
- `apps/web/src/app/trainer/assessments/page.tsx`

### Backend Work
- Verify results endpoint (`GET /trainer/assessments/{quiz_id}/results`) returns complete attempt records, rankings, and scores scoped to trainer batches.

### Frontend Work
- Port `cameraSnapshots.js` (Algorithm R Reservoir Sampling) to collect at most 10 representative frames per student in browser memory during live monitoring.
- Implement `downloadExcel` using dynamic import `const ExcelJS = await import("exceljs")`:
  - Sheet 1: `"Results"` with Rank, Roll Number, Name, Correct, Wrong, Marks, Percentage, Result, Warnings.
  - Sheet 2: `"Camera Snapshots"` with Student, Roll Number, and Snapshots 1 through 10.
  - Row height set to 92 points; embeds base64 JPEG buffers directly into grid cells.
  - Generates downloadable `results-with-camera-snapshots.xlsx`.
- Add CSV export option for raw data downloads.

### Database Changes
- None.

### Security Requirements
- Ensure results export is accessible only to authorized trainers and administrators.

### Test Cases
1. *Excel Generation:* Clicking "Export Excel" generates valid `.xlsx` workbook.
2. *Embedded Photos:* Opening workbook in Microsoft Excel or LibreOffice displays visible JPEG webcam photos in the "Camera Snapshots" sheet.
3. *Rank Accuracy:* Results sheet accurately ranks students by score descending.

### Acceptance Criteria
- Excel file downloads seamlessly.
- Camera photos render correctly inside worksheet cells without corruption.

### Dependencies
- Phase 3 & 5 (Camera capture and live monitor).

### Estimated Complexity
- **Medium** (2 days)

---

## PHASE 8: OFFLINE-FIRST SYNCHRONIZATION & DEXIE FALLBACK

### Objective
Ensure that if a student loses internet connectivity during an ongoing assessment, the proctored exam engine gracefully falls back to local Dexie IndexedDB persistence and queues the submission in the durable outbox.

### Files Likely to Change
- `apps/web/src/app/student/assessments/[quizId]/page.tsx`
- `apps/web/src/lib/offline/db.ts`
- `apps/web/src/lib/offline/syncEngine.ts`

### Backend Work
- Verify `/student/assessments/{quiz_id}/attempts` handles offline outbox sync idempotently using `attemptId`.

### Frontend Work
- Ensure `QuizEngine` reads questions from `offlineDB.downloadedQuestionSets` if network fetch fails.
- Persist in-progress answer changes to `offlineDB.assessmentDrafts`.
- On submission failure due to network drop:
  - Enqueue attempt into `offlineDB.outboxRecords`.
  - Display non-blocking success toast: `"Assessment attempt saved offline. It will synchronize automatically when online."`
  - Trigger `syncEngine.processOutbox()` when `online` event fires.

### Database Changes
- None.

### Security Requirements
- Validate offline authorization timestamps (`authorizationExpiresAt`) before allowing offline exam starts.

### Test Cases
1. *Network Disconnection:* Disconnecting network during exam allows continued answering.
2. *Offline Submission:* Submitting while offline queues paper in IndexedDB outbox.
3. *Online Resumption:* Reconnecting network auto-submits paper to PostgreSQL backend.

### Acceptance Criteria
- Zero data loss during network interruptions.
- Offline attempts sync reliably upon reconnection.

### Dependencies
- Phase 2 (Student engine).

### Estimated Complexity
- **Medium** (2 days)

---

## PHASE 9: END-TO-END TESTING & SECURITY VERIFICATION

### Objective
Execute comprehensive regression testing, load verification, anti-tamper testing, and security hardening across all portals.

### Files Likely to Change
- Test scripts and end-to-end verification suites.

### Testing Scope
1. **Student Journey:** Login $\to$ Launch token $\to$ Camera test $\to$ Fullscreen agreement $\to$ One-at-a-time exam $\to$ Navigation & autosave $\to$ Submission $\to$ Result review.
2. **Anti-Cheat Penetration:** Simulating tab switch, DevTools opening, right-click, window resize delta, and multiple warning auto-submission.
3. **Trainer Monitoring:** Live camera updates, live question tracking, proctoring warning alerts, and force-end quiz.
4. **Excel Export Validation:** Verification of `.xlsx` binary integrity and photo layout across Excel, Google Sheets, and LibreOffice.
5. **RBAC Boundary Verification:** Confirming strict isolation across batches and preventing IDOR leaks.
6. **EEDI Confidentiality:** Ensuring zero student endpoints leak diagnostic competency tags.

### Acceptance Criteria
- 100% of integration test suites pass.
- Zero IDOR or answer leakage vulnerabilities.
- Flawless live monitoring and Excel photo export.

### Estimated Complexity
- **Medium** (2 days)

---

## CONSOLIDATED TIMELINE & COMPLEXITY SUMMARY

| Phase | Description | Estimated Duration | Complexity |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Token Bridge & Identity Mapping | 1 Day | Low |
| **Phase 2** | Proctored Student Exam Engine | 2 Days | Medium |
| **Phase 3** | Camera Capture & Anti-Cheat Subsystem | 2 Days | Medium |
| **Phase 4** | Real-Time WebSocket Infrastructure | 3 Days | High |
| **Phase 5** | Trainer Live Monitoring Dashboard | 3 Days | High |
| **Phase 6** | Multi-Batch Assessment & CSV Management | 1 Day | Low |
| **Phase 7** | Result Processing & Excel Photo Export | 2 Days | Medium |
| **Phase 8** | Offline-First Synchronization | 2 Days | Medium |
| **Phase 9** | End-to-End Testing & Security Verification | 2 Days | Medium |
| **Total** | **Full Production Integration** | **18 Engineering Days** | **Enterprise** |

---

## AUDIT & ROADMAP COMPLETION SIGN-OFF

The audit and architecture phase is **100% complete**. All 6 required specification documents are compiled directly from source-code evidence.

**Per instructions, no implementation code has been modified.**  
**Waiting for explicit user review and approval before beginning Phase 1.**
