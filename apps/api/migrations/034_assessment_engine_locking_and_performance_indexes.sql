-- Migration 034: Assessment Engine Locking Support & Query Performance Optimization
-- Optimizes Trainer Results query, draft answer lookups, and student attempt indexing.

-- 1. Index on quiz camera snapshots for rapid quiz-level results retrieval
CREATE INDEX IF NOT EXISTS ix_quiz_camera_snapshots_quiz_time 
ON quiz_camera_snapshots (quiz_id, snapshot_timestamp ASC);

-- 2. Composite indexes on quiz_attempts for high-speed student attempt lookups and trainer rankings
CREATE INDEX IF NOT EXISTS ix_quiz_attempts_quiz_score 
ON quiz_attempts (quiz_id, score DESC);

CREATE INDEX IF NOT EXISTS ix_quiz_attempts_quiz_student 
ON quiz_attempts (quiz_id, student_user_id);

CREATE INDEX IF NOT EXISTS ix_quiz_attempts_status 
ON quiz_attempts (status, candidate_status);

-- 3. Ensure question_states JSONB exists and has GIN index for locking checks
CREATE INDEX IF NOT EXISTS ix_quiz_attempts_question_states 
ON quiz_attempts USING gin (question_states);

-- 4. Index on assessment reports for rapid student history queries
CREATE INDEX IF NOT EXISTS ix_assessment_reports_student_quiz 
ON assessment_reports (student_user_id, quiz_id, created_at DESC);
