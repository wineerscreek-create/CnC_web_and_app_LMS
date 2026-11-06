import { ArrowDown, ArrowUp, Info } from 'lucide-react';
import * as React from 'react';

import { Card } from '@/components/ui/card';
import { AnimatedCounter } from '@/components/ui/counter';
import { Tooltip } from '@/components/ui/misc';
import { cn } from '@/lib/cn';

export type StatTone = 'mustard' | 'charcoal' | 'neutral' | 'indigo' | 'success' | 'danger' | 'info' | 'purple' | 'teal' | 'amber';

export function StatCard({
  label,
  value,
  suffix,
  outOf,
  icon,
  delta,
  deltaLabel,
  hint,
  dark,
  hasData = true,
  className,
}: {
  label: string;
  value: React.ReactNode;
  suffix?: string;
  outOf?: number;
  icon?: React.ReactNode;
  tone?: StatTone;
  delta?: number | null;
  deltaLabel?: string;
  hint?: string;
  dark?: boolean;
  hasData?: boolean;
  className?: string;
}) {
  const showDelta = delta !== undefined && delta !== null && delta !== 0;

  const renderValue = () => {
    if (!hasData) {
      return <p className="text-[17px] font-semibold text-muted-foreground">No data yet</p>;
    }

    const isNumeric = typeof value === 'number' || (typeof value === 'string' && /^[-+]?\d/.test(value.trim()));

    return (
      <p className="tnum font-heading text-2xl sm:text-[28px] font-bold leading-none tracking-tight text-foreground">
        {isNumeric ? (
          <AnimatedCounter value={value as number | string} />
        ) : (
          value
        )}
        {outOf !== undefined && (
          <span className="text-xs font-normal text-muted-foreground ml-1">
            /{outOf}
          </span>
        )}
        {suffix && (
          <span className="text-xs font-normal text-muted-foreground ml-1">
            {suffix}
          </span>
        )}
      </p>
    );
  };

  return (
    <Card
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs transition-colors hover:border-primary/40',
        dark && 'bg-foreground text-background border-foreground',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2.5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {icon && (
          <div
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-primary border border-border/80',
            )}
            aria-hidden
          >
            {icon}
          </div>
        )}
      </div>

      <div className="mt-2.5 flex items-baseline gap-2">
        {renderValue()}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/80 pt-2">
        {showDelta ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
            {delta! > 0 ? (
              <ArrowUp className="size-3 text-primary" aria-hidden />
            ) : (
              <ArrowDown className="size-3 text-muted-foreground" aria-hidden />
            )}
            <span className="font-semibold text-primary">{Math.abs(delta!)}%</span>
            {deltaLabel && <span className="text-muted-foreground text-[11px]">{deltaLabel}</span>}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            {deltaLabel ?? 'Active tracking'}
          </span>
        )}

        {hint && (
          <Tooltip content={hint}>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="More information"
            >
              <Info className="size-3.5" />
            </button>
          </Tooltip>
        )}
      </div>
    </Card>
  );
}
