import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../services/api";
import { useStudentAuth } from "../../context/AuthContext";
import { getDeviceId } from "../../utils/device";

export default function JoinQuiz() {
  const navigate = useNavigate();
  const { updateStudentInfo, clearSession, setSession } = useStudentAuth();
  const [searchParams] = useSearchParams();
  const codeFromLink = (searchParams.get("code") || "").toUpperCase();
  const nameRef = useRef(null);

  const [form, setForm] = useState({ quiz_code: codeFromLink, name: "", roll_number: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Resume check: a leftover token in localStorage is only a *claim* -- we
  // never trust it or any cached quiz state on its own. Every page load
  // that finds one re-verifies against the server (which checks the token
  // hasn't expired AND is still bound to this device -- see
  // security/dependencies.py + api/student_routes.py's /resume) before
  // showing anything. If the check fails for any reason, we drop straight
  // through to the normal join form.
  const [resumeInfo, setResumeInfo] = useState(null); // null = not checked / none available
  const [checkingResume, setCheckingResume] = useState(!!localStorage.getItem("student_token"));

  useEffect(() => {
    const token = localStorage.getItem("student_token");
    if (!token) {
      setCheckingResume(false);
      return;
    }
    (async () => {
      try {
        const { data } = await api.get("/student/resume");
        if (data.session_status === "in_progress") {
          setResumeInfo(data);
        } else {
          // Already submitted (or otherwise finished) -- nothing to resume.
          clearSession();
        }
      } catch {
        // Expired token, device mismatch, or the quiz/session no longer
        // exists server-side (ended + cleaned up) -- just clear and let the
        // student join fresh.
        clearSession();
      } finally {
        setCheckingResume(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scanned via QR / opened via a shared link -- code is already known, so
  // jump straight to the name field instead of making the student retype it.
  useEffect(() => {
    if (codeFromLink && !resumeInfo) nameRef.current?.focus();
  }, [codeFromLink, resumeInfo]);

  // Stays on /join (not "/") -- "/" is now RootGate's redirect-only route
  // (bare URL -> admin login, ?code=... -> here), not the join form itself.
  const clearLinkedCode = () => navigate("/join", { replace: true });

  const resumeQuiz = () => {
    // Camera + fullscreen are always lost on a real reconnect regardless of
    // token validity, so resume routes back through Rules to re-acquire
    // them rather than jumping straight into the quiz.
    updateStudentInfo({
      quiz_name: resumeInfo.quiz_name,
      name: resumeInfo.name,
      roll_number: resumeInfo.roll_number,
      duration_seconds: resumeInfo.duration_seconds,
      remaining_seconds: resumeInfo.remaining_seconds,
      total_questions: resumeInfo.total_questions,
      camera_required: resumeInfo.camera_required,
      fullscreen_required: resumeInfo.fullscreen_required,
    });
    navigate("/rules");
  };

  const startFresh = () => {
    clearSession();
    setResumeInfo(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/student/join", { ...form, device_id: getDeviceId() });
      setSession(data);
      navigate("/rules");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not join quiz");
    } finally {
      setLoading(false);
    }
  };

  if (checkingResume) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-sm text-gray-500">Checking for an active session...</p>
      </div>
    );
  }

  if (resumeInfo) {
    const mins = Math.floor(resumeInfo.remaining_seconds / 60);
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow w-full max-w-sm text-center">
          <h1 className="text-xl font-bold mb-1 text-gray-800">Resume Quiz?</h1>
          <p className="text-sm text-gray-500 mb-4">
            You have an in-progress attempt for <b>{resumeInfo.quiz_name}</b> as {resumeInfo.name} ({resumeInfo.roll_number}).
          </p>
          <p className="text-sm text-gray-700 mb-6">
            Time remaining: <b>{mins} min</b> (server clock — not affected by the disconnect)
          </p>
          <button onClick={resumeQuiz} className="w-full bg-blue-600 text-white rounded py-2 font-medium hover:bg-blue-700 mb-2">
            Resume Quiz
          </button>
          <button onClick={startFresh} className="w-full bg-gray-100 text-gray-600 rounded py-2 text-sm hover:bg-gray-200">
            This isn't me — start over
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={submit} className="bg-white p-8 rounded-lg shadow w-full max-w-sm">
        <h1 className="text-xl font-bold mb-1 text-gray-800">Join Quiz</h1>
        <p className="text-sm text-gray-500 mb-6">
          {codeFromLink ? "Quiz code recognized — just fill in your details" : "Enter your quiz code to get started"}
        </p>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        <label className="block text-sm text-gray-600 mb-1">Quiz Code</label>
        {codeFromLink ? (
          <div className="mb-4 flex items-center justify-between border rounded px-3 py-2 bg-gray-50">
            <span className="font-mono font-semibold text-gray-800">{form.quiz_code}</span>
            <button type="button" onClick={clearLinkedCode} className="text-xs text-blue-600 hover:underline">
              Not you? Change
            </button>
          </div>
        ) : (
          <input className="input mb-4 uppercase" value={form.quiz_code}
                 onChange={(e) => setForm({ ...form, quiz_code: e.target.value.toUpperCase() })} required />
        )}

        <label className="block text-sm text-gray-600 mb-1">Full Name</label>
        <input ref={nameRef} className="input mb-4" value={form.name}
               onChange={(e) => setForm({ ...form, name: e.target.value })} required />

        <label className="block text-sm text-gray-600 mb-1">Roll Number</label>
        <input className="input mb-6" value={form.roll_number}
               onChange={(e) => setForm({ ...form, roll_number: e.target.value })} required />

        <button disabled={loading} className="w-full bg-blue-600 text-white rounded py-2 font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? "Verifying..." : "Verify & Continue"}
        </button>
      </form>
    </div>
  );
}
