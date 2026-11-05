'use client';

import {
  Award,
  Flame,
  Gamepad2,
  Trophy,
  Zap,
  KeyRound,
  Search,
  Dices,
  ShieldCheck,
  Inbox,
  Headphones,
  Mic,
  Clock,
  Sparkles,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/misc';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';
import { formatDate, num } from '@/lib/format';
import { iconFor } from '@/lib/icons';

const GAME_META: Record<
  string,
  {
    icon: any;
    tagline: string;
    mechanicLabel: string;
  }
> = {
  'read-escape': {
    icon: KeyRound,
    tagline: 'Cryptic Chamber Vault',
    mechanicLabel: 'Lockout Puzzles & Reading Evidences',
  },
  'reading-detective': {
    icon: Search,
    tagline: 'Forensic Investigation Dossier',
    mechanicLabel: 'Clue Deduction & Timeline Analysis',
  },
  'snake-ladder': {
    icon: Dices,
    tagline: 'Dynamic Board Expedition',
    mechanicLabel: 'Dice Velocity, Ladder Ascents & Trap Evasions',
  },
  'email-escape': {
    icon: ShieldCheck,
    tagline: 'Cyber Terminal Defense',
    mechanicLabel: 'Phishing Threat Vector Analysis & Etiquette',
  },
  'inbox-rescue': {
    icon: Inbox,
    tagline: 'Critical Ticket Triage Command',
    mechanicLabel: 'SLA Escalation & Customer Sentiment Defense',
  },
  'listening-quest': {
    icon: Headphones,
    tagline: 'Acoustic Audio Intelligence',
    mechanicLabel: 'Voice Synthesis & Subtle Nuance Extraction',
  },
  'pubspeak-arena': {
    icon: Mic,
    tagline: 'Grand Auditorium Stage',
    mechanicLabel: 'Rhetoric Impact, Stage Presence & Audience Influence',
  },
};

export default function GamesPage() {
  const [category, setCategory] = React.useState('all');
  const query = useApi<any>('/student/games');

  return (
    <div className="space-y-6">
      <AsyncSection query={query} skeleton="cards">
        {(raw) => {
          const data = {
            games: raw?.games || [],
            categories: raw?.categories || [],
            totalPlayed: raw?.totalPlayed || 0,
            xp: raw?.xp || { total: 0, level: 1, levelFloor: 0, levelCeiling: 500 },
            streak: raw?.streak || { days: 0 },
            weeklyQuest: raw?.weeklyQuest || { earned: 0, target: 500, percent: 0, endsAt: new Date().toISOString() },
            badges: raw?.badges || [],
            leaderboard: raw?.leaderboard || [],
            ...raw,
          };
          const visible = (data.games || []).filter(
            (game: any) => category === 'all' || game.category === category,
          );

          return (
            <>
              <PageHeader
                title="Interactive Skill Games"
                description="Simulated business scenarios, reading comprehension quests, and speech games linked to verified EEDI competencies."
                actions={
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 rounded-2xl bg-secondary text-secondary-foreground border border-border px-3 py-1.5 shadow-soft">
                      <Flame className="size-4 fill-accent text-accent" aria-hidden />
                      <span className="text-xs font-bold font-mono text-secondary-foreground">
                        {data.streak?.days ?? 0}-Day Streak
                      </span>
                    </div>
                    <div className="rounded-2xl bg-foreground px-3 py-1.5 text-xs font-bold text-card shadow-soft">
                      Level {data.xp?.level ?? 1}
                    </div>
                  </div>
                }
              />

              {/* Status & Quest Overview Cards */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Card className="border-border bg-card shadow-card">
                  <CardBody className="p-5">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Experience Progression</p>
                      <Sparkles className="size-4 text-accent" />
                    </div>
                    <p className="tnum mt-2 text-2xl font-bold font-mono text-heading">
                      {num(data.xp?.total ?? 0)}{' '}
                      <span className="text-xs font-semibold text-gold-text">XP</span>
                    </p>
                    <ProgressBar
                      className="mt-3"
                      showValue={false}
                      value={Math.min(100, Math.max(0,
                        (((data.xp?.total ?? 0) - (data.xp?.levelFloor ?? 0)) /
                          Math.max(1, (data.xp?.levelCeiling ?? 500) - (data.xp?.levelFloor ?? 0))) *
                        100
                      ))}
                    />
                    <p className="mt-2 text-xs text-muted-foreground flex items-center justify-between">
                      <span>Next rank: Level {(data.xp?.level ?? 1) + 1}</span>
                      <span className="font-semibold text-foreground">
                        {num((data.xp?.levelCeiling ?? 500) - (data.xp?.total ?? 0))} XP needed
                      </span>
                    </p>
                  </CardBody>
                </Card>

                <Card className="border-border bg-card shadow-card">
                  <CardBody className="p-5">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Weekly Quest Target</p>
                      <TrendingUp className="size-4 text-primary" />
                    </div>
                    <p className="tnum mt-2 text-2xl font-bold font-mono text-heading">
                      {num(data.weeklyQuest?.earned ?? 0)}
                      <span className="text-sm font-medium text-muted-foreground ml-1">
                        / {num(data.weeklyQuest?.target ?? 500)} XP
                      </span>
                    </p>
                    <ProgressBar
                      className="mt-3"
                      showValue={false}
                      value={Math.min(100, Math.max(0, data.weeklyQuest?.percent ?? 0))}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Cycle resets on {formatDate(data.weeklyQuest?.endsAt)}
                    </p>
                  </CardBody>
                </Card>

                <Card className="border-border bg-card shadow-card sm:col-span-2 xl:col-span-1">
                  <CardBody className="p-5">
                    <div className="flex items-center justify-between pb-2 border-b border-border">
                      <div>
                        <CardTitle className="text-base font-bold font-heading text-heading">Mastery Badges</CardTitle>
                        <CardSubtitle className="text-xs text-muted-foreground">
                          {(data.badges || []).filter((badge: any) => badge.earned).length} earned milestone badges
                        </CardSubtitle>
                      </div>
                      <Button asChild variant="ghost" size="sm" className="text-xs">
                        <Link href="/student/achievements">View All</Link>
                      </Button>
                    </div>
                    <div className="mt-3">
                      <ul className="flex flex-wrap gap-2">
                        {(data.badges || []).slice(0, 6).map((badge: any) => {
                          const Icon = iconFor(badge.icon, Award);
                          return (
                            <li key={badge.code}>
                              <span
                                title={`${badge.title} — ${badge.earned ? 'earned' : `${badge.progressPercent}%`}`}
                                className={cn(
                                  'flex size-8 items-center justify-center rounded-xl transition-transform hover:scale-105 border',
                                  badge.earned
                                    ? 'bg-accent text-accent-foreground border-accent'
                                    : 'bg-muted text-muted-foreground border-border',
                                )}
                              >
                                <Icon className="size-4" aria-hidden />
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </CardBody>
                </Card>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter games by category">
                {['all', ...(data.categories || [])].map((item: string) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    aria-pressed={category === item}
                    className={cn(
                      'rounded-xl px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-all border',
                      category === item
                        ? 'border-accent bg-accent text-accent-foreground shadow-xs'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {item === 'all' ? 'All Arenas' : item}
                  </button>
                ))}
              </div>

              {/* Game Arenas Grid & Leaderboard */}
              <div className="grid gap-6 xl:grid-cols-[1fr_310px]">
                <div className="grid gap-5 sm:grid-cols-2">
                  {visible.map((game: any) => {
                    const meta = GAME_META[game.code] || GAME_META[game.id] || {
                      icon: Gamepad2,
                      tagline: 'Interactive Skill Arena',
                      mechanicLabel: 'Real-time Scenario Progression',
                    };
                    const GameIcon = meta.icon;

                    return (
                      <Card
                        key={game.id}
                        className="group flex flex-col overflow-hidden border-border bg-card shadow-card transition-all duration-300 hover:shadow-card hover:-translate-y-0.5"
                      >
                        {/* Game Header Banner */}
                        <div className="relative h-28 w-full bg-foreground p-4 flex flex-col justify-between">
                          <div className="flex items-center justify-between">
                            {game.isAssigned ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-secondary text-secondary-foreground border border-border">
                                <span className="size-1.5 rounded-full bg-foreground animate-pulse" />
                                Assigned
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium text-card/80 bg-card/10">
                                Open Arena
                              </span>
                            )}

                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-secondary text-secondary-foreground border border-border">
                              {game.difficulty || 'Adaptive'}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="size-9 rounded-xl flex items-center justify-center bg-accent text-accent-foreground shadow-xs">
                              <GameIcon className="size-5" />
                            </div>
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wider text-accent">
                                {meta.tagline}
                              </p>
                              <p className="text-[11px] text-card/70 line-clamp-1">
                                {meta.mechanicLabel}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Card Body */}
                        <div className="flex flex-1 flex-col p-5 space-y-4">
                          <div>
                            <h2 className="text-base font-bold font-heading text-heading">
                              {game.title}
                            </h2>
                            {game.assignment?.deadline && (
                              <p className="mt-1 text-xs font-medium text-muted-foreground flex items-center gap-1">
                                <Clock className="size-3 text-gold-text" />
                                Due: {formatDate(game.assignment.deadline)}
                              </p>
                            )}
                            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                              {game.description}
                            </p>
                          </div>

                          {/* Skill Tags */}
                          <div className="flex flex-wrap gap-1.5">
                            {(game.skills || []).map((skill: string) => (
                              <span
                                key={skill}
                                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-muted text-foreground border border-border"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>

                          {/* Performance Stats */}
                          <dl className="grid grid-cols-3 gap-2 text-center pt-1">
                            <div className="rounded-xl bg-muted/40 border border-border p-2">
                              <dd className="text-sm font-bold font-mono text-heading">
                                {game.bestScore ? `${num(game.bestScore)}%` : '—'}
                              </dd>
                              <dt className="text-[10px] uppercase font-semibold text-muted-foreground mt-0.5">Best Score</dt>
                            </div>
                            <div className="rounded-xl bg-muted/40 border border-border p-2">
                              <dd className="text-sm font-bold font-mono text-heading">
                                {num(game.attempts ?? 0)}
                              </dd>
                              <dt className="text-[10px] uppercase font-semibold text-muted-foreground mt-0.5">Attempts</dt>
                            </div>
                            <div className="rounded-xl bg-muted/40 border border-border p-2">
                              <dd className="text-sm font-bold font-mono text-heading">
                                +{game.xpReward ?? 100}
                              </dd>
                              <dt className="text-[10px] uppercase font-semibold text-muted-foreground mt-0.5">Reward XP</dt>
                            </div>
                          </dl>

                          {/* Launch CTA */}
                          <div className="mt-auto pt-3">
                            <Button
                              asChild
                              variant="primary"
                              className="w-full flex items-center justify-center gap-1.5"
                            >
                              <Link href={`/student/games/${game.code || game.id}/play`}>
                                <span>{game.attempts ? 'Resume Quest' : 'Launch Game'}</span>
                                <span className="text-xs font-normal opacity-70">· {game.durationMinutes || 10}m</span>
                                <ChevronRight className="size-4 ml-0.5" />
                              </Link>
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {/* Batch Leaderboard Sidebar */}
                <Card className="self-start border-border bg-card shadow-card p-5">
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <div>
                      <CardTitle className="text-base font-bold font-heading text-heading">Cohort Standings</CardTitle>
                      <CardSubtitle className="text-xs text-muted-foreground">Current batch leaderboard</CardSubtitle>
                    </div>
                    <Trophy className="size-4 text-accent" aria-hidden />
                  </div>
                  <div className="mt-3">
                    <ol className="space-y-2">
                      {(data.leaderboard || []).map((row: any) => (
                        <li
                          key={row.participantUserId ?? row.studentUserId ?? row.name}
                          className="flex items-center gap-2.5 rounded-xl p-2 transition-colors hover:bg-muted"
                        >
                          <span
                            className={cn(
                              'size-6 flex items-center justify-center text-xs font-bold font-mono rounded-lg shrink-0',
                              row.rank === 1
                                ? 'bg-accent text-accent-foreground'
                                : row.rank === 2
                                ? 'bg-foreground text-card'
                                : row.rank === 3
                                ? 'bg-secondary text-secondary-foreground'
                                : 'text-muted-foreground',
                            )}
                          >
                            {row.rank}
                          </span>
                          <Avatar name={row.name} color={row.avatarColor} size={28} />
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{row.name}</span>
                          <span className="tnum flex shrink-0 items-center gap-1 text-xs font-bold font-mono text-heading">
                            <Zap className="size-3 text-accent" aria-hidden />
                            {num(row.xp)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </Card>
              </div>
            </>
          );
        }}
      </AsyncSection>
    </div>
  );
}
