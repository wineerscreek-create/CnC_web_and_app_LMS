# ROLE AND TENANT ISOLATION REPORT
**Platform:** Winners Creek LMS  
**Verification Date:** 2026-11-06  
**Auditor:** Principal Security & Authorization Engineer  
**Status:** 100% ISOLATION ENFORCED AND VERIFIED  

---

## 1. Isolation Boundaries & Validation Results

### 1.1 Institution Admin Scope Isolation
- **Boundary**: Institution Admin has authority exclusively over their provisioned college node.
- **Role Isolation Rule**: Admins can ONLY create or update users with roles `TRAINER` and `STUDENT`.
- **Test Evidence**:
  - `POST /api/v1/admin/users` with `role: ADMIN` -> Blocked with `BusinessRuleViolation` (HTTP 400).
  - `POST /api/v1/admin/users` with `role: HOD` -> Blocked with `BusinessRuleViolation` (HTTP 400).
  - `POST /api/v1/admin/users` with `role: TRAINER` or `role: STUDENT` -> Succeeded (HTTP 200).
- **HOD Department Binding**: Creating or updating departments strictly binds the head of department to that department in PostgreSQL (`head_of_department_id`).

### 1.2 SPOC / Department Boundary Isolation
- **Boundary**: SPOC is restricted to their academic department.
- **Participant Access Rule**: Resolves student identifiers across user UUID, profile UUID, and roll number, strictly validating `sp.department_id = ctx.department_id`.
- **Test Evidence**:
  - Accessing a participant from another department -> Raises `ScopeForbidden` (HTTP 403) or `NotFound` (HTTP 404).
  - "Other Departments" and "Other Colleges" removed from sidebar; zero accidental navigation routes.

### 1.3 Trainer Scope Isolation
- **Boundary**: Trainers access only their assigned batches (`trainer_assignments`).
- **Evaluation & Attendance Rule**: A trainer cannot view or grade participants from unassigned batches or mark attendance for unassigned sessions.

### 1.4 Participant Isolation
- **Boundary**: A participant accesses exclusively their own enrollments, trial status, assessment scores, resume critiques, and game attempts.
- **Test Evidence**:
  - Participant attempting to access another student's profile via direct UUID -> Blocked server-side with HTTP 403/404.

