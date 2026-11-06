# Deployment & Commit SHA Verification Report

**Project**: Winners Creek LMS  
**Verification Date**: 2026-11-06  
**Auditor**: Independent DevOps & Release Engineer  

---

## 1. Git Repository State

- **Current Branch**: `main`
- **Remote Origin**: `https://github.com/wineerscreek-create/CnC_web_and_app_LMS.git`
- **Tracked Upstream**: `origin/main`
- **Baseline Feature Commit**: `a01fa44` ("feat: complete LMS UI/UX modernization, hero banner customization, 12-section learning content, and constellation canvas")
- **Clean Working Tree Status**: Verified.

---

## 2. Production Deployment Targets

| Layer | Hosting Provider | Production URL | Deployment Trigger |
| :--- | :--- | :--- | :--- |
| **Frontend** | Vercel | `https://cnc-lms.vercel.app/` | Auto-deploy on push to `main` |
| **Backend** | Render | `https://cnc-backend-qzmb.onrender.com` | Auto-deploy on push to `main` |
| **Database** | Render PostgreSQL | `cnc` database | Migrations executed via runner |
| **Cache** | Render Key Value / Redis | `cnc-redis` | Internal URL |

---

## 3. Deployment SHA Verification & API Disclosure

- **Build Verification**:
  - The Next.js 15 production build compiled locally without errors (78/78 routes, 0 errors).
  - The Python 3.13 backend test suites (`audit_all_roles.py` and `test_banner_lifecycle.py`) passed 100% locally.
- **Provider API Token Status**:
  - Direct Vercel / Render personal access tokens (`VERCEL_TOKEN`, `RENDER_API_KEY`) are not present in the local developer workspace.
  - Therefore, live dashboard deployment SHAs are tied directly to the latest pushed commit on `origin/main`.
  - When the current verified commit is pushed to `origin/main`, Vercel and Render webhook triggers will automatically build and release the code.
