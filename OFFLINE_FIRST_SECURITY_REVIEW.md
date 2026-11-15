# OFFLINE-FIRST SECURITY REVIEW
## Winners Creek LMS / SkillSharp Enterprise Platform

**Date:** 2026-11-15  
**Review Type:** Multi-Tenant Isolation, Zero-Trust Assessment Integrity, and Storage Security Audit

---

## 1. Threat Modeling & Security Mitigations

### 1.1 Client-Side Assessment Score Tampering
- **Threat:** A student inspects offline bundles or modifies IndexedDB records to fabricate an exam score of 100%.
- **Architecture Defense:** 
  - Downloaded question set bundles physically strip all answer keys and `correct` boolean flags on the server before transmitting to the client (`sanitized_questions` in `OfflineRepository.get_package_bundle`).
  - The client NEVER calculates, formats, or submits an assessment score.
  - The synchronization payload contains only `{questionId, optionId, durationSeconds}`.
  - The server reconstructs the attempt inside an atomic PostgreSQL transaction and scores it against the authoritative database answer key.
- **Verdict:** **IMMUNE TO CLIENT TAMPERING.**

### 1.2 Cross-Tenant & Cross-User Data Leakage
- **Threat:** Multiple students sharing a library computer or device inspect each other's offline courses, personal progress, or assessment drafts.
- **Architecture Defense:**
  - Every IndexedDB record is keyed by compound IDs prefixed with `userId` (e.g. `${userId}_${quizId}`).
  - Queries strictly filter by `userId` and `institutionId`.
  - Calling `purgeUserOfflineData(userId)` purges all local records from IndexedDB upon sign-out.
- **Verdict:** **VERIFIED & MITIGATED.**

### 1.3 Shared Cache Storage Poisoning
- **Threat:** The Service Worker caches authenticated API responses (e.g., `/api/v1/auth/me`, `/api/v1/student/profile`) in the browser's Cache Storage, allowing an unauthenticated visitor to view sensitive student data.
- **Architecture Defense:**
  - `apps/web/public/sw.js` explicitly blocks all requests starting with `/api/` from being cached in Cache Storage.
  - The Cache Storage is reserved strictly for public static assets (`/_next/static/*`, `/images/*`, `/favicon.ico`, `/offline`).
- **Verdict:** **VERIFIED & MITIGATED.**

### 1.4 Outbox Replay & Duplicate Submission Attacks
- **Threat:** An attacker re-sends recorded network requests to duplicate course completions or re-submit expired assessments.
- **Architecture Defense:**
  - Every outbox operation is signed with a client-generated UUID `operationId`.
  - The backend maintains a PostgreSQL table `sync_operations` with a strict unique constraint: `UNIQUE(user_id, operation_id)`.
  - Replayed operations return `ALREADY_PROCESSED` with the cached original result and perform zero mutations.
- **Verdict:** **VERIFIED & MITIGATED.**

### 1.5 Realistic Limitations (Browser DRM Boundary)
- **Realistic Browser Limit:** Web browsers do not provide hardware DRM protection for IndexedDB or the Cache API. A technical user with administrative access to Developer Tools can read unencrypted IndexedDB data on their local machine.
- **Mitigation:**
  - Content authorizations are time-bound (`expires_at` default 7 days).
  - High-stakes evaluation logic, certificate issuance, and official EEDI score publication are strictly restricted to online backend processing.
