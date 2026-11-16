'use client';

import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Send, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { duration } from '@/lib/format';
import { useOffline } from '@/context/OfflineContext';
import { useAppSelector } from '@/store';
import { offlineDB, isAuthorizationValid } from '@/lib/offline/db';
import { syncEngine } from '@/lib/offline/syncEngine';

interface Question {
  id: string;
  text: string;
  marks: number;
  options: { id: string; text: string }[];
}

export default function AssessmentAttemptPage() {
  const params = useParams<{ quizId: string }>();
  const user = useAppSelector((state) => state.auth.user);
  const { isOnline } = useOffline();
  const query = useApi<any>(`/student/assessments/${params.quizId}`);

  const [offlineQuiz, setOfflineQuiz] = React.useState<any>(null);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [elapsed, setElapsed] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [warnings, setWarnings] = React.useState<Array<{ type: string; timestamp: string; detail?: string }>>([]);

  // If query failed or offline, load from local IndexedDB
  React.useEffect(() => {
    if (!query.data && user?.id) {
      const compoundId = `${user.id}_${params.quizId}`;
      offlineDB.downloadedQuestionSets.get(compoundId).then((cached) => {
        if (cached && isAuthorizationValid(cached.authorizationExpiresAt)) {
          setOfflineQuiz({
            id: cached.quizId,
            title: cached.title,
            durationMinutes: cached.durationMinutes,
            maxScore: cached.maxScore,
            questions: cached.questions,
            alreadyAttempted: false,
          });
        }
      });
      // Restore draft answers if available
      offlineDB.assessmentDrafts.get(compoundId).then((draft) => {
        if (draft?.answers) {
          setAnswers(draft.answers);
          if (draft.elapsedSeconds) setElapsed(draft.elapsedSeconds);
        }
      });
    }
  }, [query.data, user?.id, params.quizId]);

  // Save drafts locally as user answers questions
  React.useEffect(() => {
    if (user?.id && Object.keys(answers).length > 0 && !result) {
      const compoundId = `${user.id}_${params.quizId}`;
      offlineDB.assessmentDrafts.put({
        id: compoundId,
        userId: user.id,
        quizId: params.quizId,
        answers,
        elapsedSeconds: elapsed,
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }
  }, [answers, elapsed, user?.id, params.quizId, result]);

  const quiz = query.data || offlineQuiz;
  const questions: Question[] = quiz?.questions ?? [];
  const alreadyDone = Boolean(quiz?.alreadyAttempted);
  const limit = (quiz?.durationMinutes ?? 0) * 60;
  const remaining = Math.max(0, limit - elapsed);
  const maxWarnings = quiz?.settings?.max_warnings ?? 3;

  React.useEffect(() => {
    if (alreadyDone || result || !quiz) return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [alreadyDone, result, quiz]);

  const submit = React.useCallback(async () => {
    setSubmitting(true);
    if (!isOnline) {
      try {
        const attemptId = crypto.randomUUID();
        await syncEngine.recordAssessmentAttemptLocally({
          attemptId,
          quizId: params.quizId,
          answers,
          durationSeconds: elapsed,
          eventSequence: [],
          userId: user?.id || 'anonymous',
          institutionId: user?.institutionId || null,
          batchId: null,
        });
        setResult({ score: 'Pending Sync', offline: true });
        toast.success('Assessment attempt saved offline. It will synchronize automatically when online.');
      } catch (err: any) {
        toast.error(err?.message || 'Failed to save offline attempt.');
      } finally {
        setSubmitting(false);
        setConfirmOpen(false);
      }
      return;
    }

    try {
      const deviceId = typeof window !== 'undefined'
        ? (localStorage.getItem('skillsharp_device_id') || (() => {
            const id = crypto.randomUUID();
            localStorage.setItem('skillsharp_device_id', id);
            return id;
          })())
        : undefined;

      const response = await api.post(`/student/assessments/${params.quizId}/attempts`, {
        answers: Object.entries(answers).map(([questionId, optionId]) => ({
          questionId,
          optionId,
        })),
        durationSeconds: elapsed,
        deviceId,
        warnings,
      });
      setResult(response.data);
      toast.success(`Submitted — you scored ${response.data.score}/100`);
      // Clean up local draft upon successful online submission
      if (user?.id) {
        await offlineDB.assessmentDrafts.delete(`${user.id}_${params.quizId}`);
      }
    } catch (caught: any) {
      if (caught?.status === 0 || caught?.code === 'NETWORK_ERROR') {
        // Network failed during submission - fallback to local durable outbox
        const attemptId = crypto.randomUUID();
        await syncEngine.recordAssessmentAttemptLocally({
          attemptId,
          quizId: params.quizId,
          answers,
          durationSeconds: elapsed,
          eventSequence: [],
          userId: user?.id || 'anonymous',
          institutionId: user?.institutionId || null,
          batchId: null,
        });
        setResult({ score: 'Pending Sync', offline: true });
        toast.success('Connection interrupted. Assessment attempt queued in outbox for automatic sync.');
      } else {
        toast.error((caught as ApiError).message);
      }
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }, [answers, elapsed, params.quizId, isOnline, user?.id, user?.institutionId, warnings]);

  // Auto-submit when the clock runs out, so an unfinished paper is still recorded.
  React.useEffect(() => {
    if (!limit || result || alreadyDone || submitting) return;
    if (remaining === 0) void submit();
  }, [remaining, limit, result, alreadyDone, submitting, submit]);

  // Anti-cheat tab switch monitoring
  React.useEffect(() => {
    if (alreadyDone || result || !quiz) return;

    function handleVisibility() {
      if (document.hidden) {
        setWarnings((prev) => {
          const next = [...prev, { type: 'tab_switch', timestamp: new Date().toISOString(), detail: 'Tab switched or backgrounded' }];
          toast.error(`Warning ${next.length}/${maxWarnings}: Tab switching is prohibited during proctored examinations.`);
          if (next.length >= maxWarnings) {
            toast.error('Maximum warnings exceeded. Auto-submitting assessment now.');
            void submit();
          }
          return next;
        });
      }
    }

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [alreadyDone, result, quiz, maxWarnings, submit]);

  const effectiveQuery = React.useMemo(() => {
    if (offlineQuiz) {
      return {
        data: offlineQuiz,
        error: null,
        loading: false,
        initialLoading: false,
        refetch: query.refetch,
      };
    }
    return query;
  }, [offlineQuiz, query]);

  return (
    <AsyncSection query={effectiveQuery} skeleton="detail">
      {(data) => (
        <div className="mx-auto max-w-[760px]">
          <PageHeader
            breadcrumbs={[
              { label: 'Assessments', href: '/student/assessments' },
              { label: data.title },
            ]}
            title={data.title}
            description={`${questions.length} question(s) · ${data.durationMinutes} minutes`}
            actions={
              !alreadyDone && !result ? (
                <Badge tone={remaining < 60 ? 'danger' : 'indigo'}>
                  <Clock className="size-3" aria-hidden />
                  {duration(remaining)} left
                </Badge>
              ) : (
                <Button asChild variant="secondary" size="sm">
                  <Link href="/student/assessments">
                    <ArrowLeft className="size-3.5" aria-hidden />
                    All assessments
                  </Link>
                </Button>
              )
            }
          />

          {(alreadyDone || result) && (
            <Card className="mb-5">
              <CardHeader>
                <div>
                  <CardTitle>Your result</CardTitle>
                  <CardSubtitle>
                    {result
                      ? `${result.earned} of ${result.possible} marks`
                      : 'Submitted earlier'}
                  </CardSubtitle>
                </div>
                <p className="tnum text-[24px] font-bold">
                  {result?.score ?? data.myAttempt?.score ?? '—'}
                  <span className="text-xs font-semibold text-ink-3">/100</span>
                </p>
              </CardHeader>
              <CardBody>
                <ul className="space-y-2.5">
                  {(result?.answers ?? data.myAttempt?.answers ?? []).map((row: any) => {
                    const question = questions.find((item) => item.id === row.questionId);
                    return (
                      <li
                        key={row.questionId}
                        className={cn(
                          'rounded-[10px] border p-3.5',
                          row.correct
                            ? 'border-success-bg bg-success-bg/50'
                            : 'border-danger-bg bg-danger-bg/40',
                        )}
                      >
                        <p className="flex items-start gap-2 text-base font-semibold">
                          {row.correct ? (
                            <CheckCircle2
                              className="mt-0.5 size-4 shrink-0 text-success"
                              aria-hidden
                            />
                          ) : (
                            <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                          )}
                          {question?.text ?? 'Question'}
                        </p>
                        {row.explanation && (
                          <p className="mt-1.5 pl-6 text-sm leading-relaxed text-ink-2">
                            {row.explanation}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          )}

          {!alreadyDone && !result && (
            <>
              <ol className="space-y-4">
                {questions.map((question, index) => (
                  <li key={question.id}>
                    <Card>
                      <CardBody>
                        <fieldset>
                          <legend className="text-md font-semibold">
                            {index + 1}. {question.text}
                            <span className="ml-2 text-xs font-normal text-ink-3">
                              ({question.marks} mark{question.marks === 1 ? '' : 's'})
                            </span>
                          </legend>
                          <div className="mt-3 space-y-2">
                            {question.options.map((option) => (
                              <label
                                key={option.id}
                                className={cn(
                                  'flex cursor-pointer items-start gap-3 rounded-[10px] border p-3 transition-colors',
                                  answers[question.id] === option.id
                                    ? 'border-accent bg-accent/20 text-accent-foreground'
                                    : 'border-line hover:bg-app',
                                )}
                              >
                                <input
                                  type="radio"
                                  name={question.id}
                                  value={option.id}
                                  checked={answers[question.id] === option.id}
                                  onChange={() =>
                                    setAnswers((current) => ({
                                      ...current,
                                      [question.id]: option.id,
                                    }))
                                  }
                                  className="mt-0.5 size-4 shrink-0 accent-[var(--indigo)]"
                                />
                                <span className="min-w-0 flex-1 text-base">{option.text}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      </CardBody>
                    </Card>
                  </li>
                ))}
              </ol>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  loading={submitting}
                  onClick={() => setConfirmOpen(true)}
                  disabled={Object.keys(answers).length === 0}
                >
                  <Send className="size-3.5" aria-hidden />
                  Submit assessment
                </Button>
                <p className="flex items-center gap-1.5 text-sm text-ink-2">
                  {Object.keys(answers).length} of {questions.length} answered
                </p>
              </div>
              {Object.keys(answers).length < questions.length && (
                <p className="mt-2.5 flex items-start gap-2 text-sm text-amber-dark">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Unanswered questions score zero, and the paper can only be submitted once.
                </p>
              )}

              <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title="Submit this assessment?"
                description={`You have answered ${Object.keys(answers).length} of ${questions.length} questions. Assessments can only be submitted once.`}
                confirmLabel="Submit"
                onConfirm={submit}
                pending={submitting}
              />
            </>
          )}
        </div>
      )}
    </AsyncSection>
  );
}
