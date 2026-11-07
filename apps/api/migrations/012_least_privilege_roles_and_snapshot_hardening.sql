-- Migration 012: Least-Privilege Role Separation and Historical Snapshot Hardening
-- Description:
-- 1. Installs statement-level TRUNCATE protection trigger on historical_learning_snapshots.
-- 2. Installs unconditional row-level UPDATE/DELETE immutability trigger on historical_learning_snapshots.
-- 3. Provision least-privilege runtime application role (cnc_lms_app) if not already present.
-- 4. Enforces strict privilege boundaries: grants runtime DML on operational tables,
--    while restricting historical_learning_snapshots to SELECT and INSERT only.
-- 5. Revokes TRUNCATE, UPDATE, DELETE, and TRIGGER manipulation privileges from the runtime role.

-- 1. Unconditional row-level UPDATE and DELETE immutability trigger
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

-- 2. Unconditional statement-level TRUNCATE protection trigger
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

-- 3. Conditionally provision runtime application role (cnc_lms_app)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cnc_lms_app') THEN
        CREATE ROLE cnc_lms_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
    END IF;
END $$;

-- 4. Grant schema usage and sequence permissions to runtime role
GRANT USAGE ON SCHEMA public TO cnc_lms_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cnc_lms_app;

-- 5. Grant operational DML privileges on all existing tables to runtime role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cnc_lms_app;

-- 6. Strictly constrain historical_learning_snapshots privileges for runtime role
REVOKE ALL PRIVILEGES ON historical_learning_snapshots FROM cnc_lms_app;
GRANT SELECT, INSERT ON historical_learning_snapshots TO cnc_lms_app;

-- 7. Strictly constrain schema_migrations privileges for runtime role (read-only)
REVOKE ALL PRIVILEGES ON schema_migrations FROM cnc_lms_app;
GRANT SELECT ON schema_migrations TO cnc_lms_app;

-- 8. Configure default privileges for future objects created by schema owner
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cnc_lms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO cnc_lms_app;
