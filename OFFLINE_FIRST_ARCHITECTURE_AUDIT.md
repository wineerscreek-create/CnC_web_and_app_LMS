# OFFLINE-FIRST ARCHITECTURE AUDIT
## SkillSharp / Winners Creek LMS

**Date:** 2026-11-15  
**System:** Winners Creek LMS / SkillSharp Enterprise Learning Platform  
**Target Architecture:** Production-Grade Offline-First Architecture (Next.js 15 + FastAPI + PostgreSQL + AWS S3 + Dexie IndexedDB)

---

## 1. Executive Summary

This audit assesses the existing SkillSharp / Winners Creek LMS repository to establish a production-grade, secure, multi-tenant Offline-First architecture. The platform currently serves five distinct roles (`SUPER_ADMIN`, `ADMIN`, `HOD`, `TRAINER`, `STUDENT`) across multiple colleges and corporate departments.

Offline functionality must empower students and participants to continue learning, study downloaded courses and eBooks/PDFs, play authorized interactive games, and record assessment attempts even under intermittent or completely absent internet connectivity, while guaranteeing **strict data integrity**, **tamper resistance**, **tenant isolation**, and **idempotent synchronization**.

---

## 2. Existing Architecture Analysis

### 2.1 Frontend Architecture (`apps/web`)
- **Framework:** Next.js 15 (App Router) with React 19.
- **State Management:** Redux Toolkit (`authSlice`, `uiSlice`) providing central session storage.
- **Styling & UI:** Tailwind CSS, Radix UI primitives, Lucide React icons, Sonner toast notifications, custom Ivory/Sage/Gold Winners Creek design system.
- **API Client (`src/lib/api.ts`):** 
  - Access tokens stored exclusively in memory and Redux (never in `localStorage`).
  - Refresh tokens maintained as `HttpOnly` secure cookies.
  - Transparent single-flight session rotation on HTTP 401.
  - Standardized error model (`ApiError`) handling status codes and field-level validation.
- **Data Fetching Hook (`src/hooks/useApi.ts`):** Reactive query and mutation hooks managing loading, error, and cached states.
- **Missing Elements for Offline Operation:**
  - No Web App Manifest (`manifest.webmanifest`).
  - No Service Worker for static shell caching or network interception.
  - No client-side persistence (IndexedDB) for downloaded curriculum or assessment drafts.
  - No durable synchronization outbox for queued offline mutations.

### 2.2 Backend Architecture (`apps/api`)
- **Framework:** FastAPI with async lifespan management.
- **Database:** PostgreSQL with `asyncpg` connection pooling and migration runner (`apps/api/migrations/`).
- **Storage Driver:** AWS S3 (`STORAGE_DRIVER=s3`) handling all binary assets, course attachments, and eBook PDFs.
- **Authentication & RBAC:** JWT bearer tokens validated via `ScopeContext` (`user_id`, `college_id`, `department_id`, `role`, `batch_id`).
- **Core Repositories:**
  - `QuizRepository` (`assignment_quiz_repo.py`): Handles quizzes, questions, and attempt evaluations. Quizzes store answers in PostgreSQL; the server calculates scores.
  - `GameRepository` (`game_repo.py`): Manages game definitions, launches, and attempts.
  - `EbookRepository` (`ebook_repo.py`): Handles eBook catalog, authenticated reading, and download permissions.
  - `CourseRepository` / `student.py`: Manages enrollments, lesson completions, progress tracking, and mandatory completion gates.
- **Missing Elements for Offline Operation:**
  - No endpoints for offline authorization packages.
  - No idempotent synchronization queue endpoint for batch mutation processing.
  - No server-side conflict detection or operation tracking table.

---

## 3. Database Schema & Migration Requirements

The existing PostgreSQL schema contains 19 discovered migrations (`000` through `018`). A new migration (`019_offline_sync_and_package_authorization.sql`) is required to introduce:

1. **`offline_packages`**:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
   - `institution_id UUID REFERENCES institutions(id)`
   - `batch_id UUID REFERENCES batches(id)`
   - `package_type VARCHAR(50) NOT NULL` (e.g., `COURSE_BUNDLE`, `ASSESSMENT_PACK`, `GAME_PACK`)
   - `resource_id UUID NOT NULL`
   - `server_revision BIGINT NOT NULL DEFAULT 1`
   - `manifest JSONB NOT NULL DEFAULT '{}'::jsonb`
   - `authorized_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `expires_at TIMESTAMPTZ NOT NULL`
   - `status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'`

2. **`sync_operations` (Server-Side Idempotency & Outbox Journal):**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `operation_id UUID NOT NULL`
   - `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
   - `institution_id UUID REFERENCES institutions(id)`
   - `resource_type VARCHAR(50) NOT NULL` (e.g., `LESSON_PROGRESS`, `QUIZ_ATTEMPT`, `GAME_ATTEMPT`)
   - `resource_id UUID NOT NULL`
   - `operation_type VARCHAR(50) NOT NULL` (e.g., `COMPLETE_LESSON`, `SUBMIT_ASSESSMENT`, `RECORD_GAME`)
   - `payload JSONB NOT NULL`
   - `client_timestamp TIMESTAMPTZ NOT NULL`
   - `server_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `status VARCHAR(20) NOT NULL DEFAULT 'PROCESSED'`
   - `result JSONB`
   - `UNIQUE(user_id, operation_id)`

3. **`sync_conflicts`**:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `user_id UUID NOT NULL REFERENCES users(id)`
   - `operation_id UUID NOT NULL`
   - `resource_type VARCHAR(50) NOT NULL`
   - `resource_id UUID NOT NULL`
   - `client_payload JSONB NOT NULL`
   - `server_state JSONB NOT NULL`
   - `reason VARCHAR(255) NOT NULL`
   - `resolved BOOLEAN NOT NULL DEFAULT FALSE`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

---

## 4. Reusable API Endpoints vs New API Requirements

| Capability | Existing Endpoint | Reusable? | Required Enhancements / New Endpoint |
| :--- | :--- | :---: | :--- |
| **Course Details & Lessons** | `GET /api/v1/student/courses/{id}` | Yes | Direct reuse for online fetching and offline package bundle assembly. |
| **Lesson Progress Update** | `POST /api/v1/student/courses/{id}/progress` | Yes | Underlying repo logic reused in sync processor. |
| **Lesson Completion** | `POST /api/v1/student/courses/{id}/lessons/{lid}/complete` | Yes | Underlying logic reused for outbox playback. |
| **Quiz Listing & Detail** | `GET /api/v1/student/assessments` / `{id}` | Yes | Reused. Offline question sets bundle questions without answer keys. |
| **Quiz Submission** | `POST /api/v1/student/assessments/{id}/attempts` | Yes | Reused. Server evaluates `{questionId: optionId}` answers against DB keys. |
| **Game Launch & Attempt** | `POST /api/v1/student/games/{id}/attempts` | Yes | Reused in sync processor with XP award logic. |
| **eBook Reading / Download** | `GET /api/v1/ebooks/{id}/read` & `/download` | Yes | Delivers secure PDF binary streams stored in IndexedDB blob table. |
| **Package Authorization** | *None* | **No** | **NEW:** `POST /api/v1/offline/package/authorize` |
| **Bundle Download** | *None* | **No** | **NEW:** `GET /api/v1/offline/package/{package_id}` |
| **Durable Batch Sync** | *None* | **No** | **NEW:** `POST /api/v1/offline/sync` |
| **Server Changes Pull** | *None* | **No** | **NEW:** `GET /api/v1/offline/changes` |

---

## 5. Security & Threat Modeling

1. **Client-Side Assessment Score Tampering:**
   - *Threat:* An attacker modifies client code or IndexedDB to report a 100% assessment score.
   - *Mitigation:* The client NEVER computes or submits scores. The offline payload contains ONLY `{questionId, optionId, elapsedSeconds}`. The server evaluates correctness using the authoritative answer key in PostgreSQL upon synchronization.
2. **Offline Package Extraction & Sharing:**
   - *Threat:* A student downloads course materials and gives them to an unauthorized student.
   - *Mitigation:* Downloaded content records in IndexedDB are keyed by `userId` and `institutionId`. Every record carries `authorizationExpiresAt` (e.g., 7 days). Once expired, client components refuse to display content until re-authorized online.
3. **Realistic Browser Storage Limitations (DRM Disclaimer):**
   - *Realistic Limit:* Client-side browser storage (IndexedDB, Cache API) cannot provide hardware DRM protection. Any technically skilled participant with access to Developer Tools can read unencrypted IndexedDB data on their machine.
   - *Architecture Stance:* Sensitive business logic (exam grading, certificate generation, EEDI pillar scoring) is strictly executed server-side. Media files are restricted to authorized accounts and cannot be decrypted without active application contexts.
4. **Shared Cache Storage Poisoning:**
   - *Mitigation:* The Service Worker strictly avoids caching authenticated API responses (e.g., `/api/v1/auth/*`, `/api/v1/student/*`) in Cache Storage. All user data is partitioned inside IndexedDB tables filtered by `userId`.
5. **Replay & Duplicate Submissions:**
   - *Mitigation:* Every queued operation includes a client-generated UUID `operationId`. The server enforces a PostgreSQL unique constraint on `(user_id, operation_id)`. Re-sending the same operation returns the cached result without duplicate execution.

---

## 6. Implementation Plan

```
Phase 2: PWA Foundation (manifest, service worker, shell caching, connectivity listener)
   │
Phase 3: IndexedDB with Dexie (schema versioning, 10 isolated tables, migrations)
   │
Phase 4: Offline Learning Modules (Course, eBook, Question Set & Game persistence)
   │
Phase 5: Durable Synchronization Engine (Outbox state machine, backoff, retry, idempotency)
   │
Phase 6: Backend API & Database Migration (019 migration, offline_sync.py router)
   │
Phase 7: Assessment Integrity & Server Grading (Event sequencing, tamper prevention)
   │
Phase 8: Online-Only Guardrails (AI chat, Resume analyzer, payments offline notices)
   │
Phase 9: UI Components (Connectivity indicator, sync counters, downloaded content manager)
   │
Phase 10: Rigorous Sequential Testing (Vitest, Pytest, TypeScript checks, build verification)
   │
Phase 11: Deployment Verification & Final Documentation
```
