-- Migration 020: Universal User Avatar and Profile Image
-- Adds avatar_url to the core users table so all roles (STUDENT, TRAINER, ADMIN, HOD, SUPER_ADMIN) have a unified profile image.

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Backfill from student_profiles and trainer_profiles if any exist
UPDATE users u
SET avatar_url = sp.avatar_url
FROM student_profiles sp
WHERE sp.user_id = u.id AND sp.avatar_url IS NOT NULL AND u.avatar_url IS NULL;

UPDATE users u
SET avatar_url = tp.profile_photo_url
FROM trainer_profiles tp
WHERE tp.user_id = u.id AND tp.profile_photo_url IS NOT NULL AND u.avatar_url IS NULL;
