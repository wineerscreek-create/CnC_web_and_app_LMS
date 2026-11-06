# Homepage "Meet Our Expert Trainers" & Public Dossier Report

## Overview
A dedicated "Meet Our Expert Trainers" section has been integrated into the Winners Creek LMS homepage (`/`) immediately above the footer, paired with dynamic public trainer dossier pages at `/trainers/[slug]`.

## 1. Homepage Showcase Section (`apps/web/src/app/(public)/page.tsx`)
- **Headline**: "Meet Our Expert Trainers"
- **Subtitle**: "Learn directly from distinguished corporate facilitators, master storytellers, and executive leadership coaches."
- **Data Source**: Fetches from `/api/v1/public/trainers` (with fallback to `/home/trainers`).
- **Layout & Carousel**:
  - Horizontal smooth-scrolling carousel with navigation controls (Left / Right buttons) and touch/drag scroll support.
  - Automatically accommodates varying trainer roster sizes: compact view for 3–4 trainers, scrolling carousel when > 5 trainers.
- **Card UI & Micro-Interactions**:
  - Profile photo with initial fallback.
  - Full name, designation, and location.
  - Rating badge (`★ 5.0`) and experience badge (`8.5 Years Exp`).
  - Areas of expertise tags (e.g. `Executive Presence`, `Campus Readiness`).
  - Short bio snippet with line clamping.
  - "View Profile" link pointing to `/trainers/${trainer.publicSlug}`.
  - Hover states: `scale(1.03)`, elevation shadow, subtle border highlight.

## 2. Dynamic Trainer Dossier Page (`apps/web/src/app/(public)/trainers/[slug]/page.tsx`)
- **Route**: Next.js App Router dynamic route `/trainers/[slug]`.
- **Layout**: Two-column responsive architecture:
  - **Left Column**:
    - Large avatar photo, full name, professional headline, and location.
    - Verified Faculty badge and average student rating (`5.0 / 5.0`).
    - Quick facts: experience, current organization, languages spoken.
    - Verified social links: LinkedIn, GitHub, and Portfolio.
    - Primary CTA: **"Book a Session / Inquire Now"**.
  - **Right Column**:
    - About & Biography narrative.
    - Pedagogical expertise tags.
    - Facilitation methodology and teaching philosophy.
    - Academic qualifications (Education).
    - Industry accreditations & certifications with verification links.
    - Teaching portfolio: core curriculum tracks and key career milestones.
- **Inquiry Modal**:
  - Full Name, Work Email, Contact Phone, Organization/College, Session Type dropdown, and requirements message.
  - Connects to `POST /api/v1/public/trainers/{slug}/inquire` (persists to `trainer_inquiries` table in PostgreSQL).
  - Displays instant visual confirmation upon submission.
