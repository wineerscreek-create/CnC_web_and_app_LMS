'use client';

import * as React from 'react';
import { AnimatedCounter } from '@/components/ui/counter';
import { cn } from '@/lib/cn';

export interface MetricCardProps {
  label: string;
  value: number | string;
  subValue?: string;
  icon?: React.ReactNode;
  tone?: 'indigo' | 'cyan' | 'purple' | 'amber' | 'emerald' | 'rose';
  delta?: { value: string; positive: boolean };
  hint?: string;
  className?: string;
}

/**
 * MetricCard — KPI card in the Ivory / Sage / Gold palette.
 * Card: bg-card border border-border rounded-2xl
 * Caption: uppercase text-muted-foreground
 * Number: text-heading large and bold
 * Change indicator and sub-text: text-gold-text or text-muted-foreground
 * Icon chip: bg-muted with text-primary icon
 */
export function MetricCard({
  label,
  value,
  subValue,
  icon,
  delta,
  hint,
  className,
}: MetricCardProps) {
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  const isNumeric = !isNaN(numericValue) && !String(value).includes(' ');

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border bg-card shadow-card p-5',
        'transition-all duration-300 hover:scale-[1.01] hover:shadow-card-hover hover:border-accent/40',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        {icon && (
          <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-primary border border-border">
            {icon}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-heading font-bold text-2xl sm:text-3xl text-heading tracking-tight">
          {isNumeric ? <AnimatedCounter value={numericValue} /> : value}
        </span>
        {subValue && (
          <span className="text-xs text-muted-foreground font-medium">
            {subValue}
          </span>
        )}
      </div>

      {(delta || hint) && (
        <div className="mt-2.5 flex items-center justify-between gap-2 text-xs border-t border-border pt-2.5">
          {delta && (
            <span
              className={cn(
                'font-semibold inline-flex items-center gap-1',
                delta.positive ? 'text-primary' : 'text-destructive',
              )}
            >
              {delta.positive ? '↑' : '↓'} {delta.value}
            </span>
          )}
          {hint && (
            <span className="text-[11px] text-muted-foreground truncate">
              {hint}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
