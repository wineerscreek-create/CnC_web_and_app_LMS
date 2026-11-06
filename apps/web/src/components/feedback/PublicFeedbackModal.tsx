'use client';

import * as React from 'react';
import {
  X,
  Star,
  Sparkles,
  Send,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Heart,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { toast } from 'sonner';

interface PublicFeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

export function PublicFeedbackModal({ open, onClose }: PublicFeedbackModalProps) {
  const [ratings, setRatings] = React.useState({
    overallPlatformRating: 5,
    easeOfUseRating: 5,
    learningQualityRating: 5,
    practicalExperienceRating: 5,
    recommendationRating: 5,
  });

  const [writtenFeedback, setWrittenFeedback] = React.useState('');
  const [suggestions, setSuggestions] = React.useState('');
  const [greetingMessage, setGreetingMessage] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [publicDisplayConsent, setPublicDisplayConsent] = React.useState(true);
  const [honeypot, setHoneypot] = React.useState(''); // Anti-spam

  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  // Close on Escape
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, onClose]);

  if (!open) return null;

  const handleRatingChange = (dimension: keyof typeof ratings, value: number) => {
    setRatings((prev) => ({ ...prev, [dimension]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!writtenFeedback.trim() || writtenFeedback.trim().length < 10) {
      toast.error('Please provide written feedback of at least 10 characters.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/feedback/platform', {
        ...ratings,
        writtenFeedback: writtenFeedback.trim(),
        suggestions: suggestions.trim() || undefined,
        greetingMessage: greetingMessage.trim() || undefined,
        displayName: displayName.trim() || undefined,
        email: email.trim() || undefined,
        publicDisplayConsent,
        honeypot: honeypot || undefined,
      });

      setSubmitted(true);
      toast.success('Thank you! Your feedback has been received.');
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  const ratingFields: { id: keyof typeof ratings; label: string; desc: string }[] = [
    { id: 'overallPlatformRating', label: 'Overall Platform Experience', desc: 'General impression and atmosphere' },
    { id: 'easeOfUseRating', label: 'Ease of Use & Navigation', desc: 'Interface clarity and portal access' },
    { id: 'learningQualityRating', label: 'Learning Quality', desc: 'Curriculum depth and structure' },
    { id: 'practicalExperienceRating', label: 'Practical Simulations', desc: 'AI speech coach & gamified arenas' },
    { id: 'recommendationRating', label: 'Recommendation Score', desc: 'Likelihood of recommending to peers' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-enter">
      <div
        className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-2xl space-y-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 flex size-8 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Close feedback modal"
        >
          <X className="size-4" />
        </button>

        {submitted ? (
          <div className="py-10 text-center space-y-4">
            <div className="flex size-14 mx-auto items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20">
              <CheckCircle2 className="size-8" />
            </div>
            <h2 className="font-heading text-2xl font-bold text-heading">
              Feedback Received!
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              Thank you for sharing your thoughts with Winners Creek. Your input helps us continually refine our curriculum, AI simulations, and academic platform experience.
            </p>
            <div className="pt-4">
              <Button variant="primary" onClick={onClose} className="rounded-xl px-6">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-heading border border-accent/30 mb-2">
                <Sparkles className="size-3.5 text-accent" /> Public Review
              </div>
              <h2 id="feedback-modal-title" className="font-heading text-xl sm:text-2xl font-bold text-heading">
                Share Your Feedback
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Help us improve Winners Creek LMS. Your review will be reviewed for public feature on our testimonials showcase.
              </p>
            </div>

            {/* Honeypot field for bot spam prevention */}
            <input
              type="text"
              name="website_url_hp"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              className="sr-only"
              tabIndex={-1}
              autoComplete="off"
            />

            {/* 5 Rating Dimensions */}
            <div className="space-y-3.5 rounded-2xl bg-muted/40 p-4 border border-border">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Rating Dimensions (1–5 Stars)
              </p>

              {ratingFields.map(({ id, label, desc }) => (
                <div key={id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-border/60 pb-2.5 last:border-b-0 last:pb-0">
                  <div>
                    <p className="text-xs font-semibold text-heading">{label}</p>
                    <p className="text-[10px] text-muted-foreground">{desc}</p>
                  </div>
                  <div className="flex items-center gap-1 pt-1 sm:pt-0">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => handleRatingChange(id, star)}
                        className="p-1 hover:scale-110 transition-transform"
                        aria-label={`${star} star rating for ${label}`}
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

            {/* Written Feedback */}
            <div className="space-y-1.5">
              <label htmlFor="written-feedback" className="block text-xs font-bold text-heading">
                Written Feedback &amp; Experience <span className="text-destructive">*</span>
              </label>
              <textarea
                id="written-feedback"
                required
                rows={3}
                value={writtenFeedback}
                onChange={(e) => setWrittenFeedback(e.target.value)}
                placeholder="What has been your experience using Winners Creek? (Minimum 10 characters)"
                className="w-full rounded-xl border border-border bg-card p-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Suggestions for Improvement */}
            <div className="space-y-1.5">
              <label htmlFor="suggestions" className="block text-xs font-bold text-heading">
                Suggestions for Improvement (Optional)
              </label>
              <textarea
                id="suggestions"
                rows={2}
                value={suggestions}
                onChange={(e) => setSuggestions(e.target.value)}
                placeholder="What features, courses, or exercises would you like us to add?"
                className="w-full rounded-xl border border-border bg-card p-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Greeting or appreciation */}
            <div className="space-y-1.5">
              <label htmlFor="greeting" className="block text-xs font-bold text-heading">
                Appreciation or Message to Trainers (Optional)
              </label>
              <input
                id="greeting"
                type="text"
                value={greetingMessage}
                onChange={(e) => setGreetingMessage(e.target.value)}
                placeholder="e.g. Thanks to Dr. Bose and the mock interview team!"
                className="w-full rounded-xl border border-border bg-card p-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Name & Email (Optional) */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="display-name" className="block text-xs font-bold text-heading">
                  Your Name (Optional)
                </label>
                <input
                  id="display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Priya Sharma"
                  className="w-full rounded-xl border border-border bg-card p-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="reviewer-email" className="block text-xs font-bold text-heading">
                  Your Email (Optional)
                </label>
                <input
                  id="reviewer-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-xl border border-border bg-card p-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>

            {/* Privacy notice and Consent */}
            <div className="rounded-xl bg-muted/30 p-3 border border-border/80 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                <ShieldCheck className="size-4 text-primary shrink-0" />
                <span>Your email address will never be published publicly.</span>
              </div>
              <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={publicDisplayConsent}
                  onChange={(e) => setPublicDisplayConsent(e.target.checked)}
                  className="mt-0.5 rounded border-border text-primary focus:ring-accent"
                />
                <span className="text-[11px] font-medium text-foreground">
                  I agree to allow Winners Creek to display my review and name as a verified public testimonial if approved.
                </span>
              </label>
            </div>

            {/* Submit Action */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={submitting} className="rounded-xl px-6 font-bold">
                <Send className="size-3.5 mr-1.5" />
                Submit Feedback
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

