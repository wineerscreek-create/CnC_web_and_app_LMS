'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  MessagesSquare,
  UsersRound,
  Presentation,
  Users,
  BrainCircuit,
  BriefcaseBusiness,
} from 'lucide-react';
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
const TOTAL_DURATION_SEC = 10.0;
const FADE_OUT_DURATION_MS = 500;

interface SkillSharpBrandIntroProps {
  onComplete?: () => void;
  forceShow?: boolean;
}

/**
 * SkillSharp Cinematic Brand Introduction
 * Merged Master: Animation Timing & Motion + Visual Design & Composition
 * 
 * Strict specifications:
 * - 100vw x 100dvh full viewport coverage
 * - Deep navy cosmic background with atmospheric lighting (zero checkerboard)
 * - Exact vector emblem ribbons, gradients, star sparkle, and upward arrow
 * - Sequential typography: "Skill" (silver) + "Sharp" (golden gradient) + light sweep
 * - Attribution: "By Winfred Ma'am"
 * - Tagline: "Soft Skills • Communication • Personality • Professional Growth"
 * - Six Skills with Lucide icons & color accents
 * - Clean screen: ZERO progress bars, headers, or dashboards during playback
 * - Final hold with animated "Explore Now" button (cyan/blue glow)
 */
export function SkillSharpBrandIntro({ onComplete, forceShow }: SkillSharpBrandIntroProps) {
  const [mounted, setMounted] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(false);
  const [isExiting, setIsExiting] = React.useState(false);
  const [isComplete, setIsComplete] = React.useState(false);
  const [animationKey, setAnimationKey] = React.useState(0);

  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Dismiss intro and navigate to website homepage
  const dismissIntro = React.useCallback(() => {
    clearTimer();
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
  }, [clearTimer, onComplete]);

  // Start animation sequence
  const startAnimation = React.useCallback(() => {
    clearTimer();
    setIsComplete(false);
    setIsExiting(false);

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setIsComplete(true);
      return;
    }

    let elapsedMs = 0;
    timerRef.current = setInterval(() => {
      elapsedMs += 100;
      if (elapsedMs >= 8500) {
        setIsComplete(true);
      }
      if (elapsedMs >= TOTAL_DURATION_SEC * 1000) {
        setIsComplete(true);
        clearTimer();
      }
    }, 100);
  }, [clearTimer]);

  // Initial mount check
  React.useEffect(() => {
    setMounted(true);

    const urlParams = new URLSearchParams(window.location.search);
    const hasIntroParam = urlParams.get('intro') === 'true';
    const alreadyViewed = sessionStorage.getItem(STORAGE_KEY) === 'true';

    if (forceShow || hasIntroParam || !alreadyViewed) {
      setIsVisible(true);
      startAnimation();
    }

    const handleReplayEvent = () => {
      setIsVisible(true);
      setAnimationKey((prev) => prev + 1);
      startAnimation();
    };

    window.addEventListener('skillsharp:replay-intro', handleReplayEvent);
    return () => {
      window.removeEventListener('skillsharp:replay-intro', handleReplayEvent);
      clearTimer();
    };
  }, [forceShow, startAnimation, clearTimer]);

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
        'fixed inset-0 z-[9999] flex flex-col items-center justify-center w-screen h-[100dvh] overflow-hidden select-none transition-opacity duration-600 ease-out bg-[#030819]',
        isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      )}
    >
      <style>{`
        .ss-stage-wrap {
          position: relative;
          width: min(100vw, calc(100dvh * (16 / 9)));
          height: min(100dvh, calc(100vw * (9 / 16)));
          aspect-ratio: 16 / 9;
          overflow: hidden;
          background: radial-gradient(ellipse at 50% 48%, #10255b 0%, #080f30 48%, #030819 100%);
          border: 1px solid #294570;
          border-radius: 15px;
          isolation: isolate;
          box-shadow: 0 20px 70px #0008, inset 0 0 90px #030716;
          container-type: inline-size;
        }
        .ss-stage-wrap::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 12;
          pointer-events: none;
          box-shadow: inset 0 0 7cqw #020513a8;
        }

        .ss-ambient {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 15% 31%, #008dff35, transparent 32%),
                      radial-gradient(circle at 85% 74%, #f8982926, transparent 28%),
                      radial-gradient(circle at 54% 92%, #7a28ff35, transparent 36%);
          animation: ssBreathe 4s ease-in-out infinite alternate;
        }

        .ss-waves {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: visible;
        }
        .ss-wave {
          fill: none;
          stroke-width: 2;
          opacity: 0.7;
          filter: drop-shadow(0 0 12px currentColor);
          stroke-dasharray: 1200;
          stroke-dashoffset: 1200;
          animation: ssWaveDraw 3s ease-out both, ssWaveDrift 6s ease-in-out 3s infinite alternate;
        }
        .ss-wave.cyan { stroke: #2ce9ff; color: #00aaff; animation-delay: 0.1s, 3.1s; }
        .ss-wave.blue { stroke: #267bff; color: #267bff; animation-delay: 0.3s, 3.3s; }
        .ss-wave.purple { stroke: #974dff; color: #803cff; animation-delay: 0.55s, 3.55s; }
        .ss-wave.gold { stroke: #ffae2b; color: #ff9c12; animation-delay: 0.75s, 3.75s; }

        .ss-horizon {
          position: absolute;
          left: 14%;
          right: 14%;
          top: 62%;
          height: 2px;
          background: linear-gradient(90deg, transparent, #167aff, #5deaff, #197bff, transparent);
          box-shadow: 0 0 15px 3px #136bff88;
          opacity: 0;
          animation: ssHorizonIn 2s 1.2s both;
        }
        .ss-horizon::after {
          content: "";
          position: absolute;
          left: 48%;
          top: -7px;
          width: 4%;
          height: 16px;
          border-radius: 50%;
          background: #a5f4ff;
          filter: blur(7px);
        }

        .ss-particles {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .ss-particle {
          position: absolute;
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: #c8f7ff;
          box-shadow: 0 0 9px 3px #37bcff;
          opacity: 0;
          animation: ssFloat 3.4s ease-in-out infinite;
        }
        .ss-particle:nth-child(1) { left: 9%; top: 31%; animation-delay: 0.2s; }
        .ss-particle:nth-child(2) { left: 22%; top: 70%; animation-delay: 1.1s; }
        .ss-particle:nth-child(3) { left: 39%; top: 14%; animation-delay: 0.7s; }
        .ss-particle:nth-child(4) { left: 55%; top: 74%; animation-delay: 1.8s; }
        .ss-particle:nth-child(5) { left: 76%; top: 24%; animation-delay: 0.4s; }
        .ss-particle:nth-child(6) { left: 89%; top: 59%; animation-delay: 2.2s; }
        .ss-particle:nth-child(7) { left: 15%; top: 82%; animation-delay: 1.5s; }
        .ss-particle:nth-child(8) { left: 66%; top: 11%; animation-delay: 2.8s; }
        .ss-particle:nth-child(9) { left: 43%; top: 39%; animation-delay: 2.5s; }
        .ss-particle:nth-child(10) { left: 95%; top: 38%; animation-delay: 1.4s; }

        .ss-composition {
          position: absolute;
          inset: 0;
          z-index: 3;
        }

        .ss-symbol-wrap {
          position: absolute;
          left: 8%;
          top: 12%;
          width: 31%;
          height: 51%;
          transform-origin: 50% 52%;
          animation: ssSymbolOrbit 7s ease-in-out 3.1s infinite alternate;
        }
        .ss-symbol-svg {
          width: 100%;
          height: 100%;
          overflow: visible;
        }

        .ss-ribbon {
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
          filter: url(#ribbonGlow);
          animation: ssDrawStroke 1.25s cubic-bezier(0.3, 0.1, 0.1, 1) both;
        }
        .ss-ribbon.back { stroke: url(#blueRibbon); stroke-width: 28; animation-delay: 1.05s; }
        .ss-ribbon.front { stroke: url(#goldRibbon); stroke-width: 26; animation-delay: 1.8s; }
        .ss-ribbon.inner { stroke: url(#cyanRibbon); stroke-width: 10; animation-delay: 1.5s; }
        .ss-ribbon.highlight { stroke: #fff1b4; stroke-width: 3; opacity: 0.8; animation-delay: 2.05s; }

        .ss-symbol-core {
          opacity: 0;
          transform-box: fill-box;
          transform-origin: center;
          animation: ssPopIn 0.6s 2.4s both;
        }
        .ss-symbol-star {
          opacity: 0;
          transform-box: fill-box;
          transform-origin: center;
          animation: ssStarIn 0.75s 2.55s both, ssTwinkle 2.5s 3.3s infinite alternate;
        }
        .ss-arrow-head {
          opacity: 0;
          transform-box: fill-box;
          transform-origin: center;
          animation: ssArrowIn 0.55s 2.65s both;
        }
        .ss-trace {
          fill: none;
          stroke: #a7f6ff;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-dasharray: 6 17;
          opacity: 0;
          filter: drop-shadow(0 0 7px #26dfff);
          animation: ssTraceRun 1.5s 1.15s both;
        }
        .ss-symbol-orbit {
          position: absolute;
          left: 7%;
          top: 1%;
          width: 85%;
          height: 94%;
          border: 1px solid transparent;
          border-top-color: #24dfff77;
          border-bottom-color: #7f43ff77;
          border-radius: 50%;
          opacity: 0;
          filter: drop-shadow(0 0 9px #32bfff);
          animation: ssOrbitIn 0.7s 1.3s both, ssOrbitSpin 9s linear 2s infinite;
          pointer-events: none;
        }

        .ss-brand {
          position: absolute;
          left: 39.5%;
          top: 17%;
          width: 55%;
        }
        .ss-brand-name {
          display: flex;
          align-items: baseline;
          white-space: nowrap;
          font-size: 7.4cqw;
          font-weight: 900;
          font-style: italic;
          letter-spacing: -0.065em;
          line-height: 1.18;
          text-shadow: 0 0.35cqw 0.5cqw #0009;
        }
        .ss-brand-name .letter {
          display: inline-block;
          opacity: 0;
          transform: translateY(1.6cqw) scale(0.8);
          animation: ssLetterIn 0.32s cubic-bezier(0.2, 0.85, 0.3, 1.2) both;
          animation-delay: calc(3.05s + var(--n) * 0.135s);
        }
        .ss-brand-name .silver { color: #f9faff; }
        .ss-brand-name .golden {
          background: linear-gradient(135deg, #fff271, #ffc025 39%, #ff8313 85%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .ss-brand-name::after {
          content: "";
          position: absolute;
          inset: 0 0 20% 0;
          width: 18%;
          background: linear-gradient(90deg, transparent, #ffffffa9, transparent);
          filter: blur(0.8cqw);
          opacity: 0;
          transform: skewX(-20deg) translateX(-150%);
          mix-blend-mode: screen;
          pointer-events: none;
          animation: ssMetalSweep 1.25s 4.75s both;
        }

        .ss-attribution {
          margin: -0.1cqw 0 0 23%;
          font-size: 1.85cqw;
          font-style: italic;
          letter-spacing: 0.23em;
          white-space: nowrap;
          color: #fff;
          text-shadow: 0 0 1cqw #8db9ff66;
          opacity: 0;
          animation: ssRiseIn 0.7s 5.25s both;
        }
        .ss-attribution::after {
          content: "";
          display: inline-block;
          width: 10cqw;
          height: 1px;
          margin: 0 0 0.45cqw 1.2cqw;
          background: linear-gradient(90deg, #d4eaff, transparent);
        }

        .ss-tagline {
          position: absolute;
          left: 28%;
          right: 8%;
          top: 51%;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 0.8cqw;
          white-space: nowrap;
          color: #f2f5ff;
          font-size: 1.34cqw;
          font-style: italic;
          text-shadow: 0 0 1cqw #80aaff55;
        }
        .ss-tagline span {
          opacity: 0;
          animation: ssRiseIn 0.5s both;
          animation-delay: calc(5.8s + var(--n) * 0.22s);
        }
        .ss-tagline b {
          color: #ffbb28;
          font-size: 1.5cqw;
          opacity: 0;
          animation: ssPopIn 0.35s both;
          animation-delay: calc(5.95s + var(--n) * 0.22s);
        }

        .ss-skills {
          position: absolute;
          left: 13%;
          right: 13%;
          bottom: 9%;
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          align-items: start;
        }
        .ss-skill {
          position: relative;
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 0.6cqw;
          color: var(--skill-color);
          opacity: 0;
          transform: translateY(2cqw) scale(0.75);
          filter: blur(0.5cqw);
          animation: ssSkillIn 0.65s cubic-bezier(0.15, 0.8, 0.25, 1) both;
          animation-delay: calc(6.45s + var(--n) * 0.38s);
        }
        .ss-skill + .ss-skill::before {
          content: "";
          position: absolute;
          left: 0;
          top: 1.3cqw;
          height: 3.8cqw;
          width: 1px;
          background: linear-gradient(transparent, #afd9ff77, transparent);
        }
        .ss-skill-icon {
          display: grid;
          place-items: center;
          height: 4.6cqw;
          filter: drop-shadow(0 0 0.6cqw currentColor);
          animation: ssIconGlow 2.6s ease-in-out 8.7s infinite alternate;
        }
        .ss-skill-icon svg {
          width: 3.8cqw;
          height: 3.8cqw;
          stroke-width: 2.2;
        }
        .ss-skill-label {
          color: #f8faff;
          font-size: 1.07cqw;
          font-weight: 700;
          line-height: 1.14;
          text-shadow: 0 1px 0.4cqw #000;
        }

        @keyframes ssBreathe {
          from { opacity: 0.5; transform: scale(1); }
          to { opacity: 1; transform: scale(1.09); }
        }
        @keyframes ssWaveDraw { to { stroke-dashoffset: 0; } }
        @keyframes ssWaveDrift {
          from { transform: translateY(0); opacity: 0.5; }
          to { transform: translateY(-14px); opacity: 1; }
        }
        @keyframes ssHorizonIn {
          from { opacity: 0; transform: scaleX(0.2); }
          to { opacity: 0.8; transform: scaleX(1); }
        }
        @keyframes ssFloat {
          0%, 100% { opacity: 0; transform: translateY(10px); }
          45% { opacity: 0.9; }
          70% { opacity: 0.3; transform: translateY(-20px); }
        }
        @keyframes ssDrawStroke { to { stroke-dashoffset: 0; } }
        @keyframes ssTraceRun {
          0% { opacity: 0; stroke-dashoffset: 100; }
          35% { opacity: 1; }
          100% { opacity: 0; stroke-dashoffset: 0; }
        }
        @keyframes ssOrbitIn { to { opacity: 0.7; } }
        @keyframes ssOrbitSpin { to { transform: rotate(360deg); } }
        @keyframes ssSymbolOrbit {
          from { transform: rotate(-1.3deg) translateY(0); }
          to { transform: rotate(1.7deg) translateY(-0.6cqw); }
        }
        @keyframes ssPopIn {
          from { opacity: 0; transform: scale(0.3); filter: brightness(3); }
          to { opacity: 1; transform: scale(1); filter: brightness(1); }
        }
        @keyframes ssArrowIn {
          from { opacity: 0; transform: translate(-15px, 15px) scale(0.4) rotate(-20deg); }
          to { opacity: 1; transform: translate(0) scale(1) rotate(0); }
        }
        @keyframes ssStarIn {
          from { opacity: 0; transform: scale(0.1) rotate(-70deg); filter: brightness(3); }
          to { opacity: 1; transform: scale(1) rotate(0); filter: brightness(1); }
        }
        @keyframes ssTwinkle {
          to { filter: drop-shadow(0 0 13px #ffd04b) brightness(1.5); }
        }
        @keyframes ssLetterIn { to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes ssMetalSweep {
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { opacity: 0; transform: skewX(-20deg) translateX(600%); }
        }
        @keyframes ssRiseIn {
          from { opacity: 0; transform: translateY(1.2cqw); filter: blur(0.4cqw); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes ssSkillIn {
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0) drop-shadow(0 0 0.4cqw var(--skill-color)); }
        }
        @keyframes ssIconGlow { to { filter: drop-shadow(0 0 1.2cqw currentColor); } }

        @media (prefers-reduced-motion: reduce) {
          .ss-ambient, .ss-particle, .ss-wave, .ss-horizon, .ss-ribbon, .ss-symbol-core,
          .ss-symbol-star, .ss-arrow-head, .ss-symbol-orbit, .ss-brand-name .letter,
          .ss-attribution, .ss-tagline span, .ss-tagline b, .ss-skill {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
            filter: none !important;
            stroke-dashoffset: 0 !important;
          }
        }
      `}</style>

      {/* Main Full-Screen Cinematic Composition */}
      <div key={animationKey} className="ss-stage-wrap" role="img" aria-label="Animated SkillSharp brand introduction">
        {/* Ambient Atmosphere */}
        <div className="ss-ambient" />

        {/* Energy Waves */}
        <svg className="ss-waves" viewBox="0 0 1100 619" preserveAspectRatio="none" aria-hidden="true">
          <path className="ss-wave cyan" d="M-40 93 C130 -45 150 42 250 14 S510 -55 730 12" />
          <path className="ss-wave blue" d="M-40 448 C220 335 405 389 565 374 S883 323 1140 435" />
          <path className="ss-wave purple" d="M-30 462 C160 650 345 411 605 480 S950 680 1130 459" />
          <path className="ss-wave gold" d="M740 617 C865 485 995 587 1130 396" />
          <path className="ss-wave cyan" d="M-20 580 C230 550 330 605 510 619 S810 570 1120 608" style={{ opacity: 0.28 }} />
        </svg>

        {/* Radiant Horizon Glow */}
        <div className="ss-horizon" />

        {/* 10 Floating Cosmic Particles */}
        <div className="ss-particles" aria-hidden="true">
          <b className="ss-particle" />
          <b className="ss-particle" />
          <b className="ss-particle" />
          <b className="ss-particle" />
          <b className="ss-particle" />
          <b className="ss-particle" />
          <b className="ss-particle" />
          <b className="ss-particle" />
          <b className="ss-particle" />
          <b className="ss-particle" />
        </div>

        {/* Main Composition Layer */}
        <div className="ss-composition" aria-hidden="true">
          {/* Symbol & Ribbons Wrap */}
          <div className="ss-symbol-wrap">
            <div className="ss-symbol-orbit" />
            <svg className="ss-symbol-svg" viewBox="0 0 310 280" role="presentation">
              <defs>
                <linearGradient id="blueRibbon" x1="0" y1="0" x2="1" y2="1">
                  <stop stopColor="#24efff" />
                  <stop offset="0.28" stopColor="#159cf0" />
                  <stop offset="0.56" stopColor="#6635eb" />
                  <stop offset="0.82" stopColor="#00bbf3" />
                  <stop offset="1" stopColor="#3250e7" />
                </linearGradient>
                <linearGradient id="goldRibbon" x1="0" y1="1" x2="1" y2="0">
                  <stop stopColor="#ff760d" />
                  <stop offset="0.42" stopColor="#ffc02e" />
                  <stop offset="0.72" stopColor="#ff920d" />
                  <stop offset="1" stopColor="#fff27b" />
                </linearGradient>
                <linearGradient id="cyanRibbon" x1="0" y1="0" x2="1" y2="1">
                  <stop stopColor="#a0faff" />
                  <stop offset="1" stopColor="#1a69ff" />
                </linearGradient>
                <filter id="ribbonGlow" x="-30%" y="-40%" width="160%" height="180%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="glow" />
                  <feMerge>
                    <feMergeNode in="glow" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <path className="ss-ribbon back" pathLength="100" d="M197 38 C120 14 51 51 48 96 C45 135 117 139 181 153 C238 166 238 216 161 250 C111 272 68 262 46 247" />
              <path className="ss-ribbon inner" pathLength="100" d="M178 45 C88 35 52 87 84 116 C113 143 207 148 217 184 C225 212 164 248 104 252" />
              <path className="ss-ribbon front" pathLength="100" d="M220 97 C183 145 99 154 59 194 C9 244 65 269 134 242 C206 214 215 151 250 110" />
              <path className="ss-ribbon highlight" pathLength="100" d="M210 105 C169 151 93 160 58 202 C28 239 57 250 105 238" />
              <path className="ss-trace" d="M196 38 C95 10 40 72 56 115 C70 150 210 145 225 183" />
              <path className="ss-trace" d="M219 98 C148 163 51 164 45 221 C43 247 83 252 128 240" style={{ animationDelay: '1.85s' }} />

              <g className="ss-symbol-core">
                <path d="M88 224 Q117 205 145 224 Q174 206 203 224 L203 244 Q172 228 145 246 Q115 227 88 244Z" fill="#f4f8ff" stroke="#a8cbff" strokeWidth="3" />
                <path d="M145 224 L145 246 M94 231 Q118 220 140 234 M151 234 Q175 220 197 231" fill="none" stroke="#263b86" strokeWidth="2" />
                <rect x="133" y="128" width="72" height="52" rx="4" fill="#092c65" stroke="#23ddff" strokeWidth="3" />
                <path d="M144 153 l9 -8 m-9 8 l9 8 m40 -16 l-9 8 9 8 m-25 -16 l-5 16" fill="none" stroke="#5ceaff" strokeWidth="3" strokeLinecap="round" />
                <path d="M116 119 v-13 h13 v13 M135 119 V96 h13 v23 M154 119 V87 h13 v32 M173 119 V76 h13 v43" fill="#38cfff" stroke="#42dfff" strokeWidth="2" />
                <circle cx="154" cy="45" r="6" fill="#fff" />
                <circle cx="138" cy="51" r="5" fill="#fff" />
                <circle cx="170" cy="51" r="5" fill="#fff" />
                <path d="M128 65 q3-12 13-12 h25 q12 0 15 12" fill="#eaf7ff" />
                <text x="211" y="194" fontSize="35" fill="#d9ecff">⚙</text>
              </g>

              <path className="ss-arrow-head" d="M225 89 L273 69 L273 120 L255 109 L240 125Z" fill="#ffc429" stroke="#ffea8c" strokeWidth="3" filter="url(#ribbonGlow)" />
              <path className="ss-symbol-star" d="M266 13 L271 29 L288 34 L271 39 L266 56 L261 39 L244 34 L261 29Z" fill="#ffca35" filter="url(#ribbonGlow)" />
            </svg>
          </div>

          {/* Brand Name & Attribution */}
          <div className="ss-brand">
            <div className="ss-brand-name" aria-label="SkillSharp">
              <span className="letter silver" style={{ ['--n' as string]: 0 }}>S</span>
              <span className="letter silver" style={{ ['--n' as string]: 1 }}>k</span>
              <span className="letter silver" style={{ ['--n' as string]: 2 }}>i</span>
              <span className="letter silver" style={{ ['--n' as string]: 3 }}>l</span>
              <span className="letter silver" style={{ ['--n' as string]: 4 }}>l</span>
              <span className="letter golden" style={{ ['--n' as string]: 5 }}>S</span>
              <span className="letter golden" style={{ ['--n' as string]: 6 }}>h</span>
              <span className="letter golden" style={{ ['--n' as string]: 7 }}>a</span>
              <span className="letter golden" style={{ ['--n' as string]: 8 }}>r</span>
              <span className="letter golden" style={{ ['--n' as string]: 9 }}>p</span>
            </div>
            <div className="ss-attribution">By Winfred Ma&apos;am</div>
          </div>

          {/* Tagline */}
          <div className="ss-tagline">
            <span style={{ ['--n' as string]: 0 }}>Soft Skills</span>
            <b style={{ ['--n' as string]: 0 }}>•</b>
            <span style={{ ['--n' as string]: 1 }}>Communication</span>
            <b style={{ ['--n' as string]: 1 }}>•</b>
            <span style={{ ['--n' as string]: 2 }}>Personality</span>
            <b style={{ ['--n' as string]: 2 }}>•</b>
            <span style={{ ['--n' as string]: 3 }}>Professional Growth</span>
          </div>

          {/* Six Skill Pillars with Lucide Icons */}
          <div className="ss-skills">
            <div className="ss-skill" style={{ ['--n' as string]: 0, ['--skill-color' as string]: '#40dcff' }}>
              <div className="ss-skill-icon">
                <MessagesSquare />
              </div>
              <div className="ss-skill-label">
                Communication<br />Skills
              </div>
            </div>

            <div className="ss-skill" style={{ ['--n' as string]: 1, ['--skill-color' as string]: '#c365ff' }}>
              <div className="ss-skill-icon">
                <UsersRound />
              </div>
              <div className="ss-skill-label">
                Interpersonal<br />Skills
              </div>
            </div>

            <div className="ss-skill" style={{ ['--n' as string]: 2, ['--skill-color' as string]: '#ffbf27' }}>
              <div className="ss-skill-icon">
                <Presentation />
              </div>
              <div className="ss-skill-label">
                Presentation<br />Skills
              </div>
            </div>

            <div className="ss-skill" style={{ ['--n' as string]: 3, ['--skill-color' as string]: '#34e5e9' }}>
              <div className="ss-skill-icon">
                <Users />
              </div>
              <div className="ss-skill-label">
                Leadership<br />&amp; Teamwork
              </div>
            </div>

            <div className="ss-skill" style={{ ['--n' as string]: 4, ['--skill-color' as string]: '#ed80ff' }}>
              <div className="ss-skill-icon">
                <BrainCircuit />
              </div>
              <div className="ss-skill-label">
                Critical<br />Thinking
              </div>
            </div>

            <div className="ss-skill" style={{ ['--n' as string]: 5, ['--skill-color' as string]: '#b479ff' }}>
              <div className="ss-skill-icon">
                <BriefcaseBusiness />
              </div>
              <div className="ss-skill-label">
                Workplace<br />Readiness
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Final Action Button: Revealed on completion (or at 8.5s) at bottom center with cyan/blue glow */}
      {isComplete && (
        <div className="absolute bottom-6 sm:bottom-10 z-30 flex items-center justify-center animate-enter px-4">
          <button
            type="button"
            onClick={dismissIntro}
            aria-label="Explore Now — Enter SkillSharp Website"
            className="group inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-[#0066cc] via-[#0096c7] to-[#00b4d8] px-8 py-3.5 sm:px-10 sm:py-4 text-sm sm:text-base font-bold text-white shadow-[0_0_35px_rgba(0,180,216,0.65)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_50px_rgba(0,180,216,0.9)] active:scale-95 cursor-pointer border border-[#48cae4]/50 ring-4 ring-[#0077b6]/20"
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
