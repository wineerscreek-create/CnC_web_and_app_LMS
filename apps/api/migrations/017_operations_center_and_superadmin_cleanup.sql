-- Migration 017: Operations Center Isolated Schema and Super Admin Status Hardening
-- Purpose: Provision isolated tables for security operations center and support DISABLED record status.

-- 1. Extend record_status_enum with DISABLED for secure deactivation
ALTER TYPE record_status_enum ADD VALUE IF NOT EXISTS 'DISABLED';

-- 2. Isolated Operations Center Operator Directory (completely separate from LMS users)
CREATE TABLE IF NOT EXISTS operations_center_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    mfa_secret VARCHAR(64) NOT NULL,
    mfa_enabled BOOLEAN NOT NULL DEFAULT true,
    mfa_backup_codes TEXT[] NOT NULL DEFAULT '{}',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    failed_login_attempts INT NOT NULL DEFAULT 0,
    lockout_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    last_login_ip VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Operations Center Sessions with rotation and revocation
CREATE TABLE IF NOT EXISTS operations_center_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES operations_center_admins(id) ON DELETE CASCADE,
    session_token_hash VARCHAR(255) UNIQUE NOT NULL,
    ip_address VARCHAR(64),
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_sessions_token ON operations_center_sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_ops_sessions_admin ON operations_center_sessions(admin_id);

-- 4. Operations Center Incident Tracker
CREATE TABLE IF NOT EXISTS operations_center_incidents (
    id VARCHAR(64) PRIMARY KEY,
    severity VARCHAR(32) NOT NULL DEFAULT 'INFO',
    service VARCHAR(64) NOT NULL DEFAULT 'PLATFORM',
    title VARCHAR(255) NOT NULL,
    description TEXT,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    assigned_to VARCHAR(64),
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Emergency Global Control Switches
CREATE TABLE IF NOT EXISTS operations_center_emergency_state (
    id INT PRIMARY KEY DEFAULT 1,
    maintenance_mode BOOLEAN NOT NULL DEFAULT false,
    db_read_only_mode BOOLEAN NOT NULL DEFAULT false,
    api_write_lockdown BOOLEAN NOT NULL DEFAULT false,
    disable_new_logins BOOLEAN NOT NULL DEFAULT false,
    disable_ai_services BOOLEAN NOT NULL DEFAULT false,
    active_incident_id VARCHAR(64),
    lockdown_reason TEXT,
    locked_by_admin VARCHAR(64),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO operations_center_emergency_state (id, maintenance_mode, db_read_only_mode, api_write_lockdown, disable_new_logins, disable_ai_services)
VALUES (1, false, false, false, false, false)
ON CONFLICT (id) DO NOTHING;

-- 6. Operations Center Immutable Audit Trail
CREATE TABLE IF NOT EXISTS operations_center_audit_trail (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_username VARCHAR(64) NOT NULL,
    action VARCHAR(128) NOT NULL,
    target VARCHAR(128),
    ip_address VARCHAR(64),
    reason TEXT,
    previous_state JSONB,
    new_state JSONB,
    result VARCHAR(32) NOT NULL DEFAULT 'SUCCESS',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_audit_created_at ON operations_center_audit_trail(created_at DESC);

-- 7. High-Volume Security Telemetry Buffer
CREATE TABLE IF NOT EXISTS operations_center_security_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(64) NOT NULL,
    severity VARCHAR(32) NOT NULL DEFAULT 'INFO',
    classification VARCHAR(64),
    source_ip VARCHAR(64),
    user_id UUID,
    email VARCHAR(255),
    endpoint VARCHAR(255),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_telemetry_created_at ON operations_center_security_telemetry(created_at DESC);
