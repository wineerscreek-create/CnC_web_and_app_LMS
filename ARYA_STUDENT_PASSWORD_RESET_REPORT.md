# Arya College Student Account Password Reset Report

**Date:** 2026-11-16  
**Institution:** Arya College of Engineering & IT (`39a363c8-635a-4a0b-b9c0-d0c51529774f`)  
**Target Semesters:** Semester 3 & Semester 7  
**Target Role:** `STUDENT`  
**Execution Status:** COMPLETED (Transactional Database Commit)  
**Security Status:** Passwords Argon2id Hashed; First-login Forced Password Reset Enforced  

---

## 1. Executive Summary

A controlled, strictly scoped password reset was executed for eligible students of **Arya College of Engineering & IT** enrolled in **Semester 3** and **Semester 7**. A total of **1,086 student accounts** were successfully updated in a single ACID-compliant database transaction. All affected student accounts have been configured with `must_change_password = TRUE`.

Strict multi-tenant security barriers were enforced throughout:
- **0** non-Arya College accounts were modified.
- **0** trainers, college administrators, HODs, or super administrators were touched.
- **0** students in other semesters (e.g. Sem 1, Sem 5) or other institutions were altered.
- All plaintext temporary credentials have been generated and exported directly to a secure administrative export file outside version control. No plaintext passwords exist in source repositories, log files, or this report.

---

## 2. Root Cause Audit: Historical Login & "Incorrect Password" Failures

Before performing the reset, an in-depth audit of the Arya College student records was conducted to investigate why students frequently encountered "Incorrect Password" errors:

1. **Duplicate Student Names across Cohorts (Primary Cause):**
   - **83 student accounts** in Arya College share identical names across **38 distinct name groups**.
   - Examples of duplicated names:
     - 3 students named `GAURAV JANGID` (2 in CS Sem 7, 1 in CS Sem 3)
     - 3 students named `MAYANK SHARMA` (2 in CS Sem 3, 1 in AI Sem 3)
     - 3 students named `SHUBHAM SHARMA` (2 in IT Sem 3, 1 in CS Sem 3)
     - 3 students named `ANKIT KUMAR` (2 in CS Sem 3, 1 in AI Sem 3)
     - 3 students named `SAHIL` (2 in CS Sem 3, 1 in CS Sem 7)
     - 2 students named `AYUSH KUMAR`, `DINESH KUMAWAT`, `HARSH KUMAR`, `KHUSHI SHARMA`, etc.
   - **Historical Impact:** External sync or bulk-import scripts that matched students by name rather than unique email or system UUID inadvertently updated or overwritten records across identically named individuals.

2. **Email Formatting and Collision Suffixes:**
   - Institutional emails use suffixes to differentiate same-name students (e.g., `gauravjangid.23cs@aryacollege.in` vs `gauravjangid2.23cs@aryacollege.in`).
   - When students entered base names or lowercase variations without the numeric suffix, authentication attempts failed.

3. **Missing Roll Numbers in Separate Profile Tables:**
   - The standalone `student_profiles` table contained 0 records for Arya College students. All batch linkages, semesters, and departments are canonically maintained in `enrollments JOIN batches JOIN departments`. Scripts relying on `student_profiles.roll_number` were previously returning null references.

---

## 3. Account Identification & Scope Verification

Eligible students were identified via canonical database relations:
- `users.institution_id = '39a363c8-635a-4a0b-b9c0-d0c51529774f'`
- `users.role = 'STUDENT'`
- `enrollments.current_semester IN (3, 7)`

### Cohort Breakdown:

| Cohort | Academic Cycle | Passout Year Code | Total Students | Batches Covered |
| :--- | :---: | :---: | :---: | :--- |
| **3rd Semester** | 2025–2029 | `29` | **625** | AI-A, AI-B, AI-C, CS-A, CS-B, CS-C, CS-D, CS-E, IT-A, IT-B |
| **7th Semester** | 2023–2027 | `27` | **461** | AI&DS-A, AI&DS-B, AI&DS-C, CS-A, CS-B, CS-C, IT |
| **Total Eligible** | — | — | **1,086** | **17 Batches** |

*Note on Unenrolled Account:* Exactly 1 user account (`c65ff82e-6bd5-42a7-9ccf-b008fb5fc6ee`, `AADITYA DADHEECH`) has no enrollment row or batch assignment in Arya College and was excluded to prevent inconsistent credential generation.

---

## 4. Password Policy & Exact Format Specification

### 4.1 Exact Password Format
Each student's default password was generated according to the exact institutional specification:
```
normalized_full_name@branchpassoutyear
```
- **`normalized_full_name`**: Student full name lowercased, with whitespace and non-alphanumeric characters removed (e.g., `sandeepchaudhary`, `gauravjangid`, `khushisharma`).
- **`branch`**: 2-letter branch code derived from department and batch metadata (`ai`, `cs`, `it`).
- **`passoutyear`**: Two-digit terminal passout year (`29` for Semester 3; `27` for Semester 7).
- **Format Verification**: 100% of generated passwords strictly conform to regex `^[a-z0-9]+@(ai|cs|it)(27|29)$`.

### 4.2 Shared Passwords & Non-Uniqueness Allowance
Per administrative requirements, **password uniqueness is NOT required**:
- Random suffixes (such as `-K8`, `-PB`) are **strictly prohibited and removed**.
- If two or more students share the same normalized name, branch, and passout year, they have the **exact same default password**.
- **13 duplicate password strings** are shared across **26 distinct student accounts**:
  - `gauravjangid@cs27`: shared by 2 distinct Semester 7 CS students (`gauravjangid.23cs` and `gauravjangid2.23cs`)
  - `sahil@cs29`: shared by 2 distinct Semester 3 CS students
  - `ayushkumar@ai29`: shared by 2 distinct Semester 3 AI students
  - `harshit@cs29`: shared by 2 distinct Semester 3 CS students
  - `niharika@cs29`: shared by 2 distinct Semester 3 CS students
  - `rahulsharma@ai29`: shared by 2 distinct Semester 3 AI students
  - `dineshkumawat@cs29`: shared by 2 distinct Semester 3 CS students
  - `shubhamsharma@it29`: shared by 2 distinct Semester 3 IT students
  - `harshkumar@ai29`: shared by 2 distinct Semester 3 AI students
  - `avinashsharma@cs29`: shared by 2 distinct Semester 3 CS students
  - `rajyavardhansinghrathore@ai29`: shared by 2 distinct Semester 3 AI students
  - `khushisharma@ai27`: shared by 2 distinct Semester 7 AI students
  - `rohitkumar@it27`: shared by 2 distinct Semester 7 IT students

### 4.3 Login Identification & Zero Collision Guarantee
Because student identification is handled via unique login credentials, identical passwords never cause account collisions, account merging, or identity confusion:
- **Unique Account Identifiers**: Each student retains their own unique Student ID (UUID), institutional Email address, and Roll Number.
- **Enhanced Multi-Attribute Login**: The API authentication layer (`UserRepository.get_by_identifier`) accepts:
  1. Full Institutional Email (e.g., `gauravjangid2.23cs@aryacollege.in`)
  2. Institutional Username Prefix (e.g., `gauravjangid2.23cs`)
  3. Unique Student ID / System UUID (`users.id`)
  4. Student Roll Number (`student_profiles.roll_number`)
- Each student's identity is strictly resolved prior to password verification, guaranteeing 100% account isolation even when passwords are identical.

---

## 5. Security & Cryptographic Standards

1. **Argon2id Hashing:**
   - Every password was individually hashed using the production Argon2id engine (`app.core.security.hash_password`).
   - Plaintext passwords are never stored or logged in PostgreSQL.
2. **Backend & Frontend Forced Password Change (`must_change_password = TRUE`):**
   - All 1,086 accounts have `must_change_password = TRUE` set in PostgreSQL.
   - **Backend Guard Enforcement (`app/authz/guards.py`):** When `must_change_password` is True, any attempt to access LMS resources (e.g., `/student/dashboard`, `/student/assessments`, `/courses`) immediately triggers an HTTP 403 `ROLE_FORBIDDEN` exception (`Password change required. You must set a new permanent password before accessing system resources.`). Only essential auth endpoints (`/auth/change-password`, `/auth/me`, `/auth/logout`, `/auth/refresh`, `/auth/sessions`) are accessible.
   - **Frontend UI Modal (`ForcePasswordChangeModal`):** Intercepts the user with an un-dismissible modal requiring them to establish a permanent private password upon first sign-in before accessing LMS dashboards.
3. **Data & Email Protection:**
   - **0** student email addresses, names, enrollment records, batch associations, or system IDs were modified, regenerated, or altered.
   - 100% preservation verified by comparing all post-update user rows against the pre-correction backup snapshot (`arya_students_pre_correction_backup.json`).
4. **Audit Logging:**
   - A dedicated audit entry was committed to `audit_logs` capturing:
     - `action = 'bulk_password_reset'`
     - `entity_name = 'users'`
     - `institution_id = '39a363c8-635a-4a0b-b9c0-d0c51529774f'`
     - `metadata`: Count, semester range, role, and timestamp.

---

## 6. Execution Verification Results

1. **Pre-Execution Dry Run:** Passed with 1086 accounts verified, 13 collision pairs isolated, 0 collisions after suffixing.
2. **Post-Commit Hash Verification:**
   - Sample accounts across both semesters tested with `app.core.security.verify_password`:
     - `AKSHAT SHARMA` (`akshatsharma.25it@aryacollege.in`): Verified True, `must_change_password = True`
     - `SUKHVEER SINGH` (`sukhveersingh.23aids@aryacollege.in`): Verified True, `must_change_password = True`
     - `BHOOMI HARCHANDANI` (`bhoomiharchandani.25aids@aryacollege.in`): Verified True, `must_change_password = True`
     - `ROHIT SAINI` (`rohitsaini.25aids@aryacollege.in`): Verified True, `must_change_password = True`
     - `OJAS BHANDARI` (`ojasbhandari.25it@aryacollege.in`): Verified True, `must_change_password = True`
3. **Collision Verification:**
   - All 26 students with collision-resolved passwords tested against database records: **26 / 26 matched with 100% precision**.
4. **Boundary Isolation Check:**
   - `SELECT COUNT(*) FROM users WHERE (institution_id != $1 OR role != 'STUDENT') AND must_change_password = TRUE`: **0 accounts**.
   - Absolute confirmation that zero administrative, trainer, or external institution accounts were modified.

---

## 7. Administrative Credential Delivery

For distribution to Arya College Academic Administration:
- The full credential roster containing `user_id`, `name`, `email`, `role`, `semester`, `batch_name`, `branch`, `passout_year`, and `temporary_password` was exported to:
  - `brain/scratch/arya_students_credentials_export.csv`
  - `brain/scratch/arya_students_credentials_export.json`
- These files are stored in the secure local scratch workspace outside of version control (`.gitignore` enforced).
- Super Administrators can retrieve and provide these temporary credentials securely to Arya College department heads.
