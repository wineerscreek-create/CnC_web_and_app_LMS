-- Migration 028: Assessment Engine Abandonment Detection, Recovery Lifecycle and Proctoring Audit

ALTER TABLE quiz_attempts
    ADD COLUMN IF NOT EXISTS submission_reason VARCHAR(64) DEFAULT 'STUDENT_MANUAL_SUBMIT',
    ADD COLUMN IF NOT EXISTS candidate_status VARCHAR(64) DEFAULT 'NOT_STARTED',
    ADD COLUMN IF NOT EXISTS camera_status VARCHAR(64) DEFAULT 'OFF',
    ADD COLUMN IF NOT EXISTS abandonment_warning_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS abandonment_timeout_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS last_camera_frame_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_recovered BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS recovery_history JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS remaining_seconds INT,
    ADD COLUMN IF NOT EXISTS current_question_index INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_candidate_status ON quiz_attempts(candidate_status);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_sub_reason ON quiz_attempts(submission_reason);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_heartbeat ON quiz_attempts(last_heartbeat_at);

-- Immutable audit log for all trainer assessment recovery operations
CREATE TABLE IF NOT EXISTS quiz_recovery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    recovery_action VARCHAR(50) NOT NULL, -- 'RESTART' or 'RESUME'
    recovery_reason TEXT NOT NULL,
    previous_attempt_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_recovery_quiz ON quiz_recovery_logs(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_recovery_student ON quiz_recovery_logs(student_user_id);
