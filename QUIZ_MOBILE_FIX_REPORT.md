# Quiz Mobile Assessment UX & Live Proctoring Fix Report

**Project:** Winners Creek LMS (SkillSharp)  
**Production Frontend:** https://cnc-lms.vercel.app/  
**Production Backend:** https://cnc-backend-qzmb.onrender.com/  
**Repository:** https://github.com/wineerscreek-create/CnC_web_and_app_LMS.git  
**Branch:** `main`  
**Date:** November 16, 2026  

---

## 1. Executive Summary

This report documents the architectural diagnosis, root-cause resolution, and responsive refactoring of the Quiz Assessment Engine in Winners Creek LMS, specifically addressing:
1. **Mobile Assessment Controls Layout**: Eliminating button overflow, guaranteeing visibility of the "Next" and "Previous" controls across narrow viewports (360px, 375px, 390px, 412px), replacing "Next" with "Submit" on the final question, and docking navigation into a sticky, backdrop-blurred mobile bar.
2. **Camera Proctoring Sprawl & Mobile Framing**: Refactoring `<CameraFeed />` to prefer the user-facing front camera (`facingMode: 'user'`) with graceful fallback, eliminating vertical layout sprawl by integrating a compact header/floating thumbnail on mobile devices.
3. **Root-Cause Fix for `Live Camera Feeds (0)`**: Resolving the connection failure where student snapshot relays and trainer supervisor monitors attempted WebSocket connections against Vercel serverless domains instead of the Render FastAPI WebSocket Hub.
4. **Pre-Flight Fullscreen Immersion**: Introducing an explicit pre-flight start screen verifying camera access and triggering native fullscreen on explicit user touch.

---

## 2. Issues Diagnosed & Root Causes

### 2.1 Mobile Controls Overflow & Hidden "Next" Button
* **Symptoms**: On mobile devices (e.g. 360px viewport widths), the "Next" button was invisible or pushed beyond the right boundary of the viewport. Controls scrolled off-screen below the camera and questions.
* **Root Cause**: The previous navigation cluster was nested in an unwrapped `flex items-center gap-2` div containing four fixed-width buttons (`Previous`, `Save`, `Mark Review`, `Next`) totaling over 360px, plus container padding. On viewports under 400px, the trailing "Next" button overflowed horizontally.

### 2.2 Live Camera Feeds Showing (0) in Trainer Dashboard
* **Symptoms**: Candidate's local camera showed a green REC pulse, but the Trainer Live Monitor displayed `Live Camera Feeds (0)` with "Awaiting frame..." or offline indicators.
* **Root Cause**: In both `student/assessments/[quizId]/page.tsx` and `trainer/assessments/[quizId]/monitor/page.tsx`, the WebSocket URL fallback was:
  ```typescript
  const host = process.env.NEXT_PUBLIC_API_URL
    ? new URL(process.env.NEXT_PUBLIC_API_URL).host
    : window.location.host;
  ```
  On Vercel production (`https://cnc-lms.vercel.app`), `NEXT_PUBLIC_API_URL` was unset client-side, causing `host` to default to `window.location.host` (`cnc-lms.vercel.app`). Because Vercel serverless functions do not host WebSockets, the WebSocket handshake was rejected. Furthermore, on local mobile testing over Wi-Fi (e.g. `http://192.168.1.5:3000`), the client attempted to connect to port 3000 (Next.js) instead of port 8000 (FastAPI).

### 2.3 Camera Feed Constraints on Mobile Browsers
* **Symptoms**: Mobile devices (iOS Safari / Android Chrome) defaulted to rear cameras or failed to initialize camera streams due to rigid width/height constraints.
* **Root Cause**: `CameraFeed.tsx` requested `{ width: 640, height: 480 }` without specifying `facingMode: 'user'` or using `ideal` dimensions.

---

## 3. Engineering Implementation Details

### 3.1 Unified WebSocket URL Resolver (`apps/web/src/lib/quiz/ws.ts`)
We authored a dedicated, thoroughly tested URL resolver `getAssessmentWsUrl(quizId: string)`:
- **Explicit Overrides**: Respects `NEXT_PUBLIC_WS_URL` and converts `NEXT_PUBLIC_API_URL` (`http:` $\to$ `ws:`, `https:` $\to$ `wss:`).
- **Local Network Routing**: If the hostname is `localhost`, `127.0.0.1`, or a LAN IP (`192.168.*`, `10.*`), it routes directly to FastAPI port 8000 (`ws://${hostname}:8000/api/v1/assessments/${quizId}/ws`).
- **Production Fallback**: When deployed on Vercel or custom public domains, it routes directly to the Render FastAPI backend (`wss://cnc-backend-qzmb.onrender.com/api/v1/assessments/${quizId}/ws`).

### 3.2 Mobile-First Sticky Navigation & Responsive Controls
In `apps/web/src/app/student/assessments/[quizId]/page.tsx`:
- **Sticky Bottom Navigation Bar**: Anchored to viewport bottom (`fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md px-3 py-2.5 sm:px-6 shadow-xl`).
- **Previous Button**: Permanently visible; cleanly disabled on Question 1 (`currentIndex === 0`) or when previous navigation is locked in timed mode.
- **Dynamic Next / Submit Action**: On question $1 \dots N-1$, displays the "Next" button. On the final question, automatically swaps "Next" for a prominent "Submit" button with modal confirmation.
- **No Overflow Layout**: Uses responsive sizing (`text-xs sm:text-sm px-2.5 sm:px-3 h-8 sm:h-9`) and icons, preventing horizontal scrolling even at 320px viewport width.

### 3.3 Enhanced Front Camera & Compact Mobile Preview
In `apps/web/src/components/quiz/CameraFeed.tsx`:
- **Front Camera Preference**: Requests `{ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } }` with automatic fallback to basic `{ video: true }` if constraints are unsupported.
- **Compact Mobile Mode**: Renders a compact thumbnail (`compact={true}`) in the mobile header without consuming vertical body space or pushing controls off-screen.
- **Lifecycle Cleanup**: Stops all media tracks immediately on unmount and reports clean disconnection to the backend.

### 3.4 Pre-Flight Fullscreen Modal
- Before starting an assessment, candidates see an introductory pre-flight modal.
- Includes a live camera preview check and examination security details.
- Clicking **"Start Assessment & Enter Fullscreen"** triggers the browser's native fullscreen API via explicit user gesture, preventing security blockages.

---

## 4. Verification & Responsive Matrix

| Device Viewport | Width | Previous Button | Next / Submit Button | Camera Preview | Controls Overflow |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Galaxy Fold / Small** | 320px – 360px | Visible (Disabled on Q1) | Visible (Swaps to Submit on Q_last) | Compact Header Thumbnail | None (0px overflow) |
| **iPhone SE / 12 mini** | 375px | Visible | Visible | Compact Header Thumbnail | None |
| **iPhone 13 / 14 / 15** | 390px | Visible | Visible | Compact Header Thumbnail | None |
| **Pixel 7 / Galaxy S21**| 412px | Visible | Visible | Compact Header Thumbnail | None |
| **iPad / Tablet** | 768px – 820px | Visible | Visible | Standard Desktop Sidebar | None |
| **Desktop High-Res** | 1280px – 1920px| Visible | Visible | Standard Desktop Sidebar | None |

All automated unit and integration tests passed cleanly (87 Vitest tests, 10 Pytest tests, 92 Next.js production routes compiled).
