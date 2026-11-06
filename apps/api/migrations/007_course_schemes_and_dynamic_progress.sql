-- Migration 007: Dynamic Course Schemes and Participant Multi-Course Progress
-- Enables semester, year, module, monthly, quarterly, and custom schemes
-- with independent payment plans and historical version snapshots.

-- 1. Course scheme attributes
ALTER TABLE courses ADD COLUMN IF NOT EXISTS scheme_type VARCHAR(50) NOT NULL DEFAULT 'SEMESTER';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS scheme_name VARCHAR(255) NOT NULL DEFAULT 'Standard Academic Scheme';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS total_periods INT NOT NULL DEFAULT 8;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS period_label VARCHAR(50) NOT NULL DEFAULT 'Semester';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS periods_config JSONB;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS payment_frequency VARCHAR(50) NOT NULL DEFAULT 'SEMESTER';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS payment_config JSONB;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS scheme_version INT NOT NULL DEFAULT 1;

-- 2. Enrollment scheme snapshots for non-destructive historical tracking
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS scheme_type VARCHAR(50) NOT NULL DEFAULT 'SEMESTER';
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS scheme_version INT NOT NULL DEFAULT 1;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS periods_snapshot JSONB;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS current_period INT NOT NULL DEFAULT 1;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS current_period_name VARCHAR(100) NOT NULL DEFAULT 'Semester 1';

-- 3. Enrollment period generalization
ALTER TABLE enrollment_periods ADD COLUMN IF NOT EXISTS period_number INT;
ALTER TABLE enrollment_periods ADD COLUMN IF NOT EXISTS period_name VARCHAR(100);
ALTER TABLE enrollment_periods ADD COLUMN IF NOT EXISTS period_type VARCHAR(50) DEFAULT 'SEMESTER';

-- 4. Initial backfill
UPDATE enrollment_periods SET period_number = semester WHERE period_number IS NULL;
UPDATE enrollment_periods SET period_name = 'Semester ' || semester WHERE period_name IS NULL;
UPDATE enrollments SET current_period = current_semester WHERE current_period = 1 AND current_semester > 1;
UPDATE enrollments SET current_period_name = 'Semester ' || current_semester WHERE current_period_name = 'Semester 1' AND current_semester > 1;
