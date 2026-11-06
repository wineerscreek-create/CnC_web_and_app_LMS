'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Star, Quote, Building2, GraduationCap, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { formatDate } from '@/lib/format';

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

export default function TestimonialsPage() {
  const { data: testimonials, loading } = useApi<Testimonial[]>('/feedback/public/testimonials');

  const categoryLabels: Record<string, { label: string; icon: any; tone: string }> = {
    STUDENT: { label: 'Participant', icon: GraduationCap, tone: 'text-primary bg-primary/10 border-primary/20' },
    TRAINER: { label: 'Faculty Trainer', icon: Sparkles, tone: 'text-accent bg-accent/10 border-accent/20' },
    SPOC: { label: 'College SPOC / HOD', icon: Building2, tone: 'text-secondary bg-secondary/10 border-secondary/20' },
    ADMIN: { label: 'Institution Admin', icon: ShieldCheck, tone: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
    CORPORATE: { label: 'Corporate Partner', icon: Building2, tone: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
    EXTERNAL: { label: 'Verified Visitor', icon: Sparkles, tone: 'text-muted-foreground bg-muted border-border' },
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <div className="mb-10 text-center max-w-2xl mx-auto">
        <Button asChild variant="secondary" size="sm" className="rounded-xl mb-4">
          <Link href="/">
            <ArrowLeft className="size-3.5 mr-1" /> Back to Home
          </Link>
        </Button>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-heading border border-accent/30 mb-3">
          <Sparkles className="size-3.5 text-accent" /> Verified Student &amp; Partner Voices
        </div>
        <h1 className="font-heading text-3xl sm:text-5xl font-extrabold text-heading">
          What People Say About Winners Creek
        </h1>
        <p className="mt-3 text-base text-muted-foreground leading-relaxed">
          Authentic testimonials from students, institutional leadership, and enterprise recruiters sharing their transformative journey.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-48 rounded-3xl bg-muted/40 animate-pulse border border-border" />
          ))}
        </div>
      ) : testimonials && testimonials.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2">
          {testimonials.map((t) => {
            const cat = categoryLabels[t.user_category] || categoryLabels.EXTERNAL;
            const CatIcon = cat.icon;

            return (
              <div
                key={t.id}
                className="group flex flex-col justify-between rounded-3xl border border-border bg-card/90 p-7 backdrop-blur-md shadow-xs transition-all duration-300 hover:border-accent/40 hover:shadow-card-hover"
              >
                <div>
                  {/* Top Header */}
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${cat.tone}`}>
                      <CatIcon className="size-3.5" />
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
                    <div className="mt-3 inline-block rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      Course: {t.course_title}
                    </div>
                  )}

                  {/* Review Text */}
                  <div className="mt-4 relative">
                    <Quote className="size-6 text-accent/20 absolute -top-2 -left-1 -z-0" />
                    <p className="text-sm leading-relaxed text-foreground/90 relative z-10 italic">
                      &ldquo;{t.text}&rdquo;
                    </p>
                  </div>

                  {t.greeting_message && (
                    <p className="mt-3 text-xs text-muted-foreground border-l-2 border-accent/40 pl-3">
                      {t.greeting_message}
                    </p>
                  )}
                </div>

                <div className="mt-6 border-t border-border pt-4 flex items-center justify-between text-xs">
                  <span className="font-bold text-heading">{t.display_name}</span>
                  <span className="text-[11px] text-muted-foreground">{formatDate(t.published_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 bg-muted/20 rounded-3xl border border-border">
          <p className="text-muted-foreground text-sm">No public testimonials published yet.</p>
        </div>
      )}
    </div>
  );
}

