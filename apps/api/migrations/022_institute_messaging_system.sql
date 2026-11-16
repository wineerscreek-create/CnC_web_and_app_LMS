-- Migration 022: Complete Institute-Based Messaging System
-- Creates entities for institute batch groups, automatic synchronization,
-- role-based permissions, personal direct messaging, user blocking, and auditing.

CREATE TABLE IF NOT EXISTS messaging_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    batch_id UUID NULL REFERENCES batches(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    normalized_key VARCHAR(255) NOT NULL,
    passout_year VARCHAR(20) NULL,
    branch VARCHAR(50) NULL,
    section VARCHAR(50) NULL,
    department_id UUID NULL REFERENCES departments(id) ON DELETE SET NULL,
    description TEXT NULL,
    avatar_url TEXT NULL,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_messaging_groups_inst_key UNIQUE (institution_id, normalized_key)
);

CREATE TABLE IF NOT EXISTS messaging_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES messaging_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_muted BOOLEAN NOT NULL DEFAULT FALSE,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_message_id UUID NULL,
    unread_count INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_messaging_group_members UNIQUE (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS messaging_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NULL REFERENCES institutions(id) ON DELETE SET NULL,
    user1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_text TEXT NULL,
    user1_unread_count INT NOT NULL DEFAULT 0,
    user2_unread_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_messaging_conversations_pair UNIQUE (user1_id, user2_id),
    CONSTRAINT chk_messaging_conversations_order CHECK (user1_id < user2_id)
);

CREATE TABLE IF NOT EXISTS messaging_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NULL REFERENCES messaging_groups(id) ON DELETE CASCADE,
    conversation_id UUID NULL REFERENCES messaging_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_role VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    message_type VARCHAR(50) NOT NULL DEFAULT 'text',
    reply_to_id UUID NULL REFERENCES messaging_messages(id) ON DELETE SET NULL,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    pinned_at TIMESTAMPTZ NULL,
    pinned_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    is_edited BOOLEAN NOT NULL DEFAULT FALSE,
    edited_at TIMESTAMPTZ NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ NULL,
    deleted_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_message_target CHECK (
        (group_id IS NOT NULL AND conversation_id IS NULL) OR
        (group_id IS NULL AND conversation_id IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS messaging_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messaging_messages(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_type VARCHAR(100) NOT NULL DEFAULT 'other',
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messaging_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_messaging_blocks UNIQUE (blocker_id, blocked_id),
    CONSTRAINT chk_not_self_block CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS messaging_read_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messaging_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_messaging_read_receipts UNIQUE (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS messaging_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    institution_id UUID NULL REFERENCES institutions(id) ON DELETE SET NULL,
    group_id UUID NULL REFERENCES messaging_groups(id) ON DELETE SET NULL,
    conversation_id UUID NULL REFERENCES messaging_conversations(id) ON DELETE SET NULL,
    user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    performed_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_messaging_groups_inst ON messaging_groups(institution_id);
CREATE INDEX IF NOT EXISTS idx_messaging_groups_batch ON messaging_groups(batch_id);
CREATE INDEX IF NOT EXISTS idx_messaging_group_members_user ON messaging_group_members(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_messaging_group_members_group ON messaging_group_members(group_id, is_active);
CREATE INDEX IF NOT EXISTS idx_messaging_conv_user1 ON messaging_conversations(user1_id);
CREATE INDEX IF NOT EXISTS idx_messaging_conv_user2 ON messaging_conversations(user2_id);
CREATE INDEX IF NOT EXISTS idx_messaging_messages_group_created ON messaging_messages(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messaging_messages_conv_created ON messaging_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messaging_blocks_lookup ON messaging_blocks(blocker_id, blocked_id);
