"""
In-memory fixed-window rate limiter. Consistent with the rest of this
system's RAM-only philosophy -- no Redis needed for a single-process
deployment; swap `_RateLimiter` for a Redis-backed one (INCR + EXPIRE) if
you scale out to multiple workers/machines, same as the store itself.

Two independent tiers per route, both must pass:

  - IP tier: a loose per-source-IP cap. Deliberately generous on the
    student-facing routes -- a whole class/school sits behind one shared
    NAT/proxy IP, so a strict per-IP cap here would lock out legitimate
    students, not attackers. This tier exists to catch a single misbehaving
    machine hammering the API, not to be the primary defense.
  - Identity tier: a tight cap keyed by *who*, not *where from*:
      - authenticated requests (student answer/warning/submit, any admin
        route) key off the JWT subject (session_id / admin_id) once a
        token exists -- this is what actually distinguishes 40 different
        students on the same school IP from one script hammering the API.
      - the student /join route (pre-auth, no token yet) keys off
        (device_id, roll_number) from the request body instead.
      - admin /login (pre-auth) keys off the attempted username.

This two-tier design directly replaces the earlier pure-IP limiter, which
would have unfairly throttled every student behind a shared IP once a few
of them joined in the same minute.

Keyed IP fallback checks X-Forwarded-For / CF-Connecting-IP first (reverse
proxy / Cloudflare deployments), then the raw socket address.
"""
import json
import time
import threading
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.security.jwt_handler import decode_token, TokenError


class _RateLimiter:
    def __init__(self):
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, max_requests: int, window_seconds: int) -> tuple[bool, int]:
        """Returns (allowed, retry_after_seconds)."""
        now = time.time()
        with self._lock:
            q = self._hits[key]
            cutoff = now - window_seconds
            while q and q[0] < cutoff:
                q.popleft()
            if len(q) >= max_requests:
                retry_after = int(window_seconds - (now - q[0])) + 1
                return False, max(retry_after, 1)
            q.append(now)
            return True, 0

    def sweep(self, max_age_seconds: int = 3600):
        """Drops keys with no recent activity so this doesn't grow forever
        across a long-running process. Call periodically from the scheduler."""
        now = time.time()
        with self._lock:
            stale = [k for k, q in self._hits.items() if not q or q[-1] < now - max_age_seconds]
            for k in stale:
                del self._hits[k]

    def active_keys(self) -> int:
        with self._lock:
            return len(self._hits)


_limiter = _RateLimiter()

# (method, path prefix) -> {"ip": (max, window), "identity": (max, window), "identity_from": "..."}
# identity_from tells the middleware how to derive the identity-tier key for
# this route: "auth" = JWT subject (works once the request is authenticated),
# "join_body" = (device_id, roll_number) from the JSON body, "login_body" =
# username from the JSON body.
_ROUTE_LIMITS = [
    (("POST", "/api/auth/admin/login"), {
        "ip": (30, 60), "identity": (8, 60), "identity_from": "login_body",
    }),
    (("POST", "/api/student/join"), {
        # IP tier is loose on purpose -- a school behind one NAT IP can have
        # 40+ students joining inside the same minute; that's normal traffic,
        # not abuse. The identity tier (per device+roll) is what actually
        # stops enumeration/spam-joins from a single actor.
        "ip": (200, 60), "identity": (6, 60), "identity_from": "join_body",
    }),
    (("POST", "/api/student/answer"), {
        # Autosave fires every few seconds per student; identity tier keyed
        # by session_id (from the JWT) so many students sharing an IP don't
        # count against each other.
        "ip": (1000, 60), "identity": (60, 60), "identity_from": "auth",
    }),
    (("POST", "/api/student/warning"), {
        "ip": (1000, 60), "identity": (60, 60), "identity_from": "auth",
    }),
    (("POST", "/api/student/submit"), {
        "ip": (500, 60), "identity": (10, 60), "identity_from": "auth",
    }),
]
_GLOBAL_LIMIT = (600, 60)  # per-IP fallback for every other /api/* route


def _client_ip(request) -> str:
    fwd = request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _route_limit(method: str, path: str):
    for (m, p), limits in _ROUTE_LIMITS:
        if method == m and path.startswith(p):
            return f"{m}:{p}", limits
    return None, None


async def _read_json_body(request) -> dict:
    """Safe, cached body read -- Starlette caches request._body after the
    first .body() call, so downstream route handlers can still read it
    normally even though the middleware reads it first."""
    try:
        raw = await request.body()
        if not raw:
            return {}
        return json.loads(raw)
    except Exception:
        return {}


def _identity_from_auth(request) -> str | None:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    try:
        payload = decode_token(token)
    except TokenError:
        return None
    token_type = payload.get("type", "unknown")
    subject = payload.get("sub", "unknown")
    return f"{token_type}:{subject}"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        ip = _client_ip(request)
        route_key, limits = _route_limit(request.method, request.url.path)

        if limits is None:
            # No specific route rule -- just the loose global per-IP cap.
            max_requests, window_seconds = _GLOBAL_LIMIT
            allowed, retry_after = _limiter.allow(f"{ip}:global", max_requests, window_seconds)
            if not allowed:
                return _too_many(retry_after)
            return await call_next(request)

        # --- IP tier (loose) ---
        ip_max, ip_window = limits["ip"]
        allowed, retry_after = _limiter.allow(f"{ip}:{route_key}:ip", ip_max, ip_window)
        if not allowed:
            return _too_many(retry_after)

        # --- Identity tier (tight, the real defense) ---
        identity_from = limits["identity_from"]
        identity_key = None

        if identity_from == "auth":
            identity_key = _identity_from_auth(request)
        elif identity_from == "join_body":
            body = await _read_json_body(request)
            device_id = body.get("device_id", "")
            roll_number = body.get("roll_number", "")
            if device_id or roll_number:
                identity_key = f"join:{device_id}:{roll_number}"
        elif identity_from == "login_body":
            body = await _read_json_body(request)
            username = body.get("username", "")
            if username:
                identity_key = f"login:{username}"

        if identity_key is None:
            # Couldn't establish an identity (e.g. malformed body, or an
            # authenticated route hit before a token exists). Fall back to
            # IP-scoped identity so the route still has *some* tight limit,
            # matching the old behavior for this edge case only.
            identity_key = f"{ip}:noident"

        id_max, id_window = limits["identity"]
        allowed, retry_after = _limiter.allow(f"{identity_key}:{route_key}:id", id_max, id_window)
        if not allowed:
            return _too_many(retry_after)

        return await call_next(request)


def _too_many(retry_after: int) -> JSONResponse:
    return JSONResponse(
        {"detail": "Too many requests. Please slow down and try again shortly."},
        status_code=429,
        headers={"Retry-After": str(retry_after)},
    )


def sweep_rate_limiter():
    _limiter.sweep()


def rate_limiter_active_keys() -> int:
    """Used by utils/memory_stats.py -- see task #34's leak audit."""
    return _limiter.active_keys()
