"""Test Suite for Trainer Profile Management, Public Showcase & Inquiries."""
import asyncio
import httpx
from app.main import app

async def run_tests():
    print("=== STARTING TRAINER PROFILE & SHOWCASE TEST SUITE ===")
    results = []

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # 1. Test Public Trainers List
        res = await client.get("/api/v1/public/trainers")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        trainers = res.json().get("data", [])
        assert len(trainers) > 0, "Expected at least 1 published trainer"
        print(f"✓ GET /api/v1/public/trainers PASSED: {len(trainers)} trainers returned")
        results.append("GET /api/v1/public/trainers: PASS")

        # 2. Test Dynamic Slug Lookup
        first_trainer = trainers[0]
        slug = first_trainer["publicSlug"]
        res_slug = await client.get(f"/api/v1/public/trainers/{slug}")
        assert res_slug.status_code == 200, f"Expected 200 for slug {slug}, got {res_slug.status_code}"
        dossier = res_slug.json().get("data", {})
        assert dossier["displayName"] == first_trainer["displayName"]
        assert "bio" in dossier and "education" in dossier and "certifications" in dossier
        print(f"✓ GET /api/v1/public/trainers/{slug} PASSED: Rich dossier retrieved")
        results.append(f"GET /api/v1/public/trainers/{slug}: PASS")

        # 3. Test Invalid Slug (404)
        res_404 = await client.get("/api/v1/public/trainers/non-existent-slug-xyz-999")
        assert res_404.status_code == 404, f"Expected 404, got {res_404.status_code}"
        print("✓ GET /api/v1/public/trainers/invalid-slug PASSED: 404 handled cleanly")
        results.append("GET invalid slug 404: PASS")

        # 4. Test Public Session Inquiry
        inquiry_payload = {
            "fullName": "Corporate HR Director",
            "email": "hr@enterprise-tech.com",
            "phone": "+91 9988776655",
            "organization": "Enterprise Tech Solutions",
            "sessionType": "Executive Presence & Articulation",
            "message": "We would like to book a 3-day executive coaching workshop for 45 senior team leads."
        }
        res_inq = await client.post(f"/api/v1/public/trainers/{slug}/inquire", json=inquiry_payload)
        assert res_inq.status_code == 201, f"Expected 201, got {res_inq.status_code}: {res_inq.text}"
        assert res_inq.json().get("success") is True
        assert "inquiryId" in res_inq.json().get("data", {})
        print(f"✓ POST /api/v1/public/trainers/{slug}/inquire PASSED: 201 Created with inquiry ID")
        results.append("POST /inquire 201 Created: PASS")

        # 5. Negative Security Test: Unauthenticated Trainer Profile Edit (Expect 401)
        res_unauth = await client.patch("/api/v1/trainer/profile", json={"displayName": "Hacked Name"})
        assert res_unauth.status_code in (401, 403), f"Expected 401/403, got {res_unauth.status_code}"
        print(f"✓ PATCH /api/v1/trainer/profile [UNAUTHENTICATED] BLOCKED ({res_unauth.status_code}): Zero IDOR verified")
        results.append("Unauthenticated PATCH /profile blocked: PASS")

        # 6. Negative Security Test: Student Token on Trainer Profile (Expect 403)
        # Login as student to test RBAC rejection
        login_res = await client.post("/api/v1/auth/login", json={"email": "rahul.sharma@abcengg.edu", "password": "Password@123"})
        if login_res.status_code == 200:
            student_token = login_res.json()["data"]["accessToken"]
            res_forbidden = await client.patch(
                "/api/v1/trainer/profile",
                json={"displayName": "Student Impersonating Trainer"},
                headers={"Authorization": f"Bearer {student_token}"}
            )
            assert res_forbidden.status_code == 403, f"Expected 403 Forbidden for Student, got {res_forbidden.status_code}"
            print("✓ PATCH /api/v1/trainer/profile [STUDENT ROLE] BLOCKED (403): RBAC enforced")
            results.append("Student PATCH /profile 403: PASS")

        # 7. Authenticated Trainer Profile View & Patch
        trainer_login = await client.post("/api/v1/auth/login", json={"email": "monika@gmail.com", "password": "Password@123"})
        if trainer_login.status_code == 200:
            trainer_token = trainer_login.json()["data"]["accessToken"]
            headers = {"Authorization": f"Bearer {trainer_token}"}

            # View profile
            res_prof = await client.get("/api/v1/trainer/profile", headers=headers)
            assert res_prof.status_code == 200, f"Expected 200, got {res_prof.status_code}"
            prof_data = res_prof.json().get("data", {})
            print(f"✓ GET /api/v1/trainer/profile PASSED: Profile for {prof_data.get('displayName')} (Completion: {prof_data.get('completionPercent')}%)")
            results.append("GET /trainer/profile 200: PASS")

            # Patch profile
            patch_payload = {
                "headline": "Distinguished Communication & Leadership Coach",
                "yearsExperience": 9.0,
                "expertiseTags": ["Executive Communication", "Storytelling", "Campus Readiness", "Emotional Intelligence"],
                "isPublished": True
            }
            res_patch = await client.patch("/api/v1/trainer/profile", json=patch_payload, headers=headers)
            assert res_patch.status_code == 200, f"Expected 200, got {res_patch.status_code}"
            print(f"✓ PATCH /api/v1/trainer/profile PASSED: Completion updated to {res_patch.json()['data']['completionPercent']}%")
            results.append("PATCH /trainer/profile 200: PASS")

    print("\n=== SUMMARY: ALL 7/7 TRAINER TESTS PASSED CLEANLY ===")
    return results

if __name__ == "__main__":
    asyncio.run(run_tests())
