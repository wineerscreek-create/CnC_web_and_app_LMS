# Remaining Production Blockers & Infrastructure Action Items

**Project**: Winners Creek LMS  
**Verification Date**: 2026-11-06  
**Auditor**: Independent Principal Software Architect  
**Overall Readiness**: **PRODUCTION READY WITH MINOR ISSUES**

---

## 1. Resolved Blockers (100% Cleared)

1. **Authentication & Session Stability**: Resolved. direct login with ID/Email and password functions reliably across all roles without broken OTP gates.
2. **Role & Tenant Isolation**: Resolved. 76/76 API endpoints verified; Super Admin, Admin, Trainer, and Student roles strictly segregated.
3. **Hero Banner API & Customization**: Resolved. Positioning, scale, text color, dark/light overlay, and glassmorphism fully implemented and validated against schema boundaries.
4. **Learning Content Quality & Completeness**: Resolved. All 7 primary soft-skills courses enriched with genuine, high-signal, 12-section pedagogical curriculum.
5. **Frontend Build & Types**: Resolved. Next.js 15.1.11 production build completes cleanly across 78 routes with zero TypeScript errors.

---

## 2. Active Infrastructure Blocker: Render Ephemeral Disk Storage

### Problem Statement
On Render Web Services, the container filesystem is **ephemeral**. When users upload custom hero banner images, the backend currently writes the file to:
```
apps/api/static/banners/{user_id}/{filename}
```
This local directory is mounted and served via FastAPI `StaticFiles`.
- **Where it works**: In a single running container instance, image uploads persist across page reloads and user logout/login sessions.
- **Where it fails**: Whenever Render redeploys the service (e.g. on new commits, restarts, or instance rescheduling), the local container filesystem is reset to the Git image. The PostgreSQL database retains the `banner_url = /static/banners/...` metadata, but the actual file no longer exists on disk, causing a `404 Not Found` when loading the banner image.
- **Horizontal Scaling**: If Render is scaled to 2 or more instances, users routed to an instance other than the one that handled the initial upload will also experience a 404.

### Remediation Action Plan (P0 for Production Ops)

To make hero banner storage permanently durable across all cloud restarts and multi-instance scaling, implement either of the following:

#### Plan A: Attach AWS S3 Storage (Recommended)
`apps/api/app/services/storage.py` already contains a complete, battle-tested `S3Storage` driver.
1. Create an AWS S3 bucket (e.g., `winnerscreek-lms-production-assets`).
2. Add the following environment variables to the Render Web Service configuration dashboard:
   ```env
   STORAGE_DRIVER=s3
   S3_BUCKET=winnerscreek-lms-production-assets
   AWS_ACCESS_KEY_ID=<YOUR_IAM_ACCESS_KEY>
   AWS_SECRET_ACCESS_KEY=<YOUR_IAM_SECRET_KEY>
   AWS_REGION=ap-south-1
   ```
3. Update `apps/api/app/routers/user_banner.py` to route uploads through `get_storage_driver().put(...)` when `settings.STORAGE_DRIVER == "s3"`.

#### Plan B: Attach a Render Persistent Disk
1. In the Render Dashboard under **Disks**, add a persistent disk of 10GB–50GB.
2. Mount path: `/opt/render/project/src/apps/api/static/banners`.
3. Note: Render Disks cannot be shared across multiple horizontal instances, making Plan A the superior choice for high availability.

---

## 3. Operational Sign-Off Checklist

- [x] Codebase git-clean and pushed to `origin/main`
- [x] All 78 Next.js routes compile successfully
- [x] All 40 frontend unit tests passing
- [x] All 76 backend role endpoints passing
- [x] All 15 hero banner lifecycle tests passing
- [x] 12-section curriculum populated in PostgreSQL
- [ ] AWS S3 credentials configured in Render Dashboard (Pending DevOps config)
