-- Migration 018: Security Operations, Incident Lifecycle & Cryptographic Audit Trail
-- Extends Operations Center schema to support 7-stage incident response,
-- suspicious IP / threat intelligence tracking, and tamper-evident audit hash chaining.

-- 1. Upgrade Incident Response Table to full 7-stage lifecycle schema
ALTER TABLE operations_center_incidents 
    ADD COLUMN IF NOT EXISTS source_ip VARCHAR(64),
    ADD COLUMN IF NOT EXISTS affected_user_id UUID,
    ADD COLUMN IF NOT EXISTS affected_user_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS related_events JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS detection_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS investigation_notes TEXT,
    ADD COLUMN IF NOT EXISTS containment_actions TEXT,
    ADD COLUMN IF NOT EXISTS resolution_details TEXT,
    ADD COLUMN IF NOT EXISTS audit_references JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ops_incidents_status ON operations_center_incidents(status);
CREATE INDEX IF NOT EXISTS idx_ops_incidents_detection ON operations_center_incidents(detection_timestamp DESC);

-- 2. Upgrade Audit Trail to Cryptographic Hash Chaining
ALTER TABLE operations_center_audit_trail 
    ADD COLUMN IF NOT EXISTS request_correlation_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(64) DEFAULT 'GENESIS',
    ADD COLUMN IF NOT EXISTS record_hash VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_ops_audit_hash ON operations_center_audit_trail(record_hash);

-- 3. Provision Threat Intelligence & Suspicious IP Monitoring Table
CREATE TABLE IF NOT EXISTS operations_center_threat_intel (
    ip_address VARCHAR(64) PRIMARY KEY,
    threat_score INT NOT NULL DEFAULT 0,
    failed_attempts INT NOT NULL DEFAULT 0,
    token_reuse_count INT NOT NULL DEFAULT 0,
    reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'MONITORED', -- 'MONITORED', 'FLAGGED', 'BLOCKED'
    first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_threat_score ON operations_center_threat_intel(threat_score DESC);
CREATE INDEX IF NOT EXISTS idx_ops_threat_status ON operations_center_threat_intel(status);
