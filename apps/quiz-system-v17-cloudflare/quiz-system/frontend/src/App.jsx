import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AdminAuthProvider, StudentAuthProvider } from "./context/AuthContext";
import { AdminProtectedRoute, StudentProtectedRoute } from "./components/ProtectedRoute";

import RootGate from "./pages/RootGate";
import JoinQuiz from "./pages/student/JoinQuiz";
import Rules from "./pages/student/Rules";
import QuizEngine from "./pages/student/QuizEngine";
import ThankYou from "./pages/student/ThankYou";

import AdminLogin from "./pages/admin/Login";
import Dashboard from "./pages/admin/Dashboard";
import CreateQuiz from "./pages/admin/CreateQuiz";
import Monitor from "./pages/admin/Monitor";
import Results from "./pages/admin/Results";
import StaffAccounts from "./pages/admin/StaffAccounts";

export default function App() {
  return (
    <BrowserRouter>
      <StudentAuthProvider>
        <AdminAuthProvider>
          <Routes>
            {/* ---- student ---- */}
            {/* "/" is a smart redirect, not the join form itself -- see
                RootGate.jsx: bare URL -> admin login, ?code=... -> /join.
                The join form always lives at /join so it doesn't depend on
                that redirect logic (see JoinQuiz.jsx's "Not you? Change"). */}
            <Route path="/" element={<RootGate />} />
            <Route path="/join" element={<JoinQuiz />} />
            <Route path="/rules" element={<StudentProtectedRoute><Rules /></StudentProtectedRoute>} />
            <Route path="/quiz" element={<StudentProtectedRoute><QuizEngine /></StudentProtectedRoute>} />
            <Route path="/thank-you" element={<ThankYou />} />

            {/* ---- admin ---- */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/dashboard" element={<AdminProtectedRoute><Dashboard /></AdminProtectedRoute>} />
            <Route path="/trainer/dashboard" element={<AdminProtectedRoute><Dashboard /></AdminProtectedRoute>} />
            <Route path="/hod/dashboard" element={<AdminProtectedRoute><Dashboard /></AdminProtectedRoute>} />
            <Route path="/admin/accounts" element={<AdminProtectedRoute><StaffAccounts /></AdminProtectedRoute>} />
            <Route path="/admin/quiz/new" element={<AdminProtectedRoute><CreateQuiz /></AdminProtectedRoute>} />
            <Route path="/admin/quiz/:quizId/edit" element={<AdminProtectedRoute><CreateQuiz /></AdminProtectedRoute>} />
            <Route path="/admin/quiz/:quizId/monitor" element={<AdminProtectedRoute><Monitor /></AdminProtectedRoute>} />
            <Route path="/admin/quiz/:quizId/results" element={<AdminProtectedRoute><Results /></AdminProtectedRoute>} />
          </Routes>
        </AdminAuthProvider>
      </StudentAuthProvider>
    </BrowserRouter>
  );
}
