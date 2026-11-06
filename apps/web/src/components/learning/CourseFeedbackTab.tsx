'use client';

import * as React from 'react';
import {
  Star,
  CheckCircle2,
  Send,
  Save,
  Sparkles,
  ShieldCheck,
  Trophy,
  Award,
  AlertCircle,
  Clock,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/hooks/useApi';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';

interface CourseFeedbackTabProps {
  courseId: string;
  courseTitle: string;
  isLearningComplete: boolean;
  onFeedbackFinalized?: () => void;
}

export function CourseFeedbackTab({
  courseId,
  courseTitle,
  isLearningComplete,
  onFeedbackFinalized,
}: CourseFeedbackTabProps) {
  const query = useApi<any>(`/feedback/course/${courseId}`);
  const feedbackData = query.data?.feedback;
  const gateData = query.data?.gate;

  const [ratings, setRatings] = React.useState({
    contentRating: 5,
    trainerRating: 5,
    practicalActivityRating: 5,
    learningMaterialRating: 5,
    overallCourseRating: 5,
  });

  const [learningOutcome, setLearningOutcome] = React.useState('');
  const [positiveFeedback, setPositiveFeedback] = React.useState('');
  const [improvementSuggestions, setImprovementSuggestions] = React.useState('');
  const [futureBatchSuggestions, setFutureBatchSuggestions] = React.useState('');
  const [greetingMessage, setGreetingMessage] = React.useState('');
  const [testimonialText, setTestimonialText] = React.useState('');
  const [publicDisplayConsent, setPublicDisplayConsent] = React.useState(true);

  const [savingDraft, setSavingDraft] = React.useState(false);
  const [submittingFinal, setSubmittingFinal] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);

  // Populate state when feedback data is loaded
  React.useEffect(() => {
    if (feedbackData) {
      setRatings({
        contentRating: feedbackData.content_rating ?? 5,
        trainerRating: feedbackData.trainer_rating ?? 5,
        practicalActivityRating: feedbackData.practical_activity_rating ?? 5,
        learningMaterialRating: feedbackData.learning_material_rating ?? 5,
        overallCourseRating: feedbackData.overall_course_rating ?? 5,
      });
      setLearningOutcome(feedbackData.learning_outcome ?? '');
      setPositiveFeedback(feedbackData.positive_feedback ?? '');
      setImprovementSuggestions(feedbackData.improvement_suggestions ?? '');
      setFutureBatchSuggestions(feedbackData.future_batch_suggestions ?? '');
      setGreetingMessage(feedbackData.greeting_message ?? '');
      setTestimonialText(feedbackData.testimonial_text ?? '');
      setPublicDisplayConsent(feedbackData.public_display_consent ?? true);
    }
  }, [feedbackData]);

  const handleRatingChange = (dim: keyof typeof ratings, val: number) => {
    setRatings((prev) => ({ ...prev, [dim]: val }));
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    try {
      await api.post(`/feedback/course/${courseId}/draft`, {
        ...ratings,
        learningOutcome: learningOutcome.trim() || undefined,
        positiveFeedback: positiveFeedback.trim() || undefined,
        improvementSuggestions: improvementSuggestions.trim() || undefined,
        futureBatchSuggestions: futureBatchSuggestions.trim() || undefined,
        greetingMessage: greetingMessage.trim() || undefined,
        testimonialText: testimonialText.trim() || undefined,
        publicDisplayConsent,
      });
      toast.success('Course feedback draft saved successfully.');
      query.refetch();
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to save draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSubmitFinal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!learningOutcome.trim() || learningOutcome.trim().length < 5) {
      toast.error('Please share what you learned in this course (minimum 5 characters).');
      return;
    }

    setSubmittingFinal(true);
    try {
      const res: any = await api.post(`/feedback/course/${courseId}/submit`, {
        ...ratings,
        learningOutcome: learningOutcome.trim(),
        positiveFeedback: positiveFeedback.trim() || undefined,
        improvementSuggestions: improvementSuggestions.trim() || undefined,
        futureBatchSuggestions: futureBatchSuggestions.trim() || undefined,
        greetingMessage: greetingMessage.trim() || undefined,
        testimonialText: testimonialText.trim() || undefined,
        publicDisplayConsent,
      });

      toast.success(res.message || 'Course feedback submitted!');
      query.refetch();
      setIsEditing(false);
      if (onFeedbackFinalized) onFeedbackFinalized();
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to submit feedback.');
    } finally {
      setSubmittingFinal(false);
    }
  };

  const isFinalSubmitted = feedbackData?.is_final_submission && !isEditing;

  const ratingDims: { id: keyof typeof ratings; label: string; desc: string }[] = [
    { id: 'contentRating', label: '1. Course Content Quality', desc: 'Clarity, relevance, and syllabus rigor' },
    { id: 'trainerRating', label: '2. Trainer Effectiveness', desc: 'Instruction quality, mentoring, and engagement' },
    { id: 'practicalActivityRating', label: '3. Practical Activities & Simulations', desc: 'AI speech coach, debates, and real scenarios' },
    { id: 'learningMaterialRating', label: '4. Learning Material & Resources', desc: 'Class notes, handouts, and reading decks' },
    { id: 'overallCourseRating', label: '5. Overall Course Experience', desc: 'Holistic assessment of learning value' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner informing student of completion gating */}
      {isLearningComplete && !feedbackData?.is_final_submission && (
        <div className="flex items-center gap-3.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 shadow-xs">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
            <Trophy className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-heading font-bold text-sm text-heading">
              Learning Requirements 100% Complete!
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              You have completed all curriculum lessons and practical activities. Submit your final course feedback below to finalize your official course completion and unlock your certificate.
            </p>
          </div>
        </div>
      )}

      {/* Completed View when final feedback already submitted */}
      {isFinalSubmitted ? (
        <div className="rounded-3xl border border-emerald-500/30 bg-card p-6 sm:p-8 space-y-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                <CheckCircle2 className="size-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Official Feedback Submitted
                </span>
                <h3 className="font-heading text-lg font-bold text-heading">
                  Course Feedback Finalized
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Submitted {feedbackData.submitted_at ? formatDate(feedbackData.submitted_at) : 'Recently'}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="rounded-xl text-xs font-semibold"
              >
                Update Feedback
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {ratingDims.map(({ id, label }) => (
              <div key={id} className="rounded-2xl border border-border bg-muted/30 p-3.5 text-center space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground line-clamp-1">
                  {label.replace(/^\d\.\s*/, '')}
                </span>
                <div className="flex items-center justify-center gap-1 text-amber-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`size-3.5 ${
                        i < (feedbackData[id.replace(/([A-Z])/g, '_$1').toLowerCase()] ?? 5)
                          ? 'fill-amber-500 text-amber-500'
                          : 'text-muted-foreground/30'
                      }`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {feedbackData.learning_outcome && (
            <div className="rounded-2xl bg-muted/20 p-4 border border-border space-y-1 text-xs">
              <span className="font-bold text-heading">Key Learning Takeaways:</span>
              <p className="text-muted-foreground leading-relaxed">{feedbackData.learning_outcome}</p>
            </div>
          )}

          {feedbackData.positive_feedback && (
            <div className="rounded-2xl bg-muted/20 p-4 border border-border space-y-1 text-xs">
              <span className="font-bold text-heading">What You Liked Most:</span>
              <p className="text-muted-foreground leading-relaxed">{feedbackData.positive_feedback}</p>
            </div>
          )}
        </div>
      ) : (
        /* Form view for draft saving or final submission */
        <form onSubmit={handleSubmitFinal} className="rounded-3xl border border-border bg-card p-6 sm:p-8 space-y-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
                Course Evaluation
              </span>
              <h3 className="font-heading text-lg font-bold text-heading mt-0.5">
                {courseTitle} — Feedback Survey
              </h3>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
              <Sparkles className="size-3 text-accent" />
              {feedbackData?.is_final_submission ? 'Editing Final' : 'Draft / Final'}
            </span>
          </div>

          {/* 5 Rating Dimensions */}
          <div className="space-y-3.5 rounded-2xl bg-muted/30 p-4 border border-border">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Evaluate Course Quality (1–5 Stars)
            </p>

            {ratingDims.map(({ id, label, desc }) => (
              <div key={id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-border/60 pb-3 last:border-b-0 last:pb-0">
                <div>
                  <p className="text-xs font-semibold text-heading">{label}</p>
                  <p className="text-[11px] text-muted-foreground">{desc}</p>
                </div>
                <div className="flex items-center gap-1 pt-1 sm:pt-0">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => handleRatingChange(id, star)}
                      className="p-1 hover:scale-110 transition-transform"
                      aria-label={`${star} star for ${label}`}
                    >
                      <Star
                        className={`size-4 ${
                          star <= ratings[id]
                            ? 'fill-amber-500 text-amber-500'
                            : 'text-muted-foreground/30'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Qualitative Questions */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-heading">
                What did you learn from this course? <span className="text-destructive">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={learningOutcome}
                onChange={(e) => setLearningOutcome(e.target.value)}
                placeholder="Key concepts, communication frameworks, or problem-solving approaches you mastered..."
                className="w-full rounded-xl border border-border bg-card p-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-heading">
                What did you like most about this program? (Optional)
              </label>
              <textarea
                rows={2}
                value={positiveFeedback}
                onChange={(e) => setPositiveFeedback(e.target.value)}
                placeholder="Simulation exercises, trainer pacing, breakout critiques..."
                className="w-full rounded-xl border border-border bg-card p-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-heading">
                  What should be improved? (Optional)
                </label>
                <textarea
                  rows={2}
                  value={improvementSuggestions}
                  onChange={(e) => setImprovementSuggestions(e.target.value)}
                  placeholder="Pacing, material clarity, exercise difficulty..."
                  className="w-full rounded-xl border border-border bg-card p-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-heading">
                  Suggestions for future batches (Optional)
                </label>
                <textarea
                  rows={2}
                  value={futureBatchSuggestions}
                  onChange={(e) => setFutureBatchSuggestions(e.target.value)}
                  placeholder="Additional case study scenarios, corporate guest speakers..."
                  className="w-full rounded-xl border border-border bg-card p-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-heading">
                  Greeting / Appreciation to Faculty (Optional)
                </label>
                <input
                  type="text"
                  value={greetingMessage}
                  onChange={(e) => setGreetingMessage(e.target.value)}
                  placeholder="e.g. Special thanks to the trainers for personalized feedback!"
                  className="w-full rounded-xl border border-border bg-card p-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-heading">
                  Public Testimonial Quote (Optional)
                </label>
                <input
                  type="text"
                  value={testimonialText}
                  onChange={(e) => setTestimonialText(e.target.value)}
                  placeholder="Short quote suitable for student showcase..."
                  className="w-full rounded-xl border border-border bg-card p-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            {/* Consent Checkbox */}
            <div className="rounded-xl bg-muted/30 p-3 border border-border/80">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={publicDisplayConsent}
                  onChange={(e) => setPublicDisplayConsent(e.target.checked)}
                  className="mt-0.5 rounded border-border text-primary focus:ring-accent"
                />
                <span className="text-[11px] font-medium text-foreground">
                  I grant permission for Winners Creek to feature my testimonial and learning outcomes on the verified student showcase.
                </span>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              onClick={handleSaveDraft}
              loading={savingDraft}
              disabled={submittingFinal}
              className="rounded-xl text-xs font-semibold"
            >
              <Save className="size-3.5 mr-1.5" />
              Save Draft
            </Button>

            <div className="flex items-center gap-2">
              {isEditing && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsEditing(false)}
                  className="rounded-xl text-xs"
                >
                  Cancel Edit
                </Button>
              )}
              <Button
                type="submit"
                variant="primary"
                loading={submittingFinal}
                disabled={savingDraft}
                className="rounded-xl text-xs font-bold px-5"
              >
                <Send className="size-3.5 mr-1.5" />
                Submit Final Feedback &amp; Finalize Completion
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

