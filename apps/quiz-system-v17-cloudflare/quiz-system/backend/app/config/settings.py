"""
Central configuration. Reads from environment variables (.env in production).
No database settings here on purpose -- this system is RAM-only by design.
"""
import os
import secrets
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    env: str = os.getenv("ENV", "development")

    # --- Auth ---
    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", secrets.token_urlsafe(48))
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    admin_token_expire_minutes: int = int(os.getenv("ADMIN_TOKEN_EXPIRE_MINUTES", "480"))
    student_token_expire_minutes: int = int(os.getenv("STUDENT_TOKEN_EXPIRE_MINUTES", "180"))

    super_admin_username: str = os.getenv("SUPER_ADMIN_USERNAME", "admin")
    super_admin_password: str = os.getenv("SUPER_ADMIN_PASSWORD", "ChangeMe123!")

    # --- Encryption (questions-at-rest-in-RAM) ---
    # Current (primary) key -- all new encryption uses this one.
    encryption_key: str = os.getenv("ENCRYPTION_KEY", "")
    # Comma-separated retired keys that can still decrypt old data during a
    # rotation window. See security/encryption.py's module docstring for the
    # rotation procedure.
    encryption_key_previous: str = os.getenv("ENCRYPTION_KEY_PREVIOUS", "")

    # --- CORS ---
    # Declared as a plain str field (not list[str]) on purpose. pydantic-
    # settings auto-loads every field from a same-named env var, and for any
    # *complex* type (list/dict/set/...) it tries to JSON-decode the raw env
    # string before your own default/validation ever runs -- so a normal
    # comma-separated value like "http://localhost:5173,https://foo.com"
    # blows up with a JSONDecodeError, even though CORS_ORIGINS=... in .env
    # is documented (and used everywhere else in this project) as plain
    # comma-separated text, not JSON. Keeping the raw field a str sidesteps
    # that entirely; `cors_origins` below is the actual list everything else
    # in the codebase uses.
    cors_origins_env: str = Field(default="http://localhost:5173", validation_alias="CORS_ORIGINS")

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_env.split(",") if o.strip()]

    # --- Anti-cheat thresholds ---
    max_warnings_before_auto_submit: int = int(os.getenv("MAX_WARNINGS", "3"))

    # --- WebSocket heartbeat ---
    # engine.io-level ping: server pings every ws_ping_interval seconds;
    # if no pong within ws_ping_timeout, engine.io itself declares the
    # transport dead and fires our disconnect handler. This is the
    # transport-level heartbeat (keeps NATs/proxies from silently dropping
    # idle connections and detects a truly dead socket).
    ws_ping_interval: int = int(os.getenv("WS_PING_INTERVAL", "25"))
    ws_ping_timeout: int = int(os.getenv("WS_PING_TIMEOUT", "20"))
    # Application-level heartbeat: the student client emits a "heartbeat"
    # event on this cadence (see hooks in QuizEngine.jsx) so
    # StudentSession.last_seen reflects real app activity, not just "the
    # transport is technically still open" -- lets the admin Monitor screen
    # flag a session as stale well before the longer transport timeout above
    # would even notice.
    heartbeat_interval_seconds: int = int(os.getenv("HEARTBEAT_INTERVAL_SECONDS", "15"))
    stale_after_seconds: int = int(os.getenv("STALE_AFTER_SECONDS", "45"))

    # --- Autosave ---
    autosave_interval_seconds: int = int(os.getenv("AUTOSAVE_INTERVAL_SECONDS", "5"))

    # --- Session ---
    one_device_per_student: bool = True

    # --- Paths ---
    upload_dir: str = os.getenv("UPLOAD_DIR", "../uploads")
    export_dir: str = os.getenv("EXPORT_DIR", "../exports")
    log_dir: str = os.getenv("LOG_DIR", "../logs")
    # Per-quiz scratch space: temp/session_<quiz_id>/exports/... Everything
    # under here belongs to one quiz and is deleted as a single unit -- see
    # app/utils/session_storage.py -- either when the admin clicks "Delete
    # Session" or automatically after report_retention_minutes.
    temp_dir: str = os.getenv("TEMP_DIR", "../temp")

    # --- Report lifecycle (Create -> Live -> Report -> Download -> Delete) ---
    # How long an ended quiz's data (RAM session data + its temp/ report
    # files) stays available after the quiz ends, in case the admin hasn't
    # downloaded the report yet. After this, the scheduler force-deletes it
    # even if nobody downloaded anything -- "expire after N hours" from the
    # privacy-first design: nothing lingers forever just because someone
    # forgot to click delete.
    report_retention_minutes: int = int(os.getenv("REPORT_RETENTION_MINUTES", str(24 * 60)))
    # How long a generated report ZIP sticks around *after* the admin
    # actually downloads it, before it's deleted on its own (independent of
    # the full-session retention above). Matches: Generate -> READY ->
    # Download -> Delete after N minutes.
    report_post_download_grace_minutes: int = int(os.getenv("REPORT_POST_DOWNLOAD_GRACE_MINUTES", "10"))

    # --- Crash-recovery backup (optional; see scheduler/backup_scheduler.py) ---
    # Periodically writes an ENCRYPTED snapshot of each live quiz's RAM state
    # to temp/session_<id>/backup.enc so a process crash/restart doesn't lose
    # an in-progress quiz. This is NOT a database -- it's deleted along with
    # the rest of a quiz's temp/ folder on "Delete Session" / retention
    # expiry, same as everything else in this system.
    enable_crash_recovery_backup: bool = os.getenv("ENABLE_CRASH_RECOVERY_BACKUP", "true").lower() == "true"
    backup_interval_seconds: int = int(os.getenv("BACKUP_INTERVAL_SECONDS", "30"))

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
