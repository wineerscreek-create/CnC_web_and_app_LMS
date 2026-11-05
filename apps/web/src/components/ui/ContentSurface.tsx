'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

export interface ContentSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'glass' | 'card' | 'elevated' | 'subtle';
  tone?: 'default' | 'indigo' | 'cyan' | 'purple';
  hover?: boolean;
  children: React.ReactNode;
}

/**
 * ContentSurface — Calibrated content container in the Ivory / Sage / Gold theme.
 */
export function ContentSurface({
  variant = 'glass',
  hover = false,
  className,
  children,
  ...props
}: ContentSurfaceProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border transition-all duration-300',
        variant === 'glass' &&
          'bg-card/90 border-border text-foreground backdrop-blur-md shadow-card',
        variant === 'card' &&
          'bg-card border-border text-foreground shadow-card',
        variant === 'elevated' &&
          'bg-card border-border text-foreground shadow-pop',
        variant === 'subtle' &&
          'bg-muted/80 border-border text-foreground',
        hover && 'hover:scale-[1.01] hover:border-accent/40 hover:shadow-card-hover cursor-pointer',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
