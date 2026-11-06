# Homepage & Trainer Showcase File Inventory

| File Path | Purpose | Key Exports / Responsibilities |
| :--- | :--- | :--- |
| `page.tsx` | Main Public Landing Page | `HomePage` component containing hero, stats counters, 7-pillar showcase, courses grid, "Meet Our Expert Trainers" smooth carousel, testimonials, and CTA. |
| `layout.tsx` | Public Page Layout Wrapper | Wraps public pages with `PublicPage` site-chrome (Navbar + Footer). |
| `trainers-slug-page.tsx` | Dynamic Trainer Profile Route | Displays detailed trainer dossier (`/trainers/[slug]`), certifications, pedagogy, and handles session inquiries. |
| `components/TiltCard.tsx` | Interactive 3D Tilt Card | `TiltCard`, `TiltCardProps` with pointer coordinates tracking, max angle limits, and specular glare. |
| `components/StaggerContainer.tsx` | Sequential Reveal Utility | `StaggerContainer`, `StaggerItem` coordinating staggered entrance keyframes. |
| `components/site-chrome.tsx` | Header, Mobile Nav & Footer | `PublicPage`, `PublicNav`, `PublicFooter` responsive navigation framework. |
| `components/button.tsx` | Button Primitive | Primary, secondary, subtle, and ghost button variants. |
| `components/card.tsx` | Card Primitive | Clean bento card containers with `CardHeader`, `CardTitle`, `CardBody`. |
| `components/badge.tsx` | Badge Primitive | Status and category badges (mustard, charcoal, neutral). |
| `components/dialog.tsx` | Modal / Dialog Primitive | Accessible Radix UI / headless dialog implementation for Inquiry and Settings modals. |
| `styles/globals.css` | Global Style Definitions | CSS variable definitions for ivory, charcoal, mustard, 3D entrance animations, and reduced motion queries. |
| `hooks/useApi.ts` | Data Fetching Hook | `useApi` providing data unwrapping, loading state, error handling, and manual `refetch`. |
| `hooks/motion-config.ts` | Motion & Hardware Hooks | `usePrefersReducedMotion`, `useIsPointerFine`, physics spring easing configurations. |
| `api/api.ts` | API Client & Error Model | `api.get`, `api.post`, `api.patch`, `api.delete`, `ApiError`, automatic JWT refresh handler. |
| `api/cn.ts` | Tailwind Class Utility | `cn()` helper merging classes cleanly without conflicts. |
| `types/BannerContext.tsx` | Persistent Banner State | `BannerProvider`, `useBanner`, `DEFAULT_BANNER`, client-side local storage caching. |
