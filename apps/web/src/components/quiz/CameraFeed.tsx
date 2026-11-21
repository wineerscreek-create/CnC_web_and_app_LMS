'use client';

import React, { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Camera, CameraOff, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

interface CameraFeedProps {
  required?: boolean;
  captureSnapshots?: boolean;
  onStatusChange?: (active: boolean) => void;
  onStateChange?: (state: 'READY' | 'PERMISSION_DENIED' | 'UNAVAILABLE' | 'INITIALIZING') => void;
  onSnapshot?: (base64Snapshot: string) => void;
  quizId?: string;
  compact?: boolean;
  className?: string;
}

export function CameraFeed({
  required = true,
  captureSnapshots = true,
  onStatusChange,
  onStateChange,
  onSnapshot,
  quizId,
  compact = false,
  className,
}: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const snapshotTimerRef = useRef<any>(null);

  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<'READY' | 'PERMISSION_DENIED' | 'UNAVAILABLE' | 'INITIALIZING'>('INITIALIZING');
  const [retryNonce, setRetryNonce] = useState(0);

  // Initialize camera stream with mobile front camera preference
  useEffect(() => {
    let cancelled = false;
    setCameraState('INITIALIZING');
    onStateChange?.('INITIALIZING');

    async function initCamera() {
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: 'user',
            },
            audio: false,
          });
        } catch {
          // Fallback if ideal dimensions or facingMode constraint fails on older mobile browsers
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

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
        setCameraState('READY');
        onStatusChange?.(true);
        onStateChange?.('READY');

        if (quizId && captureSnapshots) {
          api.post(`/student/assessments/${quizId}/camera-status?on=true`).catch(() => {});
        }
      } catch (err: any) {
        if (cancelled) return;
        const errName = err?.name || '';
        const isPermission =
          errName === 'NotAllowedError' ||
          errName === 'PermissionDeniedError' ||
          String(err?.message || '').toLowerCase().includes('permission');
        
        const stateKey = isPermission ? 'PERMISSION_DENIED' : 'UNAVAILABLE';
        const msg = isPermission
          ? 'Camera permission denied. Please allow camera access in your browser address bar.'
          : (err?.message || 'Camera device unavailable or not detected.');

        setError(msg);
        setActive(false);
        setCameraState(stateKey);
        onStatusChange?.(false);
        onStateChange?.(stateKey);

        // Only send proctoring violations during active exam (captureSnapshots=true)
        // Pre-assessment verification must NEVER trigger proctoring penalties or attempts
        if (quizId && captureSnapshots) {
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

    if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      initCamera();
    } else {
      setError('MediaDevices API not supported in this browser.');
      setCameraState('UNAVAILABLE');
      onStatusChange?.(false);
      onStateChange?.('UNAVAILABLE');
    }

    return () => {
      cancelled = true;
      if (snapshotTimerRef.current) {
        clearInterval(snapshotTimerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (quizId && captureSnapshots) {
        api.post(`/student/assessments/${quizId}/camera-status?on=false`).catch(() => {});
      }
    };
  }, [required, onStatusChange, onStateChange, quizId, captureSnapshots, retryNonce]);

  // Periodic snapshot capture every 5 seconds
  useEffect(() => {
    if (!captureSnapshots || !active) return;

    const capture = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      canvas.width = 320;
      canvas.height = 240;
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
        0.60
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

  if (compact) {
    return (
      <div
        className={cn(
          'relative flex items-center justify-center overflow-hidden rounded-lg border border-line bg-black shadow-xs',
          className || 'h-16 w-24 sm:h-20 sm:w-28'
        )}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-full w-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />

        {active && (
          <span className="absolute top-1 right-1 flex items-center gap-1 rounded bg-black/80 px-1 py-0.2 text-[9px] font-semibold text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            LIVE
          </span>
        )}

        {!active && !error && (
          <div className="flex flex-col items-center justify-center text-ink-3">
            <Camera className="h-4 w-4 animate-pulse" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center p-1 text-center text-red-400">
            <CameraOff className="h-4 w-4" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-lg border border-line bg-card p-3 shadow-xs',
        className
      )}
    >
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
          <div className="flex flex-col items-center gap-1.5">
            <span className="flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </span>
            <button
              type="button"
              onClick={() => setRetryNonce((n) => n + 1)}
              className="mt-1 rounded border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-ink-1 hover:bg-card-hover"
            >
              Retry Camera Permission
            </button>
          </div>
        ) : (
          <span className="text-ink-3">Initializing camera feed...</span>
        )}
      </div>
    </div>
  );
}
