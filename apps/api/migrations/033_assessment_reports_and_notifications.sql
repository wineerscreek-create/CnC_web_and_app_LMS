-- ============================================================================
-- Migration 033: Permanent Student Assessment Reports & Smart Notifications
-- ============================================================================

-- 1. Extend notifications table for priority levels and idempotent deduplication
ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'MEDIUM',
    ADD COLUMN IF NOT EXISTS dedup_key VARCHAR(255),
    ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedup_key 
    ON notifications (dedup_key) 
    WHERE dedup_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread 
    ON notifications (recipient_user_id, is_read, created_at DESC);

-- 2. Permanent Assessment Reports Table
-- Stores an immutable, historical snapshot of every completed assessment attempt.
-- Guaranteed:
--  - ON DELETE RESTRICT on attempt, quiz, and student prevents accidental cascading loss.
--  - Changes to underlying quiz/questions will NEVER mutate finalized report snapshots.
--  - Reattempts produce new independent reports linked to their specific attempt_id.
CREATE TABLE IF NOT EXISTS assessment_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL UNIQUE REFERENCES quiz_attempts(id) ON DELETE RESTRICT,
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE RESTRICT,
    student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    attempt_number INT NOT NULL DEFAULT 1,

    -- Snapshot Student & Course Details
    student_name VARCHAR(255) NOT NULL,
    roll_number VARCHAR(100) DEFAULT '',
    email VARCHAR(255) DEFAULT '',
    branch VARCHAR(100) DEFAULT '',
    semester VARCHAR(50) DEFAULT '',
    batch_name VARCHAR(100) DEFAULT '',
    assessment_title VARCHAR(255) NOT NULL,
    trainer_name VARCHAR(255) DEFAULT '',

    -- Timing & Dates
    assessment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    time_taken_seconds INT NOT NULL DEFAULT 0,

    -- Score Metrics
    total_questions INT NOT NULL DEFAULT 0,
    attempted_questions INT NOT NULL DEFAULT 0,
    unattempted_questions INT NOT NULL DEFAULT 0,
    correct_answers INT NOT NULL DEFAULT 0,
    incorrect_answers INT NOT NULL DEFAULT 0,
    marks_obtained NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    max_marks NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    percentage NUMERIC(7, 2) NOT NULL DEFAULT 0.00,
    result_status VARCHAR(50) NOT NULL DEFAULT 'FAILED', -- 'PASSED' | 'FAILED'

    -- Proctoring & Warnings Snapshot
    warning_count INT NOT NULL DEFAULT 0,
    proctoring_summary JSONB NOT NULL DEFAULT '{"total_warnings": 0, "events": []}'::jsonb,

    -- Detailed Breakdown Snapshots
    -- question_summary: [{ question_id, question_text, topic, difficulty, marks, max_marks, student_answer, correct_answer, is_correct, explanation }]
    question_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- topic_performance: [{ topic, total_questions, correct_answers, score, max_score, percentage }]
    topic_performance JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- feedback: { motivational_message, category, strengths, areas_for_improvement, student_feedback_submitted }
    feedback JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_reports_student 
    ON assessment_reports (student_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assessment_reports_quiz 
    ON assessment_reports (quiz_id);
CREATE INDEX IF NOT EXISTS idx_assessment_reports_batch 
    ON assessment_reports (batch_id);
CREATE INDEX IF NOT EXISTS idx_assessment_reports_created 
    ON assessment_reports (created_at DESC);
