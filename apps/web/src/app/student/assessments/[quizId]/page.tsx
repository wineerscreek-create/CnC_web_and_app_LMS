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
  Maximize2,
  Lock,
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
import { getAssessmentWsUrl } from '@/lib/quiz/ws';

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

interface RevealData {
  question_id: string;
  correct_options: string[];
  correct_answer?: string;
  explanation?: string;
}

export default function AssessmentAttemptPage() {
  const params = useParams<{ quizId: string }>();
  const router = useRouter();
  const user = useAppSelector((state) => state.auth.user);
  const { isOnline } = useOffline();

  const query = useApi<any>(`/student/assessments/${params.quizId}`);

  // Examination state
  const [started, setStarted] = React.useState<boolean>(false);
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

  // Timed Questions state
  const [questionPhase, setQuestionPhase] = React.useState<'answering' | 'revealing'>('answering');
  const [questionTimeLeft, setQuestionTimeLeft] = React.useState<number>(10);
  const [revealedAnswers, setRevealedAnswers] = React.useState<Record<string, RevealData>>({});
  const [serverStartTime, setServerStartTime] = React.useState<number | null>(null);
  const [serverTimeOffset, setServerTimeOffset] = React.useState<number>(0);

  const socketRef = React.useRef<WebSocket | null>(null);
  const submittedRef = React.useRef<boolean>(false);
  const questionStartRef = React.useRef<number>(Date.now());
  const currentIndexRef = React.useRef<number>(0);
  const revealedAnswersRef = React.useRef<Record<string, RevealData>>({});
  const answersRef = React.useRef<Record<string, any>>({});
  const submitAssessmentRef = React.useRef<(reason?: string) => Promise<void>>(() => Promise.resolve());

  const quiz = query.data || offlineQuiz;
  const questions: AssessmentQuestion[] = React.useMemo(() => quiz?.questions ?? [], [quiz?.questions]);
  const currentQuestion = questions[currentIndex];
  const alreadyDone = Boolean(quiz?.alreadyAttempted || quiz?.attempt);
  const limitSeconds = (quiz?.durationMinutes ?? 30) * 60;
  const settings = quiz?.settings ?? {};

  // Settings parsing
  const cameraRequired = Boolean(settings.camera_required ?? true);
  const fullscreenRequired = Boolean(settings.fullscreen_required ?? true);
  const maxWarnings = Number(settings.max_warnings ?? 3);

  // Timed question settings
  const enableTimedQuestions = Boolean(settings.enable_timed_questions);
  const questionDuration = Math.max(2, Number(settings.question_duration || 10));
  const answerRevealDuration = Math.max(1, Number(settings.answer_reveal_duration || 2));
  const answeringDuration = Math.max(1, questionDuration - answerRevealDuration);
  const autoAdvance = settings.auto_advance !== false;
  const allowPrevious = enableTimedQuestions ? Boolean(settings.allow_previous) : true;
  const allowModification = enableTimedQuestions ? Boolean(settings.allow_modification) : true;

  // Connect to native FastAPI WebSocket Hub
  const connectAssessmentSocket = React.useCallback(
    (token: string) => {
      if (typeof window === 'undefined') return;

      const wsUrl = getAssessmentWsUrl(params.quizId);

      try {
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'auth', token }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'ack' && msg.data?.remaining_seconds != null) {
              setRemaining(msg.data.remaining_seconds);
            } else if (msg.event === 'quiz_end') {
              toast.error('The supervisor has concluded this assessment. Submitting now...');
              void submitAssessmentRef.current('forced_by_admin');
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
  }, [params.quizId, alreadyDone, result, connectAssessmentSocket]);

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

  // Keep refs synchronized to prevent stale closures in timers
  React.useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  React.useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

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
          answersRef.current = draft.answers;
          if (draft.elapsedSeconds) setElapsed(draft.elapsedSeconds);
        }
      });
    }
  }, [query.data, user?.id, params.quizId]);

  // Auto-resume existing attempt if student previously started on server
  React.useEffect(() => {
    if (!query.data || alreadyDone || result || started) return;

    const qData = query.data;
    if (qData.hasStarted) {
      setStarted(true);

      // Restore saved answers from server
      if (qData.answers && typeof qData.answers === 'object') {
        setAnswers((prev) => ({ ...qData.answers, ...prev }));
        answersRef.current = { ...qData.answers, ...answersRef.current };
      }

      // Initialize authoritative timing state from server
      if (qData.timingState) {
        const ts = qData.timingState;
        const sOffset = new Date(ts.server_time).getTime() - Date.now();
        const sStart = new Date(ts.started_at).getTime();
        setServerTimeOffset(sOffset);
        setServerStartTime(sStart);

        if (ts.is_completed) {
          void submitAssessmentRef.current('timed_completed');
        } else if (enableTimedQuestions) {
          const idx = Math.min(Math.max(0, questions.length - 1), ts.current_question_index || 0);
          currentIndexRef.current = idx;
          setCurrentIndex(idx);
          setQuestionPhase(ts.phase === 'revealing' ? 'revealing' : 'answering');
          setQuestionTimeLeft(ts.phase_remaining_seconds ?? answeringDuration);
        }
      }
    }
  }, [
    query.data,
    alreadyDone,
    result,
    started,
    enableTimedQuestions,
    questions.length,
    answeringDuration,
  ]);

  // Initialize overall quiz countdown timer
  React.useEffect(() => {
    if (quiz && remaining === 0) {
      const initialRemaining = Math.max(0, limitSeconds - elapsed);
      setRemaining(initialRemaining);
    }
  }, [quiz, limitSeconds, elapsed, remaining]);

  // Overall countdown timer decrement (only for non-timed mode after student started)
  React.useEffect(() => {
    if (enableTimedQuestions || !started || alreadyDone || result || !quiz) return;

    const timer = setInterval(() => {
      setElapsed((val) => val + 1);
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          void submitAssessmentRef.current('auto_timeout');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [enableTimedQuestions, started, alreadyDone, result, quiz]);

  // Fetch question reveal data from backend securely
  const fetchQuestionReveal = React.useCallback(
    async (qid: string) => {
      if (revealedAnswersRef.current[qid]) return;
      try {
        const res = await api.post(`/student/assessments/${params.quizId}/questions/${qid}/reveal`);
        if (res.data) {
          revealedAnswersRef.current = { ...revealedAnswersRef.current, [qid]: res.data };
          setRevealedAnswers((prev) => ({ ...prev, [qid]: res.data }));
        }
      } catch (err) {
        console.warn('Could not fetch question reveal', err);
      }
    },
    [params.quizId]
  );

  // Authoritative High-Precision Wall-Clock Timing Engine for Timed Questions
  React.useEffect(() => {
    if (
      !enableTimedQuestions ||
      !started ||
      alreadyDone ||
      result ||
      !serverStartTime ||
      questions.length === 0
    ) {
      return;
    }

    const tick = () => {
      if (submittedRef.current) return;

      const nowServerMs = Date.now() + serverTimeOffset;
      const totalElapsedSec = Math.max(0, (nowServerMs - serverStartTime) / 1000);
      const totalExamSeconds = questions.length * questionDuration;

      // Check if total assessment time has elapsed
      if (totalElapsedSec >= totalExamSeconds) {
        void submitAssessmentRef.current('timed_completed');
        return;
      }

      const calculatedIdx = Math.min(questions.length - 1, Math.floor(totalElapsedSec / questionDuration));
      const timeInCurrentQ = totalElapsedSec % questionDuration;

      const inRevealPhase = timeInCurrentQ >= answeringDuration;
      const nextPhase: 'answering' | 'revealing' = inRevealPhase ? 'revealing' : 'answering';
      const phaseSecondsLeft = inRevealPhase
        ? Math.max(0, Math.ceil(questionDuration - timeInCurrentQ))
        : Math.max(0, Math.ceil(answeringDuration - timeInCurrentQ));

      setQuestionPhase(nextPhase);
      setQuestionTimeLeft(phaseSecondsLeft);

      // Automatic Question Advancement without manual user interaction
      if (calculatedIdx !== currentIndexRef.current) {
        if (autoAdvance) {
          currentIndexRef.current = calculatedIdx;
          setCurrentIndex(calculatedIdx);
        }
      }

      // In reveal phase: fetch reveal for active question if not yet loaded
      const activeQ = questions[calculatedIdx];
      if (inRevealPhase && activeQ && !revealedAnswersRef.current[activeQ.id]) {
        void fetchQuestionReveal(activeQ.id);
      }
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [
    enableTimedQuestions,
    started,
    alreadyDone,
    result,
    serverStartTime,
    serverTimeOffset,
    questions,
    questionDuration,
    answeringDuration,
    autoAdvance,
    fetchQuestionReveal,
  ]);

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
    if (!started || alreadyDone || result || !currentQuestion) return;
    const interval = setInterval(() => {
      void saveCurrentDraft();
    }, 5000);
    return () => clearInterval(interval);
  }, [started, alreadyDone, result, currentQuestion, saveCurrentDraft]);

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
          if (
            typeof ans === 'string' &&
            !isNaN(Number(ans)) &&
            questions.find((q) => q.id === questionId)?.question_type === 'numerical'
          ) {
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
  submitAssessmentRef.current = submitAssessment;

  // Wire Anti-Cheat Subsystem
  const { warningCount, requestFullscreen } = useAntiCheat({
    enabled: started && !submitting && !alreadyDone && !result && Boolean(quiz),
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

  // Start Assessment handler
  const handleStartAssessment = async () => {
    if (fullscreenRequired) {
      void requestFullscreen();
    }
    try {
      const res = await api.post(`/student/assessments/${params.quizId}/start`);
      if (res.data?.timingState) {
        const ts = res.data.timingState;
        const sOffset = new Date(ts.server_time).getTime() - Date.now();
        const sStart = new Date(ts.started_at).getTime();
        setServerTimeOffset(sOffset);
        setServerStartTime(sStart);

        if (enableTimedQuestions) {
          const idx = Math.min(Math.max(0, questions.length - 1), ts.current_question_index || 0);
          currentIndexRef.current = idx;
          setCurrentIndex(idx);
          setQuestionPhase(ts.phase === 'revealing' ? 'revealing' : 'answering');
          setQuestionTimeLeft(ts.phase_remaining_seconds ?? answeringDuration);
        }
      } else {
        setServerStartTime(Date.now());
      }
    } catch (err) {
      console.warn('Could not register attempt start on server', err);
      setServerStartTime(Date.now());
    }
    setStarted(true);
    questionStartRef.current = Date.now();
  };

  // Navigation actions
  const handleJump = (index: number) => {
    if (enableTimedQuestions && !allowPrevious && index < currentIndex) {
      toast.error('Previous questions are locked in timed mode');
      return;
    }
    void saveCurrentDraft();
    setCurrentIndex(index);
    questionStartRef.current = Date.now();
  };

  const handleNext = () => {
    if (questionPhase === 'revealing') {
      toast.info('Please wait for reveal phase to conclude');
      return;
    }
    void saveCurrentDraft();
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      questionStartRef.current = Date.now();
    }
  };

  const handlePrev = () => {
    if (enableTimedQuestions && !allowPrevious) {
      toast.error('Previous navigation is disabled for this timed assessment');
      return;
    }
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
    if (questionPhase === 'revealing') return; // Locked during reveal
    if (enableTimedQuestions && !allowModification && answers[currentQuestion.id] !== undefined) {
      toast.error('Modifying answered questions is locked');
      return;
    }

    const qid = currentQuestion.id;
    const qtype = currentQuestion.question_type || 'mcq_single';

    if (qtype === 'mcq_multiple') {
      const currentList: string[] = Array.isArray(answers[qid]) ? answers[qid] : [];
      const nextList = currentList.includes(optionId)
        ? currentList.filter((id) => id !== optionId)
        : [...currentList, optionId];
      setAnswers((prev) => ({ ...prev, [qid]: nextList }));
      answersRef.current = { ...answersRef.current, [qid]: nextList };
      void saveCurrentDraft(nextList);
    } else {
      setAnswers((prev) => ({ ...prev, [qid]: optionId }));
      answersRef.current = { ...answersRef.current, [qid]: optionId };
      void saveCurrentDraft(optionId);
    }
  };

  const handleNumericalChange = (value: string) => {
    if (!currentQuestion || questionPhase === 'revealing') return;
    const qid = currentQuestion.id;
    setAnswers((prev) => ({ ...prev, [qid]: value }));
    answersRef.current = { ...answersRef.current, [qid]: value };
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

  // Reveal info for current question
  const currentReveal = currentQuestion ? revealedAnswers[currentQuestion.id] : null;

  return (
    <AsyncSection query={effectiveQuery} skeleton="detail">
      {(data) => (
        <div className="mx-auto max-w-6xl p-3 sm:p-6 pb-24 sm:pb-28">
          <PageHeader
            breadcrumbs={[
              { label: 'Assessments', href: '/student/assessments' },
              { label: data.title },
            ]}
            title={data.title}
            description={`${questions.length} question(s) · ${data.durationMinutes} minutes`}
            actions={
              !alreadyDone && !result && started ? (
                <div className="flex items-center gap-2 sm:gap-3">
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

                  {/* Compact Mobile Camera Header Preview */}
                  {cameraRequired && (
                    <div className="sm:hidden">
                      <CameraFeed
                        required={cameraRequired}
                        captureSnapshots={true}
                        quizId={params.quizId}
                        compact={true}
                        onSnapshot={handleCameraSnapshot}
                        className="h-10 w-14 rounded-md border border-line"
                      />
                    </div>
                  )}
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

          {/* Pre-Flight Start Screen */}
          {!alreadyDone && !result && !started && (
            <Card className="mt-6 max-w-xl mx-auto shadow-md">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-xl">Ready to Begin Assessment?</CardTitle>
                <CardSubtitle>
                  Please review examination guidelines and check your camera feed before proceeding.
                </CardSubtitle>
              </CardHeader>
              <CardBody className="space-y-4 pt-4">
                {cameraRequired && (
                  <div className="flex flex-col items-center">
                    <span className="text-xs font-semibold text-ink-2 mb-2">Camera Feed Verification:</span>
                    <CameraFeed
                      required={cameraRequired}
                      captureSnapshots={false}
                      quizId={params.quizId}
                    />
                  </div>
                )}

                <div className="rounded-lg bg-card-hover p-3 text-xs space-y-2 border border-line">
                  <div className="flex items-center gap-2 font-medium text-ink-1">
                    <Maximize2 className="size-4 text-primary shrink-0" />
                    <span>Fullscreen mode will be engaged automatically.</span>
                  </div>
                  {enableTimedQuestions && (
                    <div className="flex items-center gap-2 font-medium text-amber-600 dark:text-amber-400">
                      <Clock className="size-4 shrink-0" />
                      <span>
                        Timed Questions: {answeringDuration}s to answer each question, followed by {answerRevealDuration}s answer reveal.
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-ink-3">
                    <AlertTriangle className="size-4 text-amber-500 shrink-0" />
                    <span>Exiting fullscreen, tab-switching, or turning off camera triggers proctoring warnings.</span>
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  className="w-full text-base font-semibold mt-2"
                  onClick={handleStartAssessment}
                >
                  <Maximize2 className="mr-2 size-4" />
                  Start Assessment &amp; Enter Fullscreen
                </Button>
              </CardBody>
            </Card>
          )}

          {/* Active Proctored Sequential Exam Engine */}
          {!alreadyDone && !result && started && currentQuestion && (
            <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-4">
              {/* Main Question Display (3 Columns) */}
              <div className="space-y-4 lg:col-span-3">
                <Card className="relative overflow-hidden">
                  {/* Timed Question Header Bar */}
                  {enableTimedQuestions && (
                    <div className="border-b border-line bg-app px-4 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'size-2.5 rounded-full animate-pulse',
                            questionPhase === 'answering' ? 'bg-primary' : 'bg-amber-500'
                          )}
                        />
                        <span className="text-xs font-bold uppercase tracking-wider text-ink-1">
                          {questionPhase === 'answering' ? 'Answering Phase' : 'Answer Reveal Phase'}
                        </span>
                      </div>
                      <Badge tone={questionPhase === 'answering' ? 'indigo' : 'amber'}>
                        <Clock className="size-3 mr-1" />
                        {questionTimeLeft}s remaining
                      </Badge>
                    </div>
                  )}

                  <CardHeader className="flex justify-between items-center border-b border-line pb-3">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                        Question {currentIndex + 1} of {questions.length}
                      </span>
                      <h2 className="text-base sm:text-lg font-semibold text-ink-1 mt-0.5">
                        {currentQuestion.text}
                      </h2>
                    </div>
                    <Badge tone="indigo">
                      {currentQuestion.marks} Mark{currentQuestion.marks === 1 ? '' : 's'}
                    </Badge>
                  </CardHeader>

                  <CardBody className="pt-4">
                    {/* Progress Bar (Overall or Per-Question) */}
                    <div className="w-full bg-line rounded-full h-1.5 mb-5 overflow-hidden">
                      {enableTimedQuestions ? (
                        <div
                          className={cn(
                            'h-1.5 rounded-full transition-all duration-1000 ease-linear',
                            questionPhase === 'answering' ? 'bg-primary' : 'bg-amber-500'
                          )}
                          style={{
                            width: `${(questionTimeLeft / (questionPhase === 'answering' ? answeringDuration : answerRevealDuration)) * 100}%`,
                          }}
                        />
                      ) : (
                        <div
                          className="bg-primary h-1.5 rounded-full transition-all duration-300"
                          style={{
                            width: `${((currentIndex + 1) / Math.max(1, questions.length)) * 100}%`,
                          }}
                        />
                      )}
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
                            disabled={questionPhase === 'revealing' || submitting}
                            value={answers[currentQuestion.id] || ''}
                            onChange={(e) => handleNumericalChange(e.target.value)}
                            onBlur={() => void saveCurrentDraft()}
                            placeholder="Type numerical answer..."
                            className="w-full rounded-md border border-line bg-app px-3.5 py-2 text-sm focus:border-primary focus:outline-hidden disabled:opacity-60"
                          />
                        </div>
                      ) : (
                        currentQuestion.options.map((option) => {
                          const isMultiple = currentQuestion.question_type === 'mcq_multiple';
                          const isSelected = isMultiple
                            ? Array.isArray(answers[currentQuestion.id]) &&
                              answers[currentQuestion.id].includes(option.id)
                            : answers[currentQuestion.id] === option.id;

                          // Reveal phase highlight styles
                          let revealStyle = '';
                          if (questionPhase === 'revealing' && currentReveal) {
                            const isCorrectOpt = currentReveal.correct_options.includes(option.id);
                            if (isCorrectOpt) {
                              revealStyle =
                                'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500 font-bold';
                            } else if (isSelected && !isCorrectOpt) {
                              revealStyle =
                                'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200 ring-1 ring-red-400 font-medium';
                            } else {
                              revealStyle = 'opacity-50 border-line';
                            }
                          }

                          return (
                            <label
                              key={option.id}
                              className={cn(
                                'flex items-start gap-3 rounded-lg border p-3.5 transition-all text-sm',
                                questionPhase === 'revealing' ? 'cursor-default' : 'cursor-pointer hover:bg-card-hover',
                                isSelected && questionPhase !== 'revealing'
                                  ? 'border-primary bg-primary/10 text-primary-foreground font-medium'
                                  : 'border-line',
                                revealStyle
                              )}
                            >
                              <input
                                type={isMultiple ? 'checkbox' : 'radio'}
                                name={currentQuestion.id}
                                value={option.id}
                                checked={isSelected}
                                disabled={questionPhase === 'revealing' || submitting}
                                onChange={() => handleOptionSelect(option.id)}
                                className="mt-0.5 size-4 shrink-0 accent-primary"
                              />
                              <span className="leading-relaxed">
                                <b className="mr-1">{option.id}.</b> {option.text}
                              </span>

                              {/* Reveal badge */}
                              {questionPhase === 'revealing' && currentReveal && (
                                <span className="ml-auto text-xs font-semibold shrink-0">
                                  {currentReveal.correct_options.includes(option.id) ? (
                                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                      <CheckCircle2 className="size-3.5" /> Correct
                                    </span>
                                  ) : isSelected ? (
                                    <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                                      <XCircle className="size-3.5" /> Selected
                                    </span>
                                  ) : null}
                                </span>
                              )}
                            </label>
                          );
                        })
                      )}
                    </div>

                    {/* Reveal Explanation if in reveal phase */}
                    {questionPhase === 'revealing' && currentReveal?.explanation && (
                      <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-xs text-emerald-800 dark:text-emerald-200 mb-4 animate-in fade-in">
                        <span className="font-bold block mb-1">Explanation:</span>
                        {currentReveal.explanation}
                      </div>
                    )}
                  </CardBody>
                </Card>
              </div>

              {/* Sidebar: Desktop Camera Feed & Question Palette (1 Column) */}
              <div className="space-y-4">
                {cameraRequired && (
                  <div className="hidden sm:block">
                    <CameraFeed
                      required={cameraRequired}
                      captureSnapshots={true}
                      quizId={params.quizId}
                      onSnapshot={handleCameraSnapshot}
                    />
                  </div>
                )}
                <QuestionPalette
                  palette={palette}
                  currentIndex={currentIndex}
                  onJump={handleJump}
                  disabled={submitting || (enableTimedQuestions && questionPhase === 'revealing')}
                  allowPrevious={allowPrevious}
                />
              </div>
            </div>
          )}

          {/* Sticky Bottom Navigation Bar for Mobile and Desktop */}
          {!alreadyDone && !result && started && currentQuestion && (
            <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-card/95 backdrop-blur-md px-3 py-2.5 sm:px-6 sm:py-3.5 shadow-xl">
              <div className="mx-auto flex max-w-6xl items-center justify-between gap-2">
                {enableTimedQuestions && autoAdvance && !allowPrevious ? (
                  /* Streamlined Status Bar when Automatic Advancement is Active and Previous Navigation is Disabled */
                  <div className="flex w-full items-center justify-between gap-2 sm:gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-bold text-ink-1">
                        Question {currentIndex + 1} of {questions.length}
                      </span>
                      <span className="hidden sm:inline-flex items-center gap-1 rounded bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-ink-3">
                        <Lock className="size-3" /> Navigation Locked
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shadow-xs',
                          questionPhase === 'answering'
                            ? 'bg-primary/10 text-primary border border-primary/20'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                        )}
                      >
                        <span
                          className={cn(
                            'size-2 rounded-full',
                            questionPhase === 'answering' ? 'bg-primary animate-pulse' : 'bg-amber-500'
                          )}
                        />
                        <span>
                          {questionPhase === 'answering'
                            ? `Answering: ${questionTimeLeft}s`
                            : `Reveal: ${questionTimeLeft}s`}
                        </span>
                      </span>

                      <span className="text-[11px] text-ink-3 font-medium hidden md:inline-block">
                        {questionPhase === 'answering'
                          ? 'Locks on timeout'
                          : currentIndex < questions.length - 1
                          ? 'Advancing to next...'
                          : 'Final submission...'}
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Interactive Navigation Controls for standard / manual quiz modes */
                  <>
                    {/* Left: Previous Button & Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handlePrev}
                        disabled={currentIndex === 0 || (enableTimedQuestions && !allowPrevious) || questionPhase === 'revealing'}
                        className="text-xs sm:text-sm px-2.5 sm:px-3 h-8 sm:h-9"
                        title={enableTimedQuestions && !allowPrevious ? 'Previous navigation locked' : undefined}
                      >
                        <ChevronLeft className="size-4 mr-0.5 sm:mr-1" />
                        <span>Prev</span>
                      </Button>

                      {/* Non-timed Save & Review */}
                      {!enableTimedQuestions && (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void saveCurrentDraft()}
                            className="text-xs px-2 sm:px-3 h-8 sm:h-9"
                          >
                            <Save className="size-3.5 sm:mr-1" />
                            <span className="hidden sm:inline">Save</span>
                          </Button>
                          <Button
                            variant={reviews[currentQuestion.id] ? 'primary' : 'secondary'}
                            size="sm"
                            onClick={toggleMarkReview}
                            className={cn(
                              'text-xs px-2 sm:px-3 h-8 sm:h-9',
                              reviews[currentQuestion.id] && 'bg-amber-500 hover:bg-amber-600 text-white'
                            )}
                          >
                            <Bookmark className="size-3.5 sm:mr-1" />
                            <span className="hidden sm:inline">
                              {reviews[currentQuestion.id] ? 'Marked' : 'Review'}
                            </span>
                          </Button>
                        </>
                      )}
                    </div>

                    {/* Center: Timed Question Status Badge */}
                    {enableTimedQuestions && (
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <span
                          className={cn(
                            'size-2 rounded-full',
                            questionPhase === 'answering' ? 'bg-primary animate-pulse' : 'bg-amber-500'
                          )}
                        />
                        <span className="text-ink-1">
                          {questionPhase === 'answering' ? `${questionTimeLeft}s` : `Reveal (${questionTimeLeft}s)`}
                        </span>
                      </div>
                    )}

                    {/* Right: Next or Submit Button */}
                    <div className="flex items-center gap-2">
                      {currentIndex < questions.length - 1 ? (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleNext}
                          disabled={questionPhase === 'revealing'}
                          className="text-xs sm:text-sm px-3 sm:px-4 h-8 sm:h-9"
                        >
                          <span>Next</span>
                          <ChevronRight className="size-4 ml-0.5 sm:ml-1" />
                        </Button>
                      ) : (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setConfirmOpen(true)}
                          disabled={submitting}
                          className="text-xs sm:text-sm px-3 sm:px-4 h-8 sm:h-9 font-semibold"
                        >
                          <Send className="size-3.5 mr-1" />
                          <span>Submit</span>
                        </Button>
                      )}
                    </div>
                  </>
                )}
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
