-- ============================================================================
-- Migration 019: Offline-First Synchronization & Package Authorization
-- ============================================================================

-- Table 1: Offline Authorized Packages (Time-bound curriculum and material bundles)
CREATE TABLE IF NOT EXISTS offline_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    package_type VARCHAR(50) NOT NULL, -- 'COURSE_BUNDLE', 'ASSESSMENT_PACK', 'GAME_PACK', 'EBOOK_PACK'
    resource_id UUID NOT NULL,
    server_revision BIGINT NOT NULL DEFAULT 1,
    manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    authorized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offline_packages_user_status ON offline_packages(user_id, status);
CREATE INDEX IF NOT EXISTS idx_offline_packages_expires ON offline_packages(expires_at);

-- Table 2: Synchronized Outbox Operations (Durable idempotency journal)
CREATE TABLE IF NOT EXISTS sync_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
    resource_type VARCHAR(50) NOT NULL, -- 'COURSE_PROGRESS', 'LESSON_COMPLETION', 'ASSESSMENT_SUBMISSION', 'GAME_ATTEMPT'
    resource_id UUID NOT NULL,
    operation_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    client_timestamp TIMESTAMPTZ NOT NULL,
    server_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'PROCESSED', -- 'PROCESSED', 'FAILED', 'CONFLICT', 'EXPIRED'
    result JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    CONSTRAINT uq_sync_operations_user_op UNIQUE (user_id, operation_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_ops_user_time ON sync_operations(user_id, server_received_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_ops_resource ON sync_operations(resource_type, resource_id);

-- Table 3: Sync Conflicts Log
CREATE TABLE IF NOT EXISTS sync_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID NOT NULL,
    client_payload JSONB NOT NULL,
    server_state JSONB NOT NULL,
    reason VARCHAR(255) NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolution_action VARCHAR(50),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_user ON sync_conflicts(user_id, resolved);
