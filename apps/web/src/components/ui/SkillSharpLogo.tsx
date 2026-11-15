import * as React from 'react';
import { cn } from '@/lib/cn';

export type LogoVariant =
  | 'full'
  | 'compact'
  | 'header'
  | 'navbar'
  | 'sidebar'
  | 'mobile'
  | 'footer'
  | 'auth'
  | 'invoice'
  | 'dashboard'
  | 'intro';

export interface SkillSharpLogoProps {
  variant?: LogoVariant;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  alt?: string;
}

const variantStyles: Record<LogoVariant, { wrapper: string; img: string }> = {
  intro: {
    wrapper: 'h-24 sm:h-32 md:h-40 lg:h-48 max-w-[320px] sm:max-w-[420px]',
    img: 'h-full w-auto max-h-[192px] object-contain drop-shadow-[0_12px_28px_rgba(59,130,246,0.35)]',
  },
  header: {
    wrapper: 'h-9 sm:h-10 max-w-[180px]',
    img: 'h-full w-auto max-h-10 object-contain drop-shadow-xs',
  },
  navbar: {
    wrapper: 'h-9 sm:h-10 max-w-[180px]',
    img: 'h-full w-auto max-h-10 object-contain drop-shadow-xs',
  },
  sidebar: {
    wrapper: 'h-8 sm:h-9 max-w-[160px]',
    img: 'h-full w-auto max-h-9 object-contain drop-shadow-xs',
  },
  compact: {
    wrapper: 'size-7 sm:size-8 shrink-0',
    img: 'size-full object-contain',
  },
  mobile: {
    wrapper: 'h-7 sm:h-8 max-w-[130px] shrink-0',
    img: 'h-full w-auto max-h-8 object-contain',
  },
  auth: {
    wrapper: 'h-14 sm:h-16 md:h-20 max-w-[240px]',
    img: 'h-full w-auto max-h-20 object-contain drop-shadow-md',
  },
  footer: {
    wrapper: 'h-9 sm:h-10 max-w-[160px]',
    img: 'h-full w-auto max-h-10 object-contain brightness-95 hover:brightness-105 transition-all',
  },
  invoice: {
    wrapper: 'h-8 max-w-[140px]',
    img: 'h-full w-auto max-h-8 object-contain',
  },
  dashboard: {
    wrapper: 'h-9 sm:h-10 max-w-[180px]',
    img: 'h-full w-auto max-h-10 object-contain drop-shadow-xs',
  },
  full: {
    wrapper: 'h-9 sm:h-10 md:h-11 max-w-[200px]',
    img: 'h-full w-auto max-h-11 object-contain drop-shadow-xs',
  },
};

export function SkillSharpLogo({
  variant = 'full',
  className,
  imgClassName,
  priority = false,
  alt = 'SkillSharp Learning — Campus to Corporate',
}: SkillSharpLogoProps) {
  const styles = variantStyles[variant] || variantStyles.full;

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center select-none transition-transform duration-200 active:scale-95 shrink-0',
        styles.wrapper,
        className
      )}
      aria-label={alt}
    >
      <img
        src="/images/skillsharp-learning-logo.png"
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className={cn('aspect-[3/2] select-none transition-all duration-200', styles.img, imgClassName)}
      />
      <span className="sr-only">{alt}</span>
    </div>
  );
}

export type CNCLogoProps = SkillSharpLogoProps;
export type WinnersCreekLogoProps = SkillSharpLogoProps;
export const CNCLogo = SkillSharpLogo;
export const WinnersCreekLogo = SkillSharpLogo;
