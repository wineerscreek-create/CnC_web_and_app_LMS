'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export const INTRO_FRAMES: string[] = [
  '/images/intro-frames/frame-01.png',
  '/images/intro-frames/frame-02.png',
  '/images/intro-frames/frame-03.png',
  '/images/intro-frames/frame-04.png',
  '/images/intro-frames/frame-05.png',
  '/images/intro-frames/frame-06.png',
  '/images/intro-frames/frame-07.png',
  '/images/intro-frames/frame-08.png',
  '/images/intro-frames/frame-09.png',
  '/images/intro-frames/frame-10.png',
  '/images/intro-frames/frame-11.png',
  '/images/intro-frames/frame-12.png',
];

const STORAGE_KEY = 'skillsharp_intro_viewed';
const FRAME_DURATION_MS = 750; // 750ms per frame (within 600-900ms requirement)
const FADE_OUT_DURATION_MS = 500;

interface SkillSharpBrandIntroProps {
  onComplete?: () => void;
  forceShow?: boolean;
}

/**
 * SkillSharp Brand Introduction
 * Smooth video-style animated sequence playing the 12 progressive artwork frames
 * in exact sequence (01 -> 12) with subtle crossfades and zero clutter.
 * Concludes on Frame 12 with an "Explore Now" button.
 */
export function SkillSharpBrandIntro({ onComplete, forceShow }: SkillSharpBrandIntroProps) {
  const [mounted, setMounted] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(false);
  const [currentFrame, setCurrentFrame] = React.useState(0);
  const [isComplete, setIsComplete] = React.useState(false);
  const [isExiting, setIsExiting] = React.useState(false);

  const playbackTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear running timers
  const clearTimers = React.useCallback(() => {
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
  }, []);

  // Dismiss intro and navigate to homepage
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

  // Start frame-by-frame playback sequence
  const startPlayback = React.useCallback(() => {
    clearTimers();
    setCurrentFrame(0);
    setIsComplete(false);
    setIsExiting(false);

    // Preload all 12 frames into browser cache
    if (typeof window !== 'undefined') {
      INTRO_FRAMES.forEach((src) => {
        const img = new Image();
        img.src = src;
      });
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      // Skip straight to final frame for reduced motion
      setCurrentFrame(INTRO_FRAMES.length - 1);
      setIsComplete(true);
      return;
    }

    let frame = 0;
    playbackTimerRef.current = setInterval(() => {
      frame += 1;
      if (frame >= INTRO_FRAMES.length - 1) {
        setCurrentFrame(INTRO_FRAMES.length - 1);
        setIsComplete(true);
        if (playbackTimerRef.current) {
          clearInterval(playbackTimerRef.current);
          playbackTimerRef.current = null;
        }
      } else {
        setCurrentFrame(frame);
      }
    }, FRAME_DURATION_MS);
  }, [clearTimers]);

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

    // Replay event listener (e.g. from footer or navigation)
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

  // Keyboard accessibility: Escape to dismiss
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

  if (!mounted || !isVisible) return null;

  const content = (
    <aside
      role="region"
      aria-label="SkillSharp Brand Introduction"
      className={cn(
        'fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#070a0f] text-white select-none overflow-hidden transition-opacity duration-500 ease-out',
        isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      )}
    >
      {/* Viewport Frame Container: Centered, 4:3 native ratio preserved, object-contain */}
      <div className="relative flex flex-1 w-full h-full items-center justify-center p-3 sm:p-6 md:p-8 min-h-0 overflow-hidden">
        <div
          className="relative w-full h-full max-w-[1240px] max-h-[88vh] aspect-[413/308] flex items-center justify-center overflow-hidden"
          style={{ maxWidth: 'min(1240px, 92vw)' }}
        >
          {INTRO_FRAMES.map((src, index) => {
            const isActive = index === currentFrame;
            const isPrevious = index === currentFrame - 1;
            const isVisibleFrame = isActive || isPrevious;

            return (
              <img
                key={src}
                src={src}
                alt={`SkillSharp Intro Animation Frame ${index + 1}`}
                loading="eager"
                decoding="async"
                draggable={false}
                className={cn(
                  'absolute inset-0 w-full h-full object-contain pointer-events-none select-none transition-opacity duration-300 ease-in-out',
                  isActive
                    ? 'opacity-100 z-10'
                    : isPrevious
                    ? 'opacity-100 z-0'
                    : 'opacity-0 pointer-events-none z-0'
                )}
                style={{
                  display: isVisibleFrame ? 'block' : 'none',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Final Action Button: Appears only after Frame 12 completes */}
      {isComplete && (
        <div className="absolute bottom-6 sm:bottom-10 z-30 flex items-center justify-center animate-enter px-4">
          <button
            type="button"
            onClick={dismissIntro}
            aria-label="Explore Now — Enter SkillSharp Website"
            className="group inline-flex items-center gap-2.5 rounded-full bg-primary px-7 py-3 sm:px-9 sm:py-3.5 text-sm sm:text-base font-bold text-primary-foreground shadow-2xl transition-all duration-300 hover:scale-105 hover:bg-primary/95 active:scale-95 cursor-pointer border border-primary/40 ring-4 ring-primary/20"
          >
            <span>Explore Now</span>
            <ArrowRight className="size-4 sm:size-5 transition-transform duration-200 group-hover:translate-x-1" />
          </button>
        </div>
      )}
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
