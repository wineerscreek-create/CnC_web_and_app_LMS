# Deploying to Render / Vercel

This system's whole design is a single long-running process holding all
quiz data in RAM (`backend/app/memory/store.py`), plus persistent Socket.IO
connections for live monitoring, plus background threads (the scheduler and
the report-export worker). That combination decides which platforms actually
work here -- this doc explains why, then gives copy-paste steps for the
setups that do.

## Short answer

- **Vercel cannot host the backend.** Use it only for the frontend static
  build, if at all.
- **Render can host the backend** (and, in the simplest setup, the frontend
  too) because it runs your process continuously instead of per-request.
- **Recommended: one Render Web Service** serving both the API and the
  built frontend. Simplest, no CORS to configure, matches this app's
  same-origin assumptions everywhere else in the codebase.
- **Optional: Render backend + Vercel (or a Render Static Site) frontend**,
  if you specifically want the frontend on a separate host/CDN or a faster
  independent deploy cycle. A bit more setup (two env vars, one CORS
  setting) -- covered below.

## Why Vercel can't run the backend

Vercel's functions are serverless: each request gets a fresh, short-lived
invocation with its own memory, and there's no guarantee two requests even
hit the same underlying instance. This app needs the opposite on every
count:

- `store.py` is one Python dict that must stay alive and consistent for the
  entire lifetime of a quiz (potentially hours) -- a new instance per
  request means a student who joins on invocation A doesn't exist to
  invocation B.
- Live monitoring is a real, held-open Socket.IO connection per browser tab
  -- serverless functions can't keep a connection open indefinitely the way
  this needs.
- The report-export queue (`services/report_worker.py`) and the cleanup/
  backup scheduler (`scheduler/cleanup_scheduler.py`) are background threads
  that need to keep running between requests, not spin up fresh each time.

None of this is a configuration problem -- it's the same reason `--workers 1`
matters for uvicorn (see README's "Production hardening round"), just one
level up: Vercel is effectively "many workers, and you don't even control
when they start or stop." If you want to keep using Vercel for something,
use it for the frontend only (a static React build has none of these
problems) and put the backend on Render.

## Render: recommended setup (one service, both API + frontend)

This uses the optional static-file serving already built into the backend
(`backend/app/main.py` -- activates automatically once `frontend/dist`
exists) so the whole app is one URL, one service, and zero CORS
configuration.

1. Push this repo to GitHub (Render deploys from a git repo).
2. Render dashboard -> **New** -> **Web Service** -> connect the repo.
3. **Root Directory**: leave as the repo root.
4. **Runtime**: Python 3.
5. **Build Command**:
   ```
   cd frontend && npm install && npm run build && cd ../backend && pip install -r requirements.txt
   ```
6. **Start Command**:
   ```
   cd backend && uvicorn app.main:socket_app --host 0.0.0.0 --port $PORT --workers 1
   ```
   (`$PORT` is injected by Render -- don't hardcode 8000 here. `--workers 1`
   is not optional, see above.)
7. **Environment variables** -- add these (values from
   `backend/.env.example`, don't ship the example defaults):
   - `JWT_SECRET_KEY` -- a long random string (`python -c "import secrets; print(secrets.token_urlsafe(48))"`)
   - `ENCRYPTION_KEY` -- generate one the same way; set it explicitly rather
     than letting the app auto-generate one (see the disk-persistence
     caution below for why)
   - `SUPER_ADMIN_USERNAME`, `SUPER_ADMIN_PASSWORD` -- your real admin login
   - `ENV=production`
   - `CORS_ORIGINS` -- can leave as default; same-origin here so it's not
     load-bearing, but harmless to set to your Render URL once you know it
   - Everything else in `.env.example` is optional; the defaults are fine
     to start with.
8. **Health check path**: `/api/health`.
9. **Instance plan**: pick anything **except Free** if this will host a
   real exam -- see "Free tier will lose your quiz" below. Pick a single
   instance; do **not** enable autoscaling / multiple instances (same
   reasoning as `--workers 1` -- a second instance is a second, empty copy
   of the in-memory store, and Render would load-balance real students
   across both inconsistently).

Deploy. Render gives you one URL, e.g. `https://your-quiz.onrender.com` --
that's both the admin panel and the API, open it directly.

## Render: split setup (backend + separate frontend host)

Use this if you specifically want the frontend on its own host (a Render
Static Site, or Vercel) instead of served by the backend.

### Backend -- Render Web Service

Same as above, except:
- **Root Directory**: `backend`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn app.main:socket_app --host 0.0.0.0 --port $PORT --workers 1`
- Add one more env var: **`CORS_ORIGINS`** set to your frontend's real
  origin once you have it (e.g. `https://your-quiz.vercel.app`) -- this now
  also controls Socket.IO's allowed origins (`websocket/socket_manager.py`),
  not just REST, so it has to be right or the live Monitor page and student
  quiz-taking will fail to connect from the split frontend.

### Frontend -- Render Static Site

1. Render dashboard -> **New** -> **Static Site** -> same repo.
2. **Root Directory**: `frontend`
3. **Build Command**: `npm install && npm run build`
4. **Publish Directory**: `dist`
5. **Environment variable**: `VITE_API_BASE_URL` = your backend's full
   origin, no trailing slash (e.g. `https://your-quiz-backend.onrender.com`).
   This is a *build-time* var (Vite bakes it into the JS bundle), so it must
   be set before the build runs, and you need to trigger a new build if you
   change it later.
6. Add a rewrite rule so React Router's client-side routes work on refresh:
   `/*` -> `/index.html` (Render's Static Site rewrite rules UI).

### Frontend -- Vercel, instead of a Render Static Site

1. Vercel dashboard -> **Add New** -> **Project** -> import the repo.
2. **Root Directory**: `frontend` (Vercel auto-detects Vite).
3. **Build Command**: `npm run build` (default is fine).
4. **Output Directory**: `dist` (default for Vite).
5. **Environment Variable**: `VITE_API_BASE_URL` = your Render backend's
   full origin, same as above -- set it in Vercel's Project Settings ->
   Environment Variables, then redeploy.
6. Vercel handles the SPA rewrite automatically for a Vite project -- no
   extra config needed there.
7. Set the backend's `CORS_ORIGINS` to your Vercel production domain (and
   add any preview-deployment domain you actually test against -- Vercel's
   per-PR preview URLs are unpredictable, so for real testing just use the
   production domain, or temporarily widen `CORS_ORIGINS` while testing a
   preview).

## Operational cautions specific to Render (read before a real exam)

**Free tier will lose your quiz.** Render's free Web Service plan spins
the process down after ~15 minutes of no traffic and cold-starts a fresh
one on the next request -- which, for this app, means every quiz's
in-memory data is gone the moment that happens. A quiz that's actively
being taken generates constant traffic so it likely won't spin down
*during* the exam, but anything scheduled/idle beforehand will silently
reset. Use a paid plan (Starter or above) for anything real; free tier is
fine for kicking the tyres.

**Disk is not reliably persistent across restarts/redeploys.** The
crash-recovery backup (`ENABLE_CRASH_RECOVERY_BACKUP=true`, writes to
`temp/session_<id>/backup.enc`) and the auto-generated encryption key
(`temp/.runtime_key`, only used if you don't set `ENCRYPTION_KEY`
explicitly) both live on local disk, which Render does not guarantee
survives a redeploy on a plain Web Service. Two things to do about it:

- **Always set `ENCRYPTION_KEY` explicitly** as an env var on Render rather
  than relying on auto-generation -- otherwise a wiped disk means a new
  random key next boot, which silently orphans anything that *did* survive
  in the backup file.
- If you actually want the crash-recovery backup to survive a restart, add
  a Render **persistent Disk** (small size is enough -- it's just small
  encrypted JSON snapshots) mounted at, say, `/var/data`, and set
  `TEMP_DIR=/var/data` in the environment. Without a persistent Disk,
  treat crash-recovery backup as "survives a process crash that Render
  auto-restarts without a full redeploy," not "survives everything."

**A deploy is a hard cut for whoever's live.** Rolling out a new version
kills the old instance's process (and its in-memory store) once the new
one passes its health check -- there's no draining period for the old
instance's live quizzes the way a stateless app would get. Don't redeploy
while a real exam is in progress; treat "redeploy" the same as "don't
restart the laptop mid-exam" from the local-hosting docs.

## Environment variable reference

All of these come from `backend/.env.example` -- copy the values you need
into whichever platform's environment-variable UI you're using; none of
this changes based on hosting platform except `CORS_ORIGINS` (split setups
only) and the two frontend-only build-time vars below.

| Variable | Where | Notes |
|---|---|---|
| `JWT_SECRET_KEY` | backend | required, long random string |
| `ENCRYPTION_KEY` | backend | required on Render (see disk caution above) |
| `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD` | backend | your real admin login |
| `CORS_ORIGINS` | backend | only load-bearing for a split frontend/backend deployment |
| `ENV` | backend | set to `production` |
| `VITE_API_BASE_URL` | frontend (build-time) | only for a split deployment; blank = same-origin |
| `VITE_PUBLIC_APP_URL` | frontend (build-time) | optional QR/link default, same as the Cloudflare Tunnel docs in README |

## Which one should you actually pick?

If this is for a real exam with real students: **one Render Web Service**
(the recommended setup above), paid plan, single instance. It has the
fewest moving parts, no CORS surface to misconfigure, and matches every
other same-origin assumption already baked into this codebase (Nginx setup,
local dev, Cloudflare Tunnel all work the same way). Reach for the split
setup only if you have a concrete reason to deploy the frontend
independently -- it's fully supported now, just more to keep in sync.
