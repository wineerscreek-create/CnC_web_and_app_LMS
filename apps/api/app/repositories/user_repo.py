"""User and Profile PostgreSQL repository."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID
from app.db.postgres import get_pg_connection


def _parse_uuid(val: Any) -> UUID | None:
    if val is None:
        return None
    if isinstance(val, UUID):
        return val
    try:
        return UUID(str(val))
    except (ValueError, TypeError):
        return None


class UserRepository:
    @staticmethod
    async def get_by_id(user_id: UUID | str) -> dict[str, Any] | None:
        parsed_id = _parse_uuid(user_id)
        if not parsed_id:
            from app.core.config import settings
            if not settings.USE_POSTGRES:
                try:
                    from app.db.mongo import get_db
                    from bson import ObjectId
                    db = get_db()
                    doc = await db.users.find_one({"_id": ObjectId(str(user_id))})
                    if not doc:
                        doc = await db.users.find_one({"_id": str(user_id)})
                    if doc:
                        return {
                            "id": str(doc["_id"]),
                            "email": doc["email"],
                            "password_hash": doc.get("passwordHash"),
                            "name": doc.get("name"),
                            "role": doc.get("role"),
                            "institution_id": str(doc.get("collegeId")) if doc.get("collegeId") else None,
                            "department_id": str(doc.get("departmentId")) if doc.get("departmentId") else None,
                            "status": str(doc.get("status", "active")),
                            "email_verified": bool(doc.get("emailVerified", True)),
                            "avatar_color": doc.get("avatarColor") or "#6366f1",
                            "must_change_password": bool(doc.get("mustChangePassword", False)),
                            "preferences": doc.get("preferences") or {},
                            "college_name": doc.get("collegeName"),
                            "department_name": doc.get("departmentName"),
                        }
                except Exception:
                    pass
            return None

        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT u.id, u.email, u.password_hash, u.name, u.role, u.institution_id, u.department_id,
                       u.phone, u.status, u.last_login_at, u.created_at, u.email_verified,
                       u.activation_token, u.activation_token_expires_at, u.must_change_password,
                       u.avatar_color, u.preferences,
                       u.reset_password_token_hash, u.reset_password_token_expires_at,
                       i.name as college_name, d.name as department_name
                FROM users u
                LEFT JOIN institutions i ON i.id = u.institution_id
                LEFT JOIN departments d ON d.id = u.department_id
                WHERE u.id = $1 AND u.deleted_at IS NULL
                """,
                parsed_id,
            )
            return dict(row) if row else None

    @staticmethod
    async def get_by_email(email: str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT u.id, u.email, u.password_hash, u.name, u.role, u.institution_id, u.department_id,
                       u.phone, u.status, u.last_login_at, u.created_at, u.email_verified,
                       u.activation_token, u.activation_token_expires_at, u.must_change_password,
                       u.avatar_color, u.preferences,
                       u.reset_password_token_hash, u.reset_password_token_expires_at,
                       i.name as college_name, d.name as department_name
                FROM users u
                LEFT JOIN institutions i ON i.id = u.institution_id
                LEFT JOIN departments d ON d.id = u.department_id
                WHERE LOWER(u.email) = LOWER($1) AND u.deleted_at IS NULL
                """,
                email.strip(),
            )
            return dict(row) if row else None

    @staticmethod
    async def get_by_identifier(identifier: str) -> dict[str, Any] | None:
        """Find user by email or by college roll number."""
        clean_id = identifier.strip()
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT u.id, u.email, u.password_hash, u.name, u.role, u.institution_id, u.department_id,
                       u.phone, u.status, u.last_login_at, u.created_at, u.email_verified,
                       u.activation_token, u.activation_token_expires_at, u.must_change_password,
                       u.avatar_color, u.preferences,
                       u.reset_password_token_hash, u.reset_password_token_expires_at,
                       sp.roll_number,
                       i.name as college_name, d.name as department_name
                FROM users u
                LEFT JOIN student_profiles sp ON sp.user_id = u.id
                LEFT JOIN institutions i ON i.id = u.institution_id
                LEFT JOIN departments d ON d.id = u.department_id
                WHERE (LOWER(u.email) = LOWER($1) OR UPPER(sp.roll_number) = UPPER($1))
                  AND u.deleted_at IS NULL
                LIMIT 1
                """,
                clean_id,
            )
            return dict(row) if row else None

    @staticmethod
    async def get_by_activation_token(token: str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT u.id, u.email, u.name, u.role, u.institution_id, u.department_id,
                       i.name as college_name, d.name as department_name
                FROM users u
                LEFT JOIN institutions i ON i.id = u.institution_id
                LEFT JOIN departments d ON d.id = u.department_id
                WHERE u.activation_token = $1
                  AND (u.activation_token_expires_at IS NULL OR u.activation_token_expires_at > NOW())
                  AND u.deleted_at IS NULL
                """,
                token.strip(),
            )
            if row:
                return dict(row)

        from app.core.config import settings
        if not settings.USE_POSTGRES:
            try:
                from app.db.mongo import get_db
                db = get_db()
                u = await db.users.find_one({"activationToken": token.strip()})
                if u:
                    return {
                        "id": str(u["_id"]),
                        "email": u.get("email"),
                        "name": u.get("name"),
                        "role": u.get("role"),
                        "institution_id": u.get("collegeId"),
                        "department_id": u.get("departmentId"),
                        "college_name": u.get("collegeName", "Platform"),
                        "department_name": u.get("departmentName"),
                    }
            except Exception:
                pass
        return None

    @staticmethod
    async def activate_user(token: str, password_hash: str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                UPDATE users
                SET password_hash = $1,
                    status = 'ACTIVE',
                    email_verified = TRUE,
                    email_verified_at = NOW(),
                    must_change_password = FALSE,
                    activation_token = NULL,
                    activated_at = NOW(),
                    password_changed_at = NOW(),
                    updated_at = NOW()
                WHERE activation_token = $2
                  AND (activation_token_expires_at IS NULL OR activation_token_expires_at > NOW())
                  AND deleted_at IS NULL
                RETURNING id, email, role, institution_id, department_id
                """,
                password_hash,
                token.strip(),
            )
            if row:
                return dict(row)

        from app.core.config import settings
        if not settings.USE_POSTGRES:
            try:
                from app.db.mongo import get_db
                db = get_db()
                now = datetime.now(timezone.utc)
                u = await db.users.find_one_and_update(
                    {"activationToken": token.strip()},
                    {
                        "$set": {
                            "passwordHash": password_hash,
                            "status": "active",
                            "accountStatus": "active",
                            "emailVerified": True,
                            "mustChangePassword": False,
                            "activationToken": None,
                            "activatedAt": now,
                            "passwordChangedAt": now,
                            "updatedAt": now,
                        }
                    },
                    return_document=True,
                )
                if u:
                    return {
                        "id": str(u["_id"]),
                        "email": u.get("email"),
                        "role": u.get("role"),
                        "institution_id": u.get("collegeId"),
                        "department_id": u.get("departmentId"),
                    }
            except Exception:
                pass
        return None

    @staticmethod
    async def verify_email(user_id: UUID | str) -> None:
        parsed_id = _parse_uuid(user_id)
        if not parsed_id:
            from app.core.config import settings
            if not settings.USE_POSTGRES:
                try:
                    from app.db.mongo import get_db
                    from bson import ObjectId
                    db = get_db()
                    await db.users.update_one(
                        {"_id": ObjectId(str(user_id))},
                        {"$set": {"emailVerified": True}}
                    )
                except Exception:
                    pass
            return
        async with get_pg_connection() as conn:
            await conn.execute(
                """
                UPDATE users
                SET email_verified = TRUE, email_verified_at = NOW(), updated_at = NOW()
                WHERE id = $1
                """,
                parsed_id,
            )

    @staticmethod
    async def update_password(user_id: UUID | str, password_hash: str) -> None:
        parsed_id = _parse_uuid(user_id)
        if not parsed_id:
            from app.core.config import settings
            if not settings.USE_POSTGRES:
                try:
                    from app.db.mongo import get_db
                    from bson import ObjectId
                    db = get_db()
                    await db.users.update_one(
                        {"_id": ObjectId(str(user_id))},
                        {"$set": {"passwordHash": password_hash, "mustChangePassword": False}}
                    )
                except Exception:
                    pass
            return
        async with get_pg_connection() as conn:
            await conn.execute(
                """
                UPDATE users
                SET password_hash = $1, password_changed_at = NOW(), must_change_password = FALSE, updated_at = NOW()
                WHERE id = $2
                """,
                password_hash,
                parsed_id,
            )

    @staticmethod
    async def set_password_reset_token(
        user_id: UUID | str, token_hash: str, expires_at: datetime
    ) -> None:
        parsed_id = _parse_uuid(user_id)
        if not parsed_id:
            return
        async with get_pg_connection() as conn:
            await conn.execute(
                """
                UPDATE users
                SET reset_password_token_hash = $1,
                    reset_password_token_expires_at = $2,
                    updated_at = NOW()
                WHERE id = $3
                """,
                token_hash,
                expires_at,
                parsed_id,
            )

    @staticmethod
    async def get_by_reset_token_hash(token_hash: str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT u.id, u.email, u.password_hash, u.name, u.role, u.institution_id, u.department_id,
                       u.phone, u.status, u.reset_password_token_hash, u.reset_password_token_expires_at
                FROM users u
                WHERE u.reset_password_token_hash = $1
                  AND u.deleted_at IS NULL
                """,
                token_hash.strip(),
            )
            return dict(row) if row else None

    @staticmethod
    async def clear_password_reset_token(user_id: UUID | str) -> None:
        parsed_id = _parse_uuid(user_id)
        if not parsed_id:
            return
        async with get_pg_connection() as conn:
            await conn.execute(
                """
                UPDATE users
                SET reset_password_token_hash = NULL,
                    reset_password_token_expires_at = NULL,
                    updated_at = NOW()
                WHERE id = $1
                """,
                parsed_id,
            )

    @staticmethod
    async def update_login_activity(
        user_id: UUID | str, ip: str | None = None, rehash_password: str | None = None
    ) -> None:
        try:
            uid = UUID(str(user_id))
        except Exception:
            from app.core.config import settings
            if not settings.USE_POSTGRES:
                try:
                    from app.db.mongo import get_db
                    from bson import ObjectId
                    db = get_db()
                    update_fields = {
                        "lastLoginAt": datetime.now(timezone.utc),
                        "lastActiveAt": datetime.now(timezone.utc),
                    }
                    if ip:
                        update_fields["lastLoginIp"] = ip
                    if rehash_password:
                        update_fields["passwordHash"] = rehash_password
                    await db.users.update_one(
                        {"_id": ObjectId(str(user_id))},
                        {"$set": update_fields},
                    )
                except Exception:
                    pass
            return

        async with get_pg_connection() as conn:
            if rehash_password:
                await conn.execute(
                    """
                    UPDATE users
                    SET last_login_at = NOW(), last_active_at = NOW(), last_login_ip = $1, password_hash = $2
                    WHERE id = $3
                    """,
                    ip,
                    rehash_password,
                    uid,
                )
            else:
                await conn.execute(
                    """
                    UPDATE users
                    SET last_login_at = NOW(), last_active_at = NOW(), last_login_ip = $1
                    WHERE id = $2
                    """,
                    ip,
                    uid,
                )

    @staticmethod
    async def get_institution_by_code(code: str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                "SELECT id, name, code FROM institutions WHERE UPPER(code) = UPPER($1) AND deleted_at IS NULL",
                code.strip(),
            )
            return dict(row) if row else None

    @staticmethod
    async def get_department_by_code(institution_id: UUID | str, code: str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                "SELECT id, name, code FROM departments WHERE institution_id = $1 AND UPPER(code) = UPPER($2) AND deleted_at IS NULL",
                UUID(str(institution_id)),
                code.strip(),
            )
            return dict(row) if row else None

    @staticmethod
    async def create_user_with_profile(
        email: str,
        password_hash: str,
        name: str,
        role: str = "STUDENT",
        institution_id: UUID | str | None = None,
        department_id: UUID | str | None = None,
        phone: str | None = None,
        avatar_color: str | None = None,
        roll_number: str | None = None,
        accepted_terms: bool = True,
    ) -> dict[str, Any]:
        inst_uuid = UUID(str(institution_id)) if institution_id else None
        dept_uuid = UUID(str(department_id)) if department_id else None
        now = datetime.now(timezone.utc)
        async with get_pg_connection() as conn:
            async with conn.transaction():
                user_row = await conn.fetchrow(
                    """
                    INSERT INTO users (email, password_hash, name, role, institution_id, department_id, phone,
                                       email_verified, status, avatar_color, accepted_terms_at, created_at, updated_at)
                    VALUES (LOWER($1), $2, $3, $4, $5, $6, $7, FALSE, 'ACTIVE', $8, $9, NOW(), NOW())
                    RETURNING id, email, name, role, institution_id, department_id, phone, status, created_at
                    """,
                    email.strip(),
                    password_hash,
                    name.strip(),
                    role,
                    inst_uuid,
                    dept_uuid,
                    phone,
                    avatar_color,
                    now if accepted_terms else None,
                )
                user_dict = dict(user_row)
                if role == "STUDENT":
                    rn = roll_number or f"{'COL' if inst_uuid else 'ONL'}{str(user_dict['id'])[-6:].upper()}"
                    await conn.execute(
                        """
                        INSERT INTO student_profiles (user_id, roll_number, institution_id, department_id, created_at, updated_at)
                        VALUES ($1, $2, $3, $4, NOW(), NOW())
                        """,
                        user_dict["id"],
                        rn,
                        inst_uuid,
                        dept_uuid,
                    )
                return user_dict

    @staticmethod
    async def create_user(
        email: str,
        password_hash: str,
        name: str,
        role: str = "STUDENT",
        institution_id: UUID | str | None = None,
        department_id: UUID | str | None = None,
        phone: str | None = None,
    ) -> dict[str, Any]:
        inst_uuid = UUID(str(institution_id)) if institution_id else None
        dept_uuid = UUID(str(department_id)) if department_id else None
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO users (email, password_hash, name, role, institution_id, department_id, phone)
                VALUES (LOWER($1), $2, $3, $4, $5, $6, $7)
                RETURNING id, email, name, role, institution_id, department_id, phone, status, created_at
                """,
                email.strip(),
                password_hash,
                name.strip(),
                role,
                inst_uuid,
                dept_uuid,
                phone,
            )
            return dict(row)

    @staticmethod
    async def update_last_login(user_id: UUID | str) -> None:
        parsed_id = _parse_uuid(user_id)
        if not parsed_id:
            return
        async with get_pg_connection() as conn:
            await conn.execute(
                "UPDATE users SET last_login_at = $1 WHERE id = $2",
                datetime.now(timezone.utc),
                parsed_id,
            )

    @staticmethod
    async def create_student_profile(
        user_id: UUID | str,
        roll_number: str,
        institution_id: UUID | str,
        department_id: UUID | str,
        batch_id: UUID | str | None = None,
        avatar_url: str | None = None,
    ) -> dict[str, Any]:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO student_profiles (user_id, roll_number, institution_id, department_id, batch_id, avatar_url)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id, user_id, roll_number, institution_id, department_id, batch_id, avatar_url, created_at
                """,
                _parse_uuid(user_id),
                roll_number.strip(),
                _parse_uuid(institution_id),
                _parse_uuid(department_id),
                _parse_uuid(batch_id) if batch_id else None,
                avatar_url,
            )
            return dict(row)

    @staticmethod
    async def get_student_profile(user_id: UUID | str) -> dict[str, Any] | None:
        parsed_id = _parse_uuid(user_id)
        if not parsed_id:
            from app.core.config import settings
            if not settings.USE_POSTGRES:
                try:
                    from app.db.mongo import get_db
                    from bson import ObjectId
                    db = get_db()
                    doc = await db.student_profiles.find_one({"userId": ObjectId(str(user_id))})
                    if not doc:
                        doc = await db.student_profiles.find_one({"userId": str(user_id)})
                    if doc:
                        return dict(doc)
                except Exception:
                    pass
            return None

        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT sp.id, sp.user_id, sp.roll_number, sp.institution_id, sp.department_id, sp.batch_id,
                       sp.avatar_url, u.name, u.email, u.phone, i.name as institution_name,
                       d.name as department_name, b.name as batch_name
                FROM student_profiles sp
                JOIN users u ON u.id = sp.user_id
                LEFT JOIN institutions i ON i.id = sp.institution_id
                LEFT JOIN departments d ON d.id = sp.department_id
                LEFT JOIN batches b ON b.id = sp.batch_id
                WHERE sp.user_id = $1
                """,
                parsed_id,
            )
            return dict(row) if row else None

    @staticmethod
    async def list_by_scope(
        role: str | None = None,
        institution_id: UUID | str | None = None,
        department_id: UUID | str | None = None,
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        conditions = ["u.deleted_at IS NULL"]
        params: list[Any] = []

        if role:
            params.append(role)
            conditions.append(f"u.role = ${len(params)}")
        if institution_id:
            params.append(UUID(str(institution_id)))
            conditions.append(f"u.institution_id = ${len(params)}")
        if department_id:
            params.append(UUID(str(department_id)))
            conditions.append(f"u.department_id = ${len(params)}")
        if search:
            params.append(f"%{search.strip()}%")
            conditions.append(f"(u.name ILIKE ${len(params)} OR u.email ILIKE ${len(params)})")

        params.append(limit)
        limit_clause = f"LIMIT ${len(params)}"
        params.append(offset)
        offset_clause = f"OFFSET ${len(params)}"

        query = f"""
            SELECT u.id, u.email, u.name, u.role, u.institution_id, u.department_id, u.status,
                   u.created_at, i.name as institution_name, d.name as department_name
            FROM users u
            LEFT JOIN institutions i ON i.id = u.institution_id
            LEFT JOIN departments d ON d.id = u.department_id
            WHERE {' AND '.join(conditions)}
            ORDER BY u.name ASC
            {limit_clause} {offset_clause}
        """
        async with get_pg_connection() as conn:
            rows = await conn.fetch(query, *params)
            return [dict(r) for r in rows]

    @staticmethod
    async def count_by_scope(
        role: str | None = None,
        institution_id: UUID | str | None = None,
        department_id: UUID | str | None = None,
    ) -> int:
        conditions = ["deleted_at IS NULL"]
        params: list[Any] = []

        if role:
            params.append(role)
            conditions.append(f"role = ${len(params)}")
        if institution_id:
            params.append(UUID(str(institution_id)))
            conditions.append(f"institution_id = ${len(params)}")
        if department_id:
            params.append(UUID(str(department_id)))
            conditions.append(f"department_id = ${len(params)}")

        query = f"SELECT COUNT(*) FROM users WHERE {' AND '.join(conditions)}"
        async with get_pg_connection() as conn:
            return await conn.fetchval(query, *params) or 0
