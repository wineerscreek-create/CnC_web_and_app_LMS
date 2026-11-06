'use client';

import {
  Award,
  BarChart3,
  CalendarCheck,
  ChevronRight,
  GraduationCap,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';

import { BarCompare, ChartCard, LineTrend, attendanceColor } from '@/components/charts';
import { HeroBanner } from '@/components/dashboard/HeroBanner';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { AnimatedCounter } from '@/components/ui/counter';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';
import { formatDate, num, pct } from '@/lib/format';

export default function HodDashboardPage() {
  const query = useApi<any>('/hod/dashboard');

  return (
    <div className="space-y-6">
      <AsyncSection query={query} skeleton="kpis">
        {(rawData) => {
          const data = {
            scope: rawData?.scope ?? {
              departmentName: 'Department',
              breadcrumb: 'Department Oversight',
              readOnly: false,
              isolationNotice: 'Department Scoped',
              departmentCode: '',
              collegeName: 'Institution',
            },
            kpis: {
              participants: {
                value: rawData?.kpis?.participants?.value ?? 0,
                delta: rawData?.kpis?.participants?.delta,
                deltaLabel: rawData?.kpis?.participants?.deltaLabel ?? 'in this department',
              },
              trainers: {
                value: rawData?.kpis?.trainers?.value ?? 0,
                deltaLabel: rawData?.kpis?.trainers?.deltaLabel ?? 'assigned faculty',
              },
              averageSessionAttendance: {
                value: rawData?.kpis?.averageSessionAttendance?.value ?? 0,
                hasData: Boolean(rawData?.kpis?.averageSessionAttendance?.hasData),
              },
              averageSkillScore: {
                value: rawData?.kpis?.averageSkillScore?.value ?? null,
                outOf: rawData?.kpis?.averageSkillScore?.outOf ?? 100,
                hasData: Boolean(rawData?.kpis?.averageSkillScore?.hasData),
              },
            },
            thresholds: rawData?.thresholds ?? { attendance: 75, certificateAttendance: 80, certificateScore: 70 },
            alerts: Array.isArray(rawData?.alerts) ? rawData.alerts : [],
            attendanceTrend: Array.isArray(rawData?.attendanceTrend) ? rawData.attendanceTrend : [],
            moduleAttendance: Array.isArray(rawData?.moduleAttendance) ? rawData.moduleAttendance : [],
            moduleScores: Array.isArray(rawData?.moduleScores) ? rawData.moduleScores : [],
            recentEnrollments: Array.isArray(rawData?.recentEnrollments) ? rawData.recentEnrollments : [],
          };
          return (
            <div className="space-y-6">
              {/* Customizable Hero Banner (P0) */}
              <HeroBanner
                userName={data.scope.departmentName}
                userRole="SPOC"
                roleSubtitle={`${data.scope.collegeName || 'Institution'} · ${data.scope.departmentName}`}
                statLabel="Cohort Size"
                statValue={num(data.kpis.participants.value)}
                statSubtext="Active Participants"
                primaryAction={{
                  label: 'View Participants',
                  href: '/hod/participants',
                  icon: <Users className="size-4" />,
                }}
                secondaryAction={{
                  label: 'Session Attendance',
                  href: '/hod/attendance',
                  icon: <CalendarCheck className="size-4" />,
                }}
              />

              {/* KPI Stat Cards */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Participants"
                  value={num(data.kpis.participants.value)}
                  icon={<Users className="text-foreground" />}
                  delta={data.kpis.participants.delta}
                  deltaLabel={data.kpis.participants.deltaLabel}
                  tone="charcoal"
                />
                <StatCard
                  label="Faculty Trainers"
                  value={num(data.kpis.trainers.value)}
                  icon={<GraduationCap className="text-foreground" />}
                  tone="mustard"
                  deltaLabel={data.kpis.trainers.deltaLabel}
                />
                <StatCard
                  label="Session Attendance"
                  value={pct(data.kpis.averageSessionAttendance.value, 1)}
                  icon={<CalendarCheck className="text-foreground" />}
                  tone={data.kpis.averageSessionAttendance.value >= 75 ? 'mustard' : 'charcoal'}
                  hasData={data.kpis.averageSessionAttendance.hasData}
                  hint={`Threshold ${num(data.thresholds.attendance, 0)}% — below that a participant is a defaulter.`}
                />
                <StatCard
                  label="Average Skill Score"
                  value={num(data.kpis.averageSkillScore.value, 1)}
                  outOf={data.kpis.averageSkillScore.outOf}
                  icon={<BarChart3 className="text-foreground" />}
                  tone="charcoal"
                  hasData={data.kpis.averageSkillScore.hasData}
                />
              </div>

              {/* Alerts Grid */}
              {data.alerts?.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-3">
                  {data.alerts.map((alert: any) => (
                    <Link key={alert.code} href={alert.href} className="group">
                      <Card className="h-full border-border bg-card p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:border-accent hover:-translate-y-0.5">
                        <CardBody className="p-0">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            {alert.label}
                          </p>
                          <p className="tnum mt-2 flex items-baseline justify-between text-2xl font-bold font-mono text-foreground">
                            <AnimatedCounter value={alert.count} />
                            <ChevronRight
                              className="size-4 text-accent transition-transform group-hover:translate-x-1"
                              aria-hidden
                            />
                          </p>
                        </CardBody>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}

              {/* Charts & Enrollments */}
              <div className="grid gap-6 xl:grid-cols-2">
                <ChartCard
                  title="Session Attendance Velocity"
                  subtitle="Weekly aggregate across all department cohorts"
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
                  title="Attendance Benchmark by Module"
                  subtitle="Participant turnout across individual syllabus modules"
                  description={data.moduleAttendance
                    .map((row: any) => `${row.key}: ${row.percentage}%`)
                    .join('; ')}
                  isEmpty={data.moduleAttendance.length === 0}
                  height={220}
                >
                  <BarCompare
                    data={data.moduleAttendance}
                    xKey="key"
                    valueKey="percentage"
                    unit="%"
                    threshold={data.thresholds.attendance}
                    thresholdLabel={`${num(data.thresholds.attendance, 0)}% threshold`}
                    colorBy={(row) => attendanceColor(row.percentage)}
                  />
                </ChartCard>

                <ChartCard
                  title="Average Competency Score by Module"
                  subtitle="Trainer-evaluated rubrics normalized to 100"
                  description={data.moduleScores
                    .map((row: any) => `${row.module}: ${row.average}`)
                    .join('; ')}
                  isEmpty={data.moduleScores.length === 0}
                  height={220}
                >
                  <BarCompare
                    data={data.moduleScores}
                    xKey="module"
                    valueKey="average"
                    colorBy={(row) => attendanceColor(row.average)}
                  />
                </ChartCard>

                <Card className="border-border bg-card shadow-sm">
                  <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-bold font-heading text-heading">Recent Cohort Enrollments</CardTitle>
                      <CardSubtitle className="text-xs text-muted-foreground">Verified registration history and batch transfers</CardSubtitle>
                    </div>
                    <Button asChild variant="ghost" size="sm" className="text-xs">
                      <Link href="/hod/enrollment">View All</Link>
                    </Button>
                  </CardHeader>
                  <CardBody className="pt-4">
                    <ul className="divide-y divide-border">
                      {data.recentEnrollments.map((row: any) => (
                        <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3 transition-colors hover:bg-muted rounded-xl px-2">
                          <div className="min-w-[160px] flex-1">
                            <p className="text-xs font-bold text-foreground">{row.participantName ?? row.studentName}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground font-mono">
                              {row.rollNumber} · {row.batchName}
                            </p>
                          </div>
                          <span className="tnum text-xs text-muted-foreground">
                            {formatDate(row.enrolledAt)}
                          </span>
                          <StatusBadge status={row.status} />
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              </div>

              {/* Multi-Tenant Scope Banner */}
              <Card className="border-border bg-card p-5 shadow-sm">
                <CardBody className="p-0">
                  <p className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <ShieldCheck className="size-4 text-accent" aria-hidden />
                    Multi-Tenant Department Boundary Assurance
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                    {data.scope.isolationNotice} — You are the administrative SPOC of {data.scope.departmentName} ({data.scope.departmentCode}) at{' '}
                    {data.scope.collegeName}. All department-level evaluations, participant profiles and records are strictly segregated.
                  </p>
                </CardBody>
              </Card>
            </div>
          );
        }}
      </AsyncSection>
    </div>
  );
}
