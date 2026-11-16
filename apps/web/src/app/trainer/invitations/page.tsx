'use client';

import {
  Award,
  BookOpen,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Layers,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/input';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';

interface TrainerCourseInvitation {
  id: string;
  courseId: string;
  courseTitle: string;
  courseCode: string;
  category?: string;
  deliveryMode?: string;
  institutionId?: string | null;
  institutionName?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  batchId?: string | null;
  batchName?: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  notes?: string | null;
  proposedStartDate?: string | null;
  proposedEndDate?: string | null;
  responseNotes?: string | null;
  respondedAt?: string | null;
  createdAt: string;
}

export default function TrainerInvitationsPage() {
  const query = useApi<{ items: TrainerCourseInvitation[] }>('/trainer/course-invitations', undefined, {
    select: (res) => res.data ?? res,
  });

  const [respondingId, setRespondingId] = React.useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = React.useState(false);
  const [selectedInvitation, setSelectedInvitation] = React.useState<TrainerCourseInvitation | null>(null);
  const [declineReason, setDeclineReason] = React.useState('');
  const [declining, setDeclining] = React.useState(false);

  const invitations = query.data?.items ?? [];

  const pendingCount = invitations.filter((i) => i.status === 'PENDING').length;
  const acceptedCount = invitations.filter((i) => i.status === 'ACCEPTED').length;
  const rejectedCount = invitations.filter((i) => i.status === 'REJECTED').length;

  const handleAccept = async (inv: TrainerCourseInvitation) => {
    setRespondingId(inv.id);
    try {
      await api.post(`/trainer/course-invitations/${inv.id}/accept`);
      toast.success(`You have accepted the teaching assignment for "${inv.courseTitle}". Course is now active on your dashboard!`);
      query.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to accept invitation.');
    } finally {
      setRespondingId(null);
    }
  };

  const handleOpenDecline = (inv: TrainerCourseInvitation) => {
    setSelectedInvitation(inv);
    setDeclineReason('');
    setDeclineOpen(true);
  };

  const handleDeclineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvitation) return;
    setDeclining(true);
    try {
      await api.post(`/trainer/course-invitations/${selectedInvitation.id}/reject`, {
        reason: declineReason.trim() || undefined,
      });
      toast.info(`Teaching offer for "${selectedInvitation.courseTitle}" declined.`);
      setDeclineOpen(false);
      query.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to decline invitation.');
    } finally {
      setDeclining(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Course Teaching Invitations"
        description="Review teaching offers proposed to you by Platform Administrators. Accepting an offer activates course curriculum access, batch assignment, and grading tools."
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => query.refetch()}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Pending Offers"
          value={pendingCount}
          icon={<Clock className="size-5 text-amber-500" />}
          hint="Requires your decision"
        />
        <StatCard
          label="Accepted Courses"
          value={acceptedCount}
          icon={<CheckCircle2 className="size-5 text-emerald-500" />}
          hint="Active teaching assignments"
        />
        <StatCard
          label="Declined / Closed"
          value={rejectedCount}
          icon={<XCircle className="size-5 text-slate-400" />}
          hint="Past offers"
        />
      </div>

      {/* Invitations List */}
      <Card>
        <CardHeader className="p-4 border-b border-border flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Award className="size-4 text-indigo-600" />
            Received Invitations
          </CardTitle>
          <Badge tone={pendingCount > 0 ? 'amber' : 'neutral'} dot={pendingCount > 0}>
            {pendingCount} Pending Review
          </Badge>
        </CardHeader>

        <CardBody className="p-4">
          {query.loading ? (
            <div className="py-12 text-center text-muted-foreground text-xs">
              <Loader2 className="size-6 animate-spin mx-auto mb-2 text-primary" />
              Loading your course invitations…
            </div>
          ) : invitations.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <BookOpen className="size-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="font-semibold text-sm text-foreground">No Course Invitations Yet</p>
              <p className="text-xs mt-1">
                When Super Administrators offer you a course teaching assignment, it will appear here for your review and acceptance.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {invitations.map((inv) => {
                const isPending = inv.status === 'PENDING';
                const isAccepted = inv.status === 'ACCEPTED';
                const isRejected = inv.status === 'REJECTED';
                const isWithdrawn = inv.status === 'WITHDRAWN';

                return (
                  <div
                    key={inv.id}
                    className={`rounded-xl border p-4 transition-all ${
                      isPending
                        ? 'border-indigo-300 bg-indigo-50/20 shadow-xs'
                        : isAccepted
                        ? 'border-emerald-200 bg-emerald-50/10'
                        : 'border-border bg-card'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-foreground">{inv.courseTitle}</h3>
                          <Badge tone="indigo" className="font-mono">
                            {inv.courseCode}
                          </Badge>
                          <Badge
                            tone={
                              isAccepted
                                ? 'success'
                                : isPending
                                ? 'amber'
                                : isRejected
                                ? 'danger'
                                : 'neutral'
                            }
                          >
                            {inv.status}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1.5">
                          {inv.institutionName && (
                            <span className="flex items-center gap-1 text-slate-700 font-medium">
                              <Building2 className="size-3.5 text-indigo-500" />
                              {inv.institutionName}
                              {inv.departmentName && ` (${inv.departmentName})`}
                            </span>
                          )}
                          {inv.batchName && (
                            <span className="flex items-center gap-1 font-semibold text-indigo-600">
                              <Layers className="size-3.5" />
                              Batch: {inv.batchName}
                            </span>
                          )}
                          {(inv.proposedStartDate || inv.proposedEndDate) && (
                            <span className="flex items-center gap-1">
                              <Calendar className="size-3.5 text-slate-400" />
                              {inv.proposedStartDate || 'Immediate'} to {inv.proposedEndDate || 'Completion'}
                            </span>
                          )}
                          <span>Offered {formatDate(inv.createdAt)}</span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isPending && (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenDecline(inv)}
                              disabled={respondingId === inv.id}
                              className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                            >
                              Decline
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleAccept(inv)}
                              loading={respondingId === inv.id}
                              className="text-xs flex items-center gap-1 shadow-sm"
                            >
                              <Check className="size-3.5" />
                              Accept Assignment
                            </Button>
                          </>
                        )}

                        {isAccepted && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                              <CheckCircle2 className="size-3.5" />
                              Active Teaching Assignment
                            </span>
                            <Link href="/trainer/course-progress">
                              <Button variant="secondary" size="sm" className="text-xs">
                                Course Workspace
                              </Button>
                            </Link>
                          </div>
                        )}

                        {isRejected && (
                          <span className="text-xs text-muted-foreground italic">
                            Declined {inv.respondedAt ? formatDate(inv.respondedAt) : ''}
                          </span>
                        )}

                        {isWithdrawn && (
                          <span className="text-xs text-muted-foreground italic">Withdrawn by Admin</span>
                        )}
                      </div>
                    </div>

                    {/* Notes block */}
                    {inv.notes && (
                      <div className="mt-3 pt-3 border-t border-border/60 text-xs text-slate-700 bg-muted/40 p-2.5 rounded-lg">
                        <strong className="text-slate-900 font-semibold">Administrator Notes:</strong> {inv.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Decline Reason Dialog */}
      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-700">Decline Course Offer</DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to decline the teaching assignment for{' '}
              <strong>{selectedInvitation?.courseTitle}</strong>?
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleDeclineSubmit} className="space-y-4 pt-2">
            <Field label="Reason (Optional)" htmlFor="dReason">
              <textarea
                id="dReason"
                rows={3}
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g. Schedule conflict, bandwidth limitations, or domain preference…"
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card text-foreground"
              />
            </Field>

            <div className="pt-2 flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDeclineOpen(false)} disabled={declining}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" loading={declining}>
                Confirm Decline
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
