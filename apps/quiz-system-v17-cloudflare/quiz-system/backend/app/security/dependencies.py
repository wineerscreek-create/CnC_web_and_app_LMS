"""
FastAPI dependencies that turn a Bearer token into either an authenticated
admin or an authenticated student session, enforcing:
- role-based access for admin routes (Quiz Management Modules doc: Super
  Admin / Faculty / Observer have different permissions)
- one-device-only for students (device_id in the token must match the
  device_id stored on the session; a login from a second device gets a
  fresh session_id/token and can't reuse the first one)
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.security.jwt_handler import decode_token, TokenError
from app.memory.store import store, AdminRecord, StudentSession

bearer_scheme = HTTPBearer(auto_error=False)


async def get_token_payload(creds: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="Missing authorization token")
    try:
        return decode_token(creds.credentials)
    except TokenError as e:
        raise HTTPException(status_code=401, detail=str(e))


async def get_current_admin(payload: dict = Depends(get_token_payload)) -> AdminRecord:
    if payload.get("type") != "admin":
        raise HTTPException(status_code=403, detail="Admin token required")
    admin = store.admins.get(payload["sub"])
    if not admin:
        raise HTTPException(status_code=401, detail="Admin no longer exists")
    return admin


def require_role(*roles: str):
    async def _checker(admin: AdminRecord = Depends(get_current_admin)) -> AdminRecord:
        if admin.role not in roles:
            raise HTTPException(status_code=403, detail=f"Requires role(s): {', '.join(roles)}")
        return admin
    return _checker


async def get_current_student(payload: dict = Depends(get_token_payload)) -> StudentSession:
    if payload.get("type") != "student":
        raise HTTPException(status_code=403, detail="Student token required")
    session = store.get_session(payload["sub"])
    if not session:
        raise HTTPException(status_code=401, detail="Session no longer exists (quiz may have ended)")
    if session.device_id != payload.get("device_id"):
        raise HTTPException(status_code=401, detail="Session bound to a different device")
    return session
