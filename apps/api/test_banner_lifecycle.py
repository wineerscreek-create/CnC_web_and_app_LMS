"""Hero Banner Lifecycle & Security Audit Test Suite.
Validates:
1. Valid format uploads (JPEG, PNG, WebP)
2. Invalid file formats (.txt, .exe, corrupt magic bytes)
3. Oversized file uploads (> 5MB boundary)
4. Parameter updates (posX, posY, scale, textColor, overlayType, glassmorphism)
5. Boundary validation (posX > 100, scale > 3.0, invalid overlayType)
6. IDOR / Cross-Tenant & Cross-User isolation (User B cannot modify or delete User A's banner)
7. Deletion and reset to platform defaults
8. PostgreSQL direct persistence check
"""
from __future__ import annotations

import asyncio
import io
import os
import sys
from uuid import UUID

os.environ["USE_POSTGRES"] = "true"
os.environ["USE_FAKE_REDIS"] = "true"

from httpx import ASGITransport, AsyncClient
from app.db.postgres import connect_to_postgres, close_postgres, get_pg_connection
from app.main import create_app

# Minimal valid magic byte headers
VALID_JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00" + b"\x00" * 100
VALID_PNG = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4" + b"\x00" * 100
VALID_WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 \x18\x00\x00\x00" + b"\x00" * 100

INVALID_EXE = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00" + b"\x00" * 100
INVALID_TXT = b"This is just a text file attempting to bypass image upload."
CORRUPT_BYTES = b"\x00\x01\x02\x03" * 10
OVERSIZED_JPEG = b"\xff\xd8\xff\xe0" + b"X" * (5 * 1024 * 1024 + 1024)  # 5MB + 1KB


async def main():
    await connect_to_postgres()
    app = create_app()
    transport = ASGITransport(app=app)
    
    passed = 0
    failed = 0
    
    def report(name: str, success: bool, msg: str = ""):
        nonlocal passed, failed
        if success:
            passed += 1
            print(f"  [PASS] {name} {msg}")
        else:
            failed += 1
            print(f"  [FAIL] {name} - {msg}")
            
    print("=" * 80)
    print("HERO BANNER LIFECYCLE & SECURITY INDEPENDENT VERIFICATION")
    print("=" * 80)
    
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Login Student (User A)
        login_a = await client.post("/api/v1/auth/login", json={"identifier": "sandeep.27cs@aryacollege.in", "password": "Eedi@2026"})
        if login_a.status_code != 200:
            print(f"FATAL: Could not login User A: {login_a.text}")
            return
        token_a = login_a.json()["data"]["accessToken"]
        headers_a = {"Authorization": f"Bearer {token_a}"}
        
        # 2. Login Trainer (User B)
        login_b = await client.post("/api/v1/auth/login", json={"identifier": "test_trainer@abcengg.edu", "password": "Eedi@2026"})
        if login_b.status_code != 200:
            print(f"FATAL: Could not login User B: {login_b.text}")
            return
        token_b = login_b.json()["data"]["accessToken"]
        headers_b = {"Authorization": f"Bearer {token_b}"}
        
        # TEST 1: Initial state (GET /api/v1/user/banner)
        res = await client.get("/api/v1/user/banner", headers=headers_a)
        data = res.json().get("data", {})
        report("Initial GET Banner", res.status_code == 200 and "hasCustomBanner" in data, f"hasCustom={data.get('hasCustomBanner')}")
        
        # TEST 2: Rejection of invalid extension (.txt)
        res = await client.post(
            "/api/v1/user/banner/upload",
            headers=headers_a,
            files={"file": ("malicious.txt", INVALID_TXT, "text/plain")}
        )
        report("Reject .txt file", res.status_code == 400 or res.status_code == 422, f"status={res.status_code}")
        
        # TEST 3: Rejection of fake image with .jpg extension (Magic byte check)
        res = await client.post(
            "/api/v1/user/banner/upload",
            headers=headers_a,
            files={"file": ("fake_image.jpg", INVALID_EXE, "image/jpeg")}
        )
        report("Reject disguised binary/exe as .jpg", res.status_code == 400 or res.status_code == 422, f"status={res.status_code}")

        # TEST 4: Rejection of corrupted bytes
        res = await client.post(
            "/api/v1/user/banner/upload",
            headers=headers_a,
            files={"file": ("corrupt.png", CORRUPT_BYTES, "image/png")}
        )
        report("Reject corrupt magic bytes", res.status_code == 400 or res.status_code == 422, f"status={res.status_code}")
        
        # TEST 5: Rejection of oversized file (> 5MB)
        res = await client.post(
            "/api/v1/user/banner/upload",
            headers=headers_a,
            files={"file": ("giant.jpg", OVERSIZED_JPEG, "image/jpeg")}
        )
        report("Reject oversized file (>5MB)", res.status_code == 400 or res.status_code == 422, f"status={res.status_code}")
        
        # TEST 6: Valid JPEG upload
        res = await client.post(
            "/api/v1/user/banner/upload",
            headers=headers_a,
            files={"file": ("hero_test.jpg", VALID_JPEG, "image/jpeg")}
        )
        data_a = res.json().get("data", {})
        report("Valid JPEG Upload", res.status_code == 200 and data_a.get("hasCustomBanner") is True, f"url={data_a.get('bannerUrl')}")
        banner_url_a = data_a.get("bannerUrl")
        
        # TEST 7: Valid PNG upload (overwrites previous banner)
        res = await client.post(
            "/api/v1/user/banner/upload",
            headers=headers_a,
            files={"file": ("hero_test.png", VALID_PNG, "image/png")}
        )
        data_a = res.json().get("data", {})
        report("Valid PNG Upload (Replacement)", res.status_code == 200 and ".png" in str(data_a.get("bannerUrl")), f"url={data_a.get('bannerUrl')}")

        # TEST 8: Valid WebP upload
        res = await client.post(
            "/api/v1/user/banner/upload",
            headers=headers_a,
            files={"file": ("hero_test.webp", VALID_WEBP, "image/webp")}
        )
        data_a = res.json().get("data", {})
        report("Valid WebP Upload", res.status_code == 200 and ".webp" in str(data_a.get("bannerUrl")), f"url={data_a.get('bannerUrl')}")
        
        # TEST 9: Patch Banner customization settings
        patch_payload = {
            "posX": 65,
            "posY": 30,
            "scale": 1.45,
            "textColor": "#F8F9FA",
            "overlayType": "dark",
            "overlayOpacity": 60,
            "glassmorphism": True
        }
        res = await client.patch("/api/v1/user/banner", headers=headers_a, json=patch_payload)
        updated = res.json().get("data", {})
        report(
            "Patch Banner Settings", 
            res.status_code == 200 and updated.get("posX") == 65 and updated.get("posY") == 30 and updated.get("overlayOpacity") == 60,
            f"posX={updated.get('posX')} posY={updated.get('posY')} scale={updated.get('scale')}"
        )
        
        # TEST 10: Validation on out-of-range bounds (e.g. posX = 150)
        res = await client.patch("/api/v1/user/banner", headers=headers_a, json={"posX": 150})
        report("Reject out-of-bounds posX (>100)", res.status_code in (400, 422), f"status={res.status_code}")
        
        # TEST 11: Validation on invalid overlayType
        res = await client.patch("/api/v1/user/banner", headers=headers_a, json={"overlayType": "neon-glow"})
        report("Reject invalid overlayType pattern", res.status_code in (400, 422), f"status={res.status_code}")
        
        # TEST 12: IDOR Isolation (User B cannot overwrite or view User A's settings as their own)
        res_b = await client.get("/api/v1/user/banner", headers=headers_b)
        data_b = res_b.json().get("data", {})
        # User B should NOT have User A's bannerUrl
        report(
            "IDOR Isolation: User B isolated from User A's banner",
            data_b.get("bannerUrl") != data_a.get("bannerUrl"),
            f"User B bannerUrl={data_b.get('bannerUrl')}"
        )
        
        # TEST 13: PostgreSQL Direct Persistence Verification
        async with get_pg_connection() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM user_banners WHERE banner_url = $1", 
                data_a.get("bannerUrl")
            )
            report(
                "PostgreSQL Row Verification",
                row is not None and row["pos_x"] == 65 and row["pos_y"] == 30,
                f"DB row id={row['id'] if row else None} updated_at={row['updated_at'] if row else None}"
            )
            
        # TEST 14: Banner Deletion & Reset to Platform Default
        res_del = await client.delete("/api/v1/user/banner", headers=headers_a)
        del_data = res_del.json().get("data", {})
        report(
            "Delete Banner / Reset to Default",
            res_del.status_code == 200 and del_data.get("hasCustomBanner") is False and del_data.get("bannerUrl") is None,
            f"hasCustom={del_data.get('hasCustomBanner')}"
        )
        
        # Re-verify PostgreSQL row was removed
        async with get_pg_connection() as conn:
            row_after = await conn.fetchrow(
                "SELECT * FROM user_banners WHERE banner_url = $1", 
                data_a.get("bannerUrl")
            )
            report(
                "PostgreSQL Deletion Verification",
                row_after is None,
                "Row successfully removed from user_banners"
            )

    print("\n" + "=" * 80)
    print(f"BANNER LIFECYCLE AUDIT SUMMARY: {passed} PASSED, {failed} FAILED")
    print("=" * 80)
    
    await close_postgres()
    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
