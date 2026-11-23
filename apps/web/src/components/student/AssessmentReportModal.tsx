'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock,
  FileText,
  HelpCircle,
  Printer,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDate, num } from '@/lib/format';

export interface AssessmentReportModalProps {
  reportId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AssessmentReportModal({
  reportId,
  isOpen,
  onClose,
}: AssessmentReportModalProps) {
  const [loading, setLoading] = React.useState(false);
  const [report, setReport] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen || !reportId) {
      setReport(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    api
      .get<any>(`/student/assessment-reports/${reportId}`)
      .then((res) => {
        if (!isMounted) return;
        setReport(res.data);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err?.message || 'Failed to load assessment report details.');
        toast.error('Failed to load assessment report.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, reportId]);

  function handlePrint() {
    window.print();
  }

  const isPassed = report?.resultStatus === 'PASSED';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent wide className="max-w-4xl p-0 overflow-hidden sm:max-h-[92vh]">
        {/* Modal Header */}
        <DialogHeader className="bg-card/90 backdrop-blur-sm border-b border-border px-6 py-4 flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-accent/15 p-2 text-accent">
              <FileText className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold font-heading text-heading">
                Permanent Assessment Report
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Verified attempt transcript · ID:{' '}
                <span className="font-mono">{reportId?.slice(0, 8)}...</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePrint}
              disabled={loading || !report}
              className="hidden sm:flex items-center gap-1.5 text-xs font-semibold"
            >
              <Printer className="size-3.5" />
              Print / Save PDF
            </Button>
          </div>
        </DialogHeader>

        <DialogBody className="p-6 max-h-[calc(92vh-130px)] overflow-y-auto space-y-6">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <div className="inline-block size-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="text-xs text-muted-foreground font-medium">
                Loading official report record...
              </p>
            </div>
          ) : error ? (
            <div className="py-12 text-center space-y-2">
              <AlertTriangle className="size-8 text-rose-500 mx-auto" />
              <p className="text-sm font-semibold text-rose-600">{error}</p>
              <Button variant="secondary" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          ) : report ? (
            <div id="printable-assessment-report" className="space-y-6">
              {/* Section 1: Candidate & Assessment Meta Header */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-4 border-b border-border">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Candidate Details
                    </span>
                    <h3 className="text-base font-bold text-heading mt-0.5">
                      {report.studentName || 'Student'}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Roll No: <strong className="text-foreground font-mono">{report.rollNumber || 'N/A'}</strong></span>
                      <span>Email: <strong className="text-foreground">{report.email || 'N/A'}</strong></span>
                      {report.batchName && <span>Batch: <strong className="text-foreground">{report.batchName}</strong></span>}
                      {report.semester && <span>Semester: <strong className="text-foreground">{report.semester}</strong></span>}
                      {report.branch && <span>Branch: <strong className="text-foreground">{report.branch}</strong></span>}
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-end gap-1.5">
                    <Badge tone={isPassed ? 'mustard' : 'neutral'} className="font-bold text-xs uppercase">
                      {report.resultStatus || 'COMPLETED'}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Attempt #{report.attemptNumber || 1}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground">Assessment Title</span>
                    <p className="font-bold text-heading mt-0.5 truncate">{report.assessmentTitle}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground">Faculty / Trainer</span>
                    <p className="font-bold text-heading mt-0.5">{report.trainerName || 'Evaluator'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground">Assessment Date</span>
                    <p className="font-bold text-heading mt-0.5">{formatDate(report.assessmentDate || report.submissionTime)}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground">Duration</span>
                    <p className="font-bold text-heading mt-0.5">
                      {report.timeTakenSeconds
                        ? `${Math.floor(report.timeTakenSeconds / 60)}m ${report.timeTakenSeconds % 60}s`
                        : 'Completed'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Section 2: Big Score Hero Banner */}
              <div
                className={cn(
                  'rounded-2xl border p-6 flex flex-col md:flex-row items-center justify-between gap-6',
                  isPassed
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-rose-500/30 bg-rose-500/5'
                )}
              >
                <div className="flex items-center gap-4 text-center sm:text-left">
                  <div
                    className={cn(
                      'size-16 rounded-2xl flex items-center justify-center font-bold text-2xl',
                      isPassed ? 'bg-emerald-500 text-white shadow-md' : 'bg-rose-500 text-white shadow-md'
                    )}
                  >
                    {isPassed ? <CheckCircle2 className="size-9" /> : <XCircle className="size-9" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Evaluation Result
                      </span>
                      <Badge tone={isPassed ? 'mustard' : 'neutral'} className="text-[10px] font-bold">
                        {isPassed ? 'PASSED' : 'NOT PASSED'}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold font-mono text-heading">
                        {num(report.marksObtained, 1)}
                      </span>
                      <span className="text-sm font-semibold text-muted-foreground">
                        / {num(report.maximumMarks, 1)} Marks
                      </span>
                      <span className="text-xl font-bold font-mono text-accent ml-2">
                        ({num(report.percentage, 1)}%)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Score breakdown chips */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full md:w-auto">
                  <div className="rounded-xl border border-border bg-card p-2.5 text-center">
                    <span className="text-[10px] text-muted-foreground font-semibold">Total Qs</span>
                    <p className="text-sm font-bold font-mono text-heading">{report.totalQuestions}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-2.5 text-center">
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Correct</span>
                    <p className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">{report.correctAnswers}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-2.5 text-center">
                    <span className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">Incorrect</span>
                    <p className="text-sm font-bold font-mono text-rose-600 dark:text-rose-400">{report.incorrectAnswers}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-2.5 text-center">
                    <span className="text-[10px] text-muted-foreground font-semibold">Skipped</span>
                    <p className="text-sm font-bold font-mono text-muted-foreground">{report.unattemptedQuestions}</p>
                  </div>
                </div>
              </div>

              {/* Section 3: Proctoring & Integrity Summary */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    {report.warningsCount > 0 ? (
                      <ShieldAlert className="size-4 text-amber-500" />
                    ) : (
                      <ShieldCheck className="size-4 text-emerald-500" />
                    )}
                    <h4 className="text-sm font-bold font-heading text-heading">
                      Proctoring &amp; Assessment Integrity Log
                    </h4>
                  </div>
                  <Badge tone={report.warningsCount === 0 ? 'mustard' : 'charcoal'} className="text-[11px] font-mono">
                    {report.warningsCount} Violation{report.warningsCount === 1 ? '' : 's'}
                  </Badge>
                </div>

                <div className="mt-3.5 space-y-2">
                  {report.warningsCount === 0 ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                      Clean examination session. Full-screen integrity and continuous proctoring checks maintained.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        {report.warningsCount} proctoring anomaly flagged during the examination window:
                      </p>
                      {Array.isArray(report.proctoringSummary?.events) && report.proctoringSummary.events.length > 0 ? (
                        <div className="max-h-36 overflow-y-auto space-y-1 text-xs">
                          {report.proctoringSummary.events.map((evt: any, i: number) => (
                            <div key={i} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-1.5">
                              <span className="font-medium text-foreground">{evt.type || evt.event || 'Warning'}</span>
                              <span className="text-[11px] text-muted-foreground font-mono">
                                {evt.timestamp ? formatDate(evt.timestamp) : `Event #${i + 1}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Proctoring flags were verified and archived with this attempt.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Section 4: Topic / Subject Performance */}
              {Array.isArray(report.topicPerformance) && report.topicPerformance.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
                  <h4 className="text-sm font-bold font-heading text-heading mb-3">
                    Competency &amp; Topic Analysis
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {report.topicPerformance.map((tp: any, idx: number) => (
                      <div key={idx} className="rounded-xl border border-border/80 bg-muted/20 p-3.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-heading">{tp.topic || 'General'}</span>
                          <span className="font-mono font-bold text-accent">{num(tp.accuracy, 1)}%</span>
                        </div>
                        <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-accent rounded-full transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, tp.accuracy || 0))}%` }}
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{tp.correctCount ?? tp.score ?? 0} Correct</span>
                          <span>{tp.totalQuestions ?? tp.maxMarks ?? 0} Total</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section 5: Question-wise Detailed Review */}
              {Array.isArray(report.questionSummary) && report.questionSummary.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <div>
                      <h4 className="text-sm font-bold font-heading text-heading">
                        Question-by-Question Evaluation
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Itemized performance, candidate selections, and marks breakdown.
                      </p>
                    </div>
                    <Badge tone="charcoal" className="font-mono text-xs">
                      {report.questionSummary.length} Items
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    {report.questionSummary.map((q: any) => {
                      const qCorrect = q.status === 'CORRECT';
                      const qIncorrect = q.status === 'INCORRECT';
                      const qSkipped = q.status === 'UNATTEMPTED';

                      return (
                        <div
                          key={q.questionNumber}
                          className={cn(
                            'rounded-xl border p-4 transition-colors',
                            qCorrect
                              ? 'border-emerald-500/30 bg-emerald-500/5'
                              : qIncorrect
                              ? 'border-rose-500/30 bg-rose-500/5'
                              : 'border-border bg-muted/20'
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5">
                              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-bold text-heading shrink-0">
                                Q{q.questionNumber}
                              </span>
                              <div>
                                <p className="text-xs sm:text-sm font-semibold text-heading leading-relaxed">
                                  {q.questionText}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                                  {q.topic && <span className="bg-muted px-1.5 py-0.5 rounded font-medium">{q.topic}</span>}
                                  {q.difficulty && (
                                    <span className="uppercase font-semibold tracking-wider font-mono">
                                      {q.difficulty}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col items-end shrink-0">
                              <Badge
                                tone={qCorrect ? 'mustard' : qIncorrect ? 'neutral' : 'neutral'}
                                className="text-[10px] font-bold uppercase"
                              >
                                {q.status}
                              </Badge>
                              <span className="mt-1 font-mono text-[11px] font-bold text-heading">
                                {num(q.marks, 1)} / {num(q.maxMarks ?? 1, 1)} pts
                              </span>
                            </div>
                          </div>

                          {/* Answers display */}
                          <div className="mt-3.5 pt-3 border-t border-border/60 grid sm:grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg bg-card/80 border border-border p-2">
                              <span className="text-[10px] font-semibold text-muted-foreground block">
                                Selected Answer:
                              </span>
                              <p className="font-mono font-medium text-heading mt-0.5">
                                {q.candidateAnswer ? String(q.candidateAnswer) : '(No response / Skipped)'}
                              </p>
                            </div>

                            {q.correctAnswer !== undefined && q.correctAnswer !== null && (
                              <div className="rounded-lg bg-card/80 border border-border p-2">
                                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 block">
                                  Correct Answer:
                                </span>
                                <p className="font-mono font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">
                                  {String(q.correctAnswer)}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Section 6: Trainer Feedback & Recommendations */}
              {report.feedback && (
                <div className="rounded-2xl border border-accent/30 bg-accent/5 p-5 shadow-xs space-y-2.5">
                  <div className="flex items-center gap-2 text-accent">
                    <Sparkles className="size-4" />
                    <h4 className="text-sm font-bold font-heading text-heading">
                      Evaluator Feedback &amp; Next Steps
                    </h4>
                  </div>
                  {report.feedback.summary && (
                    <p className="text-xs text-foreground leading-relaxed">
                      {report.feedback.summary}
                    </p>
                  )}
                  {Array.isArray(report.feedback.recommendations) && report.feedback.recommendations.length > 0 && (
                    <ul className="space-y-1.5 pt-1 text-xs text-muted-foreground">
                      {report.feedback.recommendations.map((rec: string, rIdx: number) => (
                        <li key={rIdx} className="flex items-start gap-2">
                          <span className="text-accent font-bold">•</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter className="bg-card/90 border-t border-border px-6 py-3.5 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground hidden sm:block">
            Permanently preserved academic transcript record. Modifying or deleting this record is restricted.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePrint}
              disabled={loading || !report}
              className="sm:hidden flex items-center gap-1.5 text-xs font-semibold"
            >
              <Printer className="size-3.5" />
              Print
            </Button>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close Report
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
