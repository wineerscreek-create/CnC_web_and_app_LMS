'use client';

import { Flame, History, Mic, Play, Sparkles, Target, Video } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { StatusBadge } from '@/components/shared/status-badge';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { iconFor } from '@/lib/icons';

export default function PracticeLabPage() {
  const [category, setCategory] = React.useState('all');
  const query = useApi<any>('/student/practice/modes');

  return (
    <AsyncSection query={query} skeleton="cards">
      {(data) => {
        const visible = data.modes.filter(
          (mode: any) => category === 'all' || mode.category === category,
        );
        return (
          <div className="space-y-6">
            <PageHeader
              title="Practice Lab"
              description="Rehearse interviews, group discussions and presentations. Every attempt is scored against objective rubrics with targeted AI diagnostics."
              actions={
                <div className="flex items-center gap-2 rounded-2xl bg-card border border-border px-3.5 py-1.5 shadow-card">
                  <Flame className="size-4 text-accent" aria-hidden />
                  <span className="text-xs font-bold font-mono text-heading">
                    {data.streak.days}-Day Streak
                  </span>
                </div>
              }
            />

            <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
              <div className="space-y-5">
                {/* Recommended Practice Card */}
                {data.recommended && (
                  <Card className="border-accent/40 bg-card shadow-card transition-all duration-300 hover:shadow-card hover:border-accent">
                    <CardBody className="flex flex-wrap items-center gap-4 p-5">
                      <span className="flex size-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-xs">
                        <Sparkles className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-[220px] flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            Recommended Activity
                          </p>
                          <Badge tone="mustard" className="text-[10px] py-0 px-2 font-semibold">
                            Priority Focus
                          </Badge>
                        </div>
                        <p className="mt-1 text-base font-bold font-heading text-heading">
                          {data.recommended.exerciseTitle}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {data.recommended.reason} · Weakest area:{' '}
                          <span className="font-semibold text-heading">
                            {data.recommended.weakestDimensionLabel} ({data.recommended.weakestScore})
                          </span>
                        </p>
                      </div>
                      <Button asChild variant="primary" size="sm">
                        <Link
                          href={`/student/practice/${data.recommended.practiceModeCode}`}
                          className="flex items-center gap-1.5"
                        >
                          <Target className="size-3.5" aria-hidden />
                          Start · {data.recommended.estimatedMinutes} min
                        </Link>
                      </Button>
                    </CardBody>
                  </Card>
                )}

                {/* AI Presentation Simulator Card */}
                <Card className="border-border bg-card shadow-card transition-all duration-300 hover:shadow-card">
                  <CardBody className="flex flex-wrap items-center gap-4 p-5">
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-foreground text-card shadow-xs">
                      <Video className="size-5 text-accent" aria-hidden />
                    </span>
                    <div className="min-w-[220px] flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          Interactive Simulation Arena
                        </p>
                        <Badge tone="mustard" className="text-[10px] py-0 px-2 font-semibold">
                          8-Stage Simulator
                        </Badge>
                      </div>
                      <p className="mt-1 text-base font-bold font-heading text-heading">
                        AI Presentation Simulator & Speech Coach
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                        Live slide delivery, real-time speech-to-text, WPM cadence tracking, and verbal filler diagnostics.
                      </p>
                    </div>
                    <Button asChild variant="primary" size="sm" className="px-4">
                      <Link href="/student/practice/presentation-coach" className="flex items-center gap-1.5">
                        <Play className="size-3.5" aria-hidden />
                        Launch Simulator
                      </Link>
                    </Button>
                  </CardBody>
                </Card>

                {/* Categories Filter */}
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label="Filter by category"
                >
                  {['all', ...data.categories].map((item: string) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCategory(item)}
                      aria-pressed={category === item}
                      className={cn(
                        'rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 capitalize',
                        category === item
                          ? 'border-accent bg-accent text-accent-foreground shadow-xs'
                          : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {item === 'all' ? 'All Modes' : item}
                    </button>
                  ))}
                </div>

                {/* Practice Modes Grid */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {visible.map((mode: any) => {
                    const Icon = iconFor(mode.icon, Target);
                    return (
                      <Card
                        key={mode.id}
                        className="group flex flex-col border-border bg-card shadow-card transition-all duration-300 hover:shadow-card hover:-translate-y-0.5"
                      >
                        <CardBody className="flex flex-1 flex-col p-5">
                          <div className="flex items-start justify-between gap-3">
                            <span className="flex size-10 items-center justify-center rounded-2xl bg-muted text-primary border border-border transition-transform duration-200 group-hover:scale-105">
                              <Icon className="size-5" aria-hidden />
                            </span>
                            <Badge tone="neutral" className="capitalize text-xs font-semibold">
                              {mode.difficulty}
                            </Badge>
                          </div>
                          <h2 className="mt-3.5 text-base font-bold font-heading text-heading line-clamp-1">
                            {mode.title}
                          </h2>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                            {mode.description}
                          </p>
                          <dl className="tnum mt-4 grid grid-cols-3 gap-2 text-center">
                            {[
                              ['Attempts', String(mode.attempts ?? 0)],
                              ['Last', mode.lastScore != null ? String(mode.lastScore) : '—'],
                              ['Best', mode.bestScore != null ? String(mode.bestScore) : '—'],
                            ].map(([label, value]) => (
                              <div key={label} className="rounded-xl bg-muted/40 border border-border px-2 py-2">
                                <dd className="text-sm font-bold font-mono text-heading">{value}</dd>
                                <dt className="text-[10px] font-semibold text-muted-foreground mt-0.5">{label}</dt>
                              </div>
                            ))}
                          </dl>
                          <p className="mt-3 text-xs text-muted-foreground">
                            {mode.questions?.length ?? 1} prompt(s) · ~{mode.durationMinutes} min
                          </p>
                          <div className="mt-auto pt-4">
                            <Button asChild variant="primary" size="sm" className="w-full flex items-center justify-center gap-1.5">
                              <Link href={`/student/practice/${mode.code}`}>
                                <Play className="size-3.5" aria-hidden />
                                {mode.attempts ? 'Practice Again' : 'Start Practice'}
                              </Link>
                            </Button>
                          </div>
                        </CardBody>
                      </Card>
                    );
                  })}
                </div>
              </div>

              {/* Sidebar Cards */}
              <div className="space-y-5">
                <Card className="border-border bg-card shadow-card">
                  <CardHeader className="pb-3 border-b border-border">
                    <div>
                      <CardTitle className="text-base font-bold font-heading text-heading">Weekly Target</CardTitle>
                      <CardSubtitle className="text-xs text-muted-foreground">
                        Resets {formatDate(data.weeklyProgress.resetsAt)}
                      </CardSubtitle>
                    </div>
                  </CardHeader>
                  <CardBody className="pt-4">
                    <p className="tnum text-2xl font-bold font-mono text-heading">
                      {data.weeklyProgress.completed}
                      <span className="text-sm font-medium text-muted-foreground ml-1">
                        /{data.weeklyProgress.target} sessions
                      </span>
                    </p>
                    <ProgressBar
                      className="mt-3"
                      showValue={false}
                      value={
                        (data.weeklyProgress.completed /
                          Math.max(1, data.weeklyProgress.target)) *
                        100
                      }
                    />
                  </CardBody>
                </Card>

                <Card className="border-border bg-card shadow-card">
                  <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-bold font-heading text-heading">Recent Sessions</CardTitle>
                      <CardSubtitle className="text-xs text-muted-foreground">Your latest practice feedback</CardSubtitle>
                    </div>
                    <History className="size-4 text-muted-foreground" aria-hidden />
                  </CardHeader>
                  <CardBody className="pt-4">
                    {data.recentAttempts.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        No attempts recorded yet. Select an exercise to begin.
                      </p>
                    ) : (
                      <ul className="space-y-2.5">
                        {data.recentAttempts.map((attempt: any) => (
                          <li key={attempt.id}>
                            <Link
                              href={`/student/practice/session/${attempt.id}/feedback`}
                              className="block rounded-xl border border-border p-3 transition-all duration-200 hover:border-accent hover:bg-muted"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="min-w-0 truncate text-xs font-bold text-heading">
                                  {attempt.practiceModeTitle}
                                </p>
                                {attempt.overallScore != null ? (
                                  <span className="tnum shrink-0 text-xs font-bold font-mono text-heading">
                                    {attempt.overallScore}
                                    <span className="text-[10px] text-muted-foreground">/100</span>
                                  </span>
                                ) : (
                                  <StatusBadge status={attempt.state} />
                                )}
                              </div>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                Attempt {attempt.attemptNumber} ·{' '}
                                {formatDate(attempt.completedAt ?? attempt.startedAt)}
                              </p>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardBody>
                </Card>
              </div>
            </div>
          </div>
        );
      }}
    </AsyncSection>
  );
}
