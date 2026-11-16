-- Migration 024: Add assessment timing modes and question states tracking

ALTER TABLE quizzes
ADD COLUMN IF NOT EXISTS timing_mode VARCHAR(32) DEFAULT 'FIXED_TOTAL';

ALTER TABLE quiz_attempts
ADD COLUMN IF NOT EXISTS question_states JSONB DEFAULT '{}'::jsonb;

-- Backfill timing_mode from settings if enable_timed_questions is true
UPDATE quizzes
SET timing_mode = CASE
    WHEN settings->>'timing_mode' = 'PER_QUESTION' THEN 'PER_QUESTION'
    WHEN (settings->>'enable_timed_questions')::boolean = true THEN 'PER_QUESTION'
    ELSE 'FIXED_TOTAL'
END
WHERE timing_mode IS NULL OR timing_mode = 'FIXED_TOTAL';
