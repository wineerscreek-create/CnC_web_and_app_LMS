-- ============================================================================
-- Migration 009: Super Admin Centralized Control Center
-- 
-- Implements:
-- 1. SPOC-to-Branch Many-to-Many Assignment Architecture (spoc_branch_assignments)
-- 2. Course Trainer Assignment Mapping (course_trainer_assignments)
-- 3. Course Visibility, Portal Distribution, and Lifecycle Columns (courses)
-- 4. Course Deletion Jobs & 72-Hour Immutable Historical Learning Snapshots
-- 5. Institution Deletion Safeguards & Participant Re-Affiliation Tracking (users, institutions)
-- ============================================================================

-- 1. COURSES TABLE ENHANCEMENTS: VISIBILITY, PORTAL DISTRIBUTION & LIFECYCLE
ALTER TABLE courses ADD COLUMN IF NOT EXISTS visibility_mode VARCHAR(50) NOT NULL DEFAULT 'EVERYONE';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS target_institution_ids UUID[] DEFAULT '{}';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS target_branch_ids UUID[] DEFAULT '{}';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS portal_distribution JSONB NOT NULL DEFAULT '{"spoc": true, "admin": true, "trainer": true, "participant": true}'::jsonb;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS allowed_enrollment_methods TEXT[] NOT NULL DEFAULT ARRAY['SELF', 'ADMIN', 'SPOC', 'SUPER_ADMIN'];
ALTER TABLE courses ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ;

-- 2. SPOC-TO-BRANCH MANY-TO-MANY ASSIGNMENTS (spoc_branch_assignments)
CREATE TABLE IF NOT EXISTS spoc_branch_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spoc_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    can_view_participants BOOLEAN NOT NULL DEFAULT TRUE,
    can_view_trainers BOOLEAN NOT NULL DEFAULT TRUE,
    can_view_attendance BOOLEAN NOT NULL DEFAULT TRUE,
    can_view_reports BOOLEAN NOT NULL DEFAULT TRUE,
    can_manage_enrollment BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_spoc_branch UNIQUE (spoc_user_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_spoc_branch_spoc ON spoc_branch_assignments(spoc_user_id);
CREATE INDEX IF NOT EXISTS idx_spoc_branch_dept ON spoc_branch_assignments(department_id);
CREATE INDEX IF NOT EXISTS idx_spoc_branch_inst ON spoc_branch_assignments(institution_id);

-- Backfill initial M2M records from existing HOD users with assigned department_id
INSERT INTO spoc_branch_assignments (spoc_user_id, institution_id, department_id)
SELECT u.id, u.institution_id, u.department_id
FROM users u
WHERE u.role = 'HOD' AND u.institution_id IS NOT NULL AND u.department_id IS NOT NULL
ON CONFLICT (spoc_user_id, department_id) DO NOTHING;

-- 3. COURSE TRAINER ASSIGNMENTS (course_trainer_assignments)
CREATE TABLE IF NOT EXISTS course_trainer_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    trainer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_course_trainer_dept UNIQUE (course_id, trainer_user_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_course_trainer_course ON course_trainer_assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_course_trainer_trainer ON course_trainer_assignments(trainer_user_id);

-- 4. COURSE DELETION JOBS TABLE (course_deletion_jobs)
CREATE TABLE IF NOT EXISTS course_deletion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL,
    course_title VARCHAR(255) NOT NULL,
    initiated_by UUID NOT NULL REFERENCES users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'REQUESTED',
    total_affected_participants INT DEFAULT 0,
    total_snapshots_created INT DEFAULT 0,
    retention_hours INT NOT NULL DEFAULT 72,
    retention_expires_at TIMESTAMPTZ NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    purged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_course_del_jobs_course ON course_deletion_jobs(course_id);
CREATE INDEX IF NOT EXISTS idx_course_del_jobs_status ON course_deletion_jobs(status);

-- 5. HISTORICAL LEARNING SNAPSHOTS TABLE (historical_learning_snapshots)
-- Immutable snapshots preserved permanently so participants retain lifetime records
CREATE TABLE IF NOT EXISTS historical_learning_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL,
    course_title VARCHAR(255) NOT NULL,
    course_slug VARCHAR(255),
    participant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enrollment_id UUID,
    enrollment_status VARCHAR(50),
    progress_percent NUMERIC(5,2) DEFAULT 0.0,
    attendance_percentage NUMERIC(5,2) DEFAULT 0.0,
    completed_lessons INT DEFAULT 0,
    total_lessons INT DEFAULT 0,
    average_quiz_score NUMERIC(5,2),
    eedi_scores JSONB DEFAULT '{}'::jsonb,
    assessment_results JSONB DEFAULT '[]'::jsonb,
    game_performance JSONB DEFAULT '[]'::jsonb,
    snapshot_data JSONB NOT NULL,
    retention_expires_at TIMESTAMPTZ NOT NULL,
    is_downloadable_now BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hist_snapshots_user_course ON historical_learning_snapshots(participant_user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_hist_snapshots_user ON historical_learning_snapshots(participant_user_id);
CREATE INDEX IF NOT EXISTS idx_hist_snapshots_retention ON historical_learning_snapshots(retention_expires_at);

-- 6. INSTITUTION DELETION SAFEGUARDS & PARTICIPANT RE-AFFILIATION (users, institutions)
ALTER TABLE users ADD COLUMN IF NOT EXISTS affiliation_status VARCHAR(50) NOT NULL DEFAULT 'VERIFIED';
ALTER TABLE users ADD COLUMN IF NOT EXISTS historical_institution_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS historical_institution_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS affiliation_action_required_at TIMESTAMPTZ;

ALTER TABLE institutions ADD COLUMN IF NOT EXISTS institution_category VARCHAR(50) NOT NULL DEFAULT 'COLLEGE';
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS campuses_count INT NOT NULL DEFAULT 1;
