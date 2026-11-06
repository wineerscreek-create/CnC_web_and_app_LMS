'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Star,
  Quote,
  Building2,
  GraduationCap,
  ShieldCheck,
  MessageSquareHeart,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { formatDate } from '@/lib/format';
import { PublicFeedbackModal } from './PublicFeedbackModal';

interface Testimonial {
  id: string;
  display_name: string;
  user_category: string;
  rating: number;
  text: string;
  greeting_message?: string;
  published_at: string;
  feedback_source: string;
  course_title?: string;
}

export function HomepageTestimonials() {
  const { data: testimonials, loading } = useApi<Testimonial[]>('/feedback/public/testimonials');
  const [modalOpen, setModalOpen] = React.useState(false);

  const categoryLabels: Record<string, { label: string; icon: any; tone: string }> = {
    STUDENT: { label: 'Participant', icon: GraduationCap, tone: 'text-primary bg-primary/10 border-primary/20' },
    TRAINER: { label: 'Faculty Trainer', icon: Sparkles, tone: 'text-accent bg-accent/10 border-accent/20' },
    SPOC: { label: 'College SPOC / HOD', icon: Building2, tone: 'text-secondary bg-secondary/10 border-secondary/20' },
    ADMIN: { label: 'Institution Admin', icon: ShieldCheck, tone: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
    CORPORATE: { label: 'Corporate Partner', icon: Building2, tone: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
    EXTERNAL: { label: 'Verified Visitor', icon: Sparkles, tone: 'text-muted-foreground bg-muted border-border' },
  };

  return (
    <section id="testimonials" className="px-6 relative">
      <div className="mx-auto max-w-[1240px]">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="max-w-[640px]">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/20 px-3 py-1 text-xs font-bold text-foreground border border-accent/40">
              <Sparkles className="size-3.5 text-accent" /> Verified Student &amp; Partner Voices
            </div>
            <h2 className="mt-3 font-heading text-3xl sm:text-4xl font-extrabold text-heading">
              What People Say About Winners Creek
            </h2>
            <p className="mt-2 text-base text-muted-foreground">
              Authentic reviews from students, institutional leadership, and enterprise recruiters sharing their transformative journey.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => setModalOpen(true)}
              className="rounded-xl font-bold shadow-xs hover:border-accent transition-colors"
            >
              <MessageSquareHeart className="size-4 mr-1.5 text-accent" />
              Share Your Feedback
            </Button>
            <Button asChild variant="ghost" size="md" className="rounded-xl font-semibold hidden sm:inline-flex">
              <Link href="/testimonials">
                View All
                <ArrowRight className="size-4 ml-1" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Testimonials Grid */}
        <div className="mt-8">
          {loading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-56 rounded-3xl bg-muted/40 animate-pulse border border-border" />
              ))}
            </div>
          ) : testimonials && testimonials.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {testimonials.slice(0, 6).map((t) => {
                const cat = categoryLabels[t.user_category] || categoryLabels.EXTERNAL;
                const CatIcon = cat.icon;

                return (
                  <div
                    key={t.id}
                    className="group flex flex-col justify-between rounded-3xl border border-border bg-card/85 p-6 backdrop-blur-md shadow-xs transition-all duration-300 hover:border-accent/40 hover:shadow-card-hover"
                  >
                    <div>
                      {/* Top Header */}
                      <div className="flex items-center justify-between">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold border ${cat.tone}`}>
                          <CatIcon className="size-3" />
                          {cat.label}
                        </span>
                        <div className="flex items-center gap-1 text-amber-500">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`size-3.5 ${
                                i < t.rating ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/30'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Course attribution badge if present */}
                      {t.course_title && (
                        <div className="mt-3 inline-block rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          Course: {t.course_title}
                        </div>
                      )}

                      {/* Review Text */}
                      <div className="mt-4 relative">
                        <Quote className="size-5 text-accent/20 absolute -top-2 -left-1 -z-0" />
                        <p className="text-xs sm:text-sm leading-relaxed text-foreground/90 relative z-10 italic line-clamp-4">
                          &ldquo;{t.text}&rdquo;
                        </p>
                      </div>

                      {t.greeting_message && (
                        <p className="mt-3 text-[11px] text-muted-foreground border-l-2 border-accent/40 pl-2.5 line-clamp-2">
                          {t.greeting_message}
                        </p>
                      )}
                    </div>

                    <div className="mt-5 border-t border-border pt-3.5 flex items-center justify-between text-xs">
                      <span className="font-bold text-heading">{t.display_name}</span>
                      <span className="text-[11px] text-muted-foreground">{formatDate(t.published_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 bg-muted/20 rounded-3xl border border-border">
              <p className="text-xs text-muted-foreground">No approved public testimonials published yet.</p>
            </div>
          )}
        </div>
      </div>

      <PublicFeedbackModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </section>
  );
}

