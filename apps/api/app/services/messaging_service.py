"""Complete Institute-Based Messaging Service.

Manages institute batch groups, automatic membership synchronization,
role-based permissions, personal direct messaging, user blocking, and message moderation.
100% powered by PostgreSQL.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.core.errors import BusinessRuleViolation, NotFound, ScopeForbidden, ValidationError
from app.db.postgres import get_pg_connection


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_uuid(val: Any) -> UUID | None:
    if not val:
        return None
    if isinstance(val, UUID):
        return val
    try:
        return UUID(str(val))
    except (ValueError, TypeError):
        return None


def parse_batch_group_identity(
    name: str | None,
    code: str | None,
    academic_year: str | None,
    dep_code: str | None = None,
) -> tuple[str, str, str, str, str]:
    """Extracts (passout_year, branch, section, normalized_key, group_name)
    adhering strictly to PASSOUT_YEAR-BRANCH-SECTION format.
    Example: 2027-CS-C Group
    """
    cand = f"{name or ''} {code or ''} {dep_code or ''}".upper()

    # 1. Passout Year
    year = None
    if academic_year:
        parts = academic_year.replace("/", "-").split("-")
        last_part = parts[-1].strip()
        if len(last_part) == 4 and last_part.isdigit():
            year = last_part
        elif len(last_part) == 2 and last_part.isdigit():
            year = f"20{last_part}"
    if not year and (code or name):
        match = re.search(r"20(\d\d)[-\s](\d\d)", f"{code} {name}")
        if match:
            year = f"20{match.group(2)}"
        else:
            match4 = re.search(r"\b(20\d\d)\b", f"{code} {name}")
            if match4:
                year = match4.group(1)
    if not year:
        year = "2027"

    # 2. Branch
    branch = "GEN"
    if "AI&DS" in cand or "AI" in cand or "AIDS" in cand:
        branch = "AI"
    elif "IT" in cand:
        branch = "IT"
    elif "CS" in cand or "CSE" in cand:
        branch = "CS"
    elif "MECH" in cand or "MEXGC" in cand:
        branch = "MECH"
    elif "ECE" in cand:
        branch = "ECE"
    elif "CIVIL" in cand:
        branch = "CIVIL"

    # 3. Section
    sec_match = re.search(r"(?:CS|IT|AI|DS|MECH)[-_ ]?([A-E])\b", cand)
    if not sec_match:
        sec_match = re.search(r"[-_\s]([A-E])(?:\s+Group|\b|$)", f"{name or ''} {code or ''}")
    section = sec_match.group(1).upper() if sec_match else "A"

    group_key = f"{year}-{branch}-{section}"
    group_name = f"{group_key} Group"
    return year, branch, section, group_key, group_name


class MessagingService:
    # --------------------------------------------------------------------------
    # GROUP SYNCHRONIZATION ENGINE
    # --------------------------------------------------------------------------

    @classmethod
    async def sync_batch_group(cls, batch_id: str | UUID, conn=None) -> dict[str, Any] | None:
        """Idempotently creates or updates a messaging group for an LMS batch."""
        b_uuid = _safe_uuid(batch_id)
        if not b_uuid:
            return None

        async def _run(c):
            batch = await c.fetchrow(
                """
                SELECT b.id, b.name, b.code, b.academic_year, b.semester,
                       b.institution_id, b.department_id, d.code as dep_code
                FROM batches b
                LEFT JOIN departments d ON d.id = b.department_id
                WHERE b.id = $1 AND b.deleted_at IS NULL
                """,
                b_uuid,
            )
            if not batch:
                return None

            year, branch, section, group_key, group_name = parse_batch_group_identity(
                batch["name"], batch["code"], batch["academic_year"], batch["dep_code"]
            )

            group = await c.fetchrow(
                """
                INSERT INTO messaging_groups (
                    institution_id, batch_id, name, normalized_key,
                    passout_year, branch, section, department_id,
                    description, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
                ON CONFLICT (institution_id, normalized_key)
                DO UPDATE SET
                    batch_id = EXCLUDED.batch_id,
                    name = EXCLUDED.name,
                    department_id = EXCLUDED.department_id,
                    updated_at = NOW()
                RETURNING *
                """,
                batch["institution_id"],
                b_uuid,
                group_name,
                group_key,
                year,
                branch,
                section,
                batch["department_id"],
                f"Official communication group for {group_name}",
            )
            return dict(group) if group else None

        if conn:
            return await _run(conn)
        async with get_pg_connection() as connection:
            return await _run(connection)

    @classmethod
    async def sync_all_institute_batch_groups(cls, institution_id: str | UUID | None = None) -> int:
        """Scans batches and creates/updates all messaging groups."""
        i_uuid = _safe_uuid(institution_id)
        async with get_pg_connection() as conn:
            if i_uuid:
                rows = await conn.fetch("SELECT id FROM batches WHERE institution_id = $1 AND deleted_at IS NULL", i_uuid)
            else:
                rows = await conn.fetch("SELECT id FROM batches WHERE deleted_at IS NULL")

            count = 0
            for r in rows:
                g = await cls.sync_batch_group(r["id"], conn=conn)
                if g:
                    count += 1
            return count

    # --------------------------------------------------------------------------
    # STUDENT MEMBERSHIP SYNCHRONIZATION
    # --------------------------------------------------------------------------

    @classmethod
    async def sync_student_batch_membership(
        cls,
        student_user_id: str | UUID,
        batch_id: str | UUID | None,
        institution_id: str | UUID | None = None,
        conn=None,
    ) -> None:
        """Assigns student to their batch group and removes/deactivates membership
        in any other batch groups within the same institution."""
        u_uuid = _safe_uuid(student_user_id)
        b_uuid = _safe_uuid(batch_id)
        i_uuid = _safe_uuid(institution_id)

        if not u_uuid:
            return

        async def _run(c):
            # Resolve institution if not provided
            nonlocal i_uuid
            if not i_uuid:
                u_row = await c.fetchrow("SELECT institution_id FROM users WHERE id = $1", u_uuid)
                if u_row:
                    i_uuid = u_row["institution_id"]

            if not b_uuid:
                # Student has no batch -> deactivate all batch group memberships for this institute
                if i_uuid:
                    await c.execute(
                        """
                        UPDATE messaging_group_members
                        SET is_active = FALSE, updated_at = NOW()
                        WHERE user_id = $1 AND group_id IN (
                            SELECT id FROM messaging_groups WHERE institution_id = $2
                        )
                        """,
                        u_uuid,
                        i_uuid,
                    )
                return

            # Ensure batch group exists
            group = await cls.sync_batch_group(b_uuid, conn=c)
            if not group:
                return

            group_id = group["id"]
            inst_id = group["institution_id"]

            # Deactivate student in other batch groups of this institution
            await c.execute(
                """
                UPDATE messaging_group_members
                SET is_active = FALSE, updated_at = NOW()
                WHERE user_id = $1 AND group_id IN (
                    SELECT id FROM messaging_groups WHERE institution_id = $2 AND id <> $3
                )
                """,
                u_uuid,
                inst_id,
                group_id,
            )

            # Activate in target batch group
            await c.execute(
                """
                INSERT INTO messaging_group_members (
                    group_id, user_id, role, is_active, joined_at, updated_at
                )
                VALUES ($1, $2, 'STUDENT', TRUE, NOW(), NOW())
                ON CONFLICT (group_id, user_id)
                DO UPDATE SET
                    is_active = TRUE,
                    role = 'STUDENT',
                    updated_at = NOW()
                """,
                group_id,
                u_uuid,
            )

            # Audit log
            await c.execute(
                """
                INSERT INTO messaging_audit_logs (
                    event_type, institution_id, group_id, user_id, details, created_at
                )
                VALUES ('STUDENT_BATCH_SYNC', $1, $2, $3, $4::jsonb, NOW())
                """,
                inst_id,
                group_id,
                u_uuid,
                f'{{"batch_id": "{str(b_uuid)}", "group_name": "{group["name"]}"}}',
            )

        if conn:
            await _run(conn)
        else:
            async with get_pg_connection() as connection:
                await _run(connection)

    @classmethod
    async def reconcile_all_students(cls, institution_id: str | UUID | None = None) -> int:
        """Synchronizes all existing student records to their batch messaging groups."""
        i_uuid = _safe_uuid(institution_id)
        async with get_pg_connection() as conn:
            if i_uuid:
                students = await conn.fetch(
                    """
                    SELECT user_id, batch_id, institution_id
                    FROM student_profiles
                    WHERE institution_id = $1 AND batch_id IS NOT NULL
                    """,
                    i_uuid,
                )
            else:
                students = await conn.fetch(
                    """
                    SELECT user_id, batch_id, institution_id
                    FROM student_profiles
                    WHERE batch_id IS NOT NULL
                    """
                )

            count = 0
            for s in students:
                await cls.sync_student_batch_membership(
                    s["user_id"], s["batch_id"], s["institution_id"], conn=conn
                )
                count += 1
            return count

    # --------------------------------------------------------------------------
    # TRAINER GROUP ASSIGNMENT SYNCHRONIZATION
    # --------------------------------------------------------------------------

    @classmethod
    async def sync_trainer_batch_assignment(
        cls,
        trainer_user_id: str | UUID,
        batch_id: str | UUID,
        action: str = "assign",  # "assign" | "revoke"
        conn=None,
    ) -> None:
        """Automatically grants or revokes a trainer's access to a batch group.
        Preserves existing conversation history and group messages upon revocation."""
        t_uuid = _safe_uuid(trainer_user_id)
        b_uuid = _safe_uuid(batch_id)
        if not t_uuid or not b_uuid:
            return

        async def _run(c):
            group = await cls.sync_batch_group(b_uuid, conn=c)
            if not group:
                return

            group_id = group["id"]
            inst_id = group["institution_id"]

            if action == "assign":
                await c.execute(
                    """
                    INSERT INTO messaging_group_members (
                        group_id, user_id, role, is_active, joined_at, updated_at
                    )
                    VALUES ($1, $2, 'TRAINER', TRUE, NOW(), NOW())
                    ON CONFLICT (group_id, user_id)
                    DO UPDATE SET
                        is_active = TRUE,
                        role = 'TRAINER',
                        updated_at = NOW()
                    """,
                    group_id,
                    t_uuid,
                )
                event_type = "TRAINER_ASSIGNED_GROUP"
            else:
                # Revoke access without deleting any group messages or history
                await c.execute(
                    """
                    UPDATE messaging_group_members
                    SET is_active = FALSE, updated_at = NOW()
                    WHERE group_id = $1 AND user_id = $2
                    """,
                    group_id,
                    t_uuid,
                )
                event_type = "TRAINER_REVOKED_GROUP"

            # Audit log
            await c.execute(
                """
                INSERT INTO messaging_audit_logs (
                    event_type, institution_id, group_id, user_id, details, created_at
                )
                VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
                """,
                event_type,
                inst_id,
                group_id,
                t_uuid,
                f'{{"batch_id": "{str(b_uuid)}", "action": "{action}", "group_name": "{group["name"]}"}}',
            )

        if conn:
            await _run(conn)
        else:
            async with get_pg_connection() as connection:
                await _run(connection)

    @classmethod
    async def reconcile_all_trainers(cls, institution_id: str | UUID | None = None) -> int:
        """Scans batch_trainers and ensures all assigned trainers have active group memberships."""
        i_uuid = _safe_uuid(institution_id)
        async with get_pg_connection() as conn:
            if i_uuid:
                rows = await conn.fetch(
                    """
                    SELECT bt.trainer_user_id, bt.batch_id
                    FROM batch_trainers bt
                    JOIN batches b ON b.id = bt.batch_id
                    WHERE b.institution_id = $1 AND (bt.status = 'ACTIVE' OR bt.status IS NULL)
                    """,
                    i_uuid,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT bt.trainer_user_id, bt.batch_id
                    FROM batch_trainers bt
                    WHERE (bt.status = 'ACTIVE' OR bt.status IS NULL)
                    """
                )

            count = 0
            for r in rows:
                await cls.sync_trainer_batch_assignment(
                    r["trainer_user_id"], r["batch_id"], action="assign", conn=conn
                )
                count += 1
            return count

    # --------------------------------------------------------------------------
    # GROUP QUERIES AND MESSAGING
    # --------------------------------------------------------------------------

    @classmethod
    async def get_user_accessible_groups(
        cls,
        user_id: str | UUID,
        role: str,
        institution_id: str | UUID | None = None,
    ) -> list[dict[str, Any]]:
        """Returns only the batch groups the user is strictly authorized to access."""
        u_uuid = _safe_uuid(user_id)
        if not u_uuid:
            return []

        async with get_pg_connection() as conn:
            # For Students & Trainers: only groups where is_active = TRUE
            if role in ("STUDENT", "TRAINER"):
                rows = await conn.fetch(
                    """
                    SELECT g.id, g.name, g.normalized_key, g.passout_year, g.branch, g.section,
                           g.description, g.avatar_url, g.batch_id, g.institution_id,
                           gm.unread_count, gm.joined_at,
                           (SELECT COUNT(*) FROM messaging_group_members WHERE group_id = g.id AND is_active = TRUE) as member_count,
                           (SELECT json_build_object(
                               'id', m.id,
                               'content', m.content,
                               'senderId', m.sender_id,
                               'senderName', u.name,
                               'messageType', m.message_type,
                               'createdAt', m.created_at
                           )
                            FROM messaging_messages m
                            JOIN users u ON u.id = m.sender_id
                            WHERE m.group_id = g.id AND m.is_deleted = FALSE
                            ORDER BY m.created_at DESC LIMIT 1) as last_message
                    FROM messaging_groups g
                    JOIN messaging_group_members gm ON gm.group_id = g.id
                    WHERE gm.user_id = $1 AND gm.is_active = TRUE AND g.is_archived = FALSE
                    ORDER BY COALESCE(
                        (SELECT m.created_at FROM messaging_messages m WHERE m.group_id = g.id ORDER BY m.created_at DESC LIMIT 1),
                        g.created_at
                    ) DESC
                    """,
                    u_uuid,
                )
            else:
                # Admins & Super Admins: all groups in institution (or global)
                i_uuid = _safe_uuid(institution_id)
                if i_uuid and role != "SUPER_ADMIN":
                    cond = "g.institution_id = $1 AND g.is_archived = FALSE"
                    params = [i_uuid]
                else:
                    cond = "g.is_archived = FALSE"
                    params = []

                rows = await conn.fetch(
                    f"""
                    SELECT g.id, g.name, g.normalized_key, g.passout_year, g.branch, g.section,
                           g.description, g.avatar_url, g.batch_id, g.institution_id,
                           0 as unread_count, g.created_at as joined_at,
                           (SELECT COUNT(*) FROM messaging_group_members WHERE group_id = g.id AND is_active = TRUE) as member_count,
                           (SELECT json_build_object(
                               'id', m.id,
                               'content', m.content,
                               'senderId', m.sender_id,
                               'senderName', u.name,
                               'messageType', m.message_type,
                               'createdAt', m.created_at
                           )
                            FROM messaging_messages m
                            JOIN users u ON u.id = m.sender_id
                            WHERE m.group_id = g.id AND m.is_deleted = FALSE
                            ORDER BY m.created_at DESC LIMIT 1) as last_message
                    FROM messaging_groups g
                    WHERE {cond}
                    ORDER BY g.created_at DESC
                    """,
                    *params,
                )

            res = []
            for r in rows:
                d = dict(r)
                d["id"] = str(d["id"])
                d["batchId"] = str(d["batch_id"]) if d.get("batch_id") else None
                d["institutionId"] = str(d["institution_id"]) if d.get("institution_id") else None
                d["memberCount"] = int(d.get("member_count") or 0)
                d["unreadCount"] = int(d.get("unread_count") or 0)
                d["joinedAt"] = d["joined_at"].isoformat() if d.get("joined_at") else None
                res.append(d)
            return res

    @classmethod
    async def get_group_details(
        cls,
        group_id: str | UUID,
        user_id: str | UUID,
        role: str,
    ) -> dict[str, Any]:
        """Returns group info and active members list with strict access control."""
        g_uuid = _safe_uuid(group_id)
        u_uuid = _safe_uuid(user_id)
        if not g_uuid or not u_uuid:
            raise NotFound("Group not found")

        async with get_pg_connection() as conn:
            # Check membership authorization
            if role in ("STUDENT", "TRAINER"):
                member = await conn.fetchrow(
                    "SELECT is_active FROM messaging_group_members WHERE group_id = $1 AND user_id = $2",
                    g_uuid,
                    u_uuid,
                )
                if not member or not member["is_active"]:
                    raise ScopeForbidden("You are not an authorized member of this group.")

            group = await conn.fetchrow(
                """
                SELECT g.*, i.name as institution_name
                FROM messaging_groups g
                JOIN institutions i ON i.id = g.institution_id
                WHERE g.id = $1 AND g.is_archived = FALSE
                """,
                g_uuid,
            )
            if not group:
                raise NotFound("Group not found")

            # Active member list
            members = await conn.fetch(
                """
                SELECT u.id, u.name, u.email, u.role, u.avatar_color, gm.joined_at
                FROM messaging_group_members gm
                JOIN users u ON u.id = gm.user_id
                WHERE gm.group_id = $1 AND gm.is_active = TRUE AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
                ORDER BY CASE WHEN u.role = 'TRAINER' THEN 0 WHEN u.role = 'ADMIN' THEN 1 ELSE 2 END, u.name
                """,
                g_uuid,
            )

            # Pinned messages
            pinned = await conn.fetch(
                """
                SELECT m.id, m.content, m.created_at, m.pinned_at, u.name as pinned_by_name
                FROM messaging_messages m
                LEFT JOIN users u ON u.id = m.pinned_by
                WHERE m.group_id = $1 AND m.is_pinned = TRUE AND m.is_deleted = FALSE
                ORDER BY m.pinned_at DESC
                """,
                g_uuid,
            )

            d = dict(group)
            d["id"] = str(d["id"])
            d["institutionId"] = str(d["institution_id"])
            d["batchId"] = str(d["batch_id"]) if d.get("batch_id") else None
            d["members"] = [
                {
                    "id": str(m["id"]),
                    "name": m["name"],
                    "email": m["email"],
                    "role": m["role"],
                    "avatarColor": m["avatar_color"] or "#4f46e5",
                    "joinedAt": m["joined_at"].isoformat() if m.get("joined_at") else None,
                }
                for m in members
            ]
            d["pinnedMessages"] = [
                {
                    "id": str(p["id"]),
                    "content": p["content"],
                    "pinnedByName": p["pinned_by_name"],
                    "pinnedAt": p["pinned_at"].isoformat() if p.get("pinned_at") else None,
                }
                for p in pinned
            ]
            return d

    @classmethod
    async def get_group_messages(
        cls,
        group_id: str | UUID,
        user_id: str | UUID,
        role: str,
        limit: int = 50,
        before: str | None = None,
    ) -> list[dict[str, Any]]:
        """Returns paginated message history for a group."""
        g_uuid = _safe_uuid(group_id)
        u_uuid = _safe_uuid(user_id)
        if not g_uuid or not u_uuid:
            raise NotFound("Group not found")

        async with get_pg_connection() as conn:
            # Check membership
            if role in ("STUDENT", "TRAINER"):
                member = await conn.fetchrow(
                    "SELECT is_active FROM messaging_group_members WHERE group_id = $1 AND user_id = $2",
                    g_uuid,
                    u_uuid,
                )
                if not member or not member["is_active"]:
                    raise ScopeForbidden("You are not an authorized member of this group.")

            before_dt = None
            if before:
                try:
                    before_dt = datetime.fromisoformat(before)
                except Exception:
                    before_dt = None

            query = """
                SELECT m.id, m.group_id, m.sender_id, m.sender_role, m.content,
                       m.message_type, m.reply_to_id, m.is_pinned, m.is_edited,
                       m.is_deleted, m.created_at, m.updated_at,
                       u.name as sender_name, u.avatar_color as sender_avatar_color,
                       rm.content as reply_content, ru.name as reply_sender_name,
                       (SELECT json_agg(json_build_object(
                           'id', a.id,
                           'fileName', a.file_name,
                           'fileUrl', a.file_url,
                           'fileType', a.file_type,
                           'fileSizeBytes', a.file_size_bytes
                       )) FROM messaging_attachments a WHERE a.message_id = m.id) as attachments
                FROM messaging_messages m
                JOIN users u ON u.id = m.sender_id
                LEFT JOIN messaging_messages rm ON rm.id = m.reply_to_id
                LEFT JOIN users ru ON ru.id = rm.sender_id
                WHERE m.group_id = $1
            """
            params: list[Any] = [g_uuid]

            if before_dt:
                params.append(before_dt)
                query += f" AND m.created_at < ${len(params)}"

            params.append(limit)
            query += f" ORDER BY m.created_at DESC LIMIT ${len(params)}"

            rows = await conn.fetch(query, *params)
            messages = []
            for r in reversed(rows):
                d = dict(r)
                d["id"] = str(d["id"])
                d["groupId"] = str(d["group_id"])
                d["senderId"] = str(d["sender_id"])
                d["senderName"] = d["sender_name"]
                d["senderAvatarColor"] = d["sender_avatar_color"] or "#4f46e5"
                d["createdAt"] = d["created_at"].isoformat() if d.get("created_at") else None
                d["attachments"] = d.get("attachments") or []
                if d.get("reply_to_id"):
                    d["replyTo"] = {
                        "id": str(d["reply_to_id"]),
                        "content": d.get("reply_content"),
                        "senderName": d.get("reply_sender_name"),
                    }
                else:
                    d["replyTo"] = None
                messages.append(d)
            return messages

    @classmethod
    async def post_group_message(
        cls,
        group_id: str | UUID,
        sender_id: str | UUID,
        sender_role: str,
        content: str,
        message_type: str = "text",
        reply_to_id: str | UUID | None = None,
        attachments: list[dict[str, Any]] | None = None,
        is_pinned: bool = False,
    ) -> dict[str, Any]:
        """Posts a message to a group with validation, attachment handling, and unread incrementing."""
        g_uuid = _safe_uuid(group_id)
        s_uuid = _safe_uuid(sender_id)
        r_uuid = _safe_uuid(reply_to_id)
        content = content.strip()

        if not g_uuid or not s_uuid:
            raise NotFound("Group or user not found")
        if not content and not attachments:
            raise ValidationError("Message content or attachment is required.")

        async with get_pg_connection() as conn:
            # Check membership
            if sender_role in ("STUDENT", "TRAINER"):
                member = await conn.fetchrow(
                    "SELECT is_active FROM messaging_group_members WHERE group_id = $1 AND user_id = $2",
                    g_uuid,
                    s_uuid,
                )
                if not member or not member["is_active"]:
                    raise ScopeForbidden("You are not an active member of this group.")

            # Students cannot post pinned messages or announcements
            if sender_role == "STUDENT":
                if message_type == "announcement":
                    message_type = "text"
                is_pinned = False

            pinned_at = _now() if is_pinned else None
            pinned_by = s_uuid if is_pinned else None

            # Insert message
            msg = await conn.fetchrow(
                """
                INSERT INTO messaging_messages (
                    group_id, sender_id, sender_role, content,
                    message_type, reply_to_id, is_pinned, pinned_at, pinned_by,
                    created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
                RETURNING *
                """,
                g_uuid,
                s_uuid,
                sender_role,
                content,
                message_type,
                r_uuid,
                is_pinned,
                pinned_at,
                pinned_by,
            )

            msg_id = msg["id"]

            # Save attachments
            saved_attachments = []
            if attachments:
                for att in attachments:
                    att_row = await conn.fetchrow(
                        """
                        INSERT INTO messaging_attachments (
                            message_id, file_name, file_url, file_type, file_size_bytes, created_at
                        )
                        VALUES ($1, $2, $3, $4, $5, NOW())
                        RETURNING id, file_name, file_url, file_type, file_size_bytes
                        """,
                        msg_id,
                        att.get("fileName", "attachment"),
                        att.get("fileUrl", ""),
                        att.get("fileType", "other"),
                        int(att.get("fileSizeBytes") or 0),
                    )
                    saved_attachments.append(
                        {
                            "id": str(att_row["id"]),
                            "fileName": att_row["file_name"],
                            "fileUrl": att_row["file_url"],
                            "fileType": att_row["file_type"],
                            "fileSizeBytes": att_row["file_size_bytes"],
                        }
                    )

            # Increment unread count for other active members
            await conn.execute(
                """
                UPDATE messaging_group_members
                SET unread_count = unread_count + 1, updated_at = NOW()
                WHERE group_id = $1 AND user_id <> $2 AND is_active = TRUE
                """,
                g_uuid,
                s_uuid,
            )

            # Mark sender as read
            await conn.execute(
                """
                UPDATE messaging_group_members
                SET last_read_at = NOW(), last_read_message_id = $1, unread_count = 0
                WHERE group_id = $2 AND user_id = $3
                """,
                msg_id,
                g_uuid,
                s_uuid,
            )

            # Fetch sender info
            sender_user = await conn.fetchrow("SELECT name, avatar_color FROM users WHERE id = $1", s_uuid)

            # Reply preview
            reply_obj = None
            if r_uuid:
                r_msg = await conn.fetchrow(
                    """
                    SELECT m.content, u.name FROM messaging_messages m
                    JOIN users u ON u.id = m.sender_id
                    WHERE m.id = $1
                    """,
                    r_uuid,
                )
                if r_msg:
                    reply_obj = {"id": str(r_uuid), "content": r_msg["content"], "senderName": r_msg["name"]}

            return {
                "id": str(msg_id),
                "groupId": str(g_uuid),
                "senderId": str(s_uuid),
                "senderRole": sender_role,
                "senderName": sender_user["name"] if sender_user else "User",
                "senderAvatarColor": sender_user["avatar_color"] if sender_user else "#4f46e5",
                "content": content,
                "messageType": message_type,
                "replyTo": reply_obj,
                "attachments": saved_attachments,
                "isPinned": is_pinned,
                "isEdited": False,
                "isDeleted": False,
                "createdAt": msg["created_at"].isoformat(),
            }

    @classmethod
    async def pin_group_message(
        cls,
        group_id: str | UUID,
        message_id: str | UUID,
        user_id: str | UUID,
        role: str,
        is_pinned: bool = True,
    ) -> dict[str, Any]:
        """Pins or unpins a message. Only trainers or admins are permitted."""
        if role not in ("TRAINER", "ADMIN", "SUPER_ADMIN"):
            raise ScopeForbidden("Only trainers and administrators can pin messages.")

        g_uuid = _safe_uuid(group_id)
        m_uuid = _safe_uuid(message_id)
        u_uuid = _safe_uuid(user_id)

        async with get_pg_connection() as conn:
            pinned_at = _now() if is_pinned else None
            pinned_by = u_uuid if is_pinned else None

            row = await conn.fetchrow(
                """
                UPDATE messaging_messages
                SET is_pinned = $1, pinned_at = $2, pinned_by = $3, updated_at = NOW()
                WHERE id = $4 AND group_id = $5
                RETURNING id, is_pinned, pinned_at
                """,
                is_pinned,
                pinned_at,
                pinned_by,
                m_uuid,
                g_uuid,
            )
            if not row:
                raise NotFound("Message not found in group")
            return {"messageId": str(m_uuid), "isPinned": is_pinned, "pinnedAt": row["pinned_at"].isoformat() if row["pinned_at"] else None}

    @classmethod
    async def mark_group_messages_read(cls, group_id: str | UUID, user_id: str | UUID) -> None:
        """Resets the unread counter for a user in a group."""
        g_uuid = _safe_uuid(group_id)
        u_uuid = _safe_uuid(user_id)
        if not g_uuid or not u_uuid:
            return

        async with get_pg_connection() as conn:
            last_msg = await conn.fetchval(
                "SELECT id FROM messaging_messages WHERE group_id = $1 ORDER BY created_at DESC LIMIT 1",
                g_uuid,
            )
            await conn.execute(
                """
                UPDATE messaging_group_members
                SET unread_count = 0, last_read_at = NOW(), last_read_message_id = $1, updated_at = NOW()
                WHERE group_id = $2 AND user_id = $3
                """,
                last_msg,
                g_uuid,
                u_uuid,
            )

    # --------------------------------------------------------------------------
    # PERSONAL DIRECT MESSAGING (1-ON-1)
    # --------------------------------------------------------------------------

    @classmethod
    async def search_users_for_direct_message(
        cls,
        query: str,
        current_user_id: str | UUID,
        current_role: str,
        institution_id: str | UUID | None = None,
    ) -> list[dict[str, Any]]:
        """Searches authorized users for direct messaging using email or LMS user ID."""
        q = query.strip()
        u_uuid = _safe_uuid(current_user_id)
        i_uuid = _safe_uuid(institution_id)

        if not q or not u_uuid:
            return []

        async with get_pg_connection() as conn:
            # Check if query is an exact UUID
            exact_uuid = _safe_uuid(q)

            # Base condition: user active and not self
            conds = ["u.id <> $1", "u.status = 'ACTIVE'", "u.deleted_at IS NULL"]
            params: list[Any] = [u_uuid]

            # Institution isolation for non-super-admins
            if current_role != "SUPER_ADMIN" and i_uuid:
                params.append(i_uuid)
                conds.append(f"(u.institution_id = ${len(params)} OR u.institution_id IS NULL)")

            if exact_uuid:
                params.append(exact_uuid)
                conds.append(f"u.id = ${len(params)}")
            else:
                params.append(f"%{q}%")
                conds.append(f"(u.email ILIKE ${len(params)} OR u.name ILIKE ${len(params)})")

            # Exclude blocked users (either direction)
            where_sql = " AND ".join(conds)
            rows = await conn.fetch(
                f"""
                SELECT u.id, u.name, u.email, u.role, u.avatar_color,
                       (SELECT EXISTS(SELECT 1 FROM messaging_blocks WHERE blocker_id = $1 AND blocked_id = u.id)) as is_blocked_by_me,
                       (SELECT EXISTS(SELECT 1 FROM messaging_blocks WHERE blocker_id = u.id AND blocked_id = $1)) as has_blocked_me
                FROM users u
                WHERE {where_sql}
                LIMIT 20
                """,
                *params,
            )

            res = []
            for r in rows:
                res.append(
                    {
                        "id": str(r["id"]),
                        "name": r["name"],
                        "email": r["email"],
                        "role": r["role"],
                        "avatarColor": r["avatar_color"] or "#4f46e5",
                        "isBlockedByMe": r["is_blocked_by_me"],
                        "hasBlockedMe": r["has_blocked_me"],
                    }
                )
            return res

    search_direct_message_users = search_users_for_direct_message

    @classmethod
    async def get_or_create_direct_conversation(
        cls,
        user1_id: str | UUID,
        user2_id: str | UUID,
        institution_id: str | UUID | None = None,
    ) -> dict[str, Any]:
        """Gets or creates a canonical 1-on-1 direct conversation between two users."""
        u1_uuid = _safe_uuid(user1_id)
        u2_uuid = _safe_uuid(user2_id)
        if not u1_uuid or not u2_uuid:
            raise ValidationError("Invalid user identifiers")
        if u1_uuid == u2_uuid:
            raise ValidationError("Cannot create a conversation with yourself")

        # Canonical pair order (u_low < u_high)
        low_uuid = min(u1_uuid, u2_uuid)
        high_uuid = max(u1_uuid, u2_uuid)
        i_uuid = _safe_uuid(institution_id)

        async with get_pg_connection() as conn:
            # Cross-institution isolation check
            user1 = await conn.fetchrow("SELECT id, role, institution_id FROM users WHERE id = $1", u1_uuid)
            user2 = await conn.fetchrow("SELECT id, role, institution_id FROM users WHERE id = $1", u2_uuid)
            if not user1 or not user2:
                raise NotFound("One or both users not found.")
            if user1["role"] != "SUPER_ADMIN" and user2["role"] != "SUPER_ADMIN":
                if user1["institution_id"] != user2["institution_id"]:
                    raise ScopeForbidden("Direct messaging across different institutions is strictly prohibited.")

            effective_inst_id = i_uuid or user1["institution_id"]

            existing = await conn.fetchrow(
                """
                SELECT id, institution_id, user1_id, user2_id, last_message_at,
                       last_message_text, user1_unread_count, user2_unread_count, created_at
                FROM messaging_conversations
                WHERE user1_id = $1 AND user2_id = $2
                """,
                low_uuid,
                high_uuid,
            )
            if existing:
                conv = dict(existing)
            else:
                inserted = await conn.fetchrow(
                    """
                    INSERT INTO messaging_conversations (
                        institution_id, user1_id, user2_id, last_message_at,
                        last_message_text, user1_unread_count, user2_unread_count,
                        created_at, updated_at
                    )
                    VALUES ($1, $2, $3, NOW(), '', 0, 0, NOW(), NOW())
                    RETURNING id, institution_id, user1_id, user2_id, last_message_at,
                              last_message_text, user1_unread_count, user2_unread_count, created_at
                    """,
                    effective_inst_id,
                    low_uuid,
                    high_uuid,
                )
                conv = dict(inserted)

            # Check blocking status
            block_info = await conn.fetchrow(
                """
                SELECT
                    EXISTS(SELECT 1 FROM messaging_blocks WHERE blocker_id = $1 AND blocked_id = $2) as is_blocked_by_1,
                    EXISTS(SELECT 1 FROM messaging_blocks WHERE blocker_id = $2 AND blocked_id = $1) as is_blocked_by_2
                """,
                u1_uuid,
                u2_uuid,
            )

            # Target user profile
            target_id = u2_uuid if low_uuid == u1_uuid else u1_uuid
            target_user = await conn.fetchrow("SELECT id, name, email, role, avatar_color FROM users WHERE id = $1", target_id)

            conv["id"] = str(conv["id"])
            conv["user1Id"] = str(conv["user1_id"])
            conv["user2Id"] = str(conv["user2_id"])
            conv["participant"] = {
                "id": str(target_user["id"]),
                "name": target_user["name"],
                "email": target_user["email"],
                "role": target_user["role"],
                "avatarColor": target_user["avatar_color"] or "#4f46e5",
            } if target_user else None
            conv["isBlockedByMe"] = block_info["is_blocked_by_1"] if block_info else False
            conv["hasBlockedMe"] = block_info["is_blocked_by_2"] if block_info else False
            return conv

    @classmethod
    async def get_user_direct_conversations(
        cls,
        user_id: str | UUID,
    ) -> list[dict[str, Any]]:
        """Lists all active direct conversations for a user."""
        u_uuid = _safe_uuid(user_id)
        if not u_uuid:
            return []

        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT c.id, c.user1_id, c.user2_id, c.last_message_at, c.last_message_text,
                       CASE WHEN c.user1_id = $1 THEN c.user1_unread_count ELSE c.user2_unread_count END as unread_count,
                       u.id as participant_id, u.name as participant_name, u.email as participant_email,
                       u.role as participant_role, u.avatar_color as participant_avatar_color,
                       EXISTS(SELECT 1 FROM messaging_blocks WHERE blocker_id = $1 AND blocked_id = u.id) as is_blocked_by_me,
                       EXISTS(SELECT 1 FROM messaging_blocks WHERE blocker_id = u.id AND blocked_id = $1) as has_blocked_me
                FROM messaging_conversations c
                JOIN users u ON u.id = (CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END)
                WHERE (c.user1_id = $1 OR c.user2_id = $1) AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
                ORDER BY c.last_message_at DESC
                """,
                u_uuid,
            )

            res = []
            for r in rows:
                d = dict(r)
                res.append(
                    {
                        "id": str(d["id"]),
                        "participant": {
                            "id": str(d["participant_id"]),
                            "name": d["participant_name"],
                            "email": d["participant_email"],
                            "role": d["participant_role"],
                            "avatarColor": d["participant_avatar_color"] or "#4f46e5",
                        },
                        "lastMessage": {
                            "content": d["last_message_text"],
                            "createdAt": d["last_message_at"].isoformat() if d.get("last_message_at") else None,
                        },
                        "unreadCount": int(d.get("unread_count") or 0),
                        "isBlockedByMe": d["is_blocked_by_me"],
                        "hasBlockedMe": d["has_blocked_me"],
                        "updatedAt": d["last_message_at"].isoformat() if d.get("last_message_at") else None,
                    }
                )
            return res

    @classmethod
    async def get_direct_messages(
        cls,
        conversation_id: str | UUID,
        user_id: str | UUID,
        limit: int = 50,
        before: str | None = None,
    ) -> list[dict[str, Any]]:
        """Returns paginated messages for a 1-on-1 direct conversation."""
        c_uuid = _safe_uuid(conversation_id)
        u_uuid = _safe_uuid(user_id)
        if not c_uuid or not u_uuid:
            raise NotFound("Conversation not found")

        async with get_pg_connection() as conn:
            conv = await conn.fetchrow(
                "SELECT user1_id, user2_id FROM messaging_conversations WHERE id = $1",
                c_uuid,
            )
            if not conv or (conv["user1_id"] != u_uuid and conv["user2_id"] != u_uuid):
                raise ScopeForbidden("You are not a participant in this conversation.")

            before_dt = None
            if before:
                try:
                    before_dt = datetime.fromisoformat(before)
                except Exception:
                    before_dt = None

            query = """
                SELECT m.id, m.conversation_id, m.sender_id, m.sender_role, m.content,
                       m.message_type, m.reply_to_id, m.is_edited, m.is_deleted,
                       m.created_at, u.name as sender_name, u.avatar_color as sender_avatar_color,
                       rm.content as reply_content, ru.name as reply_sender_name,
                       (SELECT json_agg(json_build_object(
                           'id', a.id,
                           'fileName', a.file_name,
                           'fileUrl', a.file_url,
                           'fileType', a.file_type,
                           'fileSizeBytes', a.file_size_bytes
                       )) FROM messaging_attachments a WHERE a.message_id = m.id) as attachments
                FROM messaging_messages m
                JOIN users u ON u.id = m.sender_id
                LEFT JOIN messaging_messages rm ON rm.id = m.reply_to_id
                LEFT JOIN users ru ON ru.id = rm.sender_id
                WHERE m.conversation_id = $1
            """
            params: list[Any] = [c_uuid]

            if before_dt:
                params.append(before_dt)
                query += f" AND m.created_at < ${len(params)}"

            params.append(limit)
            query += f" ORDER BY m.created_at DESC LIMIT ${len(params)}"

            rows = await conn.fetch(query, *params)
            messages = []
            for r in reversed(rows):
                d = dict(r)
                d["id"] = str(d["id"])
                d["conversationId"] = str(d["conversation_id"])
                d["senderId"] = str(d["sender_id"])
                d["senderName"] = d["sender_name"]
                d["senderAvatarColor"] = d["sender_avatar_color"] or "#4f46e5"
                d["createdAt"] = d["created_at"].isoformat() if d.get("created_at") else None
                d["attachments"] = d.get("attachments") or []
                if d.get("reply_to_id"):
                    d["replyTo"] = {
                        "id": str(d["reply_to_id"]),
                        "content": d.get("reply_content"),
                        "senderName": d.get("reply_sender_name"),
                    }
                else:
                    d["replyTo"] = None
                messages.append(d)
            return messages

    @classmethod
    async def send_direct_message(
        cls,
        conversation_id: str | UUID,
        sender_id: str | UUID,
        sender_role: str,
        content: str,
        reply_to_id: str | UUID | None = None,
        attachments: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Sends a 1-on-1 direct message with strict blocking enforcement."""
        c_uuid = _safe_uuid(conversation_id)
        s_uuid = _safe_uuid(sender_id)
        r_uuid = _safe_uuid(reply_to_id)
        content = content.strip()

        if not c_uuid or not s_uuid:
            raise NotFound("Conversation or sender not found")
        if not content and not attachments:
            raise ValidationError("Message content or attachment is required.")

        async with get_pg_connection() as conn:
            conv = await conn.fetchrow(
                "SELECT user1_id, user2_id FROM messaging_conversations WHERE id = $1",
                c_uuid,
            )
            if not conv or (conv["user1_id"] != s_uuid and conv["user2_id"] != s_uuid):
                raise ScopeForbidden("You are not a participant in this conversation.")

            recipient_id = conv["user2_id"] if conv["user1_id"] == s_uuid else conv["user1_id"]

            # ENFORCE BLOCKING: Backend check ensures neither party blocked the other
            is_blocked = await conn.fetchval(
                """
                SELECT EXISTS(
                    SELECT 1 FROM messaging_blocks
                    WHERE (blocker_id = $1 AND blocked_id = $2)
                       OR (blocker_id = $2 AND blocked_id = $1)
                )
                """,
                recipient_id,
                s_uuid,
            )
            if is_blocked:
                raise BusinessRuleViolation("You cannot send messages to this user because of an active block.")

            # Insert message
            msg = await conn.fetchrow(
                """
                INSERT INTO messaging_messages (
                    conversation_id, sender_id, sender_role, content,
                    message_type, reply_to_id, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, 'text', $5, NOW(), NOW())
                RETURNING *
                """,
                c_uuid,
                s_uuid,
                sender_role,
                content,
                r_uuid,
            )
            msg_id = msg["id"]

            # Save attachments
            saved_attachments = []
            if attachments:
                for att in attachments:
                    att_row = await conn.fetchrow(
                        """
                        INSERT INTO messaging_attachments (
                            message_id, file_name, file_url, file_type, file_size_bytes, created_at
                        )
                        VALUES ($1, $2, $3, $4, $5, NOW())
                        RETURNING id, file_name, file_url, file_type, file_size_bytes
                        """,
                        msg_id,
                        att.get("fileName", "attachment"),
                        att.get("fileUrl", ""),
                        att.get("fileType", "other"),
                        int(att.get("fileSizeBytes") or 0),
                    )
                    saved_attachments.append(
                        {
                            "id": str(att_row["id"]),
                            "fileName": att_row["file_name"],
                            "fileUrl": att_row["file_url"],
                            "fileType": att_row["file_type"],
                            "fileSizeBytes": att_row["file_size_bytes"],
                        }
                    )

            # Update conversation metadata & recipient's unread counter
            unread_field = "user2_unread_count" if conv["user1_id"] == s_uuid else "user1_unread_count"
            await conn.execute(
                f"""
                UPDATE messaging_conversations
                SET last_message_at = NOW(), last_message_text = $1,
                    {unread_field} = {unread_field} + 1, updated_at = NOW()
                WHERE id = $2
                """,
                content[:200],
                c_uuid,
            )

            sender_user = await conn.fetchrow("SELECT name, avatar_color FROM users WHERE id = $1", s_uuid)

            # Reply preview
            reply_obj = None
            if r_uuid:
                r_msg = await conn.fetchrow(
                    """
                    SELECT m.content, u.name FROM messaging_messages m
                    JOIN users u ON u.id = m.sender_id
                    WHERE m.id = $1
                    """,
                    r_uuid,
                )
                if r_msg:
                    reply_obj = {"id": str(r_uuid), "content": r_msg["content"], "senderName": r_msg["name"]}

            return {
                "id": str(msg_id),
                "conversationId": str(c_uuid),
                "senderId": str(s_uuid),
                "recipientId": str(recipient_id),
                "senderRole": sender_role,
                "senderName": sender_user["name"] if sender_user else "User",
                "senderAvatarColor": sender_user["avatar_color"] if sender_user else "#4f46e5",
                "content": content,
                "messageType": "text",
                "replyTo": reply_obj,
                "attachments": saved_attachments,
                "isEdited": False,
                "isDeleted": False,
                "createdAt": msg["created_at"].isoformat(),
            }

    @classmethod
    async def mark_conversation_read(cls, conversation_id: str | UUID, user_id: str | UUID) -> None:
        """Resets the unread counter for a user in a direct conversation."""
        c_uuid = _safe_uuid(conversation_id)
        u_uuid = _safe_uuid(user_id)
        if not c_uuid or not u_uuid:
            return

        async with get_pg_connection() as conn:
            conv = await conn.fetchrow(
                "SELECT user1_id, user2_id FROM messaging_conversations WHERE id = $1",
                c_uuid,
            )
            if not conv:
                return

            reset_field = "user1_unread_count" if conv["user1_id"] == u_uuid else "user2_unread_count"
            await conn.execute(
                f"""
                UPDATE messaging_conversations
                SET {reset_field} = 0, updated_at = NOW()
                WHERE id = $1
                """,
                c_uuid,
            )

    # --------------------------------------------------------------------------
    # BLOCK AND UNBLOCK SYSTEM
    # --------------------------------------------------------------------------

    @classmethod
    async def block_user(
        cls,
        blocker_id: str | UUID,
        blocked_id: str | UUID,
        reason: str | None = None,
    ) -> dict[str, Any]:
        """Blocks a user from direct messaging interactions."""
        b_uuid = _safe_uuid(blocker_id)
        t_uuid = _safe_uuid(blocked_id)
        if not b_uuid or not t_uuid:
            raise ValidationError("Invalid user identifiers")
        if b_uuid == t_uuid:
            raise ValidationError("You cannot block yourself")

        async with get_pg_connection() as conn:
            target = await conn.fetchrow("SELECT id, name FROM users WHERE id = $1", t_uuid)
            if not target:
                raise NotFound("Target user not found")

            await conn.execute(
                """
                INSERT INTO messaging_blocks (blocker_id, blocked_id, reason, created_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (blocker_id, blocked_id) DO NOTHING
                """,
                b_uuid,
                t_uuid,
                reason,
            )

            # Audit log
            await conn.execute(
                """
                INSERT INTO messaging_audit_logs (
                    event_type, user_id, performed_by, details, created_at
                )
                VALUES ('USER_BLOCKED', $1, $2, $3::jsonb, NOW())
                """,
                t_uuid,
                b_uuid,
                f'{{"reason": "{reason or ""}", "blocked_user_name": "{target["name"]}"}}',
            )

            return {"blockedId": str(t_uuid), "blockedName": target["name"], "status": "blocked"}

    @classmethod
    async def unblock_user(cls, blocker_id: str | UUID, blocked_id: str | UUID) -> dict[str, Any]:
        """Unblocks a user, restoring direct messaging capability."""
        b_uuid = _safe_uuid(blocker_id)
        t_uuid = _safe_uuid(blocked_id)
        if not b_uuid or not t_uuid:
            raise ValidationError("Invalid user identifiers")

        async with get_pg_connection() as conn:
            await conn.execute(
                "DELETE FROM messaging_blocks WHERE blocker_id = $1 AND blocked_id = $2",
                b_uuid,
                t_uuid,
            )

            # Audit log
            await conn.execute(
                """
                INSERT INTO messaging_audit_logs (
                    event_type, user_id, performed_by, details, created_at
                )
                VALUES ('USER_UNBLOCKED', $1, $2, '{}'::jsonb, NOW())
                """,
                t_uuid,
                b_uuid,
            )

            return {"unblockedId": str(t_uuid), "status": "unblocked"}

    @classmethod
    async def get_blocked_users(cls, user_id: str | UUID) -> list[dict[str, Any]]:
        """Returns all users blocked by the given user."""
        u_uuid = _safe_uuid(user_id)
        if not u_uuid:
            return []

        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT mb.blocked_id, mb.reason, mb.created_at,
                       u.name, u.email, u.role, u.avatar_color
                FROM messaging_blocks mb
                JOIN users u ON u.id = mb.blocked_id
                WHERE mb.blocker_id = $1
                ORDER BY mb.created_at DESC
                """,
                u_uuid,
            )
            return [
                {
                    "id": str(r["blocked_id"]),
                    "name": r["name"],
                    "email": r["email"],
                    "role": r["role"],
                    "avatarColor": r["avatar_color"] or "#4f46e5",
                    "reason": r["reason"],
                    "blockedAt": r["created_at"].isoformat() if r.get("created_at") else None,
                }
                for r in rows
            ]

    # --------------------------------------------------------------------------
    # MESSAGE EDIT & MODERATION
    # --------------------------------------------------------------------------

    @classmethod
    async def edit_message(
        cls,
        message_id: str | UUID,
        user_id: str | UUID,
        new_content: str,
    ) -> dict[str, Any]:
        """Edits a message. Only the author can edit their own message within 15 minutes."""
        m_uuid = _safe_uuid(message_id)
        u_uuid = _safe_uuid(user_id)
        new_content = new_content.strip()

        if not m_uuid or not u_uuid:
            raise NotFound("Message not found")
        if not new_content:
            raise ValidationError("Message content cannot be empty")

        async with get_pg_connection() as conn:
            msg = await conn.fetchrow(
                "SELECT sender_id, is_deleted, created_at FROM messaging_messages WHERE id = $1",
                m_uuid,
            )
            if not msg:
                raise NotFound("Message not found")
            if msg["sender_id"] != u_uuid:
                raise ScopeForbidden("You can only edit your own messages.")
            if msg["is_deleted"]:
                raise BusinessRuleViolation("Cannot edit a deleted message.")

            # 15 minute limit
            age_seconds = (_now() - msg["created_at"]).total_seconds()
            if age_seconds > 900:
                raise BusinessRuleViolation("Messages can only be edited within 15 minutes of sending.")

            row = await conn.fetchrow(
                """
                UPDATE messaging_messages
                SET content = $1, is_edited = TRUE, edited_at = NOW(), updated_at = NOW()
                WHERE id = $2
                RETURNING id, content, is_edited, edited_at
                """,
                new_content,
                m_uuid,
            )
            return {
                "messageId": str(m_uuid),
                "content": new_content,
                "isEdited": True,
                "editedAt": row["edited_at"].isoformat() if row["edited_at"] else None,
            }

    @classmethod
    async def delete_message(
        cls,
        message_id: str | UUID,
        user_id: str | UUID,
        role: str,
    ) -> dict[str, Any]:
        """Deletes a message. Authors can delete their own; Trainers/Admins can moderate."""
        m_uuid = _safe_uuid(message_id)
        u_uuid = _safe_uuid(user_id)
        if not m_uuid or not u_uuid:
            raise NotFound("Message not found")

        async with get_pg_connection() as conn:
            msg = await conn.fetchrow(
                "SELECT sender_id, group_id, conversation_id FROM messaging_messages WHERE id = $1",
                m_uuid,
            )
            if not msg:
                raise NotFound("Message not found")

            # Permission check: Author or Trainer/Admin moderator in group
            is_author = msg["sender_id"] == u_uuid
            is_moderator = role in ("TRAINER", "ADMIN", "SUPER_ADMIN")

            if not is_author and not is_moderator:
                raise ScopeForbidden("You do not have permission to delete this message.")

            await conn.execute(
                """
                UPDATE messaging_messages
                SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $1,
                    content = 'This message was deleted', updated_at = NOW()
                WHERE id = $2
                """,
                u_uuid,
                m_uuid,
            )

            # Audit log
            await conn.execute(
                """
                INSERT INTO messaging_audit_logs (
                    event_type, group_id, conversation_id, performed_by, details, created_at
                )
                VALUES ('MESSAGE_DELETED', $1, $2, $3, $4::jsonb, NOW())
                """,
                msg["group_id"],
                msg["conversation_id"],
                u_uuid,
                f'{{"message_id": "{str(m_uuid)}", "moderated_by_role": "{role}"}}',
            )

            return {"messageId": str(m_uuid), "isDeleted": True}
