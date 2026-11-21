-- 029_attendance_centralized_and_messaging_repair.sql
-- Production stabilization for Attendance Management System and Messaging Module

-- 1. Extend attendance_status_enum with LEAVE and PENDING if not already present
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'LEAVE' AND enumtypid = 'attendance_status_enum'::regtype) THEN
        ALTER TYPE attendance_status_enum ADD VALUE 'LEAVE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PENDING' AND enumtypid = 'attendance_status_enum'::regtype) THEN
        ALTER TYPE attendance_status_enum ADD VALUE 'PENDING';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Extend attendance_records table with required metadata columns
ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS institution_id UUID,
    ADD COLUMN IF NOT EXISTS batch_id UUID,
    ADD COLUMN IF NOT EXISTS attendance_date DATE,
    ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS marking_method VARCHAR(50) DEFAULT 'TRAINER_MANUAL',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Ensure indexing for performance and deduplication
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_session_participant 
    ON attendance_records (session_id, participant_user_id);

CREATE INDEX IF NOT EXISTS ix_attendance_batch_date 
    ON attendance_records (batch_id, attendance_date);

CREATE INDEX IF NOT EXISTS ix_attendance_institution 
    ON attendance_records (institution_id);

-- 4. Backfill existing attendance_records from training_sessions
UPDATE attendance_records ar
SET 
    institution_id = ts.institution_id,
    batch_id = ts.batch_id,
    attendance_date = ts.session_date,
    start_time = ts.starts_at,
    end_time = ts.ends_at,
    updated_at = NOW()
FROM training_sessions ts
WHERE ar.session_id = ts.id
  AND ar.batch_id IS NULL;

-- 5. Backfill student_profiles from enrollments table so every enrolled student has a persistent profile
INSERT INTO student_profiles (
    id, user_id, roll_number, institution_id, department_id, batch_id, created_at, updated_at
)
SELECT DISTINCT ON (e.participant_user_id)
    gen_random_uuid(),
    e.participant_user_id,
    COALESCE(
        NULLIF(u.employee_id, ''),
        UPPER(SPLIT_PART(u.email, '@', 1))
    ),
    e.institution_id,
    e.department_id,
    e.batch_id,
    NOW(),
    NOW()
FROM enrollments e
JOIN users u ON u.id = e.participant_user_id
LEFT JOIN student_profiles sp ON sp.user_id = e.participant_user_id
WHERE sp.id IS NULL AND e.batch_id IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
    batch_id = EXCLUDED.batch_id,
    department_id = COALESCE(student_profiles.department_id, EXCLUDED.department_id),
    institution_id = COALESCE(student_profiles.institution_id, EXCLUDED.institution_id),
    updated_at = NOW();

-- Update student_profiles with null batch_id if active enrollments exist
UPDATE student_profiles sp
SET batch_id = e.batch_id, updated_at = NOW()
FROM enrollments e
WHERE e.participant_user_id = sp.user_id
  AND sp.batch_id IS NULL
  AND e.batch_id IS NOT NULL;
