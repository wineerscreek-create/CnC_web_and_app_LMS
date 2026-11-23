-- Migration 031: Consolidated Quiz Feedback System
-- Implements end-of-assessment student feedback with rating, difficulty, question quality, time management, and written feedback.

CREATE TABLE IF NOT EXISTS quiz_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    institution_id UUID,
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    overall_rating INT NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
    difficulty VARCHAR(32) NOT NULL CHECK (difficulty IN ('Easy', 'Moderate', 'Difficult')),
    question_quality_rating INT NOT NULL CHECK (question_quality_rating BETWEEN 1 AND 5),
    time_management VARCHAR(32) NOT NULL CHECK (time_management IN ('Sufficient', 'Insufficient')),
    written_feedback VARCHAR(2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_quiz_feedback_attempt UNIQUE (attempt_id)
);

CREATE INDEX IF NOT EXISTS ix_quiz_feedback_quiz ON quiz_feedback (quiz_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_quiz_feedback_student ON quiz_feedback (student_user_id, quiz_id);
CREATE INDEX IF NOT EXISTS ix_quiz_feedback_tenant ON quiz_feedback (tenant_id, quiz_id);
