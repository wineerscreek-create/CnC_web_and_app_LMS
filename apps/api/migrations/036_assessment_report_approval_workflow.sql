-- Migration 036: Assessment Report Approval Workflow (PENDING, APPROVED, REJECTED)
-- Safe, non-destructive migration: preserves all existing assessment_reports rows and scores.

ALTER TABLE assessment_reports
    ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS review_notes TEXT,
    ADD COLUMN IF NOT EXISTS approval_history JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_assessment_reports_approval_status'
    ) THEN
        ALTER TABLE assessment_reports
            ADD CONSTRAINT chk_assessment_reports_approval_status
            CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assessment_reports_approval_status
    ON assessment_reports (quiz_id, approval_status, created_at DESC);
