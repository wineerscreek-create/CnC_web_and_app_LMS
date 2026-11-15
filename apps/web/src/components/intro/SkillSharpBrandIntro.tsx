'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, RotateCcw, X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';

interface SkillSharpBrandIntroProps {
  onComplete?: () => void;
  forceShow?: boolean;
}

interface PillarItem {
  id: string;
  title: string;
  image: string;
  color: string;
  glow: string;
}

const PILLARS: PillarItem[] = [
  {
    id: 'communication',
    title: 'Communication Skills',
    image: '/images/intro/pillar-communication.png',
    color: 'from-sky-500/20 to-blue-600/20',
    glow: 'rgba(56, 189, 248, 0.4)',
  },
  {
    id: 'interpersonal',
    title: 'Interpersonal Skills',
    image: '/images/intro/pillar-interpersonal.png',
    color: 'from-purple-500/20 to-indigo-600/20',
    glow: 'rgba(168, 85, 247, 0.4)',
  },
  {
    id: 'presentation',
    title: 'Presentation Skills',
    image: '/images/intro/pillar-presentation.png',
    color: 'from-amber-500/20 to-yellow-600/20',
    glow: 'rgba(245, 158, 11, 0.4)',
  },
  {
    id: 'leadership',
    title: 'Leadership & Teamwork',
    image: '/images/intro/pillar-leadership.png',
    color: 'from-cyan-500/20 to-teal-600/20',
    glow: 'rgba(6, 182, 212, 0.4)',
  },
  {
    id: 'critical-thinking',
    title: 'Critical Thinking',
    image: '/images/intro/pillar-critical-thinking.png',
    color: 'from-pink-500/20 to-rose-600/20',
    glow: 'rgba(244, 63, 94, 0.4)',
  },
  {
    id: 'workplace-readiness',
    title: 'Workplace Readiness',
    image: '/images/intro/pillar-workplace-readiness.png',
    color: 'from-violet-500/20 to-purple-700/20',
    glow: 'rgba(139, 92, 246, 0.4)',
  },
];

const STORAGE_KEY = 'skillsharp_intro_viewed';

export function SkillSharpBrandIntro({ onComplete, forceShow = false }: SkillSharpBrandIntroProps) {
  const [mounted, setMounted] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(false);
  const [isExiting, setIsExiting] = React.useState(false);
  const [step, setStep] = React.useState<1 | 2 | 3 | 4 | 5>(1);
  const [activePillars, setActivePillars] = React.useState<number>(0);
  const timersRef = React.useRef<number[]>([]);

  const clearTimers = React.useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  }, []);

  const dismissIntro = React.useCallback(() => {
    setIsExiting(true);
    try {
      sessionStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // Ignore sessionStorage exceptions
    }
    setTimeout(() => {
      setIsVisible(false);
      setIsExiting(false);
      clearTimers();
      onComplete?.();
    }, 450);
  }, [clearTimers, onComplete]);

  const startAnimationSequence = React.useCallback((reducedMotion = false) => {
    clearTimers();

    if (reducedMotion) {
      setStep(5);
      setActivePillars(PILLARS.length);
      return;
    }

    setStep(1);
    setActivePillars(0);

    // Step 1: Logo spotlight (0s - 1.2s)
    const t2 = window.setTimeout(() => {
      setStep(2); // Text reveal (1.2s - 2.4s)
    }, 1200);

    const t3 = window.setTimeout(() => {
      setStep(3); // By Winfred Ma'am & soft skills banner (2.4s - 3.6s)
    }, 2400);

    const t4 = window.setTimeout(() => {
      setStep(4); // Staggered pillar entrance (3.6s - 5.8s)
      PILLARS.forEach((_, idx) => {
        const pillarTimer = window.setTimeout(() => {
          setActivePillars((prev) => Math.max(prev, idx + 1));
        }, 200 + idx * 260);
        timersRef.current.push(pillarTimer);
      });
    }, 3600);

    const t5 = window.setTimeout(() => {
      setStep(5); // Final brand composition & Enter CTA (5.8s+)
      setActivePillars(PILLARS.length);
    }, 5600);

    timersRef.current.push(t2, t3, t4, t5);
  }, [clearTimers]);

  // Initial mount check
  React.useEffect(() => {
    setMounted(true);
    if (typeof window === 'undefined') return;

    // Check query param override ?intro=replay or ?intro=true
    const searchParams = new URLSearchParams(window.location.search);
    const hasIntroParam = searchParams.get('intro') === 'true' || searchParams.get('intro') === 'replay';
    const hasSkipParam = searchParams.get('skip_intro') === 'true';

    if (hasSkipParam) {
      setIsVisible(false);
      return;
    }

    const alreadyViewed = sessionStorage.getItem(STORAGE_KEY) === 'true';

    if (forceShow || hasIntroParam || !alreadyViewed) {
      setIsVisible(true);
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      startAnimationSequence(reducedMotion);
    }

    // Listen for custom replay event
    const handleReplayEvent = () => {
      setIsExiting(false);
      setIsVisible(true);
      startAnimationSequence(false);
    };

    window.addEventListener('skillsharp:replay-intro', handleReplayEvent);
    return () => {
      window.removeEventListener('skillsharp:replay-intro', handleReplayEvent);
      clearTimers();
    };
  }, [forceShow, startAnimationSequence, clearTimers]);

  // Lock body scroll while intro is visible
  React.useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isVisible]);

  // Escape key to dismiss
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

  const replayIntro = React.useCallback(() => {
    setIsExiting(false);
    startAnimationSequence(false);
  }, [startAnimationSequence]);

  if (!mounted || !isVisible) return null;

  const content = (
    <aside
      role="region"
      aria-label="SkillSharp Brand Introduction"
      className={cn(
        'fixed inset-0 z-[9999] flex flex-col justify-between overflow-y-auto overflow-x-hidden w-screen max-w-full bg-[#050811] text-white transition-opacity duration-500 ease-out select-none',
        isExiting ? 'opacity-0 scale-[0.98] pointer-events-none' : 'opacity-100 scale-100'
      )}
      style={{
        backgroundImage: `
          radial-gradient(circle at 50% 30%, rgba(59, 130, 246, 0.16) 0%, rgba(147, 51, 234, 0.09) 35%, transparent 70%),
          radial-gradient(circle at 20% 80%, rgba(245, 158, 11, 0.08) 0%, transparent 50%),
          radial-gradient(circle at 80% 85%, rgba(6, 182, 212, 0.08) 0%, transparent 50%)
        `,
      }}
    >
      {/* Background Ambient Star Particles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-50">
        <div className="absolute top-[12%] left-[18%] size-1.5 rounded-full bg-blue-400 blur-[1px] animate-pulse" />
        <div className="absolute top-[25%] right-[22%] size-2 rounded-full bg-amber-400 blur-[1px] animate-ping" style={{ animationDuration: '3s' }} />
        <div className="absolute top-[65%] left-[12%] size-1.5 rounded-full bg-purple-400 blur-[1px] animate-pulse" style={{ animationDuration: '2.5s' }} />
        <div className="absolute top-[75%] right-[15%] size-2 rounded-full bg-cyan-400 blur-[1px] animate-pulse" style={{ animationDuration: '4s' }} />
      </div>

      {/* Top Navigation Bar: Skip & Step Pills */}
      <header className="relative z-10 flex w-full max-w-full items-center justify-between px-3 py-3 sm:px-8 sm:py-6 box-border">
        {/* Intro Step Progress Indicator */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={cn(
                'h-1.5 rounded-full transition-all duration-500',
                step >= s
                  ? 'w-4 sm:w-7 bg-gradient-to-r from-blue-500 to-amber-400 shadow-[0_0_8px_rgba(59,130,246,0.6)]'
                  : 'w-1.5 sm:w-2.5 bg-white/20'
              )}
            />
          ))}
          <span className="ml-1.5 sm:ml-2 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-white/50">
            Step 0{step}
          </span>
        </div>

        {/* Skip Intro Button */}
        <button
          type="button"
          onClick={dismissIntro}
          className="group inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1 sm:px-3.5 sm:py-1.5 text-xs sm:text-sm font-semibold text-white/80 backdrop-blur-md transition-all hover:border-white/30 hover:bg-white/[0.14] hover:text-white hover:shadow-[0_0_15px_rgba(255,255,255,0.15)] active:scale-95 cursor-pointer shrink-0"
          aria-label="Skip Introduction"
        >
          <span>Skip Intro</span>
          <X className="size-3.5 text-white/60 transition-transform group-hover:rotate-90 group-hover:text-white" />
        </button>
      </header>

      {/* Center Cinematic Stage */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-3 py-3 sm:px-6 sm:py-8 max-w-6xl mx-auto w-full box-border">
        {/* STEP 1 & 2: Center Logo & Scaled Reveal */}
        <div
          className={cn(
            'relative flex flex-col items-center justify-center w-full max-w-full overflow-x-clip transition-all duration-700 ease-out',
            step >= 1 ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-90 translate-y-4'
          )}
        >
          {/* Radial Spotlight Ring behind Logo */}
          <div className="pointer-events-none absolute inset-0 scale-110 sm:scale-125 rounded-full bg-gradient-to-tr from-blue-500/20 via-purple-500/20 to-amber-500/20 blur-2xl animate-pulse -z-10" />

          {/* Elevated Glassmorphic Logo Plinth */}
          <div className="relative rounded-2xl sm:rounded-3xl border border-white/15 bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-3 sm:p-6 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] max-w-full">
            <img
              src="/images/skillsharp-learning-logo.png"
              alt="SkillSharp Learning"
              className={cn(
                'h-20 sm:h-36 md:h-44 w-auto max-w-[220px] sm:max-w-[420px] object-contain drop-shadow-[0_12px_24px_rgba(59,130,246,0.4)] transition-all duration-700 select-none',
                step >= 1 ? 'scale-100 brightness-100' : 'scale-90 brightness-75'
              )}
            />
          </div>

          {/* STEP 2: Masked Blur-to-Sharp Text Reveal */}
          <div
            className={cn(
              'mt-3 sm:mt-5 text-center transition-all duration-700 ease-out w-full max-w-full px-2',
              step >= 2 ? 'opacity-100 translate-y-0 blur-0' : 'opacity-0 translate-y-3 blur-sm'
            )}
          >
            <div className="inline-flex items-center gap-1.5 sm:gap-2">
              <span className="text-lg sm:text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-sky-400 via-blue-200 to-amber-400 bg-clip-text text-transparent">
                SkillSharp Learning
              </span>
              <Sparkles className="size-3.5 sm:size-5 text-amber-400 animate-spin" style={{ animationDuration: '6s' }} />
            </div>
            <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-sm font-semibold tracking-[0.2em] sm:tracking-[0.25em] uppercase text-sky-300/80">
              Campus to Corporate
            </p>
          </div>

          {/* STEP 3: Brand Attribution "By Winfred Ma'am" & Soft Skills Banner */}
          <div
            className={cn(
              'mt-2.5 sm:mt-4 flex flex-col items-center gap-2 sm:gap-2.5 transition-all duration-700 ease-out w-full max-w-full px-2 box-border',
              step >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
            )}
          >
            {/* By Winfred Ma'am Banner Asset */}
            <div className="relative inline-flex items-center justify-center max-w-full">
              <img
                src="/images/intro/by-winfred-maam.png"
                alt="By Winfred Ma'am"
                className="h-6 sm:h-9 md:h-11 w-auto max-w-[240px] sm:max-w-[460px] object-contain drop-shadow-[0_4px_12px_rgba(0,180,255,0.4)]"
              />
            </div>

            {/* Soft Skills Pill Banner */}
            <div className="relative inline-flex items-center justify-center max-w-full">
              <img
                src="/images/intro/soft-skills-pill.png"
                alt="Soft Skills • Communication • Personality • Professional Growth"
                className="h-5 sm:h-7 md:h-8 w-auto max-w-[260px] sm:max-w-[540px] object-contain drop-shadow-[0_4px_12px_rgba(30,58,138,0.5)]"
              />
            </div>
          </div>
        </div>

        {/* STEP 4: Soft-Skill Pillars Grid (Sequential Staggered Cards) */}
        <section
          aria-label="Soft Skill Pillars"
          className={cn(
            'mt-5 sm:mt-8 w-full max-w-full transition-all duration-700 ease-out box-border',
            step >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6 pointer-events-none'
          )}
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3.5 max-w-5xl mx-auto w-full box-border">
            {PILLARS.map((pillar, idx) => {
              const isPillarActive = activePillars > idx || step === 5;
              return (
                <div
                  key={pillar.id}
                  className={cn(
                    'group relative flex flex-col items-center text-center rounded-xl sm:rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-2 sm:p-3 backdrop-blur-md transition-all duration-500 hover:border-white/25 hover:scale-105 box-border w-full min-w-0',
                    isPillarActive
                      ? 'opacity-100 translate-y-0 scale-100'
                      : 'opacity-0 translate-y-4 scale-95'
                  )}
                  style={{
                    boxShadow: isPillarActive ? `0 8px 24px -6px ${pillar.glow}` : undefined,
                  }}
                >
                  {/* Pillar Graphic Badge */}
                  <div className="relative size-14 sm:size-20 flex items-center justify-center shrink-0">
                    <img
                      src={pillar.image}
                      alt={pillar.title}
                      className="size-full object-contain drop-shadow-md transition-transform duration-300 group-hover:scale-110"
                    />
                  </div>

                  {/* Pillar Title */}
                  <h3 className="mt-1 text-[10px] sm:text-xs font-bold leading-tight text-white/90 group-hover:text-white truncate max-w-full">
                    {pillar.title}
                  </h3>

                  {/* Step Accent Line */}
                  <div
                    className={cn(
                      'mt-1.5 h-0.5 w-6 rounded-full bg-gradient-to-r',
                      pillar.color
                    )}
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* STEP 5: Primary Action CTA & Replay */}
        <div
          className={cn(
            'mt-5 sm:mt-8 flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-4 transition-all duration-700 ease-out w-full max-w-full px-4 box-border',
            step >= 5 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
          )}
        >
          {/* Enter Website Primary CTA */}
          <button
            type="button"
            onClick={dismissIntro}
            className="group relative inline-flex items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-amber-500 px-6 sm:px-7 py-2.5 sm:py-3 text-sm sm:text-base font-bold text-white shadow-[0_0_30px_rgba(59,130,246,0.5)] transition-all duration-300 hover:from-blue-500 hover:to-amber-400 hover:shadow-[0_0_40px_rgba(245,158,11,0.6)] hover:scale-105 active:scale-95 cursor-pointer"
            aria-label="Enter Website to start learning"
          >
            <span>Enter Website</span>
            <ArrowRight className="size-4 sm:size-5 transition-transform group-hover:translate-x-1" />
          </button>

          {/* Replay Intro Button */}
          <button
            type="button"
            onClick={replayIntro}
            className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-2 text-xs sm:text-sm font-semibold text-white/70 backdrop-blur-sm transition-all hover:border-white/30 hover:bg-white/[0.10] hover:text-white active:scale-95 cursor-pointer"
            aria-label="Replay Introduction Animation"
          >
            <RotateCcw className="size-3.5" />
            <span>Replay Intro</span>
          </button>
        </div>
      </main>

      {/* Footer Branding Info */}
      <footer className="relative z-10 flex w-full max-w-full flex-col sm:flex-row items-center justify-between px-3 py-2 sm:px-8 sm:py-4 text-[10px] sm:text-[11px] text-white/40 border-t border-white/5 box-border text-center sm:text-left gap-1 sm:gap-0">
        <span>SkillSharp LMS © {new Date().getFullYear()} • Campus to Corporate</span>
        <span className="font-medium text-white/60">
          Soft Skills • Communication • Personality • Professional Growth
        </span>
      </footer>
    </aside>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
}

/**
 * Utility helper to trigger Intro replay from anywhere in the application.
 */
export function replaySkillSharpIntro() {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
    window.dispatchEvent(new CustomEvent('skillsharp:replay-intro'));
  }
}
