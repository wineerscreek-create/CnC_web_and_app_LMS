import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStudentAuth } from "../../context/AuthContext";
import CameraFeed from "../../components/CameraFeed";

export default function Rules() {
  const { student } = useStudentAuth();
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);
  const [cameraOk, setCameraOk] = useState(false);

  const startQuiz = async () => {
    const el = document.documentElement;
    if (student?.fullscreen_required && el.requestFullscreen) {
      try { await el.requestFullscreen(); } catch { /* user may deny; anti-cheat will flag it */ }
    }
    navigate("/quiz");
  };

  if (!student) return null;

  const canStart = agreed && (!student.camera_required || cameraOk);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="bg-white p-8 rounded-lg shadow max-w-lg w-full">
        <h1 className="text-xl font-bold text-gray-800 mb-1">{student.quiz_name}</h1>
        <p className="text-sm text-gray-500 mb-6">{student.total_questions} questions &middot; {Math.round(student.duration_seconds / 60)} minutes</p>

        <div className="bg-gray-50 rounded p-4 mb-4 text-sm text-gray-700 space-y-1">
          <p className="font-semibold mb-2">Rules</p>
          <p>• The quiz must be taken in fullscreen. Exiting fullscreen is logged as a warning.</p>
          <p>• Switching tabs or minimizing the window is logged as a warning.</p>
          <p>• Right-click, copy, paste, and text selection are disabled.</p>
          <p>• Your camera must stay on for the entire quiz.</p>
          <p>• Accumulating too many warnings will auto-submit your quiz.</p>
          <p>• The timer is server-controlled and cannot be paused or extended.</p>
        </div>

        {student.camera_required && (
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Camera Check</p>
            <CameraFeed required={student.camera_required} onStatusChange={setCameraOk} />
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-gray-700 mb-6">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          I have read and agree to follow the rules above
        </label>

        <button onClick={startQuiz} disabled={!canStart}
                className="w-full bg-blue-600 text-white rounded py-2 font-medium hover:bg-blue-700 disabled:opacity-50">
          Start Quiz
        </button>
      </div>
    </div>
  );
}
