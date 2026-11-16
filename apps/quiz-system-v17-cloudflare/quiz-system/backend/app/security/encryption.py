"""
Symmetric encryption for questions held in RAM, and for the optional
crash-recovery backup (see scheduler/backup_scheduler.py).

Even though nothing touches disk by default, we still encrypt the question
bank in the in-memory store so that a raw memory dump (or an accidental
log/print of the store) doesn't trivially leak the answer key. Each question
is decrypted only for the single request that needs it (see
services/quiz_service.py -> get_question_for_student), and only the question
currently being served is ever decrypted -- the rest of the bank stays
encrypted at all times.

Key management:
  1. ENCRYPTION_KEY in .env is always the *current* (primary) key -- all new
     encryption uses it. If unset, one is generated and persisted to
     `<temp_dir>/.runtime_key` so restarts on the same disk don't silently
     invalidate everything already encrypted (crash-recovery backups need
     the key to survive a restart to be useful at all).
  2. ENCRYPTION_KEY_PREVIOUS (comma-separated, optional) lists retired keys
     that can still DECRYPT existing data but are never used to encrypt
     anything new. This is what makes rotation possible without an outage:

       - generate a new key, set it as ENCRYPTION_KEY
       - move the old ENCRYPTION_KEY value into ENCRYPTION_KEY_PREVIOUS
       - restart -- anything encrypted under the old key still decrypts
         (live quizzes, crash-recovery backups); everything new uses the
         new key
       - optionally call reencrypt_all_quizzes() (e.g. from a one-off admin
         action) to actively re-encrypt every live quiz's question bank
         under the new key, after which the old key can be dropped from
         ENCRYPTION_KEY_PREVIOUS entirely

  We use cryptography's MultiFernet for this: it encrypts with the first
  key in the list and can decrypt with any of them, which is exactly this
  rotation model -- see https://cryptography.io/en/latest/fernet/#cryptography.fernet.MultiFernet
"""
import json
import os
from cryptography.fernet import Fernet, MultiFernet

from app.config.settings import settings

_RUNTIME_KEY_FILENAME = ".runtime_key"


def _load_or_create_persistent_key() -> bytes:
    key_path = os.path.join(settings.temp_dir, _RUNTIME_KEY_FILENAME)
    try:
        os.makedirs(settings.temp_dir, exist_ok=True)
        if os.path.isfile(key_path):
            with open(key_path, "rb") as f:
                existing = f.read().strip()
            if existing:
                return existing
        new_key = Fernet.generate_key()
        with open(key_path, "wb") as f:
            f.write(new_key)
        return new_key
    except OSError:
        # Read-only disk or similar -- fall back to an ephemeral in-process
        # key. Live quiz encryption still works; crash-recovery backups just
        # won't be decryptable after a restart in this environment.
        return Fernet.generate_key()


def _current_key_bytes() -> bytes:
    key = settings.encryption_key
    if key:
        return key.encode() if isinstance(key, str) else key
    return _load_or_create_persistent_key()


def _previous_keys_bytes() -> list[bytes]:
    raw = settings.encryption_key_previous
    if not raw:
        return []
    return [k.strip().encode() for k in raw.split(",") if k.strip()]


def _build_multi_fernet() -> MultiFernet:
    fernets = [Fernet(_current_key_bytes())] + [Fernet(k) for k in _previous_keys_bytes()]
    return MultiFernet(fernets)


_multi_fernet: MultiFernet | None = None


def get_fernet() -> MultiFernet:
    """Returns a MultiFernet -- drop-in compatible with plain Fernet for
    .encrypt()/.decrypt() (always encrypts under the current key, decrypts
    with any configured key), plus .rotate() for re-encrypting old tokens."""
    global _multi_fernet
    if _multi_fernet is None:
        _multi_fernet = _build_multi_fernet()
    return _multi_fernet


def encrypt_json(data: dict) -> bytes:
    return get_fernet().encrypt(json.dumps(data).encode())


def decrypt_json(token: bytes) -> dict:
    return json.loads(get_fernet().decrypt(token).decode())


def reencrypt_all_quizzes() -> int:
    """Re-encrypts every currently-loaded quiz's question bank under the
    *current* key (using MultiFernet.rotate, which decrypts with whichever
    configured key matches and re-encrypts with the primary one). Intended
    to be run once after adding an old key to ENCRYPTION_KEY_PREVIOUS and
    restarting, so you can eventually drop the old key entirely. Returns the
    number of quizzes touched. Safe to call even if nothing needs rotating
    (a no-op re-encryption still succeeds, just wastes a little CPU)."""
    from app.memory.store import store  # local import: avoids a circular import at module load time

    fernet = get_fernet()
    touched = 0
    for quiz in list(store.quizzes.values()):
        if not quiz.encrypted_questions:
            continue
        quiz.encrypted_questions = [fernet.rotate(token) for token in quiz.encrypted_questions]
        touched += 1
    return touched
