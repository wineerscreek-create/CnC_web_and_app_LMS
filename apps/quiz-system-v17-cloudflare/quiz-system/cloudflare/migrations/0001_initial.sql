CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'trainer', 'hod', 'student')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'live', 'ended', 'archived')),
  settings_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  ended_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_quizzes_owner ON quizzes(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quizzes_status ON quizzes(status);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  question TEXT NOT NULL,
  image TEXT,
  options_json TEXT NOT NULL,
  correct_json TEXT NOT NULL,
  marks REAL NOT NULL DEFAULT 1,
  negative REAL NOT NULL DEFAULT 0,
  question_type TEXT NOT NULL DEFAULT 'mcq_single'
);

CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id, position);
