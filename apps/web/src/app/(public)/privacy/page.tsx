'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Lock, Eye, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <div className="mb-8">
        <Button asChild variant="secondary" size="sm" className="rounded-xl mb-4">
          <Link href="/">
            <ArrowLeft className="size-3.5 mr-1" /> Back to Home
          </Link>
        </Button>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-heading border border-accent/30 mb-3">
          <ShieldCheck className="size-3.5 text-accent" /> Privacy &amp; Data Protection
        </div>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold text-heading">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: November 2026 · Winners Creek LMS &amp; SkillSharp Platforms
        </p>
      </div>

      <div className="space-y-8 text-sm leading-relaxed text-foreground/90 bg-card/80 backdrop-blur-md p-6 sm:p-10 rounded-3xl border border-border shadow-xs">
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading flex items-center gap-2">
            <Lock className="size-4 text-primary" /> 1. Commitment to Participant &amp; Institutional Privacy
          </h2>
          <p>
            Winners Creek is dedicated to upholding enterprise-grade privacy and data protection standards for all learners, educators, affiliated colleges, and corporate recruiters. This policy outlines how information is gathered, utilized, safeguarded, and moderated across our learning management ecosystem.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading flex items-center gap-2">
            <Eye className="size-4 text-primary" /> 2. Information We Collect
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><strong>Account &amp; Enrollment Data:</strong> Name, academic email address, college affiliation, department, and course scheme enrollments.</li>
            <li><strong>Learning Telemetry:</strong> Lesson progress, simulation scores, practice recordings, rubric feedback, and Employability Evaluation Diagnostic Index (EEDI) metrics.</li>
            <li><strong>Feedback &amp; Testimonials:</strong> Platform reviews, course surveys, suggestions, and explicit public display consent designations. Reviewer email addresses are never publicly published.</li>
            <li><strong>Newsletter Information:</strong> Email addresses provided with consent for curriculum updates and career preparation announcements.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading flex items-center gap-2">
            <FileText className="size-4 text-primary" /> 3. Tenant Isolation &amp; Academic Data Protection
          </h2>
          <p>
            Every affiliated college and educational department operates under strict multi-tenant access boundaries. Participant data is isolated and accessible exclusively to authorized institutional administrators, assigned department SPOCs, and course trainers.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">4. Public Testimonial &amp; Review Policy</h2>
          <p>
            Reviews submitted through our public and course feedback systems are held in a <code>PENDING</code> moderation state. Only submissions with explicit user consent and Super Admin approval are featured on public showcases. Anonymous reviewers may participate without providing personal contact information.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">5. Inquiries &amp; Data Rights</h2>
          <p>
            You have the right to inspect, correct, or request deletion of your personal data. For privacy inquiries or data rights requests, contact our Compliance Office at <span className="font-semibold text-primary">privacy@winnerscreek.com</span>.
          </p>
        </section>
      </div>
    </div>
  );
}

