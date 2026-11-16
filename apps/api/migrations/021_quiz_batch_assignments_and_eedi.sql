-- ============================================================================
-- Migration: 021_quiz_batch_assignments_and_eedi.sql
-- Description: Additive schema for Quiz System integration:
--              - Multi-batch assignments (quiz_batch_assignments)
--              - Trainer ownership, join code, and settings in quizzes
--              - Proctoring metadata, device tracking, and pass/fail in quiz_attempts
--              - Trainer-only EEDI evaluation metrics in quiz_eedi_results
-- Database: PostgreSQL cnc
-- Idempotent: Yes (Safe to execute multiple times)
-- ============================================================================

-- 1. Extend quizzes table
ALTER TABLE quizzes
    ADD COLUMN IF NOT EXISTS creator_trainer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS quiz_code VARCHAR(50) UNIQUE,
    ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{
        "duration_minutes": 30,
        "random_questions": true,
        "random_options": true,
        "negative_marking": true,
        "passing_marks": 0,
        "maximum_students": null,
        "camera_required": true,
        "fullscreen_required": true,
        "max_warnings": 3
    }'::jsonb;

CREATE INDEX IF NOT EXISTS idx_quizzes_creator ON quizzes(creator_trainer_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_code ON quizzes(quiz_code);

-- 2. Multi-batch assignments table
CREATE TABLE IF NOT EXISTS quiz_batch_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT uq_quiz_batch_assignment UNIQUE (quiz_id, batch_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_batch_assign_batch ON quiz_batch_assignments(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_quiz_batch_assign_quiz ON quiz_batch_assignments(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_batch_assign_inst ON quiz_batch_assignments(institution_id);

-- 3. Extend quiz_attempts table
ALTER TABLE quiz_attempts
    ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS device_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS warnings JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS warning_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'completed',
    ADD COLUMN IF NOT EXISTS percentage NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS passed BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_batch ON quiz_attempts(batch_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_inst ON quiz_attempts(institution_id);

-- 4. Isolated EEDI evaluation results table (TRAINER-ONLY VISIBILITY)
CREATE TABLE IF NOT EXISTS quiz_eedi_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    eedi_index INT,
    eedi_term VARCHAR(100) NOT NULL,
    earned_marks NUMERIC(5,2) NOT NULL DEFAULT 0,
    possible_marks NUMERIC(5,2) NOT NULL DEFAULT 0,
    score_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
    calculation_version VARCHAR(20) NOT NULL DEFAULT 'v1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_quiz_attempt_eedi_term UNIQUE (attempt_id, eedi_term, eedi_index)
);

CREATE INDEX IF NOT EXISTS idx_quiz_eedi_trainer_view ON quiz_eedi_results(batch_id, quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_eedi_student ON quiz_eedi_results(student_user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_eedi_institution ON quiz_eedi_results(institution_id);
