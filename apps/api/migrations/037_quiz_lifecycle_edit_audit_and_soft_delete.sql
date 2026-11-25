-- Migration 037: Quiz Lifecycle, Edit Audit Trail, Manual End Tracking, and Safe Soft-Delete
-- Rollback:
--   DROP INDEX IF EXISTS ix_quizzes_not_deleted;
--   ALTER TABLE quizzes DROP COLUMN IF EXISTS edited_by, DROP COLUMN IF EXISTS edited_at,
--     DROP COLUMN IF EXISTS edit_audit_log, DROP COLUMN IF EXISTS ended_by,
--     DROP COLUMN IF EXISTS ended_at, DROP COLUMN IF EXISTS manually_ended,
--     DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS deleted_by;

ALTER TABLE quizzes
    ADD COLUMN IF NOT EXISTS edited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS edit_audit_log JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS ended_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS manually_ended BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_quizzes_not_deleted
    ON quizzes (creator_trainer_id, created_at DESC)
    WHERE deleted_at IS NULL;
