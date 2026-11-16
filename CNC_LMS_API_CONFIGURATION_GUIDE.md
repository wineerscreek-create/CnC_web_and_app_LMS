# CNC LMS API Configuration & Credential Guide

**Target System**: Campus to Corporate Learning Management System (CNC LMS / Winners Creek LMS)  
**Document Generated**: November 15, 2026  
**Security Classification**: Configuration Specification (Zero Secrets Contained)

---

## 1. Executive Summary

This guide specifies the exact variable names, target configuration files, and destination scopes for the three external integrations:
1. **Google Gemini API** (Primary LLM Provider)
2. **Groq API** (Secondary LLM Provider & Primary Speech-to-Text Provider)
3. **Supabase Storage** (Private Object Storage Provider, Bucket: `cnc-lms-files`)

> [!IMPORTANT]
> **Zero-Secrets Policy**: Never paste secret keys into chat prompts, commit them to git repositories, or expose privileged secret keys to client-side bundles. Only configure secrets in your local uncommitted `.env` files or secure production environment secret managers (Render / Vercel).

---

## 2. Master Credential Location Map

The following table maps every required credential to its exact variable name, configuration file location, and purpose:

| Service | Environment Variable Name | Target File / Location | Scope / Privileges | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Google Gemini** | `GEMINI_API_KEY` | `apps/api/.env` (and root `.env`) | Backend Server-Side Only | Primary AI Provider for AI Coach, Resume Analyzer, ATS Evaluation, Mock Interviews, Role-play, and Recommendations. |
| **Groq API** | `GROQ_API_KEY` | `apps/api/.env` (and root `.env`) | Backend Server-Side Only | Secondary LLM Provider (automated fallback) AND Speech-to-Text (STT) provider for voice practice and interview transcription. |
| **Supabase Project URL** | `SUPABASE_URL` | `apps/api/.env` | Backend Server-Side (can also be in `apps/web/.env.local` if public client needs it) | Target Supabase REST & Storage API connection endpoint (`https://<project-ref>.supabase.co`). |
| **Supabase Publishable Key** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `apps/web/.env.local` (and `apps/api/.env` as `SUPABASE_ANON_KEY`) | Client & Server (Public / Anon RLS) | Public client access for browser-initiated public queries or anon client initialization. |
| **Supabase Secret Key** | `SUPABASE_SERVICE_ROLE_KEY` | `apps/api/.env` (and root `.env`) | **Strictly Backend Server-Side Only** (Privileged) | Privileged server-side operations for private bucket uploads (`cnc-lms-files`), signing download tokens, and server-managed storage. |
| **Supabase Storage Bucket** | `SUPABASE_STORAGE_BUCKET` | `apps/api/.env` | Backend Server-Side | Target private storage bucket name: `cnc-lms-files`. |

---

## 3. Exact File Paths for Local Development

### A. Backend Configuration File
- **Path**: `c:\Users\SANDEEP\Desktop\skillsharp\apps\api\.env`  
  *(Also loaded from root `c:\Users\SANDEEP\Desktop\skillsharp\.env`)*

Add or update the following block in `apps/api/.env`:

```bash
# ==============================================================================
# AI Provider Configuration (Gemini Primary + Groq Secondary/STT)
# ==============================================================================
AI_PROVIDER=gemini
AI_MODEL=gemini-2.0-flash
GEMINI_API_KEY=your_gemini_api_key_here

# Groq acts as secondary LLM fallback and speech-to-text provider
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
STT_PROVIDER=groq
STT_MODEL=whisper-large-v3-turbo

# ==============================================================================
# Supabase Object Storage Configuration (Bucket: cnc-lms-files)
# ==============================================================================
STORAGE_DRIVER=supabase
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_supabase_publishable_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_secret_service_role_key_here
SUPABASE_STORAGE_BUCKET=cnc-lms-files
```

### B. Frontend Configuration File (Optional / Client-Side)
- **Path**: `c:\Users\SANDEEP\Desktop\skillsharp\apps\web\.env.local`

If direct public Supabase client features are utilized:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_anon_key_here
```
> [!CAUTION]
> **NEVER** place `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, or `GROQ_API_KEY` into `apps/web/.env.local` or prefix them with `NEXT_PUBLIC_`. Privileged keys must reside strictly on the FastAPI backend server.

---

## 4. Production Deployment Configuration (Render & Vercel)

When deploying to production:

### 1. Backend Service (Render / Cloud VPS)
In the Render Dashboard under **Environment Variables**, define:
- `GEMINI_API_KEY` = `<your-gemini-api-key>`
- `AI_PROVIDER` = `gemini`
- `AI_MODEL` = `gemini-2.0-flash`
- `GROQ_API_KEY` = `<your-groq-api-key>`
- `GROQ_MODEL` = `llama-3.3-70b-versatile`
- `STT_PROVIDER` = `groq`
- `STT_MODEL` = `whisper-large-v3-turbo`
- `STORAGE_DRIVER` = `supabase`
- `SUPABASE_URL` = `<your-supabase-project-url>`
- `SUPABASE_ANON_KEY` = `<your-supabase-publishable-key>`
- `SUPABASE_SERVICE_ROLE_KEY` = `<your-supabase-secret-key>`
- `SUPABASE_STORAGE_BUCKET` = `cnc-lms-files`

### 2. Frontend Application (Vercel)
In the Vercel Dashboard under **Environment Variables**:
- `NEXT_PUBLIC_APP_URL` = `https://cnc-lms.vercel.app`
- `API_PROXY_TARGET` = `https://your-backend-api.onrender.com`
- `NEXT_PUBLIC_SUPABASE_URL` = `<your-supabase-project-url>`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `<your-supabase-publishable-key>`
*(No secret keys)*

---

## 5. Next Steps

1. Please open `apps/api/.env` (or create it from `apps/api/.env.example`) and insert your actual keys:
   - `GEMINI_API_KEY`
   - `GROQ_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_STORAGE_BUCKET=cnc-lms-files`
2. Save the file.
3. Confirm in the chat when you have entered the credentials so that we can proceed with testing and validating the live integration.
