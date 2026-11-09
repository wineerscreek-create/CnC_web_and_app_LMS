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
    totp_secret VARCHAR(64) NOT NULL,
    backup_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
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
    is_revoked BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_sessions_token ON operations_center_sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_ops_sessions_admin ON operations_center_sessions(admin_id);

-- 4. Operations Center Incident Tracker
CREATE TABLE IF NOT EXISTS operations_center_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    severity VARCHAR(32) NOT NULL DEFAULT 'INFO',
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    description TEXT,
    created_by VARCHAR(64) NOT NULL DEFAULT 'SYSTEM',
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Emergency Global Control Switches
CREATE TABLE IF NOT EXISTS operations_center_emergency_state (
    id VARCHAR(32) PRIMARY KEY DEFAULT 'global',
    maintenance_mode BOOLEAN NOT NULL DEFAULT false,
    payments_frozen BOOLEAN NOT NULL DEFAULT false,
    registrations_frozen BOOLEAN NOT NULL DEFAULT false,
    ai_features_disabled BOOLEAN NOT NULL DEFAULT false,
    last_updated_by VARCHAR(64),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO operations_center_emergency_state (id, maintenance_mode, payments_frozen, registrations_frozen, ai_features_disabled, last_updated_by)
VALUES ('global', false, false, false, false, 'SYSTEM_INIT')
ON CONFLICT (id) DO NOTHING;

-- 6. Operations Center Immutable Audit Trail
CREATE TABLE IF NOT EXISTS operations_center_audit_trail (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_username VARCHAR(64) NOT NULL,
    action VARCHAR(128) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_audit_created_at ON operations_center_audit_trail(created_at DESC);

-- 7. High-Volume Security Telemetry Buffer
CREATE TABLE IF NOT EXISTS operations_center_security_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(64) NOT NULL,
    severity VARCHAR(32) NOT NULL DEFAULT 'INFO',
    source_ip VARCHAR(64),
    endpoint VARCHAR(255),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_telemetry_created_at ON operations_center_security_telemetry(created_at DESC);
