# DESIGN SYSTEM DOCUMENTATION
**Theme Architecture:** Winners Creek LMS  
**Implementation File:** `apps/web/src/styles/globals.css`  
**Configuration File:** `apps/web/tailwind.config.ts`  

---

## 1. Color Palette Tokens

### Light Theme
| Token Name | Hex Code | HSL Value | Purpose |
| :--- | :--- | :--- | :--- |
| **Main Background** | `#F8F9FA` | `210 20% 98%` | Global clean off-white page canvas |
| **Cards / Surfaces** | `#FFFFFF` | `0 0% 100%` | Pure white elevated surfaces and modals |
| **Borders** | `#E5E7EB` | `220 13% 91%` | Clean component boundaries and dividers |
| **Primary Text** | `#111827` | `222 47% 11%` | High-contrast readable typography |
| **Secondary Text** | `#64748B` | `215 16% 47%` | Subtitles, metadata, and timestamps |
| **Orange Accent** | `#F97316` | `25 95% 53%` | Primary action buttons and badges |
| **Teal Accent** | `#0D9488` | `175 84% 32%` | Secondary metrics, completion indicators |
| **Indigo Accent** | `#4F46E5` | `243 75% 59%` | Focus rings, deep action links |

### Dark Theme
| Token Name | Hex Code | HSL Value | Purpose |
| :--- | :--- | :--- | :--- |
| **Main Background** | `#0B0F19` | `223 39% 7%` | Premium midnight dark background |
| **Cards / Surfaces** | `#1E293B` | `217 33% 17%` | Dark slate elevated cards |
| **Borders** | `#334155` | `217 25% 27%` | Subtle dark mode surface separation |
| **Primary Text** | `#F8FAFC` | `210 40% 98%` | High-clarity white text |
| **Secondary Text** | `#CBD5E1` | `214 32% 84%` | Secondary descriptions and meta text |
| **Orange Accent** | `#F97316` | `25 95% 53%` | Action triggers and active pills |
| **Teal Accent** | `#14B8A6` | `175 84% 38%` | Balanced teal highlights |
| **Indigo Accent** | `#6366F1` | `243 75% 65%` | Primary dark action color |

---

## 2. Typography & Hierarchy
- **Font Heading**: `'Manrope', -apple-system, sans-serif`
- **Font Body**: `'Inter', -apple-system, sans-serif`
- **Weights**: 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold), 800 (ExtraBold).
- **Line Heights**: `1.55` body line height for maximum reading comfort across soft-skills lesson content.

---

## 3. Shadows & Radii
- **Card Radius**: `16px` (`rounded-2xl`)
- **Button Radius**: `12px` (`rounded-xl`)
- **Card Shadow**: `0 1px 3px rgba(17, 24, 39, 0.05), 0 4px 16px rgba(17, 24, 39, 0.04)`
- **Hover Elevation**: `0 6px 20px rgba(17, 24, 39, 0.08), 0 1px 3px rgba(17, 24, 39, 0.05)`
- **Modal Pop**: `0 20px 40px -12px rgba(17, 24, 39, 0.12)`

---

## 4. Theme Switching
- Managed by `ThemeProvider` (`apps/web/src/lib/theme/ThemeContext.tsx`).
- Modes supported: `light`, `dark`, `system`.
- Preserved in `localStorage` under `wc_theme_mode` and `wc_theme`.
- Zero theme flash on initial load.
