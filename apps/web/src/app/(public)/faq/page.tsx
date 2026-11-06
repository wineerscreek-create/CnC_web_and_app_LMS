'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, HelpCircle, ChevronDown, ChevronUp, Sparkles, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

const FAQS = [
  {
    q: 'What is Winners Creek LMS?',
    a: 'Winners Creek is a next-generation academic and corporate employability learning management system that combines structured curriculum, AI-powered speech diagnostics, interactive behavioral simulators, and faculty attribution to prepare learners for campus placements and executive careers.',
  },
  {
    q: 'How does the course completion and feedback system work?',
    a: 'Course completion is gated by two mandatory milestones: (1) completing 100% of the lessons, curriculum materials, and required simulations, and (2) submitting official course feedback. Once feedback is submitted, the backend verifies completion and issues your official verified credentials.',
  },
  {
    q: 'Can anyone submit feedback about the platform?',
    a: 'Yes! Our public platform review system allows anyone—including current students, faculty trainers, college SPOCs, and anonymous visitors—to submit feedback, rate platform features, and suggest improvements.',
  },
  {
    q: 'How are testimonials selected for display on the homepage?',
    a: 'Only reviews where the participant has provided explicit consent for public display AND which have been reviewed, approved, and explicitly selected by the Super Admin team appear in public showcases.',
  },
  {
    q: 'How do affiliated colleges get started?',
    a: 'College department heads and placement officers can request an institutional onboarding session via our Corporate Connect form or contact our team directly at contact@winnerscreek.com.',
  },
];

export default function FAQPage() {
  const [openIdx, setOpenIdx] = React.useState<number | null>(0);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <div className="mb-8">
        <Button asChild variant="secondary" size="sm" className="rounded-xl mb-4">
          <Link href="/">
            <ArrowLeft className="size-3.5 mr-1" /> Back to Home
          </Link>
        </Button>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-heading border border-accent/30 mb-3">
          <HelpCircle className="size-3.5 text-accent" /> Frequently Asked Questions
        </div>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold text-heading">
          Answers &amp; Platform Support
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Find answers to common questions regarding learning paths, completion requirements, and feedback.
        </p>
      </div>

      <div className="space-y-4">
        {FAQS.map((faq, idx) => {
          const isOpen = openIdx === idx;
          return (
            <div
              key={idx}
              className="rounded-2xl border border-border bg-card/85 p-5 backdrop-blur-md transition-all hover:border-accent/40"
            >
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? null : idx)}
                className="flex w-full items-center justify-between text-left font-heading text-base font-bold text-heading"
              >
                <span>{faq.q}</span>
                {isOpen ? (
                  <ChevronUp className="size-4 text-accent shrink-0" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                )}
              </button>
              {isOpen && (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground border-t border-border pt-3">
                  {faq.a}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-12 rounded-3xl bg-muted/40 border border-border p-6 sm:p-8 text-center space-y-3">
        <h3 className="font-heading text-lg font-bold text-heading">Still have questions?</h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          Our academic support specialists and corporate training coordinators are here to assist.
        </p>
        <div className="pt-2">
          <Button asChild variant="primary" size="sm" className="rounded-xl">
            <Link href="/contact">Contact Our Team</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

