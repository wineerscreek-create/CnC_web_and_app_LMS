"""Payment PostgreSQL repository."""
from __future__ import annotations

from typing import Any
from uuid import UUID
from decimal import Decimal
from app.db.postgres import get_pg_connection, pg_transaction


class PaymentRepository:
    @staticmethod
    async def create_payment(
        enrollment_id: UUID | str,
        participant_id: UUID | str,
        course_id: UUID | str,
        amount: float | Decimal,
        transaction_ref: str,
        semester: int = 1,
        currency: str = "INR",
        method: str = "GATEWAY",
        status: str = "PENDING",
        receipt_url: str | None = None,
        payer_upi_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        import json
        from app.core.errors import Conflict
        clean_utr = transaction_ref.strip()
        async with get_pg_connection() as conn:
            # Check duplicate UTR for non-rejected payments
            dup = await conn.fetchrow(
                "SELECT id, status FROM payments WHERE utr = $1 AND status != 'REJECTED'",
                clean_utr,
            )
            if dup:
                raise Conflict(f"A payment with UTR '{clean_utr}' has already been submitted and is currently {dup['status']}.")

            enr = await conn.fetchrow("SELECT institution_id FROM enrollments WHERE id = $1", UUID(str(enrollment_id)))
            inst_id = enr["institution_id"] if enr else None

            row = await conn.fetchrow(
                """
                INSERT INTO payments (
                    enrollment_id, participant_user_id, course_id, semester,
                    amount, currency, transaction_ref, utr, payment_method, status,
                    receipt_url, payer_upi_id, metadata, institution_id,
                    legacy_reference, verification_source
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16)
                RETURNING id, enrollment_id, participant_user_id, course_id, semester,
                          amount, currency, transaction_ref, utr, payment_method, status,
                          receipt_url, payer_upi_id, metadata, created_at, institution_id,
                          legacy_reference, verification_source
                """,
                UUID(str(enrollment_id)),
                UUID(str(participant_id)),
                UUID(str(course_id)),
                semester,
                Decimal(str(amount)),
                currency,
                clean_utr,
                clean_utr,
                method,
                status,
                receipt_url,
                payer_upi_id,
                json.dumps(metadata or {}),
                inst_id,
                metadata.get("legacy_reference") if metadata else None,
                metadata.get("verification_source") if metadata else None,
            )
            return dict(row)

    @staticmethod
    async def verify_payment(
        payment_id: UUID | str,
        verified_by: UUID | str,
        notes: str | None = None,
        activate_access: bool = True,
        verified_by_role: str = "ADMIN",
        verification_source: str = "PORTAL_ACTION",
    ) -> dict[str, Any]:
        """Atomically marks payment VERIFIED, sets semester access validity, generates an official GST invoice exactly once, and emits an audit event."""
        from datetime import date, timedelta
        from app.core.errors import Conflict, NotFound
        from app.services.invoice_service import create_invoice_record
        async with pg_transaction() as conn:
            pid = UUID(str(payment_id))
            orig = await conn.fetchrow("SELECT * FROM payments WHERE id = $1", pid)
            if not orig:
                raise NotFound("Payment not found.")

            current_status = str(orig["status"]).upper()
            if current_status == "VERIFIED":
                raise Conflict("Payment is already verified.")
            if current_status == "REFUNDED":
                raise Conflict("Cannot verify a refunded payment.")
            if current_status == "REJECTED":
                raise Conflict("Cannot verify a rejected payment.")

            v_uid = UUID(str(verified_by))
            sem_num = orig["semester"] or 1

            # Fetch course semester config or course validity settings
            course_row = await conn.fetchrow(
                """
                SELECT c.current_period_end_date, c.grace_period_days, c.payment_frequency, c.gst_rate,
                       csc.end_date as sem_end_date, csc.academic_year as sem_academic_year
                FROM courses c
                LEFT JOIN course_semester_configs csc 
                    ON csc.course_id = c.id AND csc.semester_number = $2 AND csc.is_active = TRUE
                WHERE c.id = $1
                """,
                orig["course_id"],
                sem_num,
            )
            grace_days = course_row["grace_period_days"] if course_row and course_row["grace_period_days"] is not None else 7
            if course_row and course_row.get("payment_frequency") == "ONE_TIME":
                target_end_date = None
                academic_year = "LIFETIME"
            elif course_row and course_row["sem_end_date"]:
                target_end_date = course_row["sem_end_date"] + timedelta(days=grace_days)
                academic_year = course_row["sem_academic_year"] or "2025-2026"
            elif course_row and course_row["current_period_end_date"]:
                target_end_date = course_row["current_period_end_date"] + timedelta(days=grace_days)
                academic_year = "2025-2026"
            elif course_row and course_row.get("payment_frequency") == "SEMESTER":
                target_end_date = date.today() + timedelta(days=120)
                academic_year = "2025-2026"
            else:
                target_end_date = None
                academic_year = "LIFETIME"

            p_row = await conn.fetchrow(
                """
                UPDATE payments
                SET status = 'VERIFIED',
                    verified_by = $2,
                    verified_by_role = $3,
                    verification_source = $4,
                    verified_at = NOW(),
                    academic_year = COALESCE(academic_year, $5),
                    notes = COALESCE($6, notes)
                WHERE id = $1
                RETURNING id, enrollment_id, participant_user_id, course_id, semester, amount, status, verified_at, verified_by_role
                """,
                pid,
                v_uid,
                verified_by_role,
                verification_source,
                academic_year,
                notes,
            )

            if activate_access:
                # Update corresponding enrollment payment_status to VERIFIED and access to ACTIVE
                await conn.execute(
                    """
                    UPDATE enrollments
                    SET payment_status = 'VERIFIED',
                        access_status = 'ACTIVE',
                        enrollment_status = 'ACTIVE',
                        activated_by = $2,
                        activated_at = NOW(),
                        access_start_date = COALESCE(access_start_date, CURRENT_DATE),
                        access_end_date = $3,
                        updated_at = NOW()
                    WHERE id = $1
                    """,
                    orig["enrollment_id"],
                    v_uid,
                    target_end_date,
                )

                # Upsert enrollment_periods record (guarantee non-null end_date for table constraint)
                period_end_date = target_end_date or (date.today() + timedelta(days=3650))
                await conn.execute(
                    """
                    INSERT INTO enrollment_periods (
                        enrollment_id, participant_user_id, course_id, semester,
                        start_date, end_date, access_status, payment_status,
                        period_status, activation_source, activated_by, activated_at
                    ) VALUES (
                        $1, $2, $3, $4,
                        CURRENT_DATE, $5, 'ACTIVE', 'VERIFIED',
                        'PAID', 'PAYMENT_VERIFICATION', $6, NOW()
                    )
                    ON CONFLICT (enrollment_id, semester) DO UPDATE SET
                        period_status = 'PAID',
                        access_status = 'ACTIVE',
                        payment_status = 'VERIFIED',
                        end_date = EXCLUDED.end_date,
                        activated_by = EXCLUDED.activated_by,
                        activated_at = NOW()
                    """,
                    orig["enrollment_id"],
                    orig["participant_user_id"],
                    orig["course_id"],
                    sem_num,
                    period_end_date,
                    v_uid,
                )

                # Convert any trial for this participant and course
                await conn.execute(
                    """
                    UPDATE course_trials
                    SET status = 'CONVERTED',
                        converted_at = NOW(),
                        updated_at = NOW()
                    WHERE participant_user_id = $1 AND course_id = $2
                    """,
                    orig["participant_user_id"],
                    orig["course_id"],
                )
            else:
                await conn.execute(
                    """
                    UPDATE enrollments
                    SET payment_status = 'VERIFIED',
                        updated_at = NOW()
                    WHERE id = $1
                    """,
                    orig["enrollment_id"],
                )

            # Issue official GST invoice exactly once
            enr_row = await conn.fetchrow("SELECT institution_id FROM enrollments WHERE id = $1", orig["enrollment_id"])
            inst_id = orig["institution_id"] or (enr_row["institution_id"] if enr_row else None)
            if not inst_id:
                user_row = await conn.fetchrow("SELECT institution_id FROM users WHERE id = $1", orig["participant_user_id"])
                inst_id = user_row["institution_id"] if user_row else None

            inv = await create_invoice_record(
                conn,
                payment_id=pid,
                enrollment_id=orig["enrollment_id"],
                participant_user_id=orig["participant_user_id"],
                institution_id=inst_id,
                course_id=orig["course_id"],
                semester_number=sem_num,
                academic_year=academic_year,
                total_amount=orig["amount"],
                gst_rate=course_row["gst_rate"] if course_row and course_row["gst_rate"] is not None else Decimal("6.36"),
                gst_inclusive=True,
                generation_source="VERIFICATION",
            )

            # Record audit event
            await conn.execute(
                """
                INSERT INTO payment_verification_events (
                    payment_id, action, verified_by_user_id, verified_by_role,
                    previous_status, new_status, reason
                ) VALUES ($1, 'VERIFY', $2, $3, $4, 'VERIFIED', $5)
                """,
                pid,
                v_uid,
                verified_by_role,
                current_status,
                notes,
            )

            res = dict(p_row)
            res["invoice_id"] = inv.get("id")
            res["invoice_number"] = inv.get("invoice_number")
            return res

    @staticmethod
    async def list_by_participant(participant_id: UUID | str) -> list[dict[str, Any]]:
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT p.id, p.enrollment_id, p.course_id, p.semester, p.amount, p.currency,
                       p.transaction_ref, COALESCE(p.utr, p.transaction_ref) as utr,
                       p.legacy_reference, p.verification_source,
                       p.taxable_amount, p.gst_amount, p.gst_rate,
                       p.payment_method, p.status, p.verified_at, p.created_at,
                       p.invoice_id, p.rejection_reason,
                       inv.invoice_number,
                       c.title as course_title
                FROM payments p
                JOIN courses c ON c.id = p.course_id
                LEFT JOIN invoices inv ON inv.id = p.invoice_id
                WHERE p.participant_user_id = $1
                ORDER BY p.created_at DESC
                """,
                UUID(str(participant_id)),
            )
            return [dict(r) for r in rows]

    @staticmethod
    async def get_total_revenue(institution_id: UUID | str | None = None) -> float:
        query = """
            SELECT COALESCE(SUM(p.amount), 0)
            FROM payments p
            JOIN enrollments e ON e.id = p.enrollment_id
            WHERE p.status = 'VERIFIED'
        """
        params: list[Any] = []
        if institution_id:
            params.append(UUID(str(institution_id)))
            query += " AND e.institution_id = $1"

        async with get_pg_connection() as conn:
            val = await conn.fetchval(query, *params)
            return float(val) if val is not None else 0.0

    @staticmethod
    async def count_by_status(status: str | None = None, institution_id: UUID | str | None = None) -> int:
        conditions = []
        params: list[Any] = []
        if status:
            params.append(status)
            conditions.append(f"p.status = ${len(params)}")
        if institution_id:
            params.append(UUID(str(institution_id)))
            conditions.append(f"e.institution_id = ${len(params)}")

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        query = f"""
            SELECT COUNT(*)
            FROM payments p
            JOIN enrollments e ON e.id = p.enrollment_id
            {where}
        """
        async with get_pg_connection() as conn:
            return await conn.fetchval(query, *params) or 0

    @staticmethod
    async def list_admin_payments(
        institution_id: UUID | str | None = None,
        status: str | None = None,
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        conditions = []
        params: list[Any] = []

        if institution_id:
            from app.repositories.game_repo import _safe_uuid
            inst_uuid = _safe_uuid(institution_id)
            if inst_uuid:
                params.append(inst_uuid)
                conditions.append(f"(e.institution_id = ${len(params)} OR u.institution_id = ${len(params)})")

        if status and status.lower() != "all":
            s_val = status.upper()
            if s_val == "SUCCESS" or s_val == "COMPLETED":
                s_val = "VERIFIED"
            params.append(s_val)
            conditions.append(f"p.status = ${len(params)}")

        if search:
            params.append(f"%{search.strip()}%")
            conditions.append(f"(u.name ILIKE ${len(params)} OR u.email ILIKE ${len(params)} OR p.transaction_ref ILIKE ${len(params)} OR p.utr ILIKE ${len(params)} OR p.legacy_reference ILIKE ${len(params)} OR p.original_utr ILIKE ${len(params)})")

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        params.append(limit)
        limit_clause = f"LIMIT ${len(params)}"
        params.append(offset)
        offset_clause = f"OFFSET ${len(params)}"

        query = f"""
            SELECT p.id, p.enrollment_id, p.participant_user_id, p.course_id, p.semester,
                   p.amount, p.currency, p.transaction_ref, COALESCE(p.utr, p.transaction_ref) as utr,
                   p.original_utr, p.legacy_reference, p.verification_source,
                   p.payer_upi_id, p.payment_method, p.status,
                   p.verified_at, p.created_at, p.verified_by_role, p.rejection_reason, p.invoice_id,
                   p.taxable_amount, p.gst_amount, p.gst_rate,
                   inv.invoice_number,
                   u.name as student_name, u.email as student_email,
                   c.title as course_title,
                   d.name as department_name,
                   i.name as institution_name
            FROM payments p
            JOIN users u ON u.id = p.participant_user_id
            JOIN courses c ON c.id = p.course_id
            LEFT JOIN enrollments e ON e.id = p.enrollment_id
            LEFT JOIN institutions i ON i.id = COALESCE(p.institution_id, e.institution_id, u.institution_id)
            LEFT JOIN departments d ON d.id = u.department_id
            LEFT JOIN invoices inv ON inv.id = p.invoice_id
            {where}
            ORDER BY p.created_at DESC
            {limit_clause} {offset_clause}
        """
        async with get_pg_connection() as conn:
            rows = await conn.fetch(query, *params)
            return [dict(r) for r in rows]

    @staticmethod
    async def count_admin_payments(
        institution_id: UUID | str | None = None,
        status: str | None = None,
        search: str | None = None,
    ) -> int:
        conditions = []
        params: list[Any] = []

        if institution_id:
            from app.repositories.game_repo import _safe_uuid
            inst_uuid = _safe_uuid(institution_id)
            if inst_uuid:
                params.append(inst_uuid)
                conditions.append(f"(e.institution_id = ${len(params)} OR u.institution_id = ${len(params)})")

        if status and status.lower() != "all":
            s_val = status.upper()
            if s_val == "SUCCESS" or s_val == "COMPLETED":
                s_val = "VERIFIED"
            params.append(s_val)
            conditions.append(f"p.status = ${len(params)}")

        if search:
            params.append(f"%{search.strip()}%")
            conditions.append(f"(u.name ILIKE ${len(params)} OR u.email ILIKE ${len(params)} OR p.transaction_ref ILIKE ${len(params)} OR p.utr ILIKE ${len(params)} OR p.legacy_reference ILIKE ${len(params)} OR p.original_utr ILIKE ${len(params)})")

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        query = f"""
            SELECT COUNT(*)
            FROM payments p
            JOIN users u ON u.id = p.participant_user_id
            LEFT JOIN enrollments e ON e.id = p.enrollment_id
            {where}
        """
        async with get_pg_connection() as conn:
            return await conn.fetchval(query, *params) or 0

    @staticmethod
    async def get_admin_summary(institution_id: UUID | str | None = None) -> dict[str, Any]:
        conditions = []
        params: list[Any] = []
        if institution_id:
            from app.repositories.game_repo import _safe_uuid
            inst_uuid = _safe_uuid(institution_id)
            if inst_uuid:
                params.append(inst_uuid)
                conditions.append(f"(e.institution_id = ${len(params)} OR u.institution_id = ${len(params)})")

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        query = f"""
            SELECT 
                COUNT(*) as total_txns,
                COUNT(*) FILTER (WHERE p.status = 'VERIFIED') as verified_txns,
                COUNT(*) FILTER (WHERE p.status = 'PENDING') as pending_txns,
                COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'VERIFIED'), 0) as verified_volume,
                COALESCE(SUM(p.amount), 0) as total_volume
            FROM payments p
            JOIN users u ON u.id = p.participant_user_id
            LEFT JOIN enrollments e ON e.id = p.enrollment_id
            {where}
        """
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(query, *params)
            if not row:
                return {
                    "totalRevenue": 0.0,
                    "currency": "INR",
                    "totalTransactions": 0,
                    "successfulTransactions": 0,
                    "pendingTransactions": 0,
                    "refundedTransactions": 0,
                    "refundedVolume": 0.0,
                    "paymentMethods": [],
                }
            v_vol = float(row["verified_volume"])
            v_txns = int(row["verified_txns"])
            p_txns = int(row["pending_txns"])
            t_txns = int(row["total_txns"])
            return {
                "totalRevenue": round(v_vol, 2),
                "currency": "INR",
                "totalTransactions": t_txns,
                "successfulTransactions": v_txns,
                "pendingTransactions": p_txns,
                "refundedTransactions": 0,
                "refundedVolume": 0.0,
                "paymentMethods": [{"method": "Official Fee Receipt", "count": v_txns}],
            }

    @staticmethod
    async def reject_payment(
        payment_id: UUID | str,
        rejected_by: UUID | str,
        reason: str | None = None,
        rejected_by_role: str = "ADMIN",
    ) -> dict[str, Any]:
        """Atomically marks payment REJECTED and leaves enrollment unactivated."""
        from app.core.errors import Conflict, NotFound
        async with pg_transaction() as conn:
            pid = UUID(str(payment_id))
            orig = await conn.fetchrow("SELECT * FROM payments WHERE id = $1", pid)
            if not orig:
                raise NotFound("Payment not found.")

            current_status = str(orig["status"]).upper()
            if current_status == "VERIFIED":
                raise Conflict("Cannot reject a verified payment; issue a refund instead.")
            if current_status == "REFUNDED":
                raise Conflict("Payment has already been refunded.")
            if current_status == "REJECTED":
                raise Conflict("Payment is already rejected.")

            v_uid = UUID(str(rejected_by))
            p_row = await conn.fetchrow(
                """
                UPDATE payments
                SET status = 'REJECTED',
                    verified_by = $2,
                    verified_by_role = $3,
                    rejection_reason = $4,
                    updated_at = NOW()
                WHERE id = $1
                RETURNING id, enrollment_id, participant_user_id, course_id, semester, amount, status, rejection_reason, verified_by_role
                """,
                pid,
                v_uid,
                rejected_by_role,
                reason,
            )

            # Update enrollment payment_status to REJECTED (student account remains ACTIVE so they can log in and submit correct UTR)
            await conn.execute(
                """
                UPDATE enrollments
                SET payment_status = 'REJECTED',
                    updated_at = NOW()
                WHERE id = $1
                """,
                p_row["enrollment_id"],
            )

            # Record audit event
            await conn.execute(
                """
                INSERT INTO payment_verification_events (
                    payment_id, action, verified_by_user_id, verified_by_role,
                    previous_status, new_status, reason
                ) VALUES ($1, 'REJECT', $2, $3, $4, 'REJECTED', $5)
                """,
                pid,
                v_uid,
                rejected_by_role,
                current_status,
                reason,
            )

            return dict(p_row)

    @staticmethod
    async def manual_activate_access(
        enrollment_id: UUID | str,
        activated_by: UUID | str,
        activated_by_role: str = "ADMIN",
        reason: str = "Manual admin approval",
        access_end_date: Any | None = None,
    ) -> dict[str, Any]:
        """Atomically activates student access without falsely marking payment as VERIFIED."""
        from datetime import date, timedelta
        from app.core.errors import NotFound
        async with pg_transaction() as conn:
            eid = UUID(str(enrollment_id))
            enr = await conn.fetchrow("SELECT * FROM enrollments WHERE id = $1", eid)
            if not enr:
                raise NotFound("Enrollment not found.")

            v_uid = UUID(str(activated_by))
            target_end_date = access_end_date or (date.today() + timedelta(days=120))

            updated = await conn.fetchrow(
                """
                UPDATE enrollments
                SET access_status = 'ACTIVE',
                    activation_source = 'MANUAL_ADMIN_APPROVAL',
                    manual_activation_reason = $2,
                    manual_activated_by = $3,
                    manual_activated_at = NOW(),
                    access_end_date = $4,
                    updated_at = NOW()
                WHERE id = $1
                RETURNING id, participant_user_id, course_id, access_status, payment_status, 
                          activation_source, manual_activation_reason, access_end_date
                """,
                eid,
                reason,
                v_uid,
                target_end_date,
            )

            # Upsert enrollment period as MANUAL_OVERRIDE (no fake paid invoice issued)
            await conn.execute(
                """
                INSERT INTO enrollment_periods (
                    enrollment_id, participant_user_id, course_id, semester,
                    start_date, end_date, access_status, payment_status,
                    period_status, activation_source, activated_by, activated_at
                ) VALUES (
                    $1, $2, $3, $4,
                    CURRENT_DATE, $5, 'ACTIVE', $6,
                    'MANUAL_OVERRIDE', 'MANUAL_ADMIN_APPROVAL', $7, NOW()
                )
                ON CONFLICT (enrollment_id, semester) DO UPDATE SET
                    period_status = 'MANUAL_OVERRIDE',
                    access_status = 'ACTIVE',
                    end_date = EXCLUDED.end_date,
                    activation_source = 'MANUAL_ADMIN_APPROVAL',
                    activated_by = EXCLUDED.activated_by,
                    activated_at = NOW()
                """,
                eid,
                enr["participant_user_id"],
                enr["course_id"],
                enr["current_semester"] or 1,
                target_end_date,
                enr["payment_status"] or "PENDING",
                v_uid,
            )

            return dict(updated)

    @staticmethod
    async def refund_payment(
        payment_id: UUID | str,
        refunded_by: UUID | str,
        amount: float | Decimal | None = None,
        refund_ref: str | None = None,
        reason: str = "Admin approved refund",
    ) -> dict[str, Any]:
        """Atomically refunds a verified transaction and revokes enrollment access."""
        from app.core.errors import Conflict, NotFound, ValidationError
        async with pg_transaction() as conn:
            pid = UUID(str(payment_id))
            orig = await conn.fetchrow("SELECT * FROM payments WHERE id = $1", pid)
            if not orig:
                raise NotFound("Payment not found.")

            current_status = str(orig["status"]).upper()
            if current_status == "REFUNDED":
                raise Conflict("Payment has already been refunded.")
            if current_status != "VERIFIED":
                raise Conflict("Only verified payments can be refunded.")

            ref_amount = Decimal(str(amount)) if amount is not None else orig["amount"]
            if ref_amount <= 0 or ref_amount > orig["amount"]:
                raise ValidationError("Refund amount must be greater than zero and cannot exceed original payment amount.")

            r_by = UUID(str(refunded_by))
            r_ref = refund_ref or f"REF-{str(payment_id)[:8].upper()}"

            p_row = await conn.fetchrow(
                """
                UPDATE payments
                SET status = 'REFUNDED',
                    refunded_at = NOW(),
                    refunded_by = $2,
                    refund_amount = $3,
                    refund_ref = $4,
                    refund_reason = $5,
                    notes = COALESCE(notes, '') || ' [Refunded: ' || $5 || ']',
                    updated_at = NOW()
                WHERE id = $1
                RETURNING id, enrollment_id, participant_user_id, course_id, semester, amount,
                          refund_amount, refund_ref, refunded_at, status;
                """,
                pid,
                r_by,
                ref_amount,
                r_ref,
                reason,
            )

            # Revoke enrollment access
            await conn.execute(
                """
                UPDATE enrollments
                SET payment_status = 'REFUNDED',
                    access_status = 'INACTIVE',
                    enrollment_status = 'CANCELLED',
                    deactivated_at = NOW(),
                    deactivation_reason = $2,
                    updated_at = NOW()
                WHERE id = $1
                """,
                orig["enrollment_id"],
                f"Payment refunded: {reason}",
            )
            return dict(p_row)

    @staticmethod
    async def get_course_revenue_summary(course_id: UUID | str) -> dict[str, Any]:
        """Calculates exact, reconciled financial metrics for a single course."""
        cid = UUID(str(course_id))
        async with get_pg_connection() as conn:
            # Course info
            course = await conn.fetchrow("SELECT id, title, slug, fee FROM courses WHERE id = $1", cid)
            if not course:
                raise ValueError("Course not found")

            # Financial metrics
            stats = await conn.fetchrow(
                """
                SELECT 
                    COUNT(*) as total_txns,
                    COUNT(*) FILTER (WHERE status = 'VERIFIED') as verified_txns,
                    COUNT(*) FILTER (WHERE status = 'PENDING') as pending_txns,
                    COUNT(*) FILTER (WHERE status IN ('FAILED', 'REJECTED')) as failed_rejected_txns,
                    COUNT(*) FILTER (WHERE status = 'REFUNDED') as refunded_txns,
                    COALESCE(SUM(amount) FILTER (WHERE status = 'VERIFIED'), 0) as gross_verified_revenue,
                    COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING'), 0) as pending_amount,
                    COALESCE(SUM(refund_amount) FILTER (WHERE status = 'REFUNDED'), 0) as refund_total
                FROM payments
                WHERE course_id = $1;
                """,
                cid,
            )

            gross = float(stats["gross_verified_revenue"])
            refunds = float(stats["refund_total"])
            net = round(gross - refunds, 2)

            # Enrollments & Trials
            paid_enrolled = await conn.fetchval(
                "SELECT count(*) FROM enrollments WHERE course_id = $1 AND payment_status = 'VERIFIED' AND access_status = 'ACTIVE'",
                cid,
            ) or 0

            trial_starts = await conn.fetchval(
                "SELECT count(*) FROM course_trials WHERE course_id = $1", cid
            ) or 0

            trial_expirations = await conn.fetchval(
                "SELECT count(*) FROM course_trials WHERE course_id = $1 AND (status = 'EXPIRED' OR expires_at < NOW())",
                cid,
            ) or 0

            return {
                "courseId": str(course["id"]),
                "courseTitle": course["title"],
                "courseSlug": course["slug"],
                "publishedPrice": float(course["fee"] or 0.0),
                "currency": "INR",
                "totalTransactions": int(stats["total_txns"]),
                "verifiedTransactions": int(stats["verified_txns"]),
                "grossVerifiedRevenue": gross,
                "refundTotal": refunds,
                "netRevenue": net,
                "pendingPaymentCount": int(stats["pending_txns"]),
                "pendingPaymentAmount": float(stats["pending_amount"]),
                "failedRejectedPaymentCount": int(stats["failed_rejected_txns"]),
                "trialStarts": trial_starts,
                "trialExpirations": trial_expirations,
                "paidEnrollments": paid_enrolled,
            }

    @staticmethod
    async def list_course_transactions(
        course_id: UUID | str,
        limit: int = 50,
        offset: int = 0,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        cid = UUID(str(course_id))
        conditions = ["p.course_id = $1"]
        params: list[Any] = [cid]

        if status and status.upper() != "ALL":
            params.append(status.upper())
            conditions.append(f"p.status = ${len(params)}")

        params.append(limit)
        limit_clause = f"LIMIT ${len(params)}"
        params.append(offset)
        offset_clause = f"OFFSET ${len(params)}"

        query = f"""
            SELECT p.id, p.enrollment_id, p.participant_user_id, p.course_id, p.semester,
                   p.amount, p.currency, p.transaction_ref, COALESCE(p.utr, p.transaction_ref) as utr,
                   p.legacy_reference, p.verification_source,
                   p.payment_method, p.status,
                   p.verified_at, p.receipt_url, p.payer_upi_id, p.rejection_reason,
                   p.refunded_at, p.refund_amount, p.refund_ref, p.created_at,
                   u.name as student_name, u.email as student_email
            FROM payments p
            JOIN users u ON u.id = p.participant_user_id
            WHERE {' AND '.join(conditions)}
            ORDER BY p.created_at DESC
            {limit_clause} {offset_clause};
        """
        async with get_pg_connection() as conn:
            rows = await conn.fetch(query, *params)
            return [dict(r) for r in rows]

    @staticmethod
    async def get_college_revenue_summary(institution_id: UUID | str) -> dict[str, Any]:
        """College-level revenue aggregated strictly across that college's enrolled participants."""
        inst_id = UUID(str(institution_id))
        async with get_pg_connection() as conn:
            inst = await conn.fetchrow("SELECT id, name, code FROM institutions WHERE id = $1", inst_id)
            if not inst:
                raise ValueError("Institution not found")

            # Totals
            totals = await conn.fetchrow(
                """
                SELECT 
                    COUNT(*) as total_txns,
                    COUNT(*) FILTER (WHERE p.status = 'VERIFIED') as verified_txns,
                    COUNT(*) FILTER (WHERE p.status = 'PENDING') as pending_txns,
                    COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'VERIFIED'), 0) as gross_verified_revenue,
                    COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'PENDING'), 0) as pending_amount,
                    COALESCE(SUM(p.refund_amount) FILTER (WHERE p.status = 'REFUNDED'), 0) as refund_total
                FROM payments p
                JOIN enrollments e ON e.id = p.enrollment_id
                WHERE e.institution_id = $1;
                """,
                inst_id,
            )

            # Course-wise breakdown within college
            course_breakdown = await conn.fetch(
                """
                SELECT c.id as course_id, c.title as course_title,
                       COUNT(p.id) FILTER (WHERE p.status = 'VERIFIED') as verified_count,
                       COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'VERIFIED'), 0) as verified_revenue
                FROM payments p
                JOIN enrollments e ON e.id = p.enrollment_id
                JOIN courses c ON c.id = p.course_id
                WHERE e.institution_id = $1
                GROUP BY c.id, c.title
                ORDER BY verified_revenue DESC;
                """,
                inst_id,
            )

            gross = float(totals["gross_verified_revenue"])
            refunds = float(totals["refund_total"])
            return {
                "collegeId": str(inst["id"]),
                "collegeName": inst["name"],
                "collegeCode": inst["code"],
                "totalTransactions": int(totals["total_txns"]),
                "verifiedTransactions": int(totals["verified_txns"]),
                "grossVerifiedRevenue": gross,
                "refundTotal": refunds,
                "netRevenue": round(gross - refunds, 2),
                "pendingPaymentCount": int(totals["pending_txns"]),
                "pendingPaymentAmount": float(totals["pending_amount"]),
                "courses": [
                    {
                        "courseId": str(cb["course_id"]),
                        "courseTitle": cb["course_title"],
                        "verifiedCount": int(cb["verified_count"]),
                        "revenue": float(cb["verified_revenue"]),
                    }
                    for cb in course_breakdown
                ],
            }


