import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../services/api";
import { useAdminAuth } from "../../context/AuthContext";
import QuizShareModal from "../../components/QuizShareModal";

export default function Dashboard() {
  const { admin, logout } = useAdminAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [shareQuiz, setShareQuiz] = useState(null);
  const canManage = admin?.role === "admin" || admin?.role === "trainer";

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get("/admin/dashboard")).data,
    refetchInterval: 8000,
  });

  const startMutation = useMutation({
    mutationFn: (id) => api.post(`/admin/quizzes/${id}/start`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });
  const scheduleMutation = useMutation({
    mutationFn: (id) => api.post(`/admin/quizzes/${id}/schedule`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });
  const endMutation = useMutation({
    mutationFn: (id) => api.post(`/admin/quizzes/${id}/end`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });
  const cloneMutation = useMutation({
    mutationFn: (id) => api.post(`/admin/quizzes/${id}/clone`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/admin/quizzes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{admin?.role === "hod" ? "HOD Dashboard" : admin?.role === "trainer" ? "Trainer Dashboard" : "Admin Dashboard"}</h1>
          <p className="text-sm text-gray-500">{admin?.username} ({admin?.role})</p>
        </div>
        <div className="flex gap-2">
          {canManage && <button onClick={() => navigate("/admin/quiz/new")} className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700">
            + Create Quiz
          </button>}
          {admin?.role === "admin" && <button onClick={() => navigate("/admin/accounts")} className="bg-indigo-600 text-white px-4 py-2 rounded font-medium hover:bg-indigo-700">Staff accounts</button>}
          <button onClick={() => { logout(); navigate("/admin/login"); }} className="bg-gray-200 px-4 py-2 rounded font-medium hover:bg-gray-300">
            Logout
          </button>
        </div>
      </div>

      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <Stat label="Today's Quizzes" value={data.todays_quiz_count} />
            <Stat label="Students Online" value={data.students_online} />
            <Stat label="Students Submitted" value={data.students_submitted} />
            <Stat label="Total Warnings" value={data.total_warnings} />
            <Stat label="Total Quizzes" value={data.total_quizzes} />
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Code</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Joined</th>
                  <th className="p-3">Submitted</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.quizzes.map((q) => (
                  <tr key={q.id} className="border-t">
                    <td className="p-3 font-medium">{q.name}</td>
                    <td className="p-3 font-mono">{q.code}</td>
                    <td className="p-3"><StatusBadge status={q.status} /></td>
                    <td className="p-3">{q.joined}</td>
                    <td className="p-3">{q.submitted}</td>
                    <td className="p-3 space-x-2">
                      <button onClick={() => setShareQuiz(q)} className="text-teal-600 hover:underline">Share</button>
                      {canManage && q.status === "draft" && (
                        <>
                          {canManage && <button onClick={() => navigate(`/admin/quiz/${q.id}/edit`)} className="text-blue-600 hover:underline">Edit</button>}
                          <button onClick={() => scheduleMutation.mutate(q.id)} className="text-purple-600 hover:underline">Schedule</button>
                        </>
                      )}
                      {canManage && (q.status === "scheduled" || q.status === "draft") && (
                        <button onClick={() => startMutation.mutate(q.id)} className="text-green-600 hover:underline">Start</button>
                      )}
                      {q.status === "live" && (
                        <>
                          <button onClick={() => navigate(`/admin/quiz/${q.id}/monitor`)} className="text-indigo-600 hover:underline">Monitor</button>
                          {canManage && <button onClick={() => endMutation.mutate(q.id)} className="text-red-600 hover:underline">End</button>}
                        </>
                      )}
                      {q.status === "ended" && (
                        <button onClick={() => navigate(`/admin/quiz/${q.id}/results`)} className="text-indigo-600 hover:underline">Results</button>
                      )}
                      {canManage && <button onClick={() => cloneMutation.mutate(q.id)} className="text-gray-600 hover:underline">Clone</button>}
                      {canManage && <button onClick={() => { if (confirm("Delete this quiz permanently?")) deleteMutation.mutate(q.id); }} className="text-red-400 hover:underline">Delete</button>}
                    </td>
                  </tr>
                ))}
                {data.quizzes.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-gray-400">No quizzes yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <QuizShareModal quiz={shareQuiz} onClose={() => setShareQuiz(null)} />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <p className="text-2xl font-bold text-gray-800">{value ?? 0}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    draft: "bg-gray-200 text-gray-700",
    scheduled: "bg-purple-100 text-purple-700",
    live: "bg-green-100 text-green-700",
    ended: "bg-red-100 text-red-700",
    archived: "bg-gray-100 text-gray-500",
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] || ""}`}>{status}</span>;
}
