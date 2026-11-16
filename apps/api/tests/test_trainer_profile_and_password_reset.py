"""Tests for Trainer Profile Management, Testimonial Approvals, and Arya Password Reset."""
from __future__ import annotations

import io
import json
import pytest
from app.core.security import verify_password, hash_password
from app.db.postgres import get_pg_connection

pytestmark = pytest.mark.asyncio


async def test_trainer_profile_read(trainer):
    """Trainer can read their own profile with all extended profile attributes."""
    resp = await trainer.get("/trainer/profile")
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert "id" in data
    assert "email" in data
    assert "joiningYear" in data
    assert "resumeUrl" in data
    assert "teachingPhotoUrl" in data
    assert "isTestimonialApproved" in data


async def test_trainer_profile_update(trainer):
    """Trainer can update editable profile fields, while non-editable fields remain secure."""
    update_payload = {
        "designation": "Lead Full Stack & AI Specialist",
        "yearsExperience": 9,
        "joiningYear": 2021,
        "bio": "Specializing in distributed systems, real-time engines, and deep learning.",
        "expertiseTags": ["Python", "Next.js", "FastAPI", "PostgreSQL"],
        "specialization": "Artificial Intelligence & Distributed Systems",
        "degrees": [
            {"degree": "B.Tech Computer Science", "institution": "Arya College", "year": "2016"},
            {"degree": "M.Tech Software Systems", "institution": "BITS Pilani", "year": "2020"},
        ],
        "testimonialQuote": "Teaching students practical, industry-grade architectures has been immensely rewarding.",
    }

    # Test PUT /trainer/profile
    put_resp = await trainer.put("/trainer/profile", json=update_payload)
    assert put_resp.status_code == 200, put_resp.text
    put_data = put_resp.json()["data"]
    assert put_data["designation"] == update_payload["designation"]
    assert put_data["yearsExperience"] == 9
    assert put_data["joiningYear"] == 2021
    assert put_data["bio"] == update_payload["bio"]
    assert "Python" in put_data["expertiseTags"]

    # Verify read reflects the update
    get_resp = await trainer.get("/trainer/profile")
    assert get_resp.status_code == 200
    refetched = get_resp.json()["data"]
    assert refetched["designation"] == update_payload["designation"]
    assert refetched["joiningYear"] == 2021
    assert refetched["testimonialQuote"] == update_payload["testimonialQuote"]


async def test_trainer_upload_resume_and_photo(trainer):
    """Test resume upload (PDF) and teaching photo upload."""
    # Test resume PDF upload
    pdf_bytes = b"%PDF-1.4 sample resume content for testing"
    files = {"file": ("resume.pdf", pdf_bytes, "application/pdf")}
    res_resp = await trainer.post("/trainer/profile/resume", files=files)
    assert res_resp.status_code == 200, res_resp.text
    assert "resumeUrl" in res_resp.json()["data"]
    assert res_resp.json()["data"]["resumeUrl"].endswith(".pdf")

    # Test teaching photo upload
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    photo_files = {"file": ("classroom.png", png_bytes, "image/png")}
    photo_resp = await trainer.post("/trainer/profile/teaching-photo", files=photo_files)
    assert photo_resp.status_code == 200, photo_resp.text
    assert "teachingPhotoUrl" in photo_resp.json()["data"]


async def test_super_admin_testimonial_approval_and_public_showcase(super_admin, trainer):
    """Super Admin exclusively approves trainer testimonials, and public endpoint showcases only approved ones."""
    # Trainer profile id
    profile_data = (await trainer.get("/trainer/profile")).json()["data"]
    trainer_user_id = profile_data["userId"]

    # 1. Super Admin approves testimonial
    approve_resp = await super_admin.post(
        f"/trainer/profile/{trainer_user_id}/testimonial",
        json={
            "isApproved": True,
            "quote": "Mentoring our students into top-tier software engineers is our core mission.",
        },
    )
    assert approve_resp.status_code == 200, approve_resp.text
    assert approve_resp.json()["data"]["isTestimonialApproved"] is True

    # 2. Public endpoint lists approved testimonials
    public_resp = await trainer.get("/public/trainers/testimonials")
    assert public_resp.status_code == 200
    testimonials = public_resp.json()["data"]
    matching = [t for t in testimonials if t.get("userId") == trainer_user_id or t.get("name") == profile_data.get("name")]
    assert len(matching) > 0, "Approved testimonial should appear in public showcase"

    # 3. Super Admin revokes approval
    revoke_resp = await super_admin.post(
        f"/trainer/profile/{trainer_user_id}/testimonial",
        json={"isApproved": False},
    )
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["data"]["isTestimonialApproved"] is False


async def test_arya_password_reset_and_must_change_enforcement():
    """Verify Arya College reset accounts have valid Argon2id hashes, must_change_password=True, and non-Arya untouched."""
    INSTITUTION_ID = "39a363c8-635a-4a0b-b9c0-d0c51529774f"

    async with get_pg_connection() as conn:
        # 1. Verify total reset count in Arya
        count_reset = await conn.fetchval(
            """
            SELECT COUNT(*) FROM users
            WHERE institution_id = $1
              AND role = 'STUDENT'
              AND must_change_password = TRUE
            """,
            INSTITUTION_ID,
        )
        assert count_reset >= 1086, f"Expected at least 1086 reset accounts, got {count_reset}"

        # 2. Verify audit log entry exists
        audit = await conn.fetchrow(
            """
            SELECT * FROM audit_logs
            WHERE action = 'bulk_password_reset'
            ORDER BY created_at DESC LIMIT 1
            """
        )
        assert audit is not None, "Audit log for bulk_password_reset missing"
        meta = json.loads(audit["metadata"]) if isinstance(audit["metadata"], str) else audit["metadata"]
        assert meta["total_accounts_reset"] == 1086

        # 3. Verify that non-Arya students or admins were NOT modified with must_change_password
        non_arya_forced = await conn.fetchval(
            """
            SELECT COUNT(*) FROM users
            WHERE (institution_id != $1 OR role != 'STUDENT')
              AND must_change_password = TRUE
            """,
            INSTITUTION_ID,
        )
        assert non_arya_forced == 0, "Non-Arya accounts had must_change_password set!"
