'use client';

import { ArrowRight, Layers, ShieldCheck, Target, Users } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

const PRINCIPLES = [
  {
    icon: Target,
    title: 'Practise Before It Counts',
    body: 'Interviews, executive pitches and group dialogues are rehearsed through real-time simulators so a student’s first corporate encounter is never their first attempt.',
  },
  {
    icon: Layers,
    title: 'Evidence-Grounded Assessment',
    body: 'Every AI score quotes the exact sentence and pause it came from, and every faculty review is attributable to a certified trainer, parameter, and timestamp.',
  },
  {
    icon: Users,
    title: 'Institutional Consistency',
    body: '98 standardized evaluation parameters across seven core pillars ensure a score of "8 out of 10" represents the exact same high competency across all departments.',
  },
  {
    icon: ShieldCheck,
    title: 'Enterprise Scoped by Design',
    body: 'Trainers manage their designated batches. HODs oversee their department. College administrators govern their institution. All boundaries are strictly enforced on every request.',
  },
];

export default function AboutPage() {
  return (
    <div className="py-12 sm:py-16 px-6">
      <div className="mx-auto max-w-[1000px] space-y-12">
        {/* Header */}
        <div>
          <span className="inline-flex rounded-full bg-accent/20 px-3 py-1 text-xs font-bold text-foreground border border-accent/40">
            About SkillSharp — Campus to Corporate
          </span>
          <h1 className="mt-4 font-heading text-3xl sm:text-5xl font-extrabold tracking-tight text-heading">
            Employability Treated as a Core Discipline
          </h1>
          <p className="mt-4 text-base sm:text-lg leading-relaxed text-muted-foreground">
            SkillSharp (Campus to Corporate) is an elite career-development and soft-skills platform that runs alongside academic degrees. While marks and academic attendance stay within your university record, SkillSharp cultivates what determines hiring outcomes: confidence, structured communication, teamwork, executive presence, and professional problem solving.
          </p>
        </div>

        {/* 4 Pillars of Thought */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Our Architectural Principles
          </h2>
          <div className="mt-5 grid gap-6 sm:grid-cols-2">
            {PRINCIPLES.map((item) => (
              <div
                key={item.title}
                className="group rounded-3xl border border-border bg-card p-7 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:shadow-card-hover hover:border-accent/40"
              >
                <div className="flex size-11 items-center justify-center rounded-2xl bg-muted text-primary border border-border group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
                  <item.icon className="size-5" />
                </div>
                <h3 className="mt-5 font-heading text-lg font-bold text-heading">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Multi-Role Stakeholders */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Ecosystem Stakeholders
          </h2>
          <div className="mt-5 divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card shadow-xs">
            {[
              ['Students & Participants', 'Learn core curriculum, practice in simulated arenas, track continuous readiness, and earn verified employability certificates.'],
              ['Faculty Trainers', 'Conduct interactive sessions, evaluate students against rubrics, identify struggling learners, and assign targeted practice.'],
              ['Heads of Department (HOD)', 'Gain 360-degree analytics across batches, monitor attendance defaulters, oversee faculty delivery, and export cohort reports.'],
              ['Placement Officers & Recruiters', 'Filter candidates by verified readiness scores, review authentic performance evidence, and access interview-ready talent pools.'],
              ['College Leadership & Admins', 'Manage departments, academic years, user accounts, and strategic employability metrics across the entire college.'],
            ].map(([who, what]) => (
              <div
                key={who}
                className="grid gap-2 px-6 py-5 sm:grid-cols-[220px_1fr] sm:items-center hover:bg-muted/60 transition-colors"
              >
                <span className="font-heading text-sm font-bold text-heading">
                  {who}
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {what}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Banner */}
        <div className="rounded-3xl bg-foreground p-8 sm:p-10 text-background flex flex-wrap items-center justify-between gap-6 shadow-md">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-accent">
              The SkillSharp Progression Formula
            </p>
            <h3 className="mt-1 font-heading text-xl sm:text-2xl font-bold text-background">
              Learn → Practise → Improve → Become Employable
            </h3>
          </div>
          <Button asChild variant="primary" size="md">
            <Link href="/courses">
              Explore Programs
              <ArrowRight className="size-4 ml-1" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
