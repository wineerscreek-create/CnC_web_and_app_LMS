'use client';

import * as React from 'react';
import { Star, MessageSquare, CheckCircle2, Send, ThumbsUp, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle, CardSubtitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toast } from 'sonner';

interface QuizFeedbackFormProps {
  quizId: string;
  attemptId: string;
  className?: string;
}

export function QuizFeedbackForm({ quizId, attemptId, className }: QuizFeedbackFormProps) {
  const [loading, setLoading] = React.useState<boolean>(true);
  const [existingFeedback, setExistingFeedback] = React.useState<any | null>(null);
  const [isOpen, setIsOpen] = React.useState<boolean>(false);

  // Form fields
  const [overallRating, setOverallRating] = React.useState<number>(0);
  const [overallHover, setOverallHover] = React.useState<number>(0);
  const [difficulty, setDifficulty] = React.useState<'Easy' | 'Moderate' | 'Difficult' | ''>('');
  const [questionQualityRating, setQuestionQualityRating] = React.useState<number>(0);
  const [qualityHover, setQualityHover] = React.useState<number>(0);
  const [timeManagement, setTimeManagement] = React.useState<'Sufficient' | 'Insufficient' | ''>('');
  const [writtenFeedback, setWrittenFeedback] = React.useState<string>('');
  const [submitting, setSubmitting] = React.useState<boolean>(false);
  const [submittedFeedback, setSubmittedFeedback] = React.useState<any | null>(null);

  // Load existing feedback if student previously submitted
  React.useEffect(() => {
    let cancelled = false;
    async function loadFeedback() {
      if (!quizId || !attemptId) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get(`/student/assessments/${quizId}/feedback?attempt_id=${attemptId}`);
        if (!cancelled && res.data?.data) {
          setExistingFeedback(res.data.data);
          setSubmittedFeedback(res.data.data);
        }
      } catch {
        // No existing feedback or error loading
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadFeedback();
    return () => {
      cancelled = true;
    };
  }, [quizId, attemptId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!overallRating || overallRating < 1 || overallRating > 5) {
      toast.error('Please select an overall quiz rating (1 to 5 stars).');
      return;
    }
    if (!difficulty) {
      toast.error('Please select the quiz difficulty level (Easy, Moderate, or Difficult).');
      return;
    }
    if (!questionQualityRating || questionQualityRating < 1 || questionQualityRating > 5) {
      toast.error('Please rate the question quality (1 to 5 stars).');
      return;
    }
    if (!timeManagement) {
      toast.error('Please indicate whether the allotted time was sufficient or insufficient.');
      return;
    }
    if (writtenFeedback.length > 2000) {
      toast.error('Written feedback must not exceed 2000 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post(`/student/assessments/${quizId}/feedback`, {
        attempt_id: attemptId,
        overall_rating: overallRating,
        difficulty,
        question_quality_rating: questionQualityRating,
        time_management: timeManagement,
        written_feedback: writtenFeedback.trim() || null,
      });

      const data = res.data?.data;
      setSubmittedFeedback(data);
      setExistingFeedback(data);
      toast.success('Thank you! Your feedback has been recorded.');
    } catch (err: any) {
      const detail = err?.response?.data?.message || err?.message || 'Failed to submit feedback.';
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className={cn('rounded-2xl border border-border bg-card/50 p-4 text-center', className)}>
        <p className="text-xs text-muted-foreground animate-pulse">Loading feedback status...</p>
      </div>
    );
  }

  // Already submitted feedback confirmation view
  const feedbackData = submittedFeedback || existingFeedback;
  if (feedbackData) {
    return (
      <Card className={cn('border border-emerald-500/30 bg-emerald-500/5 shadow-md', className)}>
        <CardHeader className="pb-3 text-left">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <CardTitle className="text-base font-bold text-foreground">
                Feedback Submitted
              </CardTitle>
            </div>
            <Badge tone="teal" className="text-[11px] font-semibold">
              Thank You
            </Badge>
          </div>
          <CardSubtitle className="text-xs text-muted-foreground mt-1">
            Your valuable insights have been shared with your instructor to enhance future examinations.
          </CardSubtitle>
        </CardHeader>
        <CardBody className="pt-0 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-center">
            <div className="rounded-xl border border-border bg-card/80 p-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Overall Rating
              </span>
              <div className="flex items-center justify-center gap-0.5 mt-1 text-amber-500 font-bold text-sm">
                <span>{feedbackData.overallRating}</span>
                <Star className="size-3.5 fill-amber-500 text-amber-500" />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card/80 p-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Difficulty
              </span>
              <span className="inline-block mt-1 text-xs font-semibold text-foreground">
                {feedbackData.difficulty}
              </span>
            </div>

            <div className="rounded-xl border border-border bg-card/80 p-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Question Quality
              </span>
              <div className="flex items-center justify-center gap-0.5 mt-1 text-amber-500 font-bold text-sm">
                <span>{feedbackData.questionQualityRating}</span>
                <Star className="size-3.5 fill-amber-500 text-amber-500" />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card/80 p-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Time Allotted
              </span>
              <span className="inline-block mt-1 text-xs font-semibold text-foreground">
                {feedbackData.timeManagement}
              </span>
            </div>
          </div>

          {feedbackData.writtenFeedback && (
            <div className="rounded-xl border border-border bg-card/60 p-3 text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Your Comments
              </span>
              <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                {feedbackData.writtenFeedback}
              </p>
            </div>
          )}
        </CardBody>
      </Card>
    );
  }

  // Not yet submitted: Option to open or fill form
  if (!isOpen) {
    return (
      <div className={cn('rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5 text-left', className)}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-primary font-bold text-sm">
              <MessageSquare className="size-4 shrink-0" />
              <span>Share Your Quiz Experience</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Help us calibrate question difficulty and improve exam pacing for upcoming modules.
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setIsOpen(true)}
            className="shrink-0 flex items-center gap-1.5"
          >
            <Sparkles className="size-3.5" />
            Share Your Feedback
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className={cn('border border-primary/30 shadow-xl bg-card text-left', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <MessageSquare className="size-4" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                Assessment Feedback
              </CardTitle>
              <CardSubtitle className="text-xs text-muted-foreground">
                Please evaluate this quiz to help trainers optimize question quality and timing.
              </CardSubtitle>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardBody className="pt-2">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* FIELD 1: Overall Quiz Rating (1-5 stars, Required) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-foreground">
              Field 1: Overall Quiz Rating <span className="text-rose-500">*</span>
            </label>
            <p className="text-xs text-muted-foreground">
              How would you rate your overall experience with this assessment?
            </p>
            <div className="flex items-center gap-2 pt-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setOverallRating(star)}
                  onMouseEnter={() => setOverallHover(star)}
                  onMouseLeave={() => setOverallHover(0)}
                  className="p-1 rounded-lg transition-transform hover:scale-110 focus:outline-hidden"
                  aria-label={`${star} star`}
                >
                  <Star
                    className={cn(
                      'size-7 transition-colors',
                      (overallHover || overallRating) >= star
                        ? 'fill-amber-400 text-amber-500'
                        : 'text-muted-foreground/40'
                    )}
                  />
                </button>
              ))}
              <span className="text-xs font-semibold text-foreground ml-2">
                {overallRating > 0 ? `${overallRating} of 5 Stars` : 'Select rating'}
              </span>
            </div>
          </div>

          {/* FIELD 2: Quiz Difficulty (Easy / Moderate / Difficult, Required) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-foreground">
              Field 2: Quiz Difficulty <span className="text-rose-500">*</span>
            </label>
            <p className="text-xs text-muted-foreground">
              How challenging were the questions covered in this exam?
            </p>
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              {(['Easy', 'Moderate', 'Difficult'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setDifficulty(level)}
                  className={cn(
                    'py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all text-center',
                    difficulty === level
                      ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/40 font-bold shadow-xs'
                      : 'border-border bg-card hover:bg-muted/40 text-foreground'
                  )}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* FIELD 3: Question Quality (1-5 stars, Required) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-foreground">
              Field 3: Question Quality <span className="text-rose-500">*</span>
            </label>
            <p className="text-xs text-muted-foreground">
              Were the questions clear, unambiguous, and aligned with course curriculum?
            </p>
            <div className="flex items-center gap-2 pt-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setQuestionQualityRating(star)}
                  onMouseEnter={() => setQualityHover(star)}
                  onMouseLeave={() => setQualityHover(0)}
                  className="p-1 rounded-lg transition-transform hover:scale-110 focus:outline-hidden"
                  aria-label={`${star} star quality`}
                >
                  <Star
                    className={cn(
                      'size-7 transition-colors',
                      (qualityHover || questionQualityRating) >= star
                        ? 'fill-amber-400 text-amber-500'
                        : 'text-muted-foreground/40'
                    )}
                  />
                </button>
              ))}
              <span className="text-xs font-semibold text-foreground ml-2">
                {questionQualityRating > 0 ? `${questionQualityRating} of 5 Stars` : 'Select rating'}
              </span>
            </div>
          </div>

          {/* FIELD 4: Time Management (Sufficient / Insufficient, Required) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-foreground">
              Field 4: Time Management <span className="text-rose-500">*</span>
            </label>
            <p className="text-xs text-muted-foreground">
              Was the total duration sufficient to comfortably read and solve all questions?
            </p>
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              {(['Sufficient', 'Insufficient'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTimeManagement(option)}
                  className={cn(
                    'py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all text-center',
                    timeManagement === option
                      ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/40 font-bold shadow-xs'
                      : 'border-border bg-card hover:bg-muted/40 text-foreground'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {/* FIELD 5: Written Feedback (Optional text area, max 2000 chars) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-foreground">
                Field 5: Written Feedback <span className="text-muted-foreground font-normal">(Optional)</span>
              </label>
              <span className="text-[11px] text-muted-foreground font-mono">
                {writtenFeedback.length}/2000
              </span>
            </div>
            <textarea
              rows={3}
              maxLength={2000}
              value={writtenFeedback}
              onChange={(e) => setWrittenFeedback(e.target.value)}
              placeholder="Share any additional comments, confusing questions, or suggestions for the trainer..."
              className="w-full rounded-xl border border-border bg-card p-3 text-xs sm:text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-hidden leading-relaxed"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={submitting}
              className="flex items-center gap-1.5"
            >
              <Send className="size-3.5" />
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
