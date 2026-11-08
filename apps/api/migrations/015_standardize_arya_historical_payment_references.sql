-- Migration 015: Standardize Arya Historical Payment References
-- Adds legacy_reference field to payments, indexes it, alters verification_source width,
-- and standardizes Arya College historical verified payment records to
-- {STUDENT_NAME}_{ROLL_NUMBER}_SEM{SEMESTER}_ARYA with verification_source = 'INSTITUTIONAL_LEGACY_CONFIRMATION'.

ALTER TABLE payments ADD COLUMN IF NOT EXISTS legacy_reference VARCHAR(128);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_legacy_reference ON payments (legacy_reference) WHERE legacy_reference IS NOT NULL;

-- Ensure verification_source column has sufficient capacity for INSTITUTIONAL_LEGACY_CONFIRMATION (35 chars)
ALTER TABLE payments ALTER COLUMN verification_source TYPE VARCHAR(64);

-- Standardize existing Arya historical payments
UPDATE payments p
SET legacy_reference = UPPER(REGEXP_REPLACE(TRIM(u.name), '[^a-zA-Z0-9]+', '_', 'g')) || '_' || 
                       UPPER(COALESCE(NULLIF(TRIM(sp.roll_number), ''), REPLACE(REPLACE(p.utr, 'TXN_ARYA_', ''), 'HIST_ARYA_', ''))) || '_SEM' || 
                       COALESCE(p.semester, sp.current_semester, 7)::text || '_ARYA',
    verification_source = 'INSTITUTIONAL_LEGACY_CONFIRMATION'
FROM users u
LEFT JOIN student_profiles sp ON sp.user_id = u.id
WHERE p.participant_user_id = u.id
  AND (p.utr LIKE 'TXN_ARYA_%' OR p.utr LIKE 'HIST_ARYA_%')
  AND (p.legacy_reference IS NULL OR p.verification_source != 'INSTITUTIONAL_LEGACY_CONFIRMATION');

INSERT INTO schema_migrations (version)
VALUES ('015_standardize_arya_historical_payment_references.sql')
ON CONFLICT DO NOTHING;
