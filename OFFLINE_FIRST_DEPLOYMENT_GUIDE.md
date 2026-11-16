# OFFLINE-FIRST DEPLOYMENT GUIDE
## Winners Creek LMS / SkillSharp Enterprise Platform

**Target Environments:** Vercel (Next.js Frontend) + Render (FastAPI Backend + PostgreSQL)  
**Storage Driver:** AWS S3 (`STORAGE_DRIVER=s3`)  
**Database Migration:** `019_offline_sync_and_package_authorization.sql`

---

## 1. Zero-Downtime Deployment Sequence

The offline-first architecture requires zero destructive database schema changes and maintains complete backward compatibility with all existing online clients.

### Step 1: Backend Deployment (Render `CnC_Backend`)
1. Push branch commits to GitHub `origin/main`.
2. Render automatically initiates build and deploy for service `CnC_Backend` (`srv-dbj0lhou01pc73e5fhbg`).
3. During startup, `run_migrations()` automatically discovers and executes `apps/api/migrations/019_offline_sync_and_package_authorization.sql`.
4. Tables `offline_packages`, `sync_operations`, and `sync_conflicts` are created with `IF NOT EXISTS`.
5. The API starts up with PostgreSQL and Redis connections healthy.

### Step 2: Frontend Deployment (Vercel `cnc-lms`)
1. Vercel detects the new commit on `main`.
2. Runs `npm run build` (`next build`), compiling:
   - Web App Manifest: `/manifest.webmanifest`
   - Service Worker: `/sw.js`
   - Offline Shell: `/offline`
   - Content Manager: `/student/offline`
   - Enhanced Assessment and Course pages with IndexedDB persistence.
3. Automatically deploys to production CDN.

---

## 2. Environment Variables Verification

No new secret environment variables are required. Existing configurations are fully reused:

| Variable | Target Value | Purpose |
| :--- | :--- | :--- |
| `STORAGE_DRIVER` | `s3` | Preserves existing AWS S3 file and eBook storage. |
| `USE_POSTGRES` | `true` | Enables PostgreSQL for state, courses, and sync operations. |
| `JWT_SECRET` | *(Production Secret)* | Validates Bearer access tokens on sync endpoints. |
| `REDIS_URL` | *(Production Secret)* | Session and rate limiting cache. |

---

## 3. Verification & Health Monitoring

1. **Verify Backend Offline Endpoints:**
   ```bash
   # Check sync health and endpoints presence
   curl -I https://cnc-backend-qzmb.onrender.com/api/v1/offline/changes
   # Returns 401 Unauthorized (confirming auth guard and routing are active)
   ```
2. **Verify Frontend Service Worker & Manifest:**
   - Open Chrome DevTools $\rightarrow$ Application tab $\rightarrow$ Manifest:
     - Name: `Winners Creek LMS — SkillSharp`
     - Display: `standalone`
   - Application tab $\rightarrow$ Service Workers:
     - Status: `Activated and running` (`/sw.js`)
   - Application tab $\rightarrow$ Storage $\rightarrow$ IndexedDB:
     - Database: `SkillSharpOfflineDB` with 10 tables initialized.
3. **Simulate Offline Operation in Browser:**
   - In Chrome DevTools $\rightarrow$ Network tab $\rightarrow$ check `Offline`.
   - Reload page $\rightarrow$ Application loads from Service Worker cache.
   - Navigate to `/student/offline` $\rightarrow$ Downloaded Content Manager opens seamlessly.
   - Header shows Amber "Offline" indicator with pending outbox counter.
