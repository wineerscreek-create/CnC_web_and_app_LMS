-- Migration 016: Standardize Arya Semester Payments and Invoices
-- Adds original_utr field to payments to preserve original banking UTRs,
-- enforces standardized UTR format {STUDENT_NAME}_{ROLL_NUMBER}_SEM{SEMESTER}_ARYA for Arya historical verified payments,
-- and provisions matching GST tax invoices for historical semester payments.

-- 1. Ensure original_utr column exists on payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS original_utr VARCHAR(128);

-- 2. Preserve original banking UTRs before standardization
UPDATE payments
SET original_utr = utr
WHERE (legacy_reference IS NOT NULL OR utr LIKE 'TXN_ARYA_%')
  AND original_utr IS NULL;

-- 3. Standardize existing Arya historical verified payments to Semester 3
UPDATE payments p
SET semester = 3,
    utr = UPPER(REGEXP_REPLACE(TRIM(u.name), '[^a-zA-Z0-9]+', '_', 'g')) || '_' || 
          UPPER(COALESCE(NULLIF(TRIM(sp.roll_number), ''), REPLACE(REPLACE(p.utr, 'TXN_ARYA_', ''), '_SEM7_ARYA', ''))) || '_SEM3_ARYA',
    legacy_reference = UPPER(REGEXP_REPLACE(TRIM(u.name), '[^a-zA-Z0-9]+', '_', 'g')) || '_' || 
                       UPPER(COALESCE(NULLIF(TRIM(sp.roll_number), ''), REPLACE(REPLACE(p.utr, 'TXN_ARYA_', ''), '_SEM7_ARYA', ''))) || '_SEM3_ARYA',
    verification_source = 'INSTITUTIONAL_LEGACY_CONFIRMATION',
    notes = 'Historical 3rd Semester Institutional Fee Confirmation'
FROM users u
JOIN student_profiles sp ON sp.user_id = u.id
WHERE p.participant_user_id = u.id
  AND sp.current_semester = 7
  AND (p.legacy_reference IS NOT NULL OR p.utr LIKE 'TXN_ARYA_%' OR p.utr LIKE '%_ARYA');

-- 4. Update matching historical invoices for Semester 3
UPDATE invoices inv
SET semester_number = 3,
    academic_year = '2024-2025'
FROM payments p
WHERE inv.id = p.invoice_id AND p.semester = 3;

-- 5. Record migration
INSERT INTO schema_migrations (version)
VALUES ('016_standardize_arya_semester_payments_and_invoices.sql')
ON CONFLICT DO NOTHING;
