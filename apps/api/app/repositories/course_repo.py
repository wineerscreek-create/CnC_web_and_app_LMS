"""Course, Module, and Lesson PostgreSQL repository with Tenant Scoping & Visibility Safeguards."""
from __future__ import annotations

import json
from typing import Any
from uuid import UUID
from app.core.errors import Conflict, NotFound, ScopeForbidden, ValidationError
from app.db.postgres import get_pg_connection


def _safe_uuid(val: Any) -> UUID | None:
    if not val:
        return None
    try:
        return UUID(str(val))
    except (ValueError, TypeError):
        return None


class CourseRepository:
    @staticmethod
    def is_course_accessible(
        course: dict[str, Any],
        *,
        caller_role: str | None = None,
        caller_institution_id: UUID | str | None = None,
        caller_institution_category: str | None = None,
        caller_campus: str | None = None,
        caller_department_id: UUID | str | None = None,
        caller_affiliation_status: str | None = None,
        is_platform_wide: bool = False,
        is_enrolled: bool = False,
        is_invited: bool = False,
    ) -> bool:
        """Determines whether a course is visible/accessible to a given caller."""
        # Platform-wide administrators can access any course
        if is_platform_wide or str(caller_role).upper() in ("SUPER_ADMIN", "PLATFORM_OWNER"):
            return True

        # Deleted courses are never accessible
        if course.get("deleted_at") is not None:
            return False

        # Existing enrolled participants can always access their course
        if is_enrolled:
            return True

        vis = str(course.get("visibility_mode") or "EVERYONE").upper()

        # Public open courses
        if vis == "EVERYONE":
            return True

        # If course is restricted and caller is unauthenticated
        if not caller_role:
            return False

        # Invite-only courses are restricted to pre-enrolled or explicitly invited participants
        if vis in ("INVITE_ONLY", "INTERNAL_ONLY"):
            return is_enrolled or is_invited

        # Inactive or revoked institutional affiliations lose access to tenant-scoped courses
        if caller_affiliation_status and str(caller_affiliation_status).upper() in ("ACTION_REQUIRED", "DELETED", "SUSPENDED"):
            return False

        # Institutional category-wide visibility
        inst_cat = str(caller_institution_category or "").upper()
        if vis in ("COLLEGE", "ALL_COLLEGES") and inst_cat in ("COLLEGE", "UNIVERSITY", "HIGHER_ED"):
            return True
        if vis == "SCHOOL" and inst_cat in ("SCHOOL", "K12"):
            return True
        if vis == "CORPORATE" and inst_cat in ("COMPANY", "CORPORATE", "ENTERPRISE"):
            return True

        # Specific institution / tenant scoping
        if vis in ("SELECTED_INSTITUTIONS", "SELECTED_COLLEGES"):
            if not caller_institution_id:
                return False
            targets = [str(i) for i in (course.get("target_institution_ids") or [])]
            return str(caller_institution_id) in targets

        # Specific campus scoping
        if vis == "SELECTED_CAMPUSES":
            if not caller_campus:
                return False
            targets = [str(cp).strip().lower() for cp in (course.get("target_campus_ids") or [])]
            return str(caller_campus).strip().lower() in targets

        # Specific department / branch scoping
        if vis == "SELECTED_BRANCHES":
            if not caller_department_id:
                return False
            targets = [str(b) for b in (course.get("target_branch_ids") or [])]
            return str(caller_department_id) in targets

        return False

    @staticmethod
    async def list_courses(
        search: str | None = None,
        category: str | None = None,
        training_type: str | None = None,
        delivery_mode: str | None = None,
        published_only: bool = True,
        limit: int = 50,
        offset: int = 0,
        caller_role: str | None = None,
        caller_institution_id: UUID | str | None = None,
        caller_institution_category: str | None = None,
        caller_campus: str | None = None,
        caller_department_id: UUID | str | None = None,
        caller_user_id: UUID | str | None = None,
        caller_affiliation_status: str | None = None,
        is_platform_wide: bool = False,
    ) -> list[dict[str, Any]]:
        conditions = ["deleted_at IS NULL"]
        params: list[Any] = []

        if published_only:
            conditions.append("published = TRUE")
            conditions.append("status = 'PUBLISHED'")

        if category and category.lower() != "all":
            params.append(category)
            conditions.append(f"category = ${len(params)}")

        if training_type:
            params.append(training_type)
            conditions.append(f"training_type = ${len(params)}")

        if delivery_mode:
            params.append(delivery_mode)
            conditions.append(f"delivery_mode = ${len(params)}")

        if search:
            params.append(f"%{search.strip()}%")
            conditions.append(f"(title ILIKE ${len(params)} OR description ILIKE ${len(params)})")

        # Server-side visibility enforcement
        if not is_platform_wide and str(caller_role).upper() != "SUPER_ADMIN":
            if not caller_role:
                # Public unauthenticated visitors ONLY see courses intended for EVERYONE
                conditions.append("visibility_mode = 'EVERYONE'")
            else:
                # Authenticated users see EVERYONE + their tenant scoped courses
                vis_clauses = ["visibility_mode = 'EVERYONE'"]

                # If caller's institutional affiliation is inactive, revoke tenant-scoped institutional visibility
                is_affiliation_active = not (caller_affiliation_status and str(caller_affiliation_status).upper() in ("ACTION_REQUIRED", "DELETED", "SUSPENDED"))

                if is_affiliation_active:
                    inst_cat = str(caller_institution_category or "").upper()
                    if inst_cat in ("COLLEGE", "UNIVERSITY", "HIGHER_ED"):
                        vis_clauses.append("visibility_mode IN ('COLLEGE', 'ALL_COLLEGES')")
                    elif inst_cat in ("SCHOOL", "K12"):
                        vis_clauses.append("visibility_mode = 'SCHOOL'")
                    elif inst_cat in ("COMPANY", "CORPORATE", "ENTERPRISE"):
                        vis_clauses.append("visibility_mode = 'CORPORATE'")

                    if caller_institution_id:
                        params.append(UUID(str(caller_institution_id)))
                        vis_clauses.append(f"(visibility_mode IN ('SELECTED_INSTITUTIONS', 'SELECTED_COLLEGES') AND ${len(params)} = ANY(target_institution_ids))")

                    if caller_campus:
                        params.append(str(caller_campus).strip())
                        vis_clauses.append(f"(visibility_mode = 'SELECTED_CAMPUSES' AND ${len(params)} = ANY(target_campus_ids))")

                    if caller_department_id:
                        params.append(UUID(str(caller_department_id)))
                        vis_clauses.append(f"(visibility_mode = 'SELECTED_BRANCHES' AND ${len(params)} = ANY(target_branch_ids))")

                if caller_user_id:
                    params.append(UUID(str(caller_user_id)))
                    # Active enrollments are always visible to the enrolled student
                    vis_clauses.append(f"(id IN (SELECT course_id FROM enrollments WHERE participant_user_id = ${len(params)} AND enrollment_status = 'ACTIVE'))")

                conditions.append(f"({' OR '.join(vis_clauses)})")

        params.append(limit)
        limit_clause = f"LIMIT ${len(params)}"
        params.append(offset)
        offset_clause = f"OFFSET ${len(params)}"

        query = f"""
            SELECT id, title, slug, code, description, category, training_type, delivery_mode,
                   duration_hours, fee, published, order_index, created_at,
                   trial_duration_days, trial_enabled, payment_methods, upi_id, merchant_name,
                   qr_code_url, payment_instructions, refund_policy, enrollment_open, status,
                   visibility_mode, target_institution_ids, target_campus_ids, target_branch_ids,
                   portal_distribution, allowed_enrollment_methods
            FROM courses
            WHERE {' AND '.join(conditions)}
            ORDER BY order_index ASC, created_at DESC
            {limit_clause} {offset_clause}
        """
        async with get_pg_connection() as conn:
            rows = await conn.fetch(query, *params)
            return [dict(r) for r in rows]

    @staticmethod
    async def get_by_id(course_id: UUID | str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, title, slug, code, description, category, training_type, delivery_mode,
                       duration_hours, fee, published, order_index, created_at,
                       trial_duration_days, trial_enabled, payment_methods, upi_id, merchant_name,
                       qr_code_url, payment_instructions, refund_policy, enrollment_open, status,
                       visibility_mode, target_institution_ids, target_campus_ids, target_branch_ids,
                       portal_distribution, allowed_enrollment_methods
                FROM courses
                WHERE id = $1 AND deleted_at IS NULL
                """,
                UUID(str(course_id)),
            )
            return dict(row) if row else None

    @staticmethod
    async def get_by_slug(slug: str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, title, slug, code, description, category, training_type, delivery_mode,
                       duration_hours, fee, published, order_index, created_at,
                       trial_duration_days, trial_enabled, payment_methods, upi_id, merchant_name,
                       qr_code_url, payment_instructions, refund_policy, enrollment_open, status,
                       visibility_mode, target_institution_ids, target_campus_ids, target_branch_ids,
                       portal_distribution, allowed_enrollment_methods
                FROM courses
                WHERE LOWER(slug) = LOWER($1) AND deleted_at IS NULL
                """,
                slug.strip(),
            )
            return dict(row) if row else None

    @staticmethod
    async def count_courses(published_only: bool = True) -> int:
        cond = "WHERE deleted_at IS NULL"
        if published_only:
            cond += " AND published = TRUE AND status = 'PUBLISHED'"
        query = f"SELECT COUNT(*) FROM courses {cond}"
        async with get_pg_connection() as conn:
            return await conn.fetchval(query) or 0

    @staticmethod
    async def get_categories() -> list[str]:
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                "SELECT DISTINCT category FROM courses WHERE deleted_at IS NULL AND published = TRUE AND status = 'PUBLISHED' ORDER BY category ASC"
            )
            return [r["category"] for r in rows if r["category"]]

    @staticmethod
    async def get_modules_with_lessons(course_id: UUID | str) -> list[dict[str, Any]]:
        async with get_pg_connection() as conn:
            modules = await conn.fetch(
                """
                SELECT id, course_id, title, slug, order_index, description
                FROM modules
                WHERE course_id = $1 AND deleted_at IS NULL
                ORDER BY order_index ASC
                """,
                UUID(str(course_id)),
            )
            res = []
            for m in modules:
                m_dict = dict(m)
                lessons = await conn.fetch(
                    """
                    SELECT id, module_id, title, slug, order_index, content_type, duration_minutes, content
                    FROM lessons
                    WHERE module_id = $1 AND deleted_at IS NULL
                    ORDER BY order_index ASC
                    """,
                    m["id"],
                )
                m_dict["lessons"] = [dict(l) for l in lessons]
                res.append(m_dict)
            return res

    @staticmethod
    async def update_payment_config(course_id: UUID | str, config: dict[str, Any]) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            cid = UUID(str(course_id))
            set_clauses = []
            params: list[Any] = [cid]

            fields = [
                ("fee", "fee"),
                ("trialDurationDays", "trial_duration_days"),
                ("trialEnabled", "trial_enabled"),
                ("paymentMethods", "payment_methods"),
                ("upiId", "upi_id"),
                ("merchantName", "merchant_name"),
                ("qrCodeUrl", "qr_code_url"),
                ("paymentInstructions", "payment_instructions"),
                ("refundPolicy", "refund_policy"),
                ("enrollmentOpen", "enrollment_open"),
                ("status", "status"),
            ]
            for in_key, col in fields:
                if in_key in config:
                    params.append(config[in_key])
                    set_clauses.append(f"{col} = ${len(params)}")

            if not set_clauses:
                return await CourseRepository.get_by_id(cid)

            query = f"""
                UPDATE courses
                SET {', '.join(set_clauses)}, updated_at = NOW()
                WHERE id = $1 AND deleted_at IS NULL
                RETURNING id
            """
            await conn.execute(query, *params)
            return await CourseRepository.get_by_id(cid)

    # =========================================================================
    # COURSE TRAINER ASSIGNMENT REPOSITORY METHODS (FINDING 2 REMEDIATION)
    # =========================================================================
    @staticmethod
    async def get_course_trainers(course_id: UUID | str) -> list[dict[str, Any]]:
        """Returns all trainers assigned to a course via course_trainer_assignments."""
        cid = _safe_uuid(course_id)
        if not cid:
            raise NotFound("Invalid course ID.")
        async with get_pg_connection() as conn:
            course_exists = await conn.fetchval(
                "SELECT 1 FROM courses WHERE id = $1 AND deleted_at IS NULL", cid
            )
            if not course_exists:
                raise NotFound("Course not found or has been deleted.")

            rows = await conn.fetch("""
                SELECT 
                    cta.id as assignment_id,
                    cta.course_id,
                    cta.trainer_user_id,
                    cta.institution_id,
                    cta.department_id,
                    cta.assigned_by,
                    cta.created_at as assigned_at,
                    u.name as trainer_name,
                    u.email as trainer_email,
                    u.phone as trainer_phone,
                    u.status as trainer_status,
                    tp.title as designation,
                    tp.specializations,
                    tp.rating,
                    i.name as institution_name,
                    d.name as department_name,
                    d.code as department_code,
                    ab.name as assigned_by_name
                FROM course_trainer_assignments cta
                JOIN users u ON u.id = cta.trainer_user_id
                LEFT JOIN trainer_profiles tp ON tp.user_id = u.id
                LEFT JOIN institutions i ON i.id = cta.institution_id
                LEFT JOIN departments d ON d.id = cta.department_id
                LEFT JOIN users ab ON ab.id = cta.assigned_by
                WHERE cta.course_id = $1 AND u.deleted_at IS NULL
                ORDER BY cta.created_at DESC
            """, cid)

            return [
                {
                    "id": str(r["assignment_id"]),
                    "assignmentId": str(r["assignment_id"]),
                    "courseId": str(r["course_id"]),
                    "course_id": str(r["course_id"]),
                    "trainerUserId": str(r["trainer_user_id"]),
                    "trainer_user_id": str(r["trainer_user_id"]),
                    "trainerName": r["trainer_name"],
                    "trainer_name": r["trainer_name"],
                    "trainerEmail": r["trainer_email"],
                    "trainer_email": r["trainer_email"],
                    "trainerPhone": r["trainer_phone"],
                    "trainer_phone": r["trainer_phone"],
                    "trainerStatus": str(r["trainer_status"]),
                    "trainer_status": str(r["trainer_status"]),
                    "designation": r["designation"] or "Trainer",
                    "specializations": list(r["specializations"] or []),
                    "rating": float(r["rating"]) if r["rating"] is not None else 5.0,
                    "institutionId": str(r["institution_id"]) if r["institution_id"] else None,
                    "institution_id": str(r["institution_id"]) if r["institution_id"] else None,
                    "institutionName": r["institution_name"],
                    "institution_name": r["institution_name"],
                    "departmentId": str(r["department_id"]) if r["department_id"] else None,
                    "department_id": str(r["department_id"]) if r["department_id"] else None,
                    "departmentName": r["department_name"],
                    "department_name": r["department_name"],
                    "departmentCode": r["department_code"],
                    "department_code": r["department_code"],
                    "assignedBy": str(r["assigned_by"]) if r["assigned_by"] else None,
                    "assigned_by": str(r["assigned_by"]) if r["assigned_by"] else None,
                    "assignedByName": r["assigned_by_name"],
                    "assigned_by_name": r["assigned_by_name"],
                    "assignedAt": r["assigned_at"].isoformat() if r["assigned_at"] else None,
                    "assigned_at": r["assigned_at"].isoformat() if r["assigned_at"] else None,
                }
                for r in rows
            ]

    @staticmethod
    async def assign_course_trainer(
        course_id: UUID | str,
        trainer_user_id: UUID | str,
        institution_id: UUID | str | None = None,
        department_id: UUID | str | None = None,
        assigned_by: UUID | str | None = None,
    ) -> dict[str, Any]:
        """Assigns a trainer to a course with institutional and role validation."""
        cid = _safe_uuid(course_id)
        if not cid:
            raise NotFound("Invalid course ID.")
        tid = _safe_uuid(trainer_user_id)
        if not tid:
            raise ValidationError("Invalid trainer user ID.")
        i_uuid = _safe_uuid(institution_id) if institution_id else None
        d_uuid = _safe_uuid(department_id) if department_id else None
        ab_uuid = _safe_uuid(assigned_by) if assigned_by else None

        async with get_pg_connection() as conn:
            async with conn.transaction():
                # 1. Course validation
                course = await conn.fetchrow(
                    "SELECT id, title, visibility_mode, target_institution_ids, deleted_at FROM courses WHERE id = $1 AND deleted_at IS NULL",
                    cid,
                )
                if not course:
                    raise NotFound("Course not found or has been deleted.")

                # 2. Trainer validation (must exist, not deleted, role == TRAINER)
                trainer = await conn.fetchrow(
                    "SELECT id, name, email, role, status, institution_id, department_id, deleted_at FROM users WHERE id = $1 AND deleted_at IS NULL",
                    tid,
                )
                if not trainer:
                    raise NotFound("Trainer user not found.")
                if str(trainer["role"]).upper() != "TRAINER":
                    raise ValidationError(
                        f"User '{trainer['name']}' has role '{trainer['role']}'. "
                        "Only users with role 'TRAINER' can be assigned to courses."
                    )

                # 3. Resolve institution & department
                resolved_inst_id = i_uuid or trainer["institution_id"]
                if resolved_inst_id:
                    inst_exists = await conn.fetchval(
                        "SELECT 1 FROM institutions WHERE id = $1 AND deleted_at IS NULL",
                        resolved_inst_id,
                    )
                    if not inst_exists:
                        raise NotFound("Specified institution does not exist or has been deleted.")

                # If trainer has an assigned institution, prevent cross-institution manipulation
                if trainer["institution_id"] and resolved_inst_id and trainer["institution_id"] != resolved_inst_id:
                    raise ScopeForbidden("Trainer belongs to a different institution. Cross-institution assignment is prohibited.")

                # If department_id is provided, verify it exists, belongs to the institution, and is not deleted
                resolved_dept_id = d_uuid
                if resolved_dept_id:
                    dept = await conn.fetchrow(
                        "SELECT id, institution_id FROM departments WHERE id = $1 AND deleted_at IS NULL",
                        resolved_dept_id,
                    )
                    if not dept:
                        raise NotFound("Specified department does not exist or has been deleted.")
                    if resolved_inst_id and dept["institution_id"] != resolved_inst_id:
                        raise ScopeForbidden("Specified department does not belong to the trainer's institution.")

                # 4. Check for duplicate assignment
                if resolved_dept_id:
                    existing = await conn.fetchval(
                        "SELECT id FROM course_trainer_assignments WHERE course_id = $1 AND trainer_user_id = $2 AND department_id = $3",
                        cid, tid, resolved_dept_id,
                    )
                else:
                    existing = await conn.fetchval(
                        "SELECT id FROM course_trainer_assignments WHERE course_id = $1 AND trainer_user_id = $2 AND department_id IS NULL",
                        cid, tid,
                    )
                if existing:
                    raise Conflict(f"Trainer '{trainer['name']}' is already assigned to this course.")

                # 5. Insert assignment record
                assign_id = await conn.fetchval("""
                    INSERT INTO course_trainer_assignments (
                        course_id, trainer_user_id, institution_id, department_id, assigned_by, created_at
                    ) VALUES (
                        $1, $2, $3, $4, $5, NOW()
                    )
                    RETURNING id
                """, cid, tid, resolved_inst_id, resolved_dept_id, ab_uuid)

                return {
                    "success": True,
                    "assignmentId": str(assign_id),
                    "courseId": str(cid),
                    "courseTitle": course["title"],
                    "trainerUserId": str(tid),
                    "trainerName": trainer["name"],
                    "institutionId": str(resolved_inst_id) if resolved_inst_id else None,
                    "departmentId": str(resolved_dept_id) if resolved_dept_id else None,
                    "message": f"Trainer '{trainer['name']}' successfully assigned to course '{course['title']}'.",
                }

    @staticmethod
    async def remove_course_trainer(
        course_id: UUID | str,
        trainer_user_id: UUID | str,
        department_id: UUID | str | None = None,
    ) -> bool:
        """Removes a trainer assignment from a course."""
        cid = _safe_uuid(course_id)
        if not cid:
            raise NotFound("Invalid course ID.")
        tid = _safe_uuid(trainer_user_id)
        if not tid:
            raise ValidationError("Invalid trainer user ID.")
        d_uuid = _safe_uuid(department_id) if department_id else None

        async with get_pg_connection() as conn:
            course_exists = await conn.fetchval(
                "SELECT 1 FROM courses WHERE id = $1 AND deleted_at IS NULL", cid
            )
            if not course_exists:
                raise NotFound("Course not found or has been deleted.")

            if d_uuid:
                deleted = await conn.execute(
                    "DELETE FROM course_trainer_assignments WHERE course_id = $1 AND trainer_user_id = $2 AND department_id = $3",
                    cid, tid, d_uuid,
                )
            else:
                deleted = await conn.execute(
                    "DELETE FROM course_trainer_assignments WHERE course_id = $1 AND trainer_user_id = $2",
                    cid, tid,
                )

            count = int(deleted.split(" ")[-1]) if deleted else 0
            if count == 0:
                raise NotFound("Trainer assignment not found for this course.")
            return True

