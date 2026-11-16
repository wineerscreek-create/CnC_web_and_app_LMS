'use client';

import React, { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Camera, CameraOff, AlertCircle } from 'lucide-react';

interface CameraFeedProps {
  required?: boolean;
  captureSnapshots?: boolean;
  onStatusChange?: (active: boolean) => void;
  onSnapshot?: (base64Snapshot: string) => void;
  quizId?: string;
}

export function CameraFeed({
  required = true,
  captureSnapshots = true,
  onStatusChange,
  onSnapshot,
  quizId,
}: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const snapshotTimerRef = useRef<any>(null);

  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize camera stream
  useEffect(() => {
    let cancelled = false;

    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        setActive(true);
        setError(null);
        onStatusChange?.(true);

        if (quizId) {
          api.post(`/student/assessments/${quizId}/camera-status?on=true`).catch(() => {});
        }
      } catch (err: any) {
        if (cancelled) return;
        const msg = err?.message || 'Camera permission denied or device unavailable.';
        setError(msg);
        setActive(false);
        onStatusChange?.(false);

        if (quizId) {
          api.post(`/student/assessments/${quizId}/camera-status?on=false`).catch(() => {});
          if (required) {
            api
              .post(`/student/assessments/${quizId}/warning`, {
                warning_type: 'camera_off',
                detail: msg,
              })
              .catch(() => {});
          }
        }
      }
    }

    initCamera();

    return () => {
      cancelled = true;
      if (snapshotTimerRef.current) {
        clearInterval(snapshotTimerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (quizId) {
        api.post(`/student/assessments/${quizId}/camera-status?on=false`).catch(() => {});
      }
    };
  }, [required, onStatusChange, quizId]);

  // Periodic snapshot capture every 5 seconds
  useEffect(() => {
    if (!captureSnapshots || !active) return;

    const capture = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            if (result && onSnapshot) {
              onSnapshot(result);
            }
          };
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        0.62
      );
    };

    // Capture initial frame after short settling delay
    const initialTimer = setTimeout(capture, 1200);
    snapshotTimerRef.current = setInterval(capture, 5000);

    return () => {
      clearTimeout(initialTimer);
      if (snapshotTimerRef.current) {
        clearInterval(snapshotTimerRef.current);
      }
    };
  }, [active, captureSnapshots, onSnapshot]);

  return (
    <div className="flex flex-col items-center rounded-lg border border-line bg-card p-3 shadow-xs">
      <div className="relative h-28 w-40 overflow-hidden rounded-md border border-line bg-black">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-full w-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />

        {active && (
          <span className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            REC
          </span>
        )}

        {!active && !error && (
          <div className="flex h-full w-full flex-col items-center justify-center text-ink-3">
            <Camera className="h-6 w-6 animate-pulse" />
            <span className="mt-1 text-[11px]">Connecting...</span>
          </div>
        )}

        {error && (
          <div className="flex h-full w-full flex-col items-center justify-center p-2 text-center text-red-400">
            <CameraOff className="h-6 w-6" />
            <span className="mt-1 text-[10px] leading-tight">Camera Unavailable</span>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-xs">
        {active ? (
          <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Proctoring Active (5s Snapshots)
          </span>
        ) : error ? (
          <span className="flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </span>
        ) : (
          <span className="text-ink-3">Initializing camera feed...</span>
        )}
      </div>
    </div>
  );
}
