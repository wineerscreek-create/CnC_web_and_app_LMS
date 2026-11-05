'use client';

import {
  Activity,
  AlertTriangle,
  Building2,
  Clock,
  GraduationCap,
  Layers,
  Radio,
  Server,
  Users,
} from 'lucide-react';
import Link from 'next/link';

import { BarCompare, ChartCard, LineTrend } from '@/components/charts';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { formatTime, num, pct, titleCase } from '@/lib/format';

export default function AdminDashboardPage() {
  const query = useApi<any>('/admin/dashboard');

  return (
    <div className="space-y-6">
      <AsyncSection query={query} skeleton="kpis">
        {(rawData) => {
          const data = {
            institution: rawData?.institution ?? { name: 'Institution', code: '' },
            quickActions: Array.isArray(rawData?.quickActions) ? rawData.quickActions : [],
            kpis: {
              totalStudents: rawData?.kpis?.totalStudents ?? 0,
              totalTrainers: rawData?.kpis?.totalTrainers ?? 0,
              departments: rawData?.kpis?.departments ?? 0,
              activeBatches: rawData?.kpis?.activeBatches ?? 0,
              averageInstitutionalEediScore: rawData?.kpis?.averageInstitutionalEediScore ?? null,
              averageScoreHasData: Boolean(rawData?.kpis?.averageScoreHasData),
            },
            attendanceTrend: Array.isArray(rawData?.attendanceTrend) ? rawData.attendanceTrend : [],
            studentsPerDepartment: Array.isArray(rawData?.studentsPerDepartment) ? rawData.studentsPerDepartment : [],
            classMonitoring: {
              sessionsToday: rawData?.classMonitoring?.sessionsToday ?? 0,
              liveNow: rawData?.classMonitoring?.liveNow ?? 0,
              sessions: Array.isArray(rawData?.classMonitoring?.sessions) ? rawData.classMonitoring.sessions : [],
            },
            enrollments: rawData?.enrollments ?? {},
            systemAndAiUsage: rawData?.systemAndAiUsage ?? {
              aiCalls24h: 0,
              averageLatencyMs: 0,
              failures24h: 0,
              queue: { active: 0, queued: 0 },
              providers: {},
            },
          };
          return (
            <>
              {/* Institutional Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h1 className="text-2xl font-black font-heading tracking-tight text-heading">
                      {data.institution.name}
                    </h1>
                    <Badge tone="mustard" className="font-semibold text-xs py-0.5 px-2.5">
                      Code: {data.institution.code}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Institutional governance node — cross-department administration, batch operations, and system telemetry.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(data.quickActions ?? []).map((action: any) => (
                    <Button key={action.code} asChild variant="secondary" size="sm" className="text-xs">
                      <Link href={action.href}>{action.label}</Link>
                    </Button>
                  ))}
                </div>
              </div>

              {/* 5 KPI Stat Cards */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <StatCard
                  label="Total Participants"
                  value={num(data.kpis.totalStudents)}
                  icon={<Users className="text-foreground" />}
                  tone="charcoal"
                />
                <StatCard
                  label="Faculty Trainers"
                  value={num(data.kpis.totalTrainers)}
                  icon={<GraduationCap className="text-foreground" />}
                  tone="mustard"
                />
                <StatCard
                  label="Departments"
                  value={num(data.kpis.departments)}
                  icon={<Building2 className="text-foreground" />}
                  tone="charcoal"
                />
                <StatCard
                  label="Active Batches"
                  value={num(data.kpis.activeBatches)}
                  icon={<Layers className="text-foreground" />}
                  tone="charcoal"
                />
                <StatCard
                  label="Average Readiness"
                  value={num(data.kpis.averageInstitutionalEediScore, 1)}
                  outOf={100}
                  icon={<Activity className="text-foreground" />}
                  tone="mustard"
                  hasData={data.kpis.averageScoreHasData}
                />
              </div>

              {/* Charts Grid */}
              <div className="grid gap-6 xl:grid-cols-2">
                <ChartCard
                  title="Campus Attendance Velocity"
                  subtitle="Institution-wide aggregate across the last eight weeks"
                  description={data.attendanceTrend
                    .map((week: any) => `${week.label}: ${week.percentage}%`)
                    .join('; ')}
                  isEmpty={!data.attendanceTrend.some((week: any) => week.hasSession)}
                  height={220}
                >
                  <LineTrend
                    data={data.attendanceTrend}
                    xKey="label"
                    series={[{ key: 'percentage', label: 'Attendance %' }]}
                    unit="%"
                  />
                </ChartCard>

                <ChartCard
                  title="Enrollment Distribution by Department"
                  subtitle="Participant allocation across academic streams"
                  description={data.studentsPerDepartment
                    .map((row: any) => `${row.code}: ${row.students}`)
                    .join('; ')}
                  isEmpty={data.studentsPerDepartment.length === 0}
                  height={220}
                >
                  <BarCompare
                    data={data.studentsPerDepartment}
                    xKey="code"
                    valueKey="students"
                    domain={[0, Math.max(...data.studentsPerDepartment.map((r: any) => r.students), 10)]}
                  />
                </ChartCard>
              </div>

              {/* Class Monitoring & Infrastructure Telemetry */}
              <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
                <Card className="border-border bg-card shadow-sm">
                  <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-bold font-heading text-heading">Live Class Operations</CardTitle>
                      <CardSubtitle className="text-xs text-muted-foreground">
                        {num(data.classMonitoring.sessionsToday)} session(s) today ·{' '}
                        {num(data.classMonitoring.liveNow)} currently live
                      </CardSubtitle>
                    </div>
                    <Radio
                      className={
                        data.classMonitoring.liveNow > 0
                          ? 'size-4 text-accent animate-pulse'
                          : 'size-4 text-muted-foreground'
                      }
                      aria-hidden
                    />
                  </CardHeader>
                  <CardBody className="pt-4">
                    {data.classMonitoring.sessions.length === 0 ? (
                      <p className="py-8 text-center text-xs text-muted-foreground">
                        No training sessions scheduled today across departments.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {data.classMonitoring.sessions.map((session: any) => (
                          <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3 transition-colors hover:bg-muted rounded-xl px-2">
                            <div className="min-w-[180px] flex-1">
                              <p className="text-xs font-bold text-foreground">{session.topic}</p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {session.batchName} · {session.trainerName}
                              </p>
                            </div>
                            <p className="tnum flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                              <Clock className="size-3 text-accent" aria-hidden />
                              {formatTime(session.date)} – {formatTime(session.endsAt)}
                            </p>
                            <StatusBadge status={session.status} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardBody>
                </Card>

                <div className="space-y-6">
                  {/* Enrollment Mix */}
                  <Card className="border-border bg-card shadow-sm">
                    <CardHeader className="pb-3 border-b border-border">
                      <CardTitle className="text-base font-bold font-heading text-heading">Enrollment Status Breakdown</CardTitle>
                      <CardSubtitle className="text-xs text-muted-foreground">Student status tally across the college</CardSubtitle>
                    </CardHeader>
                    <CardBody className="pt-4">
                      <ul className="space-y-2.5">
                        {Object.entries(data.enrollments).map(([status, count]) => (
                          <li key={status} className="flex items-center justify-between p-2.5 rounded-xl bg-muted border border-border">
                            <StatusBadge status={status} />
                            <span className="tnum text-xs font-bold font-mono text-foreground">{num(count as number)}</span>
                          </li>
                        ))}
                      </ul>
                    </CardBody>
                  </Card>

                  {/* AI & Infrastructure Usage */}
                  <Card className="border-border bg-card shadow-sm">
                    <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-base font-bold font-heading text-heading">AI &amp; System Health</CardTitle>
                        <CardSubtitle className="text-xs text-muted-foreground">24-hour diagnostic metrics</CardSubtitle>
                      </div>
                      <Server className="size-4 text-accent" aria-hidden />
                    </CardHeader>
                    <CardBody className="pt-4">
                      <dl className="grid grid-cols-3 gap-2 text-center">
                        {[
                          ['AI calls', num(data.systemAndAiUsage.aiCalls24h)],
                          ['Latency', `${num(data.systemAndAiUsage.averageLatencyMs)}ms`],
                          ['Failures', num(data.systemAndAiUsage.failures24h)],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-xl bg-muted border border-border p-2">
                            <dd className="tnum text-sm font-bold font-mono text-foreground">{value}</dd>
                            <dt className="text-[10px] uppercase font-semibold text-muted-foreground mt-0.5">{label}</dt>
                          </div>
                        ))}
                      </dl>

                      <ul className="mt-4 space-y-2">
                        {Object.entries(data.systemAndAiUsage.providers ?? {}).map(
                          ([key, provider]: [string, any]) => (
                            <li key={key} className="flex items-center justify-between text-xs p-2 rounded-xl bg-muted/60 border border-border">
                              <span className="font-semibold text-foreground">{titleCase(key)}</span>
                              <Badge tone={provider.usingDevelopmentFallback ? 'neutral' : 'mustard'} className="text-[10px] py-0 px-1.5">
                                {provider.active}
                              </Badge>
                            </li>
                          ),
                        )}
                      </ul>

                      {data.systemAndAiUsage.queue?.dead > 0 && (
                        <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <AlertTriangle className="size-3.5 text-accent" aria-hidden />
                          {num(data.systemAndAiUsage.queue.dead)} dead-lettered job(s) in queue
                        </p>
                      )}

                      <Button asChild variant="secondary" size="sm" className="mt-4 w-full text-xs">
                        <Link href="/admin/system">Inspect Infrastructure Telemetry</Link>
                      </Button>
                    </CardBody>
                  </Card>
                </div>
              </div>
            </>
          );
        }}
      </AsyncSection>
    </div>
  );
}
