# Component Dependency Map

```mermaid
graph TD
    RootLayout["app/layout.tsx"] --> StoreProvider["StoreProvider"]
    StoreProvider --> ThemeProvider["ThemeProvider"]
    ThemeProvider --> BannerProvider["BannerProvider (BannerContext.tsx)"]
    BannerProvider --> GlobalBackground["GlobalBackgroundProvider"]

    subgraph Public Pages
        PublicLayout["(public)/layout.tsx"] --> SiteChrome["site-chrome.tsx (Navbar + Footer)"]
        SiteChrome --> HomePage["page.tsx (Landing Page)"]
        SiteChrome --> TrainerSlug["trainers/[slug]/page.tsx"]
        
        HomePage --> TiltCard["TiltCard.tsx"]
        HomePage --> StaggerContainer["StaggerContainer.tsx"]
        HomePage --> UseApiHook["useApi.ts"]
        
        TrainerSlug --> BookingDialog["dialog.tsx (Inquiry Modal)"]
        TrainerSlug --> UseApiHook
    end

    subgraph Authenticated Trainer Portal
        TrainerProfilePage["trainer/profile/page.tsx"] --> UseApiHook
        TrainerProfilePage --> ApiClient["api.ts (PATCH /profile, POST /photo)"]
        TrainerProfilePage --> ButtonComp["button.tsx"]
        TrainerProfilePage --> CardComp["card.tsx"]
    end

    subgraph Backend API Integration
        UseApiHook --> PublicTrainersApi["GET /api/v1/public/trainers"]
        TrainerSlug --> PublicTrainerSlugApi["GET /api/v1/public/trainers/:slug"]
        TrainerSlug --> PublicInquireApi["POST /api/v1/public/trainers/:slug/inquire"]
        TrainerProfilePage --> TrainerProfileApi["GET/PATCH /api/v1/trainer/profile"]
        BannerProvider --> BannerApi["GET/PATCH /api/v1/user/banner"]
    end
```

### Motion and Interaction Dependencies
- `TiltCard.tsx` depends on `motion-config.ts` (`usePrefersReducedMotion`, `useIsPointerFine`).
- `StaggerContainer.tsx` depends on `@keyframes entranceCard3D` defined in `globals.css`.
- `BannerContext.tsx` depends on `api.ts` and Redux `auth.user.id` for user-scoped cache isolation.
