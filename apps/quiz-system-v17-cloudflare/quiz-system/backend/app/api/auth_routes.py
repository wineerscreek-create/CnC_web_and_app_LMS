from fastapi import APIRouter, HTTPException

from app.models.schemas import AdminLoginRequest, AdminLoginResponse
from app.services import auth_service
from app.utils.helpers import write_log

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/admin/login", response_model=AdminLoginResponse)
def admin_login(body: AdminLoginRequest):
    try:
        token, admin = auth_service.admin_login(body.username, body.password)
    except auth_service.AuthError as e:
        write_log(actor=body.username, action="login_failed", detail=str(e))
        raise HTTPException(status_code=401, detail=str(e))
    write_log(actor=admin.username, action="login", detail="Admin logged in")
    return AdminLoginResponse(access_token=token, role=admin.role, username=admin.username)
