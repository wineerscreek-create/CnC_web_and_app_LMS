-- Migration 039: Durable Media Assets Table & Storage Key References for Banners & Avatars
-- Rollback:
--   ALTER TABLE user_banners DROP COLUMN IF EXISTS media_asset_id, DROP COLUMN IF EXISTS storage_key;
--   ALTER TABLE users DROP COLUMN IF EXISTS avatar_asset_id, DROP COLUMN IF EXISTS avatar_storage_key;
--   DROP TABLE IF EXISTS media_assets;

CREATE TABLE IF NOT EXISTS media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_id UUID,
    image_type VARCHAR(32) NOT NULL, -- 'BANNER' or 'AVATAR'
    storage_driver VARCHAR(32) NOT NULL DEFAULT 'postgres',
    storage_key TEXT NOT NULL,
    mime_type VARCHAR(64) NOT NULL,
    file_size INT NOT NULL,
    sha256 VARCHAR(64) NOT NULL,
    image_bytes BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_media_assets_owner_type
    ON media_assets (owner_id, image_type, created_at DESC);

ALTER TABLE user_banners
    ADD COLUMN IF NOT EXISTS storage_key TEXT,
    ADD COLUMN IF NOT EXISTS media_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS avatar_storage_key TEXT,
    ADD COLUMN IF NOT EXISTS avatar_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL;
