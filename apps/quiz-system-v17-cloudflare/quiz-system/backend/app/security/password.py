"""
Password hashing -- direct `bcrypt` usage, NOT passlib.

passlib 1.7.4 (its last release, from 2020) is unmaintained and does not
work with modern bcrypt (>=4.1): bcrypt removed the `__about__` attribute
passlib's version-sniffing relies on, and newer bcrypt raises on a >72-byte
input during passlib's own internal self-test instead of silently
truncating like old bcrypt did -- the combination reliably crashes app
startup with "(trapped) error reading bcrypt version" followed by
"ValueError: password cannot be longer than 72 bytes" from inside passlib's
own `detect_wrap_bug` check, before any real password is ever hashed. This
isn't a version we can pin around either: requirements.txt needs a recent
bcrypt for a Python 3.13 wheel to exist at all (see that file's comment on
compiled-dependency pins), and any bcrypt new enough for that is too new for
passlib. Calling `bcrypt` directly sidesteps passlib (and this whole class
of bug) entirely -- it's the actively maintained package either way.
"""
import bcrypt

# bcrypt's own hard 72-byte input limit (its cipher only ever uses the first
# 72 bytes of the input regardless) -- truncate rather than let long
# passwords raise, same practical behavior passlib used to give you for
# free. Encode first since the limit is on bytes, not characters.
_MAX_BCRYPT_BYTES = 72


def _prepare(plain: str) -> bytes:
    return plain.encode("utf-8")[:_MAX_BCRYPT_BYTES]


def hash_password(plain: str) -> str:
    hashed = bcrypt.hashpw(_prepare(plain), bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_prepare(plain), hashed.encode("utf-8"))
    except ValueError:
        # Malformed/foreign hash format -- treat as "does not match" rather
        # than letting a 500 leak through the login endpoint.
        return False
