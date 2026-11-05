'use client';

import { Award, Flame, Lock, ShieldCheck, Zap } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { AsyncSection } from '@/components/shared/state';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';
import { formatDate, num, pct } from '@/lib/format';
import { iconFor } from '@/lib/icons';

export default function AchievementsPage() {
  const query = useApi<any>('/student/achievements');

  return (
    <AsyncSection query={query} skeleton="cards">
      {(data) => (
        <div className="space-y-6">
          <PageHeader
            title="Milestone Achievements"
            description="Competency badges earned through verified assessment milestones and objective practice criteria."
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="border-border bg-card shadow-card">
              <CardBody className="p-5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Experience</p>
                <p className="tnum mt-2 flex items-center gap-2 text-2xl font-bold font-mono text-heading">
                  <Zap className="size-5 text-accent" aria-hidden />
                  {num(data.xp.total)} XP
                </p>
                <ProgressBar
                  className="mt-3"
                  showValue={false}
                  value={
                    ((data.xp.total - data.xp.levelFloor) /
                      Math.max(1, data.xp.levelCeiling - data.xp.levelFloor)) *
                    100
                  }
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Level {data.xp.level} · {num(data.xp.thisWeek)} XP accumulated this week
                </p>
              </CardBody>
            </Card>

            <Card className="border-border bg-card shadow-card">
              <CardBody className="p-5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Practice Streak</p>
                <p className="tnum mt-2 flex items-center gap-2 text-2xl font-bold font-mono text-heading">
                  <Flame className="size-5 text-accent" aria-hidden />
                  {data.streak.days} Days
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Last active session on {data.streak.lastActiveOn}
                </p>
              </CardBody>
            </Card>

            <Card className="border-border bg-card shadow-card">
              <CardBody className="p-5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Badges Unlocked</p>
                <p className="tnum mt-2 text-2xl font-bold font-mono text-heading">
                  {data.badges.filter((badge: any) => badge.earned).length}
                  <span className="text-sm font-semibold text-muted-foreground ml-1">
                    /{data.badges.length}
                  </span>
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Continuous progression unlocked per evaluated competency
                </p>
              </CardBody>
            </Card>
          </div>

          <div>
            <h2 className="text-base font-bold font-heading text-heading mb-4">Competency Badges</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.badges.map((badge: any) => {
                const Icon = iconFor(badge.icon, Award);
                return (
                  <Card
                    key={badge.code}
                    className={cn(
                      'border transition-all duration-200',
                      badge.earned
                        ? 'border-accent bg-card shadow-card'
                        : 'border-border bg-muted/40 opacity-75'
                    )}
                  >
                    <CardBody className="flex items-start gap-4 p-5">
                      <span
                        className={cn(
                          'flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-xs transition-transform duration-200',
                          badge.earned
                            ? 'bg-accent text-accent-foreground'
                            : 'bg-muted text-muted-foreground',
                        )}
                        aria-hidden
                      >
                        {badge.earned ? (
                          <Icon className="size-5" />
                        ) : (
                          <Lock className="size-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold font-heading text-heading">{badge.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {badge.description}
                        </p>
                        {badge.earned ? (
                          <span className="inline-block mt-3 px-2 py-0.5 rounded text-[11px] font-bold bg-secondary text-secondary-foreground">
                            Earned
                          </span>
                        ) : (
                          <div className="mt-3">
                            <ProgressBar
                              value={badge.progressPercent}
                              showValue={false}
                              thin
                            />
                            <p className="mt-1.5 text-[11px] font-mono text-muted-foreground">
                              {pct(badge.progressPercent, 0)} completed
                            </p>
                          </div>
                        )}
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </AsyncSection>
  );
}
