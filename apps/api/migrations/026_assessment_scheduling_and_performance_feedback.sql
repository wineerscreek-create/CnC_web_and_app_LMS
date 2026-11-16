-- Migration 026: Assessment Scheduling, Performance Feedback & Answer Reveal Persistence

ALTER TABLE quizzes
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS instructions TEXT;

ALTER TABLE quiz_attempts
ADD COLUMN IF NOT EXISTS performance_category VARCHAR(50),
ADD COLUMN IF NOT EXISTS motivational_message TEXT,
ADD COLUMN IF NOT EXISTS correct_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS incorrect_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS unattempted_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_quizzes_scheduling ON quizzes(opens_at, closes_at);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_perf_cat ON quiz_attempts(performance_category);
