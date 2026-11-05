'use client';

import {
  CalendarClock,
  ClipboardList,
  FileUp,
  PlayCircle,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';

function AssignmentSubmitDialog({
  assignment,
  open,
  onOpenChange,
  onDone,
}: {
  assignment: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [note, setNote] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit() {
    if (!note.trim() && !file) {
      toast.error('Add a note or attach a file before submitting.');
      return;
    }
    setPending(true);
    try {
      const form = new FormData();
      form.append('note', note);
      if (file) form.append('file', file);
      const response = await api.upload(
        `/student/assignments/${assignment.id}/submit`,
        form,
      );
      toast.success(response.message ?? 'Submitted');
      onOpenChange(false);
      onDone();
    } catch (caught) {
      toast.error((caught as ApiError).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border shadow-card rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold font-heading text-heading">
            Submit: {assignment.title}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="Note for your trainer" htmlFor="note">
            <Textarea
              id="note"
              rows={4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What you did, and anything your trainer should know…"
              className="bg-card border-input focus:ring-2 focus:ring-ring text-foreground rounded-xl text-sm"
            />
          </Field>
          <div>
            <label htmlFor="assignment-file" className="mb-1.5 block text-xs font-semibold text-heading">
              Attach a file (optional, up to 25 MB)
            </label>
            <input
              id="assignment-file"
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full rounded-xl border border-input bg-card text-foreground px-3 py-2 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:px-3 file:py-1 file:text-xs file:font-semibold hover:file:bg-primary/90 cursor-pointer"
            />
          </div>
        </DialogBody>
        <DialogFooter className="pt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={pending} onClick={submit} className="flex items-center gap-1.5">
            <Upload className="size-3.5" aria-hidden />
            Submit Work
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AssessmentsPage() {
  const quizzes = useApi<any[]>('/student/assessments');
  const assignments = useApi<any[]>('/student/assignments');
  const [submitting, setSubmitting] = React.useState<any>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assessments"
        description="Formal quizzes, evaluation tests, and assignments assigned by your faculty trainers."
      />

      <Tabs defaultValue="quizzes">
        <div className="mb-5">
          <TabsList className="bg-muted p-1 rounded-2xl border border-border">
            <TabsTrigger
              value="quizzes"
              className="rounded-xl px-4 py-1.5 text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs text-muted-foreground"
            >
              Quizzes &amp; Tests
            </TabsTrigger>
            <TabsTrigger
              value="assignments"
              className="rounded-xl px-4 py-1.5 text-xs font-semibold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs text-muted-foreground"
            >
              Assignments
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="quizzes">
          <AsyncSection query={quizzes} skeleton="cards" isEmpty={(rows) => rows.length === 0}>
            {(rows) => (
              <div className="grid gap-5 lg:grid-cols-2">
                {rows.map((quiz) => {
                  const open = quiz.state === 'available' || quiz.state === 'open';
                  return (
                    <Card
                      key={quiz.id}
                      className="border-border bg-card shadow-card transition-all duration-300 hover:shadow-card hover:-translate-y-0.5"
                    >
                      <CardBody className="p-5 flex flex-col h-full">
                        <div className="flex items-start justify-between gap-3">
                          <span className="flex size-10 items-center justify-center rounded-2xl bg-muted text-primary border border-border">
                            <ClipboardList className="size-5" aria-hidden />
                          </span>
                          <StatusBadge status={quiz.state} />
                        </div>
                        <h2 className="mt-3.5 text-base font-bold font-heading text-heading">{quiz.title}</h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {quiz.questions} question(s) · {quiz.durationMinutes} minutes
                        </p>
                        <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CalendarClock className="size-3.5" aria-hidden />
                          Open {formatDate(quiz.opensAt)} — closes {formatDate(quiz.closesAt)}
                        </p>

                        <div className="mt-auto pt-4">
                          {quiz.myScore != null ? (
                            <div className="flex items-center justify-between rounded-xl bg-muted/40 border border-border px-4 py-3">
                              <span className="text-xs font-semibold text-muted-foreground">Your Score</span>
                              <span className="tnum text-base font-bold font-mono text-heading">
                                {quiz.myScore}
                                <span className="text-xs font-semibold text-muted-foreground">
                                  /{quiz.maxScore}
                                </span>
                              </span>
                            </div>
                          ) : (
                            <Button asChild variant="primary" size="sm" className="w-full flex items-center justify-center gap-1.5">
                              <Link href={`/student/assessments/${quiz.id}`}>
                                <PlayCircle className="size-4" aria-hidden />
                                {open ? 'Start Assessment' : 'View Assessment'}
                              </Link>
                            </Button>
                          )}
                        </div>
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
            )}
          </AsyncSection>
        </TabsContent>

        <TabsContent value="assignments">
          <AsyncSection query={assignments} skeleton="table" isEmpty={(rows) => rows.length === 0}>
            {(rows) => (
              <div className="space-y-4">
                {rows.map((assignment) => {
                  const overdue =
                    assignment.state === 'pending' &&
                    typeof assignment.daysLeft === 'number' &&
                    assignment.daysLeft < 0;
                  return (
                    <Card
                      key={assignment.id}
                      className="border-border bg-card shadow-card transition-all duration-300 hover:shadow-card"
                    >
                      <CardHeader className="pb-3 border-b border-border">
                        <div className="min-w-0">
                          <CardTitle className="text-base font-bold font-heading text-heading">{assignment.title}</CardTitle>
                          <CardSubtitle className="text-xs text-muted-foreground">
                            {assignment.trainerName} · {assignment.trainingModuleName} ·{' '}
                            {assignment.batchName}
                          </CardSubtitle>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StatusBadge status={assignment.state} />
                          {overdue && <Badge tone="neutral" className="bg-foreground text-card">Overdue</Badge>}
                        </div>
                      </CardHeader>
                      <CardBody className="pt-4">
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {assignment.description}
                        </p>
                        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                          <span
                            className={cn(
                              'flex items-center gap-1.5 font-medium',
                              overdue ? 'font-semibold text-heading' : 'text-muted-foreground',
                            )}
                          >
                            <CalendarClock className="size-3.5 text-accent" aria-hidden />
                            Due {formatDate(assignment.dueAt, true)}
                            {typeof assignment.daysLeft === 'number' &&
                              ` · ${assignment.daysLeft >= 0 ? `${assignment.daysLeft} day(s) left` : `${Math.abs(assignment.daysLeft)} day(s) late`}`}
                          </span>
                          <span className="text-muted-foreground font-medium">Max Score: {assignment.maxScore}</span>
                        </div>

                        {assignment.submission ? (
                          <div className="mt-4 rounded-xl bg-muted/40 border border-border p-4">
                            <p className="text-xs font-semibold text-heading">
                              Submitted {formatDate(assignment.submission.submittedAt, true)}
                            </p>
                            {assignment.submission.note && (
                              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                                {assignment.submission.note}
                              </p>
                            )}
                            {assignment.submission.grade != null ? (
                              <p className="tnum mt-2 text-sm font-bold font-mono text-heading">
                                Graded: {assignment.submission.grade}/{assignment.maxScore}
                                {assignment.submission.feedback && (
                                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                                    {assignment.submission.feedback}
                                  </span>
                                )}
                              </p>
                            ) : (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Waiting for your trainer evaluation.
                              </p>
                            )}
                          </div>
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            className="mt-4 flex items-center gap-1.5"
                            disabled={assignment.status === 'closed' && overdue}
                            onClick={() => setSubmitting(assignment)}
                          >
                            <FileUp className="size-3.5" aria-hidden />
                            Submit Work
                          </Button>
                        )}
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
            )}
          </AsyncSection>
        </TabsContent>
      </Tabs>

      {submitting && (
        <AssignmentSubmitDialog
          assignment={submitting}
          open={Boolean(submitting)}
          onOpenChange={(open) => !open && setSubmitting(null)}
          onDone={() => {
            setSubmitting(null);
            assignments.refetch();
          }}
        />
      )}
    </div>
  );
}
