'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { offlineDB, type OfflineTimerCheckpoint } from '@/lib/offline/db';
import { toast } from 'sonner';

export interface UseOfflineTimerOptions {
  quizId: string;
  userId: string;
  attemptId: string;
  totalDurationSeconds: number;
  initialRemainingSeconds?: number;
  enabled?: boolean;
  onTimeExpired?: () => void;
  onRewindDetected?: (deltaSeconds: number) => void;
}

export function useOfflineTimer({
  quizId,
  userId,
  attemptId,
  totalDurationSeconds,
  initialRemainingSeconds,
  enabled = true,
  onTimeExpired,
  onRewindDetected,
}: UseOfflineTimerOptions) {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    return initialRemainingSeconds != null ? initialRemainingSeconds : totalDurationSeconds;
  });
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isExpired, setIsExpired] = useState<boolean>(false);

  const remainingRef = useRef<number>(remainingSeconds);
  remainingRef.current = remainingSeconds;

  const elapsedRef = useRef<number>(elapsedSeconds);
  elapsedRef.current = elapsedSeconds;

  const lastMonotonicRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : 0);
  const lastWallClockRef = useRef<number>(Date.now());
  const checkpointKey = `${userId}_${quizId}`;
  const timerExpiredCallbackRef = useRef(onTimeExpired);
  timerExpiredCallbackRef.current = onTimeExpired;
  const rewindDetectedCallbackRef = useRef(onRewindDetected);
  rewindDetectedCallbackRef.current = onRewindDetected;

  // Initialize or restore checkpoint from IndexedDB
  useEffect(() => {
    if (!enabled || !quizId || !userId) return;

    let mounted = true;

    async function loadCheckpoint() {
      try {
        const cp = await offlineDB.offlineTimerCheckpoints.get(checkpointKey);
        if (cp && mounted) {
          const nowWall = Date.now();
          // Detect backward clock manipulation
          if (nowWall < cp.lastWallClock - 5000) {
            console.warn('[OfflineTimer] System clock moved backward detected!');
            toast.warning('System clock modification detected. Monotonic exam timer preserved.');
            rewindDetectedCallbackRef.current?.(Math.floor((cp.lastWallClock - nowWall) / 1000));
          }

          if (cp.isCompleted) {
            setRemainingSeconds(0);
            setIsExpired(true);
            return;
          }

          if (cp.remainingSeconds != null && cp.remainingSeconds < totalDurationSeconds) {
            setRemainingSeconds(Math.max(0, cp.remainingSeconds));
            setElapsedSeconds(cp.elapsedSeconds || (totalDurationSeconds - cp.remainingSeconds));
          }
        }
      } catch (err) {
        console.warn('[OfflineTimer] Error loading timer checkpoint:', err);
      }
    }

    void loadCheckpoint();

    return () => {
      mounted = false;
    };
  }, [quizId, userId, checkpointKey, totalDurationSeconds, enabled]);

  // Main high-precision monotonic tick loop
  useEffect(() => {
    if (!enabled || isExpired || totalDurationSeconds <= 0) return;

    lastMonotonicRef.current = performance.now();
    lastWallClockRef.current = Date.now();

    const interval = setInterval(async () => {
      const nowMonotonic = performance.now();
      const nowWall = Date.now();

      // Monotonic delta in seconds
      const deltaMonotonic = (nowMonotonic - lastMonotonicRef.current) / 1000;
      lastMonotonicRef.current = nowMonotonic;

      // Check wall-clock backward drift
      if (nowWall < lastWallClockRef.current - 5000) {
        const drift = Math.floor((lastWallClockRef.current - nowWall) / 1000);
        console.warn(`[OfflineTimer] Detected wall clock rewind of ${drift}s`);
        toast.warning('System clock modification detected. Timer integrity enforced.');
        rewindDetectedCallbackRef.current?.(drift);
      }
      lastWallClockRef.current = nowWall;

      const newRemaining = Math.max(0, remainingRef.current - deltaMonotonic);
      const newElapsed = elapsedRef.current + deltaMonotonic;

      remainingRef.current = newRemaining;
      elapsedRef.current = newElapsed;

      setRemainingSeconds(Math.floor(newRemaining));
      setElapsedSeconds(Math.floor(newElapsed));

      // Periodic checkpoint every ~5 seconds or on expiration
      if (Math.floor(newRemaining) % 5 === 0 || newRemaining <= 0) {
        const isFinished = newRemaining <= 0;
        const checkpoint: OfflineTimerCheckpoint = {
          id: checkpointKey,
          quizId,
          userId,
          attemptId,
          durationMinutes: Math.ceil(totalDurationSeconds / 60),
          elapsedSeconds: Math.floor(newElapsed),
          remainingSeconds: Math.floor(newRemaining),
          lastMonotonicTime: nowMonotonic,
          lastWallClock: nowWall,
          isCompleted: isFinished,
          updatedAt: new Date().toISOString(),
        };

        try {
          await offlineDB.offlineTimerCheckpoints.put(checkpoint);
        } catch (e) {
          console.warn('[OfflineTimer] Failed to save checkpoint:', e);
        }

        if (isFinished && !isExpired) {
          setIsExpired(true);
          clearInterval(interval);
          timerExpiredCallbackRef.current?.();
        }
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [enabled, isExpired, totalDurationSeconds, checkpointKey, quizId, userId, attemptId]);

  const markCompleted = useCallback(async () => {
    setIsExpired(true);
    try {
      await offlineDB.offlineTimerCheckpoints.put({
        id: checkpointKey,
        quizId,
        userId,
        attemptId,
        durationMinutes: Math.ceil(totalDurationSeconds / 60),
        elapsedSeconds: elapsedRef.current,
        remainingSeconds: 0,
        lastMonotonicTime: performance.now(),
        lastWallClock: Date.now(),
        isCompleted: true,
        updatedAt: new Date().toISOString(),
      });
    } catch {}
  }, [checkpointKey, quizId, userId, attemptId, totalDurationSeconds]);

  return {
    remainingSeconds: Math.floor(remainingSeconds),
    elapsedSeconds: Math.floor(elapsedSeconds),
    isExpired,
    markCompleted,
  };
}
