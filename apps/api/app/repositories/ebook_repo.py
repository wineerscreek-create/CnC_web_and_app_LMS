"""E-Book and Digital Library PostgreSQL Repository."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID
from app.db.postgres import get_pg_connection

DEFAULT_CATEGORIES = [
    {"slug": "programming", "name": "Programming", "description": "Core programming languages, syntax & software development guides."},
    {"slug": "dsa", "name": "DSA", "description": "Data structures, algorithms and coding interview patterns."},
    {"slug": "web-development", "name": "Web Development", "description": "Frontend, backend, APIs and modern full-stack frameworks."},
    {"slug": "ai-ml", "name": "AI/ML", "description": "Artificial intelligence, machine learning, and deep learning references."},
    {"slug": "cloud-computing", "name": "Cloud Computing", "description": "AWS, GCP, Azure, DevOps and cloud infrastructure handbooks."},
    {"slug": "cyber-security", "name": "Cyber Security", "description": "Ethical hacking, network security and defensive architecture."},
    {"slug": "data-science", "name": "Data Science", "description": "Data analytics, statistics, pandas and visual intelligence."},
    {"slug": "interview-preparation", "name": "Interview Preparation", "description": "STAR behavioural frameworks, HR round scripts and placement roadmaps."},
    {"slug": "academic", "name": "Academic", "description": "University curricula, semester syllabus notes and engineering fundamentals."},
    {"slug": "career", "name": "Career", "description": "Resume writing, career navigation and workplace professionalism."},
    {"slug": "general", "name": "General", "description": "Broad technical references and student publications."},
]


class EbookRepository:
    @staticmethod
    async def ensure_categories_seeded() -> None:
        async with get_pg_connection() as conn:
            for cat in DEFAULT_CATEGORIES:
                await conn.execute(
                    """
                    INSERT INTO ebook_categories (slug, name, description)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (slug) DO NOTHING
                    """,
                    cat["slug"],
                    cat["name"],
                    cat["description"],
                )

    @staticmethod
    async def list_categories() -> list[dict[str, Any]]:
        async with get_pg_connection() as conn:
            rows = await conn.fetch("SELECT id, slug, name, description, icon FROM ebook_categories ORDER BY name ASC")
            return [dict(r) for r in rows]

    @staticmethod
    async def list_public_ebooks(
        category: str | None = None,
        tag: str | None = None,
        search: str | None = None,
        featured: bool | None = None,
        page: int = 1,
        limit: int = 12,
    ) -> tuple[list[dict[str, Any]], int]:
        conditions = [
            "status = 'PUBLISHED'",
            "published = TRUE",
            "deleted_at IS NULL",
            "(visibility IS NULL OR visibility != 'COURSE_RESTRICTED')",
        ]
        params: list[Any] = []

        if category and category != "all":
            params.append(category)
            conditions.append(f"category = ${len(params)}")

        if tag:
            params.append(tag)
            conditions.append(f"${len(params)} = ANY(tags)")

        if featured is not None:
            params.append(featured)
            conditions.append(f"is_featured = ${len(params)}")

        if search:
            params.append(f"%{search.strip()}%")
            idx = len(params)
            conditions.append(f"(title ILIKE ${idx} OR author ILIKE ${idx} OR description ILIKE ${idx})")

        where_clause = " AND ".join(conditions)

        count_query = f"SELECT COUNT(*) FROM ebooks WHERE {where_clause}"
        async with get_pg_connection() as conn:
            total = await conn.fetchval(count_query, *params) or 0

            offset = (page - 1) * limit
            params.append(limit)
            limit_idx = len(params)
            params.append(offset)
            offset_idx = len(params)

            data_query = f"""
                SELECT id, slug, title, author, description, short_description, category,
                       tags, page_count, cover_key, is_featured, is_pinned, reads_count,
                       rating as average_rating, reviews_count as ratings_count, allow_download,
                       file_key, preview_key, created_at, published_at
                FROM ebooks
                WHERE {where_clause}
                ORDER BY is_pinned DESC, display_order ASC, published_at DESC NULLS LAST, created_at DESC
                LIMIT ${limit_idx} OFFSET ${offset_idx}
            """
            rows = await conn.fetch(data_query, *params)
            return [dict(r) for r in rows], total

    @staticmethod
    async def get_by_id(ebook_id: UUID | str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, slug, title, author, description, short_description, category,
                       tags, page_count, file_size_bytes, cover_key, file_key, preview_key,
                       status, published, is_featured, is_pinned, allow_download,
                       reads_count, rating as average_rating, reviews_count as ratings_count,
                       course_id, visibility, uploaded_by, created_at, published_at
                FROM ebooks
                WHERE id = $1 AND deleted_at IS NULL
                """,
                UUID(str(ebook_id)),
            )
            return dict(row) if row else None

    @staticmethod
    async def increment_reads_count(ebook_id: UUID | str) -> None:
        async with get_pg_connection() as conn:
            await conn.execute(
                "UPDATE ebooks SET reads_count = COALESCE(reads_count, 0) + 1 WHERE id = $1",
                UUID(str(ebook_id)),
            )

    @staticmethod
    async def update_preview_key(ebook_id: UUID | str, preview_key: str) -> None:
        async with get_pg_connection() as conn:
            await conn.execute(
                "UPDATE ebooks SET preview_key = $1, updated_at = NOW() WHERE id = $2",
                preview_key,
                UUID(str(ebook_id)),
            )

    @staticmethod
    async def get_user_progress(ebook_id: UUID | str, user_id: UUID | str) -> dict[str, Any] | None:
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT current_page, total_pages, progress_percent, completed
                FROM ebook_progress
                WHERE ebook_id = $1 AND student_user_id = $2
                """,
                UUID(str(ebook_id)),
                UUID(str(user_id)),
            )
            return dict(row) if row else None

    @staticmethod
    async def is_bookmarked(ebook_id: UUID | str, user_id: UUID | str) -> bool:
        async with get_pg_connection() as conn:
            count = await conn.fetchval(
                "SELECT COUNT(*) FROM ebook_bookmarks WHERE ebook_id = $1 AND student_user_id = $2",
                UUID(str(ebook_id)),
                UUID(str(user_id)),
            )
            return bool(count and count > 0)

    @staticmethod
    async def list_reviews(ebook_id: UUID | str, limit: int = 10) -> list[dict[str, Any]]:
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT r.id, r.ebook_id, r.user_id, r.rating, r.review_text as comment,
                       r.created_at, u.name as user_name, u.role as user_role
                FROM ebook_reviews r
                JOIN users u ON u.id = r.user_id
                WHERE r.ebook_id = $1 AND r.status = 'APPROVED'
                ORDER BY r.created_at DESC
                LIMIT $2
                """,
                UUID(str(ebook_id)),
                limit,
            )
            return [dict(r) for r in rows]

    @staticmethod
    async def submit_review(
        ebook_id: UUID | str,
        user_id: UUID | str,
        rating: int,
        comment: str,
    ) -> float:
        eb_uuid = UUID(str(ebook_id))
        u_uuid = UUID(str(user_id))
        async with get_pg_connection() as conn:
            async with conn.transaction():
                await conn.execute(
                    """
                    INSERT INTO ebook_reviews (ebook_id, user_id, rating, review_text, status, created_at)
                    VALUES ($1, $2, $3, $4, 'APPROVED', NOW())
                    ON CONFLICT (ebook_id, user_id)
                    DO UPDATE SET rating = EXCLUDED.rating, review_text = EXCLUDED.review_text
                    """,
                    eb_uuid,
                    u_uuid,
                    rating,
                    comment,
                )
                row = await conn.fetchrow(
                    "SELECT AVG(rating)::numeric(3,2) as avg_rating, COUNT(*) as count FROM ebook_reviews WHERE ebook_id = $1",
                    eb_uuid,
                )
                avg_rating = float(row["avg_rating"]) if row and row["avg_rating"] is not None else float(rating)
                ratings_count = int(row["count"]) if row and row["count"] is not None else 1
                await conn.execute(
                    "UPDATE ebooks SET rating = $1, reviews_count = $2 WHERE id = $3",
                    avg_rating,
                    ratings_count,
                    eb_uuid,
                )
                return avg_rating

    @staticmethod
    async def report_ebook(
        ebook_id: UUID | str,
        title: str | None,
        reported_by: UUID | str,
        reporter_name: str | None,
        reporter_role: str | None,
        reason: str,
        details: str | None,
    ) -> None:
        async with get_pg_connection() as conn:
            await conn.execute(
                """
                INSERT INTO ebook_reports (ebook_id, ebook_title, reported_by, reporter_name, reporter_role, reason, details)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                """,
                UUID(str(ebook_id)),
                title,
                UUID(str(reported_by)),
                reporter_name,
                reporter_role,
                reason,
                details,
            )

    @staticmethod
    async def list_bookmarks(ebook_id: UUID | str, user_id: UUID | str) -> list[dict[str, Any]]:
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT id, ebook_id, student_user_id, page_number, title, note, created_at
                FROM ebook_bookmarks
                WHERE ebook_id = $1 AND student_user_id = $2
                ORDER BY page_number ASC
                """,
                UUID(str(ebook_id)),
                UUID(str(user_id)),
            )
            return [dict(r) for r in rows]

    @staticmethod
    async def add_bookmark(
        ebook_id: UUID | str,
        user_id: UUID | str,
        page_number: int,
        note: str | None = None,
    ) -> None:
        async with get_pg_connection() as conn:
            await conn.execute(
                """
                INSERT INTO ebook_bookmarks (ebook_id, student_user_id, page_number, note)
                VALUES ($1, $2, $3, $4)
                """,
                UUID(str(ebook_id)),
                UUID(str(user_id)),
                page_number,
                note,
            )

    @staticmethod
    async def remove_bookmark(ebook_id: UUID | str, user_id: UUID | str, page_number: int) -> None:
        async with get_pg_connection() as conn:
            await conn.execute(
                "DELETE FROM ebook_bookmarks WHERE ebook_id = $1 AND student_user_id = $2 AND page_number = $3",
                UUID(str(ebook_id)),
                UUID(str(user_id)),
                page_number,
            )

    @staticmethod
    async def check_course_enrollment(user_id: UUID | str, course_id: UUID | str) -> bool:
        async with get_pg_connection() as conn:
            count = await conn.fetchval(
                """
                SELECT COUNT(*) FROM enrollments
                WHERE participant_user_id = $1 AND course_id = $2 AND (access_status = 'ACTIVE' OR enrollment_status = 'ACTIVE')
                """,
                UUID(str(user_id)),
                UUID(str(course_id)),
            )
            return bool(count and count > 0)

    @staticmethod
    async def list_admin_ebooks(
        status_filter: str | None = None,
        category: str | None = None,
        search: str | None = None,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[dict[str, Any]], int, dict[str, int]]:
        conditions = []
        params: list[Any] = []

        if status_filter == "deleted":
            conditions.append("(deleted_at IS NOT NULL OR status = 'DELETED')")
        elif status_filter == "featured":
            conditions.append("deleted_at IS NULL AND is_featured = TRUE")
        elif status_filter == "pinned":
            conditions.append("deleted_at IS NULL AND is_pinned = TRUE")
        elif status_filter and status_filter != "all":
            conditions.append(f"deleted_at IS NULL AND status = ${len(params) + 1}")
            params.append(status_filter.upper())
        else:
            conditions.append("deleted_at IS NULL")

        if category and category != "all":
            conditions.append(f"category = ${len(params) + 1}")
            params.append(category)

        if search:
            idx = len(params) + 1
            conditions.append(f"(title ILIKE ${idx} OR author ILIKE ${idx} OR description ILIKE ${idx})")
            params.append(f"%{search.strip()}%")

        where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""

        async with get_pg_connection() as conn:
            total = await conn.fetchval(f"SELECT COUNT(*) FROM ebooks{where_clause}", *params) or 0

            offset = (page - 1) * limit
            limit_idx = len(params) + 1
            params.append(limit)
            offset_idx = len(params) + 1
            params.append(offset)

            query = f"""
                SELECT id, slug, title, author, description, short_description, category,
                       tags, page_count, file_size_bytes, cover_key, file_key, preview_key,
                       status, published, is_featured, is_pinned, allow_download,
                       reads_count, rating as average_rating, reviews_count as ratings_count,
                       uploaded_by, created_at, published_at, deleted_at
                FROM ebooks
                {where_clause}
                ORDER BY is_pinned DESC, is_featured DESC, created_at DESC
                LIMIT ${limit_idx} OFFSET ${offset_idx}
            """
            rows = await conn.fetch(query, *params)

            # Tab summary counts
            counts_row = await conn.fetchrow("""
                SELECT 
                    COUNT(*) FILTER (WHERE deleted_at IS NULL) as all_count,
                    COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'PENDING_REVIEW') as pending_count,
                    COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'PUBLISHED') as published_count,
                    COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'UNPUBLISHED') as unpublished_count,
                    COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'REJECTED') as rejected_count,
                    COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'DRAFT') as draft_count,
                    COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_featured = TRUE) as featured_count,
                    COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_pinned = TRUE) as pinned_count,
                    COUNT(*) FILTER (WHERE deleted_at IS NOT NULL OR status = 'DELETED') as deleted_count
                FROM ebooks
            """)

            counts = {
                "all": counts_row["all_count"] if counts_row else 0,
                "pending": counts_row["pending_count"] if counts_row else 0,
                "published": counts_row["published_count"] if counts_row else 0,
                "unpublished": counts_row["unpublished_count"] if counts_row else 0,
                "rejected": counts_row["rejected_count"] if counts_row else 0,
                "drafts": counts_row["draft_count"] if counts_row else 0,
                "featured": counts_row["featured_count"] if counts_row else 0,
                "pinned": counts_row["pinned_count"] if counts_row else 0,
                "deleted": counts_row["deleted_count"] if counts_row else 0,
            }

            return [dict(r) for r in rows], total, counts

    @staticmethod
    async def create_ebook(
        title: str,
        slug: str,
        author: str,
        description: str,
        category: str,
        pdf_key: str,
        cover_key: str | None,
        file_size_bytes: int,
        page_count: int,
        tags: list[str],
        uploaded_by: UUID | str | None,
        published: bool = True,
        visibility: str = "PUBLIC",
    ) -> dict[str, Any]:
        async with get_pg_connection() as conn:
            u_uuid = UUID(str(uploaded_by)) if uploaded_by else None
            now = datetime.now(timezone.utc)
            status_val = "PUBLISHED" if published else "DRAFT"
            row = await conn.fetchrow(
                """
                INSERT INTO ebooks (
                    title, slug, author, description, short_description, category,
                    file_key, cover_key, file_size_bytes, page_count, tags,
                    uploaded_by, status, published, visibility, is_featured, is_pinned,
                    allow_download, reads_count, rating, reviews_count, created_at, updated_at,
                    published_at
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6,
                    $7, $8, $9, $10, $11,
                    $12, $13, $14, $15, FALSE, FALSE,
                    FALSE, 0, 0.0, 0, $16, $16,
                    $17
                )
                RETURNING *
                """,
                title,
                slug,
                author,
                description,
                description[:140] + ("..." if len(description) > 140 else ""),
                category,
                pdf_key,
                cover_key,
                file_size_bytes,
                page_count,
                tags,
                u_uuid,
                status_val,
                published,
                visibility,
                now,
                now if published else None,
            )
            return dict(row)

    @staticmethod
    async def update_ebook_status(ebook_id: UUID | str, status: str, published: bool) -> bool:
        async with get_pg_connection() as conn:
            now = datetime.now(timezone.utc)
            published_at = now if published else None
            res = await conn.execute(
                """
                UPDATE ebooks
                SET status = $1, published = $2,
                    published_at = COALESCE(published_at, $3),
                    updated_at = $4
                WHERE id = $5
                """,
                status,
                published,
                published_at,
                now,
                UUID(str(ebook_id)),
            )
            return "UPDATE 1" in res

    @staticmethod
    async def set_pinned(ebook_id: UUID | str, is_pinned: bool) -> bool:
        async with get_pg_connection() as conn:
            res = await conn.execute(
                "UPDATE ebooks SET is_pinned = $1, updated_at = NOW() WHERE id = $2",
                is_pinned,
                UUID(str(ebook_id)),
            )
            return "UPDATE 1" in res

    @staticmethod
    async def set_featured(ebook_id: UUID | str, is_featured: bool) -> bool:
        async with get_pg_connection() as conn:
            res = await conn.execute(
                "UPDATE ebooks SET is_featured = $1, updated_at = NOW() WHERE id = $2",
                is_featured,
                UUID(str(ebook_id)),
            )
            return "UPDATE 1" in res

    @staticmethod
    async def update_ebook_meta(ebook_id: UUID | str, updates: dict[str, Any]) -> bool:
        allowed = {"title", "description", "short_description", "category", "tags", "visibility", "allow_download", "display_order"}
        clauses = []
        params: list[Any] = [UUID(str(ebook_id))]
        for k, v in updates.items():
            if k in allowed:
                params.append(v)
                clauses.append(f"{k} = ${len(params)}")
        if not clauses:
            return False
        clauses.append("updated_at = NOW()")
        async with get_pg_connection() as conn:
            res = await conn.execute(
                f"UPDATE ebooks SET {', '.join(clauses)} WHERE id = $1",
                *params,
            )
            return "UPDATE 1" in res

    @staticmethod
    async def delete_ebook(ebook_id: UUID | str) -> bool:
        async with get_pg_connection() as conn:
            res = await conn.execute(
                "UPDATE ebooks SET status = 'DELETED', published = FALSE, deleted_at = NOW(), updated_at = NOW() WHERE id = $1",
                UUID(str(ebook_id)),
            )
            return "UPDATE 1" in res

    @staticmethod
    async def restore_ebook(ebook_id: UUID | str) -> bool:
        async with get_pg_connection() as conn:
            res = await conn.execute(
                "UPDATE ebooks SET status = 'DRAFT', published = FALSE, deleted_at = NULL, updated_at = NOW() WHERE id = $1",
                UUID(str(ebook_id)),
            )
            return "UPDATE 1" in res

    @staticmethod
    async def list_reports() -> list[dict[str, Any]]:
        async with get_pg_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT id, ebook_id, ebook_title, reported_by, reporter_name, reporter_role,
                       reason, details, status, created_at
                FROM ebook_reports
                ORDER BY created_at DESC
                LIMIT 100
                """
            )
            return [dict(r) for r in rows]


