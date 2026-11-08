"""Arya College Semester-Based Historical Payment Migration Script.

Migrates the 1,087 Arya College students according to the configured cycle:
- Configured Fee: ₹5,850 (inclusive of 6.36% GST -> ₹5,500.19 taxable + ₹349.81 GST).
- Batch 2023-2027 (462 students, 7th sem):
    - Sem 3: Paid (₹5,850) -> Paid payment & Tax Invoice.
    - Sem 4: Included -> enrollment_periods (INCLUDED_PERIOD). No fake invoice.
    - Sem 5: Included -> enrollment_periods (INCLUDED_PERIOD). No fake invoice.
    - Sem 6: Paid (₹5,850) -> Paid payment & Tax Invoice (preserves existing 325 real UTRs).
    - Sem 7: Included -> enrollment_periods (INCLUDED_PERIOD). No fake invoice.
    - Sem 8: Included -> enrollment_periods (INCLUDED_PERIOD). No fake invoice.
- Batch 2025-2029 (625 students, 3rd sem):
    - Sem 3: Paid (₹5,850) -> Paid payment & Tax Invoice.
    - Sem 4: Included -> enrollment_periods (INCLUDED_PERIOD). No fake invoice.
    - Sem 5: Included -> enrollment_periods (INCLUDED_PERIOD). No fake invoice.

Usage:
    python scratch/migrate_arya_historical_payments.py --preview
    python scratch/migrate_arya_historical_payments.py --execute
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

sys.path.insert(0, "apps/api")

from app.db.postgres import connect_to_postgres, get_pg_pool, close_postgres
from app.services.invoice_service import calculate_tax_breakdown

ARYA_INSTITUTION_ID = uuid.UUID("39a363c8-635a-4a0b-b9c0-d0c51529774f")
ARYA_COURSE_ID = uuid.UUID("5d92688c-44b8-41b7-b2f4-af87c482ae8f")
FEE_AMOUNT = Decimal("5850.00")
GST_RATE = Decimal("6.36")


async def run_migration(execute: bool = False) -> None:
    await connect_to_postgres()
    pool = await get_pg_pool()

    tax = calculate_tax_breakdown(FEE_AMOUNT, GST_RATE, inclusive=True)
    taxable = tax["taxable_amount"]
    gst = tax["gst_amount"]

    print("=" * 70)
    print("ARYA COLLEGE HISTORICAL PAYMENT MIGRATION")
    print(f"Mode: {'EXECUTE (COMMITTING TO DATABASE)' if execute else 'PREVIEW ONLY (DRY-RUN)'}")
    print(f"Semester Fee: ₹{FEE_AMOUNT:,.2f} (Inclusive of {GST_RATE}% GST)")
    print(f"  Taxable Amount: ₹{taxable:,.2f}")
    print(f"  GST Amount:     ₹{gst:,.2f}")
    print(f"  Sum Check:      ₹{taxable + gst:,.2f}")
    print("=" * 70)

    async with pool.acquire() as conn:
        # Fetch Arya College students enrolled in the Arya course
        students = await conn.fetch(
            """
            SELECT DISTINCT ON (u.id)
                   u.id, u.email, u.name, e.id as enrollment_id, e.course_id, e.current_semester,
                   sp.roll_number, sp.academic_year, sp.branch
            FROM users u
            JOIN enrollments e ON e.participant_user_id = u.id AND e.course_id = $2
            LEFT JOIN student_profiles sp ON sp.user_id = u.id
            WHERE u.institution_id = $1
            ORDER BY u.id, e.created_at ASC
            """,
            ARYA_INSTITUTION_ID,
            ARYA_COURSE_ID,
        )

        total_students = len(students)
        sem3_students = [s for s in students if s["current_semester"] == 3]
        sem7_students = [s for s in students if s["current_semester"] == 7]

        print(f"Total Arya Students Found: {total_students}")
        print(f"  3rd Semester Cohort (Batch 2025-29): {len(sem3_students)}")
        print(f"  7th Semester Cohort (Batch 2023-27): {len(sem7_students)}")

        # Fetch existing payments
        existing_payments = await conn.fetch(
            """
            SELECT p.id, p.participant_user_id, p.semester, p.amount, p.status,
                   p.transaction_ref, p.utr, p.created_at
            FROM payments p
            JOIN users u ON p.participant_user_id = u.id
            WHERE u.institution_id = $1
            """,
            ARYA_INSTITUTION_ID,
        )
        pay_by_user = {}
        for p in existing_payments:
            pay_by_user.setdefault(p["participant_user_id"], []).append(p)
        print(f"Existing Payment Records for Arya: {len(existing_payments)}")

        # Projection counters
        new_payments_count = 0
        updated_payments_count = 0
        new_invoices_count = 0
        included_periods_count = 0

        # Run within transaction if executing
        async with conn.transaction() if execute else nullcontext():
            invoice_seq = 1000

            # -------------------------------------------------------------
            # Cohort 1: 3rd Semester Students (Batch 2025-29)
            # -------------------------------------------------------------
            for s in sem3_students:
                u_id = s["id"]
                e_id = s["enrollment_id"]
                c_id = s["course_id"]
                uid_prefix = str(u_id)[:8].upper()

                # Sem 3: Paid Cycle
                existing_p = pay_by_user.get(u_id, [])
                real_utr = existing_p[0]["utr"] if existing_p and existing_p[0]["utr"] else f"HIST_ARYA_{uid_prefix}_SEM3"
                orig_date = existing_p[0]["created_at"] if existing_p else datetime(2026, 8, 10, 10, 0, tzinfo=timezone.utc)
                p_id = existing_p[0]["id"] if existing_p else uuid.uuid4()

                if execute:
                    if existing_p:
                        await conn.execute(
                            """
                            UPDATE payments
                            SET semester = 3,
                                amount = $2,
                                taxable_amount = $3,
                                gst_amount = $4,
                                gst_rate = $5,
                                status = 'VERIFIED',
                                utr = COALESCE(utr, transaction_ref, $6),
                                verified_by_role = 'COLLEGE_ADMIN',
                                verification_source = 'HISTORICAL_MIGRATION',
                                academic_year = '2026-2027',
                                institution_id = $7
                            WHERE id = $1
                            """,
                            p_id, FEE_AMOUNT, taxable, gst, GST_RATE, real_utr, ARYA_INSTITUTION_ID,
                        )
                        updated_payments_count += 1
                    else:
                        await conn.execute(
                            """
                            INSERT INTO payments (
                                id, enrollment_id, participant_user_id, course_id, semester,
                                amount, currency, transaction_ref, utr, payment_method, status,
                                verified_by_role, verification_source, academic_year, taxable_amount,
                                gst_amount, gst_rate, institution_id, created_at, verified_at
                            ) VALUES (
                                $1, $2, $3, $4, 3,
                                $5, 'INR', $6, $6, 'BANK_TRANSFER', 'VERIFIED',
                                'COLLEGE_ADMIN', 'HISTORICAL_MIGRATION', '2026-2027', $7,
                                $8, $9, $10, $11, $11
                            )
                            """,
                            p_id, e_id, u_id, c_id, FEE_AMOUNT, real_utr,
                            taxable, gst, GST_RATE, ARYA_INSTITUTION_ID, orig_date,
                        )
                        new_payments_count += 1

                    # Issue single tax invoice for Sem 3
                    invoice_seq += 1
                    inv_num = f"INV-2026-ARYA-{invoice_seq:05d}"
                    inv_id = uuid.uuid4()
                    await conn.execute(
                        """
                        INSERT INTO invoices (
                            id, invoice_number, payment_id, enrollment_id, participant_user_id,
                            institution_id, course_id, semester_number, academic_year,
                            taxable_amount, gst_rate, gst_amount, total_amount, status,
                            issued_at, generation_source, created_at, updated_at
                        ) VALUES (
                            $1, $2, $3, $4, $5,
                            $6, $7, 3, '2026-2027',
                            $8, $9, $10, $11, 'ISSUED',
                            $12, 'HISTORICAL_MIGRATION', NOW(), NOW()
                        )
                        ON CONFLICT (invoice_number) DO NOTHING
                        """,
                        inv_id, inv_num, p_id, e_id, u_id,
                        ARYA_INSTITUTION_ID, c_id,
                        taxable, GST_RATE, gst, FEE_AMOUNT, orig_date,
                    )
                    await conn.execute("UPDATE payments SET invoice_id = $1 WHERE id = $2", inv_id, p_id)
                    new_invoices_count += 1

                    # Upsert Sem 3 enrollment_period
                    await conn.execute(
                        """
                        INSERT INTO enrollment_periods (
                            id, enrollment_id, participant_user_id, course_id, semester,
                            start_date, end_date, access_status, payment_status,
                            period_status, migration_status, migrated_at, migration_source,
                            historical_payment_date_available, historical_verification_status,
                            historical_record_notes, activation_source, activated_at
                        ) VALUES (
                            gen_random_uuid(), $1, $2, $3, 3,
                            '2026-08-01', '2026-11-30', 'ACTIVE', 'VERIFIED',
                            'PAID', 'MIGRATED', NOW(), 'ARYA_HISTORICAL_COHORT_MIGRATION_V1',
                            TRUE, 'VERIFIED', 'Sem 3 Paid cycle fee mapped', 'PAYMENT_VERIFICATION', $4
                        )
                        ON CONFLICT (enrollment_id, semester) DO UPDATE SET
                            period_status = EXCLUDED.period_status,
                            access_status = EXCLUDED.access_status,
                            payment_status = EXCLUDED.payment_status,
                            migration_status = EXCLUDED.migration_status,
                            migrated_at = EXCLUDED.migrated_at,
                            migration_source = EXCLUDED.migration_source,
                            activation_source = EXCLUDED.activation_source,
                            historical_record_notes = EXCLUDED.historical_record_notes
                        """,
                        e_id, u_id, c_id, orig_date,
                    )

                    # Upsert Sem 4 and Sem 5 as INCLUDED_PERIOD (No invoice!)
                    for next_sem, start_d, end_d in [(4, date(2026, 12, 1), date(2027, 4, 30)), (5, date(2027, 8, 1), date(2027, 11, 30))]:
                        await conn.execute(
                            """
                            INSERT INTO enrollment_periods (
                                id, enrollment_id, participant_user_id, course_id, semester,
                                start_date, end_date, access_status, payment_status,
                                period_status, migration_status, migrated_at, migration_source,
                                historical_payment_date_available, historical_verification_status,
                                historical_record_notes, activation_source, activated_at
                            ) VALUES (
                                gen_random_uuid(), $1, $2, $3, $4,
                                $5, $6, 'ACTIVE', 'VERIFIED',
                                'INCLUDED_PERIOD', 'MIGRATED', NOW(), 'ARYA_HISTORICAL_COHORT_MIGRATION_V1',
                                FALSE, 'VERIFIED', 'Included in paid cycle', 'INCLUDED_HISTORICAL_CYCLE', NOW()
                            )
                            ON CONFLICT (enrollment_id, semester) DO UPDATE SET
                                period_status = EXCLUDED.period_status,
                                access_status = EXCLUDED.access_status,
                                payment_status = EXCLUDED.payment_status,
                                migration_status = EXCLUDED.migration_status,
                                migrated_at = EXCLUDED.migrated_at,
                                migration_source = EXCLUDED.migration_source,
                                activation_source = EXCLUDED.activation_source,
                                historical_record_notes = EXCLUDED.historical_record_notes
                            """,
                            e_id, u_id, c_id, next_sem, start_d, end_d,
                        )
                        included_periods_count += 1
                else:
                    if existing_p:
                        updated_payments_count += 1
                    else:
                        new_payments_count += 1
                    new_invoices_count += 1
                    included_periods_count += 2

            # -------------------------------------------------------------
            # Cohort 2: 7th Semester Students (Batch 2023-27)
            # -------------------------------------------------------------
            for s in sem7_students:
                u_id = s["id"]
                e_id = s["enrollment_id"]
                c_id = s["course_id"]
                uid_prefix = str(u_id)[:8].upper()

                existing_p = pay_by_user.get(u_id, [])

                # 1. Sem 3: Paid Cycle (Historical)
                p3_id = uuid.uuid4()
                p3_utr = f"HIST_ARYA_{uid_prefix}_SEM3"
                p3_date = datetime(2024, 8, 15, 10, 0, tzinfo=timezone.utc)

                # 2. Sem 6: Paid Cycle
                p6_id = existing_p[0]["id"] if existing_p else uuid.uuid4()
                p6_utr = existing_p[0]["utr"] if existing_p and existing_p[0]["utr"] else f"HIST_ARYA_{uid_prefix}_SEM6"
                p6_date = existing_p[0]["created_at"] if existing_p else datetime(2025, 12, 15, 10, 0, tzinfo=timezone.utc)

                if execute:
                    # Sem 3 payment record
                    await conn.execute(
                        """
                        INSERT INTO payments (
                            id, enrollment_id, participant_user_id, course_id, semester,
                            amount, currency, transaction_ref, utr, payment_method, status,
                            verified_by_role, verification_source, academic_year, taxable_amount,
                            gst_amount, gst_rate, institution_id, created_at, verified_at
                        ) VALUES (
                            $1, $2, $3, $4, 3,
                            $5, 'INR', $6, $6, 'BANK_TRANSFER', 'VERIFIED',
                            'COLLEGE_ADMIN', 'HISTORICAL_MIGRATION', '2024-2025', $7,
                            $8, $9, $10, $11, $11
                        )
                        """,
                        p3_id, e_id, u_id, c_id, FEE_AMOUNT, p3_utr,
                        taxable, gst, GST_RATE, ARYA_INSTITUTION_ID, p3_date,
                    )
                    new_payments_count += 1

                    invoice_seq += 1
                    inv3_num = f"INV-2024-ARYA-{invoice_seq:05d}"
                    inv3_id = uuid.uuid4()
                    await conn.execute(
                        """
                        INSERT INTO invoices (
                            id, invoice_number, payment_id, enrollment_id, participant_user_id,
                            institution_id, course_id, semester_number, academic_year,
                            taxable_amount, gst_rate, gst_amount, total_amount, status,
                            issued_at, generation_source, created_at, updated_at
                        ) VALUES (
                            $1, $2, $3, $4, $5,
                            $6, $7, 3, '2024-2025',
                            $8, $9, $10, $11, 'ISSUED',
                            $12, 'HISTORICAL_MIGRATION', NOW(), NOW()
                        )
                        ON CONFLICT (invoice_number) DO NOTHING
                        """,
                        inv3_id, inv3_num, p3_id, e_id, u_id,
                        ARYA_INSTITUTION_ID, c_id,
                        taxable, GST_RATE, gst, FEE_AMOUNT, p3_date,
                    )
                    await conn.execute("UPDATE payments SET invoice_id = $1 WHERE id = $2", inv3_id, p3_id)
                    new_invoices_count += 1

                    # Sem 3 period
                    await conn.execute(
                        """
                        INSERT INTO enrollment_periods (
                            id, enrollment_id, participant_user_id, course_id, semester,
                            start_date, end_date, access_status, payment_status,
                            period_status, migration_status, migrated_at, migration_source,
                            historical_payment_date_available, historical_verification_status,
                            historical_record_notes, activation_source, activated_at
                        ) VALUES (
                            gen_random_uuid(), $1, $2, $3, 3,
                            '2024-08-01', '2024-11-30', 'ACTIVE', 'VERIFIED',
                            'PAID', 'MIGRATED', NOW(), 'ARYA_HISTORICAL_COHORT_MIGRATION_V1',
                            FALSE, 'VERIFIED', 'Sem 3 Paid cycle fee mapped', 'PAYMENT_VERIFICATION', $4
                        )
                        ON CONFLICT (enrollment_id, semester) DO UPDATE SET
                            period_status = EXCLUDED.period_status,
                            access_status = EXCLUDED.access_status,
                            payment_status = EXCLUDED.payment_status,
                            migration_status = EXCLUDED.migration_status,
                            migrated_at = EXCLUDED.migrated_at,
                            migration_source = EXCLUDED.migration_source,
                            activation_source = EXCLUDED.activation_source,
                            historical_record_notes = EXCLUDED.historical_record_notes
                        """,
                        e_id, u_id, c_id, p3_date,
                    )

                    # Sem 4 and 5: Included Periods
                    for sem, sd, ed in [(4, date(2024, 12, 1), date(2025, 4, 30)), (5, date(2025, 8, 1), date(2025, 11, 30))]:
                        await conn.execute(
                            """
                            INSERT INTO enrollment_periods (
                                id, enrollment_id, participant_user_id, course_id, semester,
                                start_date, end_date, access_status, payment_status,
                                period_status, migration_status, migrated_at, migration_source,
                                historical_payment_date_available, historical_verification_status,
                                historical_record_notes, activation_source, activated_at
                            ) VALUES (
                                gen_random_uuid(), $1, $2, $3, $4,
                                $5, $6, 'ACTIVE', 'VERIFIED',
                                'INCLUDED_PERIOD', 'MIGRATED', NOW(), 'ARYA_HISTORICAL_COHORT_MIGRATION_V1',
                                FALSE, 'VERIFIED', 'Included in paid cycle', 'INCLUDED_HISTORICAL_CYCLE', NOW()
                            )
                            ON CONFLICT (enrollment_id, semester) DO UPDATE SET
                                period_status = EXCLUDED.period_status,
                                access_status = EXCLUDED.access_status,
                                payment_status = EXCLUDED.payment_status,
                                migration_status = EXCLUDED.migration_status,
                                migrated_at = EXCLUDED.migrated_at,
                                migration_source = EXCLUDED.migration_source,
                                activation_source = EXCLUDED.activation_source,
                                historical_record_notes = EXCLUDED.historical_record_notes
                            """,
                            e_id, u_id, c_id, sem, sd, ed,
                        )
                        included_periods_count += 1

                    # Sem 6: Paid Cycle
                    if existing_p:
                        await conn.execute(
                            """
                            UPDATE payments
                            SET semester = 6,
                                amount = $2,
                                taxable_amount = $3,
                                gst_amount = $4,
                                gst_rate = $5,
                                status = 'VERIFIED',
                                utr = COALESCE(utr, transaction_ref, $6),
                                verified_by_role = 'COLLEGE_ADMIN',
                                verification_source = 'HISTORICAL_MIGRATION',
                                academic_year = '2025-2026',
                                institution_id = $7
                            WHERE id = $1
                            """,
                            p6_id, FEE_AMOUNT, taxable, gst, GST_RATE, p6_utr, ARYA_INSTITUTION_ID,
                        )
                        updated_payments_count += 1
                    else:
                        await conn.execute(
                            """
                            INSERT INTO payments (
                                id, enrollment_id, participant_user_id, course_id, semester,
                                amount, currency, transaction_ref, utr, payment_method, status,
                                verified_by_role, verification_source, academic_year, taxable_amount,
                                gst_amount, gst_rate, institution_id, created_at, verified_at
                            ) VALUES (
                                $1, $2, $3, $4, 6,
                                $5, 'INR', $6, $6, 'BANK_TRANSFER', 'VERIFIED',
                                'COLLEGE_ADMIN', 'HISTORICAL_MIGRATION', '2025-2026', $7,
                                $8, $9, $10, $11, $11
                            )
                            """,
                            p6_id, e_id, u_id, c_id, FEE_AMOUNT, p6_utr,
                            taxable, gst, GST_RATE, ARYA_INSTITUTION_ID, p6_date,
                        )
                        new_payments_count += 1

                    invoice_seq += 1
                    inv6_num = f"INV-2025-ARYA-{invoice_seq:05d}"
                    inv6_id = uuid.uuid4()
                    await conn.execute(
                        """
                        INSERT INTO invoices (
                            id, invoice_number, payment_id, enrollment_id, participant_user_id,
                            institution_id, course_id, semester_number, academic_year,
                            taxable_amount, gst_rate, gst_amount, total_amount, status,
                            issued_at, generation_source, created_at, updated_at
                        ) VALUES (
                            $1, $2, $3, $4, $5,
                            $6, $7, 6, '2025-2026',
                            $8, $9, $10, $11, 'ISSUED',
                            $12, 'HISTORICAL_MIGRATION', NOW(), NOW()
                        )
                        ON CONFLICT (invoice_number) DO NOTHING
                        """,
                        inv6_id, inv6_num, p6_id, e_id, u_id,
                        ARYA_INSTITUTION_ID, c_id,
                        taxable, GST_RATE, gst, FEE_AMOUNT, p6_date,
                    )
                    await conn.execute("UPDATE payments SET invoice_id = $1 WHERE id = $2", inv6_id, p6_id)
                    new_invoices_count += 1

                    # Sem 6 period
                    await conn.execute(
                        """
                        INSERT INTO enrollment_periods (
                            id, enrollment_id, participant_user_id, course_id, semester,
                            start_date, end_date, access_status, payment_status,
                            period_status, migration_status, migrated_at, migration_source,
                            historical_payment_date_available, historical_verification_status,
                            historical_record_notes, activation_source, activated_at
                        ) VALUES (
                            gen_random_uuid(), $1, $2, $3, 6,
                            '2025-12-01', '2026-04-30', 'ACTIVE', 'VERIFIED',
                            'PAID', 'MIGRATED', NOW(), 'ARYA_HISTORICAL_COHORT_MIGRATION_V1',
                            TRUE, 'VERIFIED', 'Sem 6 Paid cycle fee mapped', 'PAYMENT_VERIFICATION', $4
                        )
                        ON CONFLICT (enrollment_id, semester) DO UPDATE SET
                            period_status = EXCLUDED.period_status,
                            access_status = EXCLUDED.access_status,
                            payment_status = EXCLUDED.payment_status,
                            migration_status = EXCLUDED.migration_status,
                            migrated_at = EXCLUDED.migrated_at,
                            migration_source = EXCLUDED.migration_source,
                            activation_source = EXCLUDED.activation_source,
                            historical_record_notes = EXCLUDED.historical_record_notes
                        """,
                        e_id, u_id, c_id, p6_date,
                    )

                    # Sem 7 and Sem 8: Included Periods (No separate invoice!)
                    for sem, sd, ed in [(7, date(2026, 8, 1), date(2026, 11, 30)), (8, date(2026, 12, 1), date(2027, 4, 30))]:
                        await conn.execute(
                            """
                            INSERT INTO enrollment_periods (
                                id, enrollment_id, participant_user_id, course_id, semester,
                                start_date, end_date, access_status, payment_status,
                                period_status, migration_status, migrated_at, migration_source,
                                historical_payment_date_available, historical_verification_status,
                                historical_record_notes, activation_source, activated_at
                            ) VALUES (
                                gen_random_uuid(), $1, $2, $3, $4,
                                $5, $6, 'ACTIVE', 'VERIFIED',
                                'INCLUDED_PERIOD', 'MIGRATED', NOW(), 'ARYA_HISTORICAL_COHORT_MIGRATION_V1',
                                FALSE, 'VERIFIED', 'Included in paid cycle', 'INCLUDED_HISTORICAL_CYCLE', NOW()
                            )
                            ON CONFLICT (enrollment_id, semester) DO UPDATE SET
                                period_status = EXCLUDED.period_status,
                                access_status = EXCLUDED.access_status,
                                payment_status = EXCLUDED.payment_status,
                                migration_status = EXCLUDED.migration_status,
                                migrated_at = EXCLUDED.migrated_at,
                                migration_source = EXCLUDED.migration_source,
                                activation_source = EXCLUDED.activation_source,
                                historical_record_notes = EXCLUDED.historical_record_notes
                            """,
                            e_id, u_id, c_id, sem, sd, ed,
                        )
                        included_periods_count += 1

                    # Ensure enrollment has active status and valid access end date
                    await conn.execute(
                        """
                        UPDATE enrollments
                        SET access_status = 'ACTIVE',
                            payment_status = 'VERIFIED',
                            access_end_date = '2027-05-15',
                            updated_at = NOW()
                        WHERE id = $1
                        """,
                        e_id,
                    )
                else:
                    new_payments_count += 1
                    if existing_p:
                        updated_payments_count += 1
                    else:
                        new_payments_count += 1
                    new_invoices_count += 2
                    included_periods_count += 4

            # Update Course payment config for Arya course
            if execute:
                await conn.execute(
                    """
                    UPDATE courses
                    SET payment_frequency = 'SEMESTER',
                        semester_fee = 5850.00,
                        gst_rate = 6.36,
                        gst_inclusive = TRUE,
                        current_period_start_date = '2026-08-01',
                        current_period_end_date = '2026-11-30',
                        payment_due_date = '2026-08-31',
                        grace_period_days = 15,
                        updated_at = NOW()
                    WHERE id = $1
                    """,
                    students[0]["course_id"],
                )

    await close_postgres()

    print("\n" + "=" * 70)
    print("MIGRATION SUMMARY")
    print(f"Total Arya Students:             {total_students}")
    print(f"  Batch 2025-29 (3rd Sem):       {len(sem3_students)}")
    print(f"  Batch 2023-27 (7th Sem):       {len(sem7_students)}")
    print(f"Existing Payments Updated:       {updated_payments_count}")
    print(f"New Payments Created:            {new_payments_count}")
    print(f"Total Invoices Issued:           {new_invoices_count} (Sem 3 and Sem 6 paid cycles only)")
    print(f"Total Included Periods Mapped:   {included_periods_count} (Sem 4, 5, 7, 8 - ZERO fake invoices)")
    print(f"Calculated Total Fee Invoiced:   ₹{Decimal(str(new_invoices_count)) * FEE_AMOUNT:,.2f}")
    print(f"Calculated Total GST Component:  ₹{Decimal(str(new_invoices_count)) * gst:,.2f}")
    print(f"Calculated Net Taxable Revenue:  ₹{Decimal(str(new_invoices_count)) * taxable:,.2f}")
    print("=" * 70)


class nullcontext:
    async def __aenter__(self):
        return None
    async def __aexit__(self, *args):
        pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Arya Historical Payment Migration")
    parser.add_argument("--execute", action="store_true", help="Execute changes in database")
    parser.add_argument("--preview", action="store_true", help="Dry run preview only")
    args = parser.parse_args()

    if not args.execute and not args.preview:
        print("Please specify either --preview or --execute")
        sys.exit(1)

    asyncio.run(run_migration(execute=args.execute))
