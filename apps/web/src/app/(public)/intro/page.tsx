'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, RotateCcw, Pause, Play, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  INTRO_BEAT_NAMES,
  INTRO_BOUNDARIES,
} from '@/components/intro/SkillSharpBrandIntro';

const TOTAL_DURATION_SEC = 10.0;
const ARTWORK_SRC = '/images/b034822d-5401-4120-8e6b-85dc0c4c6963.png';

export default function IntroPage() {
  const [isPlaying, setIsPlaying] = React.useState(true);
  const [elapsed, setElapsed] = React.useState(0);
  const [animationIteration, setAnimationIteration] = React.useState(0);
  const [isComplete, setIsComplete] = React.useState(false);

  const startTimeRef = React.useRef<number>(0);
  const elapsedRef = React.useRef<number>(0);
  const rafRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  const tick = React.useCallback((now: number) => {
    const currentElapsed = Math.min(
      TOTAL_DURATION_SEC,
      (now - startTimeRef.current) / 1000
    );
    setElapsed(currentElapsed);

    if (currentElapsed >= 8.5) {
      setIsComplete(true);
    }

    if (currentElapsed < TOTAL_DURATION_SEC) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      setIsPlaying(false);
      setIsComplete(true);
    }
  }, []);

  const togglePlay = React.useCallback(() => {
    if (isPlaying) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setIsPlaying(false);
    } else {
      if (elapsedRef.current >= TOTAL_DURATION_SEC) {
        setAnimationIteration((prev) => prev + 1);
        setElapsed(0);
        setIsComplete(false);
        startTimeRef.current = performance.now();
        setIsPlaying(true);
        rafRef.current = requestAnimationFrame(tick);
      } else {
        startTimeRef.current = performance.now() - elapsedRef.current * 1000;
        setIsPlaying(true);
        rafRef.current = requestAnimationFrame(tick);
      }
    }
  }, [isPlaying, tick]);

  const replayIntro = React.useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setAnimationIteration((prev) => prev + 1);
    setElapsed(0);
    setIsComplete(false);
    startTimeRef.current = performance.now();
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  React.useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setElapsed(TOTAL_DURATION_SEC);
      setIsPlaying(false);
      setIsComplete(true);
    } else {
      startTimeRef.current = performance.now();
      setIsPlaying(true);
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [tick]);

  const currentBeatIndex = Math.min(
    11,
    INTRO_BOUNDARIES.findIndex(
      (v, i) => i < 12 && elapsed >= v && elapsed < INTRO_BOUNDARIES[i + 1]
    ) === -1
      ? 11
      : INTRO_BOUNDARIES.findIndex(
          (v, i) => i < 12 && elapsed >= v && elapsed < INTRO_BOUNDARIES[i + 1]
        )
  );

  const currentBeatTitle = `${String(currentBeatIndex + 1).padStart(2, '0')} / 12 · ${
    INTRO_BEAT_NAMES[currentBeatIndex]
  }`;

  return (
    <div className="min-h-screen bg-[#060b1e] text-[#eef4ff] flex flex-col justify-center px-4 sm:px-6 md:px-8 py-8 select-none">
      <style>{`
        .ss-stage {
          position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden;
          background: radial-gradient(ellipse at 50% 49%, #0d1d45 0%, #080e2a 46%, #030819 100%);
          border: 1px solid #294570; border-radius: 15px; isolation: isolate;
          box-shadow: 0 20px 70px #0008, inset 0 0 90px #030716;
        }
        .ss-stage::after {
          content: ""; position: absolute; inset: 0; z-index: 12; pointer-events: none;
          box-shadow: inset 0 0 80px #020513a8;
        }
        .ss-stage:not(.ss-running) .ss-animated {
          animation-play-state: paused !important;
        }
        .ss-artboard {
          position: absolute; width: 100%; aspect-ratio: 2 / 1; top: 50%; left: 0; transform: translateY(-50%);
        }
        .ss-artboard img {
          position: absolute; inset: 0; display: block; width: 100%; height: 100%;
          object-fit: contain; user-select: none; pointer-events: none;
        }
        .ss-layer { position: absolute; inset: 0; opacity: 0; }
        .ss-symbol {
          clip-path: polygon(9% 3%, 38% 3%, 38% 59%, 9% 59%);
          animation: ssSymbolIn 10s both;
        }
        .ss-name {
          clip-path: polygon(39% 17%, 93% 17%, 93% 45%, 39% 45%);
          animation: ssNameIn 10s steps(10, end) both;
        }
        .ss-tagline {
          clip-path: polygon(47% 42%, 80% 42%, 80% 52%, 47% 52%);
          animation: ssTaglineIn 10s both;
        }
        .ss-subjects {
          clip-path: polygon(28% 50%, 94% 50%, 94% 60%, 28% 60%);
          animation: ssSubjectsIn 10s both;
        }
        .ss-base-art {
          animation: ssFullIn 10s both;
        }
        .ss-icon-slice {
          position: absolute; top: 69%; height: 25%; width: 13%; overflow: hidden; opacity: 0;
          animation: ssIconIn 0.28s ease-out both;
        }
        .ss-icon-slice img {
          width: 769.23%; max-width: none; height: 400%; top: -276%; object-fit: fill;
        }
        .ss-icon-1 { left: 14%; animation-delay: 7.05s; } .ss-icon-1 img { left: -107.69%; }
        .ss-icon-2 { left: 27%; animation-delay: 7.35s; } .ss-icon-2 img { left: -207.69%; }
        .ss-icon-3 { left: 40%; animation-delay: 7.65s; } .ss-icon-3 img { left: -307.69%; }
        .ss-icon-4 { left: 53%; animation-delay: 7.95s; } .ss-icon-4 img { left: -407.69%; }
        .ss-icon-5 { left: 66%; animation-delay: 8.25s; } .ss-icon-5 img { left: -507.69%; }
        .ss-icon-6 { left: 79%; animation-delay: 8.55s; } .ss-icon-6 img { left: -607.69%; }
        
        .ss-beam {
          position: absolute; z-index: 1; left: -45%; top: 11%; width: 68%; height: 38%;
          transform: rotate(-24deg);
          background: linear-gradient(90deg, transparent, #007dff0a, #28b9ff85, #9deaff1a, transparent);
          filter: blur(20px); animation: ssBeamMove 10s both; mix-blend-mode: screen;
        }
        .ss-orbit {
          position: absolute; z-index: 2; left: 11%; top: 12%; width: 27%; aspect-ratio: 1;
          border-radius: 50%; border: 2px solid transparent; border-top-color: #34d8ff; border-left-color: #784cff;
          filter: drop-shadow(0 0 12px #277dff); opacity: 0; animation: ssOrbitMove 10s both;
        }
        .ss-orbit.two {
          width: 21%; left: 14%; top: 16%; border-top-color: #a75dff; border-left-color: #21ceff;
          animation-direction: reverse;
        }
        .ss-orange-trail {
          position: absolute; z-index: 3; left: 8%; top: 45%; width: 37%; height: 2px;
          transform: rotate(-31deg) scaleX(0); transform-origin: left;
          background: linear-gradient(90deg, transparent, #ff9a00, #ffe29b);
          box-shadow: 0 0 12px 5px #ff8a0088; opacity: 0; animation: ssTrailIn 10s both;
        }
        .ss-spark {
          position: absolute; z-index: 4; left: 35%; top: 8%; width: 5px; height: 5px; border-radius: 50%;
          background: #fff2a6; box-shadow: 0 0 9px 4px #ffad15, 0 0 28px 12px #ff910070;
          opacity: 0; animation: ssSparkIn 10s both;
        }
        .ss-sweep {
          position: absolute; z-index: 5; left: 35%; top: 18%; height: 29%; width: 13%;
          transform: skewX(-23deg) translateX(-120%);
          background: linear-gradient(90deg, transparent, #ffffff00 20%, #fff8d693 52%, transparent);
          filter: blur(8px); opacity: 0; animation: ssSweepIn 10s both; mix-blend-mode: screen;
        }
        .ss-ambient {
          position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(circle at 20% 38%, #146bff27, transparent 34%), radial-gradient(circle at 88% 72%, #fb871d19, transparent 29%);
          animation: ssBreathe 4s ease-in-out infinite alternate;
        }
        .ss-particles { position: absolute; inset: 0; pointer-events: none; z-index: 6; }
        .ss-particle {
          position: absolute; width: 2px; height: 2px; border-radius: 50%; background: #a8eaff;
          box-shadow: 0 0 8px 2px #39aaff; opacity: 0; animation: ssFloat 3.3s ease-in-out infinite;
        }
        .ss-particle:nth-child(1){left:9%;top:31%;animation-delay:.2s}
        .ss-particle:nth-child(2){left:22%;top:70%;animation-delay:1.1s}
        .ss-particle:nth-child(3){left:39%;top:14%;animation-delay:.7s}
        .ss-particle:nth-child(4){left:55%;top:74%;animation-delay:1.8s}
        .ss-particle:nth-child(5){left:76%;top:24%;animation-delay:.4s}
        .ss-particle:nth-child(6){left:89%;top:59%;animation-delay:2.2s}
        .ss-particle:nth-child(7){left:15%;top:82%;animation-delay:1.5s}
        .ss-particle:nth-child(8){left:66%;top:11%;animation-delay:2.8s}

        @keyframes ssBeamMove {
          0% { opacity: 0; transform: translateX(-20%) rotate(-24deg); }
          4% { opacity: 1; }
          25% { opacity: 0.65; }
          47% { opacity: 0.15; transform: translateX(110%) rotate(-24deg); }
          60%, 100% { opacity: 0; }
        }
        @keyframes ssOrbitMove {
          0%, 7% { opacity: 0; transform: rotate(0) scale(0.7); }
          12% { opacity: 0.95; }
          29% { opacity: 0.85; transform: rotate(310deg) scale(1.1); }
          36%, 100% { opacity: 0; transform: rotate(400deg) scale(1.18); }
        }
        @keyframes ssTrailIn {
          0%, 15% { opacity: 0; transform: rotate(-31deg) scaleX(0); }
          23% { opacity: 1; transform: rotate(-31deg) scaleX(1); }
          34%, 100% { opacity: 0; transform: rotate(-31deg) scaleX(1); }
        }
        @keyframes ssSymbolIn {
          0%, 22% { opacity: 0; filter: blur(15px) brightness(2); }
          31% { opacity: 0.65; filter: blur(4px) brightness(1.5); }
          40%, 100% { opacity: 1; filter: blur(0) brightness(1); }
        }
        @keyframes ssSparkIn {
          0%, 32% { opacity: 0; transform: scale(0.1); }
          37% { opacity: 1; transform: scale(2); }
          43% { opacity: 0.35; transform: scale(1); }
          52%, 100% { opacity: 0; }
        }
        @keyframes ssNameIn {
          0%, 39% { opacity: 0; clip-path: polygon(39% 17%, 39% 17%, 39% 45%, 39% 45%); }
          49% { opacity: 1; clip-path: polygon(39% 17%, 93% 17%, 93% 45%, 39% 45%); }
          100% { opacity: 1; clip-path: polygon(39% 17%, 93% 17%, 93% 45%, 39% 45%); }
        }
        @keyframes ssSweepIn {
          0%, 39% { opacity: 0; transform: skewX(-23deg) translateX(-120%); }
          43% { opacity: 0.8; }
          58% { opacity: 0; transform: skewX(-23deg) translateX(600%); }
          100% { opacity: 0; }
        }
        @keyframes ssTaglineIn {
          0%, 55% { opacity: 0; transform: translateY(9px); }
          64%, 100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes ssSubjectsIn {
          0%, 63% { opacity: 0; filter: blur(7px); }
          72%, 100% { opacity: 1; filter: blur(0); }
        }
        @keyframes ssIconIn {
          0% { opacity: 0; transform: translateY(13px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes ssFullIn {
          0%, 89% { opacity: 0; }
          90%, 100% { opacity: 1; }
        }
        @keyframes ssBreathe {
          from { opacity: 0.45; }
          to { opacity: 1; }
        }
        @keyframes ssFloat {
          0%, 100% { opacity: 0; transform: translateY(9px); }
          45% { opacity: 0.8; }
          70% { opacity: 0.3; transform: translateY(-14px); }
        }
      `}</style>

      <div className="w-full max-w-[1500px] mx-auto flex flex-col gap-5 sm:gap-6">
        {/* Topbar: Identity & Eyebrow */}
        <header className="flex items-center justify-between gap-4 pb-3 border-b border-[#1b2b48]/60">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-8 h-8 rounded-lg border border-[#34c6ff]/50 flex items-center justify-center text-[#53d9ff] bg-[#153154] shadow-[0_0_22px_rgba(7,140,255,0.22)] shrink-0"
              aria-hidden="true"
            >
              <Sparkles className="size-4" />
            </div>
            <div>
              <strong className="text-sm font-semibold tracking-wide block text-white">
                SkillSharp
              </strong>
              <span className="block text-[11px] text-[#8698b8] -mt-0.5">
                Cinematic brand intro
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden sm:block text-[10px] font-bold tracking-[0.2em] uppercase text-[#7f9fcb] whitespace-nowrap">
              10 second motion sequence · 24 fps feel
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#101b36] border border-[#2b3a58] text-[#a4b8dc] hover:text-white hover:bg-[#192849] hover:border-[#45608e] transition-colors"
            >
              <ArrowLeft className="size-3.5" />
              <span>Back to Home</span>
            </Link>
          </div>
        </header>

        {/* The Animated Stage (16:9) */}
        <section aria-label="SkillSharp animated brand introduction" className="relative w-full">
          <div
            key={animationIteration}
            id="stage"
            className={cn('ss-stage', isPlaying && 'ss-running')}
            role="img"
            aria-label="Animated SkillSharp brand introduction using the original uploaded logo artwork"
          >
            {/* Visual Atmosphere & Light Beams */}
            <div className="ss-ambient" />
            <div className="ss-beam ss-animated" />
            <div className="ss-orbit ss-animated" />
            <div className="ss-orbit two ss-animated" />
            <div className="ss-orange-trail ss-animated" />
            <div className="ss-spark ss-animated" />
            <div className="ss-sweep ss-animated" />

            {/* Floating Particles */}
            <div className="ss-particles" aria-hidden="true">
              <b className="ss-particle" />
              <b className="ss-particle" />
              <b className="ss-particle" />
              <b className="ss-particle" />
              <b className="ss-particle" />
              <b className="ss-particle" />
              <b className="ss-particle" />
              <b className="ss-particle" />
            </div>

            {/* Artboard: Progressive Clipped Artwork Layers (2:1 native ratio) */}
            <div className="ss-artboard" aria-hidden="true">
              <img
                id="symbol-artwork"
                className="ss-layer ss-symbol ss-animated"
                src={ARTWORK_SRC}
                alt=""
                loading="eager"
              />
              <img
                id="name-artwork"
                className="ss-layer ss-name ss-animated"
                src={ARTWORK_SRC}
                alt=""
                loading="eager"
              />
              <img
                id="tagline-artwork"
                className="ss-layer ss-tagline ss-animated"
                src={ARTWORK_SRC}
                alt=""
                loading="eager"
              />
              <img
                id="subjects-artwork"
                className="ss-layer ss-subjects ss-animated"
                src={ARTWORK_SRC}
                alt=""
                loading="eager"
              />

              {/* Six Pillar Icon Slices */}
              <div className="ss-icon-slice ss-icon-1 ss-animated">
                <img id="communication-artwork" src={ARTWORK_SRC} alt="" loading="eager" />
              </div>
              <div className="ss-icon-slice ss-icon-2 ss-animated">
                <img id="interpersonal-artwork" src={ARTWORK_SRC} alt="" loading="eager" />
              </div>
              <div className="ss-icon-slice ss-icon-3 ss-animated">
                <img id="presentation-artwork" src={ARTWORK_SRC} alt="" loading="eager" />
              </div>
              <div className="ss-icon-slice ss-icon-4 ss-animated">
                <img id="leadership-artwork" src={ARTWORK_SRC} alt="" loading="eager" />
              </div>
              <div className="ss-icon-slice ss-icon-5 ss-animated">
                <img id="thinking-artwork" src={ARTWORK_SRC} alt="" loading="eager" />
              </div>
              <div className="ss-icon-slice ss-icon-6 ss-animated">
                <img id="workplace-artwork" src={ARTWORK_SRC} alt="" loading="eager" />
              </div>

              {/* Complete Final Artwork Base */}
              <img
                id="complete-skillsharp-artwork"
                className="ss-layer ss-base-art ss-animated"
                src={ARTWORK_SRC}
                alt="Original SkillSharp logo with By Winfred Ma'am, learning themes, and six skill icons"
                loading="eager"
              />
            </div>

            {/* Stage Corner Badges */}
            <div className="absolute z-14 top-3 left-3 sm:top-4 sm:left-5 flex items-center gap-2 text-[#b8c9e4] text-[9px] sm:text-[10px] font-bold tracking-[0.17em] uppercase drop-shadow-[0_1px_5px_#020713]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3de4ff] shadow-[0_0_10px_#22c9ff]" />
              Brand film preview
            </div>
            <div className="absolute z-14 top-3 right-3 sm:top-4 sm:right-5 text-[#9fb1d3] text-[9px] sm:text-[10px] tracking-[0.12em] font-mono">
              16:9 / 10.0 SEC
            </div>
          </div>

          {/* Controls Bar & Scrub Progress */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-4 sm:mt-5">
            <button
              id="replay-button"
              type="button"
              onClick={replayIntro}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#3b6a99] px-4 py-2.5 text-xs font-semibold text-[#f4f9ff] bg-gradient-to-br from-[#194e83] to-[#112d5e] hover:border-[#50c9ff] hover:from-[#205d99] transition-all cursor-pointer shadow-md"
            >
              <RotateCcw className="size-3.5" />
              <span>Replay intro</span>
            </button>

            <button
              id="pause-button"
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause animation' : 'Play animation'}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#344361] px-4 py-2.5 text-xs font-semibold text-[#f4f9ff] bg-[#101b36] hover:bg-[#192849] hover:border-[#4d638f] transition-all cursor-pointer"
            >
              {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              <span id="pause-label">{isPlaying ? 'Pause' : 'Play'}</span>
            </button>

            {/* Dynamic Progress Area */}
            <div className="flex-1 min-w-[200px] order-last sm:order-none basis-full sm:basis-auto mt-2 sm:mt-0">
              <div className="flex justify-between items-center text-[11px] text-[#94a8c9] mb-1.5 font-mono">
                <span id="current-beat" className="font-sans font-medium text-[#c4d6f2]">
                  {currentBeatTitle}
                </span>
                <span id="time-display">{elapsed.toFixed(1)} / 10.0s</span>
              </div>
              <div
                id="progress-track"
                className="h-1.5 rounded-full bg-[#253655] overflow-hidden"
                role="progressbar"
                aria-label="Animation progress"
                aria-valuemin={0}
                aria-valuemax={10}
                aria-valuenow={parseFloat(elapsed.toFixed(1))}
              >
                <div
                  id="progress-fill"
                  className="h-full rounded-full bg-gradient-to-r from-[#247bff] via-[#31d9ff] to-[#fbb03b] shadow-[0_0_12px_#36cbff] transition-[width] duration-100 ease-linear"
                  style={{ width: `${(elapsed / TOTAL_DURATION_SEC) * 100}%` }}
                />
              </div>
            </div>

            {/* Explore Now / Enter Website Button */}
            {isComplete && (
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs sm:text-sm font-bold text-primary-foreground shadow-[0_0_25px_rgba(74,93,78,0.5)] hover:scale-105 active:scale-95 transition-all cursor-pointer border border-primary/40 ring-2 ring-primary/20 animate-enter"
              >
                <span>Enter SkillSharp</span>
                <ArrowRight className="size-4" />
              </Link>
            )}
          </div>

          {/* 12 Beats Timeline Visualizer */}
          <div
            className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1.5 sm:gap-2 mt-4 sm:mt-5 pt-3 border-t border-[#18263f]"
            aria-label="Animation beats"
          >
            {INTRO_BEAT_NAMES.map((name, i) => {
              const isActive = i <= currentBeatIndex;
              return (
                <div
                  key={name}
                  className={cn(
                    'border-t-2 pt-1 text-[9px] transition-colors',
                    isActive ? 'border-[#41cfff] text-[#d6f4ff]' : 'border-[#263651] text-[#7186a8]'
                  )}
                >
                  <span className="block font-bold tracking-wider">{String(i + 1).padStart(2, '0')}</span>
                  <small className="block truncate text-[9px] leading-tight text-inherit mt-0.5">
                    {name}
                  </small>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
