# MANUAL ACTIONS REQUIRED FOR PRODUCTION RELEASE

**Target Platform**: Winners Creek LMS  
**Date**: November 6, 2026  
**Status**: Action Required by DevOps / Platform Administrator  

---

## 1. OVERVIEW

All code-level defects, multi-tenant security vulnerabilities, enum mismatches, and data integrity checks have been fully resolved in the codebase and verified locally.

Because production deployment environments (Render, Vercel, and managed cloud PostgreSQL) enforce strict VPC boundaries and require provider console authentication, the following operational tasks require manual action or confirmation.

---

## 2. REQUIRED MANUAL ACTIONS

### Action 1: Verify Render Backend Deployed Commit SHA
- **Target Service**: `cnc-backend-qzmb` (`https://cnc-backend-qzmb.onrender.com/`)
- **Objective**: Confirm that Render has built and deployed the latest commit on `main`.
- **Steps**:
  1. Log in to the [Render Dashboard](https://dashboard.render.com/).
  2. Navigate to Web Services $\rightarrow$ **`cnc-backend-qzmb`**.
  3. Under the **Events** or **Deploys** tab, check the latest deployment status.
  4. Verify that the deployed Git Commit SHA matches the latest commit pushed to `origin/main`.
  5. If the deployment has not triggered automatically, click **Manual Deploy** $\rightarrow$ **Deploy latest commit**.
  6. Monitor the deployment logs to ensure FastAPI starts cleanly with `Application startup complete`.

---

### Action 2: Verify Production Database Migrations 009 & 010
- **Target Database**: Render PostgreSQL instance (`cnc`)
- **Objective**: Ensure schema migrations `009` (Super Admin Control Center tables) and `010` (Course visibility modes and purge safety columns) are applied.
- **Steps**:
  1. In the Render Dashboard, open the **Shell** tab for `cnc-backend-qzmb` or connect via `psql`.
  2. Verify migration status by executing:
     ```sql
     -- Check migration 009 artifacts
     SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'course_deletion_jobs');
     SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'historical_learning_snapshots');
     SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ebooks');

     -- Check migration 010 artifacts
     SELECT column_name FROM information_schema.columns 
     WHERE table_name = 'courses' AND column_name IN ('visibility_mode', 'allowed_institution_ids', 'allowed_campus_names', 'allowed_branch_names');
     ```
  3. If any tables or columns are missing, execute the migrations via the shell:
     ```bash
     python -m app.db.migrate  # or run 009 and 010 SQL scripts directly
     ```

---

### Action 3: Review Render PostgreSQL External Access Control
- **Target**: Cloud PostgreSQL Server
- **Objective**: Allow secure out-of-band database integrity inspections or CI/CD verification pipelines.
- **Steps**:
  1. In the Render Dashboard, go to your PostgreSQL database settings.
  2. Under **Access Control** / **IP Allow List**, check whether external client IPs are authorized.
  3. If external access is required for DBA administration, add your static administrative IP.
  4. *Note*: Internal VPC connections between `cnc-backend-qzmb` and the database do not require public IP authorization.

---

### Action 4: Verify Vercel Frontend Deployment
- **Target Service**: `https://cnc-lms.vercel.app/`
- **Objective**: Confirm Vercel has built and deployed the production Next.js frontend without cache stale issues.
- **Steps**:
  1. Log in to the [Vercel Dashboard](https://vercel.com/).
  2. Navigate to the **`cnc-lms`** project.
  3. In the **Deployments** tab, confirm that the latest deployment is in `Ready` status and linked to the latest commit on `main`.
  4. Open `https://cnc-lms.vercel.app/student/courses` in an incognito window and verify that the page loads correctly and respects visibility filters.

---

### Action 5: Frontend Dependency Security Policy (npm audit)
- **Component**: `apps/web/package.json`
- **Context**: `npm audit` reports 20 vulnerabilities in transitive dependencies (primarily tied to development tooling and Next.js internal sub-dependencies).
- **CRITICAL WARNING**:
  **DO NOT RUN `npm audit fix --force`**.
  Running `--force` will downgrade Next.js from version 15 to version 14 or lower, breaking the App Router architecture, server actions, and TypeScript interfaces.
- **Recommended Action**:
  - Transitive vulnerabilities should be resolved incrementally through targeted package overrides or minor upstream patches when released by Next.js maintainers.

---

## 3. CHECKLIST FOR PRODUCTION SIGN-OFF

- [ ] Render deployed commit SHA confirmed
- [ ] Render startup logs verified with 0 errors
- [ ] Database migrations 009 & 010 confirmed in production schema
- [ ] Vercel deployment status confirmed as Ready
- [ ] Live smoke test completed on Super Admin Control Center (`/super-admin/colleges`)
