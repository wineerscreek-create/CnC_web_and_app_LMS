# Winners Creek LMS — Homepage & Trainer Showcase Delivery Bundle

## Overview
This standalone bundle encapsulates the complete modern frontend architecture of the Winners Creek LMS Homepage (`/`), the interactive "Meet Our Expert Trainers" showcase carousel, the dynamic trainer dossier pages (`/trainers/[slug]`), and the core UI/UX primitives (such as `TiltCard`, `StaggerContainer`, and `GlobalBackgroundLayer`).

## Directory Structure
- `page.tsx`: Full modernized landing page for Winners Creek LMS with Hero, Metrics, Asymmetric Bento, Curricula, Testimonials, "Meet Our Expert Trainers" carousel, and Conversion CTA.
- `layout.tsx`: Root public wrapper integrating `site-chrome.tsx` with header, navigation bar, and responsive footer.
- `trainers-slug-page.tsx`: Dynamic App Router page (`/trainers/[slug]`) featuring two-column profile dossier, verified credentials, methodology, and the "Book a Session / Inquire Now" modal.
- `components/`:
  - `TiltCard.tsx`: Pointer-reactive 3D tilt component with dynamic radial specular glare and reduced-motion fallback.
  - `StaggerContainer.tsx`: Coordinated 3D staggered card reveal utility.
  - `site-chrome.tsx`: Unified header, mobile drawer, and footer navigation chrome.
  - `button.tsx`, `card.tsx`, `badge.tsx`, `dialog.tsx`: Design system UI primitives.
  - `GlobalBackgroundLayer.tsx`: Subtle ambient background layer with ivory/charcoal/mustard accents.
- `styles/globals.css`: Tailwind 3 CSS variables, Ivory/Charcoal/Mustard theme definitions, 3D entrance keyframes (`@keyframes entranceCard3D`), and accessibility overrides.
- `hooks/`:
  - `useApi.ts`: In-flight request caching, deduplication, and session-aware fetch hook.
  - `motion-config.ts`: Hardware-accelerated pointer fine check and `prefers-reduced-motion` listener.
- `api/`:
  - `api.ts`: Central Axios/fetch HTTP client with automatic 401 token rotation and retry logic.
  - `cn.ts`: Class name merger utility using `clsx` and `tailwind-merge`.
- `types/`:
  - `BannerContext.tsx`: Global user hero banner persistence context with localStorage caching.
