# HERO BANNER IMPLEMENTATION REPORT (P0)
**Feature:** LinkedIn-Style Customizable Dashboard & Profile Banner  
**Status:** IMPLEMENTED, TESTED & PERSISTED  

---

## 1. Architectural Design & Storage Strategy
To satisfy strict multi-tenant security and zero database bloat:
- **No Base64 Blobs in PostgreSQL**: Image files are uploaded, validated, and saved under `apps/api/static/banners/{user_id}/{filename}` (with support for S3 keys via storage interface).
- **Relational Metadata Storage**: Created `user_banners` table in PostgreSQL migration `005_user_banners_and_learning_content.sql`:
  - `user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  - `banner_url TEXT NOT NULL`
  - `pos_x INT NOT NULL DEFAULT 50`
  - `pos_y INT NOT NULL DEFAULT 50`
  - `scale NUMERIC(4,2) NOT NULL DEFAULT 1.00`
  - `crop_data JSONB DEFAULT '{}'::jsonb`
  - `text_color VARCHAR(20) NOT NULL DEFAULT '#FFFFFF'`
  - `overlay_type VARCHAR(20) NOT NULL DEFAULT 'dark'`
  - `overlay_opacity INT NOT NULL DEFAULT 40`
  - `glassmorphism BOOLEAN NOT NULL DEFAULT true`

---

## 2. Backend API Endpoints (`apps/api/app/routers/user_banner.py`)
- `POST /api/v1/user/banner/upload`:
  - Enforces MIME validation (`image/jpeg`, `image/png`, `image/webp`).
  - Enforces extension validation (`.jpg`, `.jpeg`, `.png`, `.webp`).
  - Magic number byte validation (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WEBP `RIFF...WEBP`).
  - Size limit: 5 MB (`5 * 1024 * 1024` bytes).
  - Binds upload strictly to the authenticated `ctx.user_id`.
- `GET /api/v1/user/banner`:
  - Retrieves current banner settings or returns standard default fallback.
- `PATCH /api/v1/user/banner`:
  - Updates `posX`, `posY`, `scale`, `textColor`, `overlayType`, `overlayOpacity`, `glassmorphism`.
  - Validates `textColor` (#FFFFFF, #F8F9FA, #1E293B, #0B0F19) and `overlayOpacity` (0–90%).
- `DELETE /api/v1/user/banner`:
  - Deletes custom banner record and resets dashboard to default branding.

---

## 3. Frontend Component Suite
- **`<HeroBanner>` (`apps/web/src/components/dashboard/HeroBanner.tsx`)**:
  - Live background layer with `backgroundPosition: ${posX}% ${posY}%` and `transform: scale(${scale})`.
  - Dynamic smart overlay (Dark / Light gradient with custom opacity slider).
  - Optional glassmorphism text container for readability over photographic backgrounds.
  - Contextual role subtitle, welcome greeting, and quick action buttons.
  - Integrated across all 5 role dashboards (Participant, Trainer, SPOC, Institution Admin, Super Admin).
- **`<BannerSettingsModal>` (`apps/web/src/components/dashboard/BannerSettingsModal.tsx`)**:
  - 3-step configuration tabs:
    1. **Image Source**: Drag & drop or file picker, remove custom image.
    2. **Crop & Reposition**: Horizontal slider (0–100%), Vertical slider (0–100%), Zoom scale slider (1.0x–2.5x).
    3. **Text & Overlay**: 4 preset color swatches, Dark/Light gradient selector, Opacity slider (0–90%), Glassmorphism checkbox.
  - Live interactive preview with desktop and mobile viewport toggles.
  - "Reset to Default" and "Save Banner" actions with immediate Redux/API synchronization.

---

## 4. Verification Evidence
- `py -3.13 audit_all_roles.py`: `GET /api/v1/user/banner` tested and passed (200 OK) across Super Admin, Admin, Trainer, and Student.
- File upload validations verified with size bounds and extension whitelisting.
- Multi-device preview verified for 360px mobile viewports up to 1440px desktop screens.

