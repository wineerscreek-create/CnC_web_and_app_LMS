#!/usr/bin/env bash
# One-click local launcher for the Secure Online Quiz System (Mac/Linux).
# Usage:
#   chmod +x start.sh   # once
#   ./start.sh
#
# What it does, in order:
#   1. Creates backend/.venv if it doesn't exist yet (first run only).
#   2. Installs/updates backend Python dependencies into that venv.
#   3. Copies backend/.env.example -> backend/.env if missing (edit the
#      copy before a real deployment -- see its comments, especially
#      SUPER_ADMIN_PASSWORD and ENCRYPTION_KEY).
#   4. Installs frontend npm dependencies if node_modules is missing.
#   5. Starts the backend (FastAPI + Socket.IO, uvicorn) in the background
#      and the frontend (Vite dev server) in the foreground; Ctrl+C stops
#      both (the trap below kills the backend when this script exits).
#
# Backend is started with --workers 1 on purpose: this app's entire store
# is one in-memory Python dict (see backend/app/memory/store.py), so more
# worker processes would each get their own empty copy of it, not more
# capacity. For a real multi-user deployment on a VPS, see config/ (Nginx
# + systemd templates) and README.md's "Production hardening round"
# section -- this script is for local dev / a quick demo on one machine.

set -e
cd "$(dirname "$0")"

echo "============================================================"
echo "  Secure Online Quiz System - one-click local launcher"
echo "============================================================"
echo

PY=python3
if ! command -v "$PY" >/dev/null 2>&1; then
    PY=python
fi
if ! command -v "$PY" >/dev/null 2>&1; then
    echo "ERROR: no python3/python found on PATH. Install Python 3.10+ and re-run."
    exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
    echo "ERROR: npm not found on PATH. Install Node.js LTS and re-run."
    exit 1
fi

if [ ! -f "backend/.venv/bin/python" ]; then
    echo "[1/5] Creating backend virtual environment (first run only)..."
    "$PY" -m venv backend/.venv
else
    echo "[1/5] Backend virtual environment already exists, skipping."
fi

echo "[2/5] Installing/checking backend dependencies..."
backend/.venv/bin/python -m pip install --upgrade --quiet --disable-pip-version-check pip setuptools wheel
if ! backend/.venv/bin/python -m pip install --disable-pip-version-check -r backend/requirements.txt; then
    echo
    echo "Backend dependency install failed. See the error above."
    echo "If it's trying to compile pandas/cryptography/etc. from source (gcc"
    echo "errors, missing headers): pip couldn't find a precompiled wheel for"
    echo "your Python version. Run \"python3 --version\" -- Python 3.11 or 3.12"
    echo "are the safest bets if a very new Python is still hitting this after"
    echo "the pip/wheel upgrade above."
    exit 1
fi

if [ ! -f "backend/.env" ]; then
    echo "Creating backend/.env from backend/.env.example..."
    echo "  (Edit backend/.env before deploying for real -- set a strong"
    echo "   SUPER_ADMIN_PASSWORD and JWT_SECRET_KEY at minimum.)"
    cp backend/.env.example backend/.env
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "[3/5] Installing frontend dependencies (npm install, first run only)..."
    (cd frontend && npm install)
else
    echo "[3/5] Frontend dependencies already installed, skipping npm install."
fi

if [ -f "frontend/.env.example" ] && [ ! -f "frontend/.env" ]; then
    cp frontend/.env.example frontend/.env
fi

echo "[4/5] Starting backend on http://localhost:8000 ..."
(cd backend && exec ./.venv/bin/python -m uvicorn app.main:socket_app --host 0.0.0.0 --port 8000 --workers 1) &
BACKEND_PID=$!

cleanup() {
    echo
    echo "Stopping backend (pid $BACKEND_PID)..."
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Waiting for the backend to finish booting..."
sleep 5

echo "[5/5] Starting frontend on http://localhost:5173 ..."
echo
echo "============================================================"
echo "Backend  -> http://localhost:8000  (health check: /api/health)"
echo "Frontend -> http://localhost:5173  (open this in your browser)"
echo
echo "Press Ctrl+C to stop both servers."
echo
echo "For students on OTHER devices/networks (not this WiFi), see the"
echo "Cloudflare Tunnel section in README.md. For a real always-on"
echo "deployment, see config/ (Nginx + systemd templates)."
echo "============================================================"
(cd frontend && npm run dev)
