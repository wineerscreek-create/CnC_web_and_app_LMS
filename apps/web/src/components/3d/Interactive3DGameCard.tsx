'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Gamepad2,
  KeyRound,
  Search,
  Dices,
  ShieldCheck,
  Inbox,
  Headphones,
  Mic,
  ArrowRight,
  Sparkles,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { TiltCard3D } from './TiltCard3D';
import { Button } from '@/components/ui/button';

export interface GameInfo {
  id: string;
  name: string;
  tagline: string;
  mechanic: string;
  competency: string;
  category: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  xp: number;
  icon: any;
  colorScheme: 'orange' | 'teal' | 'indigo' | 'amber';
}

export const REAL_GAMES: GameInfo[] = [
  {
    id: 'pubspeak-arena',
    name: 'PubSpeak Arena',
    tagline: 'Grand Auditorium Stage',
    mechanic: 'Rhetoric Impact, Stage Presence & Audience Influence',
    competency: 'Verbal Communication & Pitching',
    category: 'Speech Simulation',
    difficulty: 'Intermediate',
    xp: 250,
    icon: Mic,
    colorScheme: 'orange',
  },
  {
    id: 'read-escape',
    name: 'Read Escape',
    tagline: 'Cryptic Chamber Vault',
    mechanic: 'Lockout Puzzles & Reading Evidences',
    competency: 'Comprehension & Deduction',
    category: 'Reading Mastery',
    difficulty: 'Beginner',
    xp: 180,
    icon: KeyRound,
    colorScheme: 'indigo',
  },
  {
    id: 'reading-detective',
    name: 'Reading Detective',
    tagline: 'Forensic Investigation Dossier',
    mechanic: 'Clue Deduction & Timeline Analysis',
    competency: 'Critical Thinking & Synthesis',
    category: 'Analytical Reasoning',
    difficulty: 'Advanced',
    xp: 320,
    icon: Search,
    colorScheme: 'teal',
  },
  {
    id: 'snake-ladder',
    name: 'Corporate Snake & Ladder',
    tagline: 'Dynamic Board Expedition',
    mechanic: 'Dice Velocity, Ladder Ascents & Trap Evasions',
    competency: 'Workplace Ethics & Judgment',
    category: 'Decision Simulation',
    difficulty: 'Beginner',
    xp: 150,
    icon: Dices,
    colorScheme: 'amber',
  },
  {
    id: 'email-escape',
    name: 'Email Escape',
    tagline: 'Cyber Terminal Defense',
    mechanic: 'Phishing Threat Vector Analysis & Etiquette',
    competency: 'Executive Writing & Security',
    category: 'Professional Writing',
    difficulty: 'Intermediate',
    xp: 220,
    icon: ShieldCheck,
    colorScheme: 'orange',
  },
  {
    id: 'inbox-rescue',
    name: 'Inbox Rescue',
    tagline: 'Critical Ticket Triage Command',
    mechanic: 'SLA Escalation & Customer Sentiment Defense',
    competency: 'Prioritization & Escalation',
    category: 'Business Operations',
    difficulty: 'Intermediate',
    xp: 200,
    icon: Inbox,
    colorScheme: 'indigo',
  },
  {
    id: 'listening-quest',
    name: 'Listening Quest',
    tagline: 'Acoustic Audio Intelligence',
    mechanic: 'Voice Synthesis & Subtle Nuance Extraction',
    competency: 'Active Listening & Tone Empathy',
    category: 'Auditory Analysis',
    difficulty: 'Advanced',
    xp: 280,
    icon: Headphones,
    colorScheme: 'teal',
  },
];

interface Interactive3DGameCardProps {
  game: GameInfo;
  userAuthenticated?: boolean;
}

export function Interactive3DGameCard({
  game,
  userAuthenticated = false,
}: Interactive3DGameCardProps) {
  const Icon = game.icon;

  const colorVariants = {
    orange: 'border-accent/40 bg-accent/10 text-accent',
    teal: 'border-secondary/40 bg-secondary/10 text-secondary',
    indigo: 'border-primary/40 bg-primary/10 text-primary',
    amber: 'border-amber-500/40 bg-amber-500/10 text-amber-500',
  };

  const playHref = userAuthenticated ? `/student/games/${game.id}` : `/login?redirect=/student/games`;

  return (
    <TiltCard3D
      maxAngle={7}
      scale={1.03}
      className="group flex flex-col justify-between p-6 sm:p-7 border-border hover:border-accent/50 hover:shadow-card-hover transition-all duration-300"
    >
      <div>
        {/* Top Badges */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'flex size-11 items-center justify-center rounded-2xl border shadow-xs transition-transform duration-300 group-hover:scale-110',
                colorVariants[game.colorScheme]
              )}
            >
              <Icon className="size-5" />
            </span>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {game.category}
              </span>
              <h4 className="font-heading text-base font-bold text-heading leading-tight">
                {game.name}
              </h4>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-full bg-muted/80 border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground">
            <Zap className="size-3 text-accent fill-accent" />
            <span>+{game.xp} XP</span>
          </div>
        </div>

        {/* Tagline */}
        <div className="mt-5 rounded-2xl bg-muted/50 p-3 border border-border/80">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-accent shrink-0" />
            <span>{game.tagline}</span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
            {game.mechanic}
          </p>
        </div>

        {/* Competency Tag */}
        <div className="mt-4 flex items-center justify-between text-xs">
          <span className="text-muted-foreground text-[11px]">Core Skill:</span>
          <span className="font-medium text-foreground text-[11px]">{game.competency}</span>
        </div>
      </div>

      {/* CTA Button */}
      <div className="mt-6 pt-4 border-t border-border flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {game.difficulty}
        </span>
        <Button
          asChild
          variant="secondary"
          size="sm"
          className="rounded-xl group-hover:bg-accent group-hover:text-accent-foreground group-hover:border-accent transition-colors"
        >
          <Link href={playHref}>
            Launch Simulator
            <ArrowRight className="size-3.5 ml-1 transition-transform group-hover:translate-x-1" />
          </Link>
        </Button>
      </div>
    </TiltCard3D>
  );
}

