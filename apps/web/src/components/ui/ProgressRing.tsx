'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '@/lib/motion-config';

export interface ProgressRingProps {
  value: number; // 0 to 100
  size?: number; // diameter in px
  strokeWidth?: number; // thickness in px
  tone?: 'mustard' | 'charcoal' | 'indigo' | 'cyan' | 'teal' | 'amber' | 'purple' | 'emerald';
  label?: string;
  sublabel?: string;
  className?: string;
}

/**
 * ProgressRing — Circular Progress Indicator in Ivory / Sage / Gold palette.
 * Track: hsl(var(--muted))
 * Arc: hsl(var(--accent)) or hsl(var(--primary))
 * Centre number: text-heading
 */
export function ProgressRing({
  value,
  size = 120,
  strokeWidth = 9,
  label,
  sublabel,
  className,
}: ProgressRingProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const clampedValue = Math.min(100, Math.max(0, value));

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampedValue / 100) * circumference;

  return (
    <div
      className={cn('relative inline-flex items-center justify-center select-none', className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg
        width={size}
        height={size}
        className="-rotate-90 transform"
        style={{ overflow: 'visible' }}
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
          fill="transparent"
        />

        {/* Foreground progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="hsl(var(--accent))"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="transparent"
          style={{
            transition: prefersReducedMotion ? 'none' : 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      </svg>

      {/* Centered readout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {label ? (
          <span className="font-heading text-2xl font-extrabold tracking-tight text-heading tnum leading-none">
            {label}
          </span>
        ) : (
          <span className="font-heading text-2xl font-extrabold tracking-tight text-heading tnum leading-none">
            {Math.round(clampedValue)}%
          </span>
        )}
        {sublabel && (
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}
