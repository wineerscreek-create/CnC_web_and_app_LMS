# Sync & Upstream Change Analysis

**Generated:** 2026-11-05
**Target Branch:** `origin/main` (`d7649d8`)
**Merge Base:** `3934fb9`
**Working Branch:** `sync/upstream-20261105`
**Safety Backup:** Branch `backup/pre-sync-20261105` | Tag `pre-sync-20261105`

---

## 1. Upstream Commits Analysis

Total upstream commits pending sync: **5 commits**
- **Date Range:** Sun Nov 1, 2026 15:33:00 +0530 — Mon Nov 2, 2026 19:18:48 +0530
- **Author:** Sandeep / Sandeep Choudhary (`sk74531614@gmail.com` / `sandeep977244@gmail.com`)

| Commit | Summary | Category / Impact |
|---|---|---|
| `d7649d8` | `fix: resolve production 500 errors across student, trainer, and super-admin routes` | Backend repository SQL query fixes (`access_status = 'ACTIVE'` vs `'GRANTED'`), error handling fallbacks |
| `2aef8f5` | `fix: resolve authentication OTP and session handling issues` | Authentication and password recovery token handling |
| `9878b34` | `fix: resolve authentication OTP and session handling issues` | Session verification and OTP resend pipeline |
| `df5b074` | `Update Sign Up page UX` | Signup layout restructuring and responsive spacing adjustments |
| `1428c3f` | `Update authentication UI and components` | Forgot password identifier support, select dropdown truncation, password strength rule grid |

---

## 2. File Grouping & Classification

### A. Database (Migrations & Schemas)
- `apps/api/migrations/004_password_reset_tokens.sql` (NEW)
  - Adds `reset_password_token_hash` and `reset_password_token_expires_at` with partial index to the `users` table for secure password reset.
  - **Action Required for User:** Run database migration on the target database (per Hard Rule 4, the assistant will NOT execute this).

### B. Deployment & Configuration
- `.env.example` & `apps/api/.env.example`: Added `EMAIL_VERIFICATION_ENABLED=false` flag.
- `render.yaml`: Added `EMAIL_VERIFICATION_ENABLED=false` to environment definitions.

### C. Backend (`apps/api` - Read-Only / Upstream-Owned)
- `apps/api/app/authz/guards.py`: Respects `EMAIL_VERIFICATION_ENABLED` setting.
- `apps/api/app/core/config.py`: Added `EMAIL_VERIFICATION_ENABLED` config setting.
- `apps/api/app/db/mongo.py`: Removed strict production exception for mongo fallback.
- `apps/api/app/repositories/ebook_repo.py`: Fixed enrollment query to accept `access_status = 'ACTIVE'` or `enrollment_status = 'ACTIVE'`.
- `apps/api/app/repositories/live_class_repo.py`: Fixed attendance query to check `access_status = 'ACTIVE'`.
- `apps/api/app/repositories/user_repo.py`: Added password reset token storage methods.
- `apps/api/app/routers/auth.py`: Updated `/auth/forgot-password` to accept `identifier` (username or email), generates secure random tokens with 15-minute expiry.
- `apps/api/app/routers/student.py`: Protected `learning-path` endpoint against missing courses/null records.
- `apps/api/app/routers/super_admin.py`: Improved safety checks on system endpoints.
- `apps/api/app/schemas/requests.py`: Updated `ForgotPasswordRequest` to include `identifier: Optional[str] = None`.
- `apps/api/app/services/chat_service.py`: Improved chat session resilience.
- `apps/api/app/services/email_service.py`: Updated reset email sender to support direct URL token links.
- `apps/api/app/services/session_service.py`: Hardened session revocation.
- Test suites: `audit_all_roles.py`, `test_all_14_cases.py`, `tests/test_audit_14_cases.py`, `tests/test_auth_suite.py`.

### D. Frontend (`apps/web`)

| File | Classification | Functional Changes | Visual / Styling Changes | Conflict Predicted? |
|---|---|---|---|:---:|
| `(auth)/forgot-password/page.tsx` | **Both** | Supports `identifier` instead of only `email` for password reset | Success message copy adjusted | **Yes** (modified by our design token retheme) |
| `(auth)/layout.tsx` | **Visual** | None | Changed grid layout container to `min-h-dvh box-border` and responsive padding | **Yes** (conflict with our theme shell) |
| `(auth)/login/page.tsx` | **Both** | Removed OTP/email-verification intercept on login error | Form button layout tweaks | **Yes** (conflict with our token classes) |
| `(auth)/reset-password/page.tsx` | **Both** | Handles reset tokens from email links | Header and field layouts | **Yes** (conflict with our token classes) |
| `(auth)/signup/page.tsx` | **Both** | Dynamic department/college selection and field validation | Compact multi-column grid | **Yes** (conflict with our token classes) |
| `components/auth/password-strength.tsx` | **Visual** | None | 2-column rule item grid | **Yes** (conflict with our token classes) |
| `components/ui/GlobalBackgroundLayer.tsx` | **Visual** | None | Replaced hook theme check with pure `dark:` class | **Yes** (conflict with our token classes) |
| `components/ui/select.tsx` | **Visual** | None | Added overflow text-ellipsis truncation to select trigger | **Yes** (conflict with our token classes) |
| `store/authSlice.ts` | **Functional** | Simplified login error handling (no verificationRequired check) | None | **No** (merges cleanly) |
| `package-lock.json` | **Config** | Lockfile dependency resolution | None | **No** (regenerated in Phase 6) |
| `tsconfig.tsbuildinfo` | **Build artifact** | Build metadata cache | None | **Yes** (rebuilt during compile) |

---

## 3. Predicted Merge Conflicts & Resolution Strategy

All 9 predicted conflicts are strictly in `apps/web/`:
1. `(auth)/forgot-password/page.tsx`:
   - *Resolution:* Adopt upstream's `identifier` state and API payload (`{ identifier: identifier.trim() }`) while retaining our Ivory/Sage/Gold semantic tokens (`bg-background`, `bg-card`, `border-border`, `text-foreground`, `text-heading`, `text-muted-foreground`, `bg-primary text-primary-foreground`).
2. `(auth)/layout.tsx`:
   - *Resolution:* Adopt upstream's tighter responsive heights (`min-h-dvh box-border py-4 sm:px-10 lg:px-12`) while keeping our `SkillSharpLogo`, semantic theme background, and card borders.
3. `(auth)/login/page.tsx`:
   - *Resolution:* Adopt upstream's streamlined login submission logic (no OTP intercept) while retaining our full design token button and form styling.
4. `(auth)/reset-password/page.tsx`:
   - *Resolution:* Adopt upstream's token URL parameter parsing and submission logic, preserving our design tokens.
5. `(auth)/signup/page.tsx`:
   - *Resolution:* Adopt upstream's updated form fields and registration logic, fully styled with semantic tokens and zero hardcoded legacy colors.
6. `components/auth/password-strength.tsx`:
   - *Resolution:* Adopt upstream's 2-column grid layout with our semantic color classes (`text-primary`, `text-muted-foreground`).
7. `components/ui/GlobalBackgroundLayer.tsx`:
   - *Resolution:* Adopt upstream's cleaner `dark:` utility classes with our ambient background styling.
8. `components/ui/select.tsx`:
   - *Resolution:* Retain upstream's truncation classes (`truncate whitespace-nowrap overflow-hidden text-ellipsis`) with our semantic borders and focus rings.
9. `apps/web/tsconfig.tsbuildinfo`:
   - *Resolution:* Accept our/upstream version; will be overwritten during typecheck and build.

---

## 4. API Contract Changes Summary

1. **`POST /auth/forgot-password`**:
   - Request body now accepts `{"identifier": "<username_or_email>"}` (in addition to legacy `email`).
2. **`POST /auth/resend-otp`**:
   - For password reset, upstream now generates a cryptographic URL-safe token stored as SHA-256 in the database and sends a direct reset link (`/reset-password?token=...`).
3. **`POST /auth/login`**:
   - If `EMAIL_VERIFICATION_ENABLED` is `false`, users can log in immediately upon creation without email verification gating.
4. **Database Migration 004**:
   - Table `users`: adds `reset_password_token_hash VARCHAR(255)` and `reset_password_token_expires_at TIMESTAMPTZ`.

---

## 5. New Environment Variables

- `EMAIL_VERIFICATION_ENABLED`: (Boolean, default `true` in code, set to `false` in `.env.example` and `render.yaml` for local/staging deployments without active SMTP credentials).
