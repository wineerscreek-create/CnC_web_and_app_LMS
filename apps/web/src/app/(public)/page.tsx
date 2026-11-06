'use client';

import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  Compass,
  FileCheck,
  Flame,
  GraduationCap,
  Layers,
  MessageSquare,
  Mic,
  PlayCircle,
  Quote,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  Users,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Avatar } from '@/components/ui/misc';
import { ProgressBar } from '@/components/shared/progress-bits';
import { useApi } from '@/hooks/useApi';
import { formatDate } from '@/lib/format';
import { iconFor } from '@/lib/icons';
import { useAppSelector } from '@/store';
import { cn } from '@/lib/cn';

interface Overview {
  productName: string;
  tagline: string;
  philosophy: string[];
  description: string;
  pillars: { code: string; title: string; body: string; icon: string }[];
  roleAccess: { role: string; label: string; href: string }[];
}

interface Stats {
  learners: number;
  trainers: number;
  institutions: number;
  courses: number;
  practiceSessionsScored: number;
  certificatesIssued: number;
  evaluationsCompleted?: number;
  averageReadinessScore: number;
  source: string;
}

export default function HomePage() {
  const overview = useApi<Overview>('/home/overview');
  const stats = useApi<Stats>('/home/stats');
  const courses = useApi<any[]>('/home/courses', { limit: 6 });
  const trainers = useApi<any[]>('/home/trainers');
  const announcements = useApi<any[]>('/home/announcements', { limit: 4 });
  const faqs = useApi<any[]>('/home/faqs');
  const testimonials = useApi<any>('/home/testimonials', undefined, {
    select: (raw) => ({ items: raw.data, notice: raw.meta?.notice }),
  });

  const user = useAppSelector((state) => state.auth.user);
  const isStudent = user?.role === 'STUDENT';
  const continueLearning = useApi<any>('/home/continue-learning', undefined, {
    enabled: isStudent,
  });

  const data = overview.data;

  return (
    <div className="space-y-16 sm:space-y-24 pb-20">
      {/* ------------------------------------------------------------------ HERO SECTION */}
      <section className="relative px-6 pt-10 sm:pt-16 lg:pt-20">
        <div className="mx-auto max-w-[1240px]">
          {/* Top Editorial Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/20 px-3.5 py-1.5 text-xs font-semibold text-foreground">
            <span className="size-2 rounded-full bg-accent" />
            Career Readiness &amp; Soft-Skills Platform
          </div>

          <div className="mt-8 grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            {/* Left Headline */}
            <div>
              <h1 className="font-heading text-4xl sm:text-6xl lg:text-[68px] font-extrabold tracking-tight text-heading leading-[1.06]">
                From Campus <br />
                <span className="inline-block relative">
                  to Corporate.
                  <span className="absolute left-0 bottom-1.5 w-full h-[6px] bg-accent/40 -z-10 rounded-full" />
                </span>
              </h1>
              <p className="mt-6 max-w-[560px] text-base sm:text-lg text-muted-foreground leading-relaxed">
                Build skills. Practice with confidence. Become career-ready. SkillSharp bridges academic learning and corporate expectations through measured practice, real-time evaluation, and accredited employability tracking.
              </p>

              {/* 3-Stage Learning Cycle */}
              <div className="mt-8 flex flex-wrap items-center gap-2 sm:gap-3">
                {[
                  { step: '01', title: 'LEARN', desc: 'Industry curriculum' },
                  { step: '02', title: 'PRACTICE', desc: 'Simulations & AI' },
                  { step: '03', title: 'BECOME READY', desc: 'Attributed rating' },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-2.5 shadow-xs"
                  >
                    <span className="flex size-6 items-center justify-center rounded-lg bg-secondary text-[11px] font-bold text-secondary-foreground">
                      {item.step}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-heading leading-none">
                        {item.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA Buttons */}
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Button asChild variant="primary" size="lg" className="rounded-xl px-7 text-sm font-semibold">
                  <Link href={user ? user.home : '/signup'}>
                    {user ? 'Enter Your Workspace' : 'Get Started Free'}
                    <ArrowRight className="size-4 ml-1" />
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="lg" className="rounded-xl px-7 text-sm font-semibold">
                  <Link href="/courses">
                    Explore Programs
                  </Link>
                </Button>
              </div>

              <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="size-4 text-primary" />
                <span>Enterprise academic data isolation active for affiliated colleges.</span>
              </div>
            </div>

            {/* Right Asymmetrical Bento Showcase Card */}
            <div className="relative">
              <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-card">
                <div className="flex items-center justify-between pb-5 border-b border-border">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Enterprise Access
                    </span>
                    <h2 className="font-heading text-lg font-bold text-heading mt-0.5">
                      Direct Portal Sign-in
                    </h2>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/20 border border-accent/40 px-2.5 py-1 text-[11px] font-bold text-foreground">
                    <span className="size-1.5 rounded-full bg-accent" />
                    Live System
                  </span>
                </div>

                <div className="mt-5 grid gap-3">
                  {(data?.roleAccess ?? [
                    { role: 'STUDENT', label: 'Participant Portal', href: '/student/dashboard' },
                    { role: 'TRAINER', label: 'Faculty / Trainer Portal', href: '/trainer/dashboard' },
                    { role: 'HOD', label: 'Department Head (HOD) Portal', href: '/hod/dashboard' },
                    { role: 'ADMIN', label: 'College Administrator Portal', href: '/admin/dashboard' },
                  ]).map((entry) => (
                    <Link
                      key={entry.role}
                      href={user ? entry.href : `/login?role=${entry.role}`}
                      className="group flex items-center justify-between rounded-2xl border border-border bg-muted/60 p-4 transition-all duration-200 hover:bg-card hover:border-accent hover:shadow-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-xl bg-card text-foreground border border-border group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
                          <Compass className="size-4" />
                        </div>
                        <span className="text-sm font-semibold text-foreground">
                          {entry.label}
                        </span>
                      </div>
                      <ArrowRight className="size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-foreground" />
                    </Link>
                  ))}
                </div>

                {/* Instant Verification Banner */}
                <div className="mt-6 rounded-2xl bg-foreground p-4 text-background">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-accent uppercase tracking-wider">
                        Employability Guarantee
                      </p>
                      <p className="text-xs text-background/80 mt-0.5">
                        Attributed trainer reviews + AI practice scoring
                      </p>
                    </div>
                    <span className="rounded-xl bg-accent px-2.5 py-1 text-xs font-extrabold text-accent-foreground">
                      v1.0.0
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ STATS BANNER */}
      <section className="px-6">
        <div className="mx-auto max-w-[1240px] rounded-3xl border border-border bg-card p-6 sm:p-10 shadow-xs">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6 divide-y lg:divide-y-0 lg:divide-x divide-border">
            {[
              { label: 'Active Learners', value: stats.data?.learners ?? 884, suffix: '' },
              { label: 'Certified Trainers', value: stats.data?.trainers ?? 24, suffix: '' },
              { label: 'Affiliated Colleges', value: stats.data?.institutions ?? 1, suffix: '' },
              { label: 'Curated Programs', value: stats.data?.courses ?? 10, suffix: '' },
              { label: 'Practice Sessions', value: stats.data?.practiceSessionsScored ?? 1420, suffix: '+' },
              { label: 'Average Readiness', value: stats.data?.averageReadinessScore ?? 74.2, suffix: '%' },
            ].map((stat, i) => (
              <div key={stat.label} className={cn('flex flex-col', i > 0 && 'pt-4 lg:pt-0 lg:pl-6')}>
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </span>
                <span className="mt-2 font-heading text-2xl sm:text-3xl font-extrabold text-heading tnum">
                  {stat.value}{stat.suffix}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ CONTINUE LEARNING (Logged-in Student) */}
      {isStudent && continueLearning.data && (
        <section className="px-6">
          <div className="mx-auto max-w-[1240px] rounded-3xl border border-accent/40 bg-accent/10 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-xs">
                  <PlayCircle className="size-6" />
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Continue Your Learning
                  </span>
                  <h3 className="font-heading text-lg font-bold text-heading mt-0.5">
                    {continueLearning.data.courseTitle}
                  </h3>
                </div>
              </div>
              <div className="flex min-w-[240px] items-center gap-4">
                <ProgressBar
                  value={continueLearning.data.progressPercent ?? 0}
                  className="flex-1"
                />
                <Button asChild variant="primary" size="md">
                  <Link href={continueLearning.data.href ?? '/student/learning'}>
                    Resume Module
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------ ASYMMETRICAL BENTO: 3-STAGE LEARNING EXPERIENCE */}
      <section className="px-6">
        <div className="mx-auto max-w-[1240px]">
          <div className="max-w-[680px]">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              The SkillSharp Methodology
            </span>
            <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-extrabold text-heading">
              A Structured Architecture for Employability
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              Every module is intentionally designed around three clear phases so students progress smoothly from theoretical concepts to workplace mastery.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {/* Stage 1: LEARN */}
            <div className="rounded-3xl border border-border bg-card p-8 shadow-xs flex flex-col justify-between hover:-translate-y-1 transition-transform duration-200">
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded-xl bg-muted border border-border px-3 py-1 text-xs font-bold text-foreground">
                    STAGE 01
                  </span>
                  <BookOpen className="size-5 text-primary" />
                </div>
                <h3 className="mt-6 font-heading text-2xl font-bold text-heading">
                  LEARN
                </h3>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  Comprehensive foundational training covering professional communication, workplace etiquette, critical thinking, problem solving, and corporate expectations.
                </p>
              </div>
              <ul className="mt-6 space-y-2 text-xs font-medium text-foreground border-t border-border pt-4">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-primary" />
                  Structured video &amp; reading curriculum
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-primary" />
                  Faculty-guided classroom sessions
                </li>
              </ul>
            </div>

            {/* Stage 2: PRACTICE */}
            <div className="rounded-3xl border border-accent/40 bg-accent/15 p-8 shadow-xs flex flex-col justify-between hover:-translate-y-1 transition-transform duration-200">
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded-xl bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground">
                    STAGE 02
                  </span>
                  <Mic className="size-5 text-foreground" />
                </div>
                <h3 className="mt-6 font-heading text-2xl font-bold text-heading">
                  PRACTICE
                </h3>
                <p className="mt-3 text-sm text-foreground/80 leading-relaxed">
                  Interactive real-time simulations including Public Speaking arenas, Mock Interview bots, Technical debate scenarios, and gamified listening challenges.
                </p>
              </div>
              <ul className="mt-6 space-y-2 text-xs font-semibold text-foreground border-t border-accent/30 pt-4">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-primary" />
                  Instant AI speech &amp; pacing feedback
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-primary" />
                  6 Gamified soft-skills simulators
                </li>
              </ul>
            </div>

            {/* Stage 3: BECOME CAREER-READY */}
            <div className="rounded-3xl border border-foreground bg-foreground p-8 text-background shadow-md flex flex-col justify-between hover:-translate-y-1 transition-transform duration-200">
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded-xl bg-background/20 border border-background/20 px-3 py-1 text-xs font-bold text-accent">
                    STAGE 03
                  </span>
                  <Trophy className="size-5 text-accent" />
                </div>
                <h3 className="mt-6 font-heading text-2xl font-bold text-background">
                  CAREER-READY
                </h3>
                <p className="mt-3 text-sm text-background/80 leading-relaxed">
                  Attributed trainer ratings combined with simulation scores generate your official Readiness Index score, verified certificates, and placement endorsements.
                </p>
              </div>
              <ul className="mt-6 space-y-2 text-xs font-medium text-background/90 border-t border-background/20 pt-4">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-accent" />
                  Verified competency certificates
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-accent" />
                  Direct placement officer visibility
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ SEVEN EMPLOYABILITY PILLARS */}
      <section className="px-6">
        <div className="mx-auto max-w-[1240px]">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-[640px]">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Evaluated Competencies
              </span>
              <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-extrabold text-heading">
                The Seven Pillars of Career Success
              </h2>
              <p className="mt-3 text-base text-muted-foreground">
                Standardized across all affiliated colleges and measured identically by every certified trainer.
              </p>
            </div>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(data?.pillars ?? [
              { code: 'COMM', title: 'Verbal Communication', body: 'Clarity, conciseness, articulation, pace, and persuasive rhetoric in professional dialogue.', icon: 'message' },
              { code: 'PRES', title: 'Presentation & Pitching', body: 'Structure, storytelling, visual slide design, non-verbal confidence, and executive presence.', icon: 'video' },
              { code: 'TEAM', title: 'Team Collaboration', body: 'Active listening, constructive disagreement, emotional intelligence, and cross-functional empathy.', icon: 'users' },
              { code: 'LEAD', title: 'Leadership & Initiative', body: 'Goal ownership, proactive decision making, peer motivation, and problem escalation.', icon: 'trophy' },
              { code: 'WRIT', title: 'Professional Writing', body: 'Corporate email etiquette, documentation, executive briefs, and formal correspondence.', icon: 'book' },
              { code: 'INTV', title: 'Interview Readiness', body: 'STAR framework responses, technical articulation, behavioral questions, and composure under pressure.', icon: 'sparkles' },
              { code: 'CRIT', title: 'Critical Thinking', body: 'Analytical decomposition, data-driven synthesis, assumption testing, and structured problem solving.', icon: 'compass' },
            ]).map((pillar) => (
              <div
                key={pillar.code}
                className="group rounded-3xl border border-border bg-card p-6 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:shadow-card-hover hover:border-accent/40"
              >
                <div className="flex size-11 items-center justify-center rounded-2xl bg-muted text-primary border border-border group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
                  <Compass className="size-5" />
                </div>
                <h3 className="mt-4 font-heading text-base font-bold text-heading">
                  {pillar.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {pillar.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ FEATURED PROGRAMS */}
      <section className="px-6">
        <div className="mx-auto max-w-[1240px]">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-[640px]">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Curriculum
              </span>
              <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-extrabold text-heading">
                Featured Programs
              </h2>
              <p className="mt-3 text-base text-muted-foreground">
                Structured roadmaps guiding undergraduates into enterprise-ready professionals.
              </p>
            </div>
            <Button asChild variant="secondary" size="md">
              <Link href="/courses">
                View All Programs
                <ArrowRight className="size-4 ml-1" />
              </Link>
            </Button>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {(courses.data ?? []).map((course) => (
              <Link key={course.id} href={`/courses/${course.slug}`} className="group block">
                <div className="flex h-full flex-col justify-between rounded-3xl border border-border bg-card p-7 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:shadow-card-hover hover:border-accent/50">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="rounded-xl bg-secondary px-2.5 py-1 text-xs font-bold text-secondary-foreground">
                        {course.difficulty ?? 'All Levels'}
                      </span>
                      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        <Clock className="size-3.5" />
                        {course.durationHours}h
                      </span>
                    </div>
                    <h3 className="mt-5 font-heading text-lg font-bold text-heading group-hover:text-gold-text transition-colors">
                      {course.title}
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground line-clamp-3">
                      {course.description}
                    </p>
                  </div>
                  <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-xs font-bold text-foreground">
                    <span>Stage: {course.stage ?? 'Core Foundation'}</span>
                    <ArrowRight className="size-4 text-gold-text transition-transform duration-200 group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ CERTIFIED FACULTY ROSTER */}
      <section className="px-6">
        <div className="mx-auto max-w-[1240px]">
          <div className="max-w-[640px]">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Accredited Mentors
            </span>
            <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-extrabold text-heading">
              Faculty &amp; Trainers Who Assess You
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              Attributable, evidence-backed evaluation by recognized academic professors and industry experts.
            </p>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {(trainers.data ?? []).slice(0, 8).map((trainer) => (
              <div
                key={trainer.id}
                className="rounded-3xl border border-border bg-card p-6 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:shadow-card-hover"
              >
                <Avatar name={trainer.name} size={48} />
                <h3 className="mt-4 font-heading text-base font-bold text-heading">
                  {trainer.name}
                </h3>
                <p className="text-xs font-medium text-muted-foreground">
                  {trainer.designation} · {trainer.department}
                </p>
                {trainer.expertise?.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {trainer.expertise.slice(0, 2).map((skill: string) => (
                      <span
                        key={skill}
                        className="rounded-lg bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground border border-border"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ CALL TO ACTION (CHARCOAL BANNER) */}
      <section className="px-6">
        <div className="mx-auto max-w-[1240px] rounded-3xl bg-foreground p-8 sm:p-14 text-background shadow-xl">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <span className="inline-flex rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">
                Career Acceleration
              </span>
              <h2 className="mt-4 font-heading text-3xl sm:text-5xl font-extrabold text-background leading-tight">
                Ready to become corporate-ready?
              </h2>
              <p className="mt-4 max-w-[560px] text-base text-background/80 leading-relaxed">
                Join hundreds of students currently mastering verbal communication, pitch delivery, executive writing, and interview composure with SkillSharp.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 lg:justify-end">
              <Button asChild variant="primary" size="lg" className="rounded-xl px-8 text-base font-semibold">
                <Link href="/signup">
                  Create Your Account
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg" className="rounded-xl px-8 text-base font-semibold border-background/20 text-background bg-transparent hover:bg-background/10">
                <Link href="/login">
                  Sign In
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
