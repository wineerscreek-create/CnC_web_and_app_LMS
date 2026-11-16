-- Migration 023: Trainer Profile Enhancements
-- Adds fields for joining year, resume, teaching photo, and Super Admin testimonial approval.

ALTER TABLE trainer_profiles
  ADD COLUMN IF NOT EXISTS joining_year INTEGER,
  ADD COLUMN IF NOT EXISTS resume_url TEXT,
  ADD COLUMN IF NOT EXISTS teaching_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS is_testimonial_approved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS testimonial_quote TEXT,
  ADD COLUMN IF NOT EXISTS testimonial_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS testimonial_approved_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_trainer_profiles_testimonial 
  ON trainer_profiles (is_testimonial_approved) 
  WHERE is_testimonial_approved = TRUE;
