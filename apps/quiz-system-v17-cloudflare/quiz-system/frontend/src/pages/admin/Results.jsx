import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "../../services/api";
import { getCameraSnapshotSamples } from "../../services/cameraSnapshots";

export default function Results() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState("results");

  const { data: results, isLoading } = useQuery({
    queryKey: ["results", quizId],
    queryFn: async () => (await api.get(`/admin/quizzes/${quizId}/results`)).data,
  });
  const { data: analytics } = useQuery({
    queryKey: ["analytics", quizId],
    queryFn: async () => (await api.get(`/admin/quizzes/${quizId}/analytics`)).data,
    enabled: tab === "analytics",
  });
  const { data: proctoring } = useQuery({
    queryKey: ["proctoring", quizId],
    queryFn: async () => (await api.get(`/admin/quizzes/${quizId}/proctoring`)).data,
    enabled: tab === "proctoring",
  });

  const downloadExport = async () => {
    const res = await api.get(`/admin/quizzes/${quizId}/export/csv`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "results.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcel = async () => {
    const { default: ExcelJS } = await import("exceljs");
    const cameraSamples = getCameraSnapshotSamples();
    const workbook = new ExcelJS.Workbook();
    const resultSheet = workbook.addWorksheet("Results");
    const resultHeaders = ["Rank", "Roll Number", "Name", "Correct", "Wrong", "Skipped", "Marks", "Max Marks", "Percentage", "Result", "Warnings"];
    resultSheet.addRow(resultHeaders);
    results.results.forEach((item) => resultSheet.addRow([item.rank, item.roll_number, item.name, item.correct, item.wrong, item.skipped, item.marks, item.max_marks, item.percentage, item.passed ? "Pass" : "Fail", item.warnings]));
    resultSheet.getRow(1).font = { bold: true };
    resultSheet.views = [{ state: "frozen", ySplit: 1 }];

    const cameraSheet = workbook.addWorksheet("Camera Snapshots");
    cameraSheet.columns = [{ header: "Student", key: "student", width: 22 }, { header: "Roll Number", key: "roll", width: 16 }, ...Array.from({ length: 10 }, (_, index) => ({ header: `Snapshot ${index + 1}`, key: `snapshot${index + 1}`, width: 14 }))];
    cameraSheet.getRow(1).font = { bold: true };
    cameraSheet.views = [{ state: "frozen", ySplit: 1 }];
    const samplesBySession = new Map(cameraSamples.map((student) => [student.session_id, student]));
    results.results.forEach((result) => {
      const student = samplesBySession.get(result.session_id) || { name: result.name, roll_number: result.roll_number, snapshots: [] };
      const row = cameraSheet.addRow({ student: student.name, roll: student.roll_number });
      row.height = 92;
      student.snapshots.slice(0, 10).forEach((image, index) => {
        const imageId = workbook.addImage({ base64: image, extension: "jpeg" });
        cameraSheet.addImage(imageId, { tl: { col: index + 2, row: row.number - 1 }, ext: { width: 68, height: 88 } });
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "results-with-camera-snapshots.xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const deleteSession = async () => {
    if (!confirm("This permanently wipes all data for this quiz (questions, answers, sessions). Continue?")) return;
    await api.delete(`/admin/quizzes/${quizId}/session`);
    navigate("/admin/dashboard");
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 max-w-5xl mx-auto">
      <button onClick={() => navigate("/admin/dashboard")} className="text-sm text-blue-600 mb-2 block">&larr; Back</button>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-800">{results?.quiz_name || "Results"}</h1>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2 flex-wrap justify-end">
            <button onClick={downloadExport} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm">Export CSV</button>
            <button onClick={downloadExcel} className="bg-green-600 text-white px-3 py-1.5 rounded text-sm">Export Excel</button>
            <button onClick={deleteSession} className="bg-red-100 text-red-700 px-3 py-1.5 rounded text-sm">Delete Session</button>
          </div>

        </div>
      </div>
      <p className="text-xs text-gray-400 mb-4 text-right">
        CSV export uses durable quiz state. Excel export includes the bounded camera sample worksheet.
      </p>

      <div className="flex gap-4 border-b mb-4">
        {["results", "analytics", "proctoring"].map((t) => (
          <button key={t} onClick={() => setTab(t)}
                  className={`pb-2 text-sm font-medium capitalize ${tab === t ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "results" && (
        isLoading ? <p>Loading...</p> : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="p-2">Rank</th><th className="p-2">Roll</th><th className="p-2">Name</th>
                  <th className="p-2">Correct</th><th className="p-2">Wrong</th><th className="p-2">Skipped</th>
                  <th className="p-2">Marks</th><th className="p-2">%</th><th className="p-2">Result</th><th className="p-2">Warnings</th>
                </tr>
              </thead>
              <tbody>
                {results.results.map((r) => (
                  <tr key={r.roll_number} className="border-t">
                    <td className="p-2">{r.rank}</td>
                    <td className="p-2 font-mono">{r.roll_number}</td>
                    <td className="p-2">{r.name}</td>
                    <td className="p-2 text-green-600">{r.correct}</td>
                    <td className="p-2 text-red-600">{r.wrong}</td>
                    <td className="p-2 text-gray-500">{r.skipped}</td>
                    <td className="p-2 font-medium">{r.marks}/{r.max_marks}</td>
                    <td className="p-2">{r.percentage}%</td>
                    <td className="p-2">{r.passed ? <span className="text-green-600">Pass</span> : <span className="text-red-600">Fail</span>}</td>
                    <td className="p-2">{r.warnings}</td>
                  </tr>
                ))}
                {results.results.length === 0 && (
                  <tr><td colSpan={10} className="p-6 text-center text-gray-400">No submissions yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "analytics" && analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold mb-3">Topper List</h3>
            <ol className="list-decimal list-inside text-sm space-y-1">
              {analytics.topper_list.map((t) => (
                <li key={t.roll_number}>{t.name} ({t.roll_number}) — {t.marks} marks</li>
              ))}
            </ol>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold mb-3">Summary</h3>
            <p className="text-sm">Average Score: <b>{analytics.average_score}</b></p>
            <p className="text-sm">Average Percentage: <b>{analytics.average_percentage}%</b></p>
            <p className="text-sm">Highest: <b className="text-green-600">{analytics.highest_score}</b> &middot; Lowest: <b className="text-red-600">{analytics.lowest_score}</b></p>
            <p className="text-sm">Passed: <b className="text-green-600">{analytics.pass_fail.passed}</b> / Failed: <b className="text-red-600">{analytics.pass_fail.failed}</b></p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 md:col-span-2">
            <h3 className="font-semibold mb-3">Question Analysis</h3>
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-left"><tr><th className="p-1">Question</th><th className="p-1">Correct %</th><th className="p-1">Wrong %</th><th className="p-1">Skipped %</th><th className="p-1">Difficulty</th></tr></thead>
              <tbody>
                {analytics.question_analysis.map((q, i) => {
                  const diff = analytics.difficulty_analysis.find((d) => d.question_id === q.question_id);
                  return (
                    <tr key={q.question_id} className="border-t">
                      <td className="p-1">Q{i + 1}</td>
                      <td className="p-1 text-green-600">{q.correct_pct}%</td>
                      <td className="p-1 text-red-600">{q.wrong_pct}%</td>
                      <td className="p-1 text-gray-500">{q.skipped_pct}%</td>
                      <td className="p-1 capitalize">{diff?.difficulty}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "proctoring" && proctoring && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr><th className="p-2">Roll</th><th className="p-2">Risk Score</th><th className="p-2">Level</th><th className="p-2">Warnings</th><th className="p-2">Breakdown</th></tr>
            </thead>
            <tbody>
              {proctoring.sessions.map((s) => (
                <tr key={s.session_id} className="border-t">
                  <td className="p-2 font-mono">{s.roll_number}</td>
                  <td className="p-2">{s.risk_score}</td>
                  <td className="p-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${s.risk_level === "high" ? "bg-red-100 text-red-700" : s.risk_level === "medium" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                      {s.risk_level}
                    </span>
                  </td>
                  <td className="p-2">{s.total_warnings}</td>
                  <td className="p-2 text-xs text-gray-500">
                    {Object.entries(s.breakdown).map(([k, v]) => `${k}: ${v}`).join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 p-3">
            Risk score is derived from anti-cheat warning counts (tab switches, fullscreen exits, camera-off, etc).
            Wiring in real face/phone-detection models is the next step -- see backend/app/services/proctoring_service.py.
          </p>
        </div>
      )}
    </div>
  );
}
