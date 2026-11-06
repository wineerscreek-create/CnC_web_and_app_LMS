'use client';

import {
  AlertTriangle,
  CalendarCheck,
  ClipboardCheck,
  GraduationCap,
  TrendingUp,
  Users,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ChartCard, attendanceColor } from '@/components/charts';

const LineTrend = dynamic(
  () => import('@/components/charts').then((mod) => mod.LineTrend),
  {
    ssr: false,
    loading: () => <div className="h-[210px] w-full animate-pulse rounded-2xl bg-muted" />,
  },
);

const BarCompare = dynamic(
  () => import('@/components/charts').then((mod) => mod.BarCompare),
  {
    ssr: false,
    loading: () => <div className="h-[210px] w-full animate-pulse rounded-2xl bg-muted" />,
  },
);

import { HeroBanner } from '@/components/dashboard/HeroBanner';
import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { AnimatedCounter } from '@/components/ui/counter';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';
import { formatTime, num, pct } from '@/lib/format';

export default function TrainerDashboardPage() {
  const query = useApi<any>('/trainer/dashboard');

  return (
    <div className="space-y-6">
      <AsyncSection query={query} skeleton="kpis">
        {(rawData) => {
          const data = {
            assignedBatches: Array.isArray(rawData?.assignedBatches) ? rawData.assignedBatches : [],
            studentCount: rawData?.studentCount ?? 0,
            attendance: {
              percentage: rawData?.attendance?.percentage ?? 0,
              present: rawData?.attendance?.present ?? 0,
              total: rawData?.attendance?.total ?? 0,
              hasData: Boolean(rawData?.attendance?.hasData),
            },
            assessments: {
              average: rawData?.assessments?.average ?? 0,
              count: rawData?.assessments?.count ?? 0,
              min: rawData?.assessments?.min ?? 0,
              max: rawData?.assessments?.max ?? 0,
              hasData: Boolean(rawData?.assessments?.hasData),
            },
            pendingEvaluations: rawData?.pendingEvaluations ?? 0,
            todaysClasses: {
              total: rawData?.todaysClasses?.total ?? 0,
              attendanceNotMarked: rawData?.todaysClasses?.attendanceNotMarked ?? 0,
              sessions: Array.isArray(rawData?.todaysClasses?.sessions) ? rawData.todaysClasses.sessions : [],
            },
            attendanceTrend: Array.isArray(rawData?.attendanceTrend) ? rawData.attendanceTrend : [],
            courseCompletionPercent: rawData?.courseCompletionPercent ?? 0,
            weakStudentAlerts: rawData?.weakStudentAlerts ?? 0,
            performanceDistribution: rawData?.performanceDistribution ?? { bands: [] },
            evaluationDistribution: Array.isArray(rawData?.evaluationDistribution) ? rawData.evaluationDistribution : [],
            moduleScores: Array.isArray(rawData?.moduleScores) ? rawData.moduleScores : [],
          };
          return (
            <div className="space-y-6">
              {/* Customizable Hero Banner (P0) */}
              <HeroBanner
                userName={rawData?.trainer?.name || 'Trainer'}
                userRole="Trainer"
                roleSubtitle={`${data.assignedBatches.length} Assigned Batches · ${num(data.studentCount)} Participants`}
                statLabel="Attendance"
                statValue={pct(data.attendance.percentage, 1)}
                statSubtext={`${num(data.attendance.present)}/${num(data.attendance.total)} present`}
                primaryAction={{
                  label: "Today's Classes",
                  href: '/trainer/classes',
                  icon: <CalendarCheck className="size-4" />,
                }}
                secondaryAction={{
                  label: 'Evaluations',
                  href: '/trainer/evaluations',
                  icon: <ClipboardCheck className="size-4" />,
                }}
              />

              {/* KPI Stat Cards */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Enrolled participants"
                  value={num(data.studentCount)}
                  icon={<Users className="text-heading" />}
                  tone="charcoal"
                  deltaLabel={`${data.assignedBatches.length} batch(es) assigned`}
                />
                <StatCard
                  label="Batch attendance"
                  value={pct(data.attendance.percentage, 1)}
                  icon={<CalendarCheck className="text-heading" />}
                  tone={data.attendance.percentage >= 75 ? 'mustard' : 'charcoal'}
                  hasData={data.attendance.hasData}
                  deltaLabel={`${num(data.attendance.present)} of ${num(data.attendance.total)} verified present`}
                />
                <StatCard
                  label="Assessment average"
                  value={num(data.assessments.average, 1)}
                  outOf={100}
                  icon={<GraduationCap className="text-heading" />}
                  tone="mustard"
                  hasData={data.assessments.hasData}
                  deltaLabel={`${num(data.assessments.count)} scores · range ${data.assessments.min}–${data.assessments.max}`}
                />
                <StatCard
                  label="Pending evaluations"
                  value={num(data.pendingEvaluations)}
                  icon={<ClipboardCheck className="text-heading" />}
                  tone={data.pendingEvaluations > 0 ? 'mustard' : 'charcoal'}
                  deltaLabel={
                    data.pendingEvaluations > 0 ? 'Submissions awaiting evaluation' : 'Queue clear'
                  }
                />
              </div>

              {/* Bento Content Sections */}
              <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
                <div className="space-y-5">
                  {/* Today's Classes */}
                  <Card className="border-border bg-card shadow-xs">
                    <CardHeader className="pb-2.5 border-b border-border flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-sm font-semibold font-heading text-foreground">Today&apos;s Training Sessions</CardTitle>
                        <CardSubtitle className="text-xs text-muted-foreground">
                          {data.todaysClasses.total} scheduled ·{' '}
                          {data.todaysClasses.attendanceNotMarked} without attendance marked
                        </CardSubtitle>
                      </div>
                      <Button asChild variant="secondary" size="sm" className="text-xs h-7">
                        <Link href="/trainer/classes">All Classes</Link>
                      </Button>
                    </CardHeader>
                    <CardBody className="pt-3">
                      {data.todaysClasses.sessions.length === 0 ? (
                        <p className="py-5 text-center text-xs text-muted-foreground">
                          No training classes scheduled for today.
                        </p>
                      ) : (
                        <ul className="space-y-2.5">
                          {data.todaysClasses.sessions.map((session: any) => (
                            <li
                              key={session.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                            >
                              <div className="min-w-[180px] flex-1">
                                <p className="text-xs font-semibold text-foreground">{session.topic}</p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  {session.batchName} · {session.trainingModuleName}
                                </p>
                              </div>
                              <p className="tnum text-xs font-mono font-medium text-foreground">
                                {formatTime(session.date)} – {formatTime(session.endsAt)}
                              </p>
                              <Button asChild variant="primary" size="sm" className="flex items-center gap-1.5 text-xs h-7">
                                <Link href={`/trainer/attendance/${session.id}`}>
                                  <CalendarCheck className="size-3.5" aria-hidden />
                                  Mark Attendance
                                </Link>
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardBody>
                  </Card>

                  {/* Attendance Trend */}
                  <ChartCard
                    title="Attendance Velocity"
                    subtitle="Historical participation across your cohorts over the last eight weeks"
                    description={`Weekly attendance percentage across ${data.attendanceTrend.length} weeks.`}
                    isEmpty={!data.attendanceTrend.some((week: any) => week.hasSession)}
                    height={210}
                  >
                    <LineTrend
                      data={data.attendanceTrend}
                      xKey="label"
                      series={[{ key: 'percentage', label: 'Attendance %' }]}
                      unit="%"
                    />
                  </ChartCard>

                  {/* Module Scores */}
                  <ChartCard
                    title="Evaluation Benchmark by Module"
                    subtitle="Trainer-rated parameters, normalized to 100"
                    description={data.moduleScores
                      .map((row: any) => `${row.module}: ${row.average}`)
                      .join('; ')}
                    isEmpty={data.moduleScores.length === 0}
                    height={210}
                  >
                    <BarCompare
                      data={data.moduleScores}
                      xKey="module"
                      valueKey="average"
                      colorBy={(row) => attendanceColor(row.average)}
                    />
                  </ChartCard>
                </div>

                <div className="space-y-6">
                  {/* Course Completion */}
                  <Card className="border-border bg-card shadow-card">
                    <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-base font-bold font-heading text-heading">Syllabus Progression</CardTitle>
                        <CardSubtitle className="text-xs text-muted-foreground">Aggregate completion across your assigned batches</CardSubtitle>
                      </div>
                      <TrendingUp className="size-4 text-accent" aria-hidden />
                    </CardHeader>
                    <CardBody className="pt-4">
                      <div className="flex items-center justify-between text-xs font-semibold text-heading mb-2">
                        <span>Cohort Completion</span>
                        <span className="font-mono">{pct(data.courseCompletionPercent, 0)}</span>
                      </div>
                      <ProgressBar value={data.courseCompletionPercent} />
                      <Button asChild variant="secondary" size="sm" className="mt-4 w-full text-xs">
                        <Link href="/trainer/course-progress">Inspect Course Milestones</Link>
                      </Button>
                    </CardBody>
                  </Card>

                  {/* Participant Alerts */}
                  <Card className="border-border bg-card shadow-card">
                    <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-base font-bold font-heading text-heading">Intervention Alerts</CardTitle>
                        <CardSubtitle className="text-xs text-muted-foreground">Automated flags raised from attendance &amp; test thresholds</CardSubtitle>
                      </div>
                      <AlertTriangle
                        className={
                          data.weakStudentAlerts > 0 ? 'size-4 text-heading' : 'size-4 text-muted-foreground'
                        }
                        aria-hidden
                      />
                    </CardHeader>
                    <CardBody className="pt-4">
                      <p className="tnum text-3xl font-bold font-mono text-heading">
                        <AnimatedCounter value={data.weakStudentAlerts} />
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {data.weakStudentAlerts > 0
                          ? 'Participants requiring targeted pedagogical remediation this week.'
                          : 'All participants currently meeting threshold milestones.'}
                      </p>
                      <Button asChild variant="secondary" size="sm" className="mt-4 w-full text-xs">
                        <Link href="/trainer/alerts">Review Intervention Alerts</Link>
                      </Button>
                    </CardBody>
                  </Card>

                  {/* My Batches */}
                  <Card className="border-border bg-card shadow-card">
                    <CardHeader className="pb-3 border-b border-border">
                      <CardTitle className="text-base font-bold font-heading text-heading">Assigned Cohorts</CardTitle>
                      <CardSubtitle className="text-xs text-muted-foreground">{data.assignedBatches.length} academic batches assigned</CardSubtitle>
                    </CardHeader>
                    <CardBody className="pt-4">
                      <ul className="space-y-2.5">
                        {data.assignedBatches.map((batch: any) => (
                          <li key={batch.id}>
                            <Link
                              href={`/trainer/batches/${batch.id}`}
                              className="flex items-center justify-between gap-3 rounded-2xl border border-border p-3 transition-all duration-200 hover:border-accent hover:bg-muted"
                            >
                              <span className="min-w-0">
                                <span className="block text-xs font-bold font-heading text-heading">{batch.name}</span>
                                <span className="block text-[11px] text-muted-foreground mt-0.5">
                                  {batch.code} · {batch.departmentName}
                                </span>
                              </span>
                              <Badge tone={batch.status === 'active' ? 'mustard' : 'neutral'} className="text-[10px] font-semibold">
                                {batch.status}
                              </Badge>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </CardBody>
                  </Card>
                </div>
              </div>
            </div>
          );
        }}
      </AsyncSection>
    </div>
  );
}
