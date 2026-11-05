'use client';

import { ArrowRight, BookOpen, CheckCircle2, Clock, PlayCircle, Sparkles, Target } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';
import { iconFor } from '@/lib/icons';

const FILTERS = [
  { value: 'all', label: 'All Programs' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'not_started', label: 'Not Started' },
  { value: 'completed', label: 'Completed' },
];

export default function MyLearningPage() {
  const [filter, setFilter] = React.useState('all');
  const courses = useApi<any[]>('/student/courses');
  const path = useApi<any>('/student/learning-path');
  const recs = useApi<any>('/student/recommendations/courses');

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Learning"
        description="Your enrolled programs structured according to your career readiness pathway."
      />

      {/* Diagnosed Skill-Gap Course Recommendations */}
      {recs.data && (
        recs.data.recommendations && recs.data.recommendations.length > 0 ? (
          <Card className="border-accent/40 bg-card shadow-card transition-all duration-300 hover:shadow-card hover:border-accent">
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-xs">
                      <Sparkles className="size-4" aria-hidden />
                    </span>
                    <CardTitle className="text-base font-bold font-heading text-heading">
                      Recommended Soft Skills Programs
                    </CardTitle>
                    <Badge tone="mustard" className="text-[11px] py-0.5 px-2 capitalize font-semibold">
                      {recs.data.diagnosedWeakPillar?.replace('_', ' ') || 'Communication'} Focus
                    </Badge>
                  </div>
                  <CardSubtitle className="text-xs text-muted-foreground">
                    Deterministic curriculum recommendations ranked to close identified growth areas.
                  </CardSubtitle>
                </div>
                <Button asChild variant="secondary" size="sm" className="text-xs">
                  <Link href="/courses" className="flex items-center gap-1.5">
                    Browse Catalog
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardBody className="pt-4">
              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                {recs.data.recommendations.slice(0, 4).map((rec: any) => (
                  <div
                    key={rec.courseId}
                    className="group rounded-2xl bg-muted/40 p-4 border border-border shadow-xs flex flex-col justify-between transition-all duration-200 hover:bg-card hover:border-accent hover:shadow-card"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1.5 mb-2">
                        <Badge
                          tone={rec.priority === 'HIGH' ? 'mustard' : 'neutral'}
                          className="text-[10px] py-0.5 px-2 font-medium"
                        >
                          {rec.priority} Priority
                        </Badge>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          Match {rec.score}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold font-heading text-heading line-clamp-1">
                        {rec.title}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                        {rec.reasons?.[0] || 'Directly addresses your primary growth area.'}
                      </p>
                    </div>
                    <div className="mt-3.5 pt-3 border-t border-border flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {rec.category || 'Soft Skills'}
                      </span>
                      <Button asChild variant="ghost" size="sm" className="h-7 px-2.5 text-xs text-foreground hover:text-primary">
                        <Link href={`/student/learning/${rec.courseId}`} className="flex items-center gap-1">
                          View
                          <ArrowRight className="size-3" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        ) : (
          <Card className="border border-border bg-card p-5 shadow-card">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-primary border border-border">
                  <Sparkles className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-bold text-heading">
                    {recs.data.message || 'No eligible Soft Skills courses available right now.'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    You are enrolled in all active modules configured for your cohort.
                  </p>
                </div>
              </div>
              <Button asChild variant="secondary" size="sm" className="text-xs shrink-0">
                <Link href="/courses" className="flex items-center gap-1.5">
                  Browse Catalog
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </Card>
        )
      )}

      {/* Learning Path Bento Card */}
      {path.data && (
        <Card className="border-border bg-card shadow-card transition-all duration-300 hover:shadow-card">
          <CardHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold font-heading text-heading">Curriculum Milestone Path</CardTitle>
                <CardSubtitle className="text-xs text-muted-foreground">{path.data.overallPercent}% of the full journey complete</CardSubtitle>
              </div>
              <span className="text-xs font-bold font-mono px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground border border-border">
                {path.data.overallPercent}% Complete
              </span>
            </div>
          </CardHeader>
          <CardBody className="pt-4">
            <ol className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              {(path.data.stages ?? []).map((stage: any, index: number) => (
                <li
                  key={stage.stage}
                  className={cn(
                    'rounded-2xl p-3.5 border transition-all duration-200',
                    stage.state === 'in_progress'
                      ? 'border-accent bg-accent/15 shadow-xs'
                      : stage.state === 'completed'
                        ? 'border-border bg-muted/40'
                        : 'border-border bg-card opacity-60'
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        'tnum flex size-6 items-center justify-center rounded-full text-xs font-bold',
                        stage.state === 'completed'
                          ? 'bg-primary text-primary-foreground'
                          : stage.state === 'in_progress'
                            ? 'bg-accent text-accent-foreground'
                            : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {stage.state === 'completed' ? (
                        <CheckCircle2 className="size-3.5" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className="text-sm font-semibold text-heading truncate">{stage.title}</span>
                  </div>
                  <ProgressBar value={stage.percent} className="mt-3" thin />
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center justify-between">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="bg-muted p-1 rounded-2xl border border-border">
            {FILTERS.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="rounded-xl px-3.5 py-1.5 text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs text-muted-foreground"
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Courses Grid */}
      <AsyncSection query={courses} skeleton="cards" isEmpty={(rows) => (rows ?? []).length === 0}>
        {(rawRows) => {
          const rows = Array.isArray(rawRows) ? rawRows : (rawRows as any)?.items ?? (rawRows as any)?.data ?? [];
          const filtered = rows.filter((course: any) => {
            if (filter === 'all') return true;
            return course.state === filter;
          });

          return (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((course: any) => {
                const Icon = iconFor(course.category);
                return (
                  <Card
                    key={course.id}
                    className="flex flex-col border-border bg-card shadow-card transition-all duration-300 hover:shadow-card hover:-translate-y-0.5"
                  >
                    <CardBody className="flex flex-1 flex-col p-5">
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex size-10 items-center justify-center rounded-2xl bg-muted text-primary border border-border">
                          <Icon className="size-5" aria-hidden />
                        </span>
                        <Badge
                          tone={
                            course.state === 'completed'
                              ? 'neutral'
                              : course.state === 'in_progress'
                                ? 'mustard'
                                : 'neutral'
                          }
                          className="capitalize text-xs font-semibold px-2.5 py-0.5"
                        >
                          {course.state === 'in_progress'
                            ? 'In Progress'
                            : course.state === 'completed'
                              ? 'Completed'
                              : 'Not Started'}
                        </Badge>
                      </div>

                      <h2 className="mt-4 text-base font-bold font-heading text-heading leading-snug line-clamp-2">
                        {course.title}
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {course.trainerName} · {course.difficulty}
                      </p>

                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs mb-1.5 font-semibold text-muted-foreground">
                          <span>Progress</span>
                          <span className="font-mono text-heading">{course.percent || 0}%</span>
                        </div>
                        <ProgressBar value={course.percent} />
                      </div>

                      <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Clock className="size-3.5" aria-hidden />
                          {course.timeRemainingMinutes
                            ? `${course.timeRemainingMinutes} min left`
                            : `${course.durationHours}h program`}
                        </span>
                        <span>·</span>
                        <span>{course.stage}</span>
                      </div>

                      {course.nextLesson && (
                        <p className="mt-3 truncate text-xs text-muted-foreground">
                          Next: <span className="font-semibold text-foreground">{course.nextLesson}</span>
                        </p>
                      )}

                      <div className="mt-auto pt-5">
                        <Button
                          asChild
                          variant={course.state === 'completed' ? 'secondary' : 'primary'}
                          size="sm"
                          className="w-full flex items-center justify-center gap-2"
                        >
                          <Link href={`/student/learning/${course.id}`}>
                            <PlayCircle className="size-4" aria-hidden />
                            {course.state === 'completed'
                              ? 'Review Program'
                              : course.state === 'in_progress'
                                ? 'Continue Learning'
                                : 'Start Program'}
                          </Link>
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          );
        }}
      </AsyncSection>
    </div>
  );
}
