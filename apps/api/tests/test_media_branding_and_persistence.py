import io
import uuid
import pytest
from PIL import Image
from starlette.datastructures import UploadFile

from app.authz.roles import Role
from app.core.errors import NotFound, Unauthenticated, ValidationError
from app.db.postgres import get_pg_connection
from app.routers.media import get_media_asset
from app.routers.user_avatar import delete_user_avatar, get_user_avatar, upload_user_avatar
from app.routers.user_banner import (
    BannerPatchRequest,
    delete_user_banner,
    get_user_banner,
    update_user_banner_settings,
    upload_user_banner,
)


class DummyScope:
    def __init__(self, user_id: uuid.UUID | None, role: Role = Role.TRAINER, college_id: uuid.UUID | None = None):
        self.user_id = user_id
        self.role = role
        self.college_id = college_id
        self.department_id = None
        self.session_id = f"sess-{user_id}"
        self.email = f"u_{user_id}@test.com"


def _make_image_bytes(fmt: str = "PNG", size: tuple[int, int] = (320, 180)) -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", size, color=(24, 96, 180))
    img.save(buf, format=fmt)
    return buf.getvalue()


def _make_upload(filename: str, content: bytes, content_type: str) -> UploadFile:
    return UploadFile(filename=filename, file=io.BytesIO(content), headers={"content-type": content_type})


@pytest.mark.asyncio
async def test_banner_and_avatar_durable_persistence_all_roles_and_security():
    """Verifies durable PostgreSQL media_assets upload, crop/style save, cross-role avatar sync, and security."""
    inst_id = uuid.uuid4()
    users = {
        Role.STUDENT: uuid.uuid4(),
        Role.TRAINER: uuid.uuid4(),
        Role.ADMIN: uuid.uuid4(),
        Role.SUPER_ADMIN: uuid.uuid4(),
    }

    async with get_pg_connection() as conn:
        await conn.execute(
            "INSERT INTO institutions (id, name, code) VALUES ($1, 'Brand Inst', $2)",
            inst_id, f"BI-{str(inst_id)[:6]}",
        )
        for role, uid in users.items():
            await conn.execute(
                "INSERT INTO users (id, name, email, password_hash, role, institution_id, status) VALUES ($1, $2, $3, 'h', $4, $5, 'ACTIVE')",
                uid, f"User {role.value}", f"{role.value.lower()}_{uid}@brand.com", role.value, inst_id,
            )
        await conn.execute(
            "INSERT INTO student_profiles (id, user_id, institution_id, roll_number) VALUES (gen_random_uuid(), $1, $2, 'BR01')",
            users[Role.STUDENT], inst_id,
        )
        await conn.execute(
            "INSERT INTO trainer_profiles (id, user_id, institution_id) VALUES (gen_random_uuid(), $1, $2)",
            users[Role.TRAINER], inst_id,
        )

    trainer_ctx = DummyScope(users[Role.TRAINER], Role.TRAINER, inst_id)

    # 1. Banner upload (PNG) -> durable /api/v1/media/{uuid}
    png_bytes = _make_image_bytes("PNG", (800, 400))
    up_res = await upload_user_banner(_make_upload("banner.png", png_bytes, "image/png"), ctx=trainer_ctx)
    assert up_res["success"] is True
    banner_url = up_res["data"]["bannerUrl"]
    assert banner_url.startswith("/api/v1/media/")
    asset_id = banner_url.rsplit("/", 1)[-1]

    # 2. Media delivery endpoint serves image bytes with immutable cache header
    media_resp = await get_media_asset(asset_id)
    assert media_resp.status_code == 200
    assert media_resp.media_type == "image/png"
    assert "immutable" in media_resp.headers.get("cache-control", "")

    # 3. Save crop/position/style and verify reload persistence
    await update_user_banner_settings(
        BannerPatchRequest(posX=35, posY=65, scale=1.4, textColor="#F8F9FA", overlayType="dark", overlayOpacity=55, glassmorphism=True),
        ctx=trainer_ctx,
    )
    loaded = await get_user_banner(ctx=trainer_ctx)
    assert loaded["data"]["hasCustomBanner"] is True
    assert loaded["data"]["bannerUrl"] == banner_url
    assert loaded["data"]["posX"] == 35
    assert loaded["data"]["posY"] == 65
    assert loaded["data"]["scale"] == 1.4

    # 4. Replace banner with WebP -> new asset, old asset cleaned up
    webp_bytes = _make_image_bytes("WEBP", (640, 320))
    up_res2 = await upload_user_banner(_make_upload("banner2.webp", webp_bytes, "image/webp"), ctx=trainer_ctx)
    banner_url2 = up_res2["data"]["bannerUrl"]
    assert banner_url2 != banner_url
    with pytest.raises(NotFound):
        await get_media_asset(asset_id)

    # 5. Profile avatar upload across all 4 roles (JPEG)
    jpg_bytes = _make_image_bytes("JPEG", (256, 256))
    for role, uid in users.items():
        r_ctx = DummyScope(uid, role, inst_id)
        av_res = await upload_user_avatar(_make_upload("avatar.jpg", jpg_bytes, "image/jpeg"), ctx=r_ctx)
        av_url = av_res["data"]["avatarUrl"]
        assert av_url.startswith("/api/v1/media/")
        got = await get_user_avatar(ctx=r_ctx)
        assert got["data"]["avatarUrl"] == av_url

    # Verify student_profiles & trainer_profiles synced
    async with get_pg_connection() as conn:
        sp_av = await conn.fetchval("SELECT avatar_url FROM student_profiles WHERE user_id = $1", users[Role.STUDENT])
        tp_av = await conn.fetchval("SELECT profile_photo_url FROM trainer_profiles WHERE user_id = $1", users[Role.TRAINER])
        assert sp_av and sp_av.startswith("/api/v1/media/")
        assert tp_av and tp_av.startswith("/api/v1/media/")

    # 6. Security: invalid format, oversized, unauthenticated, path traversal, and preserving old image on failed replacement
    with pytest.raises(ValidationError):
        await upload_user_banner(_make_upload("bad.jpg", b"not-a-real-jpeg-payload-at-all-123456", "image/jpeg"), ctx=trainer_ctx)
    with pytest.raises(ValidationError):
        await upload_user_avatar(_make_upload("big.png", b"\x89PNG\r\n\x1a\n" + b"0" * (5 * 1024 * 1024 + 10), "image/png"), ctx=trainer_ctx)
    with pytest.raises(Unauthenticated):
        await upload_user_banner(_make_upload("banner.png", png_bytes, "image/png"), ctx=DummyScope(None, Role.TRAINER))
    with pytest.raises(NotFound):
        await get_media_asset("../../etc/passwd")

    # Failed replacement preserves previous banner
    loaded_after_err = await get_user_banner(ctx=trainer_ctx)
    assert loaded_after_err["data"]["bannerUrl"] == banner_url2

    # 7. Reset to default banner & delete avatar
    del_ban = await delete_user_banner(ctx=trainer_ctx)
    assert del_ban["data"]["hasCustomBanner"] is False
    del_av = await delete_user_avatar(ctx=trainer_ctx)
    assert del_av["data"]["avatarUrl"] is None
