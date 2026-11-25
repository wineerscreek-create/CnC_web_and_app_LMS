-- Migration 035: Safe Duplicate Active Attempt Reconciliation, Monitor Deduplication & Performance Indexes
-- Non-destructive migration: never deletes quiz_attempts, answers, snapshots, or assessment_reports.
--
-- Rollback instructions:
--   DROP INDEX IF EXISTS uq_quiz_attempts_active_per_student;
--   DROP INDEX IF EXISTS ix_quiz_attempts_quiz_student_created;
--   DROP INDEX IF EXISTS ix_offline_packages_resource_user;
--   DROP INDEX IF EXISTS ix_sync_operations_user_resource;

-- 1. Create immutable reconciliation audit table
CREATE TABLE IF NOT EXISTS quiz_attempt_reconciliation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL,
    student_user_id UUID NOT NULL,
    canonical_attempt_id UUID NOT NULL,
    reconciled_attempt_id UUID NOT NULL,
    previous_status VARCHAR(64),
    previous_candidate_status VARCHAR(64),
    new_status VARCHAR(64) NOT NULL,
    new_candidate_status VARCHAR(64) NOT NULL,
    merged_answers_count INT NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    snapshot_before JSONB NOT NULL,
    reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_quiz_attempt_reconcile_quiz_student
ON quiz_attempt_reconciliation_logs (quiz_id, student_user_id, reconciled_at DESC);

-- 2. Reconcile any existing duplicate active (status = 'in_progress') attempts deterministically
DO $$
DECLARE
    grp RECORD;
    canon RECORD;
    dup RECORD;
    canon_answers JSONB;
    dup_answers JSONB;
    canon_states JSONB;
    dup_states JSONB;
    k TEXT;
    v JSONB;
    merged_cnt INT;
    remaining_dups INT;
BEGIN
    FOR grp IN
        SELECT quiz_id, student_user_id
        FROM quiz_attempts
        WHERE status = 'in_progress'
        GROUP BY quiz_id, student_user_id
        HAVING COUNT(*) > 1
    LOOP
        -- Pick canonical active attempt: recovered first, then most answers, then latest heartbeat/activity
        SELECT *
        INTO canon
        FROM quiz_attempts
        WHERE quiz_id = grp.quiz_id
          AND student_user_id = grp.student_user_id
          AND status = 'in_progress'
        ORDER BY
            COALESCE(is_recovered, FALSE) DESC,
            CASE WHEN jsonb_typeof(answers) = 'object' THEN (SELECT COUNT(*) FROM jsonb_object_keys(answers)) ELSE 0 END DESC,
            COALESCE(last_heartbeat_at, created_at) DESC,
            created_at DESC,
            id DESC
        LIMIT 1;

        canon_answers := CASE WHEN jsonb_typeof(canon.answers) = 'object' THEN canon.answers ELSE '{}'::jsonb END;
        canon_states := CASE WHEN jsonb_typeof(canon.question_states) = 'object' THEN canon.question_states ELSE '{}'::jsonb END;

        FOR dup IN
            SELECT *
            FROM quiz_attempts
            WHERE quiz_id = grp.quiz_id
              AND student_user_id = grp.student_user_id
              AND status = 'in_progress'
              AND id <> canon.id
            ORDER BY created_at DESC, id DESC
        LOOP
            merged_cnt := 0;
            dup_answers := CASE WHEN jsonb_typeof(dup.answers) = 'object' THEN dup.answers ELSE '{}'::jsonb END;
            dup_states := CASE WHEN jsonb_typeof(dup.question_states) = 'object' THEN dup.question_states ELSE '{}'::jsonb END;

            -- Merge only non-conflicting answers from duplicate into canonical (never overwrite canonical's answers)
            FOR k, v IN SELECT * FROM jsonb_each(dup_answers)
            LOOP
                IF NOT (canon_answers ? k) OR canon_answers->k IS NULL OR canon_answers->>k = '' THEN
                    canon_answers := jsonb_set(canon_answers, ARRAY[k], v, true);
                    merged_cnt := merged_cnt + 1;
                END IF;
            END LOOP;

            -- Merge non-conflicting question_states
            FOR k, v IN SELECT * FROM jsonb_each(dup_states)
            LOOP
                IF NOT (canon_states ? k) THEN
                    canon_states := jsonb_set(canon_states, ARRAY[k], v, true);
                END IF;
            END LOOP;

            -- Update canonical attempt with merged answers/states
            UPDATE quiz_attempts
            SET answers = canon_answers,
                question_states = canon_states
            WHERE id = canon.id;

            -- Mark duplicate as superseded (never deleted, never falsely marked completed/submitted)
            UPDATE quiz_attempts
            SET status = 'superseded',
                candidate_status = 'SUPERSEDED_DUPLICATE',
                submission_reason = 'RECONCILED_DUPLICATE_ACTIVE'
            WHERE id = dup.id;

            -- Record immutable audit log entry
            INSERT INTO quiz_attempt_reconciliation_logs (
                quiz_id, student_user_id, canonical_attempt_id, reconciled_attempt_id,
                previous_status, previous_candidate_status, new_status, new_candidate_status,
                merged_answers_count, reason, snapshot_before
            ) VALUES (
                grp.quiz_id, grp.student_user_id, canon.id, dup.id,
                dup.status, dup.candidate_status, 'superseded', 'SUPERSEDED_DUPLICATE',
                merged_cnt,
                'Reconciled duplicate in_progress attempt prior to unique index creation',
                to_jsonb(dup)
            );
        END LOOP;
    END LOOP;

    -- Verify zero duplicate active groups remain
    SELECT COUNT(*) INTO remaining_dups
    FROM (
        SELECT 1
        FROM quiz_attempts
        WHERE status = 'in_progress'
        GROUP BY quiz_id, student_user_id
        HAVING COUNT(*) > 1
    ) t;

    IF remaining_dups > 0 THEN
        RAISE EXCEPTION 'Duplicate active quiz_attempts remain after reconciliation: %', remaining_dups;
    END IF;
END $$;

-- 3. Repair legacy candidate_status rows where status was updated without candidate_status
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

-- 4. Prevent concurrent duplicate active (in_progress) attempts for the same student + quiz
CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_attempts_active_per_student
ON quiz_attempts (quiz_id, student_user_id)
WHERE status = 'in_progress';

-- 5. Composite index for fast authoritative attempt selection and monitor pagination
CREATE INDEX IF NOT EXISTS ix_quiz_attempts_quiz_student_created
ON quiz_attempts (quiz_id, student_user_id, created_at DESC);

-- 6. Index for offline package & sync operation lookups per assessment
CREATE INDEX IF NOT EXISTS ix_offline_packages_resource_user
ON offline_packages (resource_id, package_type, user_id);

CREATE INDEX IF NOT EXISTS ix_sync_operations_user_resource
ON sync_operations (user_id, resource_id, status);
