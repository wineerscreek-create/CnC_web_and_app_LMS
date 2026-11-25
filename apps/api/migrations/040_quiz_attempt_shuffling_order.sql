-- Migration 040: Persisted Question and Option Shuffling Order per Quiz Attempt
-- Rollback:
--   ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS question_order, DROP COLUMN IF EXISTS option_order;

ALTER TABLE quiz_attempts
    ADD COLUMN IF NOT EXISTS question_order JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS option_order JSONB DEFAULT '{}'::jsonb;
