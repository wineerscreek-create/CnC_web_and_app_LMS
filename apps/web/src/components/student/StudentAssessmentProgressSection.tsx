'use client';

import * as React from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  Filter,
  Layers,
  Minus,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, num } from '@/lib/format';

export interface StudentAssessmentProgressSectionProps {
  onViewReport: (reportId: string) => void;
  selectedReportId?: string | null;
}

export function StudentAssessmentProgressSection({
  onViewReport,
  selectedReportId,
}: StudentAssessmentProgressSectionProps) {
  // 1. Overall Performance Summary State
  const [summaryLoading, setSummaryLoading] = React.useState(true);
  const [summary, setSummary] = React.useState<any>(null);

  // 2. Assessment History State
  const [reportsLoading, setReportsLoading] = React.useState(true);
  const [reports, setReports] = React.useState<any[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const limit = 8;

  // Filters
  const [searchTerm, setSearchTerm] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');

  // Fetch Summary
  const fetchSummary = React.useCallback(async () => {
    try {
      setSummaryLoading(true);
      const res = await api.get<any>('/student/progress/assessment-summary');
      setSummary(res.data);
    } catch {
      // Graceful fallback
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  // Fetch Reports
  const fetchReports = React.useCallback(async () => {
    try {
      setReportsLoading(true);
      const params: Record<string, string | number | boolean | undefined | null> = {
        limit,
        offset: (page - 1) * limit,
      };
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const res = await api.get<any>('/student/assessment-reports', params);
      setReports(res.data?.items || []);
      setTotalCount(res.data?.total || 0);
    } catch {
      // Graceful fallback
    } finally {
      setReportsLoading(false);
    }
  }, [page, searchTerm, startDate, endDate]);

  React.useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  React.useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Debounced search
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  return (
    <div className="space-y-8">
      {/* SECTION A: OVERALL PERFORMANCE OVERVIEW */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold font-heading text-heading">
              Assessment Performance Overview
            </h2>
            <p className="text-xs text-muted-foreground">
              Aggregate performance metrics, pass rates, and subject proficiency across all evaluated assessments.
            </p>
          </div>
          {summary?.improvementTrend && (
            <Badge
              tone={
                summary.improvementTrend === 'IMPROVING'
                  ? 'mustard'
                  : summary.improvementTrend === 'DECLINING'
                  ? 'neutral'
                  : 'charcoal'
              }
              className="flex items-center gap-1.5 self-start sm:self-auto py-1 px-2.5 text-xs font-semibold"
            >
              {summary.improvementTrend === 'IMPROVING' ? (
                <>
                  <TrendingUp className="size-3.5 text-emerald-500" />
                  <span>Trend: Improving Velocity</span>
                </>
              ) : summary.improvementTrend === 'DECLINING' ? (
                <>
                  <TrendingDown className="size-3.5 text-rose-500" />
                  <span>Trend: Needs Focus</span>
                </>
              ) : (
                <>
                  <Minus className="size-3.5 text-muted-foreground" />
                  <span>Trend: Steady Consistency</span>
                </>
              )}
            </Badge>
          )}
        </div>

        {/* 6 Metric Stat Cards Grid */}
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Card className="p-4 border-border bg-card shadow-card">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Average Score
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-heading">
                {summary?.averagePercentage !== undefined && summary?.averagePercentage !== null
                  ? `${num(summary.averagePercentage, 1)}%`
                  : '—'}
              </span>
              <Target className="size-4 text-accent" />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">All completed attempts</p>
          </Card>

          <Card className="p-4 border-border bg-card shadow-card">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Completed
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-heading">
                {summary?.totalCompleted ?? 0}
              </span>
              <span className="text-xs font-mono text-muted-foreground">
                of {summary?.totalAttempted ?? 0} total
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Evaluated assessments</p>
          </Card>

          <Card className="p-4 border-border bg-card shadow-card">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Passed
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {summary?.passedCount ?? 0}
              </span>
              <CheckCircle2 className="size-4 text-emerald-500" />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Passing criteria met</p>
          </Card>

          <Card className="p-4 border-border bg-card shadow-card">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Not Passed
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
                {summary?.failedCount ?? 0}
              </span>
              <XCircle className="size-4 text-rose-500" />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Below threshold</p>
          </Card>

          <Card className="p-4 border-border bg-card shadow-card">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Best Score
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-accent">
                {summary?.bestScore !== null && summary?.bestScore !== undefined
                  ? `${num(summary.bestScore, 1)}%`
                  : '—'}
              </span>
              <Sparkles className="size-4 text-accent" />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Highest achievement</p>
          </Card>

          <Card className="p-4 border-border bg-card shadow-card">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Latest Score
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-heading">
                {summary?.latestScore !== null && summary?.latestScore !== undefined
                  ? `${num(summary.latestScore, 1)}%`
                  : '—'}
              </span>
              <Clock className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Most recent attempt</p>
          </Card>
        </div>

        {/* Topic / Subject Breakdown Progress Cards */}
        {Array.isArray(summary?.topicBreakdown) && summary.topicBreakdown.length > 0 && (
          <Card className="border-border bg-card shadow-card">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-base font-bold font-heading text-heading">
                Topic &amp; Subject Mastery Breakdown
              </CardTitle>
              <CardSubtitle className="text-xs text-muted-foreground">
                Aggregated accuracy across questions answered in your assessment history
              </CardSubtitle>
            </CardHeader>
            <CardBody className="pt-4">
              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {summary.topicBreakdown.map((t: any, i: number) => (
                  <div key={i} className="rounded-xl border border-border/80 bg-muted/15 p-3.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-heading truncate">{t.topic}</span>
                      <span className="font-mono font-bold text-accent">{num(t.accuracy, 1)}%</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, t.accuracy || 0))}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{t.correctCount ?? 0} Correct</span>
                      <span>{t.totalQuestions ?? 0} Attempted</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      {/* SECTION B: PERMANENT ASSESSMENT HISTORY TABLE */}
      <Card className="border-border bg-card shadow-card">
        <CardHeader className="pb-4 border-b border-border flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-bold font-heading text-heading">
                Permanent Assessment History &amp; Official Transcripts
              </CardTitle>
              <Badge tone="mustard" className="font-mono text-xs">
                {totalCount} Record{totalCount === 1 ? '' : 's'}
              </Badge>
            </div>
            <CardSubtitle className="text-xs text-muted-foreground mt-1">
              Immutable snapshot reports generated for every completed assessment attempt. Strictly preserved.
            </CardSubtitle>
          </div>

          {/* Search and Filters Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search assessment..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="h-8 rounded-lg border border-border bg-card pl-8 pr-3 text-xs text-heading placeholder:text-muted-foreground focus:border-accent focus:outline-none w-48 sm:w-56"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-heading focus:border-accent focus:outline-none"
                title="Start Date"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-heading focus:border-accent focus:outline-none"
                title="End Date"
              />
            </div>

            {(searchTerm || startDate || endDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchTerm('');
                  setStartDate('');
                  setEndDate('');
                  setPage(1);
                }}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </Button>
            )}
          </div>
        </CardHeader>

        <CardBody className="p-0">
          <TableWrap>
            <Table>
              <thead>
                <Tr>
                  <Th className="text-heading pl-6">Assessment Title</Th>
                  <Th className="text-heading">Attempt Date</Th>
                  <Th className="text-heading">Attempt #</Th>
                  <Th className="text-heading">Score / Max</Th>
                  <Th className="text-heading">Percentage</Th>
                  <Th className="text-heading">Result</Th>
                  <Th className="text-heading">Proctoring</Th>
                  <Th align="right" className="text-heading pr-6">Official Report</Th>
                </Tr>
              </thead>
              <tbody>
                {reportsLoading ? (
                  <Tr>
                    <Td colSpan={8} className="py-12 text-center text-xs text-muted-foreground">
                      <div className="inline-block size-5 animate-spin rounded-full border-2 border-accent border-t-transparent mr-2 align-middle" />
                      Loading assessment transcripts...
                    </Td>
                  </Tr>
                ) : reports.length === 0 ? (
                  <Tr>
                    <Td colSpan={8} className="py-12 text-center text-xs text-muted-foreground">
                      No assessment attempts found matching the current search and filter criteria.
                    </Td>
                  </Tr>
                ) : (
                  reports.map((rep) => {
                    const isPassed = rep.resultStatus === 'PASSED';
                    const isHighlighted = rep.id === selectedReportId;

                    return (
                      <Tr
                        key={rep.id}
                        className={cn(
                          'transition-colors',
                          isHighlighted && 'bg-accent/10 border-l-2 border-l-accent'
                        )}
                      >
                        <Td className="pl-6 font-semibold text-xs text-heading">
                          <span className="line-clamp-1">{rep.assessmentTitle}</span>
                        </Td>
                        <Td className="text-xs text-muted-foreground">
                          {formatDate(rep.completedAt)}
                        </Td>
                        <Td className="text-xs font-mono text-muted-foreground">
                          #{rep.attemptNumber || 1}
                        </Td>
                        <Td className="font-mono text-xs font-bold text-heading">
                          {num(rep.score, 1)} / {num(rep.maxMarks, 1)}
                        </Td>
                        <Td className="font-mono text-xs font-bold text-accent">
                          {num(rep.percentage, 1)}%
                        </Td>
                        <Td>
                          <Badge
                            tone={isPassed ? 'mustard' : 'neutral'}
                            className="text-[10px] font-bold uppercase"
                          >
                            {rep.resultStatus || 'COMPLETED'}
                          </Badge>
                        </Td>
                        <Td>
                          {rep.warningsCount > 0 ? (
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                              <ShieldAlert className="size-3.5" />
                              {rep.warningsCount}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <CheckCircle2 className="size-3.5 text-emerald-500" />
                              Clean
                            </span>
                          )}
                        </Td>
                        <Td align="right" className="pr-6">
                          {/* STRICT RULE: View Report ONLY. NO DELETE OR ARCHIVE OPTION. */}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onViewReport(rep.id)}
                            className="flex items-center gap-1 text-xs font-semibold py-1 px-2.5"
                          >
                            <Eye className="size-3.5 text-accent" />
                            View Report
                          </Button>
                        </Td>
                      </Tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </TableWrap>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-6 py-3.5 text-xs text-muted-foreground">
              <span>
                Showing {Math.min((page - 1) * limit + 1, totalCount)} to{' '}
                {Math.min(page * limit, totalCount)} of {totalCount} reports
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-8 px-2.5 text-xs"
                >
                  Previous
                </Button>
                <span className="px-2 font-mono font-bold text-heading">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 px-2.5 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
