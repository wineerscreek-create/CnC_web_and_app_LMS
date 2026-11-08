# WINNERS CREEK LMS — DATABASE MIGRATION PLAN
## Migration 014: Semester Fee Management, Payment Verification, Invoices & Access Control

**Migration Identifier:** `014_semester_fee_management_and_access_control.sql`  
**Target Engine:** PostgreSQL 16  
**Execution Mechanism:** `apps/api/app/db/postgres.py` via PostgreSQL Advisory Lock (`pg_advisory_xact_lock(7429103)`)  
**Idempotency Guarantee:** 100% idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`)  

---

## 1. Schema Modifications Overview

```
+-----------------------------------+
|              courses              |
+-----------------------------------+
| + payment_frequency               |
| + gst_rate                        |
| + gst_inclusive                   |
| + semester_fee                    |
| + current_semester_number         |
| + current_period_start_date       |
| + current_period_end_date         |
| + payment_due_date                |
| + grace_period_days               |
| + refund_policy_config            |
+-----------------------------------+
                  |
                  | 1:N
                  v
+-----------------------------------+
|      course_semester_configs      |  (NEW)
+-----------------------------------+
| id (UUID PK)                      |
| course_id (FK courses.id)         |
| semester_number (INT)             |
| semester_name (VARCHAR)           |
| academic_year (VARCHAR)           |
| start_date (DATE)                 |
| end_date (DATE)                   |
| payment_due_date (DATE)           |
| fee_amount (NUMERIC)              |
| is_active (BOOLEAN)               |
+-----------------------------------+

+-----------------------------------+
|             payments              |
+-----------------------------------+
| + institution_id (FK)             |
| + verified_by_role                |
| + verification_source             |
| + academic_year                   |
| + payment_frequency               |
| + taxable_amount                  |
| + gst_amount                      |
| + gst_rate                        |
| + rejection_reason                |
| * UNIQUE (utr) [where not null]   |
+-----------------------------------+
                  |
                  | 1:1 or 1:N
                  v
+-----------------------------------+
|             invoices              |  (NEW)
+-----------------------------------+
| id (UUID PK)                      |
| invoice_number (UNIQUE)           |
| payment_id (FK payments.id)       |
| enrollment_id (FK enrollments.id) |
| participant_user_id (FK users.id) |
| institution_id (FK institutions)  |
| course_id (FK courses.id)         |
| semester_number (INT)             |
| academic_year (VARCHAR)           |
| taxable_amount (NUMERIC)          |
| gst_rate (NUMERIC)                |
| gst_amount (NUMERIC)              |
| total_amount (NUMERIC)            |
| status (VARCHAR)                  |
| issued_at (TIMESTAMPTZ)           |
| pdf_path (TEXT)                   |
| generation_source (VARCHAR)       |
| metadata (JSONB)                  |
+-----------------------------------+

+-----------------------------------+
|        enrollment_periods         |
+-----------------------------------+
| + period_status                   |
| + migration_status                |
| + migrated_at                     |
| + migration_source                |
| + historical_payment_date_avail   |
| + historical_verification_status  |
| + historical_record_notes         |
| + activation_source               |
+-----------------------------------+

+-----------------------------------+
|          refund_requests          |  (NEW)
+-----------------------------------+
| id (UUID PK)                      |
| payment_id (FK payments.id)       |
| enrollment_id (FK enrollments.id) |
| institution_id (FK institutions)  |
| user_id (FK users.id)             |
| original_amount (NUMERIC)         |
| refund_percentage (NUMERIC)       |
| calculated_refund_amount (NUMERIC)|
| actual_refund_amount (NUMERIC)    |
| days_since_activation (INT)       |
| reason (TEXT)                     |
| status (VARCHAR)                  |
| processed_by_user_id (FK)         |
| processed_at (TIMESTAMPTZ)        |
| notes (TEXT)                      |
+-----------------------------------+
```

---

## 2. DDL Script Structure

### 2.1 Table Alterations

```sql
-- 1. Courses Table Extensions
ALTER TABLE courses ADD COLUMN IF NOT EXISTS payment_frequency VARCHAR(32) DEFAULT 'SEMESTER';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) DEFAULT 6.36;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS gst_inclusive BOOLEAN DEFAULT TRUE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS semester_fee NUMERIC(10,2) DEFAULT 5850.00;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS current_semester_number INTEGER DEFAULT 1;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS current_period_start_date DATE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS current_period_end_date DATE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS payment_due_date DATE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS grace_period_days INTEGER DEFAULT 7;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS refund_policy_config JSONB DEFAULT '[
    {"day_range": "0-15", "percentage": 100},
    {"day_range": "16-30", "percentage": 50},
    {"day_range": "31-60", "percentage": 25},
    {"day_range": ">60", "percentage": 0}
]'::jsonb;

-- 2. Payments Table Extensions
ALTER TABLE payments ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_by_role VARCHAR(32);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verification_source VARCHAR(32);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS academic_year VARCHAR(16);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_frequency VARCHAR(32) DEFAULT 'SEMESTER';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(10,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(10,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) DEFAULT 6.36;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_id UUID;

-- 3. Enrollment Periods Extensions
ALTER TABLE enrollment_periods ADD COLUMN IF NOT EXISTS period_status VARCHAR(32) DEFAULT 'PAID';
ALTER TABLE enrollment_periods ADD COLUMN IF NOT EXISTS migration_status VARCHAR(32);
ALTER TABLE enrollment_periods ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMPTZ;
ALTER TABLE enrollment_periods ADD COLUMN IF NOT EXISTS migration_source VARCHAR(64);
ALTER TABLE enrollment_periods ADD COLUMN IF NOT EXISTS historical_payment_date_available BOOLEAN DEFAULT TRUE;
ALTER TABLE enrollment_periods ADD COLUMN IF NOT EXISTS historical_verification_status VARCHAR(32);
ALTER TABLE enrollment_periods ADD COLUMN IF NOT EXISTS historical_record_notes TEXT;
ALTER TABLE enrollment_periods ADD COLUMN IF NOT EXISTS activation_source VARCHAR(32) DEFAULT 'PAYMENT_VERIFICATION';

-- 4. Enrollments Extensions
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS activation_source VARCHAR(32) DEFAULT 'PAYMENT_VERIFICATION';
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS manual_activation_reason TEXT;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS manual_activated_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS manual_activated_at TIMESTAMPTZ;
```

### 2.2 New Table Definitions

```sql
-- 5. Course Semester Configurations
CREATE TABLE IF NOT EXISTS course_semester_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    semester_number INTEGER NOT NULL,
    semester_name VARCHAR(64) NOT NULL,
    academic_year VARCHAR(16) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    payment_due_date DATE,
    fee_amount NUMERIC(10,2) NOT NULL DEFAULT 5850.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_course_sem_year UNIQUE (course_id, semester_number, academic_year)
);

-- 6. Invoices Table
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(64) NOT NULL UNIQUE,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    participant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    semester_number INTEGER NOT NULL,
    academic_year VARCHAR(16) NOT NULL,
    taxable_amount NUMERIC(10,2) NOT NULL,
    gst_rate NUMERIC(5,2) NOT NULL DEFAULT 6.36,
    gst_amount NUMERIC(10,2) NOT NULL,
    total_amount NUMERIC(10,2) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ISSUED',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    pdf_path TEXT,
    generation_source VARCHAR(32) NOT NULL DEFAULT 'VERIFICATION',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Refund Requests Table
CREATE TABLE IF NOT EXISTS refund_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_amount NUMERIC(10,2) NOT NULL,
    refund_percentage NUMERIC(5,2) NOT NULL,
    calculated_refund_amount NUMERIC(10,2) NOT NULL,
    actual_refund_amount NUMERIC(10,2),
    days_since_activation INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'REQUESTED',
    processed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    processed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Payment Verification Events (Audit Log)
CREATE TABLE IF NOT EXISTS payment_verification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    action VARCHAR(32) NOT NULL,
    verified_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_by_role VARCHAR(32) NOT NULL,
    previous_status VARCHAR(32) NOT NULL,
    new_status VARCHAR(32) NOT NULL,
    reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.3 Indexes & Performance Optimizations

```sql
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(participant_user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_institution_id ON invoices(institution_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_id ON invoices(payment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_course_sem ON invoices(course_id, semester_number);

CREATE INDEX IF NOT EXISTS idx_payments_institution_status ON payments(institution_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_utr_verified ON payments(utr) WHERE status = 'VERIFIED';
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_utr_non_rejected ON payments(utr) WHERE utr IS NOT NULL AND status != 'REJECTED';

CREATE INDEX IF NOT EXISTS idx_course_sem_configs_course ON course_semester_configs(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_periods_status ON enrollment_periods(enrollment_id, period_status);
CREATE INDEX IF NOT EXISTS idx_refund_requests_inst_status ON refund_requests(institution_id, status);
```

---

## 3. Rollback & Failure Recovery Procedures

In the unlikely event that a database transaction fails during migration:
1. `run_migrations()` in `apps/api/app/db/postgres.py` executes inside an explicit `async with conn.transaction():` block.
2. Any failure triggers a complete transaction rollback, releasing the advisory lock cleanly.
3. Because all column additions are guarded by `IF NOT EXISTS`, retrying after correcting an issue is completely safe and non-destructive.
4. Downward manual reversal script:
   ```sql
   DROP TABLE IF EXISTS payment_verification_events CASCADE;
   DROP TABLE IF EXISTS refund_requests CASCADE;
   DROP TABLE IF EXISTS invoices CASCADE;
   DROP TABLE IF EXISTS course_semester_configs CASCADE;
   -- Column drops optional, existing columns are nullable/defaulted and do not break legacy queries.
   ```
