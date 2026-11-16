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
  ShieldAlert,
  Maximize2,
  Save,
  Bookmark,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useApi } from '@/hooks/useApi';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useOffline } from '@/context/OfflineContext';
import { useAppSelector } from '@/store';
import { offlineDB, isAuthorizationValid } from '@/lib/offline/db';
import { syncEngine } from '@/lib/offline/syncEngine';
import { CameraFeed } from '@/components/quiz/CameraFeed';
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

function formatExamTimer(seconds: number): string {
  const safeSec = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safeSec / 60);
  const s = safeSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
  const configuredMinutes = Number(quiz?.durationMinutes || 30);
  const totalExamSeconds = configuredMinutes * 60;
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
            if (msg.type === 'connected' && msg.data?.remaining_seconds != null) {
              setRemaining(msg.data.remaining_seconds);
            } else if (msg.type === 'ack' && msg.data?.remaining_seconds != null) {
              setRemaining(msg.data.remaining_seconds);
            } else if (msg.event === 'quiz_end') {
              toast.error('The supervisor has concluded this assessment. Submitting now...');
              void submitAssessmentRef.current('forced_by_admin');
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onerror = (err) => {
          console.warn('Assessment WebSocket notice:', err);
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

  // Heartbeat every 15 seconds to sync authoritative server timer
  React.useEffect(() => {
    if (alreadyDone || result) return;

    const interval = setInterval(() => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ event: 'heartbeat', id: Date.now() }));
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [alreadyDone, result]);

  // Keep refs synchronized
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
        const sOffset = ts.server_time ? new Date(ts.server_time * 1000).getTime() - Date.now() : 0;
        const sStart = ts.started_at ? new Date(ts.started_at * 1000).getTime() : Date.now();
        setServerTimeOffset(sOffset);
        setServerStartTime(sStart);

        if (ts.remaining_seconds != null) {
          setRemaining(Math.max(0, Math.floor(ts.remaining_seconds)));
        }

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

  // Initialize overall countdown timer from configured duration
  React.useEffect(() => {
    if (quiz && remaining === 0) {
      const initialRemaining = Math.max(0, totalExamSeconds - elapsed);
      setRemaining(initialRemaining);
    }
  }, [quiz, totalExamSeconds, elapsed, remaining]);

  // 1-second countdown clock for overall assessment
  React.useEffect(() => {
    if (!started || alreadyDone || result || !quiz) return;

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
  }, [started, alreadyDone, result, quiz]);

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

  // High-Precision Timing Engine for Timed Questions (internal question phases)
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
      const totalTimedSeconds = questions.length * questionDuration;

      // Check if all timed questions have elapsed
      if (totalElapsedSec >= totalTimedSeconds) {
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

  // Wire Anti-Cheat Subsystem
  const { warningCount, isFullscreen, requestFullscreen, exitFullscreen } = useAntiCheat({
    enabled: started && !submitting && !alreadyDone && !result && Boolean(quiz),
    quizId: params.quizId,
    fullscreenRequired,
    maxWarnings,
    onAutoSubmit: (reason) => submitAssessment(reason),
  });

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
          exitFullscreen();
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
        exitFullscreen();
      }
    },
    [isOnline, params.quizId, answers, elapsed, user?.id, user?.institutionId, questions, exitFullscreen]
  );
  submitAssessmentRef.current = submitAssessment;

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

  // Start Assessment handler: Enters Fullscreen & registers attempt
  const handleStartAssessment = async () => {
    if (fullscreenRequired) {
      void requestFullscreen();
    }
    try {
      const res = await api.post(`/student/assessments/${params.quizId}/start`);
      if (res.data?.timingState) {
        const ts = res.data.timingState;
        const sOffset = ts.server_time ? new Date(ts.server_time * 1000).getTime() - Date.now() : 0;
        const sStart = ts.started_at ? new Date(ts.started_at * 1000).getTime() : Date.now();
        setServerTimeOffset(sOffset);
        setServerStartTime(sStart);

        if (ts.remaining_seconds != null) {
          setRemaining(Math.max(0, Math.floor(ts.remaining_seconds)));
        }

        if (enableTimedQuestions) {
          const idx = Math.min(Math.max(0, questions.length - 1), ts.current_question_index || 0);
          currentIndexRef.current = idx;
          setCurrentIndex(idx);
          setQuestionPhase(ts.phase === 'revealing' ? 'revealing' : 'answering');
          setQuestionTimeLeft(ts.phase_remaining_seconds ?? answeringDuration);
        }
      } else {
        setServerStartTime(Date.now());
        setRemaining(totalExamSeconds);
      }
    } catch (err) {
      console.warn('Could not register attempt start on server', err);
      setServerStartTime(Date.now());
      setRemaining(totalExamSeconds);
    }
    setStarted(true);
    questionStartRef.current = Date.now();
  };

  // Navigation actions (only active in manual navigation mode)
  const handleNext = () => {
    if (questionPhase === 'revealing') return;
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

  const answeredCount = Object.keys(answers).filter(
    (k) => answers[k] !== undefined && answers[k] !== null && String(answers[k]).trim() !== ''
  ).length;

  return (
    <AsyncSection query={effectiveQuery} skeleton="detail">
      {(data) => {
        // SCENARIO 1: Completed Assessment Screen
        if (alreadyDone || result) {
          return (
            <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
              <Card className="max-w-md w-full shadow-2xl border border-border">
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto size-14 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-8" />
                  </div>
                  <CardTitle className="text-xl sm:text-2xl font-bold">Assessment Completed</CardTitle>
                  <CardSubtitle className="mt-1">
                    {result?.offline
                      ? 'Completed offline — Queued in outbox for automatic sync'
                      : `Scored ${result?.score ?? data.attempt?.score ?? '—'} / ${result?.maxScore ?? data.maxScore ?? 100}`}
                  </CardSubtitle>
                </CardHeader>
                <CardBody className="space-y-6 pt-2 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <p className="text-4xl font-extrabold tracking-tight text-foreground font-mono">
                      {result?.percentage ?? data.attempt?.percentage ?? '—'}%
                    </p>
                    <span
                      className={cn(
                        'inline-block mt-2 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider',
                        result?.passed ?? data.attempt?.passed
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30'
                      )}
                    >
                      {result?.passed ?? data.attempt?.passed ? 'PASSED' : 'NOT PASSED'}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    Your assessment has been officially recorded. Answers and anti-cheat telemetry are secured on the LMS server.
                  </p>

                  <Button asChild variant="primary" size="lg" className="w-full">
                    <Link href="/student/assessments">
                      <ArrowLeft className="size-4 mr-2" />
                      Return to Assessments
                    </Link>
                  </Button>
                </CardBody>
              </Card>
            </div>
          );
        }

        // SCENARIO 2: Pre-Flight Start Screen (Clean, Focused Entry)
        if (!started) {
          return (
            <div className="min-h-screen w-full flex items-center justify-center bg-background p-4 sm:p-6">
              <Card className="max-w-xl w-full shadow-2xl border border-border">
                <CardHeader className="text-center pb-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider mb-2 self-center">
                    Official Examination
                  </div>
                  <CardTitle className="text-2xl font-bold tracking-tight text-foreground">{data.title}</CardTitle>
                  <CardSubtitle className="mt-1 text-muted-foreground">
                    {questions.length} Questions · {data.durationMinutes} Minutes Allotted · {data.maxScore ?? 100} Marks
                  </CardSubtitle>
                </CardHeader>
                <CardBody className="space-y-5 pt-4">
                  {/* Camera verification before entering exam */}
                  {cameraRequired && (
                    <div className="flex flex-col items-center">
                      <span className="text-xs font-semibold text-muted-foreground mb-2">
                        Webcam &amp; Proctoring Verification
                      </span>
                      <CameraFeed
                        required={cameraRequired}
                        captureSnapshots={false}
                        quizId={params.quizId}
                      />
                    </div>
                  )}

                  {/* Examination Rules */}
                  <div className="rounded-xl bg-muted/40 p-4 text-xs space-y-2.5 border border-border/80">
                    <div className="flex items-center gap-2.5 font-medium text-foreground">
                      <Maximize2 className="size-4 text-primary shrink-0" />
                      <span>Dedicated fullscreen mode is required during the examination.</span>
                    </div>
                    {enableTimedQuestions && (
                      <div className="flex items-center gap-2.5 font-medium text-amber-600 dark:text-amber-400">
                        <Clock className="size-4 shrink-0" />
                        <span>
                          Timed Questions: {answeringDuration}s answering period, {answerRevealDuration}s answer reveal.
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2.5 text-muted-foreground">
                      <AlertTriangle className="size-4 text-amber-500 shrink-0" />
                      <span>
                        Exiting fullscreen or switching browser tabs will record proctoring warnings.
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full text-base font-semibold py-6 shadow-md"
                    onClick={handleStartAssessment}
                  >
                    <Maximize2 className="mr-2 size-5" />
                    Start Assessment &amp; Enter Fullscreen
                  </Button>
                </CardBody>
              </Card>
            </div>
          );
        }

        // SCENARIO 3: Active Distraction-Free Fullscreen Examination Interface
        return (
          <div className="h-[100dvh] w-full flex flex-col bg-background text-foreground overflow-hidden select-none">
            {/* Top Examination Bar: Exactly 3 items (Question Indicator, Remaining Timer, Submit Action) */}
            <header className="h-14 border-b border-border bg-card/95 px-4 sm:px-6 flex items-center justify-between shrink-0 z-30">
              {/* Left: Question Indicator */}
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-bold text-foreground">
                  Question {currentIndex + 1} of {questions.length}
                </span>
                {warningCount > 0 && (
                  <Badge tone="danger" className="ml-2 hidden sm:inline-flex">
                    <ShieldAlert className="size-3 mr-1" />
                    {warningCount}/{maxWarnings} Warnings
                  </Badge>
                )}
              </div>

              {/* Center: Assessment Remaining Time */}
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm sm:text-base font-mono font-bold tracking-wider',
                    remaining < 180
                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 animate-pulse'
                      : 'bg-muted/60 text-foreground'
                  )}
                  title="Assessment Remaining Time"
                >
                  <Clock className="size-4 text-muted-foreground shrink-0" />
                  <span>{formatExamTimer(remaining)}</span>
                </div>
              </div>

              {/* Right: Submit Assessment Action */}
              <div className="flex items-center gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmOpen(true)}
                  disabled={submitting}
                  className="font-semibold text-xs sm:text-sm px-3 sm:px-4 h-9 shadow-xs"
                >
                  <Send className="size-3.5 mr-1.5" />
                  <span>Submit Assessment</span>
                </Button>
              </div>
            </header>

            {/* Micro-Progress Bar for Timed Questions (Subtle and non-intrusive) */}
            {enableTimedQuestions && (
              <div className="h-1 w-full bg-muted overflow-hidden shrink-0">
                <div
                  className={cn(
                    'h-full transition-all duration-300 ease-linear',
                    questionPhase === 'answering' ? 'bg-primary' : 'bg-amber-500'
                  )}
                  style={{
                    width: `${((questionTimeLeft) / (questionPhase === 'answering' ? answeringDuration : answerRevealDuration)) * 100}%`,
                  }}
                />
              </div>
            )}

            {/* Main Question Area: Occupies most of the screen */}
            <main className="flex-1 min-h-0 overflow-y-auto px-4 py-6 sm:p-8 scroll-thin">
              <div className="max-w-4xl mx-auto w-full pb-24">
                {currentQuestion && (
                  <div className="space-y-6">
                    {/* Question Header & Marks */}
                    <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
                      <h1 className="text-lg sm:text-2xl font-semibold leading-relaxed text-foreground">
                        {currentQuestion.text}
                      </h1>
                      <Badge tone="neutral" className="shrink-0 text-xs font-semibold">
                        +{currentQuestion.marks} Mark{currentQuestion.marks === 1 ? '' : 's'}
                      </Badge>
                    </div>

                    {/* Question Image (if present) */}
                    {currentQuestion.image && (
                      <div className="overflow-hidden rounded-xl border border-border bg-card p-2">
                        <img
                          src={currentQuestion.image}
                          alt="Question Graphic"
                          className="max-h-72 object-contain mx-auto"
                        />
                      </div>
                    )}

                    {/* Answer Options Area */}
                    <div className="space-y-3 pt-2">
                      {currentQuestion.question_type === 'numerical' ? (
                        <div className="max-w-sm space-y-2">
                          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Enter Numerical Answer:
                          </label>
                          <input
                            type="text"
                            disabled={questionPhase === 'revealing' || submitting}
                            value={answers[currentQuestion.id] || ''}
                            onChange={(e) => handleNumericalChange(e.target.value)}
                            onBlur={() => void saveCurrentDraft()}
                            placeholder="Type your numerical answer..."
                            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base focus:border-primary focus:ring-1 focus:ring-primary focus:outline-hidden disabled:opacity-60"
                          />
                        </div>
                      ) : (
                        currentQuestion.options.map((option) => {
                          const isMultiple = currentQuestion.question_type === 'mcq_multiple';
                          const isSelected = isMultiple
                            ? Array.isArray(answers[currentQuestion.id]) &&
                              answers[currentQuestion.id].includes(option.id)
                            : answers[currentQuestion.id] === option.id;

                          // Subtle styling during Answer Reveal phase
                          let revealStyle = '';
                          if (questionPhase === 'revealing' && currentReveal) {
                            const isCorrectOpt = currentReveal.correct_options.includes(option.id);
                            if (isCorrectOpt) {
                              revealStyle =
                                'border-emerald-500 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 ring-2 ring-emerald-500 font-semibold';
                            } else if (isSelected && !isCorrectOpt) {
                              revealStyle =
                                'border-rose-500 bg-rose-500/10 text-rose-950 dark:text-rose-200 ring-2 ring-rose-500 font-medium';
                            } else {
                              revealStyle = 'opacity-40 border-border';
                            }
                          }

                          return (
                            <label
                              key={option.id}
                              className={cn(
                                'flex items-start gap-4 rounded-xl border p-4 transition-all text-sm sm:text-base select-none',
                                questionPhase === 'revealing'
                                  ? 'cursor-default'
                                  : 'cursor-pointer hover:border-primary/60 hover:bg-muted/40',
                                isSelected && questionPhase !== 'revealing'
                                  ? 'border-primary bg-primary/10 text-primary font-medium ring-1 ring-primary'
                                  : 'border-border/80 bg-card',
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
                                className="mt-1 size-4 shrink-0 accent-primary"
                              />
                              <div className="flex-1 leading-relaxed">
                                <span className="font-bold mr-1.5">{option.id}.</span>
                                {option.text}
                              </div>

                              {/* Subtle indicator during answer reveal */}
                              {questionPhase === 'revealing' && currentReveal && (
                                <span className="ml-2 shrink-0 text-xs font-semibold">
                                  {currentReveal.correct_options.includes(option.id) ? (
                                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                      <CheckCircle2 className="size-4" /> Correct
                                    </span>
                                  ) : isSelected ? (
                                    <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                                      <XCircle className="size-4" /> Selected
                                    </span>
                                  ) : null}
                                </span>
                              )}
                            </label>
                          );
                        })
                      )}
                    </div>

                    {/* Explanation Box during reveal phase */}
                    {questionPhase === 'revealing' && currentReveal?.explanation && (
                      <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-xs sm:text-sm text-emerald-900 dark:text-emerald-200 animate-in fade-in">
                        <span className="font-bold block mb-1">Explanation:</span>
                        {currentReveal.explanation}
                      </div>
                    )}

                    {/* Standard navigation buttons (only when manual navigation is configured) */}
                    {(!enableTimedQuestions || !autoAdvance || allowPrevious) && (
                      <div className="flex items-center justify-between pt-6 border-t border-border mt-8">
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={handlePrev}
                          disabled={currentIndex === 0 || (enableTimedQuestions && !allowPrevious) || questionPhase === 'revealing'}
                          className="h-10 px-4"
                        >
                          <ChevronLeft className="size-4 mr-1" />
                          <span>Previous</span>
                        </Button>

                        <div className="flex items-center gap-2">
                          {!enableTimedQuestions && (
                            <>
                              <Button
                                variant="secondary"
                                size="md"
                                onClick={() => void saveCurrentDraft()}
                                className="h-10 px-3 hidden sm:inline-flex"
                              >
                                <Save className="size-4 mr-1.5" />
                                <span>Save Draft</span>
                              </Button>
                              <Button
                                variant={reviews[currentQuestion.id] ? 'primary' : 'secondary'}
                                size="md"
                                onClick={toggleMarkReview}
                                className={cn(
                                  'h-10 px-3',
                                  reviews[currentQuestion.id] && 'bg-amber-500 hover:bg-amber-600 text-white'
                                )}
                              >
                                <Bookmark className="size-4 sm:mr-1.5" />
                                <span className="hidden sm:inline">
                                  {reviews[currentQuestion.id] ? 'Marked for Review' : 'Mark Review'}
                                </span>
                              </Button>
                            </>
                          )}

                          {currentIndex < questions.length - 1 ? (
                            <Button
                              variant="primary"
                              size="md"
                              onClick={handleNext}
                              disabled={questionPhase === 'revealing'}
                              className="h-10 px-5 font-semibold"
                            >
                              <span>Next</span>
                              <ChevronRight className="size-4 ml-1" />
                            </Button>
                          ) : (
                            <Button
                              variant="danger"
                              size="md"
                              onClick={() => setConfirmOpen(true)}
                              disabled={submitting}
                              className="h-10 px-5 font-semibold"
                            >
                              <Send className="size-4 mr-1.5" />
                              <span>Submit Assessment</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </main>

            {/* Floating Live Camera Thumbnail in Bottom-Right Corner */}
            {cameraRequired && (
              <div className="fixed bottom-4 right-4 z-40 rounded-xl overflow-hidden shadow-2xl border border-border/80 bg-black/95">
                <CameraFeed
                  required={cameraRequired}
                  captureSnapshots={true}
                  quizId={params.quizId}
                  compact={true}
                  onSnapshot={handleCameraSnapshot}
                  className="w-28 sm:w-36 aspect-video border-0 rounded-xl"
                />
              </div>
            )}

            {/* Fullscreen Violation Alert Modal (Re-entry required) */}
            {fullscreenRequired && !isFullscreen && started && !submitting && !result && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
                <Card className="max-w-md w-full border border-rose-500/50 shadow-2xl text-center bg-card">
                  <CardHeader className="pb-2">
                    <div className="mx-auto size-14 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 mb-2">
                      <AlertTriangle className="size-8" />
                    </div>
                    <CardTitle className="text-xl font-bold text-foreground">
                      Anti-Cheat Alert: Fullscreen Mode Required
                    </CardTitle>
                    <CardSubtitle className="text-rose-600 dark:text-rose-400 font-semibold mt-1">
                      Warning {warningCount} of {maxWarnings} recorded
                    </CardSubtitle>
                  </CardHeader>
                  <CardBody className="space-y-4 pt-2">
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      You have exited fullscreen examination mode. All assessment activities must be conducted in full screen.
                    </p>
                    <Button
                      variant="primary"
                      size="lg"
                      className="w-full font-semibold py-5"
                      onClick={() => void requestFullscreen()}
                    >
                      <Maximize2 className="size-4 mr-2" />
                      Return to Fullscreen
                    </Button>
                  </CardBody>
                </Card>
              </div>
            )}

            {/* Submit Confirmation Dialog */}
            <ConfirmDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              title="Submit Assessment?"
              description={`You have answered ${answeredCount} of ${questions.length} question(s). Once submitted, you cannot change your responses.`}
              confirmLabel="Confirm & Submit"
              onConfirm={() => submitAssessment('manual')}
              pending={submitting}
            />
          </div>
        );
      }}
    </AsyncSection>
  );
}
