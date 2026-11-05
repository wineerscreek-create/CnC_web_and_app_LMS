'use client';

import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { AnimatedCounter } from '@/components/ui/counter';
import { cn } from '@/lib/cn';

import { EmptyState } from '../shared/state';

/**
 * Charts use the Ivory / Sage / Gold tokens — no library defaults.
 * Series order: gold first (chart-1), then sage (chart-2), tan (chart-3), charcoal (chart-4), deep gold (chart-5).
 */
export const SERIES = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

const AXIS = { stroke: 'hsl(var(--muted-foreground))', fontSize: 10.5 };
const GRID = 'hsl(var(--border))';

function ChartTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm shadow-card">
      <p className="mb-1.5 font-bold text-heading text-xs tracking-tight">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} className="flex items-center gap-2 text-xs text-foreground py-0.5">
          <span
            className="size-2 shrink-0 rounded-full shadow-xs"
            style={{ background: entry.color }}
            aria-hidden
          />
          <span className="text-muted-foreground">{entry.name}:</span>{' '}
          <span className="tnum font-bold text-heading">
            {entry.value}
            {unit}
          </span>
        </p>
      ))}
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  actions,
  children,
  description,
  isEmpty,
  emptyLabel = 'No data for this period yet',
  className,
  height = 190,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Read out to screen readers in place of the picture (§28). */
  description?: string;
  isEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
  height?: number;
}) {
  return (
    <Card className={cn('rounded-2xl border border-border bg-card overflow-hidden hover:border-accent/40', className)}>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {subtitle && <CardSubtitle>{subtitle}</CardSubtitle>}
        </div>
        {actions}
      </CardHeader>
      <div className="px-5 pb-5">
        {isEmpty ? (
          <EmptyState title={emptyLabel} className="py-8" />
        ) : (
          <>
            {description && <p className="sr-only">{description}</p>}
            <div style={{ height }} aria-hidden={Boolean(description)}>
              {children}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export function LineTrend({
  data,
  xKey,
  series,
  unit = '',
  domain = [0, 100],
}: {
  data: any[];
  xKey: string;
  series: { key: string; label: string }[];
  unit?: string;
  domain?: [number, number];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={AXIS} />
        <YAxis domain={domain} tickLine={false} axisLine={false} tick={AXIS} width={48} />
        <RechartsTooltip content={<ChartTooltip unit={unit} />} />
        {series.length > 1 && (
          <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11.5, paddingTop: 6 }} />
        )}
        {series.map((entry, index) => (
          <Line
            key={entry.key}
            type="monotone"
            dataKey={entry.key}
            name={entry.label}
            stroke={SERIES[index % SERIES.length]}
            strokeWidth={2}
            dot={{ r: 2.5, strokeWidth: 0, fill: SERIES[index % SERIES.length] }}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BarCompare({
  data,
  xKey,
  valueKey,
  unit = '',
  domain = [0, 100],
  threshold,
  thresholdLabel,
  colorBy,
}: {
  data: any[];
  xKey: string;
  valueKey: string;
  unit?: string;
  domain?: [number, number];
  threshold?: number;
  thresholdLabel?: string;
  /** Colour each bar by value band rather than by series. */
  colorBy?: (row: any) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={AXIS} interval={0} />
        <YAxis domain={domain} tickLine={false} axisLine={false} tick={AXIS} width={48} />
        <RechartsTooltip content={<ChartTooltip unit={unit} />} cursor={{ fill: 'hsl(var(--muted) / 0.5)' }} />
        <Bar dataKey={valueKey} radius={[4, 4, 0, 0]} maxBarSize={62}>
          {data.map((row, index) => (
            <Cell key={index} fill={colorBy ? colorBy(row) : SERIES[0]} />
          ))}
        </Bar>
        {threshold !== undefined && (
          <Line
            dataKey={() => threshold}
            stroke="hsl(var(--destructive))"
            strokeDasharray="4 4"
            dot={false}
            name={thresholdLabel ?? `Target ${threshold}${unit}`}
            strokeWidth={1.2}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StackedDistribution({
  data,
  xKey,
  series,
}: {
  data: any[];
  xKey: string;
  series: { key: string; label: string; color: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={AXIS} interval={0} />
        <YAxis tickLine={false} axisLine={false} tick={AXIS} width={48} />
        <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.5)' }} />
        <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11.5, paddingTop: 6 }} />
        {series.map((entry) => (
          <Bar
            key={entry.key}
            dataKey={entry.key}
            name={entry.label}
            stackId="a"
            fill={entry.color}
            maxBarSize={62}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** The ring score used for readiness / averages across the portals. */
export function RadialScore({
  value,
  outOf = 100,
  size = 92,
  thickness = 8,
  label,
  tone = 'hsl(var(--accent))',
}: {
  value?: number | null;
  outOf?: number;
  size?: number;
  thickness?: number;
  label?: string;
  tone?: string;
}) {
  const has = value !== null && value !== undefined;
  const ratio = has ? Math.max(0, Math.min(1, value! / outOf)) : 0;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={has ? `${label ?? 'Score'}: ${value} out of ${outOf}` : 'No score yet'}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={thickness}
        />
        {has && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={tone}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ratio)}
            className="transition-all duration-1000 ease-out"
          />
        )}
      </svg>
      <div className="absolute text-center">
        {has ? (
          <>
            <p className="tnum text-[20px] font-bold leading-none tracking-tight text-heading">
              <AnimatedCounter value={Math.round(value!)} />
            </p>
            <p className="mt-0.5 text-2xs text-muted-foreground">out of {outOf}</p>
          </>
        ) : (
          <p className="text-2xs text-muted-foreground">No data</p>
        )}
      </div>
    </div>
  );
}

export function attendanceColor(percentage: number): string {
  if (percentage >= 75) return 'hsl(var(--accent))';
  if (percentage >= 60) return 'hsl(var(--primary))';
  return 'hsl(var(--muted-foreground))';
}
