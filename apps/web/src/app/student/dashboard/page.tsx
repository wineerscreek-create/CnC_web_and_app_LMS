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

          {/* 2. Key Performance Indicators Row (Strict 4 Colors) */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
            <StatCard
              label="Weekly Learning"
              value={hours(Math.round((data.learningHoursThisWeek ?? 0) * 60))}
              icon={<Clock />}
              tone="charcoal"
              deltaLabel="Continuous tracking"
            />
            <StatCard
              label="Pending Tasks"
              value={num(data.pendingTasks?.total ?? 0)}
              icon={<ListChecks />}
              tone="mustard"
              deltaLabel={`${data.pendingTasks?.assignments ?? 0} assignment(s) active`}
            />
            <StatCard
              label="Cohort Rank"
              value={`#${data.leaderboard?.myRank ?? '—'}`}
              icon={<Trophy />}
              tone="charcoal"
              deltaLabel={`of ${num(data.leaderboard?.outOf ?? 0)} in your batch`}
            />
          </div>

          {/* 3. Asymmetrical Bento: Learning Hub & Readiness Breakdown */}
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Continue Learning */}
              {data.continueLearning && (
                <div className="rounded-3xl border border-border bg-card p-6 sm:p-7 shadow-card">
                  <div className="flex items-center justify-between pb-4 border-b border-border">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gold-text">
                        In Progress
                      </span>
                      <h2 className="font-heading text-lg font-bold text-heading mt-0.5">
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

                  <div className="mt-5 flex items-start gap-4">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-primary border border-border">
                      <BookOpen className="size-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-heading text-base font-bold text-heading">
                        {data.continueLearning.courseTitle}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {data.continueLearning.nextLesson
                          ? `Next: ${data.continueLearning.nextLesson}`
                          : 'All syllabus modules completed'}
                        {data.continueLearning.timeRemainingMinutes
                          ? ` · ${data.continueLearning.timeRemainingMinutes} mins remaining`
                          : ''}
                      </p>
                      <div className="mt-4 flex items-center gap-3">
                        <ProgressBar value={data.continueLearning.percent} className="flex-1" />
                        <span className="text-xs font-bold text-heading tnum">
                          {Math.round(data.continueLearning.percent)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Today's Practice Quest */}
              {data.dailyQuest && (
                <div className="rounded-3xl border border-border bg-card p-6 sm:p-7 shadow-card">
                  <div className="flex items-center justify-between pb-4 border-b border-border">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gold-text">
                        Daily Milestones
                      </span>
                      <h2 className="font-heading text-lg font-bold text-heading mt-0.5">
                        Today&apos;s Practice Quest
                      </h2>
                    </div>
                    <span className="rounded-xl bg-muted border border-border px-2.5 py-1 text-xs font-semibold text-foreground">
                      {data.dailyQuest.completed}/{data.dailyQuest.total} Done
                    </span>
                  </div>

                  <div className="mt-4 space-y-2.5">
                    {(data.dailyQuest.tasks ?? []).map((task: any) => (
                      <Link
                        key={task.code}
                        href={task.href}
                        className={cn(
                          'flex items-center gap-3 rounded-2xl border p-3.5 transition-all duration-200',
                          task.done
                            ? 'border-border bg-muted/40 opacity-70'
                            : 'border-border bg-card hover:border-accent hover:shadow-xs',
                        )}
                      >
                        {task.done ? (
                          <CheckCircle2 className="size-4 shrink-0 text-primary" />
                        ) : (
                          <Circle className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate text-xs sm:text-sm font-semibold text-foreground',
                            task.done && 'line-through text-muted-foreground',
                          )}
                        >
                          {task.label}
                        </span>
                        <span className="rounded-lg bg-secondary text-secondary-foreground px-2 py-0.5 text-xs font-bold border border-border">
                          +{task.xp} XP
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Week at a Glance */}
              <div className="rounded-3xl border border-border bg-card p-6 sm:p-7 shadow-card">
                <div className="flex items-center justify-between pb-4 border-b border-border">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gold-text">
                      Schedule
                    </span>
                    <h2 className="font-heading text-lg font-bold text-heading mt-0.5">
                      Your Week
                    </h2>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/student/live-classes">
                      <CalendarDays className="size-4" />
                      View Full Calendar
                    </Link>
                  </Button>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-7">
                  {(data.weekAtAGlance ?? []).map((day: any) => (
                    <div
                      key={day.label}
                      className={cn(
                        'min-h-[100px] rounded-2xl border p-3 flex flex-col justify-between transition-colors',
                        day.isToday
                          ? 'border-accent bg-accent/20 shadow-xs'
                          : 'border-border bg-muted/40',
                      )}
                    >
                      <span className={cn('text-xs font-bold', day.isToday ? 'text-accent-foreground' : 'text-muted-foreground')}>
                        {day.label}
                      </span>
                      {day.restDay ? (
                        <span className="text-[10px] text-muted-foreground">Rest</span>
                      ) : (
                        <div className="space-y-1">
                          {(day.items ?? []).slice(0, 2).map((item: any, idx: number) => (
                            <div
                              key={idx}
                              className="rounded-lg bg-card border border-border p-1 text-[10px] font-semibold text-foreground shadow-xs truncate"
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
              <div className="rounded-3xl border border-border bg-card p-6 sm:p-7 shadow-card">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gold-text">
                  Diagnostic Evaluation
                </span>
                <h2 className="font-heading text-lg font-bold text-heading mt-0.5">
                  Career Readiness Analysis
                </h2>

                <div className="mt-6 flex flex-col items-center justify-center p-4 rounded-2xl bg-muted/50 border border-border">
                  <ProgressRing
                    value={data.readiness?.hasData ? data.readiness.score : 0}
                    label={data.readiness?.hasData ? `${data.readiness.score}` : '—'}
                    sublabel="/ 100"
                    size={110}
                    tone="mustard"
                  />
                  <div className="mt-4 text-center">
                    <p className="text-xs font-bold text-heading">
                      Overall Readiness Score
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Weighted: Trainer Ratings (60%) + AI Simulations (40%)
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 pt-4 border-t border-border text-xs">
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <span className="text-muted-foreground">Faculty Rating</span>
                    <p className="font-heading text-lg font-extrabold text-heading mt-1">
                      {data.readiness?.trainerComponent ?? '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <span className="text-muted-foreground">AI Sim Score</span>
                    <p className="font-heading text-lg font-extrabold text-heading mt-1">
                      {data.readiness?.aiComponent ?? '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Next Live Session */}
              {data.upcomingLiveSession && (
                <div className="rounded-3xl border border-border bg-card p-6 sm:p-7 shadow-card">
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gold-text">
                        Live Masterclass
                      </span>
                      <h2 className="font-heading text-base font-bold text-heading mt-0.5">
                        Next Live Class
                      </h2>
                    </div>
                    <Video className="size-5 text-primary" />
                  </div>

                  <div className="mt-4">
                    <h3 className="font-heading text-sm font-bold text-heading">
                      {data.upcomingLiveSession.title}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Conducted by {data.upcomingLiveSession.trainerName}
                    </p>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        {data.upcomingLiveSession.startsIn ?? 'Scheduled today'}
                      </span>
                      <Button asChild variant="primary" size="sm">
                        <Link href="/student/live-classes">
                          Join Room
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Practice Modes Launcher */}
              <div className="rounded-3xl bg-foreground p-6 text-card shadow-card">
                <span className="text-[10px] font-bold uppercase tracking-widest text-accent">
                  Skill Accelerators
                </span>
                <h3 className="font-heading text-base font-bold text-card mt-1">
                  Self-Paced Practice Modes
                </h3>
                <p className="mt-2 text-xs text-card/70 leading-relaxed">
                  Test your articulation, speed of thought, and elevator pitch with instantaneous AI critique.
                </p>

                <div className="mt-5 grid grid-cols-2 gap-2.5">
                  <Link
                    href="/student/practice"
                    className="flex flex-col rounded-xl bg-card/10 p-3 hover:bg-card/20 transition-colors"
                  >
                    <Mic className="size-4 text-accent" />
                    <span className="mt-2 text-xs font-bold text-card">Public Speaking</span>
                    <span className="text-[10px] text-card/70">AI Pacing &amp; Fillers</span>
                  </Link>
                  <Link
                    href="/student/games"
                    className="flex flex-col rounded-xl bg-card/10 p-3 hover:bg-card/20 transition-colors"
                  >
                    <Sparkles className="size-4 text-accent" />
                    <span className="mt-2 text-xs font-bold text-card">Skill Games</span>
                    <span className="text-[10px] text-card/70">6 Fast Challenges</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AsyncSection>
  );
}
