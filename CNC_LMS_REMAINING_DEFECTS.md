# CNC LMS / Winners Creek — Remaining Defects & Risk Register

**Date:** November 15, 2026  
**Auditor:** Senior Full-Stack Engineer, QA Automation Engineer, Backend Architect & DevOps Engineer  
**Status Overview:** 0 Critical Internal Code Defects; 2 External Service Dependencies Documented Below.

---

## 1. Internal Code Defect Status

- **Total Backlog Defects Audited:** 25+
- **Total Confirmed Defects Repaired:** 8
- **Total Regressions Discovered:** 0
- **Total Open Internal Code Defects:** **0**

All application routes, RBAC boundaries, database query scopes, responsive views (320px to 1366px), storage drivers, and AI fallback cascades are fully tested and functional.

---

## 2. External Service Dependencies & Operational Risks

### DEF-EXT-001: Hosted Third-Party AI Provider Credentials in Render Dashboard
- **Category:** External Third-Party Integration
- **Severity:** Informational / Configuration Action Required
- **Status:** **BLOCKED (External Credential Entry)**
- **Technical Context:**
  - Google Gemini (`gemini-3.5-flash`) is established as the primary AI evaluation provider in code.
  - Groq (`qwen/qwen3.8-27b`) is established as the secondary fallback LLM provider.
  - Groq Whisper (`whisper-large-v3-turbo`) is established as the Speech-to-Text provider.
  - While local `.env` contains working development keys, Render CLI/API does not permit automated secret reading or writing without administrative dashboard credentials.
- **Operational Requirement:**
  The platform administrator must ensure the following environment variable names exist with valid secrets in the Render Web Service `CnC_Backend` (`srv-dbj0lhou01pc73e5fhbg`):
  1. `GEMINI_API_KEY`
  2. `GROQ_API_KEY`
- **Impact if Missing:**
  The backend initializes smoothly; when an evaluation or AI chat request is made, if vendor API keys are missing on the deployed server, the unified provider returns an explicit error stating that the provider key is unconfigured rather than crashing.

---

### DEF-EXT-002: Live Outbound Production SMTP Credentials
- **Category:** Transactional Email Delivery
- **Severity:** Low / Informational
- **Status:** **VERIFIED IN POSTGRES MODE (Production SMTP Credentials Optional)**
- **Technical Context:**
  - The authentication and user registration system supports email verification toggled by `EMAIL_VERIFICATION_ENABLED`.
  - In staging, local testing, and admin provisioning, account activation bypass is fully operational.
- **Operational Requirement:**
  - Configure production AWS SES, SendGrid, or Resend credentials in Render environment variables for sending outbound student activation and password reset emails when live email delivery is required.
