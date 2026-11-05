import * as React from 'react';
import { cn } from '@/lib/cn';

export type LogoVariant =
  | 'full'
  | 'compact'
  | 'header'
  | 'sidebar'
  | 'footer'
  | 'auth'
  | 'invoice'
  | 'intro';

export interface SkillSharpLogoProps {
  variant?: LogoVariant;
  className?: string;
  priority?: boolean;
  alt?: string;
}

export function SkillSharpLogo({
  variant = 'full',
  className,
  alt = 'SkillSharp — Campus to Corporate',
}: SkillSharpLogoProps) {
  const isCompact = variant === 'compact';

  return (
    <div
      className={cn('inline-flex items-center gap-2.5 select-none transition-transform duration-200 active:scale-95', className)}
      aria-label={alt}
      role="img"
    >
      {/* SkillSharp Geometric Emblem */}
      <div className={cn(
        'relative flex shrink-0 items-center justify-center rounded-xl bg-foreground text-accent shadow-xs border border-border',
        isCompact ? 'size-7' : 'size-9'
      )}>
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn(isCompact ? 'size-4' : 'size-5')}
        >
          {/* SkillSharp Growth Step-Arrow */}
          <path
            d="M6 22L14 14L18 18L26 10"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M20 10H26V16"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="6" cy="22" r="2" fill="currentColor" />
        </svg>
      </div>

      {/* Brand Typography */}
      {!isCompact && (
        <div className="flex flex-col leading-none">
          <div className="flex items-baseline gap-1">
            <span className="font-heading text-[17px] font-extrabold tracking-tight text-heading">
              SkillSharp
            </span>
            <span className="size-1.5 rounded-full bg-accent" />
          </div>
          <span className="mt-0.5 text-[9px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
            Campus to Corporate
          </span>
        </div>
      )}
    </div>
  );
}

export type CNCLogoProps = SkillSharpLogoProps;
export type WinnersCreekLogoProps = SkillSharpLogoProps;
export const CNCLogo = SkillSharpLogo;
export const WinnersCreekLogo = SkillSharpLogo;
