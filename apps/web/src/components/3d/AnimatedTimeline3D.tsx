'use client';

import * as React from 'react';
import {
  Compass,
  GraduationCap,
  Sparkles,
  Award,
  TrendingUp,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { TiltCard3D } from './TiltCard3D';

const STEPS = [
  {
    step: '01',
    title: 'Discover Learning',
    subtitle: 'Competency Mapping',
    desc: 'Explore standardized curriculum maps spanning verbal communication, critical thinking, executive presence, and corporate expectations.',
    icon: Compass,
    accent: 'border-accent/40 text-accent bg-accent/10',
    color: 'accent',
  },
  {
    step: '02',
    title: 'Enroll in Courses',
    subtitle: 'Guided Roadmaps',
    desc: 'Join cohort-aligned modules with clear weekly milestones, structured reading dossiers, and faculty-guided learning roadmaps.',
    icon: GraduationCap,
    accent: 'border-primary/40 text-primary bg-primary/10',
    color: 'primary',
  },
  {
    step: '03',
    title: 'Interactive Learning',
    subtitle: 'Simulations & Practice',
    desc: 'Engage with immersive speech arenas, debate scenarios, and 6+ gamified soft-skills simulators with immediate AI feedback.',
    icon: Sparkles,
    accent: 'border-secondary/40 text-secondary bg-secondary/10',
    color: 'secondary',
  },
  {
    step: '04',
    title: 'Complete Assessments',
    subtitle: 'Rubrics & AI Scoring',
    desc: 'Undergo rigorous rubric-based evaluations measuring the 7 core employability pillars with attributed faculty reviews.',
    icon: Award,
    accent: 'border-amber-500/40 text-amber-500 bg-amber-500/10',
    color: 'amber',
  },
  {
    step: '05',
    title: 'Track & Get Certified',
    subtitle: 'Placement Readiness',
    desc: 'Attain an official Readiness Index score, blockchain-ready verifiable certificates, and direct visibility for placement officers.',
    icon: TrendingUp,
    accent: 'border-emerald-500/40 text-emerald-500 bg-emerald-500/10',
    color: 'emerald',
  },
];

export function AnimatedTimeline3D() {
  const [activeStep, setActiveStep] = React.useState<number>(0);

  return (
    <div className="relative w-full">
      {/* Background Animated Connection Conduit (Desktop) */}
      <div className="hidden lg:block absolute top-[44px] left-[5%] right-[5%] h-[3px] bg-border/60 -z-0">
        <div
          className="h-full bg-gradient-to-r from-accent via-primary to-emerald-500 transition-all duration-700 rounded-full"
          style={{ width: `${(activeStep / (STEPS.length - 1)) * 100}%` }}
        />
      </div>

      {/* Grid of 5 Timeline Steps */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5 relative z-10">
        {STEPS.map((item, index) => {
          const Icon = item.icon;
          const isSelected = activeStep === index;

          return (
            <div
              key={item.step}
              onMouseEnter={() => setActiveStep(index)}
              className="flex flex-col h-full"
            >
              <TiltCard3D
                maxAngle={8}
                scale={1.03}
                className={cn(
                  'h-full p-6 flex flex-col justify-between transition-all duration-300',
                  isSelected
                    ? 'border-accent shadow-card-hover bg-card'
                    : 'border-border/80 bg-card/80 hover:border-accent/40'
                )}
              >
                <div>
                  {/* Step Header with 3D Node & Badge */}
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'flex size-10 items-center justify-center rounded-2xl text-xs font-black tracking-wider border shadow-xs transition-transform duration-300 group-hover:scale-110',
                        item.accent
                      )}
                    >
                      {item.step}
                    </span>
                    <div
                      className={cn(
                        'flex size-9 items-center justify-center rounded-xl border border-border bg-muted/50 transition-colors',
                        isSelected && 'bg-foreground text-background border-foreground'
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                  </div>

                  {/* Title & Tag */}
                  <div className="mt-5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {item.subtitle}
                    </span>
                    <h3 className="mt-1 font-heading text-base font-bold text-heading leading-tight">
                      {item.title}
                    </h3>
                  </div>

                  {/* Description */}
                  <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                    {item.desc}
                  </p>
                </div>

                {/* Footer Check Indicator */}
                <div className="mt-6 pt-4 border-t border-border flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2
                      className={cn(
                        'size-3.5 transition-colors',
                        isSelected ? 'text-accent' : 'text-muted-foreground/60'
                      )}
                    />
                    Phase {index + 1}
                  </span>
                  {isSelected && (
                    <span className="text-accent text-[10px] font-bold uppercase tracking-wider animate-pulse">
                      Active Stage
                    </span>
                  )}
                </div>
              </TiltCard3D>
            </div>
          );
        })}
      </div>
    </div>
  );
}

