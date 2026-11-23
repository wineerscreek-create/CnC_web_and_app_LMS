-- ============================================================================
-- Migration 032: Decentralized Offline-First Examination Extensions
-- ============================================================================

-- 1. Extend offline_packages with device binding and cryptographic signatures
ALTER TABLE offline_packages 
    ADD COLUMN IF NOT EXISTS device_fingerprint_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS package_signature VARCHAR(128),
    ADD COLUMN IF NOT EXISTS max_duration_minutes INT DEFAULT 60,
    ADD COLUMN IF NOT EXISTS downloaded_at TIMESTAMPTZ;

-- 2. Extend quiz_attempts for offline submission tracing and tamper-evident hashes
ALTER TABLE quiz_attempts 
    ADD COLUMN IF NOT EXISTS submission_source VARCHAR(20) DEFAULT 'ONLINE', -- 'ONLINE' | 'OFFLINE_SYNC'
    ADD COLUMN IF NOT EXISTS offline_integrity_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS time_taken_seconds INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS local_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS local_submitted_at TIMESTAMPTZ;

-- 3. Table to store offline proctoring events uploaded on reconnection
CREATE TABLE IF NOT EXISTS offline_proctoring_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'FULLSCREEN_EXIT', 'TAB_BLUR', 'WINDOW_FOCUS_LOST', 'CAMERA_OFF', 'CLOCK_TAMPER'
    client_timestamp TIMESTAMPTZ NOT NULL,
    elapsed_seconds INT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offline_proctor_attempt ON offline_proctoring_logs(attempt_id);
CREATE INDEX IF NOT EXISTS idx_offline_proctor_quiz ON offline_proctoring_logs(quiz_id);
