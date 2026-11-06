-- ============================================================================
-- Migration 010: Course Visibility, Tenant Scoping & Purge Safety Safeguards
-- 
-- Implements:
-- 1. Granular Course Visibility Modes & Target Scopes (Campus, Branch, Institution)
-- 2. User Campus Affiliation for Multi-Campus Institutions
-- 3. Deletion Job & Snapshot Index Optimization
-- ============================================================================

-- 1. Add target campus scoping column
ALTER TABLE courses ADD COLUMN IF NOT EXISTS target_campus_ids TEXT[] DEFAULT '{}';

-- 2. Add campus identifier to user accounts
ALTER TABLE users ADD COLUMN IF NOT EXISTS campus VARCHAR(100);

-- 3. Standardize visibility modes with check constraint
DO $$ BEGIN
    ALTER TABLE courses DROP CONSTRAINT IF EXISTS chk_course_visibility_mode;
    ALTER TABLE courses ADD CONSTRAINT chk_course_visibility_mode CHECK (
        visibility_mode IN (
            'EVERYONE', 'COLLEGE', 'SCHOOL', 'CORPORATE',
            'SELECTED_INSTITUTIONS', 'SELECTED_CAMPUSES', 'SELECTED_BRANCHES', 'INVITE_ONLY',
            'ALL_COLLEGES', 'SELECTED_COLLEGES', 'INTERNAL_ONLY'
        )
    );
EXCEPTION WHEN others THEN null; END $$;

-- 4. Fast lookup indexes for course visibility & deletion safety verification
CREATE INDEX IF NOT EXISTS idx_courses_visibility_mode ON courses(visibility_mode) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_courses_target_inst ON courses USING GIN(target_institution_ids);
CREATE INDEX IF NOT EXISTS idx_courses_target_branch ON courses USING GIN(target_branch_ids);
CREATE INDEX IF NOT EXISTS idx_deletion_jobs_lookup ON course_deletion_jobs(course_id, status);
CREATE INDEX IF NOT EXISTS idx_snapshots_course_lookup ON historical_learning_snapshots(course_id);
