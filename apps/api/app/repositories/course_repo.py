"""Course, Module, and Lesson PostgreSQL repository with Tenant Scoping & Visibility Safeguards."""
from __future__ import annotations

import json
from typing import Any
from uuid import UUID
from app.db.postgres import get_pg_connection


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
