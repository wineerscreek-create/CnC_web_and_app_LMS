'use client';

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
  | 'loading'
  | 'intro';

export interface SkillSharpLogoProps {
  variant?: LogoVariant;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  alt?: string;
}

const PRIMARY_LOGO_SRC = '/images/skillsharp-logo-tight.png';
const FALLBACK_LOGO_SRC = '/images/winnerscreek.png';

const variantStyles: Record<LogoVariant, { wrapper: string; img: string }> = {
  intro: {
    wrapper: 'h-28 sm:h-36 md:h-44 lg:h-52 max-w-[340px] sm:max-w-[440px]',
    img: 'h-full w-auto max-h-[208px] object-contain drop-shadow-[0_12px_28px_rgba(59,130,246,0.35)]',
  },
  loading: {
    wrapper: 'h-20 sm:h-24 md:h-28 max-w-[260px]',
    img: 'h-full w-auto max-h-[112px] object-contain drop-shadow-md',
  },
  header: {
    wrapper: 'h-12 sm:h-14 max-w-[200px]',
    img: 'h-full w-auto max-h-14 object-contain drop-shadow-xs',
  },
  navbar: {
    wrapper: 'h-12 sm:h-14 max-w-[200px]',
    img: 'h-full w-auto max-h-14 object-contain drop-shadow-xs',
  },
  sidebar: {
    wrapper: 'h-11 sm:h-12 max-w-[180px]',
    img: 'h-full w-auto max-h-12 object-contain drop-shadow-xs',
  },
  compact: {
    wrapper: 'h-10 w-12 sm:h-11 sm:w-14 shrink-0',
    img: 'h-full w-auto max-h-11 object-contain',
  },
  mobile: {
    wrapper: 'h-10 sm:h-11 max-w-[140px] shrink-0',
    img: 'h-full w-auto max-h-11 object-contain',
  },
  auth: {
    wrapper: 'h-16 sm:h-20 md:h-24 max-w-[260px]',
    img: 'h-full w-auto max-h-24 object-contain drop-shadow-md',
  },
  footer: {
    wrapper: 'h-12 sm:h-14 max-w-[180px]',
    img: 'h-full w-auto max-h-14 object-contain brightness-95 hover:brightness-105 transition-all',
  },
  invoice: {
    wrapper: 'h-10 max-w-[160px]',
    img: 'h-full w-auto max-h-10 object-contain',
  },
  dashboard: {
    wrapper: 'h-12 sm:h-14 max-w-[210px]',
    img: 'h-full w-auto max-h-14 object-contain drop-shadow-xs',
  },
  full: {
    wrapper: 'h-12 sm:h-14 md:h-16 max-w-[220px]',
    img: 'h-full w-auto max-h-16 object-contain drop-shadow-xs',
  },
};

export function SkillSharpLogo({
  variant = 'full',
  className,
  imgClassName,
  priority = false,
  alt = 'Winners Creek — Campus to Corporate',
}: SkillSharpLogoProps) {
  const styles = variantStyles[variant] || variantStyles.full;
  const [src, setSrc] = React.useState<string>(PRIMARY_LOGO_SRC);
  const [failedAll, setFailedAll] = React.useState(false);

  const handleError = () => {
    if (src === PRIMARY_LOGO_SRC) {
      setSrc(FALLBACK_LOGO_SRC);
    } else {
      setFailedAll(true);
    }
  };

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center select-none transition-transform duration-200 active:scale-95 shrink-0',
        styles.wrapper,
        className
      )}
      aria-label={alt}
    >
      {failedAll ? (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-extrabold tracking-tight text-primary border border-primary/20">
          WC · LMS
        </span>
      ) : (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onError={handleError}
          className={cn('select-none transition-all duration-200', styles.img, imgClassName)}
        />
      )}
      <span className="sr-only">{alt}</span>
    </div>
  );
}

export type CNCLogoProps = SkillSharpLogoProps;
export type WinnersCreekLogoProps = SkillSharpLogoProps;
export const CNCLogo = SkillSharpLogo;
export const WinnersCreekLogo = SkillSharpLogo;
