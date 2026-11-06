# SECURITY AUDIT REPORT
**Platform:** Winners Creek LMS  
**Audit Date:** 2026-11-06  
**Auditor:** Security & Infrastructure Lead  
**Status:** ALL PRODUCTION CONTROLS PASSED — ZERO HIGH/CRITICAL RISKS  

---

## 1. Authentication & Session Hygiene
- **JWT Cryptography**: Signed with HMAC-SHA256 (`HS256`) using dedicated secret keys. Access tokens expire in 15 minutes; refresh tokens stored in HttpOnly, SameSite=Lax cookies.
- **Session Revocation**: Token rotation enforced. Explicit password change or role modification immediately revokes existing refresh tokens.
- **Password Hashing**: Passwords stored using PBKDF2 with SHA-256 and high salt rounds. Zero plaintext passwords stored or logged.

---

## 2. Multi-Tenant Isolation & Role Boundaries (RBAC)
- **Server-Side Scope Derivation**:
  - `college_id`, `department_id`, and `batch_ids` are never read from client parameters.
  - Derived strictly from the verified JWT payload and validated against PostgreSQL records on every request via `get_scope_context`.
- **Institution Admin Isolation**:
  - `apps/api/app/routers/admin.py`: Restricted role creation and role modification strictly to `TRAINER` and `STUDENT`.
  - Attempting to provision or elevate accounts to `ADMIN`, `HOD`, or `SUPER_ADMIN` raises `BusinessRuleViolation("Admins may only assign TRAINER or STUDENT roles")`.
- **SPOC / Department Boundary**:
  - SPOC endpoints enforce department boundaries (`head_of_department_id` and `student_profiles.department_id`).
  - Participant detail lookup verified across user UUID, profile UUID, and roll number without leaking cross-department records.
- **Trainer Isolation**:
  - Trainers can only view, evaluate, and mark attendance for participants enrolled in their actively assigned batches (`trainer_assignments`).
- **Participant Data Protection**:
  - Participants cannot access other participants' evaluations, resume critiques, or practice recordings.

---

## 3. File Upload Security (Banner & Materials)
- **Validation**:
  - MIME type whitelisting (`image/jpeg`, `image/png`, `image/webp`).
  - File extension verification (`.jpg`, `.jpeg`, `.png`, `.webp`).
  - Magic byte sequence inspection prevents polyglot file execution.
  - Strict size limit: 5 MB maximum for banners; 200 MB for audio/video submissions.
- **Path Traversal Protection**:
  - File paths use UUID-based random filenames; filenames are not accepted from user inputs.
  - Upload directories are isolated by user UUID.

---

## 4. Secret & Environment Protection
- Verified `.gitignore` excludes `.env`, `apps/api/.env`, production dumps, and logs.
- Working tree inspected prior to commit; zero credentials or private tokens tracked.
