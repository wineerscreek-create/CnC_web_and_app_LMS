"""
Lightweight request-timing / audit middleware. Keeps a short in-memory
ring buffer of recent requests (useful for the admin 'Observer' role to
eyeball traffic) without ever writing request bodies to disk.
"""
import time
import uuid
from collections import deque
from starlette.middleware.base import BaseHTTPMiddleware

recent_requests = deque(maxlen=500)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = str(uuid.uuid4())
        start = time.time()
        response = await call_next(request)
        duration_ms = round((time.time() - start) * 1000, 2)
        recent_requests.append({
            "id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": duration_ms,
            "at": start,
        })
        response.headers["X-Request-ID"] = request_id
        return response
