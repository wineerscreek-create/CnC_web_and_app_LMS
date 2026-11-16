# Secure Online Quiz System

A RAM-only, real-time online quiz platform: FastAPI + Socket.IO backend,
React 19 + Vite + Tailwind frontend. No MySQL/MongoDB/PostgreSQL/Firebase —
all quiz state lives in-process memory and is wiped when a quiz ends.

Implemented in the phase order recommended for this kind of system:

1. Authentication (Admin + Student, JWT, one-device-per-student)
2. Quiz creation + CSV question import with validation
3. Quiz engine (server-authoritative timer, palette, autosave, submission, scoring)
4. Live monitoring over WebSockets (Socket.IO)
5. Anti-cheat (fullscreen, camera, tab-switch, right-click/copy/paste, devtools heuristic, back-button, refresh guard)
6. Results + export (Excel / CSV / PDF) + question analysis / topper list
7. AI-proctoring risk scoring (warning-based baseline, pluggable extension point) + analytics

## Project layout

```
quiz-system/
  backend/         FastAPI app (app/main.py is the entrypoint)
  frontend/        React + Vite + Tailwind app
  config/          Nginx + systemd templates for a real VPS deployment
  uploads/         scratch space for in-flight CSV uploads (nothing persists here)
  exports/         generated Excel/CSV/PDF result files (admin downloads)
  temp/, logs/     runtime scratch + rotating audit log
  scripts/         sample_quiz.csv + Locust load-test script
  start.bat        one-click local launcher (Windows)
  start.sh         one-click local launcher (Mac/Linux)
  start-tunnel.bat one-click launcher + public Cloudflare Tunnel (Windows)
  DEPLOYMENT.md    Render/Vercel deployment guide
```

## Running it

### One-click local launch

If you just want it running with minimal fuss (first run installs
dependencies automatically):

- **Windows**: double-click `start.bat` (or run it from a terminal).
- **Mac/Linux**: `chmod +x start.sh && ./start.sh`

Both scripts create the backend virtualenv, install Python + npm
dependencies on first run only, copy `.env.example` → `.env` if missing, then
start the backend (`--workers 1` -- see "Production hardening round" below
for why) and the frontend dev server. Re-run any time; it skips install
steps that are already done. This is for local dev / a quick demo on one
machine -- for a real always-on VPS deployment (Nginx + systemd instead of
these scripts), see `config/` and the "Production hardening round" section
below, or for a managed platform (Render/Vercel) instead of your own VPS,
see **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

**Windows + students on another network right now**: `start-tunnel.bat`
does everything `start.bat` does, then also starts a Cloudflare quick
tunnel and prints/copies the public `https://....trycloudflare.com` URL for
you automatically (requires `cloudflared` on PATH -- the script tells you
the install command if it's missing). See "Exposing it publicly with
Cloudflare Tunnel" below for what that URL is and how the QR/link
generation uses it.

### Backend (manual)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate   # or your preferred venv tool
pip install -r requirements.txt
cp .env.example .env        # edit JWT_SECRET_KEY and SUPER_ADMIN_PASSWORD before real use
uvicorn app.main:socket_app --reload --port 8000
```

`app.main:socket_app` (not `app.main:app`) is what you run — it wraps the
FastAPI app together with the Socket.IO server so REST and WebSocket traffic
share one process. A super-admin account is auto-created on first boot from
`SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD` in `.env`.

### Frontend (manual)

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` and `/socket.io` to `http://localhost:8000` (see
`vite.config.js`), so just open `http://localhost:5173`.

### Try it end-to-end

1. Go to `http://localhost:5173/` (or `/admin/login` directly), sign in with
   your super-admin credentials. The bare site URL always goes to admin
   login -- see "Where the QR/link actually go" below.
2. Create a quiz, then upload `scripts/sample_quiz.csv` as the question bank.
3. Click **Schedule**, then **Start**, then **Share** to get the quiz's QR/link.
4. Open that link (or `http://localhost:5173/join` and type the code shown
   on the dashboard) in another tab/browser, join with any name/roll number.
5. Watch the admin **Monitor** page update live as you answer questions,
   trigger warnings (switch tabs, right-click), and submit.
6. End the quiz from the dashboard, then check **Results** → Results / Analytics / Proctoring tabs and export.

### Where the QR/link actually go

- The bare site URL (`/`, no query string) always goes to **admin login** --
  that's what an admin gets when they open the tunnel/site URL themselves,
  which is the common case right after starting it.
- Each quiz's QR code / share link (from the **Share** button on the
  dashboard) points at `/join?code=<QUIZ_CODE>` -- a student who scans/opens
  it lands directly on the join form with the code already filled in, no
  admin login in the way.
- `/join` on its own (no code) is the manual entry form, for a student
  typing a code themselves without a link -- linked from the admin login
  page too, in case someone lands there by mistake.

See `frontend/src/pages/RootGate.jsx` if you want to change this routing.

## Exposing it publicly with Cloudflare Tunnel

Students on a different network (not your Wi-Fi/LAN) need a public URL. The
simplest way without deploying anywhere is `cloudflared`, tunneling straight
to your local Vite dev server (which already proxies `/api` and
`/socket.io` to your local backend — see `vite.config.js`, `host: true` +
`allowedHosts: true` are already set for this).

### Quick tunnel (no account, no domain, URL changes every run)

```bash
# install (pick your OS)
brew install cloudflare/cloudflare/cloudflared      # macOS
winget install --id Cloudflare.cloudflared           # Windows
# Linux: https://pkg.cloudflare.com/ or download the binary directly

# with backend (uvicorn) and frontend (npm run dev) already running:
cloudflared tunnel --url http://localhost:5173
```

This prints a URL like `https://random-two-words.trycloudflare.com`. Opening
that bare URL goes straight to admin login (see "Where the QR/link actually
go" above) -- work from there. Two ways to make QR/links match it:

- Open the **admin panel through that same URL** (e.g.
  `https://random-two-words.trycloudflare.com/admin/login`) instead of
  localhost — every QR/link generated by the Share dialog will then
  automatically match it (`window.location.origin` fallback in
  `utils/publicUrl.js`).
- Or keep working from `localhost:5173` and just paste that URL once into
  the **Public Base URL** field inside any quiz's Share dialog — it's saved
  in your browser (localStorage) and reused for every quiz until you change
  it. This is the easier option if you don't want to keep re-navigating.

Remember: a quick tunnel's URL is random and changes every time you restart
`cloudflared`, so you'll need to update the Public Base URL (or re-share)
after a restart.

### Named tunnel (persistent URL, needs a domain on Cloudflare)

```bash
cloudflared tunnel login
cloudflared tunnel create quiz-system
cloudflared tunnel route dns quiz-system quiz.yourdomain.com
```

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: quiz-system
credentials-file: /path/to/<tunnel-id>.json
ingress:
  - hostname: quiz.yourdomain.com
    service: http://localhost:5173
  - service: http_status:404
```

```bash
cloudflared tunnel run quiz-system
```

`https://quiz.yourdomain.com` now stays the same across restarts — set it
once as `VITE_PUBLIC_APP_URL` in `frontend/.env` (see `.env.example`) so
every QR/link uses it by default, no manual pasting needed.

### If you later serve the frontend separately from the backend

The dev-server-proxy setup above means the browser only ever talks to one
origin, so CORS never comes into play. If you move to a real deployment
(built frontend on one domain, FastAPI on another — matching the
`Cloudflare → Nginx → FastAPI` diagram earlier in this doc), add every
frontend origin that will call the API to `CORS_ORIGINS` in `backend/.env`
(comma-separated), or requests will be rejected by the browser.

## Report engine + zero data retention

This is the app's headline feature: **Create Quiz → Live → Students Attempt
→ Auto Evaluation → Generate Report → Admin Downloads → Server Deletes
Everything.**

From a quiz's Results page, **"Download Full Report (ZIP)"** builds
`Quiz_Report_<name>_<code>.zip` on the fly (`backend/app/services/export_service.py
→ generate_full_report_zip`) containing:

- `Result.xlsx` / `Result.csv` — rank, name, roll, marks, correct/wrong/skipped, pass/fail
- `QuestionAnalysis.xlsx` — per-question correct/wrong/skipped %, difficulty
- `StudentReport.xlsx` — every student's answer to every question, with the correct answer alongside it (audit trail)
- `Leaderboard.pdf` — top 10
- `Summary.pdf` — averages, highest/lowest score, hardest/easiest question, pass/fail counts
- `Logs.txt` — every logged action for this quiz (joins, warnings, submits, admin actions)

**Where it lives and when it's gone:** each quiz gets exactly one folder,
`temp/session_<quiz_id>/exports/`, holding only its own report files (see
`backend/app/utils/session_storage.py`). Nothing else touches disk for a
quiz — CSV uploads are parsed in memory and never written out.

The full lifecycle:

```
Quiz ends → data stays in RAM (needed to build the report)
    → admin generates + downloads the ZIP
    → admin clicks "Delete Session"          [immediate, explicit]
       — or —
      report_retention_minutes elapses        [automatic safety net, default 24h]
    → RAM wiped (questions, answers, sessions, tokens implicitly)
      AND temp/session_<quiz_id>/ deleted from disk
    → nothing remains
```

Both the explicit delete and the automatic expiry converge on the same two
calls: `store.delete_quiz()` (RAM) + `delete_session_dir()` (disk) — see
`admin_routes.delete_session_data` and `scheduler/cleanup_scheduler.py`.
Tune the retention window with `REPORT_RETENTION_MINUTES` in `backend/.env`.

One deliberate change from the very first cut of this app: earlier, ending a
quiz immediately erased the raw question bank from memory. That broke report
generation (Question Analysis / Student Report need the real question text),
so now the wipe is delayed until the report has had a chance to be built —
matching "generate report → download → *then* delete" rather than deleting
before the report can even be produced.

## Reliability & operations

Everything below was added on a second pass specifically aimed at "will this
survive a real 500-student exam," not just "does the happy path work."

### Report generation: queued, not fire-and-forget

Building the full report ZIP is CPU-bound (pandas/openpyxl/reportlab all
hold the GIL). If five admins export at once, running each on its own
thread would have them all fight for CPU simultaneously -- slower for
everyone than doing them one at a time. So every export goes through one
FIFO queue processed by a single worker thread
(`backend/app/services/report_worker.py`, started once at app startup):
`POST .../export/bundle/start` enqueues and returns instantly; `GET
.../export/bundle/status/{job_id}` reports `queued` (with a queue
position), `generating` (with 0-100 progress), `ready`, or `error`; `GET
.../export/bundle/download/{job_id}` streams the file once ready. The
Results page's progress bar reflects this directly. A report ZIP is also
deleted on its own, independent of the quiz's longer retention window: 10
minutes after it's actually finished downloading (`REPORT_POST_DOWNLOAD_GRACE_MINUTES`),
tracked via a Starlette response `background` callback that only fires
once the download has fully streamed to the client -- not when it starts.

### Resume after reconnect is server-authoritative

The frontend keeps the student's JWT in `localStorage` (not `sessionStorage`)
so a killed tab / dropped network / backgrounded mobile browser doesn't
lose the token outright -- but the token is only ever a *claim*. On load,
`JoinQuiz.jsx` calls `GET /api/student/resume`, which re-verifies the token
server-side (unexpired, still bound to the same device fingerprint --
`security/dependencies.py`) and returns the live server state: remaining
time (server clock), current submission status, quiz name. Only if that
check succeeds does the student see a "Resume Quiz" prompt; any failure
(expired, wrong device, session gone) drops straight through to a normal
join. The client never asserts its own progress, answers, or remaining
time -- every one of those already came from the server on every request,
resume included. Camera and fullscreen are always re-acquired via the Rules
screen on resume, since both are genuinely lost on a real reconnect
regardless of token validity.

### Encryption key rotation

`ENCRYPTION_KEY` (current) and `ENCRYPTION_KEY_PREVIOUS` (comma-separated,
optional) are combined via `cryptography`'s `MultiFernet`
(`backend/app/security/encryption.py`): all new encryption uses the current
key, but decryption accepts any listed key. To rotate: generate a new key,
set it as `ENCRYPTION_KEY`, move the old value into
`ENCRYPTION_KEY_PREVIOUS`, restart (nothing already encrypted breaks), then
call `POST /api/admin/system/reencrypt` (super_admin only) to actively
migrate every live quiz's question bank onto the new key so the old one can
eventually be dropped entirely.

### Crash-recovery backup needs a stable key too

The optional encrypted backup (`temp/session_<id>/backup.enc`, written
every `BACKUP_INTERVAL_SECONDS` for live/scheduled quizzes, restored on
startup -- `backend/app/scheduler/backup_scheduler.py`) is only useful if
the key used to encrypt it survives the crash it's protecting against. If
`ENCRYPTION_KEY` isn't set explicitly, one is generated once and persisted
to `temp/.runtime_key` specifically so a restart doesn't silently
invalidate every backup that already exists.

### Memory diagnostics

`GET /api/admin/system/memory-stats` (super_admin only) reports every
structure in the app that could theoretically grow unbounded -- live quiz/
session counts, in-memory log entries, report job queue depth, rate-limiter
tracked clients, process RSS. Run a quiz through its full lifecycle
(create → live → end → delete session) and confirm these return to
whatever "currently live" actually is, not keep climbing. One real bug this
pass caught and fixed: the scheduler's own "quiz auto-purged" log entry was
tagged with the quiz's `quiz_id`, so `store.delete_quiz()` immediately
stripped that entry from the in-memory log right after writing it (still
safe in the persistent `logs/audit.log` file, just missing from the
in-memory view) -- fixed by leaving those specific entries untagged.

### WebSocket heartbeat

Two layers: engine.io's own transport ping/pong (`WS_PING_INTERVAL` /
`WS_PING_TIMEOUT`) detects a genuinely dead socket, and a lighter
application-level `heartbeat` event (emitted by the student client every
`HEARTBEAT_INTERVAL_SECONDS`, default 15s) updates
`StudentSession.last_seen` so the admin Monitor page can flag a row
**stale** (yellow highlight) well before the transport-level timeout would
notice -- e.g. a backgrounded/throttled mobile tab that's keeping the
socket technically open. `socket.io-client`'s built-in reconnection handles
the transport recovery itself; the backend's `connect` handler treats a
reconnect identically to a first connection, re-associating it with the
existing session by JWT.

### Load testing

Not something this build environment can honestly execute -- it's sandboxed
and can't simulate real concurrent users against a real deployment. Instead,
`scripts/locustfile.py` is a ready-to-run Locust script covering the actual
hot path (join → fetch each question → answer → submit, matching how a real
student's browser behaves) plus an optional admin-monitoring user. Run it
yourself against a staging deployment:

```bash
pip install -r scripts/requirements-loadtest.txt
QUIZ_CODE=ABC123 locust -f scripts/locustfile.py --host http://localhost:8000
```

Then open `http://localhost:8089`, test 50 / 250 / 500 / 1000 users as
separate runs (not one ramp), and watch failure rate, response-time
percentiles, and `/api/admin/system/memory-stats` before/after. Full
details, including what a healthy vs. unhealthy result looks like, are in
the script's module docstring.

## Production hardening round

A later review pushed for VPS/Nginx production readiness in one pass. Most
of it was already covered by earlier rounds (async export queue, resume,
rate limiting, heartbeat, load testing -- see "Reliability & operations"
above); this section covers what was genuinely new, one real architecture
conflict that got corrected rather than blindly implemented, and a couple
of items that turned out to already be non-issues once you look at how the
system actually stores data.

### `--workers 1`, always -- not a limitation, a hard requirement

The suggestion was `uvicorn ... --workers 2` for production. That would
break this app: the entire store (`app/memory/store.py`) is one Python dict
behind one `threading.RLock`, living inside one process. `--workers N`
starts N *separate* OS processes, each importing its own empty copy of that
store -- a student who joins via worker 1 simply doesn't exist if their next
request lands on worker 2 (round-robin'd by the OS). You'd see random
401s/404s under real load, not more capacity. `systemd/quiz-backend.service`
in `config/` hard-codes `--workers 1` with this explained in its comments.
If you outgrow one process (well past the ~500-student target this was
sized for), the real fix is a shared store -- swap `store.py`'s internals
for Redis, keep its function signatures, and nothing above it changes. Until
then, one process is also just simpler to reason about for the in-memory
crash-recovery backup and the report job queue, both of which assume a
single process too.

### GZip

Added (`app/main.py`, `GZipMiddleware`, `minimum_size=500`) -- compresses
JSON-heavy responses (monitor polls, results, analytics) and report
downloads. If you deploy behind the Nginx template in `config/`, Nginx's
own `gzip on` handles it at the edge instead and won't double-compress
(it only gzips responses that don't already have `Content-Encoding` set).

### Nginx + systemd templates

New: `config/nginx.conf.example` (reverse proxy: `/api/*` and `/socket.io/*`
to the backend with WebSocket upgrade headers, everything else serves the
built frontend) and `config/systemd/quiz-backend.service` (auto-restart,
`--workers 1`). See `config/README.md`. This is the Cloudflare DNS (proxy
on) + Nginx + VPS path referenced as an alternative to Cloudflare Tunnel for
an always-on deployment, vs. Tunnel for "my laptop, right now, temporarily."

### Rate limiting: IP tier + identity tier, not IP alone

The original limiter (`middleware/rate_limit_middleware.py`) keyed purely by
client IP. The problem: a whole class or school sitting behind one shared
NAT/proxy IP would all get bucketed together, so 20-30 students joining
within the same minute could trip a limit meant for one abusive actor. Fixed
with two independent tiers, both must pass:

- **IP tier** -- loose, catches one misbehaving machine (e.g. join capped at
  200/min per IP now, up from 20).
- **Identity tier** -- tight, keyed by *who*, not *where from*: authenticated
  routes (`/student/answer`, `/student/warning`, `/student/submit`) key off
  the JWT's session_id, so many students on one IP don't count against each
  other; the pre-auth `/student/join` keys off `(device_id, roll_number)`
  from the request body instead; `/auth/admin/login` keys off the attempted
  username.

### Polling reduction: timer resync moved onto the existing heartbeat

The one genuine "we're polling when we could push" finding: `useTimer.js`
was re-fetching `/api/student/palette` every 20s purely to resync the
on-screen countdown. The student client already emits a Socket.IO
`heartbeat` every 15s (to mark itself "still here" for the admin Monitor
page's stale-detection) -- the server now returns `remaining_seconds` as
that heartbeat's ack (`websocket/socket_manager.py`), and `useTimer`'s new
`syncRemaining()` consumes it. Net effect: one fewer periodic REST call per
student, no loss of accuracy, and the independent server-side deadline
sweep (`scheduler/cleanup_scheduler.py`) still force-submits on time
regardless of whether any heartbeat gets through. The admin Monitor page's
5s poll was similarly cut to a 30s safety net now that `answer_saved` (fired
on every autosave) is also pushed and invalidates the query immediately --
it wasn't being listened for before, so the "current question" column was
silently relying on the poll alone.

### Two items that turned out to be non-issues

- **"Batch-save answers via a queue"** -- already the design: `/student/answer`
  autosaves one answer every 5s per student as the student works (see
  `QuizEngine.jsx`), which *is* the batching -- there's no per-keystroke
  save to batch further. A client-side write-behind queue would add
  complexity and a new failure mode (answers buffered in memory and lost on
  a hard refresh) for the same effective request rate the current every-5s
  REST call already gives.
- **"Serve question images from a static folder instead of RAM"** -- images
  were never stored in RAM to begin with. The CSV's `image` column
  (`services/csv_service.py`) is just a URL string; the browser fetches it
  directly from wherever the teacher hosted it (or, if a `data:` URI was
  pasted in, that string round-trips through the encrypted question bank
  like any other question field -- still not something the backend "serves"
  as a file). Nothing to move to static hosting because nothing is being
  streamed through the app in the first place.

## Other notable design decisions

- **RAM-only storage** (`backend/app/memory/store.py`): a single
  thread-safe in-process store. Redis is the documented scale-out path if
  you outgrow one process — swap the store's internals, keep its function
  signatures, and nothing above it changes.
- **Server-authoritative timer**: the frontend (`hooks/useTimer.js`) only
  displays a countdown; it resyncs against the true remaining time every
  15s, piggybacked on the existing Socket.IO heartbeat ack (no separate
  REST poll -- see "Production hardening round" below), and the backend
  scheduler (`scheduler/cleanup_scheduler.py`) independently force-submits
  any session past its deadline every 10s, so a manipulated browser clock
  or a missed heartbeat can't buy extra time either way.
- **One question at a time**: `/api/student/question/{id}` decrypts and
  returns exactly the requested question — the rest of the bank stays
  encrypted in memory (`security/encryption.py`). The client never receives
  the full question set.
- **AI proctoring**: `services/proctoring_service.py` turns the anti-cheat
  warning stream (tab switches, camera-off, fullscreen exits, and the
  already-defined `multiple_faces`/`no_face`/`phone_detected` warning types)
  into a weighted risk score per student today. Wiring in a real face/phone
  detection model (e.g. face-api.js client-side) is a drop-in extension —
  see the docstring at the top of that file for the exact integration point.

## What's stubbed vs. fully built

Fully built and runnable: auth, quiz CRUD, CSV validation/import, the full
student quiz-taking flow (timer, palette, autosave, anti-cheat, camera),
live WebSocket monitoring with a camera grid, results/export/analytics.

Deliberately left as an extension point rather than faked: real ML-based
face/phone detection for AI proctoring (needs a model dependency a team
would choose deliberately — see `proctoring_service.py`), email/WhatsApp
notifications, and offline-answer-sync (the autosave-every-5s design gives
you most of this for free already; a full offline queue is a frontend-only
addition to `QuizEngine.jsx`).

## Troubleshooting

**`pip install` tries to compile pandas (or cryptography/pydantic/etc.) and
fails on Windows with "Could not find ... vswhere.exe"** -- this means pip
couldn't find a precompiled wheel for your Python version for that package,
so it fell back to building from source, which then needs Microsoft's C++
Build Tools that most machines don't have. It is **not** actually asking you
to install Visual Studio -- that's a workaround for the wrong problem.
`start.bat` / `start-tunnel.bat` / `start.sh` already upgrade `pip`,
`setuptools`, and `wheel` before installing requirements (an outdated pip is
one common cause), and `requirements.txt` intentionally uses minimum-version
(`>=`) pins rather than exact ones for every package with a compiled
extension, so pip can resolve to whatever recent release already has a
wheel for your Python -- so if you pulled the latest version of this repo,
this should already be fixed. If it still happens: run `python --version`
(or `py --version`) -- a very new Python release (the latest 3.13.x/3.14.x
at the time you're reading this) can still occasionally be ahead of some
package's published wheels. Installing Python 3.11 or 3.12 alongside it
(`py -3.12 -m venv backend\.venv` instead of `python -m venv backend\.venv`
on Windows) is the reliable fix, not installing a compiler.

## Environment note

This build was authored and syntax-checked in a sandbox without outbound
access to PyPI/npm, so `pip install` / `npm install` could not be executed
here — run them on your own machine to pull dependencies. All Python files
pass `py_compile`, and the CSV validation logic was independently verified
against `scripts/sample_quiz.csv`.
