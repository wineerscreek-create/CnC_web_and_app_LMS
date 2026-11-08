# WINNERS CREEK LMS — REGRESSION TEST PLAN
## Semester Fee Management, Payment Verification, Invoices & Access Control

**Document Version:** 1.0.0  
**Test Harness:** `pytest` (Backend), `tsc` / Next.js Build (Frontend)  
**Target Coverage:** Unit, Integration, RBAC, Security, and Regression  

---

## 1. Test Matrix Overview

| Test Suite | Test File | Test Count Target | Key Verification Areas |
|---|---|---|---|
| **GST Arithmetic** | `apps/api/tests/test_gst_invoice_calculation.py` | 6 tests | Decimal precision, 6.36% inclusive split (₹5,500.19 + ₹349.81), zero floating-point drift |
| **Payment & UTR** | `apps/api/tests/test_payment_verification_flow.py` | 10 tests | Submission, duplicate UTR block, Super Admin verify, College Admin verify, dual sync, reject, single invoice issuance |
| **Access Control** | `apps/api/tests/test_student_access_control.py` | 8 tests | Account login retention, historical content access, new content restriction (403), assessment block, manual activation without payment |
| **RBAC & Isolation** | `apps/api/tests/test_payment_rbac_isolation.py` | 8 tests | Trainer zero payment endpoints, HOD read-only status, College Admin tenant isolation, Super Admin global authority |
| **Arya Migration** | `apps/api/tests/test_arya_historical_migration.py` | 6 tests | Sem 3 paid, Sem 4/5 included, Sem 6 paid, Sem 7/8 included, no duplicate invoices, UTR preservation |
| **Full Regression** | `apps/api/tests/` | 387+ existing tests | Ensure zero regression across auth, courses, batches, assessments, reports, SPOC portal |

---

## 2. Test Specifications

### 2.1 GST & Invoice Calculation Tests (`test_gst_invoice_calculation.py`)
1. `test_gst_inclusive_breakdown_5850`:
   - Input: ₹5,850.00 total, 6.36% GST inclusive.
   - Assert: `taxable_amount == Decimal('5500.19')`.
   - Assert: `gst_amount == Decimal('349.81')`.
   - Assert: `taxable_amount + gst_amount == Decimal('5850.00')`.
2. `test_gst_rounding_edge_cases`:
   - Tests arbitrary inclusive totals (e.g. ₹1,000, ₹4,999) using `ROUND_HALF_UP`.
   - Asserts total strictly equals sum of taxable and GST components.
3. `test_no_double_taxation`:
   - Asserts that creating an invoice from a ₹5,850 payment does not result in ₹6,222.06.
4. `test_invoice_immutability`:
   - Asserts that once an invoice row is created, modifying financial amounts triggers an error or requires credit-note logic.

### 2.2 Payment Submission & Verification Tests (`test_payment_verification_flow.py`)
1. `test_student_submit_utr_success`:
   - Student submits UTR `UTR20261108TEST01`.
   - Payment created with status `PENDING_VERIFICATION`.
2. `test_duplicate_utr_rejected`:
   - Second submission with same UTR returns HTTP 409 Conflict.
3. `test_college_admin_verify_payment`:
   - College Admin calls `/api/v1/admin/payments/{id}/verify`.
   - Payment status becomes `VERIFIED`.
   - `verified_by_role` becomes `COLLEGE_ADMIN`.
   - Enrollment access extends to semester end date.
   - Exactly one invoice created in `invoices` table.
4. `test_super_admin_verify_payment`:
   - Super Admin calls `/api/v1/super-admin/payments/{id}/verify`.
   - Payment status becomes `VERIFIED`.
   - Both College Admin and Super Admin view endpoints show `VERIFIED`.
5. `test_payment_rejection`:
   - Admin rejects payment with reason "Invalid bank reference".
   - Status becomes `REJECTED`.
   - Student account remains `ACTIVE` (can log in and resubmit).

### 2.3 Student Access Control Tests (`test_student_access_control.py`)
1. `test_unpaid_student_can_login`:
   - Student with overdue semester payment successfully authenticates and receives JWT token.
2. `test_unpaid_student_view_historical_content`:
   - Student with `access_status = 'RESTRICTED'` can read previously enrolled lesson `GET /api/v1/student/courses/{course_id}/lessons/{old_lesson_id}`.
   - Student can download completed assessment reports.
3. `test_unpaid_student_blocked_from_new_content`:
   - Student accessing newly published lesson receives HTTP 403 `{"detail": "Payment required for current semester", "code": "SEMESTER_PAYMENT_REQUIRED"}`.
   - Attempting new assessment is blocked with 403.
4. `test_manual_activation_restores_access`:
   - Admin calls `/api/v1/admin/enrollments/{id}/manual-activate`.
   - `access_status` becomes `ACTIVE`.
   - `payment_status` remains `PENDING`.
   - `activation_source` is `MANUAL_ADMIN_APPROVAL`.
   - Student can now access new lessons without a fake paid invoice.

### 2.4 RBAC & Tenant Isolation Tests (`test_payment_rbac_isolation.py`)
1. `test_trainer_cannot_access_payment_endpoints`:
   - Trainer token used against `/api/v1/admin/payments`, `/api/v1/super-admin/payments`, or `/api/v1/payments/{id}/verify`.
   - All return HTTP 403 Forbidden.
2. `test_hod_read_only_payment_status`:
   - HOD calls `/api/v1/hod/payments/student-status` $\rightarrow$ HTTP 200 OK.
   - HOD calls `/api/v1/admin/payments/{id}/verify` $\rightarrow$ HTTP 403 Forbidden.
   - HOD calls `/api/v1/admin/payments/{id}/refund` $\rightarrow$ HTTP 403 Forbidden.
3. `test_college_admin_cross_tenant_block`:
   - College Admin A attempts to verify or view payments for College B.
   - System returns HTTP 404 or 403 without data leakage.

### 2.5 Arya College Historical Migration Tests (`test_arya_historical_migration.py`)
1. `test_arya_sem3_has_paid_invoice`:
   - For migrated 7th and 3rd sem students, Semester 3 period has `payment_status = 'VERIFIED'` and an associated invoice with ₹5,850 total.
2. `test_arya_sem4_sem5_marked_included_period`:
   - Semester 4 and 5 periods have `period_status = 'INCLUDED_PERIOD'`.
   - Zero paid invoices exist for Semester 4 or 5.
3. `test_arya_sem6_has_paid_invoice_7th_sem`:
   - 7th sem students have Semester 6 `period_status = 'PAID'` and an associated invoice.
4. `test_real_utr_preservation`:
   - All 325 real UTRs (`TXN_ARYA_...`) match original records.

---

## 3. Execution Commands

1. **Run New Semester Fee Test Suites:**
   ```powershell
   pytest apps/api/tests/test_gst_invoice_calculation.py -v
   pytest apps/api/tests/test_payment_verification_flow.py -v
   pytest apps/api/tests/test_student_access_control.py -v
   pytest apps/api/tests/test_payment_rbac_isolation.py -v
   ```
2. **Run Full Backend Regression:**
   ```powershell
   pytest apps/api/tests/ -q
   ```
3. **Run Frontend Type & Build Checks:**
   ```powershell
   node apps/web/node_modules/typescript/bin/tsc --project apps/web/tsconfig.json --noEmit
   npm run build --prefix apps/web
   ```
