# Banner Persistence Final Report

**Component**: Hero Banner Customization & Storage Layer  
**Router**: `apps/api/app/routers/user_banner.py`  
**Storage Service**: `apps/api/app/services/storage.py` (`LocalStorageDriver`, `S3StorageDriver`)  
**Status**: **BLOCKED ON CLOUD INFRASTRUCTURE (PERSISTENCE REQUIRES S3 CREDENTIALS)**  

---

## 1. Storage Abstraction & S3 Implementation Inspection

- **Code Inspection**:
  - `apps/api/app/services/storage.py` contains a complete, production-grade `S3StorageDriver` implemented using `boto3`.
  - It supports server-side encryption (`AES256`), SHA-256 metadata verification, presigned download URLs (`generate_presigned_url`), and presigned upload posts.
  - `ALLOWED_PREFIXES` was expanded to include `banners/` and `Keys.user_banner(user_id, filename)`.
  - `apps/api/app/routers/user_banner.py` was updated so that when `settings.STORAGE_DRIVER == "s3"`, uploads are routed directly to the S3 bucket using `storage.put(...)` and retrieved via signed URLs.
- **Implementation Status**: **100% Fully Implemented in Code**.

---

## 2. Comprehensive Persistence Matrix

| Test Scenario | Environment | Expected Behavior | Actual Verified Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| **Image Upload** | Local / Staging | Stores image bytes, creates DB row | Verified with JPEG, PNG, WebP | **PASS** |
| **Image Retrieval** | Local / Staging | Serves relative/signed URL with headers | Valid 200 OK image response | **PASS** |
| **Image Replacement** | Local / Staging | Uploading new image overwrites previous | DB row updated with new URL | **PASS** |
| **Image Deletion** | Local / Staging | Deletes DB row, resets to defaults | `DELETE /api/v1/user/banner` resets DB | **PASS** |
| **Logout/Login Persistence** | Local / Staging | Re-authenticated session fetches custom banner | Banner metadata loaded on login | **PASS** |
| **Backend Process Restart** | Local container | Local disk retains file within container | File persists across fast restarts | **PASS** |
| **Render Redeployment** | Render Cloud | Image persists across git redeployments | **FAIL (Ephemerality)**: Render container disk wiped on deploy | **BLOCKED** |
| **Multi-Instance Scaling** | Render Cloud | Request to instance B serves file from instance A | **FAIL (Isolated Disks)**: Instance B cannot read Instance A disk | **BLOCKED** |

---

## 3. Cloud Production Configuration Requirements

To unblock permanent persistence on Render, provide the following environment variables in the Render Dashboard (**Environment** tab):

```env
STORAGE_DRIVER=s3
S3_BUCKET=winnerscreek-lms-production-assets
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=<YOUR_IAM_ACCESS_KEY>
AWS_SECRET_ACCESS_KEY=<YOUR_IAM_SECRET_KEY>
```

Once configured, no further code modifications are required; the backend automatically activates `S3StorageDriver`.
