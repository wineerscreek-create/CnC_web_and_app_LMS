'use client';

import * as React from 'react';
import {
  MessageSquare,
  Sparkles,
  Star,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Filter,
  Search,
  Building2,
  GraduationCap,
  ShieldCheck,
  TrendingUp,
  BarChart3,
  Globe,
  FileText,
  AlertCircle,
  MessageCircle,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardBody, CardHeader, CardTitle, CardSubtitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/lib/api';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';

interface FeedbackItem {
  id: string;
  feedback_type: 'PLATFORM' | 'COURSE';
  display_name: string;
  email?: string;
  user_category: string;
  rating: number;
  text: string;
  suggestions?: string;
  greeting_message?: string;
  testimonial_text?: string;
  course_id?: string;
  course_title?: string;
  public_display_consent: boolean;
  moderation_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'HIDDEN';
  is_published_to_homepage: boolean;
  published_at?: string;
  moderator_note?: string;
  created_at: string;
  updated_at: string;
}

export default function SuperAdminFeedbackPage() {
  const [activeTab, setActiveTab] = React.useState<
    'all' | 'platform' | 'course' | 'pending' | 'approved' | 'rejected_hidden' | 'analytics'
  >('all');
  const [search, setSearch] = React.useState('');
  const [ratingFilter, setRatingFilter] = React.useState<string>('all');
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  // Note editor modal
  const [noteModalItem, setNoteModalItem] = React.useState<FeedbackItem | null>(null);
  const [noteText, setNoteText] = React.useState('');

  const summaryQuery = useApi<any>('/feedback/admin/summary');
  const analyticsQuery = useApi<any>('/feedback/admin/analytics', undefined, {
    enabled: activeTab === 'analytics',
  });

  const listQuery = useApi<any>(
    `/feedback/admin/list?tab=${activeTab}&search=${encodeURIComponent(search)}` +
      (ratingFilter !== 'all' ? `&rating=${ratingFilter}` : ''),
    undefined,
    { enabled: activeTab !== 'analytics' }
  );

  const summary = summaryQuery.data || {
    totalPlatformReviews: 0,
    totalCourseReviews: 0,
    totalReviews: 0,
    pendingReviews: 0,
    approvedReviews: 0,
    rejectedReviews: 0,
    publishedTestimonials: 0,
    averagePlatformRating: 5.0,
    averageCourseRating: 5.0,
    totalSuggestions: 0,
  };

  const handleModerate = async (
    item: FeedbackItem,
    action: 'APPROVE' | 'REJECT' | 'HIDE' | 'RESTORE'
  ) => {
    setActionLoading(`${item.id}-${action}`);
    try {
      await api.post(`/feedback/admin/${item.feedback_type}/${item.id}/moderate`, {
        action,
      });
      toast.success(`Review ${action.toLowerCase()}d successfully.`);
      listQuery.refetch();
      summaryQuery.refetch();
    } catch (err) {
      toast.error((err as ApiError).message || 'Moderation action failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleHomepage = async (item: FeedbackItem) => {
    if (!item.public_display_consent && !item.is_published_to_homepage) {
      toast.error('Cannot feature testimonial without user consent for public display.');
      return;
    }
    if (item.moderation_status !== 'APPROVED' && !item.is_published_to_homepage) {
      toast.error('Review must be APPROVED before featuring on homepage.');
      return;
    }

    const nextState = !item.is_published_to_homepage;
    setActionLoading(`${item.id}-homepage`);
    try {
      await api.post(`/feedback/admin/${item.feedback_type}/${item.id}/publish`, {
        isPublished: nextState,
      });
      toast.success(
        nextState ? 'Testimonial featured on homepage!' : 'Testimonial removed from homepage.'
      );
      listQuery.refetch();
      summaryQuery.refetch();
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to update homepage status.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveNote = async () => {
    if (!noteModalItem) return;
    setActionLoading(`note-${noteModalItem.id}`);
    try {
      await api.post(`/feedback/admin/${noteModalItem.feedback_type}/${noteModalItem.id}/moderate`, {
        action: noteModalItem.moderation_status === 'APPROVED' ? 'APPROVE' : noteModalItem.moderation_status === 'REJECTED' ? 'REJECT' : 'RESTORE',
        internalNote: noteText.trim(),
      });
      toast.success('Internal moderation note saved.');
      setNoteModalItem(null);
      listQuery.refetch();
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to save note.');
    } finally {
      setActionLoading(null);
    }
  };

  const statusTone: Record<string, any> = {
    APPROVED: 'success',
    PENDING: 'warning',
    REJECTED: 'danger',
    HIDDEN: 'neutral',
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Super Admin', href: '/super-admin' },
          { label: 'Feedback & Testimonials' },
        ]}
        title="Feedback & Testimonial Management"
        description="Moderate platform reviews, audit course feedback, manage homepage publication, and analyze student satisfaction."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                summaryQuery.refetch();
                if (activeTab === 'analytics') analyticsQuery.refetch();
                else listQuery.refetch();
              }}
            >
              Refresh Data
            </Button>
          </div>
        }
      />

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="p-4 bg-card/85">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Reviews</span>
          <p className="mt-1 font-heading text-2xl font-extrabold text-heading">{summary.totalReviews}</p>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">{summary.totalPlatformReviews} Platform · {summary.totalCourseReviews} Course</span>
        </Card>

        <Card className="p-4 bg-amber-500/5 border-amber-500/30">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Pending Approval</span>
          <p className="mt-1 font-heading text-2xl font-extrabold text-amber-600 dark:text-amber-400">{summary.pendingReviews}</p>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">Awaiting review</span>
        </Card>

        <Card className="p-4 bg-emerald-500/5 border-emerald-500/30">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Approved Reviews</span>
          <p className="mt-1 font-heading text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{summary.approvedReviews}</p>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">Quality verified</span>
        </Card>

        <Card className="p-4 bg-accent/5 border-accent/30">
          <span className="text-[11px] font-bold uppercase tracking-wider text-accent">Homepage Featured</span>
          <p className="mt-1 font-heading text-2xl font-extrabold text-accent">{summary.publishedTestimonials}</p>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">Visible to public</span>
        </Card>

        <Card className="p-4 bg-card/85">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Avg Platform Score</span>
          <p className="mt-1 font-heading text-2xl font-extrabold text-heading flex items-center gap-1">
            {summary.averagePlatformRating} <Star className="size-4 fill-amber-500 text-amber-500 inline" />
          </p>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">Out of 5.0</span>
        </Card>

        <Card className="p-4 bg-card/85">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Suggestions Logged</span>
          <p className="mt-1 font-heading text-2xl font-extrabold text-heading">{summary.totalSuggestions}</p>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">Pedagogy ideas</span>
        </Card>
      </div>

      {/* TABS NAVIGATION */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-muted p-1 text-xs">
          {[
            { id: 'all', label: 'All Feedback' },
            { id: 'platform', label: 'Platform Reviews' },
            { id: 'course', label: 'Course Feedback' },
            { id: 'pending', label: `Pending Approval (${summary.pendingReviews})` },
            { id: 'approved', label: 'Approved Testimonials' },
            { id: 'rejected_hidden', label: 'Rejected / Hidden' },
            { id: 'analytics', label: 'Analytics' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`rounded-lg px-3.5 py-1.5 font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-card text-foreground shadow-xs border border-border font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab !== 'analytics' && (
          <div className="flex items-center gap-2 text-xs">
            <div className="relative">
              <Search className="size-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reviewer, text, course..."
                className="rounded-xl border border-border bg-card pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
              />
            </div>

            <select
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value)}
              className="rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
            >
              <option value="all">All Ratings</option>
              <option value="5">5 Stars</option>
              <option value="4">4 Stars</option>
              <option value="3">3 Stars</option>
              <option value="2">2 Stars</option>
              <option value="1">1 Star</option>
            </select>
          </div>
        )}
      </div>

      {/* TAB CONTENT: ANALYTICS */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {analyticsQuery.loading ? (
            <div className="h-64 rounded-3xl bg-muted/40 animate-pulse border border-border" />
          ) : analyticsQuery.data ? (
            <div className="grid gap-6 md:grid-cols-2">
              {/* Platform Rating Distribution */}
              <Card elevated className="p-6">
                <CardHeader className="p-0 pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="size-4 text-primary" /> Platform Rating Breakdown
                  </CardTitle>
                </CardHeader>
                <CardBody className="p-0 space-y-2.5 text-xs">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const row = (analyticsQuery.data.platformRatingDistribution ?? []).find(
                      (r: any) => r.rating === star
                    );
                    const count = row ? Number(row.count) : 0;
                    const total = summary.totalPlatformReviews || 1;
                    const pct = Math.round((count / total) * 100);

                    return (
                      <div key={star} className="flex items-center gap-3">
                        <span className="w-12 font-bold text-heading flex items-center gap-1">
                          {star} <Star className="size-3 fill-amber-500 text-amber-500" />
                        </span>
                        <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-16 text-right font-mono text-muted-foreground">{count} ({pct}%)</span>
                      </div>
                    );
                  })}
                </CardBody>
              </Card>

              {/* Course Rating Distribution */}
              <Card elevated className="p-6">
                <CardHeader className="p-0 pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="size-4 text-secondary" /> Course Rating Breakdown
                  </CardTitle>
                </CardHeader>
                <CardBody className="p-0 space-y-2.5 text-xs">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const row = (analyticsQuery.data.courseRatingDistribution ?? []).find(
                      (r: any) => r.rating === star
                    );
                    const count = row ? Number(row.count) : 0;
                    const total = summary.totalCourseReviews || 1;
                    const pct = Math.round((count / total) * 100);

                    return (
                      <div key={star} className="flex items-center gap-3">
                        <span className="w-12 font-bold text-heading flex items-center gap-1">
                          {star} <Star className="size-3 fill-amber-500 text-amber-500" />
                        </span>
                        <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-16 text-right font-mono text-muted-foreground">{count} ({pct}%)</span>
                      </div>
                    );
                  })}
                </CardBody>
              </Card>

              {/* Top Courses by Feedback Volume */}
              <Card elevated className="p-6 md:col-span-2">
                <CardHeader className="p-0 pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <GraduationCap className="size-4 text-primary" /> Course Satisfaction &amp; Feedback Volume
                  </CardTitle>
                </CardHeader>
                <CardBody className="p-0">
                  <div className="divide-y divide-border text-xs">
                    {(analyticsQuery.data.courseBreakdown ?? []).map((c: any) => (
                      <div key={c.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-heading text-sm">{c.title}</p>
                          <p className="text-muted-foreground text-[11px]">
                            {c.review_count} verified participant reviews
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Course Avg</span>
                            <span className="font-bold text-heading flex items-center gap-1">
                              {c.avg_rating ?? '5.0'} <Star className="size-3 fill-amber-500 text-amber-500" />
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Trainer Avg</span>
                            <span className="font-bold text-heading flex items-center gap-1">
                              {c.avg_trainer_rating ?? '5.0'} <Star className="size-3 fill-amber-500 text-amber-500" />
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            </div>
          ) : null}
        </div>
      )}

      {/* TAB CONTENT: FEEDBACK LIST */}
      {activeTab !== 'analytics' && (
        <div className="space-y-4">
          {listQuery.loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-36 rounded-2xl bg-muted/40 animate-pulse border border-border" />
              ))}
            </div>
          ) : listQuery.data?.items && listQuery.data.items.length > 0 ? (
            <div className="space-y-4">
              {listQuery.data.items.map((item: FeedbackItem) => {
                const isActioning = actionLoading?.startsWith(item.id);

                return (
                  <Card key={item.id} elevated className="p-5 space-y-4">
                    {/* Header Row */}
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3.5">
                      <div className="flex items-start gap-3">
                        <div className="size-10 rounded-xl bg-muted flex items-center justify-center font-bold text-heading border border-border">
                          {item.display_name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm text-heading">{item.display_name}</h3>
                            <span className="text-[11px] text-muted-foreground font-mono">
                              ({item.email || 'Anonymous'})
                            </span>
                            <Badge tone="neutral" className="text-[10px]">
                              {item.user_category}
                            </Badge>
                            <Badge tone={item.feedback_type === 'PLATFORM' ? 'mustard' : 'charcoal'} className="text-[10px]">
                              {item.feedback_type}
                            </Badge>
                          </div>
                          {item.course_title && (
                            <p className="text-xs text-primary font-semibold mt-0.5">
                              Course: {item.course_title}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Rating stars */}
                        <div className="flex items-center gap-1 text-amber-500 mr-2">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`size-3.5 ${
                                i < item.rating ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/30'
                              }`}
                            />
                          ))}
                        </div>

                        {/* Moderation Status */}
                        <Badge tone={statusTone[item.moderation_status] || 'neutral'} className="text-xs font-bold">
                          {item.moderation_status}
                        </Badge>

                        {/* Homepage badge */}
                        {item.is_published_to_homepage && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 border border-accent/40 px-2 py-0.5 text-[10px] font-bold text-foreground">
                            <Globe className="size-3 text-accent" />
                            Homepage
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Review text & Suggestions */}
                    <div className="space-y-2 text-xs">
                      <p className="text-foreground leading-relaxed font-medium">&ldquo;{item.text}&rdquo;</p>

                      {item.suggestions && (
                        <div className="rounded-xl bg-muted/40 p-2.5 border border-border/80 text-[11px]">
                          <strong className="text-heading">Improvement Suggestion:</strong>{' '}
                          <span className="text-muted-foreground">{item.suggestions}</span>
                        </div>
                      )}

                      {item.greeting_message && (
                        <p className="text-[11px] text-muted-foreground italic border-l-2 border-accent/40 pl-2">
                          Trainer greeting: {item.greeting_message}
                        </p>
                      )}

                      {item.moderator_note && (
                        <div className="rounded-xl bg-amber-500/10 p-2.5 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300">
                          <strong>Internal Moderation Note:</strong> {item.moderator_note}
                        </div>
                      )}
                    </div>

                    {/* Actions Row */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs">
                      <div className="flex items-center gap-3 text-muted-foreground text-[11px]">
                        <span>Submitted {formatDate(item.created_at)}</span>
                        <span>·</span>
                        <span className={item.public_display_consent ? 'text-emerald-500 font-medium' : 'text-muted-foreground'}>
                          {item.public_display_consent ? 'Public consent granted' : 'No public consent'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Note Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setNoteModalItem(item);
                            setNoteText(item.moderator_note || '');
                          }}
                          className="rounded-xl text-xs"
                        >
                          <FileText className="size-3.5 mr-1" />
                          Note
                        </Button>

                        {/* Approve */}
                        {item.moderation_status !== 'APPROVED' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={actionLoading === `${item.id}-APPROVE`}
                            disabled={Boolean(actionLoading)}
                            onClick={() => handleModerate(item, 'APPROVE')}
                            className="rounded-xl text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:border-emerald-500"
                          >
                            <CheckCircle2 className="size-3.5 mr-1 text-emerald-500" />
                            Approve
                          </Button>
                        )}

                        {/* Reject */}
                        {item.moderation_status !== 'REJECTED' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={actionLoading === `${item.id}-REJECT`}
                            disabled={Boolean(actionLoading)}
                            onClick={() => handleModerate(item, 'REJECT')}
                            className="rounded-xl text-xs font-semibold text-destructive hover:border-destructive"
                          >
                            <XCircle className="size-3.5 mr-1 text-destructive" />
                            Reject
                          </Button>
                        )}

                        {/* Hide / Restore */}
                        {item.moderation_status === 'APPROVED' ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={actionLoading === `${item.id}-HIDE`}
                            disabled={Boolean(actionLoading)}
                            onClick={() => handleModerate(item, 'HIDE')}
                            className="rounded-xl text-xs"
                          >
                            <EyeOff className="size-3.5 mr-1" />
                            Hide
                          </Button>
                        ) : item.moderation_status === 'HIDDEN' ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={actionLoading === `${item.id}-RESTORE`}
                            disabled={Boolean(actionLoading)}
                            onClick={() => handleModerate(item, 'RESTORE')}
                            className="rounded-xl text-xs"
                          >
                            <Eye className="size-3.5 mr-1" />
                            Restore
                          </Button>
                        ) : null}

                        {/* Homepage Publication Toggle */}
                        {item.moderation_status === 'APPROVED' && item.public_display_consent && (
                          <Button
                            variant={item.is_published_to_homepage ? 'secondary' : 'primary'}
                            size="sm"
                            loading={actionLoading === `${item.id}-homepage`}
                            disabled={Boolean(actionLoading)}
                            onClick={() => handleToggleHomepage(item)}
                            className="rounded-xl text-xs font-bold"
                          >
                            <Globe className="size-3.5 mr-1" />
                            {item.is_published_to_homepage ? 'Remove from Homepage' : 'Feature on Homepage'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 bg-muted/20 rounded-3xl border border-border">
              <p className="text-muted-foreground text-sm">No feedback matching your filters.</p>
            </div>
          )}
        </div>
      )}

      {/* Internal Moderation Note Dialog */}
      {noteModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <h3 className="font-heading font-bold text-base text-heading">
              Internal Moderation Note
            </h3>
            <p className="text-xs text-muted-foreground">
              Add private notes for staff audit trail regarding review from {noteModalItem.display_name}.
            </p>
            <textarea
              rows={3}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="e.g. Verified with batch attendance records..."
              className="w-full rounded-xl border border-border bg-card p-3 text-xs text-foreground focus:border-accent focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setNoteModalItem(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveNote} loading={Boolean(actionLoading)}>
                Save Note
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

