import { useEffect, useRef, useState } from "react";
import api from "../services/api";
import { connectSocket } from "../services/socket";

export default function CameraFeed({ required, onStatusChange, captureSnapshots = false }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const snapshotTimerRef = useRef(null);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        console.log("[CAMERA DEBUG] stream active");
        setActive(true); onStatusChange?.(true); api.post("/student/camera-status?on=true").catch(() => {});
      } catch (err) {
        setError("Camera permission denied or unavailable."); setActive(false); onStatusChange?.(false);
        api.post("/student/camera-status?on=false").catch(() => {});
        if (required) api.post("/student/warning", { warning_type: "camera_off", detail: err.message }).catch(() => {});
      }
    })();
    return () => {
      clearInterval(snapshotTimerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      api.post("/student/camera-status?on=false").catch(() => {});
    };
  }, [required, onStatusChange]);

  useEffect(() => {
    if (!captureSnapshots || !active) return undefined;
    const socket = connectSocket(localStorage.getItem("student_token"), "student");
    let queuedSnapshot = null;
    const sendSnapshot = () => {
      console.log("[CAMERA DEBUG] socket exists:", !!socket);
      console.log("[CAMERA DEBUG] socket connected:", socket?.connected ?? false);
      console.log("[CAMERA DEBUG] socket readyState:", socket?.readyState ?? "unknown");
      if (!queuedSnapshot || !socket?.connected || socket.readyState !== WebSocket.OPEN) return;
      console.log("[CAMERA DEBUG] sending camera_snapshot");
      if (socket.emit("camera_snapshot", { snapshot: queuedSnapshot })) {
        console.log("[CAMERA DEBUG] snapshot emit completed");
        queuedSnapshot = null;
      }
    };
    const onConnected = () => sendSnapshot();
    socket.on("connected", onConnected);
    const capture = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      canvas.width = 640;
      canvas.height = 480;
      canvas.getContext("2d", { alpha: false }).drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const snapshot = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        console.log("[CAMERA DEBUG] snapshot captured:", snapshot.length);
        queuedSnapshot = snapshot;
        sendSnapshot();
      }, "image/jpeg", 0.62);
    };
    capture();
    snapshotTimerRef.current = setInterval(capture, 5000);
    return () => {
      clearInterval(snapshotTimerRef.current);
      socket.off("connected", onConnected);
      queuedSnapshot = null;
    };
  }, [active, captureSnapshots]);

  return <div className="flex flex-col items-center">
    <video ref={videoRef} autoPlay muted playsInline className="w-40 h-28 rounded border border-gray-300 bg-black" />
    <canvas ref={canvasRef} className="hidden" />
    {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    {active && <p className="text-xs text-green-600 mt-1">Camera active</p>}
  </div>;
}
