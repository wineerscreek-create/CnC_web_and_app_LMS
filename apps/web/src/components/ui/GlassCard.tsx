'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'default' | 'indigo' | 'cyan' | 'purple' | 'amber';
  glow?: boolean;
  hover?: boolean;
  children: React.ReactNode;
}

const toneStyles: Record<string, string> = {
  default:
    'bg-card/90 border-border text-foreground shadow-card backdrop-blur-md',
  indigo:
    'bg-muted/80 border-border text-foreground shadow-xs',
  cyan:
    'bg-muted/80 border-border text-foreground shadow-xs',
  purple:
    'bg-muted/80 border-border text-foreground shadow-xs',
  amber:
    'bg-accent/15 border-accent/30 text-foreground shadow-xs',
};

/**
 * GlassCard — Polished translucent glassmorphic container with backdrop blur
 * and subtle light borders for modern EdTech SaaS depth.
 */
export function GlassCard({
  tone = 'default',
  hover = false,
  className,
  children,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border backdrop-blur-md transition-all duration-300',
        toneStyles[tone] || toneStyles.default,
        hover && 'hover:scale-[1.01] hover:border-accent/40 hover:shadow-card-hover',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
