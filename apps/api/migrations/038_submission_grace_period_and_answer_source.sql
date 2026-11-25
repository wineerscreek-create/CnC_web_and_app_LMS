-- Migration 038: Connection-Loss Grace Period, Persistent Deadlines & Answer Source Tracking

ALTER TABLE quizzes
    ADD COLUMN IF NOT EXISTS connection_grace_seconds INT NOT NULL DEFAULT 15;

ALTER TABLE quiz_attempts
    ADD COLUMN IF NOT EXISTS connection_lost_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS grace_deadline_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS answer_source VARCHAR(64) NOT NULL DEFAULT 'SERVER_PERSISTED';

CREATE INDEX IF NOT EXISTS ix_quiz_attempts_grace_deadline
    ON quiz_attempts (grace_deadline_at)
    WHERE status = 'in_progress' AND grace_deadline_at IS NOT NULL;
