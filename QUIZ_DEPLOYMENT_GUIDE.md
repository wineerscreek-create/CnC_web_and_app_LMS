# QUIZ PLATFORM & LMS INTEGRATED DEPLOYMENT GUIDE

**Target System:** Winners Creek LMS (`CnC_web_and_app_LMS`)  
**Components:** FastAPI Backend (`apps/api`), Next.js Web Frontend (`apps/web`), PostgreSQL (`cnc`), and Native WebSockets  
**Production Hosting:** Vercel (Frontend) + Render (Backend)  
**Date:** November 2026  

---

## 1. ARCHITECTURE & SERVICE TOPOLOGY

The integration uses a unified runtime architecture without external Node.js daemons or Cloudflare edge dependencies:

```
┌─────────────────────────────────┐           ┌─────────────────────────────────┐
│        VERCEL (Frontend)        │           │        RENDER (Backend)         │
│                                 │   REST    │                                 │
│  apps/web (Next.js 14)          │ ────────> │  apps/api (FastAPI + WebSockets)│
│  ├── Student Engine & Camera    │    WSS    │  ├── ScopeContext & JWT Auth    │
│  ├── Supervisor Monitor Grid    │ <═══════> │  ├── AssessmentHub Relay Hub    │
│  └── ExcelJS Photo Export       │           │  └── Answer Evaluator & EEDI    │
└─────────────────────────────────┘           └────────────────▲────────────────┘
                                                               │
                                                               │ (Asyncpg)
                                                               ▼
                                              ┌─────────────────────────────────┐
                                              │      POSTGRESQL DATABASE        │
                                              │  ├── quizzes                    │
                                              │  ├── quiz_batch_assignments     │
                                              │  ├── quiz_attempts              │
                                              │  └── quiz_eedi_results          │
                                              └─────────────────────────────────┘
```

---

## 2. PRODUCTION ENVIRONMENT CONFIGURATION

### 2.1 Backend (`apps/api`) Environment Variables (Render)
| Variable | Description | Example / Value |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/cnc` |
| `USE_POSTGRES` | Enables primary relational mode | `true` |
| `JWT_SECRET` | Secret key used to sign access, launch, and monitor tokens | `<32+_char_secret>` |
| `JWT_ALGORITHM` | Token signing algorithm | `HS256` |
| `ACCESS_TOKEN_TTL_MINUTES` | Default token time-to-live | `60` |
| `CORS_ORIGINS` | Permitted frontend origins | `["https://cnc-lms.vercel.app", "http://localhost:3000"]` |

### 2.2 Frontend (`apps/web`) Environment Variables (Vercel)
| Variable | Description | Example / Value |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | Base API URL pointing to the FastAPI backend | `https://cnc-backend-qzmb.onrender.com` |

*Note on WebSockets on Vercel:* The frontend automatically derives the WebSocket URL protocol (`ws:` or `wss:`) and host from `NEXT_PUBLIC_API_URL`, connecting directly to Render's WebSocket port. Render natively supports persistent WebSocket connections with zero additional config.

---

## 3. LOCAL DEVELOPMENT INSTRUCTIONS

### 3.1 Starting Backend (`apps/api`)
```powershell
cd apps/api
# Ensure virtual environment is activated
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
- API Health Check: `http://localhost:8000/api/v1/health`
- WebSocket Route: `ws://localhost:8000/api/v1/assessments/{quiz_id}/ws`

### 3.2 Starting Frontend (`apps/web`)
```powershell
cd apps/web
npm run dev
```
- Web Application: `http://localhost:3000`
- Student Assessments: `http://localhost:3000/student/assessments`
- Trainer Assessments: `http://localhost:3000/trainer/assessments`
- Supervisor Monitor: `http://localhost:3000/trainer/assessments/{quiz_id}/monitor`

---

## 4. PRE-DEPLOYMENT VERIFICATION CHECKLIST

Before triggering automatic deployment on Render/Vercel:

- [x] Run TypeScript verification: `cd apps/web; npm run typecheck` (Exits with code 0).
- [x] Run Vitest frontend tests: `cd apps/web; npm run test` (All 83 tests pass).
- [x] Run Pytest backend integration tests: `pytest apps/api/tests/test_quiz_proctoring_integration.py` (All 4 tests pass).
- [x] Verify Next.js production build: `cd apps/web; npm run build` (All 92 routes generate successfully).
- [x] Confirm no secrets, tokens, or private credentials are in Git.
- [x] Confirm no answer keys are returned in student question payloads.
- [x] Confirm supervisor live monitoring and Excel photo export are operational.


---

## 5. ACTUAL LOCAL RUNTIME VERIFICATION (VERIFIED DEPLOYMENT RUNBOOK)

**Verification Date:** November 2026  
**Status:** Both servers verified and running simultaneously on local host  

### 5.1 Verified Startup Commands
To start both servers locally in background or terminal sessions:

```powershell
# 1. FastAPI Backend (from workspace root)
python -m uvicorn app.main:app --app-dir apps/api --host 127.0.0.1 --port 8000

# 2. Next.js Frontend (from workspace root)
npm --prefix apps/web run start
```

### 5.2 Local URLs & Health Endpoints
- **FastAPI API Root:** `http://127.0.0.1:8000`
- **FastAPI Health:** `http://127.0.0.1:8000/health` (HTTP 200 `{"status": "ok", "app": "Winners Creek API"}`)
- **FastAPI Readiness:** `http://127.0.0.1:8000/health/ready` (HTTP 200 `{"status": "ok"}`)
- **FastAPI WebSocket:** `ws://127.0.0.1:8000/api/v1/assessments/{quiz_id}/ws`
- **Next.js Web Portal:** `http://localhost:3000`
- **Next.js Login Page:** `http://localhost:3000/login`
- **Student Assessment Attempt:** `http://localhost:3000/student/assessments/{quiz_id}`
- **Trainer Live Monitor Dashboard:** `http://localhost:3000/trainer/assessments/{quiz_id}/monitor`

### 5.3 Multi-Student Simulation Summary
- **Candidates Simulated:** 3 concurrent students (`e2e_student_1`, `e2e_student_2`, `e2e_student_3`)
- **Simultaneous WebSocket Sessions:** 3 student sockets + 1 supervisor monitor socket
- **Snapshot Streaming:** Transmitted 640x480 JPEG base64 frames under rate-limiting ceiling (3.8s, <= 260KB)
- **Scoring Results:** Student 1 (100% / 7.0 marks), Student 2 (2.0 marks), Student 3 (5.0 marks)
- **Results Export:** ExcelJS `.xlsx` workbook generation validated with `Results` and `Camera Snapshots` sheets embedding up to 10 reservoir-sampled frames per candidate.

### 5.4 Production Deployment Readiness
- **Database Migrations:** Zero breaking schema modifications required. `quizzes`, `quiz_batch_assignments`, `quiz_attempts`, and `quiz_eedi_results` fully compatible.
- **Rollout Step 1 (Backend):** Push to `main` branch -> Render automatically rebuilds FastAPI backend.
- **Rollout Step 2 (Frontend):** Push to `main` branch -> Vercel automatically compiles and deploys Next.js frontend with `exceljs` bundled.
- **Known Limitations:**
  - WebSocket hub runs in-process on FastAPI; suitable for single-instance or sticky-session multi-tenant environments.
  - Camera snapshots are held in memory during the session and not persisted to permanent object storage, ensuring maximum privacy compliance.
