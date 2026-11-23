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
  const nextActionQuery = useApi<any>('/student/dashboard/next-action');
  const summaryQuery = useApi<any>('/student/dashboard/summary');

  const nextAction = nextActionQuery.data;
  const summary = summaryQuery.data;

  return (
    <AsyncSection query={query} skeleton="kpis">
      {(data) => {
        const primaryAction = nextAction
          ? {
              label: nextAction.actionLabel || 'Practise Now',
              href: nextAction.actionUrl || '/student/practice',
              urgency: nextAction.urgency,
              icon: nextAction.kind?.includes('ASSESSMENT') ? (
                <Target className="size-4" />
              ) : nextAction.kind?.includes('CLASS') ? (
                <Video className="size-4" />
              ) : (
                <Mic className="size-4" />
              ),
            }
          : {
              label: 'Practise Now',
              href: '/student/practice',
              icon: <Mic className="size-4" />,
            };

        const dynamicNotice =
          nextAction && nextAction.priority < 9
            ? {
                title: nextAction.title,
                subtitle: nextAction.subtitle,
                urgency: nextAction.urgency,
                remainingSeconds: nextAction.remainingSeconds,
              }
            : undefined;

        return (
          <div className="space-y-6 sm:space-y-8 animate-enter">
            {/* 1. Customizable Hero Banner (P0) with Dynamic Priority CTA */}
            <HeroBanner
              userName={data.student?.firstName ?? data.student?.name ?? 'Participant'}
              userRole="Participant"
              roleSubtitle={`${data.streak?.days ?? 0}-Day Streak · ${data.student?.rollNumber || 'Active Cohort'}`}
              statLabel="Readiness"
              statValue={data.readiness?.score ? `${data.readiness.score}%` : '—'}
              statSubtext={data.readiness?.score ? 'Employability Index' : 'Pending evaluations'}
              primaryAction={primaryAction}
              secondaryAction={{
                label: 'My Courses',
                href: '/student/learning',
                icon: <BookOpen className="size-4" />,
              }}
              dynamicNotice={dynamicNotice}
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

          {/* 4. Assessment Performance Snapshot & Recent Official Reports */}
          <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold font-heading text-heading">
                  Assessment Performance &amp; Transcripts
                </h2>
                <p className="text-xs text-muted-foreground">
                  Your verified assessment results, permanent evaluation transcripts, and upcoming milestones.
                </p>
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link href="/student/progress" className="flex items-center gap-1.5 text-xs font-semibold">
                  <span>View All Reports</span>
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>

            {/* Performance Snapshot Cards */}
            {summary?.performanceSnapshot && (
              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="p-4 border-border bg-card shadow-card">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Average Score
                  </span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-2xl font-bold font-mono text-heading">
                      {summary.performanceSnapshot.averageScore !== null &&
                      summary.performanceSnapshot.averageScore !== undefined
                        ? `${num(summary.performanceSnapshot.averageScore, 1)}%`
                        : '—'}
                    </span>
                    <Target className="size-4 text-accent" />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">Overall assessment performance</p>
                </Card>

                <Card className="p-4 border-border bg-card shadow-card">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Completed Assessments
                  </span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-2xl font-bold font-mono text-heading">
                      {summary.performanceSnapshot.completedAssessments ?? 0}
                    </span>
                    <Clock className="size-4 text-muted-foreground" />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">Evaluated attempts</p>
                </Card>

                <Card className="p-4 border-border bg-card shadow-card">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Passed Assessments
                  </span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {summary.performanceSnapshot.passedCount ?? 0}
                    </span>
                    <CheckCircle2 className="size-4 text-emerald-500" />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">Passed requirements</p>
                </Card>

                <Card className="p-4 border-border bg-card shadow-card">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Pass Rate
                  </span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-2xl font-bold font-mono text-accent">
                      {summary.performanceSnapshot.passRate !== null &&
                      summary.performanceSnapshot.passRate !== undefined
                        ? `${num(summary.performanceSnapshot.passRate, 1)}%`
                        : '—'}
                    </span>
                    <Trophy className="size-4 text-accent" />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">Success ratio</p>
                </Card>
              </div>
            )}

            {/* Split Grid: Recent Assessment Results & Upcoming Events */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Recent Assessment Results */}
              <Card className="border-border bg-card shadow-card">
                <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold font-heading text-heading">
                      Recent Assessment Results
                    </CardTitle>
                    <CardSubtitle className="text-xs text-muted-foreground">
                      Latest evaluated assessments with official reports
                    </CardSubtitle>
                  </div>
                  <Badge tone="mustard" className="font-mono text-xs">
                    {(summary?.recentReports ?? []).length} Recent
                  </Badge>
                </CardHeader>
                <CardBody className="p-4 space-y-2.5">
                  {Array.isArray(summary?.recentReports) && summary.recentReports.length > 0 ? (
                    summary.recentReports.map((rep: any) => {
                      const isPassed = rep.resultStatus === 'PASSED';
                      return (
                        <div
                          key={rep.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 p-3 hover:bg-muted/30 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-heading truncate">
                              {rep.assessmentTitle}
                            </p>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span>{formatDate(rep.completedAt)}</span>
                              <span>·</span>
                              <span className="font-mono font-semibold text-foreground">
                                {num(rep.score, 1)} / {num(rep.maxMarks, 1)} pts
                              </span>
                              <span>·</span>
                              <span className="font-mono font-bold text-accent">
                                {num(rep.percentage, 1)}%
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0">
                            <Badge
                              tone={isPassed ? 'mustard' : 'neutral'}
                              className="text-[10px] font-bold uppercase"
                            >
                              {rep.resultStatus}
                            </Badge>
                            <Button asChild variant="secondary" size="sm" className="h-7 text-xs px-2.5">
                              <Link href={`/student/progress?reportId=${rep.id}`}>
                                View Report
                              </Link>
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      No assessment results recorded yet. Completed assessments will appear here with permanent reports.
                    </div>
                  )}
                </CardBody>
              </Card>

              {/* Upcoming Events & Deadlines */}
              <Card className="border-border bg-card shadow-card">
                <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold font-heading text-heading">
                      Upcoming Events &amp; Deadlines
                    </CardTitle>
                    <CardSubtitle className="text-xs text-muted-foreground">
                      Scheduled assessments and live classes (Next 7 days)
                    </CardSubtitle>
                  </div>
                  <Badge tone="charcoal" className="font-mono text-xs">
                    {(summary?.upcomingEvents ?? []).length} Scheduled
                  </Badge>
                </CardHeader>
                <CardBody className="p-4 space-y-2.5">
                  {Array.isArray(summary?.upcomingEvents) && summary.upcomingEvents.length > 0 ? (
                    summary.upcomingEvents.map((evt: any) => {
                      const isAssessment = evt.type === 'ASSESSMENT';
                      return (
                        <div
                          key={evt.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 p-3 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <div className="mt-0.5 rounded-lg bg-primary/10 p-1.5 text-primary shrink-0">
                              {isAssessment ? <Target className="size-3.5" /> : <Video className="size-3.5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-heading truncate">
                                {evt.title}
                              </p>
                              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                                <span>{formatDate(evt.scheduledAt)}</span>
                                {evt.trainerName && (
                                  <>
                                    <span>·</span>
                                    <span>{evt.trainerName}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <Button asChild variant="primary" size="sm" className="h-7 text-xs px-2.5 shrink-0">
                            <Link href={evt.actionUrl || (isAssessment ? '/student/assessments' : '/student/live-classes')}>
                              {isAssessment ? 'Open Assessment' : 'Join Class'}
                            </Link>
                          </Button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      No events or assessments scheduled within the next 7 days. Check back soon!
                    </div>
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
