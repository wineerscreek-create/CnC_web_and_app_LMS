'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export const INTRO_IMAGE_SRC = '/images/c00b9231-d221-4252-9d83-7102eb29b0bb.png';
const STORAGE_KEY = 'skillsharp_intro_viewed';
const PLAYBACK_DURATION_MS = 7000; // 7 seconds (approx 6-8 seconds)
const FADE_OUT_DURATION_MS = 600;

interface SkillSharpBrandIntroProps {
  onComplete?: () => void;
  forceShow?: boolean;
}

/**
 * SkillSharp Brand Introduction
 * Plays back the complete, unaltered approved artwork as a clean video-style intro
 * with smooth fade transitions, responsive 16:9 container, and Skip / Replay options.
 */
export function SkillSharpBrandIntro({ onComplete, forceShow }: SkillSharpBrandIntroProps) {
  const [mounted, setMounted] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(false);
  const [isFadingIn, setIsFadingIn] = React.useState(false);
  const [isExiting, setIsExiting] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  const playbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = React.useRef<number>(0);

  // Clear all running timers
  const clearTimers = React.useCallback(() => {
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  // Dismiss intro and transition to homepage
  const dismissIntro = React.useCallback(() => {
    clearTimers();
    setIsExiting(true);
    try {
      sessionStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // sessionStorage unavailable
    }

    setTimeout(() => {
      setIsVisible(false);
      setIsExiting(false);
      onComplete?.();
    }, FADE_OUT_DURATION_MS);
  }, [clearTimers, onComplete]);

  // Start the 6-8 second playback sequence
  const startPlayback = React.useCallback(() => {
    clearTimers();
    setIsExiting(false);
    setIsFadingIn(false);
    setProgress(0);

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Small delay for clean initial frame before fade-in
    setTimeout(() => {
      setIsFadingIn(true);
    }, 50);

    const duration = prefersReducedMotion ? 3000 : PLAYBACK_DURATION_MS;
    startTimeRef.current = Date.now();

    // Progress bar updater
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgress(pct);
    }, 50);

    // Auto-transition after playback duration
    playbackTimerRef.current = setTimeout(() => {
      dismissIntro();
    }, duration);
  }, [clearTimers, dismissIntro]);

  // Initial mount check
  React.useEffect(() => {
    setMounted(true);

    const urlParams = new URLSearchParams(window.location.search);
    const hasIntroParam = urlParams.get('intro') === 'true';
    const alreadyViewed = sessionStorage.getItem(STORAGE_KEY) === 'true';

    if (forceShow || hasIntroParam || !alreadyViewed) {
      setIsVisible(true);
      startPlayback();
    }

    // Listen for custom replay event from SiteFooter or other controls
    const handleReplayEvent = () => {
      setIsVisible(true);
      startPlayback();
    };

    window.addEventListener('skillsharp:replay-intro', handleReplayEvent);
    return () => {
      window.removeEventListener('skillsharp:replay-intro', handleReplayEvent);
      clearTimers();
    };
  }, [forceShow, startPlayback, clearTimers]);

  // Lock body scroll while intro is visible
  React.useEffect(() => {
    if (isVisible) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isVisible]);

  // Escape key listener to skip
  React.useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismissIntro();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, dismissIntro]);

  // Replay handler
  const handleReplay = React.useCallback(() => {
    startPlayback();
  }, [startPlayback]);

  if (!mounted || !isVisible) return null;

  const content = (
    <aside
      role="region"
      aria-label="SkillSharp Brand Introduction"
      className={cn(
        'fixed inset-0 z-[9999] flex flex-col items-center justify-between bg-[#070a0f] text-white select-none transition-opacity duration-500 ease-out',
        isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      )}
    >
      {/* Top Controls Bar */}
      <header className="relative z-20 flex w-full items-center justify-between px-4 py-3 sm:px-8 sm:py-5">
        <div className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] sm:text-xs font-semibold tracking-wider uppercase text-white/70">
            SkillSharp Brand Intro
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReplay}
            aria-label="Replay intro"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md transition-all hover:bg-white/20 active:scale-95"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Replay</span>
          </button>

          <button
            type="button"
            onClick={dismissIntro}
            aria-label="Skip intro and enter website"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur-md shadow-sm transition-all hover:bg-white/25 active:scale-95"
          >
            <span>Skip Intro</span>
            <ArrowRight className="size-3.5" aria-hidden />
          </button>
        </div>
      </header>

      {/* Main Artwork Container - 16:9 preserved, object-contain, centered, zero alteration */}
      <main className="relative flex flex-1 w-full items-center justify-center p-2 sm:p-6 md:p-8 min-h-0 overflow-hidden">
        <div
          className={cn(
            'relative flex items-center justify-center w-full h-full max-w-[1672px] max-h-full transition-opacity duration-1000 ease-out',
            isFadingIn ? 'opacity-100' : 'opacity-0'
          )}
        >
          <img
            src={INTRO_IMAGE_SRC}
            alt="SkillSharp — Campus to Corporate"
            loading="eager"
            decoding="async"
            draggable={false}
            className="max-h-full max-w-full w-auto h-auto object-contain aspect-[16/9] shadow-2xl rounded-lg pointer-events-none select-none"
            style={{
              maxHeight: 'calc(100vh - 120px)',
              maxWidth: 'calc(100vw - 16px)',
            }}
          />
        </div>
      </main>

      {/* Bottom Playback Progress Bar */}
      <footer className="relative z-20 w-full px-4 py-3 sm:px-8 sm:py-4 flex flex-col gap-2">
        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 via-amber-400 to-emerald-400 transition-all duration-75 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-white/50 px-0.5">
          <span>Campus to Corporate</span>
          <span>Press ESC or click Skip Intro to proceed</span>
        </div>
      </footer>
    </aside>
  );

  return createPortal(content, document.body);
}

/**
 * Programmatic helper to trigger intro replay from anywhere in the app
 */
export function replaySkillSharpIntro(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage unavailable
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('skillsharp:replay-intro'));
  }
}
