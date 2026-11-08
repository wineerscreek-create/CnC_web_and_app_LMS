-- Migration 013: Operational tables for Assessments, Assignments, Reports, Bulk Imports, Alerts, and Evaluation Reports
-- Description:
-- 1. Creates operational relational tables for Quizzes, Quiz Attempts, Assignments, Assignment Submissions.
-- 2. Creates report_jobs table to track synchronous and asynchronous report generation in PostgreSQL.
-- 3. Creates import_jobs table to persist bulk CSV import history.
-- 4. Creates weak_student_alerts table to track trainer alerts.
-- 5. Extends eedi_evaluations with report_data JSONB column for comprehensive evaluation report storage.
-- 6. Grants operational permissions to runtime role cnc_lms_app.

-- 1. Quizzes
CREATE TABLE IF NOT EXISTS quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    kind VARCHAR(50) NOT NULL DEFAULT 'quiz',
    duration_minutes INT NOT NULL DEFAULT 15,
    max_score INT NOT NULL DEFAULT 100,
    allow_retake BOOLEAN NOT NULL DEFAULT FALSE,
    opens_at TIMESTAMPTZ,
    closes_at TIMESTAMPTZ,
    questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quizzes_batch ON quizzes(batch_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_institution ON quizzes(institution_id);

-- 2. Quiz Attempts
CREATE TABLE IF NOT EXISTS quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INT NOT NULL DEFAULT 0,
    possible INT NOT NULL DEFAULT 100,
    answers JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student ON quiz_attempts(student_user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON quiz_attempts(quiz_id);

-- 3. Assignments
CREATE TABLE IF NOT EXISTS assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    trainer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    training_module_id UUID,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_at TIMESTAMPTZ,
    max_score NUMERIC(5,2) NOT NULL DEFAULT 100,
    allow_late BOOLEAN NOT NULL DEFAULT FALSE,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assignments_batch ON assignments(batch_id);
CREATE INDEX IF NOT EXISTS idx_assignments_trainer ON assignments(trainer_user_id);

-- 4. Assignment Submissions
CREATE TABLE IF NOT EXISTS assignment_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    state VARCHAR(50) NOT NULL DEFAULT 'submitted',
    grade NUMERIC(5,2),
    remarks TEXT,
    note TEXT,
    files JSONB NOT NULL DEFAULT '[]'::jsonb,
    late BOOLEAN NOT NULL DEFAULT FALSE,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_assignment_student UNIQUE (assignment_id, student_user_id)
);
CREATE INDEX IF NOT EXISTS idx_assignment_sub_student ON assignment_submissions(student_user_id);

-- 5. Report Jobs
CREATE TABLE IF NOT EXISTS report_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    requested_by_role VARCHAR(50),
    report_type VARCHAR(100) NOT NULL,
    format VARCHAR(20) NOT NULL DEFAULT 'xlsx',
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    row_count INT,
    storage_key TEXT,
    filename TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_report_jobs_inst ON report_jobs(institution_id);
CREATE INDEX IF NOT EXISTS idx_report_jobs_requester ON report_jobs(requested_by);

-- 6. Import Jobs
CREATE TABLE IF NOT EXISTS import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    entity VARCHAR(50) NOT NULL,
    filename TEXT,
    total_rows INT NOT NULL DEFAULT 0,
    success_count INT NOT NULL DEFAULT 0,
    failure_count INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'completed',
    errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_import_jobs_inst ON import_jobs(institution_id);

-- 7. Weak Student Alerts
CREATE TABLE IF NOT EXISTS weak_student_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trainer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason VARCHAR(255) NOT NULL,
    score NUMERIC(5,2),
    threshold NUMERIC(5,2),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_weak_alerts_trainer ON weak_student_alerts(trainer_user_id);
CREATE INDEX IF NOT EXISTS idx_weak_alerts_student ON weak_student_alerts(student_user_id);

-- 8. Add report_data to eedi_evaluations
ALTER TABLE eedi_evaluations ADD COLUMN IF NOT EXISTS report_data JSONB;

-- 9. Runtime Permissions
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'cnc_lms_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cnc_lms_app;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cnc_lms_app;
    END IF;
END $$;
