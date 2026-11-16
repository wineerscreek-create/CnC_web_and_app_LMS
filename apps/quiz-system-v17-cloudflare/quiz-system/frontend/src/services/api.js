import axios from "axios";

// Same-origin by default (relative "/api") -- correct for local dev (Vite
// proxies it, see vite.config.js) and for any single-origin deployment
// (Nginx reverse proxy, or the backend serving the built frontend itself --
// see backend/app/main.py's optional StaticFiles mount). Only needed when
// the frontend and backend are deployed as two separate origins (e.g.
// frontend on Vercel/a Render Static Site, backend on a separate Render Web
// Service) -- set VITE_API_BASE_URL to the backend's full origin (e.g.
// https://quiz-backend.onrender.com, no trailing slash) in frontend/.env
// for that build. See DEPLOYMENT.md for the full walkthrough.
const backendOrigin = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
const api = axios.create({ baseURL: backendOrigin ? `${backendOrigin}/api` : "/api" });

// Attaches whichever token is present -- admin routes and student routes
// never overlap in a single browser tab, so this simple lookup is enough.
// Admin token: sessionStorage (short-lived, desktop use). Student token:
// localStorage (must survive a killed tab so resume-after-reconnect works --
// see context/AuthContext.jsx). Either way, the token is only a *claim*;
// every request is still re-verified server-side against the live session
// (see security/dependencies.py) -- the client never gets to assert its own
// progress, remaining time, or answers.
api.interceptors.request.use((config) => {
  const adminToken = sessionStorage.getItem("admin_token");
  const studentToken = localStorage.getItem("student_token");
  const token = config.url?.startsWith("/admin") || config.url?.startsWith("/auth/admin")
    ? adminToken
    : studentToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // token expired / session wiped (quiz ended + cleanup ran) / device
      // mismatch -- bounce the user back to the relevant login/join screen.
      const isAdmin = window.location.pathname.startsWith("/admin");
      if (isAdmin) {
        sessionStorage.removeItem("admin_token");
        sessionStorage.removeItem("admin_info");
      } else {
        localStorage.removeItem("student_token");
        localStorage.removeItem("student_info");
      }
    }
    return Promise.reject(err);
  }
);

export default api;
