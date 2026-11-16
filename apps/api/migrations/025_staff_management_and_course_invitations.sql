-- Migration 025: Staff Management and Course Invitations
-- Supports independent online trainers vs institutional trainers,
-- and formal course invitation & acceptance lifecycle.

-- 0. Ensure SUSPENDED is in record_status_enum
DO $$ BEGIN
    ALTER TYPE record_status_enum ADD VALUE IF NOT EXISTS 'SUSPENDED';
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. Ensure staff fields on users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS affiliation_type VARCHAR(32) NOT NULL DEFAULT 'INSTITUTION';
ALTER TABLE users ADD COLUMN IF NOT EXISTS designation VARCHAR(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS qualification VARCHAR(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS specialization VARCHAR(150);

-- 2. Ensure trainer profile affiliation and qualification fields
ALTER TABLE trainer_profiles ADD COLUMN IF NOT EXISTS affiliation_type VARCHAR(32) NOT NULL DEFAULT 'INSTITUTION';
ALTER TABLE trainer_profiles ADD COLUMN IF NOT EXISTS qualification VARCHAR(150);
ALTER TABLE trainer_profiles ADD COLUMN IF NOT EXISTS specialization VARCHAR(150);

-- 3. Create course_invitations table
CREATE TABLE IF NOT EXISTS course_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    trainer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    notes TEXT,
    proposed_start_date DATE,
    proposed_end_date DATE,
    offered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    response_notes TEXT,
    responded_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_invitations_trainer ON course_invitations(trainer_user_id);
CREATE INDEX IF NOT EXISTS idx_course_invitations_course ON course_invitations(course_id);
CREATE INDEX IF NOT EXISTS idx_course_invitations_status ON course_invitations(status);
CREATE INDEX IF NOT EXISTS idx_course_invitations_inst ON course_invitations(institution_id);
