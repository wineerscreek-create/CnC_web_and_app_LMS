"""Comprehensive audit of all role endpoints in Winners Creek LMS."""
from __future__ import annotations

import asyncio
import os
import sys

os.environ["USE_POSTGRES"] = "true"
os.environ["USE_FAKE_REDIS"] = "true"

from httpx import ASGITransport, AsyncClient
from app.db.postgres import connect_to_postgres, close_postgres
from app.main import create_app

ROLES_USERS = {
    "SUPER_ADMIN": ("superadmin@eedilms.app", "Eedi@2026"),
    "ADMIN": ("test_admin@abcengg.edu", "Eedi@2026"),
    "TRAINER": ("test_trainer@abcengg.edu", "Eedi@2026"),
    "STUDENT": ("sandeep.27cs@aryacollege.in", "Eedi@2026"),
}

ENDPOINTS_BY_ROLE = {
    "SUPER_ADMIN": [
        "/api/v1/super-admin/dashboard",
        "/api/v1/super-admin/colleges",
        "/api/v1/super-admin/courses",
        "/api/v1/super-admin/users",
        "/api/v1/super-admin/payments",
        "/api/v1/super-admin/payments/verification-queue",
        "/api/v1/super-admin/ebooks/requests",
        "/api/v1/super-admin/ebooks/reports",
        "/api/v1/super-admin/games",
        "/api/v1/super-admin/system",
        "/api/v1/user/banner",
        "/api/v1/auth/me",
        "/api/v1/home/courses",
        "/api/v1/home/announcements",
        "/api/v1/home/institutions",
    ],
    "ADMIN": [
        "/api/v1/admin/dashboard",
        "/api/v1/admin/departments",
        "/api/v1/admin/batches",
        "/api/v1/admin/trainers",
        "/api/v1/admin/users",
        "/api/v1/admin/payments",
        "/api/v1/admin/payments/summary",
        "/api/v1/admin/reports",
        "/api/v1/admin/reports/catalogue",
        "/api/v1/admin/games",
        "/api/v1/admin/system-health",
        "/api/v1/admin/ai-usage",
        "/api/v1/admin/import/jobs",
        "/api/v1/admin/semesters",
        "/api/v1/admin/training-modules",
        "/api/v1/user/banner",
        "/api/v1/auth/me",
    ],
    "TRAINER": [
        "/api/v1/trainer/dashboard",
        "/api/v1/trainer/batches",
        "/api/v1/trainer/sessions",
        "/api/v1/trainer/assignments",
        "/api/v1/trainer/course-progress",
        "/api/v1/trainer/evaluations",
        "/api/v1/trainer/evaluations/parameters",
        "/api/v1/trainer/alerts",
        "/api/v1/trainer/reports",
        "/api/v1/trainer/students",
        "/api/v1/trainer/chat/conversations",
        "/api/v1/trainer/chat/students",
        "/api/v1/trainer/courses",
        "/api/v1/trainer/ebooks",
        "/api/v1/trainer/games",
        "/api/v1/trainer/profile",
        "/api/v1/trainer/training-modules",
        "/api/v1/user/banner",
        "/api/v1/auth/me",
    ],
    "STUDENT": [
        "/api/v1/student/dashboard",
        "/api/v1/student/courses",
        "/api/v1/student/learning-path",
        "/api/v1/student/progress",
        "/api/v1/student/placement-goal",
        "/api/v1/student/profile",
        "/api/v1/student/achievements",
        "/api/v1/student/assessments",
        "/api/v1/student/assignments",
        "/api/v1/student/chat/conversations",
        "/api/v1/student/chat/mentors",
        "/api/v1/student/ebooks",
        "/api/v1/student/ebooks/my-uploads",
        "/api/v1/student/games",
        "/api/v1/student/payments",
        "/api/v1/student/practice/modes",
        "/api/v1/student/practice/sessions",
        "/api/v1/student/resume/analysis",
        "/api/v1/student/settings",
        "/api/v1/student/trials",
        "/api/v1/student/recommendations/courses",
        "/api/v1/live-classes/my",
        "/api/v1/live-classes/recordings/my",
        "/api/v1/user/banner",
        "/api/v1/auth/me",
    ],
}


async def main():
    await connect_to_postgres()
    app = create_app()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        print("=" * 80)
        print("WINNERS CREEK LMS - ENDPOINT AUDIT ACROSS ROLES")
        print("=" * 80)

        all_results = []

        for role, (email, password) in ROLES_USERS.items():
            print(f"\n--- Testing Role: {role} ({email}) ---")
            login_res = await client.post(
                "/api/v1/auth/login",
                json={"identifier": email, "password": password},
            )
            if login_res.status_code != 200:
                print(f"FAILED TO LOGIN as {role}: status {login_res.status_code}, response: {login_res.text}")
                continue

            token = login_res.json()["data"]["accessToken"]
            headers = {"Authorization": f"Bearer {token}"}

            endpoints = ENDPOINTS_BY_ROLE.get(role, [])
            for ep in endpoints:
                try:
                    res = await client.get(ep, headers=headers)
                    body = res.json() if res.headers.get("content-type", "").startswith("application/json") else res.text[:200]
                    success = res.status_code in (200, 201)
                    if not success:
                        err_code = body.get("error", {}).get("code") if isinstance(body, dict) else "NON_JSON"
                        err_msg = body.get("error", {}).get("message") if isinstance(body, dict) else str(body)
                        print(f"  [FAIL {res.status_code}] {ep} -> {err_code}: {err_msg}")
                    else:
                        print(f"  [OK   {res.status_code}] {ep}")
                    all_results.append((role, ep, res.status_code, success, body))
                except Exception as exc:
                    print(f"  [EXC     ] {ep} -> {exc}")
                    all_results.append((role, ep, 500, False, str(exc)))

    await close_postgres()

    print("\n" + "=" * 80)
    print("AUDIT SUMMARY:")
    print("=" * 80)
    total = len(all_results)
    passed = sum(1 for r in all_results if r[3])
    failed = total - passed
    print(f"Total endpoints tested: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")

    if failed > 0:
        print("\nFAILURES REQUIRING FIXES:")
        for role, ep, status, ok, body in all_results:
            if not ok:
                print(f"[{role}] {status} {ep} => {body}")


if __name__ == "__main__":
    asyncio.run(main())
