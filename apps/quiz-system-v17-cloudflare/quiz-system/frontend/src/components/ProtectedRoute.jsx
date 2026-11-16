import { Navigate } from "react-router-dom";
import { useAdminAuth, useStudentAuth } from "../context/AuthContext";

export function AdminProtectedRoute({ children }) {
  const { admin } = useAdminAuth();
  const hasToken = sessionStorage.getItem("admin_token");
  if (!admin || !hasToken) return <Navigate to="/admin/login" replace />;
  return children;
}

export function StudentProtectedRoute({ children }) {
  const { student } = useStudentAuth();
  const hasToken = localStorage.getItem("student_token");
  // Presence of a token only gets you past this gate -- it is NOT proof the
  // session is still valid. Every actual API call re-verifies the token
  // against the live server-side session (security/dependencies.py); an
  // expired/revoked/device-mismatched token gets a 401 and api.js's
  // interceptor clears it, which will bounce back through here on the next
  // navigation. This route guard is just "don't bother rendering the quiz
  // screen with zero credentials," not the source of truth.
  // -> /join, not "/" -- "/" now redirects to the admin login screen when
  // there's no ?code= param (see pages/RootGate.jsx), which would strand a
  // bounced student on the wrong page entirely.
  if (!student || !hasToken) return <Navigate to="/join" replace />;
  return children;
}
