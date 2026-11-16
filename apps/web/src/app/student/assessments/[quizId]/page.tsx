'use client';

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Send,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Save,
  ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
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
import { CameraFeed } from '@/components/quiz/CameraFeed';
import { QuestionPalette, PaletteItem } from '@/components/quiz/QuestionPalette';
import { useAntiCheat } from '@/hooks/useAntiCheat';

interface QuestionOption {
  id: string;
  text: string;
}

interface AssessmentQuestion {
  id: string;
  text: string;
  image?: string | null;
  marks: number;
  question_type?: 'mcq_single' | 'mcq_multiple' | 'numerical';
  options: QuestionOption[];
}

export default function AssessmentAttemptPage() {
  const params = useParams<{ quizId: string }>();
  const router = useRouter();
  const user = useAppSelector((state) => state.auth.user);
  const { isOnline } = useOffline();

  const query = useApi<any>(`/student/assessments/${params.quizId}`);

  // Examination state
  const [currentIndex, setCurrentIndex] = React.useState<number>(0);
  const [offlineQuiz, setOfflineQuiz] = React.useState<any>(null);
  const [answers, setAnswers] = React.useState<Record<string, any>>({});
  const [reviews, setReviews] = React.useState<Record<string, boolean>>({});
  const [elapsed, setElapsed] = React.useState<number>(0);
  const [remaining, setRemaining] = React.useState<number>(0);
  const [submitting, setSubmitting] = React.useState<boolean>(false);
  const [result, setResult] = React.useState<any>(null);
  const [confirmOpen, setConfirmOpen] = React.useState<boolean>(false);
  const [launchToken, setLaunchToken] = React.useState<string | null>(null);

  const socketRef = React.useRef<WebSocket | null>(null);
  const submittedRef = React.useRef<boolean>(false);
  const questionStartRef = React.useRef<number>(Date.now());

  const quiz = query.data || offlineQuiz;
  const questions: AssessmentQuestion[] = quiz?.questions ?? [];
  const currentQuestion = questions[currentIndex];
  const alreadyDone = Boolean(quiz?.alreadyAttempted || quiz?.attempt);
  const limitSeconds = (quiz?.durationMinutes ?? 30) * 60;
  const settings = quiz?.settings ?? {};
  const cameraRequired = Boolean(settings.camera_required ?? true);
  const fullscreenRequired = Boolean(settings.fullscreen_required ?? true);
  const maxWarnings = Number(settings.max_warnings ?? 3);

  // Initialize launch token and WebSocket
  React.useEffect(() => {
    if (!params.quizId || alreadyDone || result) return;

    async function initLaunchToken() {
      try {
        const res = await api.post(`/student/assessments/${params.quizId}/launch-token`);
        if (res.data?.launchToken) {
          setLaunchToken(res.data.launchToken);
          connectAssessmentSocket(res.data.launchToken);
        }
      } catch (err) {
        console.warn('Could not generate launch token', err);
      }
    }

    initLaunchToken();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [params.quizId, alreadyDone, result]);

  // Connect to native FastAPI WebSocket Hub
  const connectAssessmentSocket = React.useCallback(
    (token: string) => {
      if (typeof window === 'undefined') return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = process.env.NEXT_PUBLIC_API_URL
        ? new URL(process.env.NEXT_PUBLIC_API_URL).host
        : window.location.host;
      const wsUrl = `${protocol}//${host}/api/v1/assessments/${params.quizId}/ws`;

      try {
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          // Authenticate immediately upon connection
          ws.send(JSON.stringify({ type: 'auth', token }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'ack' && msg.data?.remaining_seconds != null) {
              setRemaining(msg.data.remaining_seconds);
            } else if (msg.event === 'quiz_end') {
              toast.error('The supervisor has concluded this assessment. Submitting now...');
              void submitAssessment('forced_by_admin');
            }
          } catch (e) {
            // Ignore parse errors
          }
        };

        ws.onerror = (err) => {
          console.warn('Assessment WebSocket connection notice:', err);
        };
      } catch (err) {
        console.warn('Failed to establish assessment WebSocket', err);
      }
    },
    [params.quizId]
  );

  // Heartbeat every 15 seconds to resync authoritative timer
  React.useEffect(() => {
    if (alreadyDone || result) return;

    const interval = setInterval(() => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ event: 'heartbeat', id: Date.now() }));
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [alreadyDone, result]);

  // Load from Dexie IndexedDB if offline or initial query failed
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

  // Initialize countdown timer
  React.useEffect(() => {
    if (quiz && remaining === 0) {
      const initialRemaining = Math.max(0, limitSeconds - elapsed);
      setRemaining(initialRemaining);
    }
  }, [quiz, limitSeconds, elapsed, remaining]);

  // Active countdown timer decrement
  React.useEffect(() => {
    if (alreadyDone || result || !quiz) return;

    const timer = setInterval(() => {
      setElapsed((val) => val + 1);
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          void submitAssessment('auto_timeout');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [alreadyDone, result, quiz]);

  // Instant Answer Saving
  const saveCurrentDraft = React.useCallback(
    async (overrideAnswer?: any, markReview?: boolean) => {
      if (!currentQuestion) return;
      const qid = currentQuestion.id;
      const currentAns = overrideAnswer !== undefined ? overrideAnswer : answers[qid];

      // 1. Update local IndexedDB draft
      if (user?.id) {
        const compoundId = `${user.id}_${params.quizId}`;
        offlineDB.assessmentDrafts
          .put({
            id: compoundId,
            userId: user.id,
            quizId: params.quizId,
            answers: { ...answers, [qid]: currentAns },
            elapsedSeconds: elapsed,
            updatedAt: new Date().toISOString(),
          })
          .catch(() => {});
      }

      // 2. Transmit to server if online
      if (isOnline) {
        api
          .post(`/student/assessments/${params.quizId}/draft-answer`, {
            questionId: qid,
            answer: currentAns,
            markedForReview: markReview !== undefined ? markReview : reviews[qid],
          })
          .catch(() => {});

        // 3. Notify real-time WebSocket of progress
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(
            JSON.stringify({
              event: 'answer_saved',
              data: {
                question_id: qid,
                current_index: currentIndex,
              },
            })
          );
        }
      }
    },
    [currentQuestion, answers, reviews, elapsed, user?.id, params.quizId, isOnline, currentIndex]
  );

  // Autosave interval every 5 seconds
  React.useEffect(() => {
    if (alreadyDone || result || !currentQuestion) return;
    const interval = setInterval(() => {
      void saveCurrentDraft();
    }, 5000);
    return () => clearInterval(interval);
  }, [alreadyDone, result, currentQuestion, saveCurrentDraft]);

  // Submission handler
  const submitAssessment = React.useCallback(
    async (reason = 'manual') => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);

      const deviceId =
        typeof window !== 'undefined'
          ? localStorage.getItem('skillsharp_device_id') ||
            (() => {
              const id = crypto.randomUUID();
              localStorage.setItem('skillsharp_device_id', id);
              return id;
            })()
          : undefined;

      // Handle offline submission
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
          setResult({ score: 'Pending Sync', offline: true, percentage: 0, passed: true });
          toast.success('Assessment attempt saved offline. It will synchronize automatically when online.');
        } catch (err: any) {
          toast.error(err?.message || 'Failed to save offline attempt.');
        } finally {
          setSubmitting(false);
          setConfirmOpen(false);
        }
        return;
      }

      // Online submission
      try {
        const formattedAnswers = Object.entries(answers).map(([questionId, ans]) => {
          if (Array.isArray(ans)) {
            return { questionId, selectedOptions: ans };
          }
          if (typeof ans === 'string' && !isNaN(Number(ans)) && questions.find(q => q.id === questionId)?.question_type === 'numerical') {
            return { questionId, numericalAnswer: ans };
          }
          return { questionId, optionId: ans };
        });

        const response = await api.post(`/student/assessments/${params.quizId}/attempts`, {
          answers: formattedAnswers,
          durationSeconds: elapsed,
          deviceId,
          warnings: [],
        });

        setResult(response.data);
        toast.success(`Assessment submitted! Score: ${response.data.score}/${response.data.maxScore ?? 100}`);

        // Notify socket
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(
            JSON.stringify({
              event: 'submit',
              data: {
                reason,
                score: response.data.score,
                passed: response.data.passed,
              },
            })
          );
        }

        // Clean up local draft
        if (user?.id) {
          await offlineDB.assessmentDrafts.delete(`${user.id}_${params.quizId}`);
        }
      } catch (err: any) {
        if (err?.status === 0 || err?.code === 'NETWORK_ERROR') {
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
          setResult({ score: 'Pending Sync', offline: true, percentage: 0, passed: true });
          toast.success('Connection interrupted. Assessment attempt queued in outbox for automatic sync.');
        } else {
          toast.error((err as ApiError).message || 'Submission failed');
        }
      } finally {
        setSubmitting(false);
        setConfirmOpen(false);
      }
    },
    [isOnline, params.quizId, answers, elapsed, user?.id, user?.institutionId, questions]
  );

  // Wire full Anti-Cheat Subsystem
  const { warningCount, requestFullscreen } = useAntiCheat({
    enabled: !submitting && !alreadyDone && !result && Boolean(quiz),
    quizId: params.quizId,
    fullscreenRequired,
    maxWarnings,
    onAutoSubmit: (reason) => submitAssessment(reason),
  });

  // Relay Camera Snapshots over WebSocket
  const handleCameraSnapshot = React.useCallback(
    (base64Frame: string) => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            event: 'camera_snapshot',
            data: {
              snapshot: base64Frame,
              timestamp: Date.now(),
            },
          })
        );
      }
    },
    []
  );

  // Navigation actions
  const handleJump = (index: number) => {
    void saveCurrentDraft();
    setCurrentIndex(index);
    questionStartRef.current = Date.now();
  };

  const handleNext = () => {
    void saveCurrentDraft();
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      questionStartRef.current = Date.now();
    }
  };

  const handlePrev = () => {
    void saveCurrentDraft();
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      questionStartRef.current = Date.now();
    }
  };

  const toggleMarkReview = () => {
    if (!currentQuestion) return;
    const qid = currentQuestion.id;
    const nextVal = !reviews[qid];
    setReviews((prev) => ({ ...prev, [qid]: nextVal }));
    void saveCurrentDraft(undefined, nextVal);
  };

  // Option selection logic
  const handleOptionSelect = (optionId: string) => {
    if (!currentQuestion) return;
    const qid = currentQuestion.id;
    const qtype = currentQuestion.question_type || 'mcq_single';

    if (qtype === 'mcq_multiple') {
      const currentList: string[] = Array.isArray(answers[qid]) ? answers[qid] : [];
      const nextList = currentList.includes(optionId)
        ? currentList.filter((id) => id !== optionId)
        : [...currentList, optionId];
      setAnswers((prev) => ({ ...prev, [qid]: nextList }));
      void saveCurrentDraft(nextList);
    } else {
      setAnswers((prev) => ({ ...prev, [qid]: optionId }));
      void saveCurrentDraft(optionId);
    }
  };

  const handleNumericalChange = (value: string) => {
    if (!currentQuestion) return;
    const qid = currentQuestion.id;
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  };

  // Build question palette metadata
  const palette: PaletteItem[] = React.useMemo(() => {
    return questions.map((q, idx) => {
      const hasAns =
        answers[q.id] !== undefined &&
        answers[q.id] !== null &&
        (Array.isArray(answers[q.id]) ? answers[q.id].length > 0 : String(answers[q.id]).trim().length > 0);

      let status: 'answered' | 'marked_for_review' | 'not_visited' = 'not_visited';
      if (reviews[q.id]) {
        status = 'marked_for_review';
      } else if (hasAns) {
        status = 'answered';
      }

      return {
        id: q.id,
        index: idx,
        status,
      };
    });
  }, [questions, answers, reviews]);

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
        <div className="mx-auto max-w-6xl p-4">
          <PageHeader
            breadcrumbs={[
              { label: 'Assessments', href: '/student/assessments' },
              { label: data.title },
            ]}
            title={data.title}
            description={`${questions.length} question(s) · ${data.durationMinutes} minutes`}
            actions={
              !alreadyDone && !result ? (
                <div className="flex items-center gap-3">
                  {warningCount > 0 && (
                    <Badge tone="danger">
                      <ShieldAlert className="size-3" aria-hidden />
                      Warning {warningCount}/{maxWarnings}
                    </Badge>
                  )}
                  <Badge tone={remaining < 300 ? 'danger' : 'indigo'}>
                    <Clock className="size-3" aria-hidden />
                    {duration(remaining)} left
                  </Badge>
                </div>
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

          {/* Results Summary if already completed */}
          {(alreadyDone || result) && (
            <Card className="mt-4">
              <CardHeader>
                <div>
                  <CardTitle>Assessment Result</CardTitle>
                  <CardSubtitle>
                    {result?.offline
                      ? 'Completed offline — Queued in outbox for automatic sync'
                      : `Scored ${result?.score ?? data.attempt?.score ?? '—'} / ${result?.maxScore ?? data.maxScore ?? 100}`}
                  </CardSubtitle>
                </div>
                <div className="text-right">
                  <p className="tnum text-2xl font-bold">
                    {result?.percentage ?? data.attempt?.percentage ?? '—'}%
                  </p>
                  <span
                    className={cn(
                      'inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded',
                      result?.passed ?? data.attempt?.passed
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-red-100 text-red-800'
                    )}
                  >
                    {result?.passed ?? data.attempt?.passed ? 'PASSED' : 'NOT PASSED'}
                  </span>
                </div>
              </CardHeader>
              <CardBody>
                <p className="text-sm text-ink-2">
                  Your assessment has been officially recorded. Answers and performance metrics are secured on the LMS server.
                </p>
              </CardBody>
            </Card>
          )}

          {/* Proctored Sequential Exam Engine */}
          {!alreadyDone && !result && currentQuestion && (
            <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-4">
              {/* Main Question Display (3 Columns) */}
              <div className="space-y-4 lg:col-span-3">
                <Card>
                  <CardHeader className="flex justify-between items-center border-b border-line pb-3">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                        Question {currentIndex + 1} of {questions.length}
                      </span>
                      <h2 className="text-base font-semibold text-ink-1 mt-0.5">
                        {currentQuestion.text}
                      </h2>
                    </div>
                    <Badge tone="indigo">
                      {currentQuestion.marks} Mark{currentQuestion.marks === 1 ? '' : 's'}
                    </Badge>
                  </CardHeader>

                  <CardBody className="pt-4">
                    {/* Progress Bar */}
                    <div className="w-full bg-line rounded-full h-1.5 mb-6">
                      <div
                        className="bg-primary h-1.5 rounded-full transition-all duration-300"
                        style={{
                          width: `${((currentIndex + 1) / Math.max(1, questions.length)) * 100}%`,
                        }}
                      />
                    </div>

                    {/* Question Image if present */}
                    {currentQuestion.image && (
                      <div className="mb-4 overflow-hidden rounded-md border border-line">
                        <img
                          src={currentQuestion.image}
                          alt="Question Illustration"
                          className="max-h-64 object-contain mx-auto"
                        />
                      </div>
                    )}

                    {/* Question Answer Inputs */}
                    <div className="space-y-2.5 mb-6">
                      {currentQuestion.question_type === 'numerical' ? (
                        <div className="max-w-xs">
                          <label className="block text-xs font-medium text-ink-2 mb-1.5">
                            Enter Numerical Answer:
                          </label>
                          <input
                            type="text"
                            value={answers[currentQuestion.id] || ''}
                            onChange={(e) => handleNumericalChange(e.target.value)}
                            onBlur={() => void saveCurrentDraft()}
                            placeholder="Type numerical answer..."
                            className="w-full rounded-md border border-line bg-app px-3.5 py-2 text-sm focus:border-primary focus:outline-hidden"
                          />
                        </div>
                      ) : (
                        currentQuestion.options.map((option) => {
                          const isMultiple = currentQuestion.question_type === 'mcq_multiple';
                          const isSelected = isMultiple
                            ? Array.isArray(answers[currentQuestion.id]) &&
                              answers[currentQuestion.id].includes(option.id)
                            : answers[currentQuestion.id] === option.id;

                          return (
                            <label
                              key={option.id}
                              className={cn(
                                'flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors',
                                isSelected
                                  ? 'border-primary bg-primary/10 text-primary-foreground font-medium'
                                  : 'border-line hover:bg-card-hover'
                              )}
                            >
                              <input
                                type={isMultiple ? 'checkbox' : 'radio'}
                                name={currentQuestion.id}
                                value={option.id}
                                checked={isSelected}
                                onChange={() => handleOptionSelect(option.id)}
                                className="mt-0.5 size-4 shrink-0 accent-primary"
                              />
                              <span className="text-sm leading-relaxed">
                                <b className="mr-1">{option.id}.</b> {option.text}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>

                    {/* Navigation Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handlePrev}
                          disabled={currentIndex === 0}
                        >
                          <ChevronLeft className="size-4" />
                          Previous
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void saveCurrentDraft()}
                        >
                          <Save className="size-3.5" />
                          Save
                        </Button>
                        <Button
                          variant={reviews[currentQuestion.id] ? 'primary' : 'secondary'}
                          size="sm"
                          onClick={toggleMarkReview}
                          className={reviews[currentQuestion.id] ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}
                        >
                          <Bookmark className="size-3.5" />
                          {reviews[currentQuestion.id] ? 'Marked' : 'Mark Review'}
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleNext}
                          disabled={currentIndex >= questions.length - 1}
                        >
                          Next
                          <ChevronRight className="size-4" />
                        </Button>
                      </div>

                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setConfirmOpen(true)}
                        disabled={submitting}
                      >
                        <Send className="size-3.5" />
                        Submit Assessment
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              </div>

              {/* Sidebar: Camera Feed & Question Palette (1 Column) */}
              <div className="space-y-4">
                {cameraRequired && (
                  <CameraFeed
                    required={cameraRequired}
                    captureSnapshots={true}
                    quizId={params.quizId}
                    onSnapshot={handleCameraSnapshot}
                  />
                )}
                <QuestionPalette
                  palette={palette}
                  currentIndex={currentIndex}
                  onJump={handleJump}
                  disabled={submitting}
                />
              </div>
            </div>
          )}

          {/* Confirmation Modal */}
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Submit this assessment?"
            description={`You have answered ${Object.keys(answers).length} of ${questions.length} question(s). Assessments can only be submitted once.`}
            confirmLabel="Confirm & Submit"
            onConfirm={() => submitAssessment('manual')}
            pending={submitting}
          />
        </div>
      )}
    </AsyncSection>
  );
}
