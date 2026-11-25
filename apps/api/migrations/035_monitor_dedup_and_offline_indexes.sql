-- Migration 035: Assessment Monitor Deduplication, Status Repair & Performance Indexes
-- Safe, non-destructive migration. Never deletes quiz_attempts or assessment_reports.
--
-- Rollback instructions:
--   DROP INDEX IF EXISTS uq_quiz_attempts_active_per_student;
--   DROP INDEX IF EXISTS ix_quiz_attempts_quiz_student_created;
--   DROP INDEX IF EXISTS ix_offline_packages_resource_user;
--   DROP INDEX IF EXISTS ix_sync_operations_user_resource;

-- 1. Repair legacy candidate_status rows where status was updated without candidate_status
UPDATE quiz_attempts
SET candidate_status = 'OFFLINE_SUBMITTED'
WHERE status = 'completed'
  AND submission_source = 'OFFLINE_SYNC'
  AND (candidate_status IS NULL OR candidate_status IN ('NOT_STARTED', 'COMPLETED'));

UPDATE quiz_attempts
SET candidate_status = 'COMPLETED'
WHERE status = 'completed'
  AND COALESCE(submission_source, 'ONLINE') <> 'OFFLINE_SYNC'
  AND (candidate_status IS NULL OR candidate_status = 'NOT_STARTED');

UPDATE quiz_attempts
SET candidate_status = 'IN_PROGRESS'
WHERE status = 'in_progress'
  AND (candidate_status IS NULL OR candidate_status = 'NOT_STARTED');

-- 2. Prevent concurrent duplicate active (in_progress) attempts for the same student + quiz
-- Verified beforehand: 0 duplicate in_progress rows exist.
CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_attempts_active_per_student
ON quiz_attempts (quiz_id, student_user_id)
WHERE status = 'in_progress';

-- 3. Composite index for fast authoritative attempt selection and monitor pagination
CREATE INDEX IF NOT EXISTS ix_quiz_attempts_quiz_student_created
ON quiz_attempts (quiz_id, student_user_id, created_at DESC);

-- 4. Index for offline package & sync operation lookups per assessment
CREATE INDEX IF NOT EXISTS ix_offline_packages_resource_user
ON offline_packages (resource_id, package_type, user_id);

CREATE INDEX IF NOT EXISTS ix_sync_operations_user_resource
ON sync_operations (user_id, resource_id, status);
