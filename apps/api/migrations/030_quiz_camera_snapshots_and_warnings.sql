-- Migration 030: Persistent Camera Snapshots and Proctoring Warning Integrity
-- Establishes relational storage for assessment camera snapshots and enforces warning integrity.

CREATE TABLE IF NOT EXISTS quiz_camera_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attempt_id UUID REFERENCES quiz_attempts(id) ON DELETE SET NULL,
    snapshot_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type VARCHAR(64) NOT NULL DEFAULT 'PERIODIC',
    image_data TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_quiz_camera_snapshots_quiz_student 
ON quiz_camera_snapshots (quiz_id, student_user_id, snapshot_timestamp ASC);

CREATE INDEX IF NOT EXISTS ix_quiz_camera_snapshots_attempt 
ON quiz_camera_snapshots (attempt_id, snapshot_timestamp ASC);

-- Ensure warning_count accurately reflects warnings jsonb length safely
UPDATE quiz_attempts
SET warning_count = CASE 
    WHEN jsonb_typeof(warnings) = 'array' THEN jsonb_array_length(warnings)
    ELSE warning_count
END
WHERE warnings IS NOT NULL 
  AND jsonb_typeof(warnings) = 'array'
  AND (warning_count IS NULL OR warning_count = 0);
