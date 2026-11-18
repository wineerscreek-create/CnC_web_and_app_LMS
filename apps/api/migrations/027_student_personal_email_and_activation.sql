-- Migration 027: Student Personal Email and First-Login Activation
-- Adds personal email and verification tracking to users table

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS personal_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS personal_email_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS personal_email_verified_at TIMESTAMPTZ;

-- Unique constraint on verified personal email (ignoring soft-deleted users)
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_verified_personal_email 
    ON users (LOWER(personal_email)) 
    WHERE personal_email_verified = TRUE AND deleted_at IS NULL;

-- Fast lookup index for login / activation checks
CREATE INDEX IF NOT EXISTS idx_users_personal_email_lookup 
    ON users (LOWER(personal_email)) 
    WHERE deleted_at IS NULL;
