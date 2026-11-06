'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  FileCheck,
  Flame,
  GraduationCap,
  Layers,
  MapPin,
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
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/shared/progress-bits';
import { useApi } from '@/hooks/useApi';
import { useAppSelector } from '@/store';
import { cn } from '@/lib/cn';

// 3D Components
import {
  TiltCard3D,
  ScrollReveal3D,
  AnimatedTimeline3D,
  Interactive3DGameCard,
  MagneticButton3D,
  Interactive3DIcon,
  REAL_GAMES,
} from '@/components/3d';

// Dynamically import Three.js scenes to guarantee zero SSR hydration issues and optimal performance
const DynamicThreeHeroScene = dynamic(
  () => import('@/components/3d/ThreeHeroScene').then((mod) => mod.ThreeHeroScene),
  {
    ssr: false,
    loading: () => (
      <div className="relative w-full h-full min-h-[420px] lg:min-h-[560px] flex items-center justify-center pointer-events-none select-none">
        <div className="size-72 rounded-full border border-accent/20 bg-accent/5 animate-pulse" />
      </div>
    ),
  }
);

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

// Fallback Real Curriculum Courses (aligned with seed_full_curriculum.py)
const DEFAULT_COURSES = [
  {
    id: 'pcbe-mod1',
    slug: 'pcbe-mod1-executive-writing',
    title: 'Executive Writing & High-Impact Correspondence',
    description: 'Master the Minto Pyramid principle, executive brevity, structured emails, and boardroom memorandum drafting.',
    difficulty: 'Intermediate',
    durationHours: 18,
    stage: 'Stage 01: Core Foundation',
  },
  {
    id: 'psps-mod1',
    slug: 'psps-mod1-narrative-architecture',
    title: 'The 3-Act Narrative Architecture for Technical Presentations',
    description: 'Transform complex technical models and analytical data into persuasive executive narratives with clear hooks and payoffs.',
    difficulty: 'Advanced',
    durationHours: 24,
    stage: 'Stage 02: Advanced Practice',
  },
  {
    id: 'psps-mod2',
    slug: 'psps-mod2-stage-dynamics',
    title: 'Stage Dynamics, Vocal Mastery & Defusing Objections',
    description: 'Harness vocal modulation, pacing, posture, and de-escalation tactics during high-stakes Q&A and cross-examination.',
    difficulty: 'Intermediate',
    durationHours: 16,
    stage: 'Stage 02: Advanced Practice',
  },
  {
    id: 'tcim-mod1',
    slug: 'tcim-mod1-team-dynamics',
    title: 'High-Performance Team Dynamics & Psychological Safety',
    description: 'Constructive disagreement frameworks, empathetic listening, emotional intelligence, and cross-functional leadership.',
    difficulty: 'All Levels',
    durationHours: 20,
    stage: 'Stage 01: Core Foundation',
  },
  {
    id: 'crit-mod1',
    slug: 'crit-mod1-problem-solving',
    title: 'Structured Problem Solving & Strategic Decision Making',
    description: 'MECE decomposition, hypothesis generation, data-driven synthesis, and defending recommendations before stakeholders.',
    difficulty: 'Advanced',
    durationHours: 22,
    stage: 'Stage 03: Career Ready',
  },
  {
    id: 'intv-mod1',
    slug: 'intv-mod1-interview-mastery',
    title: 'STAR Behavioral & Executive Interview Mastery',
    description: 'Targeted STAR matrix preparation, technical articulation, behavioral composure, and simulated mock interviews.',
    difficulty: 'Intermediate',
    durationHours: 15,
    stage: 'Stage 03: Career Ready',
  },
];

// Fallback Real Verified Master Trainers (aligned with trainer_profiles table)
const DEFAULT_TRAINERS = [
  {
    id: 'trainer-bose',
    publicSlug: 'dr-r-bose',
    displayName: 'Dr. R. Bose',
    headline: 'Lead Technical & Cognitive Skills Trainer',
    yearsExperience: 14,
    rating: 4.9,
    location: 'Bangalore, India',
    bio: 'Former senior corporate consultant and faculty leader specializing in cognitive problem-solving, structured systems thinking, and campus-to-corporate career transitions.',
    expertiseTags: ['System Architecture', 'Cognitive Skills', 'Executive Presence'],
  },
  {
    id: 'trainer-monika',
    publicSlug: 'monika-verma',
    displayName: 'Monika Verma',
    headline: 'Distinguished Communication & Leadership Coach',
    yearsExperience: 9,
    rating: 5.0,
    location: 'Mumbai, India',
    bio: 'Executive coach helping students articulate high-impact business cases, master storytelling, and build unshakeable workplace confidence.',
    expertiseTags: ['Executive Communication', 'Storytelling', 'Campus Readiness'],
  },
  {
    id: 'trainer-rajesh',
    publicSlug: 'rajesh-k-nair',
    displayName: 'Rajesh K. Nair',
    headline: 'Corporate Presentation Specialist & Executive Coach',
    yearsExperience: 11,
    rating: 4.95,
    location: 'Hyderabad, India',
    bio: 'International corporate trainer coaching over 12,000 professionals in high-stakes presentation dynamics, boardroom pitches, and rhetoric mastery.',
    expertiseTags: ['Public Speaking', 'Presentation Pitching', 'Interview Composure'],
  },
  {
    id: 'trainer-ananya',
    publicSlug: 'dr-ananya-sen',
    displayName: 'Dr. Ananya Sen',
    headline: 'Business Rhetoric & Critical Thinking Facilitator',
    yearsExperience: 8,
    rating: 4.85,
    location: 'Delhi NCR, India',
    bio: 'Specialist in workplace argumentation, executive documentation, and analytical decision frameworks with corporate advisory experience.',
    expertiseTags: ['Critical Thinking', 'Professional Writing', 'Negotiation'],
  },
];

export default function HomePage() {
  const overview = useApi<Overview>('/home/overview');
  const stats = useApi<Stats>('/home/stats');
  const courses = useApi<any[]>('/home/courses', { limit: 6 });
  const trainers = useApi<any[]>('/home/trainers');
  const publicTrainers = useApi<any[]>('/public/trainers');

  const trainerCarouselRef = React.useRef<HTMLDivElement | null>(null);
  const gameCarouselRef = React.useRef<HTMLDivElement | null>(null);

  const scrollTrainers = (direction: 'left' | 'right') => {
    if (!trainerCarouselRef.current) return;
    const scrollAmount = direction === 'left' ? -380 : 380;
    trainerCarouselRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  const scrollGames = (direction: 'left' | 'right') => {
    if (!gameCarouselRef.current) return;
    const scrollAmount = direction === 'left' ? -360 : 360;
    gameCarouselRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  const user = useAppSelector((state) => state.auth.user);
  const isStudent = user?.role === 'STUDENT';
  const continueLearning = useApi<any>('/home/continue-learning', undefined, {
    enabled: isStudent,
  });

  const data = overview.data;

  // Use dynamic API trainers if available, otherwise fallback gracefully
  const trainerList =
    publicTrainers.data && publicTrainers.data.length > 0
      ? publicTrainers.data
      : trainers.data && trainers.data.length > 0
      ? trainers.data
      : DEFAULT_TRAINERS;

  // Use dynamic API courses if available, otherwise fallback gracefully
  const courseList =
    courses.data && courses.data.length > 0
      ? courses.data
      : DEFAULT_COURSES;

  return (
    <div className="relative space-y-20 sm:space-y-28 pb-24 overflow-x-hidden">
      {/* ------------------------------------------------------------------ 1. HERO SECTION WITH ACTUAL 3D ENVIRONMENT */}
      <section className="relative px-6 pt-6 sm:pt-12 lg:pt-16 overflow-hidden">
        {/* Ambient 3D Three.js Scene Background Layer */}
        <div className="absolute inset-0 pointer-events-none -z-0 opacity-85 dark:opacity-95 overflow-hidden flex items-center justify-center">
          <DynamicThreeHeroScene className="w-full h-full max-w-[1440px]" />
        </div>

        <div className="mx-auto max-w-[1240px] relative z-10">
          {/* Top Brand Identity Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-card/85 backdrop-blur-md px-4 py-1.5 text-xs font-semibold text-foreground shadow-xs">
            <span className="size-2 rounded-full bg-accent animate-pulse" />
            <span className="font-heading font-bold text-accent">WINNERS CREEK LMS</span>
            <span className="text-border">|</span>
            <span className="text-muted-foreground">Next-Gen 3D Employability Platform</span>
          </div>

          <div className="mt-8 grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            {/* Left Hero Typography & Actions */}
            <div className="relative z-10 bg-card/40 lg:bg-transparent backdrop-blur-[2px] lg:backdrop-blur-none p-2 sm:p-0 rounded-3xl">
              <h1 className="font-heading text-4xl sm:text-6xl lg:text-[70px] font-extrabold tracking-tight text-heading leading-[1.05]">
                From Campus <br />
                <span className="inline-block relative">
                  to Corporate.
                  <span className="absolute left-0 bottom-2 w-full h-[8px] bg-accent/40 -z-10 rounded-full" />
                </span>
              </h1>

              <p className="mt-6 max-w-[560px] text-base sm:text-lg text-foreground/80 dark:text-muted-foreground font-medium leading-relaxed">
                Build skills. Practice with confidence. Become career-ready. Winners Creek bridges academic education and corporate expectations through measured 3D simulations, real-time AI speech feedback, and accredited employability tracking.
              </p>

              {/* 3-Stage Interactive Learning Cycle */}
              <div className="mt-8 flex flex-wrap items-center gap-2.5 sm:gap-3">
                {[
                  { step: '01', title: 'LEARN', desc: 'Industry curriculum' },
                  { step: '02', title: 'PRACTICE', desc: 'Simulations & AI' },
                  { step: '03', title: 'BECOME READY', desc: 'Attributed rating' },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card/90 backdrop-blur-md px-4 py-2.5 shadow-xs transition-transform hover:-translate-y-0.5"
                  >
                    <span className="flex size-7 items-center justify-center rounded-xl bg-secondary text-xs font-bold text-secondary-foreground shadow-xs">
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

              {/* Primary & Secondary Hero CTAs */}
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Button asChild variant="primary" size="lg" className="rounded-2xl px-8 text-sm font-bold shadow-md hover:shadow-lg transition-all">
                  <Link href={user ? (user.home || '/student/dashboard') : '/signup'}>
                    {user ? 'Enter Your Workspace' : 'Explore Learning'}
                    <ArrowRight className="size-4 ml-1.5" />
                  </Link>
                </Button>

                <Button asChild variant="secondary" size="lg" className="rounded-2xl px-8 text-sm font-bold border-border/80 shadow-xs hover:border-accent/40 transition-all">
                  <Link href="/courses">
                    Discover Our Platform
                  </Link>
                </Button>
              </div>

              <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="size-4 text-primary shrink-0" />
                <span>Enterprise academic data isolation active for affiliated colleges.</span>
              </div>
            </div>

            {/* Right 3D Bento Showcase Card — Direct Portal Access */}
            <div className="relative">
              <TiltCard3D
                maxAngle={6}
                scale={1.02}
                className="p-6 sm:p-8 backdrop-blur-xl bg-card/92 border-border/90 shadow-xl"
              >
                <div className="flex items-center justify-between pb-5 border-b border-border/80">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Enterprise Access
                    </span>
                    <h2 className="font-heading text-lg font-bold text-heading mt-0.5">
                      Direct Portal Sign-in
                    </h2>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 border border-accent/30 px-3 py-1 text-[11px] font-bold text-foreground">
                    <span className="size-1.5 rounded-full bg-accent animate-pulse" />
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
                      className="group flex items-center justify-between rounded-2xl border border-border/80 bg-muted/40 p-4 transition-all duration-200 hover:bg-card hover:border-accent hover:shadow-xs hover:translate-x-1"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-card text-foreground border border-border group-hover:bg-accent group-hover:text-accent-foreground transition-colors shadow-xs">
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
                <div className="mt-6 rounded-2xl bg-foreground p-4 text-background shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-accent uppercase tracking-wider">
                        Employability Guarantee
                      </p>
                      <p className="text-xs text-background/80 mt-0.5">
                        Attributed trainer reviews + AI practice scoring
                      </p>
                    </div>
                    <span className="rounded-xl bg-accent px-2.5 py-1 text-xs font-extrabold text-accent-foreground shadow-xs">
                      v2.0 3D
                    </span>
                  </div>
                </div>
              </TiltCard3D>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ 2. LIVE PLATFORM METRICS & STATS */}
      <section className="px-6">
        <ScrollReveal3D className="mx-auto max-w-[1240px]">
          <TiltCard3D maxAngle={4} scale={1.01} className="p-6 sm:p-10 shadow-xs border-border/80">
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6 divide-y lg:divide-y-0 lg:divide-x divide-border/80">
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
          </TiltCard3D>
        </ScrollReveal3D>
      </section>

      {/* ------------------------------------------------------------------ 3. CONTINUE LEARNING (Student Session) */}
      {isStudent && continueLearning.data && (
        <section className="px-6">
          <ScrollReveal3D className="mx-auto max-w-[1240px]">
            <TiltCard3D maxAngle={4} scale={1.01} className="border-accent/40 bg-accent/10 p-6 sm:p-8">
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
                  <Button asChild variant="primary" size="md" className="rounded-xl font-bold">
                    <Link href={continueLearning.data.href ?? '/student/learning'}>
                      Resume Module
                    </Link>
                  </Button>
                </div>
              </div>
            </TiltCard3D>
          </ScrollReveal3D>
        </section>
      )}

      {/* ------------------------------------------------------------------ 4. 3-STAGE METHODOLOGY BENTO */}
      <section className="px-6">
        <div className="mx-auto max-w-[1240px]">
          <ScrollReveal3D className="max-w-[680px]">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              The Winners Creek Methodology
            </span>
            <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-extrabold text-heading">
              A Structured Architecture for Employability
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              Every module is intentionally designed around three clear phases so students progress smoothly from theoretical concepts to workplace mastery.
            </p>
          </ScrollReveal3D>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {/* Stage 1: LEARN */}
            <ScrollReveal3D delayMs={80}>
              <TiltCard3D maxAngle={7} className="h-full p-8 flex flex-col justify-between">
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
              </TiltCard3D>
            </ScrollReveal3D>

            {/* Stage 2: PRACTICE */}
            <ScrollReveal3D delayMs={160}>
              <TiltCard3D maxAngle={7} className="h-full border-accent/40 bg-accent/15 p-8 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-xl bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground shadow-xs">
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
              </TiltCard3D>
            </ScrollReveal3D>

            {/* Stage 3: BECOME CAREER-READY */}
            <ScrollReveal3D delayMs={240}>
              <TiltCard3D maxAngle={7} className="h-full border-foreground bg-foreground p-8 text-background shadow-md flex flex-col justify-between">
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
              </TiltCard3D>
            </ScrollReveal3D>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ 5. 3D PLATFORM FEATURES (SEVEN PILLARS) */}
      <section className="px-6">
        <div className="mx-auto max-w-[1240px]">
          <ScrollReveal3D className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-[640px]">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Evaluated Competencies
              </span>
              <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-extrabold text-heading">
                The Seven Pillars of Career Success
              </h2>
              <p className="mt-3 text-base text-muted-foreground">
                Standardized across all affiliated colleges and measured identically by every certified trainer and AI simulator.
              </p>
            </div>
          </ScrollReveal3D>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(data?.pillars ?? [
              { code: 'COMM', title: 'Verbal Communication', body: 'Clarity, conciseness, articulation, pace, and persuasive rhetoric in professional dialogue.', icon: 'message' },
              { code: 'PRES', title: 'Presentation & Pitching', body: 'Structure, storytelling, visual slide design, non-verbal confidence, and executive presence.', icon: 'video' },
              { code: 'TEAM', title: 'Team Collaboration', body: 'Active listening, constructive disagreement, emotional intelligence, and cross-functional empathy.', icon: 'users' },
              { code: 'LEAD', title: 'Leadership & Initiative', body: 'Goal ownership, proactive decision making, peer motivation, and problem escalation.', icon: 'trophy' },
              { code: 'WRIT', title: 'Professional Writing', body: 'Corporate email etiquette, documentation, executive briefs, and formal correspondence.', icon: 'book' },
              { code: 'INTV', title: 'Interview Readiness', body: 'STAR framework responses, technical articulation, behavioral questions, and composure under pressure.', icon: 'sparkles' },
              { code: 'CRIT', title: 'Critical Thinking', body: 'Analytical decomposition, data-driven synthesis, assumption testing, and structured problem solving.', icon: 'compass' },
            ]).map((pillar, idx) => (
              <ScrollReveal3D key={pillar.code} delayMs={idx * 60}>
                <TiltCard3D
                  maxAngle={8}
                  scale={1.03}
                  className="group h-full p-6 transition-all duration-300 hover:border-accent/50 hover:shadow-card-hover"
                >
                  <Interactive3DIcon
                    icon={Compass}
                    size="md"
                    color={idx % 2 === 0 ? 'primary' : 'accent'}
                    className="mb-4"
                  />
                  <h3 className="font-heading text-base font-bold text-heading">
                    {pillar.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {pillar.body}
                  </p>
                </TiltCard3D>
              </ScrollReveal3D>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ 6. HOW IT WORKS — 3D SCROLL EXPERIENCE */}
      <section className="px-6">
        <div className="mx-auto max-w-[1240px]">
          <ScrollReveal3D className="max-w-[680px]">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Learning Journey
            </span>
            <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-extrabold text-heading">
              How It Works: Connected 3D Progression
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              From initial competency benchmarking to placement endorsement, experience an interconnected learning pipeline designed for maximum retention.
            </p>
          </ScrollReveal3D>

          <div className="mt-10">
            <AnimatedTimeline3D />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ 7. INTERACTIVE LEARNING & GAME SHOWCASE */}
      <section className="px-6 relative overflow-hidden">
        <div className="mx-auto max-w-[1240px]">
          <ScrollReveal3D className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="max-w-[640px]">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/20 px-3 py-1 text-xs font-bold text-foreground border border-accent/40">
                <Sparkles className="size-3.5 text-accent" /> Live Simulator Engine
              </div>
              <h2 className="mt-3 font-heading text-3xl sm:text-4xl font-extrabold text-heading">
                Interactive Learning &amp; Game Showcase
              </h2>
              <p className="mt-2 text-base text-muted-foreground">
                Practice speech delivery, crisis email triage, and analytical deduction through gamified simulators with real-time feedback.
              </p>
            </div>

            {/* Game Navigation Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => scrollGames('left')}
                className="flex size-10 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-xs hover:border-accent hover:text-accent transition-colors"
                aria-label="Previous game"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => scrollGames('right')}
                className="flex size-10 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-xs hover:border-accent hover:text-accent transition-colors"
                aria-label="Next game"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
          </ScrollReveal3D>

          {/* Swipeable Game Carousel */}
          <div
            ref={gameCarouselRef}
            className="mt-10 flex gap-6 overflow-x-auto pb-4 pt-1 snap-x snap-mandatory scrollbar-none"
            style={{ scrollBehavior: 'smooth' }}
          >
            {REAL_GAMES.map((game) => (
              <div
                key={game.id}
                className="w-[300px] sm:w-[350px] shrink-0 snap-start flex flex-col"
              >
                <Interactive3DGameCard
                  game={game}
                  userAuthenticated={Boolean(user)}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ 8. FEATURED PROGRAMS */}
      <section className="px-6">
        <div className="mx-auto max-w-[1240px]">
          <ScrollReveal3D className="flex flex-wrap items-end justify-between gap-6">
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
            <Button asChild variant="secondary" size="md" className="rounded-xl font-bold">
              <Link href="/courses">
                View All Programs
                <ArrowRight className="size-4 ml-1" />
              </Link>
            </Button>
          </ScrollReveal3D>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courseList.map((course, idx) => (
              <ScrollReveal3D key={course.id || course.slug} delayMs={idx * 80}>
                <Link href={`/courses/${course.slug}`} className="group block h-full">
                  <TiltCard3D
                    maxAngle={7}
                    scale={1.03}
                    className="flex h-full flex-col justify-between p-7 hover:border-accent/50 hover:shadow-card-hover transition-all duration-300"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="rounded-xl bg-secondary px-2.5 py-1 text-xs font-bold text-secondary-foreground shadow-xs">
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
                  </TiltCard3D>
                </Link>
              </ScrollReveal3D>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ 9. MEET OUR EXPERT TRAINERS — 3D SHOWCASE */}
      <section className="px-6">
        <div className="mx-auto max-w-[1240px]">
          <ScrollReveal3D className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="max-w-[640px]">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/20 px-3 py-1 text-xs font-bold text-foreground border border-accent/40">
                <Sparkles className="size-3.5 text-accent" /> Master Facilitators
              </div>
              <h2 className="mt-3 font-heading text-3xl sm:text-4xl font-extrabold text-heading">
                Meet Our Expert Trainers
              </h2>
              <p className="mt-2 text-base text-muted-foreground">
                Learn directly from distinguished corporate facilitators, master storytellers, and executive leadership coaches.
              </p>
            </div>

            {/* Trainer Carousel Navigation Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => scrollTrainers('left')}
                className="flex size-10 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-xs hover:border-accent hover:text-accent transition-colors"
                aria-label="Previous trainer"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => scrollTrainers('right')}
                className="flex size-10 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-xs hover:border-accent hover:text-accent transition-colors"
                aria-label="Next trainer"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
          </ScrollReveal3D>

          {/* Swipeable Trainer Carousel */}
          <div
            ref={trainerCarouselRef}
            className="mt-10 flex gap-6 overflow-x-auto pb-4 pt-1 snap-x snap-mandatory scrollbar-none"
            style={{ scrollBehavior: 'smooth' }}
          >
            {trainerList.map((trainer: any) => {
              const profileSlug =
                trainer.publicSlug ||
                trainer.slug ||
                (trainer.name ? trainer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') : trainer.id);
              const trainerName = trainer.displayName || trainer.name || 'Faculty Trainer';
              const designation = trainer.headline || trainer.designation || 'Corporate Trainer';
              const experience = trainer.yearsExperience
                ? `${trainer.yearsExperience} Years Exp`
                : 'Senior Mentor';
              const rating = trainer.rating ? Number(trainer.rating).toFixed(1) : '5.0';
              const skills: string[] =
                trainer.expertiseTags || trainer.expertise || ['Communication', 'Interview Prep'];

              return (
                <div
                  key={trainer.id || profileSlug}
                  className="w-[310px] sm:w-[350px] shrink-0 snap-start flex flex-col"
                >
                  <TiltCard3D
                    maxAngle={8}
                    scale={1.03}
                    className="flex h-full flex-col justify-between p-6 group hover:border-accent/50 hover:shadow-card-hover transition-all duration-300"
                  >
                    <div>
                      {/* Top Avatar & Badges */}
                      <div className="flex items-start justify-between">
                        <div className="relative size-16 sm:size-18 rounded-2xl overflow-hidden border-2 border-primary/20 bg-muted flex items-center justify-center shrink-0 shadow-xs">
                          {trainer.profilePhotoUrl ? (
                            <img
                              src={trainer.profilePhotoUrl}
                              alt={trainerName}
                              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="size-full flex items-center justify-center bg-primary/10 text-primary text-xl font-bold">
                              {trainerName.charAt(0)}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <Star className="size-3 fill-amber-500 text-amber-500" /> {rating}
                          </span>
                          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground border border-border">
                            {experience}
                          </span>
                        </div>
                      </div>

                      {/* Name & Headline */}
                      <h3 className="mt-4 font-heading text-lg font-bold text-heading group-hover:text-primary transition-colors truncate">
                        {trainerName}
                      </h3>
                      <p className="text-xs font-semibold text-primary truncate">
                        {designation}
                      </p>

                      {/* Location */}
                      {trainer.location && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MapPin className="size-3" /> {trainer.location}
                        </p>
                      )}

                      {/* Bio Snippet */}
                      <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed line-clamp-3">
                        {trainer.bio ||
                          'Accomplished educator committed to experiential coaching, high-impact workplace communication, and executive career readiness.'}
                      </p>

                      {/* Specialization Tags */}
                      {skills.length > 0 && (
                        <div className="mt-3.5 flex flex-wrap gap-1.5">
                          {skills.slice(0, 3).map((skill: string) => (
                            <span
                              key={skill}
                              className="rounded-lg bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground border border-border"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bottom View Profile Action */}
                    <div className="mt-5 border-t border-border pt-4">
                      <Button
                        asChild
                        variant="secondary"
                        size="sm"
                        className="w-full rounded-xl font-bold group-hover:bg-accent group-hover:text-accent-foreground group-hover:border-accent transition-colors"
                      >
                        <Link href={`/trainers/${profileSlug}`}>
                          View Profile{' '}
                          <ArrowRight className="size-3.5 ml-1 transition-transform group-hover:translate-x-1" />
                        </Link>
                      </Button>
                    </div>
                  </TiltCard3D>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ 10. FINAL CTA SECTION WITH 3D AMBIENCE */}
      <section className="px-6">
        <ScrollReveal3D className="mx-auto max-w-[1240px]">
          <TiltCard3D
            maxAngle={5}
            scale={1.01}
            className="relative overflow-hidden rounded-3xl bg-foreground p-8 sm:p-14 text-background shadow-2xl border-foreground"
          >
            {/* Ambient Background Glow Highlights */}
            <div className="absolute top-0 right-0 -mr-20 -mt-20 size-80 rounded-full bg-accent/20 blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 -ml-20 -mb-20 size-80 rounded-full bg-secondary/20 blur-3xl pointer-events-none" />

            <div className="relative z-10 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <div>
                <span className="inline-flex rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground shadow-xs">
                  Career Acceleration
                </span>
                <h2 className="mt-4 font-heading text-3xl sm:text-5xl font-extrabold text-background leading-tight">
                  Ready to become corporate-ready?
                </h2>
                <p className="mt-4 max-w-[560px] text-base text-background/80 leading-relaxed">
                  Join hundreds of students currently mastering verbal communication, pitch delivery, executive writing, and interview composure with Winners Creek LMS.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 lg:justify-end">
                <Button
                  asChild
                  variant="primary"
                  size="lg"
                  className="rounded-2xl px-8 text-base font-bold shadow-lg hover:shadow-xl transition-all"
                >
                  <Link href="/signup">Create Your Account</Link>
                </Button>
                <Button
                  asChild
                  variant="secondary"
                  size="lg"
                  className="rounded-2xl px-8 text-base font-bold border-background/20 text-background bg-transparent hover:bg-background/10 transition-all"
                >
                  <Link href="/login">Sign In</Link>
                </Button>
              </div>
            </div>
          </TiltCard3D>
        </ScrollReveal3D>
      </section>
    </div>
  );
}
