# CNC LMS Open Defects & Remaining Risks

**Date**: November 15, 2026  
**Auditor**: Senior QA Automation Engineer + Backend Test Engineer + Security Auditor  
**Status Overview**: 0 Critical Open Code Defects; External Service Dependencies Noted Below.

---

## 1. Defect Backlog Resolution Status

| Defect ID | Title | Previous Status | Current Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **BUG001** | Sign-in redirect & session persistence | Reported | **VERIFIED** | Preserves redirect query parameters across login and signup. |
| **BUG002** | False duplicate account conflict | Reported | **VERIFIED** | Scopes roll number uniqueness per institution; isolates email errors. |
| **BUG003** | Missing password visibility toggle | Reported | **VERIFIED** | Accessible Eye/EyeOff toggle implemented across all auth views. |
| **BUG004** | Missing year-wise class grouping in HOD | Reported | **VERIFIED** | Academic year mapped to semester cohorts (3–4, 5–6, 7–8). |
| **BUG005** | Super Admin Arya College Control Center | Reported | **VERIFIED** | Resolves Arya College UUID and ACEIT code with full operational data. |
| **BUG006** | Text overflow in Courses and Catalog | Reported | **VERIFIED** | Responsive flex grids with `min-w-0` and text truncation active. |
| **BUG007** | YouTube link does not open | Reported | **VERIFIED** | Destination link corrected with safe stacking context. |
| **TRN001-011** | Trainer Portal 11 Reported Issues | Reported | **VERIFIED** | Banner, batches, sessions, attention, evaluations, AI scores, assignments, progress, reports, and logos verified. |
| **STU001-006** | Student Portal & AI Practice Lab Issues | Reported | **VERIFIED** | Progress PDF, audio recording persistence, lesson completion, and ATS resume checker verified. |

---

## 2. External Dependencies & Operational Risks

### DEF-EXT-001: Third-Party Hosted AI Provider Credentials
- **Status**: **BLOCKED (External Dependency)**
- **Detail**: In development and local environments, `AI_PROVIDER` defaults to `mock` and `AI_API_KEY` is not populated. The application runs a deterministic, feature-based local analysis engine measuring actual transcript attributes (filler words, word count, pace, structure markers).
- **Risk Assessment**: Production deployment requires configuring `AI_PROVIDER=anthropic` or `openai` with valid API keys and sufficient credit quotas in Vercel/Render environment settings to execute live third-party LLM inference.
- **Remediation**: Add verified vendor API keys to production deployment environment variables.

### DEF-EXT-002: Live Production SMTP Configuration
- **Status**: **INFORMATIONAL / VERIFIED IN POSTGRES MODE**
- **Detail**: Email verification is toggled by `EMAIL_VERIFICATION_ENABLED`. In staging/local, verification bypass is supported for rapid testing.
- **Remediation**: Ensure production AWS SES, SendGrid, or Resend credentials are configured for outbound activation and password reset emails.
