'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

export interface UseExamTabLockOptions {
  quizId: string | undefined;
  enabled?: boolean;
  onMultiTabDetected?: () => void;
}

/**
 * Enforces single-tab examination access using Web Locks API (navigator.locks).
 * Works completely offline without server or network communication.
 */
export function useExamTabLock({
  quizId,
  enabled = true,
  onMultiTabDetected,
}: UseExamTabLockOptions) {
  const onMultiTabDetectedRef = useRef(onMultiTabDetected);
  onMultiTabDetectedRef.current = onMultiTabDetected;

  useEffect(() => {
    if (!enabled || !quizId || typeof navigator === 'undefined' || !navigator.locks) {
      return;
    }

    let isDisposed = false;
    const controller = new AbortController();

    navigator.locks.request(
      `winners_creek_exam_lock_${quizId}`,
      { ifAvailable: true, signal: controller.signal },
      async (lock) => {
        if (!lock) {
          // Lock already held by another open tab!
          toast.error(
            'Multi-Tab Restriction: This assessment is already running in another browser tab. Please close other tabs to continue.',
            { duration: 8000 }
          );
          onMultiTabDetectedRef.current?.();
          return;
        }

        // Lock acquired, hold it for the lifetime of this component mount
        return new Promise<void>((resolve) => {
          const poll = setInterval(() => {
            if (isDisposed) {
              clearInterval(poll);
              resolve();
            }
          }, 500);
        });
      }
    ).catch((err) => {
      // Lock request aborted on unmount or browser closed
      if (err?.name !== 'AbortError') {
        console.warn('[ExamTabLock] Lock request notice:', err);
      }
    });

    return () => {
      isDisposed = true;
      controller.abort();
    };
  }, [quizId, enabled]);
}
