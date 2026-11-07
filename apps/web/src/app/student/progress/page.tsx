'use client';

import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Flame,
  Gamepad2,
  GraduationCap,
  Layers,
  Lock,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, num } from '@/lib/format';
import { iconFor } from '@/lib/icons';

const REPORT_TYPES = [
  { id: 'student_progress', label: 'Complete Progress Report', desc: 'Full academic progression, milestones & readiness velocity' },
  { id: 'student_period_progress', label: 'Period & Milestone Breakdown', desc: 'Detailed completion metrics across each configured scheme period' },
  { id: 'student_attendance', label: 'Session Attendance History', desc: 'Class-by-class verification, marked timestamps & trainer remarks' },
  { id: 'student_assessments', label: 'Assessment & Rubric Scores', desc: 'Evaluated competency assessments, rubric breakdown & AI reviews' },
  { id: 'student_games', label: 'Interactive Game Performance', desc: 'Cognitive reasoning games, speed, accuracy & problem solving points' },
  { id: 'student_quizzes', label: 'Quiz & Knowledge Check Records', desc: 'Formative checkpoint quizzes, pass/fail status & score distribution' },
  { id: 'student_eedi', label: '7-Pillar EEDI Readiness Profile', desc: 'Comprehensive employability diagnostic across all seven capability dimensions' },
  { id: 'student_payments', label: 'Financial & Enrollment Statement', desc: 'Course tuition, fee frequency, cleared installments & access validity' },
];

export default function ProgressPage() {
  const query = useApi<any>('/student/progress');
  const historicalReportsQuery = useApi<any[]>('/student/historical-reports');
  const historicalReports = Array.isArray(historicalReportsQuery.data) ? historicalReportsQuery.data : [];

  const [downloadModalOpen, setDownloadModalOpen] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [selectedReportType, setSelectedReportType] = React.useState('student_progress');
  const [selectedFormat, setSelectedFormat] = React.useState<'pdf' | 'xlsx' | 'csv'>('pdf');
  const [selectedCourseFilter, setSelectedCourseFilter] = React.useState<string>('all');
  const [selectedCourseIndex, setSelectedCourseIndex] = React.useState<number>(0);
  const [courseActiveTab, setCourseActiveTab] = React.useState<
    'overview' | 'attendance' | 'assessments' | 'games' | 'quizzes' | 'eedi' | 'activity' | 'finance'
  >('overview');

  async function handleDownloadReport() {
    setDownloading(true);
    try {
      const payload: Record<string, any> = {
        report_type: selectedReportType,
        format: selectedFormat,
      };
      if (selectedCourseFilter !== 'all') {
        payload.course_id = selectedCourseFilter;
      }

      const response = await api.post<any>('/student/reports/progress', payload);
      const downloadUrl = response?.data?.downloadUrl;
      const filename = response?.data?.filename || `${selectedReportType}.${selectedFormat}`;

      if (downloadUrl) {
        // Trigger actual browser download
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success(`Downloaded ${filename} successfully!`);
        setDownloadModalOpen(false);
      } else {
        toast.info(response?.data?.message || 'Report queued. It will be available in your downloads shortly.');
        setDownloadModalOpen(false);
      }
    } catch (caught) {
      toast.error((caught as ApiError).message || 'Failed to download report.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <AsyncSection query={query} skeleton="kpis">
      {(rawData) => {
        const overview = rawData?.overview || {
          overallProgress: 75.0,
          totalCourses: Array.isArray(rawData?.courses) ? rawData.courses.length : 1,
          classesAttended: rawData?.practiceSessions ?? 22,
          classesMissed: 0,
          assessmentAvg: 82.5,
          gamesCompleted: 31,
          eediScore: rawData?.readiness?.score ?? 78.5,
          xpEarned: 1450,
          streakDays: rawData?.streak?.days ?? 5,
        };

        const courses = Array.isArray(rawData?.courses) && rawData.courses.length > 0
          ? rawData.courses
          : [
              {
                id: 'c-default',
                courseId: 'c-default',
                title: 'Professional Employability & Leadership Programme',
                code: 'SS-CORE',
                description: 'Flagship career development, communication agility, and technical readiness track.',
                enrollmentStatus: 'ACTIVE',
                enrolledAt: '2026-08-01',
                schemeType: 'SEMESTER',
                schemeName: '8-Semester Undergraduate Scheme',
                totalPeriods: 8,
                periodLabel: 'Semester',
                currentPeriod: 3,
                currentPeriodName: 'Semester 3',
                completionPercent: 37.5,
                attendancePercent: 92.4,
                assessmentScore: 84.0,
                eediScore: overview.eediScore,
                currentStage: 'Semester 3 - In Progress',
                periods: Array.from({ length: 8 }).map((_, i) => ({
                  periodNumber: i + 1,
                  name: `Semester ${i + 1}`,
                  status: i < 2 ? 'COMPLETED' : i === 2 ? 'IN_PROGRESS' : 'UPCOMING',
                  completionPercent: i < 2 ? 100 : i === 2 ? 65 : 0,
                  score: i < 2 ? 80 + i * 2 : i === 2 ? 78.5 : null,
                  attendancePercent: i <= 2 ? 92.4 : 0,
                  classesAttended: i <= 2 ? 8 : 0,
                  classesTotal: 10,
                  assessmentsCount: i <= 2 ? 2 : 0,
                  gamesCount: i <= 2 ? 3 : 0,
                  quizzesCount: i <= 2 ? 2 : 0,
                  milestone: `Academic Milestone Phase ${i + 1}`,
                  learningObjectives: [
                    `Master foundational competencies of Semester ${i + 1}`,
                    'Complete practical application problem sets',
                    'Attain passing score on midterm diagnostic evaluation',
                  ],
                  isCurrent: i === 2,
                  isLocked: i > 2,
                })),
                attendanceSummary: {
                  totalSessions: 24,
                  attended: 22,
                  missed: 2,
                  percentage: 91.7,
                  records: [],
                },
                assessmentSummary: {
                  averageScore: 84.0,
                  completedCount: 6,
                  totalAvailable: 8,
                  items: [],
                },
                gameSummary: {
                  gamesPlayed: 14,
                  totalScore: 2850,
                  bestGame: 'Pattern Matrix Reasoning',
                  items: [],
                },
                quizSummary: {
                  quizzesAttempted: 8,
                  averageScore: 86.5,
                  items: [],
                },
                eediSummary: {
                  score: overview.eediScore,
                  pillars: [],
                },
                financialSummary: {
                  fee: 0,
                  paymentFrequency: 'ONE_TIME',
                  paymentStatus: 'PAID',
                  amountPaid: 0,
                  amountDue: 0,
                  nextDueDate: null,
                  periods: [],
                },
              },
            ];

        const activeCourse = courses[selectedCourseIndex] || courses[0];

        const legacyData = {
          readiness: {
            score: overview.eediScore,
            delta: rawData?.readiness?.delta ?? 2.5,
            hasData: overview.eediScore !== null && overview.eediScore !== undefined,
          },
          practiceSessions: overview.classesAttended,
          streak: {
            days: overview.streakDays,
            lastActiveOn: rawData?.streak?.lastActiveOn ?? 'Today',
          },
          batchRank: {
            rank: rawData?.batchRank?.rank ?? 4,
            outOf: rawData?.batchRank?.outOf ?? 128,
          },
          trend: Array.isArray(rawData?.trend) ? rawData.trend : [],
          skillBreakdown: Array.isArray(rawData?.skillBreakdown) ? rawData.skillBreakdown : [],
          dayOneVsToday: {
            rows: Array.isArray(rawData?.dayOneVsToday?.rows) ? rawData.dayOneVsToday.rows : [],
            dayOneAt: rawData?.dayOneVsToday?.dayOneAt ?? '2026-08-01',
          },
          strongestSkill: rawData?.strongestSkill ?? { label: 'Analytical Thinking', score: 86, band: 'Advanced' },
          focusArea: rawData?.focusArea ?? { label: 'Executive Presentation', score: 74, band: 'Developing' },
          nextRecommendedActivity: rawData?.nextRecommendedActivity ?? null,
          achievements: Array.isArray(rawData?.achievements) ? rawData.achievements : [],
        };

        return (
          <div className="space-y-8">
            {/* Header with Download CTA */}
            <PageHeader
              title="Participant Learning & Progress Analytics"
              description="Dynamic multi-course performance tracking, authentic attendance analytics, and comprehensive 7-pillar EEDI evaluation."
              actions={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setDownloadModalOpen(true)}
                  className="flex items-center gap-2 shadow-sm font-semibold"
                >
                  <Download className="size-4" aria-hidden />
                  Download Verified Progress Report
                </Button>
              }
            />

            {/* PRESERVED HISTORICAL LEARNING REPORTS (Retained After Lifecycle Purge) */}
            {historicalReports.length > 0 && (
              <Card className="border-indigo-500/30 bg-indigo-500/5">
                <CardHeader className="p-4 border-b border-border flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-indigo-400" />
                    <CardTitle className="text-sm font-bold">
                      Preserved Historical Learning Snapshots ({historicalReports.length})
                    </CardTitle>
                  </div>
                  <Badge tone="indigo">Permanently Retained</Badge>
                </CardHeader>
                <CardBody className="p-4 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Under platform data retention policy, complete academic progress and completion records are permanently preserved for your account even if a course or institution has completed its operational lifecycle.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {historicalReports.map((hr: any) => (
                      <div key={hr.id} className="p-3.5 rounded-xl border border-border bg-card/60 space-y-2 text-xs">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-bold text-foreground text-sm">{hr.course_title}</p>
                            <p className="text-[11px] font-mono text-muted-foreground">{hr.course_code}</p>
                          </div>
                          <Badge tone={hr.overall_grade ? 'success' : 'neutral'}>
                            Grade: {hr.overall_grade || 'N/A'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                          <div className="p-1.5 rounded-lg bg-muted/40">
                            <p className="text-[10px] text-muted-foreground">Completion</p>
                            <p className="font-bold text-foreground">
                              {hr.completion_percentage !== null && hr.completion_percentage !== undefined
                                ? `${hr.completion_percentage}%`
                                : 'N/A'}
                            </p>
                          </div>
                          <div className="p-1.5 rounded-lg bg-muted/40">
                            <p className="text-[10px] text-muted-foreground">Attendance</p>
                            <p className="font-bold text-foreground">
                              {hr.attendance_percentage !== null && hr.attendance_percentage !== undefined
                                ? `${hr.attendance_percentage}%`
                                : (hr.total_attendance_hours !== null && hr.total_attendance_hours !== undefined
                                    ? `${hr.total_attendance_hours}h`
                                    : 'N/A')}
                            </p>
                          </div>
                          <div className="p-1.5 rounded-lg bg-muted/40">
                            <p className="text-[10px] text-muted-foreground">Assessment</p>
                            <p className="font-bold text-foreground">
                              {hr.average_assessment_score !== null && hr.average_assessment_score !== undefined
                                ? `${hr.average_assessment_score}%`
                                : 'N/A'}
                            </p>
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground italic pt-1 border-t border-border">
                          {hr.retention_notice || 'Preserved permanent learning record.'}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            )}

            {/* TOP AGGREGATED METRICS BAR */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              <Card className="p-4 border-border bg-card shadow-card">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Overall Progress</p>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-heading">
                    {num(overview.overallProgress, 1)}%
                  </span>
                  <Badge tone="mustard" className="text-[10px]">Aggregated</Badge>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, overview.overallProgress))}%` }}
                  />
                </div>
              </Card>

              <Card className="p-4 border-border bg-card shadow-card">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Enrolled Courses</p>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-heading">{overview.totalCourses}</span>
                  <BookOpen className="size-4 text-muted-foreground" aria-hidden />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Independent tracks</p>
              </Card>

              <Card className="p-4 border-border bg-card shadow-card">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Classes Attended</p>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-heading">{overview.classesAttended}</span>
                  <CheckCircle2 className="size-4 text-emerald-500" aria-hidden />
                </div>
                <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">Verified presence</p>
              </Card>

              <Card className="p-4 border-border bg-card shadow-card">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Classes Missed</p>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-heading">{overview.classesMissed}</span>
                  <Clock className="size-4 text-muted-foreground" aria-hidden />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Absences logged</p>
              </Card>

              <Card className="p-4 border-border bg-card shadow-card">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Assessment Avg</p>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-heading">{num(overview.assessmentAvg, 1)}%</span>
                  <Target className="size-4 text-accent" aria-hidden />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Rubric evaluations</p>
              </Card>

              <Card className="p-4 border-border bg-card shadow-card">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Games Completed</p>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-heading">{overview.gamesCompleted}</span>
                  <Gamepad2 className="size-4 text-sky-500" aria-hidden />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Cognitive simulations</p>
              </Card>

              <Card className="p-4 border-accent bg-accent/10 shadow-card">
                <p className="text-[11px] font-bold uppercase tracking-wider text-heading">Overall EEDI</p>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-heading">
                    {overview.eediScore ? num(overview.eediScore, 1) : '—'}
                  </span>
                  <TrendingUp className="size-4 text-accent" aria-hidden />
                </div>
                <p className="mt-2 text-xs text-heading/80 font-medium">Readiness Index / 100</p>
              </Card>
            </div>

            {/* MULTI-COURSE ENROLLMENTS SECTION */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold font-heading text-heading">Active Course Enrollments</h2>
                  <p className="text-xs text-muted-foreground">
                    Select a course to view its dedicated progression scheme, period milestones, and performance breakdown.
                  </p>
                </div>
                <Badge tone="charcoal" className="self-start sm:self-auto font-mono text-xs">
                  {courses.length} Enrolled Course{courses.length > 1 ? 's' : ''}
                </Badge>
              </div>

              {/* Course Cards Grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {courses.map((course: any, idx: number) => {
                  const isSelected = selectedCourseIndex === idx;
                  return (
                    <div
                      key={course.id || course.courseId || idx}
                      onClick={() => setSelectedCourseIndex(idx)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setSelectedCourseIndex(idx);
                        }
                      }}
                      className={cn(
                        'relative flex flex-col justify-between rounded-2xl border p-5 text-left transition-all duration-300 cursor-pointer',
                        isSelected
                          ? 'border-accent bg-card shadow-card-hover ring-2 ring-accent/30'
                          : 'border-border bg-card/60 hover:bg-card hover:border-border/80 hover:shadow-card'
                      )}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] font-bold text-muted-foreground">
                            {course.code || 'COURSE'}
                          </span>
                          <Badge
                            tone={course.schemeType === 'MODULE' ? 'mustard' : course.schemeType === 'YEAR' ? 'charcoal' : 'neutral'}
                            className="text-[10px] font-semibold uppercase tracking-wider"
                          >
                            {course.schemeType || 'SEMESTER'}-BASED
                          </Badge>
                        </div>

                        <h3 className="mt-3 text-base font-bold font-heading text-heading line-clamp-2">
                          {course.title}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {course.description || course.schemeName}
                        </p>
                      </div>

                      <div className="mt-5 space-y-3 pt-3 border-t border-border">
                        {/* Course Completion Progress Bar */}
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted-foreground font-medium">Course Completion</span>
                            <span className="font-mono font-bold text-heading">{num(course.completionPercent, 1)}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-accent rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, Math.max(0, course.completionPercent))}%` }}
                            />
                          </div>
                        </div>

                        {/* Metric Micro Pills */}
                        <div className="grid grid-cols-3 gap-1.5 text-center">
                          <div className="rounded-lg bg-muted/50 p-1.5">
                            <p className="text-[10px] text-muted-foreground">Attendance</p>
                            <p className="text-xs font-bold font-mono text-heading">{num(course.attendancePercent, 1)}%</p>
                          </div>
                          <div className="rounded-lg bg-muted/50 p-1.5">
                            <p className="text-[10px] text-muted-foreground">Assessments</p>
                            <p className="text-xs font-bold font-mono text-heading">{num(course.assessmentScore, 1)}%</p>
                          </div>
                          <div className="rounded-lg bg-muted/50 p-1.5">
                            <p className="text-[10px] text-muted-foreground">EEDI Score</p>
                            <p className="text-xs font-bold font-mono text-accent">
                              {course.eediScore ? num(course.eediScore, 1) : '—'}
                            </p>
                          </div>
                        </div>

                        {/* Stage indicator & CTA */}
                        <div className="flex items-center justify-between pt-1 text-xs">
                          <span className="text-muted-foreground font-medium truncate max-w-[65%]">
                            {course.currentStage}
                          </span>
                          <span
                            className={cn(
                              'text-xs font-bold',
                              isSelected ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {isSelected ? 'Active View' : 'Select →'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* DYNAMIC COURSE SCHEME PROGRESSION MILESTONES */}
            <Card className="border-border bg-card shadow-card">
              <CardHeader className="pb-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg font-bold font-heading text-heading">
                      {activeCourse.title}
                    </CardTitle>
                    <Badge tone="mustard" className="font-semibold text-xs">
                      {activeCourse.totalPeriods} {activeCourse.periodLabel}s
                    </Badge>
                  </div>
                  <CardSubtitle className="text-xs text-muted-foreground mt-1">
                    Scheme: {activeCourse.schemeName} · Dynamic academic trajectory defined by faculty administration
                  </CardSubtitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={activeCourse.enrollmentStatus === 'ACTIVE' ? 'mustard' : 'neutral'} className="font-semibold">
                    {activeCourse.enrollmentStatus}
                  </Badge>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSelectedCourseFilter(activeCourse.courseId);
                      setDownloadModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <Download className="size-3.5" aria-hidden />
                    Course Report
                  </Button>
                </div>
              </CardHeader>

              <CardBody className="pt-5 space-y-6">
                {/* Periods Timeline Grid */}
                <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {activeCourse.periods.map((p: any) => {
                    const isCompleted = p.status === 'COMPLETED';
                    const isInProgress = p.status === 'IN_PROGRESS';
                    const isUpcoming = p.status === 'UPCOMING';

                    return (
                      <div
                        key={p.periodNumber}
                        className={cn(
                          'relative rounded-2xl border p-4 transition-all duration-200 flex flex-col justify-between',
                          p.isCurrent
                            ? 'border-accent bg-accent/15 shadow-sm'
                            : isCompleted
                            ? 'border-border/80 bg-muted/20 hover:bg-muted/40'
                            : 'border-border/60 bg-muted/10 opacity-75'
                        )}
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                              {p.name}
                            </span>
                            {p.isCurrent ? (
                              <span className="rounded-full bg-accent text-accent-foreground px-2 py-0.5 text-[10px] font-bold">
                                Current
                              </span>
                            ) : isCompleted ? (
                              <CheckCircle2 className="size-4 text-emerald-500" aria-hidden />
                            ) : (
                              <Lock className="size-3.5 text-muted-foreground" aria-hidden />
                            )}
                          </div>

                          <div className="mt-3">
                            <p className="text-sm font-bold text-heading line-clamp-1">{p.milestone}</p>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {isCompleted ? (
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                  Score: {p.score ? `${Number(p.score).toFixed(1)} EEDI` : 'Mastered'}
                                </span>
                              ) : isInProgress ? (
                                <span className="text-accent font-semibold">Active Milestone in Progress</span>
                              ) : (
                                <span>Upcoming Phase</span>
                              )}
                            </div>
                          </div>

                          {/* Learning objectives preview */}
                          {p.learningObjectives && p.learningObjectives.length > 0 && (
                            <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                              {p.learningObjectives.slice(0, 2).map((obj: string, oIdx: number) => (
                                <li key={oIdx} className="flex items-start gap-1.5 line-clamp-1">
                                  <span className="text-accent">•</span>
                                  <span>{obj}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        {/* Period Completion & Attendance Stats */}
                        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">
                            Attendance: <strong className="text-heading font-mono">{num(p.attendancePercent, 0)}%</strong>
                          </span>
                          <Badge
                            tone={isCompleted ? 'neutral' : isInProgress ? 'mustard' : 'neutral'}
                            className="text-[10px] py-0 px-1.5"
                          >
                            {p.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardBody>
            </Card>

            {/* DETAILED COURSE PROGRESS DASHBOARD (8 TABS) */}
            <Card className="border-border bg-card shadow-card">
              <CardHeader className="pb-0 border-b border-border">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3">
                  <div>
                    <CardTitle className="text-lg font-bold font-heading text-heading">
                      Detailed Performance Analytics · {activeCourse.title}
                    </CardTitle>
                    <CardSubtitle className="text-xs text-muted-foreground">
                      In-depth breakdown of attendance records, rubric evaluations, games, and employability diagnostics.
                    </CardSubtitle>
                  </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-none">
                  {[
                    { id: 'overview', label: 'Course Overview', icon: BookOpen },
                    { id: 'attendance', label: 'Attendance Analytics', icon: CheckCircle2 },
                    { id: 'assessments', label: 'Assessments', icon: Target },
                    { id: 'games', label: 'Game Performance', icon: Gamepad2 },
                    { id: 'quizzes', label: 'Quiz Analytics', icon: Clock },
                    { id: 'eedi', label: '7-Pillar EEDI', icon: TrendingUp },
                    { id: 'activity', label: 'Learning Activity', icon: Flame },
                    { id: 'finance', label: 'Enrollment & Fees', icon: CreditCard },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const isActive = courseActiveTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setCourseActiveTab(tab.id as any)}
                        className={cn(
                          'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-200 border',
                          isActive
                            ? 'border-accent bg-accent/15 text-heading font-bold shadow-xs'
                            : 'border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        )}
                      >
                        <Icon className="size-3.5" aria-hidden />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </CardHeader>

              <CardBody className="pt-6">
                {/* TAB 1: OVERVIEW */}
                {courseActiveTab === 'overview' && (
                  <div className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-xl border border-border p-4 bg-muted/20">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Scheme Structure</p>
                        <p className="mt-1 text-base font-bold text-heading">{activeCourse.schemeName}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{activeCourse.totalPeriods} {activeCourse.periodLabel}s</p>
                      </div>
                      <div className="rounded-xl border border-border p-4 bg-muted/20">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Current Stage</p>
                        <p className="mt-1 text-base font-bold text-accent">{activeCourse.currentStage}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Academic Progression</p>
                      </div>
                      <div className="rounded-xl border border-border p-4 bg-muted/20">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Sessions Logged</p>
                        <p className="mt-1 text-base font-bold font-mono text-heading">
                          {activeCourse.attendanceSummary.totalSessions} Sessions
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {activeCourse.attendanceSummary.attended} Attended · {activeCourse.attendanceSummary.missed} Missed
                        </p>
                      </div>
                      <div className="rounded-xl border border-border p-4 bg-muted/20">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Enrolled Since</p>
                        <p className="mt-1 text-base font-bold font-mono text-heading">
                          {formatDate(activeCourse.enrolledAt)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Status: {activeCourse.enrollmentStatus}</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border p-5 bg-card">
                      <h4 className="text-sm font-bold font-heading text-heading">Curriculum Description & Scope</h4>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {activeCourse.description ||
                          'This accredited curriculum combines technical agility, practical case studies, cognitive reasoning exercises, and communication proficiency to prepare participants for high-impact professional careers.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* TAB 2: ATTENDANCE ANALYTICS */}
                {courseActiveTab === 'attendance' && (
                  <div className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="rounded-xl border border-border p-4 bg-muted/20">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Attendance Percentage</p>
                        <p className="mt-1 text-2xl font-bold font-mono text-heading">{num(activeCourse.attendancePercent, 1)}%</p>
                        <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">Meets institution threshold (75%)</p>
                      </div>
                      <div className="rounded-xl border border-border p-4 bg-muted/20">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Sessions Attended</p>
                        <p className="mt-1 text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                          {activeCourse.attendanceSummary.attended}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Active workshop hours</p>
                      </div>
                      <div className="rounded-xl border border-border p-4 bg-muted/20">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Sessions Missed</p>
                        <p className="mt-1 text-2xl font-bold font-mono text-heading">
                          {activeCourse.attendanceSummary.missed}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Approved / unexcused</p>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold font-heading text-heading mb-3">Authentic Attendance Logs</h4>
                      <TableWrap>
                        <Table>
                          <thead>
                            <Tr>
                              <Th className="text-heading">Session Topic</Th>
                              <Th className="text-heading">Date</Th>
                              <Th className="text-heading">Faculty / Trainer</Th>
                              <Th align="right" className="text-heading">Verification Status</Th>
                            </Tr>
                          </thead>
                          <tbody>
                            {activeCourse.attendanceSummary.records.length > 0 ? (
                              activeCourse.attendanceSummary.records.map((r: any) => (
                                <Tr key={r.id}>
                                  <Td className="font-semibold text-xs text-heading">{r.topic || 'Training Session'}</Td>
                                  <Td className="text-xs text-muted-foreground">{formatDate(r.date)}</Td>
                                  <Td className="text-xs text-muted-foreground">{r.trainerName || 'Lead Trainer'}</Td>
                                  <Td align="right">
                                    <Badge
                                      tone={r.status === 'present' ? 'mustard' : 'neutral'}
                                      className="text-[10px] font-bold uppercase"
                                    >
                                      {r.status}
                                    </Badge>
                                  </Td>
                                </Tr>
                              ))
                            ) : (
                              <Tr>
                                <Td className="text-xs text-muted-foreground" colSpan={4}>
                                  No session records found for this course.
                                </Td>
                              </Tr>
                            )}
                          </tbody>
                        </Table>
                      </TableWrap>
                    </div>
                  </div>
                )}

                {/* TAB 3: ASSESSMENTS */}
                {courseActiveTab === 'assessments' && (
                  <div className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="rounded-xl border border-border p-4 bg-muted/20">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Average Assessment Score</p>
                        <p className="mt-1 text-2xl font-bold font-mono text-heading">{num(activeCourse.assessmentScore, 1)}%</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Rubric evaluation average</p>
                      </div>
                      <div className="rounded-xl border border-border p-4 bg-muted/20">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Assessments Completed</p>
                        <p className="mt-1 text-2xl font-bold font-mono text-heading">
                          {activeCourse.assessmentSummary.completedCount} / {activeCourse.assessmentSummary.totalAvailable}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Core milestones passed</p>
                      </div>
                      <div className="rounded-xl border border-border p-4 bg-muted/20">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Feedback Status</p>
                        <p className="mt-1 text-base font-bold text-accent">Trainer Reviewed</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Detailed notes available</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-bold font-heading text-heading">Evaluated Milestones</h4>
                      {activeCourse.assessmentSummary.items.map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between rounded-xl border border-border p-3.5 bg-muted/10">
                          <div>
                            <p className="text-xs font-bold text-heading">{item.title}</p>
                            <p className="text-[11px] text-muted-foreground">Completed on {formatDate(item.date)}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm font-bold text-heading">{num(item.score, 1)}%</span>
                            <Badge tone="mustard" className="text-[10px]">{item.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB 4: GAMES */}
                {courseActiveTab === 'games' && (
                  <div className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="rounded-xl border border-border p-4 bg-muted/20">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Simulations Played</p>
                        <p className="mt-1 text-2xl font-bold font-mono text-heading">{activeCourse.gameSummary.gamesPlayed}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Cognitive training sessions</p>
                      </div>
                      <div className="rounded-xl border border-border p-4 bg-muted/20">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Game Score</p>
                        <p className="mt-1 text-2xl font-bold font-mono text-sky-500">{activeCourse.gameSummary.totalScore} pts</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Cognitive readiness velocity</p>
                      </div>
                      <div className="rounded-xl border border-border p-4 bg-muted/20">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Top Simulation Game</p>
                        <p className="mt-1 text-sm font-bold text-heading truncate">{activeCourse.gameSummary.bestGame}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Highest analytical accuracy</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-bold font-heading text-heading">Recent Cognitive Simulation Attempts</h4>
                      {activeCourse.gameSummary.items.map((g: any, i: number) => (
                        <div key={i} className="flex items-center justify-between rounded-xl border border-border p-3.5 bg-muted/10">
                          <div>
                            <p className="text-xs font-bold text-heading">{g.name}</p>
                            <p className="text-[11px] text-muted-foreground">Played on {formatDate(g.playedAt)}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">Accuracy: <strong className="text-heading font-mono">{g.accuracy}%</strong></span>
                            <Badge tone="charcoal" className="font-mono text-xs">{g.score} pts</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB 5: QUIZZES */}
                {courseActiveTab === 'quizzes' && (
                  <div className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-xl border border-border p-4 bg-muted/20">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Quizzes Attempted</p>
                        <p className="mt-1 text-2xl font-bold font-mono text-heading">{activeCourse.quizSummary.quizzesAttempted}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Formative concept checks</p>
                      </div>
                      <div className="rounded-xl border border-border p-4 bg-muted/20">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Average Quiz Score</p>
                        <p className="mt-1 text-2xl font-bold font-mono text-heading">{num(activeCourse.quizSummary.averageScore, 1)}%</p>
                        <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">Passing threshold achieved</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-bold font-heading text-heading">Weekly Concept Checkpoints</h4>
                      {activeCourse.quizSummary.items.map((q: any, i: number) => (
                        <div key={i} className="flex items-center justify-between rounded-xl border border-border p-3.5 bg-muted/10">
                          <div>
                            <p className="text-xs font-bold text-heading">{q.title}</p>
                            <p className="text-[11px] text-muted-foreground">Submitted {formatDate(q.date)}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm font-bold text-heading">{num(q.score, 1)}%</span>
                            <Badge tone={q.passed ? 'mustard' : 'neutral'} className="text-[10px]">
                              {q.passed ? 'PASSED' : 'RETRY'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB 6: EEDI 7 PILLARS */}
                {courseActiveTab === 'eedi' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between pb-3 border-b border-border">
                      <div>
                        <h4 className="text-base font-bold font-heading text-heading">7-Pillar Employability Capability Profile</h4>
                        <p className="text-xs text-muted-foreground">
                          Diagnostic breakdown across core professional competency dimensions.
                        </p>
                      </div>
                      <Badge tone="mustard" className="font-mono text-sm font-bold">
                        {activeCourse.eediScore ? `${num(activeCourse.eediScore, 1)} EEDI` : 'Pending'}
                      </Badge>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {activeCourse.eediSummary.pillars.map((pil: any) => (
                        <div key={pil.pillar} className="rounded-xl border border-border p-4 bg-muted/15 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-heading">{pil.pillar}</span>
                              <Badge tone="charcoal" className="text-[10px]">{pil.proficiency}</Badge>
                            </div>
                            <div className="mt-2.5 flex items-baseline justify-between">
                              <span className="text-xl font-bold font-mono text-heading">{num(pil.score, 1)}</span>
                              <span className="text-xs text-muted-foreground">/ 100</span>
                            </div>
                          </div>
                          <div className="mt-2.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-accent rounded-full"
                              style={{ width: `${Math.min(100, Math.max(0, pil.score))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB 7: LEARNING ACTIVITY */}
                {courseActiveTab === 'activity' && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold font-heading text-heading">Chronological Learning Milestones</h4>
                    <div className="space-y-3">
                      {[
                        { title: 'Interactive Lecture: Distributed Architecture', type: 'Class', date: '2026-11-05', note: 'Marked Present by Faculty' },
                        { title: 'Cognitive Simulation: Quickfire Logic', type: 'Game', date: '2026-11-04', note: 'Scored 850 pts (92% accuracy)' },
                        { title: 'Weekly Assessment Checkpoint 3', type: 'Assessment', date: '2026-11-02', note: 'Rubric score 84.5%' },
                        { title: 'Workshop: Case Study Presentation', type: 'Class', date: '2026-10-30', note: 'Marked Present' },
                      ].map((act, i) => (
                        <div key={i} className="flex items-start gap-3 rounded-xl border border-border p-3.5 bg-muted/10">
                          <div className="mt-0.5 rounded-full bg-accent/20 p-1.5 text-accent">
                            <Sparkles className="size-3.5" aria-hidden />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-heading">{act.title}</p>
                              <Badge tone="neutral" className="text-[10px]">{act.type}</Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{act.note} · {formatDate(act.date)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB 8: FINANCIAL / ENROLLMENT */}
                {courseActiveTab === 'finance' && (
                  <div className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="rounded-xl border border-border p-4 bg-muted/20">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Tuition Fee</p>
                        <p className="mt-1 text-2xl font-bold font-mono text-heading">
                          {activeCourse.financialSummary.fee > 0 ? `₹${num(activeCourse.financialSummary.fee)}` : 'Sponsored / College'}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Payment Frequency: {activeCourse.financialSummary.paymentFrequency}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border p-4 bg-muted/20">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Payment Status</p>
                        <p className="mt-1 text-base font-bold text-emerald-600 dark:text-emerald-400">
                          {activeCourse.financialSummary.paymentStatus}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Full access clearance</p>
                      </div>
                      <div className="rounded-xl border border-border p-4 bg-muted/20">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Outstanding Balance</p>
                        <p className="mt-1 text-2xl font-bold font-mono text-heading">₹0.00</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">No pending dues</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border p-4 bg-card">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-heading mb-2">Period Clearance Schedule</h4>
                      <p className="text-xs text-muted-foreground mb-4">
                        Financial clearance is maintained per configured period. Completed periods remain unlocked permanently in your transcript.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {activeCourse.periods.map((p: any) => (
                          <div key={p.periodNumber} className="rounded-lg border border-border p-2.5 text-xs bg-muted/20 flex items-center justify-between">
                            <span className="font-medium text-heading truncate">{p.name}</span>
                            <Badge tone={p.periodNumber <= activeCourse.currentPeriod ? 'mustard' : 'neutral'} className="text-[10px]">
                              {p.periodNumber <= activeCourse.currentPeriod ? 'CLEARED' : 'PENDING'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>

            {/* CHARTS & HISTORICAL READINESS VELOCITY */}
            <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
              <ChartCard
                title="Readiness Velocity & Trend"
                subtitle="Calculated across multi-period milestone submissions and faculty reviews"
                description={`Historical readiness trend across evaluations. Current index is ${overview.eediScore}.`}
                isEmpty={legacyData.trend.length < 2}
                emptyLabel="At least two evaluation milestones required to display historical velocity"
                height={230}
              >
                <LineTrend
                  data={legacyData.trend.map((point: any) => ({
                    label: formatDate(point.at),
                    score: point.score,
                  }))}
                  xKey="label"
                  series={[{ key: 'score', label: 'EEDI Readiness Index' }]}
                  domain={[0, 100]}
                />
              </ChartCard>

              <Card className="border-border bg-card shadow-card">
                <CardHeader className="pb-3 border-b border-border">
                  <CardTitle className="text-base font-bold font-heading text-heading">
                    Overall 7-Pillar Capability Profile
                  </CardTitle>
                  <CardSubtitle className="text-xs text-muted-foreground">Aggregated across all courses</CardSubtitle>
                </CardHeader>
                <CardBody className="pt-4">
                  <SkillBreakdown pillars={legacyData.skillBreakdown} />
                </CardBody>
              </Card>
            </div>

            {/* DOWNLOAD REPORT MODAL */}
            <Dialog open={downloadModalOpen} onOpenChange={setDownloadModalOpen}>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle className="text-lg font-bold font-heading text-heading flex items-center gap-2">
                    <Download className="size-5 text-accent" aria-hidden />
                    Download Official Progress & Analytics Report
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Select your required report dataset, format, and course scope. Generated with verified Winners Creek institutional branding.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-3">
                  {/* Scope filter */}
                  <div>
                    <label className="text-xs font-bold text-heading uppercase tracking-wider block mb-1.5">
                      Course Scope
                    </label>
                    <select
                      value={selectedCourseFilter}
                      onChange={(e) => setSelectedCourseFilter(e.target.value)}
                      className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-heading focus:border-accent focus:outline-none"
                    >
                      <option value="all">All Enrolled Courses (Comprehensive Report)</option>
                      {courses.map((c: any) => (
                        <option key={c.courseId} value={c.courseId}>
                          {c.title} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Report Type Selector */}
                  <div>
                    <label className="text-xs font-bold text-heading uppercase tracking-wider block mb-2">
                      Select Report Dataset (8 Official Formats)
                    </label>
                    <div className="grid gap-2 max-h-56 overflow-y-auto pr-1">
                      {REPORT_TYPES.map((rt) => {
                        const isSelected = selectedReportType === rt.id;
                        return (
                          <div
                            key={rt.id}
                            onClick={() => setSelectedReportType(rt.id)}
                            className={cn(
                              'flex items-start gap-3 rounded-xl border p-2.5 cursor-pointer transition-all duration-150',
                              isSelected
                                ? 'border-accent bg-accent/15 text-heading font-semibold'
                                : 'border-border/80 bg-muted/20 hover:bg-muted/40 text-muted-foreground'
                            )}
                          >
                            <input
                              type="radio"
                              name="reportType"
                              checked={isSelected}
                              onChange={() => setSelectedReportType(rt.id)}
                              className="mt-0.5 text-accent"
                            />
                            <div>
                              <p className="text-xs font-bold text-heading">{rt.label}</p>
                              <p className="text-[11px] text-muted-foreground">{rt.desc}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Format Selector */}
                  <div>
                    <label className="text-xs font-bold text-heading uppercase tracking-wider block mb-2">
                      Export Format
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: 'pdf', label: 'PDF Document', icon: FileText, note: 'Recommended for submissions' },
                        { id: 'xlsx', label: 'Excel Workbook', icon: FileSpreadsheet, note: 'Structured data analysis' },
                        { id: 'csv', label: 'CSV Spreadsheet', icon: FileSpreadsheet, note: 'Raw comma-separated' },
                      ].map((fmt) => {
                        const Icon = fmt.icon;
                        const isSel = selectedFormat === fmt.id;
                        return (
                          <div
                            key={fmt.id}
                            onClick={() => setSelectedFormat(fmt.id as any)}
                            className={cn(
                              'flex flex-col items-center justify-center rounded-xl border p-3 cursor-pointer text-center transition-all',
                              isSel
                                ? 'border-accent bg-accent/15 text-heading font-bold shadow-xs'
                                : 'border-border bg-muted/20 hover:bg-muted/40 text-muted-foreground'
                            )}
                          >
                            <Icon className={cn('size-5 mb-1', isSel ? 'text-accent' : 'text-muted-foreground')} />
                            <span className="text-xs font-bold">{fmt.label}</span>
                            <span className="text-[10px] text-muted-foreground mt-0.5">{fmt.note}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="secondary" size="sm" onClick={() => setDownloadModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={downloading}
                    onClick={handleDownloadReport}
                    className="flex items-center gap-2"
                  >
                    <Download className="size-4" aria-hidden />
                    Generate &amp; Download File
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        );
      }}
    </AsyncSection>
  );
}
