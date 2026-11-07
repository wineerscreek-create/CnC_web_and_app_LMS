-- Migration 011: Partial Unique Index for Nullable Department Trainer Assignments and Historical Snapshot Immutability
-- Description: 
-- 1. Ensures that when department_id IS NULL, (course_id, trainer_user_id) cannot have duplicates,
--    complementing the existing CONSTRAINT uq_course_trainer_dept UNIQUE (course_id, trainer_user_id, department_id).
-- 2. Installs engine-level immutability trigger on historical_learning_snapshots prohibiting UPDATE and DELETE.

DO $$
DECLARE
    dupe_count INT;
    dupe_details TEXT;
BEGIN
    -- 1. Pre-flight check: Detect any existing duplicate assignments with NULL department_id
    SELECT COUNT(*), string_agg(format('course_id=%s, trainer_user_id=%s (count=%s)', course_id, trainer_user_id, cnt), '; ')
    INTO dupe_count, dupe_details
    FROM (
        SELECT course_id, trainer_user_id, COUNT(*) as cnt
        FROM course_trainer_assignments
        WHERE department_id IS NULL
        GROUP BY course_id, trainer_user_id
        HAVING COUNT(*) > 1
    ) sub;

    IF dupe_count > 0 THEN
        RAISE EXCEPTION 'Migration 011 aborted: % duplicate NULL-department assignment(s) detected: %. Please resolve duplicates before applying unique index.', dupe_count, dupe_details;
    END IF;
END $$;

-- 2. Create partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_course_trainer_null_dept
ON course_trainer_assignments (course_id, trainer_user_id)
WHERE department_id IS NULL;

-- 3. Engine-level Immutability Trigger for historical_learning_snapshots
-- Ensures student academic and learning records cannot be altered or deleted.
CREATE OR REPLACE FUNCTION trg_protect_historical_snapshots()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'historical_learning_snapshots records are permanent and immutable. UPDATE and DELETE operations are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_historical_snapshots ON historical_learning_snapshots;
CREATE TRIGGER trg_immutable_historical_snapshots
BEFORE UPDATE OR DELETE ON historical_learning_snapshots
FOR EACH ROW EXECUTE FUNCTION trg_protect_historical_snapshots();

-- 4. Statement-level TRUNCATE Protection Trigger for historical_learning_snapshots
CREATE OR REPLACE FUNCTION trg_protect_historical_snapshots_truncate()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'historical_learning_snapshots records are permanent. TRUNCATE operation is strictly prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_truncate_historical_snapshots ON historical_learning_snapshots;
CREATE TRIGGER trg_truncate_historical_snapshots
BEFORE TRUNCATE ON historical_learning_snapshots
FOR EACH STATEMENT EXECUTE FUNCTION trg_protect_historical_snapshots_truncate();
