import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAdminAuth } from "../../context/AuthContext";

export default function AdminLogin() {
  const { login } = useAdminAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const account = await login(username, password);
      navigate(account.role === "trainer" ? "/trainer/dashboard" : account.role === "hod" ? "/hod/dashboard" : "/admin/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={submit} className="bg-white p-8 rounded-lg shadow w-full max-w-sm">
        <h1 className="text-xl font-bold mb-6 text-gray-800">Staff Login</h1>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <label className="block text-sm text-gray-600 mb-1">Username</label>
        <input className="w-full border rounded px-3 py-2 mb-4" value={username}
               onChange={(e) => setUsername(e.target.value)} required />
        <label className="block text-sm text-gray-600 mb-1">Password</label>
        <input type="password" className="w-full border rounded px-3 py-2 mb-6" value={password}
               onChange={(e) => setPassword(e.target.value)} required />
        <button disabled={loading} className="w-full bg-blue-600 text-white rounded py-2 font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? "Signing in..." : "Sign in"}
        </button>
        <p className="text-xs text-gray-400 mt-4">
          Default super admin credentials come from SUPER_ADMIN_USERNAME / SUPER_ADMIN_PASSWORD in backend/.env
        </p>
        <p className="text-xs text-gray-400 mt-2 text-center">
          Joining a quiz as a student instead? <Link to="/join" className="text-blue-600 hover:underline">Enter a quiz code</Link>
        </p>
      </form>
    </div>
  );
}
