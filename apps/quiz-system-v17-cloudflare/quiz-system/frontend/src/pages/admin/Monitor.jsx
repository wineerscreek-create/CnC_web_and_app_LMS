import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../services/api";
import { connectSocket, disconnectSocket } from "../../services/socket";
import { recordCameraSnapshot, startCameraSnapshotSession } from "../../services/cameraSnapshots";

export default function Monitor() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [liveEvents, setLiveEvents] = useState([]);
  const [snapshots, setSnapshots] = useState({});
  const [nowMs, setNowMs] = useState(Date.now());
  const snapshotsRef = useRef(snapshots);

  useEffect(() => startCameraSnapshotSession(quizId), [quizId]);

  const { data, isLoading } = useQuery({
    queryKey: ["monitor", quizId],
    queryFn: async () => (await api.get(`/admin/quizzes/${quizId}/monitor`)).data,
    // Every event that actually changes a row (join/answer/warning/submit/
    // online-status) already pushes over the socket below and invalidates
    // this query immediately -- this interval is just a safety net in case
    // a socket event is missed (e.g. a brief reconnect gap), not the
    // primary sync mechanism. Long on purpose.
    refetchInterval: 30000,
  });

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const activeIds = new Set((data?.students || []).filter((student) => student.online && student.status === "in_progress").map((student) => student.session_id));
    setSnapshots((previous) => {
      const next = { ...previous };
      Object.keys(next).forEach((sessionId) => {
        if (!activeIds.has(sessionId)) {
          URL.revokeObjectURL(next[sessionId].url);
          delete next[sessionId];
        }
      });
      snapshotsRef.current = next;
      return next;
    });
  }, [data]);

  useEffect(() => () => Object.values(snapshotsRef.current).forEach(({ url }) => URL.revokeObjectURL(url)), []);

  const showSnapshot = useCallback((event) => {
    console.log("[MONITOR DEBUG] camera_snapshot received");
    console.log("[MONITOR DEBUG] session id:", event.session_id);
    console.log("[MONITOR DEBUG] frame received:", !!event.frame, event.frame?.length || 0);
    const [header, encoded] = String(event.frame || "").split(",");
    if (!header?.includes("data:image/jpeg;base64") || !encoded) return;
    try {
      recordCameraSnapshot(event);
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
      setSnapshots((previous) => {
        if (previous[event.session_id]?.url) URL.revokeObjectURL(previous[event.session_id].url);
        console.log("[MONITOR DEBUG] rendering frame");
        const next = { ...previous, [event.session_id]: { url, name: event.name, rollNumber: event.roll_number, updatedAt: event.timestamp || Date.now() } };
        snapshotsRef.current = next;
        return next;
      });
    } catch {
      // Ignore malformed frames received over the realtime connection.
    }
  }, []);

  const pushEvent = useCallback((text) => {
    setLiveEvents((prev) => [{ text, at: Date.now() }, ...prev].slice(0, 30));
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem("admin_token");
    const socket = connectSocket(token, "admin", { quiz_id: quizId });
    socket.on("connected", () => console.log("[MONITOR DEBUG] websocket connected", quizId));

    socket.on("student_joined", (d) => {
      pushEvent(`${d.name} (${d.roll_number}) joined`);
      qc.invalidateQueries({ queryKey: ["monitor", quizId] });
    });
    socket.on("student_status", () => qc.invalidateQueries({ queryKey: ["monitor", quizId] }));
    socket.on("camera_snapshot", showSnapshot);
    // Pushed every time a student's autosave lands server-side -- this is
    // what keeps the "Q" (current question) column live without needing to
    // poll every few seconds (see websocket/socket_manager.emit_answer_saved).
    socket.on("answer_saved", () => qc.invalidateQueries({ queryKey: ["monitor", quizId] }));
    socket.on("warning", (d) => {
      pushEvent(`⚠ ${d.roll_number}: ${d.warning_type} (warning #${d.count})`);
      qc.invalidateQueries({ queryKey: ["monitor", quizId] });
    });
    socket.on("submit", (d) => {
      pushEvent(`✔ ${d.roll_number} submitted (${d.result?.total_marks ?? "?"} marks)`);
      qc.invalidateQueries({ queryKey: ["monitor", quizId] });
    });
    socket.on("quiz_end", () => {
      pushEvent("Quiz ended");
      qc.invalidateQueries({ queryKey: ["monitor", quizId] });
    });

    return () => disconnectSocket();
  }, [quizId, qc, pushEvent, showSnapshot]);

  const endQuiz = async () => {
    if (!confirm("End this quiz now? All in-progress students will be auto-submitted.")) return;
    await api.post(`/admin/quizzes/${quizId}/end`);
    navigate(`/admin/quiz/${quizId}/results`);
  };

  const fmtTime = (s) => {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };
  const fmtAge = (timestamp) => timestamp ? `${Math.max(0, Math.round((nowMs - timestamp) / 1000))}s ago` : "Waiting for camera...";

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <button onClick={() => navigate("/admin/dashboard")} className="text-sm text-blue-600 mb-1 block">&larr; Back</button>
          <h1 className="text-2xl font-bold text-gray-800">Live Monitoring{data ? `: ${data.quiz.name}` : ""}</h1>
        </div>
        <button onClick={endQuiz} className="bg-red-600 text-white px-4 py-2 rounded font-medium hover:bg-red-700">End Quiz</button>
      </div>

      {isLoading ? <p>Loading...</p> : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="p-2">Roll</th><th className="p-2">Name</th><th className="p-2">Q</th>
                  <th className="p-2">Time Left</th><th className="p-2">Warnings</th>
                  <th className="p-2">Cam</th><th className="p-2">FS</th><th className="p-2">Online</th><th className="p-2">Status</th><th className="p-2">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s.session_id} className={`border-t ${s.stale ? "bg-yellow-50" : ""}`}>
                    <td className="p-2 font-mono">{s.roll_number}</td>
                    <td className="p-2">{s.name}</td>
                    <td className="p-2">{s.current_question + 1}/{s.total_questions}</td>
                    <td className="p-2">{fmtTime(s.remaining_seconds)}</td>
                    <td className={`p-2 ${s.warnings > 0 ? "text-red-600 font-semibold" : ""}`}>{s.warnings}</td>
                    <td className="p-2">
                      {s.camera_on ? (
                        snapshots[s.session_id]?.url ? <img src={snapshots[s.session_id].url} alt={`${s.name} camera`} className="w-32 h-24 object-cover rounded border" /> : <span className="text-xs text-gray-500">Waiting for camera...</span>
                      ) : <span className="text-xs text-red-600">Camera unavailable</span>}
                      <div className="text-xs mt-1">Camera: {s.camera_on ? "ON" : "OFF"}</div>
                      {s.camera_on && <div className="text-xs text-gray-500">Last update: {fmtAge(snapshots[s.session_id]?.updatedAt)}</div>}
                    </td>
                    <td className="p-2">{s.fullscreen ? "🟢" : "🔴"}</td>
                    <td className="p-2">{s.online ? "🟢" : "⚪"}</td>
                    <td className="p-2 capitalize">{s.status.replace("_", " ")}</td>
                    <td className="p-2">
                      {s.stale ? (
                        <span className="text-yellow-700 text-xs font-medium" title="No heartbeat recently — connection may be flaky">
                          ⚠ {Math.round(s.last_seen_seconds_ago)}s ago
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">{Math.round(s.last_seen_seconds_ago)}s ago</span>
                      )}
                    </td>
                  </tr>
                ))}
                {data.students.length === 0 && (
                  <tr><td colSpan={10} className="p-6 text-center text-gray-400">No students yet</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-gray-700 mb-3">Live Events</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[calc(100vh-10rem)] overflow-y-auto text-xs text-gray-600">
                {Object.entries(snapshots).map(([sessionId, snapshot]) => (
                  <div key={sessionId} className="border rounded p-2 bg-gray-50 min-w-0">
                    <p className="font-semibold text-gray-700 mb-2">📷 LIVE CAMERA</p>
                    <img src={snapshot.url} alt={`${snapshot.name || "Student"} camera snapshot`} className="w-[100px] h-[135px] object-cover rounded-[6px] border bg-black mx-auto" />
                    <p className="mt-2 font-medium">{snapshot.name || "Student"} · {snapshot.rollNumber || ""}</p>
                    <p>Camera: ON</p>
                    <p>Updated: {fmtAge(snapshot.updatedAt)}</p>
                  </div>
                ))}
                {liveEvents.map((e, i) => <p key={`event-${i}`}>{e.text}</p>)}
                {Object.keys(snapshots).length === 0 && liveEvents.length === 0 && <p className="text-gray-400">Waiting for activity...</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
