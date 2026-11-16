"""
Application entrypoint. Run with:
    uvicorn app.main:socket_app --reload --port 8000
`socket_app` wraps the FastAPI `app` together with the Socket.IO server so
REST (/api/...) and WebSocket (/socket.io/...) traffic share one process and
one in-memory store.
"""
import os
import socketio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config.settings import settings
from app.middleware.logging_middleware import RequestLoggingMiddleware
from app.middleware.rate_limit_middleware import RateLimitMiddleware
from app.api import auth_routes, admin_routes, student_routes
from app.websocket.socket_manager import sio
from app.services.auth_service import bootstrap_super_admin
from app.services.report_worker import start_worker, stop_worker
from app.scheduler.cleanup_scheduler import start_scheduler, shutdown_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    bootstrap_super_admin()
    if settings.enable_crash_recovery_backup:
        from app.scheduler.backup_scheduler import restore_from_backups
        restored = restore_from_backups()
        if restored:
            import logging
            logging.getLogger("quiz_scheduler").info(f"Restored {restored} quiz(zes) from crash-recovery backup")
    start_scheduler()
    start_worker()  # single-threaded report-export queue, see services/report_worker.py
    yield
    stop_worker()
    shutdown_scheduler()


app = FastAPI(title="Secure Online Quiz System", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(RateLimitMiddleware)
# Outermost so it compresses whatever the routes/other middleware produced --
# mainly helps the JSON-heavy admin endpoints (monitor, results, analytics)
# and the exported report downloads. min_size avoids wasting CPU gzipping
# tiny responses (e.g. a bare {"status":"ok"}).
app.add_middleware(GZipMiddleware, minimum_size=500)

app.include_router(auth_routes.router)
app.include_router(admin_routes.router)
app.include_router(student_routes.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "env": settings.env}


# ---- Optional: serve the built frontend from this same process ----
# Not used in local dev (Vite's own dev server + proxy handles that) or a
# VPS+Nginx deployment (Nginx serves frontend/dist directly, see
# config/nginx.conf.example) -- but useful for a single-service platform
# deployment (e.g. one Render Web Service instead of two) where running a
# separate static host isn't worth the extra moving part. Activates
# automatically if a built frontend is found; does nothing otherwise.
#
# Build the frontend first (`cd frontend && npm run build`), which produces
# frontend/dist -- FRONTEND_DIST_DIR below defaults to that path relative to
# this file, overridable via env if you copy the build somewhere else (e.g.
# a Docker image that copies frontend/dist next to the backend).
_default_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
FRONTEND_DIST_DIR = os.getenv("FRONTEND_DIST_DIR", _default_dist)

if os.path.isdir(FRONTEND_DIST_DIR):
    assets_dir = os.path.join(FRONTEND_DIST_DIR, "assets")
    if os.path.isdir(assets_dir):
        # Vite content-hashes everything under assets/ -- safe to let the
        # browser cache these indefinitely.
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        """Serves the React build for any path FastAPI's own routers didn't
        already claim, so client-side routes (e.g. /admin/quiz/<id>/results
        typed directly into the address bar, or a page refresh) resolve to
        index.html and React Router takes it from there -- the same job
        Nginx's `try_files $uri $uri/ /index.html;` does in the VPS setup.

        Registered LAST (after every /api/* router above), so any real API
        route always wins first; this only ever runs for paths nothing else
        matched. The explicit guard below additionally makes sure a
        genuinely wrong /api/... or /socket.io/... path still 404s as JSON
        instead of silently returning the SPA shell, which would be a
        confusing failure mode to debug.
        """
        if full_path.startswith("api/") or full_path.startswith("socket.io"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = os.path.join(FRONTEND_DIST_DIR, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(FRONTEND_DIST_DIR, "index.html"))


# Combined ASGI app: FastAPI handles /api/*, Socket.IO handles /socket.io/*
socket_app = socketio.ASGIApp(sio, other_asgi_app=app, socketio_path="socket.io")
