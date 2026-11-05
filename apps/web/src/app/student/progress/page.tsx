'use client';

import { Award, Download, Flame, Sparkles, Target, TrendingUp, Trophy } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { ChartCard, LineTrend } from '@/components/charts';
import { PageHeader } from '@/components/shared/page-header';
import { SkillBreakdown } from '@/components/shared/progress-bits';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { AnimatedCounter } from '@/components/ui/counter';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, num } from '@/lib/format';
import { iconFor } from '@/lib/icons';

export default function ProgressPage() {
  const query = useApi<any>('/student/progress');
  const [requesting, setRequesting] = React.useState(false);

  async function requestReport() {
    setRequesting(true);
    try {
      const response = await api.post('/student/reports/progress', {});
      toast.success(
        response.message ?? 'Your progress report is being prepared — it will appear in downloads.',
      );
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setRequesting(false);
    }
  }

  return (
    <AsyncSection query={query} skeleton="kpis">
      {(rawData) => {
        const data = {
          readiness: {
            score: rawData?.readiness?.score ?? null,
            delta: rawData?.readiness?.delta ?? null,
            hasData: Boolean(rawData?.readiness?.hasData),
          },
          practiceSessions: rawData?.practiceSessions ?? 0,
          streak: {
            days: rawData?.streak?.days ?? 0,
            lastActiveOn: rawData?.streak?.lastActiveOn ?? '—',
          },
          batchRank: {
            rank: rawData?.batchRank?.rank ?? null,
            outOf: rawData?.batchRank?.outOf ?? null,
          },
          trend: Array.isArray(rawData?.trend) ? rawData.trend : [],
          skillBreakdown: Array.isArray(rawData?.skillBreakdown) ? rawData.skillBreakdown : [],
          dayOneVsToday: {
            rows: Array.isArray(rawData?.dayOneVsToday?.rows) ? rawData.dayOneVsToday.rows : [],
            dayOneAt: rawData?.dayOneVsToday?.dayOneAt ?? null,
          },
          strongestSkill: rawData?.strongestSkill ?? null,
          focusArea: rawData?.focusArea ?? null,
          nextRecommendedActivity: rawData?.nextRecommendedActivity ?? null,
          achievements: Array.isArray(rawData?.achievements) ? rawData.achievements : [],
          semesterTracking: Array.isArray(rawData?.semesterTracking) ? rawData.semesterTracking : [],
        };
        return (
          <div className="space-y-6">
            <PageHeader
              title="My Progress & Analytics"
              description="Detailed baseline metrics, 7-pillar employability breakdown, and historical skill velocity."
              actions={
                <Button variant="secondary" size="sm" loading={requesting} onClick={requestReport} className="flex items-center gap-1.5">
                  <Download className="size-3.5" aria-hidden />
                  Download Progress Report
                </Button>
              }
            />

            {/* KPI Stat Cards */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Readiness score"
                value={data.readiness.score ?? '—'}
                outOf={100}
                icon={<TrendingUp className="text-heading" />}
                delta={data.readiness.delta}
                deltaLabel={
                  data.readiness.delta
                    ? `${data.readiness.delta > 0 ? '+' : ''}${data.readiness.delta} since last evaluation`
                    : undefined
                }
                hasData={data.readiness.hasData}
                tone="mustard"
              />
              <StatCard
                label="Practice sessions"
                value={num(data.practiceSessions)}
                icon={<Target className="text-heading" />}
                tone="charcoal"
              />
              <StatCard
                label="Current streak"
                value={`${data.streak.days} days`}
                icon={<Flame className="text-accent" />}
                tone="mustard"
                deltaLabel={`Last active ${data.streak.lastActiveOn}`}
              />
              <StatCard
                label="Batch rank"
                value={data.batchRank.rank ? `#${data.batchRank.rank}` : '—'}
                icon={<Trophy className="text-heading" />}
                tone="charcoal"
                deltaLabel={data.batchRank.outOf ? `of ${num(data.batchRank.outOf)} cohort peers` : 'Cohort pending'}
              />
            </div>

            {/* Semester Progression Track */}
            {data.semesterTracking.length > 0 && (
              <Card className="border-border bg-card shadow-card transition-all duration-300 hover:shadow-card">
                <CardHeader className="pb-3 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-bold font-heading text-heading">Semester EEDI Progression</CardTitle>
                    <CardSubtitle className="text-xs text-muted-foreground">
                      Official curriculum milestones tracked across academic semesters
                    </CardSubtitle>
                  </div>
                  <Badge tone="mustard" className="self-start sm:self-auto font-semibold">
                    8-Semester Track
                  </Badge>
                </CardHeader>

                <CardBody className="pt-4">
                  <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                    {data.semesterTracking.map((sem: any) => {
                      const isCurrent = sem.isCurrent;
                      const isEvaluated = sem.score !== null && sem.score !== undefined;
                      const isUpcoming = sem.status === 'UPCOMING';

                      return (
                        <div
                          key={sem.semester}
                          className={cn(
                            'relative rounded-2xl border p-4 transition-all duration-200',
                            isCurrent
                              ? 'border-accent bg-accent/20 shadow-xs'
                              : 'border-border bg-muted/40 hover:bg-card hover:border-accent',
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                              Semester {sem.semester}
                            </span>
                            {isCurrent && (
                              <span className="rounded-full bg-accent text-accent-foreground px-2 py-0.5 text-[10px] font-bold">
                                Current
                              </span>
                            )}
                          </div>

                          <div className="mt-3">
                            <div className="text-lg font-bold font-mono text-heading">
                              {isEvaluated ? (
                                <span>{Number(sem.score).toFixed(1)} EEDI</span>
                              ) : (
                                <span className="text-muted-foreground font-medium text-xs">
                                  {isCurrent ? 'In Progress' : isUpcoming ? 'Upcoming' : 'Not Evaluated'}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{sem.label}</p>
                          </div>

                          <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="truncate mr-2">{sem.courseTitle}</span>
                            <Badge tone={isCurrent ? 'mustard' : isEvaluated ? 'charcoal' : 'neutral'} className="text-[10px] py-0 px-1.5 shrink-0">
                              {sem.status}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardBody>
              </Card>
            )}

            {/* Charts & Breakdown */}
            <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
              <ChartCard
                title="Readiness Velocity"
                subtitle="Calculated dynamically across faculty ratings and AI assessments"
                description={`Readiness trend across ${data.trend.length} evaluations, currently score is ${data.readiness.score}.`}
                isEmpty={data.trend.length < 2}
                emptyLabel="At least two evaluation milestones required to display trend line"
                height={230}
              >
                <LineTrend
                  data={data.trend.map((point: any) => ({
                    label: formatDate(point.at),
                    score: point.score,
                  }))}
                  xKey="label"
                  series={[{ key: 'score', label: 'Readiness Index' }]}
                  domain={[0, 100]}
                />
              </ChartCard>

              <Card className="border-border bg-card shadow-card">
                <CardHeader className="pb-3 border-b border-border">
                  <CardTitle className="text-base font-bold font-heading text-heading">7-Pillar Employability Breakdown</CardTitle>
                  <CardSubtitle className="text-xs text-muted-foreground">Core capability assessment indices</CardSubtitle>
                </CardHeader>
                <CardBody className="pt-4">
                  <SkillBreakdown pillars={data.skillBreakdown} />
                </CardBody>
              </Card>
            </div>

            {/* Day One vs Today & Actionable Highlights */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-border bg-card shadow-card">
                <CardHeader className="pb-3 border-b border-border">
                  <CardTitle className="text-base font-bold font-heading text-heading">Day One vs Today</CardTitle>
                  <CardSubtitle className="text-xs text-muted-foreground">
                    Baseline established {formatDate(data.dayOneVsToday.dayOneAt)}
                  </CardSubtitle>
                </CardHeader>
                <CardBody className="pt-3">
                  <TableWrap>
                    <Table>
                      <thead>
                        <Tr>
                          <Th className="text-heading">Pillar Metric</Th>
                          <Th align="right" className="text-heading">Day One</Th>
                          <Th align="right" className="text-heading">Today</Th>
                          <Th align="right" className="text-heading">Delta</Th>
                        </Tr>
                      </thead>
                      <tbody>
                        {data.dayOneVsToday.rows.map((row: any) => {
                          const change = Number(row.today) - Number(row.dayOne);
                          return (
                            <Tr key={row.metric}>
                              <Td className="font-semibold text-xs text-heading">{row.metric}</Td>
                              <Td align="right" className="tnum font-mono text-xs text-muted-foreground">
                                {num(row.dayOne, 1)}
                              </Td>
                              <Td align="right" className="tnum font-mono text-xs font-bold text-heading">
                                {num(row.today, 1)}
                              </Td>
                              <Td align="right" className="tnum font-mono text-xs font-bold">
                                <span
                                  className={
                                    change > 0 ? 'text-heading bg-accent/20 px-1.5 py-0.5 rounded text-accent-foreground' : change < 0 ? 'text-muted-foreground' : undefined
                                  }
                                >
                                  {change > 0 ? '+' : ''}
                                  {num(change, 1)}
                                </span>
                              </Td>
                            </Tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </TableWrap>
                </CardBody>
              </Card>

              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Card className="border-border bg-card p-5 shadow-card">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Strongest Pillar
                    </p>
                    <p className="mt-1 text-base font-bold font-heading text-heading">{data.strongestSkill?.label || 'Analytical'}</p>
                    <p className="tnum mt-1 text-2xl font-bold font-mono text-heading">
                      <AnimatedCounter value={data.strongestSkill?.score ?? 0} />
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{data.strongestSkill?.band || 'Advanced Proficiency'}</p>
                  </Card>

                  <Card className="border-accent bg-accent/15 p-5 shadow-card">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-heading">
                      Primary Growth Focus
                    </p>
                    <p className="mt-1 text-base font-bold font-heading text-heading">{data.focusArea?.label || 'Verbal Delivery'}</p>
                    <p className="tnum mt-1 text-2xl font-bold font-mono text-heading">
                      <AnimatedCounter value={data.focusArea?.score ?? 0} />
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{data.focusArea?.band || 'Focus Area'}</p>
                  </Card>
                </div>

                {data.nextRecommendedActivity && (
                  <Card className="border-border bg-card shadow-card p-5">
                    <div className="flex items-center justify-between pb-3 border-b border-border">
                      <div>
                        <CardTitle className="text-base font-bold font-heading text-heading">Recommended Activity</CardTitle>
                        <CardSubtitle className="text-xs text-muted-foreground">
                          Targeted for {data.nextRecommendedActivity.weakestDimensionLabel}
                        </CardSubtitle>
                      </div>
                      <Sparkles className="size-4 text-accent" aria-hidden />
                    </div>
                    <div className="mt-3.5">
                      <p className="text-sm font-bold text-heading">
                        {data.nextRecommendedActivity.exerciseTitle}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {data.nextRecommendedActivity.reason}
                      </p>
                      <Button asChild variant="primary" size="sm" className="mt-4">
                        <Link href="/student/practice">Start Practice</Link>
                      </Button>
                    </div>
                  </Card>
                )}

                <Card className="border-border bg-card shadow-card p-5">
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <div>
                      <CardTitle className="text-base font-bold font-heading text-heading">Achievements</CardTitle>
                      <CardSubtitle className="text-xs text-muted-foreground">
                        {(data.achievements ?? []).filter((badge: any) => badge.earned).length} earned milestone badges
                      </CardSubtitle>
                    </div>
                    <Button asChild variant="ghost" size="sm" className="text-xs">
                      <Link href="/student/achievements">View All</Link>
                    </Button>
                  </div>
                  <div className="mt-3.5">
                    <ul className="flex flex-wrap gap-2">
                      {(data.achievements ?? []).slice(0, 8).map((badge: any) => {
                        const Icon = iconFor(badge.icon, Award);
                        return (
                          <li key={badge.code}>
                            <Badge
                              tone={badge.earned ? 'mustard' : 'neutral'}
                              className={cn(
                                'flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold',
                                badge.earned ? 'bg-accent text-accent-foreground' : 'bg-muted/40 text-muted-foreground border border-border'
                              )}
                            >
                              <Icon className="size-3" aria-hidden />
                              {badge.title}
                            </Badge>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        );
      }}
    </AsyncSection>
  );
}
