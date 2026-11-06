'use client';

import { Building2, LifeBuoy, Mail, ShieldQuestion } from 'lucide-react';
import Link from 'next/link';

import { Card, CardBody } from '@/components/ui/card';

const ROUTES = [
  {
    icon: LifeBuoy,
    title: 'I can’t sign in',
    body: 'Check that your email is verified. After five failed attempts an account locks briefly — wait, then try again, or reset your password.',
    action: { label: 'Reset my password', href: '/forgot-password' },
  },
  {
    icon: Building2,
    title: 'I don’t have an account yet',
    body: 'Most accounts are provisioned by your institution. If your college has opened public registration you can sign up with your verified college email.',
    action: { label: 'Create an account', href: '/signup' },
  },
  {
    icon: ShieldQuestion,
    title: 'My batch, department or scores look wrong',
    body: 'Enrollment and competency ratings are evaluated by your certified trainers and department SPOC. Corrections are preserved in the institutional audit trail.',
    action: null,
  },
  {
    icon: Mail,
    title: 'Institutional Administration',
    body: 'Your institution’s Campus to Corporate administrator is the direct contact for account provisioning and batch assignment inquiries.',
    action: null,
  },
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-[880px] px-5 py-12 animate-enter space-y-6">
      <div>
        <h1 className="font-heading font-black text-3xl sm:text-4xl tracking-tight text-heading">
          Contact &amp; Assistance
        </h1>
        <p className="mt-2 text-sm sm:text-base leading-relaxed text-muted-foreground">
          SkillSharp is operated in coordination with your institution. Support operates through your college’s program office, which manages cohorts and batches directly.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {ROUTES.map((route) => (
          <Card key={route.title} className="group border border-border bg-card shadow-card transition-all duration-300 hover:shadow-card-hover hover:border-accent hover:-translate-y-0.5">
            <CardBody className="p-6">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-primary border border-border group-hover:bg-accent group-hover:text-accent-foreground transition-colors duration-200">
                <route.icon className="size-5" aria-hidden />
              </span>
              <h2 className="mt-4 text-base font-bold font-heading text-heading">{route.title}</h2>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{route.body}</p>
              {route.action && (
                <Link
                  href={route.action.href}
                  className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-foreground hover:text-accent hover:underline"
                >
                  {route.action.label} →
                </Link>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <p className="text-xs leading-relaxed text-muted-foreground">
          <strong className="font-bold text-foreground">Data Privacy Assurance — </strong>
          Practice audio recordings, resumes, and evaluation reports are stored with secure encrypted credentials and accessible only to you and your assigned faculty trainers.
        </p>
      </div>
    </div>
  );
}
