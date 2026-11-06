'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, CreditCard, RotateCcw, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function RefundPolicyPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <div className="mb-8">
        <Button asChild variant="secondary" size="sm" className="rounded-xl mb-4">
          <Link href="/">
            <ArrowLeft className="size-3.5 mr-1" /> Back to Home
          </Link>
        </Button>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-heading border border-accent/30 mb-3">
          <RotateCcw className="size-3.5 text-accent" /> Billing &amp; Enrollment Policies
        </div>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold text-heading">
          Refund Policy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Applicable for direct paid student enrollments and certified programs · Winners Creek LMS
        </p>
      </div>

      <div className="space-y-8 text-sm leading-relaxed text-foreground/90 bg-card/80 backdrop-blur-md p-6 sm:p-10 rounded-3xl border border-border shadow-xs">
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading flex items-center gap-2">
            <CreditCard className="size-4 text-primary" /> 1. Overview of Refund Policy
          </h2>
          <p>
            Winners Creek LMS prioritizes student satisfaction and educational excellence. We offer transparent refund guidelines for all self-funded and direct paid course registrations.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">2. 7-Day Money-Back Guarantee</h2>
          <p>
            For individual paid enrollments, students are entitled to a full refund within <strong>7 calendar days</strong> from the official course activation date, provided that less than 20% of the course modules have been accessed and no course completion certificate has been generated.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">3. Institutional &amp; Campus Batch Enrollments</h2>
          <p>
            Enrollments sponsored or billed directly through affiliated colleges or corporate training agreements are governed by the specific memorandum of understanding (MoU) and institutional billing contract established between Winners Creek and the sponsoring organization.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">4. How to Request a Refund</h2>
          <p>
            To initiate a refund request, submit an email with your transaction ID and enrollment details to <span className="font-semibold text-primary">billing@winnerscreek.com</span>. Verified requests are processed within 5–7 business days to the original payment method.
          </p>
        </section>
      </div>
    </div>
  );
}

