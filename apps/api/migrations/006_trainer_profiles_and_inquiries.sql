-- ============================================================================
-- Migration 006: Trainer Profiles Enhancement & Inquiries System (P0)
-- 
-- Adds comprehensive professional profile fields, public slugs, publishing flags,
-- and public inquiry tracking for Winners Creek LMS trainers.
-- ============================================================================

-- 1. ENHANCE TRAINER_PROFILES TABLE
ALTER TABLE trainer_profiles
    ADD COLUMN IF NOT EXISTS display_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS profile_photo_url TEXT,
    ADD COLUMN IF NOT EXISTS headline VARCHAR(255),
    ADD COLUMN IF NOT EXISTS designation VARCHAR(150) DEFAULT 'Senior Corporate Trainer',
    ADD COLUMN IF NOT EXISTS location VARCHAR(150) DEFAULT 'New Delhi, India',
    ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS bio TEXT,
    ADD COLUMN IF NOT EXISTS years_experience NUMERIC(4,1) DEFAULT 5.0,
    ADD COLUMN IF NOT EXISTS current_org VARCHAR(200) DEFAULT 'Winners Creek LMS',
    ADD COLUMN IF NOT EXISTS previous_orgs TEXT[] DEFAULT ARRAY['Campus to Corporate Learning', 'National Skills Academy'],
    ADD COLUMN IF NOT EXISTS expertise_tags TEXT[] DEFAULT ARRAY['Corporate Etiquette', 'Public Speaking', 'Executive Presence'],
    ADD COLUMN IF NOT EXISTS methodology TEXT DEFAULT 'Interactive experiential workshops combining peer critiques, AI-driven speech diagnostics, and behavioral role-plays.',
    ADD COLUMN IF NOT EXISTS languages TEXT[] DEFAULT ARRAY['English', 'Hindi'],
    ADD COLUMN IF NOT EXISTS education JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS certifications JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{"linkedin": "https://linkedin.com", "website": "https://winnerscreek.com"}'::jsonb,
    ADD COLUMN IF NOT EXISTS teaching_info JSONB DEFAULT '{"courses": ["Executive Communication", "Campus to Corporate Readiness"], "targetAudience": "Undergraduates & Early Career Professionals"}'::jsonb,
    ADD COLUMN IF NOT EXISTS public_slug VARCHAR(120),
    ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS completion_percent INT DEFAULT 85;

-- Ensure unique slug constraint if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'trainer_profiles_public_slug_key'
    ) THEN
        ALTER TABLE trainer_profiles ADD CONSTRAINT trainer_profiles_public_slug_key UNIQUE (public_slug);
    END IF;
END $$;

-- 2. CREATE TRAINER_INQUIRIES TABLE
CREATE TABLE IF NOT EXISTS trainer_inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id UUID NOT NULL REFERENCES trainer_profiles(id) ON DELETE CASCADE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    organization VARCHAR(255),
    session_type VARCHAR(100) DEFAULT 'Corporate Training',
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_trainer_inquiries_trainer_id ON trainer_inquiries(trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainer_profiles_public_slug ON trainer_profiles(public_slug);
CREATE INDEX IF NOT EXISTS idx_trainer_profiles_published ON trainer_profiles(is_published, is_approved);

-- 3. POPULATE INITIAL SHOWCASE DATA FOR EXISTING TRAINERS
UPDATE trainer_profiles tp
SET 
    display_name = COALESCE(tp.display_name, u.name),
    public_slug = LOWER(REGEXP_REPLACE(u.name, '[^a-zA-Z0-9]+', '-', 'g')),
    headline = COALESCE(tp.headline, 'Lead Communication Coach & Executive Presence Mentor'),
    designation = COALESCE(tp.designation, 'Principal Corporate Trainer'),
    location = 'New Delhi & Bengaluru, India',
    years_experience = 8.5,
    current_org = 'Winners Creek Academy',
    bio = COALESCE(tp.bio, 'Passionate corporate educator with over eight years of experience bridging academic foundations with enterprise demands. Certified in behavioral coaching, high-impact storytelling, and executive readiness. Has mentored over 12,000 university students and early-career hires across Fortune 500 onboarding tracks.'),
    expertise_tags = ARRAY['Executive Articulation', 'Group Discussions & Debates', 'Campus Interview Mastery', 'Emotional Intelligence'],
    education = '[{"degree": "Master of Business Administration (HR & Org Behaviour)", "institution": "Faculty of Management Studies", "year": "2015"}, {"degree": "B.A. (Hons) English Literature", "institution": "Delhi University", "year": "2013"}]'::jsonb,
    certifications = '[{"name": "Certified Professional Trainer (CPT)", "issuer": "International Association of Facilitators", "year": "2018", "url": "https://iaf-world.org"}, {"name": "Master NLP Practitioner & Coach", "issuer": "ABNLP", "year": "2020", "url": "https://abnlp.com"}]'::jsonb,
    social_links = jsonb_build_object(
        'linkedin', 'https://linkedin.com/in/' || LOWER(REGEXP_REPLACE(u.name, '[^a-zA-Z0-9]+', '', 'g')),
        'portfolio', 'https://winnerscreek.com/trainers/' || LOWER(REGEXP_REPLACE(u.name, '[^a-zA-Z0-9]+', '-', 'g')),
        'github', 'https://github.com'
    ),
    teaching_info = '{"courses": ["Foundations of Workplace Communication", "Campus Placement Accelerator", "Executive Presentation Skills"], "targetAudience": "Final Year Students & Emerging Leaders", "achievements": ["Trained 12,000+ candidates", "94% Placement Conversion Rate", "Featured Keynote at EdTech Summit 2024"]}'::jsonb,
    is_published = true,
    is_approved = true,
    completion_percent = 92
FROM users u
WHERE tp.user_id = u.id AND (tp.public_slug IS NULL OR tp.display_name IS NULL);

