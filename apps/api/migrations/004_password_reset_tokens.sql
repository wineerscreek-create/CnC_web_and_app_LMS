-- Migration 004: Password Reset Tokens
-- Adds columns to store cryptographically secure, SHA-256 hashed password reset tokens
-- with expiration timestamps for email-based password recovery.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reset_password_token_hash VARCHAR(255),
    ADD COLUMN IF NOT EXISTS reset_password_token_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_reset_password_token_hash
    ON users (reset_password_token_hash)
    WHERE reset_password_token_hash IS NOT NULL;
