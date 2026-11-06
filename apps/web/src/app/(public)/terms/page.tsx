'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, FileCheck, Scale, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <div className="mb-8">
        <Button asChild variant="secondary" size="sm" className="rounded-xl mb-4">
          <Link href="/">
            <ArrowLeft className="size-3.5 mr-1" /> Back to Home
          </Link>
        </Button>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-heading border border-accent/30 mb-3">
          <Scale className="size-3.5 text-accent" /> Legal Agreement
        </div>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold text-heading">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Effective: November 2026 · Winners Creek LMS
        </p>
      </div>

      <div className="space-y-8 text-sm leading-relaxed text-foreground/90 bg-card/80 backdrop-blur-md p-6 sm:p-10 rounded-3xl border border-border shadow-xs">
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading flex items-center gap-2">
            <FileCheck className="size-4 text-primary" /> 1. Acceptance of Platform Terms
          </h2>
          <p>
            By accessing or creating an account on Winners Creek LMS, you agree to be bound by these Terms of Service, all applicable educational laws, and institutional codes of conduct. If accessing on behalf of an affiliated college or enterprise client, you confirm authorization to represent that entity.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">2. User Accounts &amp; Academic Integrity</h2>
          <p>
            Participants are responsible for maintaining the confidentiality of their credentials. All simulation attempts, interview recordings, and assessment submissions must represent the participant&apos;s original effort. Plagiarism or fraudulent manipulation of AI practice feedback will result in immediate disqualification.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">3. Course Completion &amp; Mandatory Feedback</h2>
          <p>
            Course completion certificates and official readiness credentials require both:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>Satisfactory completion of all curricular lessons, assignments, and practical simulations (100% learning criteria).</li>
            <li>Submission of the official course-specific feedback survey to ensure ongoing pedagogical improvement and trainer attribution.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">4. Intellectual Property</h2>
          <p>
            All instructional videos, lecture notes, case challenge materials, software simulators, and diagnostic rubrics are proprietary assets of Winners Creek LMS and its licensed faculty. Unauthorized reproduction or commercial distribution is prohibited.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">5. Contact &amp; Governance</h2>
          <p>
            For legal inquiries regarding these terms, reach our governance counsel at <span className="font-semibold text-primary">legal@winnerscreek.com</span>.
          </p>
        </section>
      </div>
    </div>
  );
}

