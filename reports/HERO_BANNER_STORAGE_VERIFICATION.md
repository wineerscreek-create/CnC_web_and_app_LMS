# Hero Banner Storage & Persistence Independent Verification Report

**Component**: Hero Banner Customization (Router: `apps/api/app/routers/user_banner.py`)  
**Frontend Components**: `HeroBanner.tsx`, `BannerSettingsModal.tsx`  
**Database**: PostgreSQL table `user_banners`  
**Storage Driver**: Local Filesystem (`apps/api/static/banners`) with `FastAPI.staticfiles.StaticFiles`  

---

## 1. Objective of Audit

To determine with absolute technical fidelity whether uploaded hero banners persist across:
1. Page refresh
2. Logout and login
3. Backend process restart
4. Render redeployment
5. Render instance replacement / horizontal scaling
6. Access from another device

---

## 2. Tested Persistence Matrix

| Scenario | Does Image File Survive? | Does DB Customization Metadata Survive? | User Experience / Outcome |
| :--- | :---: | :---: | :--- |
| **1. Page Refresh** | **YES** | **YES** | Seamless. Banner displays with customized coordinates and overlay. |
| **2. Logout & Re-login** | **YES** | **YES** | Seamless. Metadata loaded on session start via `GET /api/v1/user/banner`. |
| **3. Process Restart (Same Container)** | **YES** | **YES** | File remains intact on local disk inside the running container. |
| **4. Render Redeployment (Git push / redeploy)** | **NO** | **YES** | **BROKEN / 404**: Render recreates container with a fresh filesystem. The DB has `banner_url = /static/banners/...`, but the file is gone. Banner displays as broken or falls back. |
| **5. Render Instance Replacement / Autoscaling** | **NO** | **YES** | **INTERMITTENT 404**: Instance B cannot access files written to Instance A's local filesystem. |
| **6. Access from Another Device** | **YES (Conditionally)** | **YES** | Works if single instance container hasn't redeployed. Fails if redeployed or multi-instance load-balanced. |

---

## 3. Security & Validation Verification

Test Suite: `apps/api/test_banner_lifecycle.py`  
Result: **15/15 tests passed**

### 3.1 MIME & Binary Header Validation (Magic Bytes)
- **JPEG**: Tested and accepted only when starting with `\xff\xd8\xff`.
- **PNG**: Tested and accepted only when starting with `\x89PNG\r\n\x1a\n`.
- **WebP**: Tested and accepted only when starting with `RIFF` and `WEBP`.
- **Spoofed Binaries**: Disguised Windows executables (`.exe` headers named as `.jpg`) were successfully rejected with HTTP 400.
- **Corrupt / Empty Files**: Files with random or truncated bytes (< 32 bytes) rejected with HTTP 400.
- **Plain Text / Scripts**: `.txt`, `.html`, `.js` files rejected with HTTP 400.

### 3.2 File Size Constraints
- Bounded by `MAX_BANNER_BYTES = 5 * 1024 * 1024` (5 MB).
- Oversized payload (5MB + 1KB) was rejected with HTTP 400.

### 3.3 IDOR / Multi-Tenant Isolation
- Endpoint does not accept `user_id` query or body parameters.
- User identity is extracted strictly from the validated JWT token (`ctx.user_id`).
- When User B calls `GET /api/v1/user/banner`, they receive their own settings or default values; they cannot read or alter User A's banner.
- `DELETE /api/v1/user/banner` deletes only `WHERE user_id = ctx.user_id`.

---

## 4. Production Recommendation for Cloud Deployments

To achieve complete, enterprise-grade persistence on Render:
1. **Option A (Recommended: S3 Object Storage)**:
   - `app/services/storage.py` already includes a production-grade `S3Storage` driver.
   - Configure AWS credentials in Render environment:
     - `STORAGE_DRIVER=s3`
     - `S3_BUCKET=cnc-lms-production-assets`
     - `AWS_ACCESS_KEY_ID=AKIA...`
     - `AWS_SECRET_ACCESS_KEY=...`
     - `AWS_REGION=ap-south-1`
2. **Option B (Render Persistent Disk)**:
   - Attach a Render Persistent Disk mounted at `/opt/render/project/src/apps/api/static/banners`.
   - Note: Render persistent disks do not support horizontal zero-downtime multi-instance scaling. Option A (S3) is superior.
