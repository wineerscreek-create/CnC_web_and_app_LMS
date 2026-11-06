'use client';

import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  Compass,
  Flame,
  Gauge,
  ListChecks,
  Mic,
  PlayCircle,
  Sparkles,
  Target,
  Trophy,
  Video,
} from 'lucide-react';
import Link from 'next/link';

import { HeroBanner } from '@/components/dashboard/HeroBanner';
import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { TiltCard } from '@/components/ui/TiltCard';
import { StaggerContainer, StaggerItem } from '@/components/ui/StaggerContainer';
import { useApi } from '@/hooks/useApi';
import { formatDate, formatTime, hours, num } from '@/lib/format';
import { iconFor } from '@/lib/icons';
import { cn } from '@/lib/cn';

export default function StudentDashboardPage() {
  const query = useApi<any>('/student/dashboard');

  return (
    <AsyncSection query={query} skeleton="kpis">
      {(data) => (
        <div className="space-y-6 sm:space-y-8 animate-enter">
          {/* 1. Customizable Hero Banner (P0) */}
          <HeroBanner
            userName={data.student?.firstName ?? data.student?.name ?? 'Participant'}
            userRole="Participant"
            roleSubtitle={`${data.streak?.days ?? 0}-Day Streak · ${data.student?.rollNumber || 'Active Cohort'}`}
            statLabel="Readiness"
            statValue={data.readiness?.score ? `${data.readiness.score}%` : '—'}
            statSubtext={data.readiness?.score ? 'Employability Index' : 'Pending evaluations'}
            primaryAction={{
              label: 'Practise Now',
              href: '/student/practice',
              icon: <Mic className="size-4" />,
            }}
            secondaryAction={{
              label: 'My Courses',
              href: '/student/learning',
              icon: <BookOpen className="size-4" />,
            }}
          />

          {/* 2. Key Performance Indicators Row (Strict 4 Colors & Staggered Reveal) */}
          <StaggerContainer className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StaggerItem>
              <StatCard
                label="Readiness Index"
                value={data.readiness?.score ?? '—'}
                outOf={data.readiness?.outOf ?? 100}
                icon={<Gauge />}
                tone="mustard"
                delta={data.readiness?.delta}
                deltaLabel={
                  data.readiness?.delta
                    ? `${data.readiness.delta > 0 ? '+' : ''}${data.readiness.delta}% change`
                    : 'Calculated score'
                }
                hasData={data.readiness?.hasData}
                hint={`Blended from trainer ratings (${data.readiness?.trainerComponent ?? '—'}) and AI practice scores (${data.readiness?.aiComponent ?? '—'}).`}
              />
            </StaggerItem>
            <StaggerItem>
              <StatCard
                label="Weekly Learning"
                value={hours(Math.round((data.learningHoursThisWeek ?? 0) * 60))}
                icon={<Clock />}
                tone="charcoal"
                deltaLabel="Continuous tracking"
              />
            </StaggerItem>
            <StaggerItem>
              <StatCard
                label="Pending Tasks"
                value={num(data.pendingTasks?.total ?? 0)}
                icon={<ListChecks />}
                tone="mustard"
                deltaLabel={`${data.pendingTasks?.assignments ?? 0} assignment(s) active`}
              />
            </StaggerItem>
            <StaggerItem>
              <StatCard
                label="Cohort Rank"
                value={`#${data.leaderboard?.myRank ?? '—'}`}
                icon={<Trophy />}
                tone="charcoal"
                deltaLabel={`of ${num(data.leaderboard?.outOf ?? 0)} in your batch`}
              />
            </StaggerItem>
          </StaggerContainer>

          {/* 3. Asymmetrical Bento: Learning Hub & Readiness Breakdown */}
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Continue Learning */}
              {data.continueLearning && (
                <TiltCard className="p-5">
                  <div className="flex items-center justify-between pb-3.5 border-b border-border">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                        In Progress
                      </span>
                      <h2 className="font-heading text-base font-semibold text-foreground mt-0.5">
                        Continue Learning
                      </h2>
                    </div>
                    <Button asChild variant="primary" size="sm">
                      <Link href={`/student/learning/${data.continueLearning.courseId}`}>
                        {data.continueLearning.percent >= 100 ? 'Review' : 'Resume'}
                        <ArrowRight className="size-3.5 ml-1" />
                      </Link>
                    </Button>
                  </div>

                  <div className="mt-4 flex items-start gap-3.5">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                      <BookOpen className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-heading text-sm font-semibold text-foreground">
                        {data.continueLearning.courseTitle}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {data.continueLearning.nextLesson
                          ? `Next: ${data.continueLearning.nextLesson}`
                          : 'All syllabus modules completed'}
                        {data.continueLearning.timeRemainingMinutes
                          ? ` · ${data.continueLearning.timeRemainingMinutes} mins remaining`
                          : ''}
                      </p>
                      <div className="mt-3 flex items-center gap-3">
                        <ProgressBar value={data.continueLearning.percent} className="flex-1" />
                        <span className="text-xs font-semibold text-foreground tnum">
                          {Math.round(data.continueLearning.percent)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </TiltCard>
              )}

              {/* Today's Practice Quest */}
              {data.dailyQuest && (
                <TiltCard className="p-5">
                  <div className="flex items-center justify-between pb-3.5 border-b border-border">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                        Daily Milestones
                      </span>
                      <h2 className="font-heading text-base font-semibold text-foreground mt-0.5">
                        Today&apos;s Practice Quest
                      </h2>
                    </div>
                    <span className="rounded-md bg-muted border border-border px-2 py-0.5 text-xs font-medium text-foreground">
                      {data.dailyQuest.completed}/{data.dailyQuest.total} Done
                    </span>
                  </div>

                  <div className="mt-3.5 space-y-2">
                    {(data.dailyQuest.tasks ?? []).map((task: any) => (
                      <Link
                        key={task.code}
                        href={task.href}
                        className={cn(
                          'flex items-center gap-3 rounded-lg border p-2.5 transition-colors',
                          task.done
                            ? 'border-border/60 bg-muted/30 opacity-70'
                            : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30',
                        )}
                      >
                        {task.done ? (
                          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                        ) : (
                          <Circle className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate text-xs sm:text-sm font-medium text-foreground',
                            task.done && 'line-through text-muted-foreground',
                          )}
                        >
                          {task.label}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground border border-border/80">
                          +{task.xp} XP
                        </span>
                      </Link>
                    ))}
                  </div>
                </TiltCard>
              )}

              {/* Week at a Glance */}
              <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
                <div className="flex items-center justify-between pb-3.5 border-b border-border">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Schedule
                    </span>
                    <h2 className="font-heading text-base font-semibold text-foreground mt-0.5">
                      Your Week
                    </h2>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/student/live-classes">
                      <CalendarDays className="size-3.5 mr-1" />
                      Calendar
                    </Link>
                  </Button>
                </div>

                <div className="mt-3.5 grid gap-2 sm:grid-cols-7">
                  {(data.weekAtAGlance ?? []).map((day: any) => (
                    <div
                      key={day.label}
                      className={cn(
                        'min-h-[85px] rounded-lg border p-2.5 flex flex-col justify-between transition-colors',
                        day.isToday
                          ? 'border-primary/50 bg-primary/5 shadow-xs'
                          : 'border-border bg-muted/20',
                      )}
                    >
                      <span className={cn('text-xs font-semibold', day.isToday ? 'text-primary' : 'text-muted-foreground')}>
                        {day.label}
                      </span>
                      {day.restDay ? (
                        <span className="text-[10px] text-muted-foreground">Rest</span>
                      ) : (
                        <div className="space-y-1">
                          {(day.items ?? []).slice(0, 2).map((item: any, idx: number) => (
                            <div
                              key={idx}
                              className="rounded bg-card border border-border p-1 text-[10px] font-medium text-foreground shadow-xs truncate"
                            >
                              {item.title}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Readiness Breakdown & Upcoming Session */}
            <div className="space-y-6">
              {/* Readiness Index Card */}
              <TiltCard className="p-5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                  Diagnostic Evaluation
                </span>
                <h2 className="font-heading text-base font-semibold text-foreground mt-0.5">
                  Career Readiness Analysis
                </h2>

                <div className="mt-4 flex flex-col items-center justify-center p-4 rounded-lg bg-muted/30 border border-border">
                  <ProgressRing
                    value={data.readiness?.hasData ? data.readiness.score : 0}
                    label={data.readiness?.hasData ? `${data.readiness.score}` : '—'}
                    sublabel="/ 100"
                    size={100}
                    tone="mustard"
                  />
                  <div className="mt-3 text-center">
                    <p className="text-xs font-semibold text-foreground">
                      Overall Readiness Score
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Weighted: Trainer Ratings (60%) + AI Simulations (40%)
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2.5 pt-3.5 border-t border-border text-xs">
                  <div className="rounded-lg border border-border bg-muted/20 p-2.5">
                    <span className="text-muted-foreground text-[11px]">Faculty Rating</span>
                    <p className="font-heading text-base font-bold text-foreground mt-0.5">
                      {data.readiness?.trainerComponent ?? '—'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-2.5">
                    <span className="text-muted-foreground text-[11px]">AI Sim Score</span>
                    <p className="font-heading text-base font-bold text-foreground mt-0.5">
                      {data.readiness?.aiComponent ?? '—'}
                    </p>
                  </div>
                </div>
              </TiltCard>

              {/* Next Live Session */}
              {data.upcomingLiveSession && (
                <TiltCard className="p-5">
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                        Live Masterclass
                      </span>
                      <h2 className="font-heading text-sm font-semibold text-foreground mt-0.5">
                        Next Live Class
                      </h2>
                    </div>
                    <Video className="size-4 text-primary" />
                  </div>

                  <div className="mt-3">
                    <h3 className="font-heading text-sm font-semibold text-foreground">
                      {data.upcomingLiveSession.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Conducted by {data.upcomingLiveSession.trainerName}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">
                        {data.upcomingLiveSession.startsIn ?? 'Scheduled today'}
                      </span>
                      <Button asChild variant="primary" size="sm">
                        <Link href="/student/live-classes">
                          Join Room
                        </Link>
                      </Button>
                    </div>
                  </div>
                </TiltCard>
              )}

              {/* Quick Practice Modes Launcher */}
              <TiltCard className="p-5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Skill Accelerators
                </span>
                <h3 className="font-heading text-sm font-semibold text-foreground mt-0.5">
                  Self-Paced Practice Modes
                </h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  Test your articulation, speed of thought, and elevator pitch with instantaneous AI critique.
                </p>

                <div className="mt-3.5 grid grid-cols-2 gap-2">
                  <Link
                    href="/student/practice"
                    className="flex flex-col rounded-lg border border-border bg-muted/30 p-2.5 hover:border-primary/40 hover:bg-muted/60 transition-colors"
                  >
                    <Mic className="size-4 text-primary" />
                    <span className="mt-1.5 text-xs font-semibold text-foreground">Public Speaking</span>
                    <span className="text-[10px] text-muted-foreground">AI Pacing &amp; Fillers</span>
                  </Link>
                  <Link
                    href="/student/games"
                    className="flex flex-col rounded-lg border border-border bg-muted/30 p-2.5 hover:border-primary/40 hover:bg-muted/60 transition-colors"
                  >
                    <Sparkles className="size-4 text-primary" />
                    <span className="mt-1.5 text-xs font-semibold text-foreground">Skill Games</span>
                    <span className="text-[10px] text-muted-foreground">6 Fast Challenges</span>
                  </Link>
                </div>
              </TiltCard>
            </div>
          </div>
        </div>
      )}
    </AsyncSection>
  );
}
