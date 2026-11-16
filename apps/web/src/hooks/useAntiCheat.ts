'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export interface AntiCheatOptions {
  enabled: boolean;
  quizId?: string;
  cameraRequired?: boolean;
  fullscreenRequired?: boolean;
  maxWarnings?: number;
  onAutoSubmit?: (reason: string) => void;
  onWarningRecorded?: (warning: { type: string; count: number; detail?: string }) => void;
}

export function useAntiCheat({
  enabled,
  quizId,
  fullscreenRequired = true,
  maxWarnings = 3,
  onAutoSubmit,
  onWarningRecorded,
}: AntiCheatOptions) {
  const [warningCount, setWarningCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== 'undefined' ? !!document.fullscreenElement : false
  );
  const [lastWarning, setLastWarning] = useState<{
    type: string;
    detail?: string;
    count: number;
  } | null>(null);

  const devtoolsCheckRef = useRef<any>(null);

  const reportWarning = useCallback(
    async (warning_type: string, detail?: string) => {
      if (!enabled || !quizId) return;

      try {
        const { data } = await api.post(`/student/assessments/${quizId}/warning`, {
          warning_type,
          detail,
        });

        const count = data.warning_count ?? warningCount + 1;
        setWarningCount(count);
        setLastWarning({ type: warning_type, detail, count });
        onWarningRecorded?.({ type: warning_type, count, detail });

        toast.error(`Warning ${count}/${maxWarnings}: ${detail || 'Violation recorded'}`);

        if (data.auto_submit || count >= maxWarnings) {
          toast.error('Maximum warnings exceeded. Auto-submitting assessment now.');
          onAutoSubmit?.('auto_warning_limit');
        }
      } catch (err) {
        console.warn('Failed to report anti-cheat warning', err);
      }
    },
    [enabled, quizId, warningCount, maxWarnings, onAutoSubmit, onWarningRecorded]
  );

  // Fullscreen enforcement
  const requestFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    if (typeof document !== 'undefined' && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!enabled || !fullscreenRequired || !quizId) return;

    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      api
        .post(`/student/assessments/${quizId}/fullscreen-status?on=${isFs}`)
        .catch(() => {});

      if (!isFs) {
        reportWarning('fullscreen_exit', 'Exited fullscreen examination mode');
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [enabled, fullscreenRequired, quizId, reportWarning]);

  // Tab switch & Window Blur
  useEffect(() => {
    if (!enabled) return;

    const onVisibility = () => {
      if (document.hidden) {
        reportWarning('tab_switch', 'Tab switched or browser minimized');
      }
    };

    const onBlur = () => {
      reportWarning('tab_switch', 'Window lost focus');
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
    };
  }, [enabled, reportWarning]);

  // Context Menu, Copy, Paste, DevTools Shortcuts
  useEffect(() => {
    if (!enabled) return;

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      reportWarning('right_click', 'Right-click context menu is prohibited');
    };

    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      reportWarning('copy_paste', 'Copying question content is prohibited');
    };

    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      reportWarning('copy_paste', 'Pasting is prohibited');
    };

    const onCut = (e: ClipboardEvent) => e.preventDefault();
    const onSelectStart = (e: Event) => e.preventDefault();

    const onKeyDown = (e: KeyboardEvent) => {
      // Block common print / devtools / view-source shortcuts
      const isDevTools =
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) &&
          e.shiftKey &&
          ['i', 'j', 'c'].includes(e.key.toLowerCase())) ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p');

      if (isDevTools) {
        e.preventDefault();
        reportWarning('devtools_open', `Prohibited shortcut attempt: ${e.key}`);
      }
    };

    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('cut', onCut);
    document.addEventListener('selectstart', onSelectStart);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('selectstart', onSelectStart);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, reportWarning]);

  // Window dimension delta heuristic (DevTools docking)
  useEffect(() => {
    if (!enabled) return;

    devtoolsCheckRef.current = setInterval(() => {
      const threshold = 160;
      const widthDelta = window.outerWidth - window.innerWidth;
      const heightDelta = window.outerHeight - window.innerHeight;
      if (widthDelta > threshold || heightDelta > threshold) {
        reportWarning('devtools_open', 'Inspect element / DevTools panel detected');
      }
    }, 4000);

    return () => {
      if (devtoolsCheckRef.current) clearInterval(devtoolsCheckRef.current);
    };
  }, [enabled, reportWarning]);

  // Browser back-button protection
  useEffect(() => {
    if (!enabled) return;

    history.pushState(null, '', location.href);

    const onPopState = () => {
      history.pushState(null, '', location.href);
      reportWarning('tab_switch', 'Browser navigation / back-button pressed');
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [enabled, reportWarning]);

  // Refresh confirmation
  useEffect(() => {
    if (!enabled) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [enabled]);

  return {
    warningCount,
    lastWarning,
    reportWarning,
    requestFullscreen,
    exitFullscreen,
    isFullscreen,
  };
}
