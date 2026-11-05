import * as React from 'react';

import { Progress } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { pct } from '@/lib/format';

export function ProgressBar({
  value,
  label,
  showValue = true,
  tone,
  className,
  thin,
}: {
  value?: number | null;
  label?: string;
  showValue?: boolean;
  tone?: string;
  className?: string;
  thin?: boolean;
}) {
  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
          {label && <span className="text-foreground">{label}</span>}
          {showValue && <span className="tnum font-semibold text-foreground">{pct(value, 0)}</span>}
        </div>
      )}
      <Progress
        value={value ?? 0}
        thin={thin}
        aria-label={label ?? 'Progress'}
        barClassName={tone ? undefined : undefined}
        style={tone ? ({ ['--bar' as any]: tone } as React.CSSProperties) : undefined}
      />
    </div>
  );
}

/** Score against a maximum, used wherever the UI shows `nn/100`. */
export function ScoreCard({
  label,
  value,
  outOf = 100,
  band,
  tone = 'hsl(var(--accent))',
  className,
}: {
  label: string;
  value?: number | null;
  outOf?: number;
  band?: string;
  tone?: string;
  className?: string;
}) {
  const has = value !== null && value !== undefined;
  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="truncate text-sm text-foreground">{label}</p>
        <p className="tnum shrink-0 text-base font-bold text-heading">
          {has ? Math.round(value! * 10) / 10 : '—'}
          <span className="text-xs font-semibold text-muted-foreground">/{outOf}</span>
        </p>
      </div>
      <div className="h-[7px] w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${has ? Math.min(100, (value! / outOf) * 100) : 0}%`,
            background: tone,
          }}
        />
      </div>
      {band && <p className="mt-1 text-xs text-muted-foreground">{band}</p>}
    </div>
  );
}

/** The 7-pillar breakdown, shared by the student dashboard and the HOD participant profile. */
export function SkillBreakdown({
  pillars,
  className,
  showBand = true,
}: {
  pillars: { code: string; label: string; score?: number | null; band?: string; hasData?: boolean }[];
  className?: string;
  showBand?: boolean;
}) {
  const TONE: Record<string, string> = {
    behaviour: 'hsl(var(--chart-1))',
    communication: 'hsl(var(--chart-2))',
    confidence: 'hsl(var(--chart-3))',
    leadership: 'hsl(var(--chart-4))',
    technical: 'hsl(var(--chart-5))',
    problem_solving: 'hsl(var(--primary))',
    career_readiness: 'hsl(var(--accent))',
  };
  return (
    <ul className={cn('space-y-3', className)}>
      {pillars.map((pillar) => (
        <li key={pillar.code} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
          <span className="truncate text-sm text-foreground">{pillar.label}</span>
          <span className="tnum text-sm font-bold text-heading">
            {pillar.score !== null && pillar.score !== undefined ? Math.round(pillar.score) : '—'}
            <span className="text-xs font-semibold text-muted-foreground">/100</span>
            {showBand && pillar.band && pillar.band !== 'No data' && (
              <span className="ml-2 text-xs font-semibold text-muted-foreground">{pillar.band}</span>
            )}
          </span>
          <div className="col-span-2 h-[7px] overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{
                width: `${Math.min(100, pillar.score ?? 0)}%`,
                background: TONE[pillar.code] ?? 'hsl(var(--accent))',
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
