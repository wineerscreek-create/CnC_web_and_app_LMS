"""
Admin authentication + role bootstrap, and student join/verify.
"""
import uuid

from app.memory.store import store, AdminRecord
from app.security.password import hash_password, verify_password
from app.security.jwt_handler import create_admin_token, create_student_token, new_session_id
from app.config.settings import settings


class AuthError(Exception):
    pass


def bootstrap_super_admin():
    """Creates the single super_admin from env vars if no admins exist yet."""
    if store.get_admin_by_username(settings.super_admin_username):
        return
    admin = AdminRecord(
        id=str(uuid.uuid4()),
        username=settings.super_admin_username,
        password_hash=hash_password(settings.super_admin_password),
        role="super_admin",
    )
    store.add_admin(admin)


def create_admin(username: str, password: str, role: str = "faculty") -> AdminRecord:
    if store.get_admin_by_username(username):
        raise AuthError("Username already exists")
    admin = AdminRecord(id=str(uuid.uuid4()), username=username, password_hash=hash_password(password), role=role)
    store.add_admin(admin)
    return admin


def admin_login(username: str, password: str) -> tuple[str, AdminRecord]:
    admin = store.get_admin_by_username(username)
    if not admin or not verify_password(password, admin.password_hash):
        raise AuthError("Invalid username or password")
    token = create_admin_token(admin.id, admin.username, admin.role)
    return token, admin


def issue_student_token(session_id: str, quiz_code: str, roll_number: str, device_id: str) -> str:
    return create_student_token(session_id, quiz_code, roll_number, device_id)
