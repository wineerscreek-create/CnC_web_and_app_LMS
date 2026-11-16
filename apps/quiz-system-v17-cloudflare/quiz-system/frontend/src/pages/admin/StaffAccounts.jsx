import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";

export default function StaffAccounts() {
  const navigate = useNavigate(); const queryClient = useQueryClient();
  const [form, setForm] = useState({ display_name: "", username: "", password: "", role: "trainer" }); const [error, setError] = useState(""); const [saved, setSaved] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["staff-accounts"], queryFn: async () => (await api.get("/admin/users")).data });
  const submit = async (event) => { event.preventDefault(); setError(""); setSaved(false); try { await api.post("/admin/users", form); setForm({ display_name: "", username: "", password: "", role: "trainer" }); setSaved(true); queryClient.invalidateQueries({ queryKey: ["staff-accounts"] }); } catch (e) { setError(e.response?.data?.detail || "Account could not be created"); } };
  return <div className="min-h-screen bg-gray-100 p-6 max-w-4xl mx-auto">
    <button onClick={() => navigate("/admin/dashboard")} className="text-sm text-blue-600 mb-4">&larr; Back to dashboard</button>
    <h1 className="text-2xl font-bold text-gray-800 mb-4">Staff accounts</h1>
    <form onSubmit={submit} className="bg-white rounded-lg shadow p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
      <label>Display name<input className="input mt-1" required value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label>
      <label>Username<input className="input mt-1" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
      <label>Password<input type="password" className="input mt-1" minLength="10" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
      <label>Role<select className="input mt-1" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="trainer">Trainer</option><option value="hod">HOD / Client</option></select></label>
      {error && <p className="text-red-600 text-sm md:col-span-2">{error}</p>}{saved && <p className="text-green-600 text-sm md:col-span-2">Account created. Share these credentials securely.</p>}
      <button className="bg-blue-600 text-white rounded px-4 py-2 w-fit">Create account</button>
    </form>
    <div className="bg-white rounded-lg shadow mt-6 overflow-hidden"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="p-3 text-left">Name</th><th className="p-3 text-left">Username</th><th className="p-3 text-left">Role</th></tr></thead><tbody>{isLoading ? <tr><td colSpan="3" className="p-4">Loading...</td></tr> : data.users.map((user) => <tr className="border-t" key={user.id}><td className="p-3">{user.display_name}</td><td className="p-3 font-mono">{user.username}</td><td className="p-3 capitalize">{user.role}</td></tr>)}</tbody></table></div>
  </div>;
}
