'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Star,
  MessageSquare,
  Clock,
  Sparkles,
  RefreshCw,
  ThumbsUp,
  BarChart2,
  Calendar,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { toast } from 'sonner';

interface FeedbackSummary {
  totalSubmissions: number;
  averageOverallRating: number;
  averageQuestionQualityRating: number;
  difficultyDistribution: {
    Easy: number;
    Moderate: number;
    Difficult: number;
  };
  timeDistribution: {
    Sufficient: number;
    Insufficient: number;
  };
}

interface FeedbackItem {
  id: string;
  attemptId: string;
  studentUserId: string;
  studentName: string;
  studentEmail: string;
  rollNumber: string;
  overallRating: number;
  difficulty: string;
  questionQualityRating: number;
  timeManagement: string;
  writtenFeedback: string;
  submittedAt: string | null;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function TrainerAssessmentFeedbackPage() {
  const params = useParams<{ quizId: string }>();
  const router = useRouter();

  const [loading, setLoading] = React.useState<boolean>(true);
  const [refreshing, setRefreshing] = React.useState<boolean>(false);
  const [quizTitle, setQuizTitle] = React.useState<string>('Assessment');
  const [summary, setSummary] = React.useState<FeedbackSummary | null>(null);
  const [items, setItems] = React.useState<FeedbackItem[]>([]);
  const [pagination, setPagination] = React.useState<PaginationData>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  const loadFeedback = React.useCallback(
    async (pageToLoad = 1) => {
      if (!params.quizId) return;
      try {
        const res = await api.get(
          `/trainer/assessments/${params.quizId}/feedback?page=${pageToLoad}&limit=20`
        );
        const data = res.data?.data;
        if (data) {
          setQuizTitle(data.quizTitle || 'Assessment');
          setSummary(data.summary);
          setItems(data.items || []);
          setPagination(
            data.pagination || {
              page: pageToLoad,
              limit: 20,
              total: data.items?.length || 0,
              totalPages: 1,
            }
          );
        }
      } catch (err: any) {
        const msg = err?.response?.data?.message || err?.message || 'Failed to load assessment feedback.';
        toast.error(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [params.quizId]
  );

  React.useEffect(() => {
    loadFeedback(1);
  }, [loadFeedback]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadFeedback(pagination.page);
    toast.success('Feedback data refreshed');
  };

  const getDifficultyBadge = (level: string) => {
    switch (level) {
      case 'Easy':
        return <Badge tone="teal">Easy</Badge>;
      case 'Moderate':
        return <Badge tone="mustard">Moderate</Badge>;
      case 'Difficult':
        return <Badge tone="danger">Difficult</Badge>;
      default:
        return <Badge tone="neutral">{level}</Badge>;
    }
  };

  const getTimeBadge = (status: string) => {
    if (status === 'Sufficient') {
      return (
        <Badge tone="teal" className="flex items-center gap-1">
          Sufficient
        </Badge>
      );
    }
    return (
      <Badge tone="danger" className="flex items-center gap-1">
        Insufficient
      </Badge>
    );
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            className={cn(
              'size-3.5',
              s <= rating ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground/30'
            )}
          />
        ))}
        <span className="ml-1 text-xs font-mono font-semibold text-foreground">{rating}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <PageHeader
        title={`Feedback: ${quizTitle}`}
        description="Comprehensive review metrics, difficulty ratings, and qualitative comments submitted by candidates."
        breadcrumbs={[
          { label: 'Trainer Dashboard', href: '/trainer' },
          { label: 'Assessments', href: '/trainer/assessments' },
          { label: 'Feedback' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="flex items-center gap-1"
            >
              <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
              Refresh
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href="/trainer/assessments" className="flex items-center gap-1.5">
                <ArrowLeft className="size-3.5" />
                Back to Assessments
              </Link>
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="p-12 text-center">
          <RefreshCw className="size-8 mx-auto animate-spin text-primary opacity-60 mb-3" />
          <p className="text-sm text-muted-foreground">Loading assessment feedback metrics...</p>
        </div>
      ) : (
        <>
          {/* Feedback Summary Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* Card 1: Total Submissions */}
            <Card className="border border-border shadow-xs">
              <CardBody className="p-4 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Total Submissions
                </span>
                <p className="text-3xl font-extrabold font-mono text-foreground">
                  {summary?.totalSubmissions || 0}
                </p>
                <span className="text-[11px] text-muted-foreground block">
                  Candidate feedback responses
                </span>
              </CardBody>
            </Card>

            {/* Card 2: Average Overall Rating */}
            <Card className="border border-border shadow-xs">
              <CardBody className="p-4 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Overall Rating
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-3xl font-extrabold font-mono text-amber-500">
                    {summary?.averageOverallRating?.toFixed(1) || '0.0'}
                  </span>
                  <div className="flex items-center">
                    <Star className="size-5 fill-amber-400 text-amber-500" />
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground block">
                  Out of 5.0 maximum stars
                </span>
              </CardBody>
            </Card>

            {/* Card 3: Question Quality Rating */}
            <Card className="border border-border shadow-xs">
              <CardBody className="p-4 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Question Quality
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-3xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                    {summary?.averageQuestionQualityRating?.toFixed(1) || '0.0'}
                  </span>
                  <div className="flex items-center">
                    <Star className="size-5 fill-emerald-500 text-emerald-500" />
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground block">
                  Clarity &amp; syllabus alignment
                </span>
              </CardBody>
            </Card>

            {/* Card 4: Difficulty Distribution */}
            <Card className="border border-border shadow-xs">
              <CardBody className="p-4 space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Difficulty Breakdown
                </span>
                <div className="space-y-1 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Easy:</span>
                    <span className="font-bold">{summary?.difficultyDistribution?.Easy || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-amber-500 font-semibold">Moderate:</span>
                    <span className="font-bold">{summary?.difficultyDistribution?.Moderate || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-rose-500 font-semibold">Difficult:</span>
                    <span className="font-bold">{summary?.difficultyDistribution?.Difficult || 0}</span>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Card 5: Time Distribution */}
            <Card className="border border-border shadow-xs">
              <CardBody className="p-4 space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Time Management
                </span>
                <div className="space-y-1 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Sufficient:</span>
                    <span className="font-bold">{summary?.timeDistribution?.Sufficient || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-rose-500 font-semibold">Insufficient:</span>
                    <span className="font-bold">{summary?.timeDistribution?.Insufficient || 0}</span>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Student Feedback Table */}
          <Card className="border border-border shadow-md overflow-hidden">
            <CardHeader className="p-4 border-b border-border flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="size-4 text-primary" />
                <CardTitle className="text-base font-bold text-foreground">
                  Individual Candidate Feedback
                </CardTitle>
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                Showing {items.length} of {pagination.total} records
              </span>
            </CardHeader>

            <div className="overflow-x-auto">
              {items.length === 0 ? (
                <div className="p-12 text-center space-y-2">
                  <MessageSquare className="size-10 text-muted-foreground/40 mx-auto" />
                  <p className="text-base font-semibold text-foreground">No Feedback Records Found</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    No candidates have submitted feedback for this assessment yet. Feedback will appear here in real time as students complete their submissions.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-3.5">Student Name</th>
                      <th className="p-3.5">Roll Number</th>
                      <th className="p-3.5">Overall Rating</th>
                      <th className="p-3.5">Quiz Difficulty</th>
                      <th className="p-3.5">Question Quality</th>
                      <th className="p-3.5">Time Management</th>
                      <th className="p-3.5 min-w-[200px]">Written Feedback</th>
                      <th className="p-3.5 text-right">Submitted At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((fb) => (
                      <tr key={fb.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3.5 font-semibold text-foreground">
                          {fb.studentName}
                          <span className="block text-[11px] font-normal text-muted-foreground">
                            {fb.studentEmail}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-muted-foreground">
                          {fb.rollNumber || '—'}
                        </td>
                        <td className="p-3.5">
                          {renderStars(fb.overallRating)}
                        </td>
                        <td className="p-3.5">
                          {getDifficultyBadge(fb.difficulty)}
                        </td>
                        <td className="p-3.5">
                          {renderStars(fb.questionQualityRating)}
                        </td>
                        <td className="p-3.5">
                          {getTimeBadge(fb.timeManagement)}
                        </td>
                        <td className="p-3.5 text-foreground leading-relaxed max-w-xs">
                          {fb.writtenFeedback ? (
                            <span className="italic">&ldquo;{fb.writtenFeedback}&rdquo;</span>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                        <td className="p-3.5 text-right font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                          {fb.submittedAt ? formatDate(fb.submittedAt) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination footer */}
            {pagination.totalPages > 1 && (
              <div className="p-3.5 border-t border-border flex items-center justify-between bg-card">
                <span className="text-xs text-muted-foreground">
                  Page <span className="font-semibold text-foreground">{pagination.page}</span> of{' '}
                  <span className="font-semibold text-foreground">{pagination.totalPages}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pagination.page <= 1}
                    onClick={() => loadFeedback(pagination.page - 1)}
                    className="size-8 p-0"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => loadFeedback(pagination.page + 1)}
                    className="size-8 p-0"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
