-- Migration: 014_semester_fee_management_and_access_control.sql
-- Description: Complete schema additions for semester fee management, dual-tier payment verification,
--              professional GST invoices, service-level access control, and refund management.

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

-- 2. Course Semester Configurations
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

-- 3. Payments Table Extensions
ALTER TABLE payments ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS utr VARCHAR(128);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_by_role VARCHAR(32);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verification_source VARCHAR(32);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS academic_year VARCHAR(16);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_frequency VARCHAR(32) DEFAULT 'SEMESTER';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(10,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(10,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) DEFAULT 6.36;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_id UUID;

-- Backfill utr from transaction_ref where null
UPDATE payments SET utr = transaction_ref WHERE utr IS NULL AND transaction_ref IS NOT NULL;

-- Unique index on UTR to prevent duplicate submissions (excluding REJECTED payments)
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_utr_non_rejected ON payments(utr) WHERE utr IS NOT NULL AND status != 'REJECTED';

-- 4. Enrollment Periods Extensions
ALTER TABLE enrollment_periods ADD COLUMN IF NOT EXISTS period_status VARCHAR(32) DEFAULT 'PAID';
ALTER TABLE enrollment_periods ADD COLUMN IF NOT EXISTS migration_status VARCHAR(32);
ALTER TABLE enrollment_periods ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMPTZ;
ALTER TABLE enrollment_periods ADD COLUMN IF NOT EXISTS migration_source VARCHAR(64);
ALTER TABLE enrollment_periods ADD COLUMN IF NOT EXISTS historical_payment_date_available BOOLEAN DEFAULT TRUE;
ALTER TABLE enrollment_periods ADD COLUMN IF NOT EXISTS historical_verification_status VARCHAR(32);
ALTER TABLE enrollment_periods ADD COLUMN IF NOT EXISTS historical_record_notes TEXT;
ALTER TABLE enrollment_periods ADD COLUMN IF NOT EXISTS activation_source VARCHAR(32) DEFAULT 'PAYMENT_VERIFICATION';

-- 5. Enrollments Extensions
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS activation_source VARCHAR(32) DEFAULT 'PAYMENT_VERIFICATION';
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS manual_activation_reason TEXT;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS manual_activated_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS manual_activated_at TIMESTAMPTZ;

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

-- 8. Payment Verification Events Table (Audit Log)
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

-- 9. Performance & Query Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(participant_user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_institution_id ON invoices(institution_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_id ON invoices(payment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_course_sem ON invoices(course_id, semester_number);

CREATE INDEX IF NOT EXISTS idx_payments_institution_status ON payments(institution_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_utr_verified ON payments(utr) WHERE status = 'VERIFIED';

CREATE INDEX IF NOT EXISTS idx_course_sem_configs_course ON course_semester_configs(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_periods_status ON enrollment_periods(enrollment_id, period_status);
CREATE INDEX IF NOT EXISTS idx_refund_requests_inst_status ON refund_requests(institution_id, status);
