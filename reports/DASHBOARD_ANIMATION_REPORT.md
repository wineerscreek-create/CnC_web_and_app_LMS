# Dashboard 3D Tilt & Staggered Reveal Animation Report

## Overview
This report details the implementation of the Magical 3D Tilt effect (`TiltCard.tsx`) and the Staggered 3D Card Entrance Animation (`StaggerContainer.tsx`) across Winners Creek LMS dashboard interfaces.

## 1. Magical 3D Tilt Effect (`TiltCard.tsx`)
- **Location**: `apps/web/src/components/ui/TiltCard.tsx`
- **Mechanics**:
  - Dynamically computes pointer position relative to card boundaries.
  - Generates balanced `rotateX` and `rotateY` transforms within a bounded safe range (max 6–8 degrees).
  - Employs `perspective(1000px)` and gentle `scale3d(1.02, 1.02, 1)` for tangible physical elevation without layout shift.
  - Coordinates a radial specular reflection glare layer responding to cursor coordinates (`--mouse-x`, `--mouse-y`, `--glare-opacity`).
- **Performance & Accessibility**:
  - Automatically disabled on touch devices via `useIsPointerFine()`.
  - Automatically disabled when the user prefers reduced motion via `usePrefersReducedMotion()`.
  - Hardware accelerated with `preserve-3d`, `will-change-transform`, and smooth CSS spring return transition on mouse leave.
- **Applied Surfaces**:
  - Applied to primary cards on the student dashboard: `Continue Learning`, `Today's Practice Quest`, `Career Readiness Analysis`, `Next Live Class`, and `Self-Paced Practice Modes`.

## 2. Magical 3D Staggered Entrance Animation (`StaggerContainer.tsx`, `globals.css`)
- **Location**: `apps/web/src/components/ui/StaggerContainer.tsx` and `apps/web/src/styles/globals.css`.
- **Keyframe Specification**:
  ```css
  @keyframes entranceCard3D {
    0% {
      opacity: 0;
      transform: perspective(1000px) translateY(24px) rotateX(15deg) scale(0.97);
    }
    100% {
      opacity: 1;
      transform: perspective(1000px) translateY(0) rotateX(0deg) scale(1);
    }
  }

  .animate-entrance-3d {
    animation: entranceCard3D 650ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
    opacity: 0;
    will-change: transform, opacity;
  }
  ```
- **Stagger Coordination**:
  - `StaggerContainer` orchestrates entrance sequence with configurable `staggerMs` (default 100ms per child) and `initialDelayMs`.
  - `StaggerItem` assigns progressive delays (`0ms`, `100ms`, `200ms`, `300ms`...).
  - Full support for `prefers-reduced-motion`: reduces animation to instantaneous paint without rotational transforms.
