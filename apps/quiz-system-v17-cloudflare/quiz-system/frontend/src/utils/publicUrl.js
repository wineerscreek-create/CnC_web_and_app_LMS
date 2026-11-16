// The base URL used to build shareable join links / QR codes.
//
// Why this exists: when the admin panel is tunneled through Cloudflare (or
// ngrok), the admin might still be working from http://localhost:5173 while
// students need a public https://...trycloudflare.com (or custom domain)
// URL. `window.location.origin` alone can't know that. So:
//
//   1. If the admin has saved a "Public Base URL" in the Share dialog, use it
//      (persisted in localStorage -- survives reloads, per-browser).
//   2. Else, fall back to VITE_PUBLIC_APP_URL from the build/.env if set.
//   3. Else, fall back to window.location.origin (correct automatically if
//      the admin opens the panel through the same tunnel URL students use).
const STORAGE_KEY = "quiz_public_base_url";

function stripTrailingSlash(url) {
  return url.replace(/\/+$/, "");
}

export function getPublicBaseUrl() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return stripTrailingSlash(saved);

  const envUrl = import.meta.env.VITE_PUBLIC_APP_URL;
  if (envUrl) return stripTrailingSlash(envUrl);

  return window.location.origin;
}

export function setPublicBaseUrl(url) {
  const clean = stripTrailingSlash(url.trim());
  if (clean) {
    localStorage.setItem(STORAGE_KEY, clean);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  return clean;
}

export function clearPublicBaseUrl() {
  localStorage.removeItem(STORAGE_KEY);
}
