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
const FRAME_DURATION_MS = 700; // 700ms per progressive reveal stage (~8.4s total animation)
const FADE_OUT_DURATION_MS = 500;

interface SkillSharpBrandIntroProps {
  onComplete?: () => void;
  forceShow?: boolean;
}

/**
 * SkillSharp Continuous Cinematic Brand Introduction
 * Revealing the 12 progressive artwork stages from c00b9231-d221-4252-9d83-7102eb29b0bb.png.
 * 
 * Strict specifications:
 * - 100vw x 100dvh full viewport coverage
 * - Deep navy cosmic background matching original artwork (zero checkerboard)
 * - Native 413:308 aspect ratio strictly preserved with zero distortion or stretching
 * - Zero UI during playback (no navigation, no progress bars, no headers, no sidebars, no extra text)
 * - Frame 12 holds indefinitely on completion
 * - Animated Explore Now button appears at bottom center with cyan/blue glow
 */
export function SkillSharpBrandIntro({ onComplete, forceShow }: SkillSharpBrandIntroProps) {
  const [mounted, setMounted] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(false);
  const [currentFrame, setCurrentFrame] = React.useState(0);
  const [isComplete, setIsComplete] = React.useState(false);
  const [isExiting, setIsExiting] = React.useState(false);
  const [isCinematicDrifting, setIsCinematicDrifting] = React.useState(false);

  const playbackTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear running timers
  const clearTimers = React.useCallback(() => {
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
  }, []);

  // Dismiss intro and navigate to website homepage
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

  // Start continuous frame-by-frame reveal sequence
  const startPlayback = React.useCallback(() => {
    clearTimers();
    setCurrentFrame(0);
    setIsComplete(false);
    setIsExiting(false);
    setIsCinematicDrifting(false);

    // Eagerly preload all 12 frames in browser memory
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
      setCurrentFrame(INTRO_FRAMES.length - 1);
      setIsComplete(true);
      return;
    }

    // Start subtle cinematic push
    setTimeout(() => {
      setIsCinematicDrifting(true);
    }, 50);

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

    // Custom replay event listener (e.g. from footer button)
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
        'fixed inset-0 z-[9999] flex flex-col items-center justify-center w-screen h-[100dvh] overflow-hidden select-none transition-opacity duration-600 ease-out',
        isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      )}
      style={{
        background: 'radial-gradient(ellipse at 50% 50%, #071539 0%, #030a1e 55%, #020510 100%)',
      }}
    >
      {/* Subtle Cosmic Ambient Lighting Effects */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(circle at 18% 28%, rgba(0, 210, 255, 0.08), transparent 32%), radial-gradient(circle at 82% 72%, rgba(248, 152, 41, 0.06), transparent 30%), radial-gradient(circle at 50% 88%, rgba(122, 40, 255, 0.08), transparent 35%)',
        }}
      />

      {/* Full-Screen Centered Artwork Composition — Native 413:308 aspect ratio, zero stretching, zero cropping */}
      <div className="relative flex flex-1 w-full h-full items-center justify-center min-h-0 overflow-hidden">
        <div
          className={cn(
            'relative flex items-center justify-center select-none transition-transform duration-[8500ms] ease-out',
            isCinematicDrifting ? 'scale-[1.025]' : 'scale-100'
          )}
          style={{
            width: 'min(100vw, calc(100dvh * (413 / 308)))',
            height: 'min(100dvh, calc(100vw * (308 / 413)))',
            aspectRatio: '413 / 308',
            maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,1) 88%, rgba(0,0,0,0) 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,1) 88%, rgba(0,0,0,0) 100%)',
          }}
        >
          {INTRO_FRAMES.map((src, index) => {
            const isPast = index < currentFrame;
            const isCurrent = index === currentFrame;
            const isNext = index === currentFrame + 1;
            const isRendered = isPast || isCurrent || isNext;

            return (
              <img
                key={src}
                src={src}
                alt={`SkillSharp Intro Animation Frame ${index + 1}`}
                loading="eager"
                decoding="async"
                draggable={false}
                className={cn(
                  'absolute inset-0 w-full h-full object-contain pointer-events-none select-none transition-opacity duration-600 ease-in-out',
                  isCurrent
                    ? 'opacity-100 z-10'
                    : isPast
                    ? 'opacity-100 z-0'
                    : 'opacity-0 z-0 pointer-events-none'
                )}
                style={{
                  display: isRendered ? 'block' : 'none',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Final Action Button: Appears only after Frame 12 completes, with SkillSharp cyan/blue glow */}
      {isComplete && (
        <div className="absolute bottom-8 sm:bottom-12 z-30 flex items-center justify-center animate-enter px-4">
          <button
            type="button"
            onClick={dismissIntro}
            aria-label="Explore Now — Enter SkillSharp Website"
            className="group inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-[#0066cc] via-[#0096c7] to-[#00b4d8] px-8 py-3.5 sm:px-10 sm:py-4 text-sm sm:text-base font-bold text-white shadow-[0_0_35px_rgba(0,180,216,0.6)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_50px_rgba(0,180,216,0.9)] active:scale-95 cursor-pointer border border-[#48cae4]/50 ring-4 ring-[#0077b6]/20"
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
