import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function ThankYou() {
  const navigate = useNavigate();

  useEffect(() => {
    // Exit fullscreen on submission, if we were in it.
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-10 rounded-lg shadow text-center max-w-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Thank You!</h1>
        <p className="text-gray-600 mb-6">
          Your quiz has been submitted successfully. You may now close this window.
        </p>
        {/* -> /join, not "/" -- "/" now goes to the admin login screen when
            there's no ?code= param (see pages/RootGate.jsx). */}
        <button onClick={() => navigate("/join")} className="bg-blue-600 text-white px-5 py-2 rounded font-medium hover:bg-blue-700">
          Logout
        </button>
      </div>
    </div>
  );
}
