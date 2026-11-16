import { createContext, useContext, useState, useCallback } from "react";
import api from "../services/api";

const AdminAuthContext = createContext(null);
const StudentAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => {
    const raw = sessionStorage.getItem("admin_info");
    return raw ? JSON.parse(raw) : null;
  });

  const login = useCallback(async (username, password) => {
    const { data } = await api.post("/auth/admin/login", { username, password });
    sessionStorage.setItem("admin_token", data.access_token);
    const info = { username: data.username, role: data.role };
    sessionStorage.setItem("admin_info", JSON.stringify(info));
    setAdmin(info);
    return info;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem("admin_token");
    sessionStorage.removeItem("admin_info");
    setAdmin(null);
  }, []);

  return (
    <AdminAuthContext.Provider value={{ admin, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}

export function StudentAuthProvider({ children }) {
  // Deliberately localStorage, not sessionStorage: a student's tab can get
  // killed by a network drop, OS backgrounding on mobile, or an accidental
  // close -- localStorage survives that so JoinQuiz.jsx can detect the
  // existing session and offer "Resume Quiz" instead of losing progress.
  // Exam integrity still holds because the JWT is short-lived
  // (STUDENT_TOKEN_EXPIRE_MINUTES) and bound to the device fingerprint in
  // utils/device.js, not because of which storage API held the token.
  const [student, setStudent] = useState(() => {
    const raw = localStorage.getItem("student_info");
    return raw ? JSON.parse(raw) : null;
  });

  const setSession = useCallback((joinResponse) => {
    localStorage.setItem("student_token", joinResponse.access_token);
    localStorage.setItem("student_info", JSON.stringify(joinResponse));
    setStudent(joinResponse);
  }, []);

  // Used by the resume flow: the token in localStorage is already valid
  // (it got us the /student/resume response in the first place), so this
  // only refreshes the *display* info -- quiz name, remaining time, etc --
  // from the server's answer. It never invents or trusts client-side state.
  const updateStudentInfo = useCallback((info) => {
    setStudent((prev) => {
      const merged = { ...prev, ...info };
      localStorage.setItem("student_info", JSON.stringify(merged));
      return merged;
    });
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem("student_token");
    localStorage.removeItem("student_info");
    setStudent(null);
  }, []);

  return (
    <StudentAuthContext.Provider value={{ student, setSession, updateStudentInfo, clearSession }}>
      {children}
    </StudentAuthContext.Provider>
  );
}

export function useStudentAuth() {
  return useContext(StudentAuthContext);
}
