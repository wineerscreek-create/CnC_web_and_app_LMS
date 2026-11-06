'use client';

import {
  CheckCircle,
  Gamepad2,
  History,
  Sparkles,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';
import { formatDate, num } from '@/lib/format';

interface AdminGame {
  id: string;
  code: string;
  title: string;
  description?: string;
  category: string;
  difficulty?: string;
  xpReward?: number;
  skillsTrained: string[];
  isEnabled?: boolean;
  collegePlays: number;
  collegeAvgScore: number;
}

function GameAttemptsDialog({
  game,
  open,
  onOpenChange,
}: {
  game: AdminGame | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [page, setPage] = React.useState(1);
  const attemptsQuery = useApi<any>(
    game ? `/admin/games/${game.code}/attempts` : null,
    { page, pageSize: 15 },
    { enabled: Boolean(open && game) }
  );

  const items = attemptsQuery.data?.data ?? [];
  const pagination = attemptsQuery.data?.pagination;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gamepad2 className="size-5 text-primary" />
            <span>Attempt History — {game?.title}</span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Authoritative persistent attempt records for participants in your institution.
          </p>

          {attemptsQuery.loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading attempts...</div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Users className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold">No recorded attempts yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                No participants in your institution have played this challenge yet.
              </p>
            </div>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <Tr>
                    <Th>Participant</Th>
                    <Th>Roll No</Th>
                    <Th>Batch / Dept</Th>
                    <Th align="right">Score</Th>
                    <Th align="right">Accuracy</Th>
                    <Th align="right">Time Taken</Th>
                    <Th align="right">Date</Th>
                  </Tr>
                </thead>
                <tbody>
                  {items.map((att: any) => (
                    <Tr key={att.id}>
                      <Td>
                        <span className="block font-semibold text-foreground">{att.participantName}</span>
                        <span className="block text-2xs text-muted-foreground">{att.participantEmail}</span>
                      </Td>
                      <Td className="font-mono text-xs">{att.rollNumber}</Td>
                      <Td className="text-xs">
                        <span className="block text-foreground">{att.batchName}</span>
                        <span className="block text-2xs text-muted-foreground">{att.departmentName}</span>
                      </Td>
                      <Td align="right" className="font-bold text-foreground">
                        {att.score ?? att.rawScore ?? 0}
                      </Td>
                      <Td align="right" className="text-xs">
                        {att.accuracy != null ? `${num(att.accuracy, 1)}%` : '—'}
                      </Td>
                      <Td align="right" className="text-xs text-muted-foreground">
                        {att.durationSeconds != null ? `${att.durationSeconds}s` : '—'}
                      </Td>
                      <Td align="right" className="text-xs text-muted-foreground">
                        {att.completedAt ? formatDate(att.completedAt, true) : (att.startedAt ? formatDate(att.startedAt, true) : '—')}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 text-xs">
              <span className="text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminGamesPage() {
  const query = useApi<any>('/admin/games');
  const [inspectingGame, setInspectingGame] = React.useState<AdminGame | null>(null);

  const rawGames = query.data?.data ?? query.data?.games ?? query.data ?? [];
  const games: AdminGame[] = (Array.isArray(rawGames) ? rawGames : []).map((g: any) => ({
    id: g.id || g.code,
    code: g.code,
    title: g.title || g.code,
    description: g.description || `Gamified ${g.category || ''} cognitive challenge.`,
    category: g.category || 'General',
    difficulty: g.difficulty || 'Intermediate',
    xpReward: g.xpReward ?? 50,
    isEnabled: Boolean(g.isEnabled ?? true),
    collegePlays: g.totalAttempts ?? 0,
    collegeAvgScore: g.averageScore ?? 0,
    skillsTrained: Array.isArray(g.skillsTrained) ? g.skillsTrained : [g.category, g.difficulty].filter(Boolean),
  }));

  const totalPlays = games.reduce((acc, g) => acc + (g.collegePlays || 0), 0);
  const activeCount = games.filter((g) => g.isEnabled).length;
  const avgScore =
    games.filter((g) => g.collegePlays > 0).length > 0
      ? games.reduce((acc, g) => acc + (g.collegeAvgScore || 0), 0) /
        games.filter((g) => g.collegePlays > 0).length
      : 0;

  return (
    <GlobalPageBackground
      image="/images/backgrounds/games.webp"
      variant="dark"
      orbTone="purple"
      className="min-h-full rounded-2xl p-4 sm:p-6 space-y-6"
    >
      <PageHeader
        title="Institution Games & Analytics"
        description="Monitor campus-wide cognitive skill development and inspect individual participant attempt history."
        actions={
          <Badge tone="indigo" dot>
            {activeCount} of {games.length} Games Active
          </Badge>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Campus Game Plays"
          value={num(totalPlays)}
          tone="indigo"
          icon={<Gamepad2 className="size-4" />}
          hint="Total participant attempts"
        />
        <StatCard
          label="Active Challenges"
          value={`${activeCount} / ${games.length}`}
          tone="success"
          icon={<CheckCircle className="size-4" />}
          hint="Available to participants"
        />
        <StatCard
          label="Campus Avg Score"
          value={avgScore > 0 ? `${num(avgScore, 1)}%` : 'N/A'}
          tone="amber"
          icon={<Trophy className="size-4" />}
          hint="Average participant performance"
        />
        <StatCard
          label="Catalog Coverage"
          value={`${games.length} Modules`}
          tone="info"
          icon={<Sparkles className="size-4" />}
          hint="Across soft & tech skills"
        />
      </div>

      {/* Games list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {games.map((game) => (
          <Card
            key={game.code}
            className="flex flex-col justify-between transition-all"
          >
            <CardBody className="p-5 flex flex-col justify-between h-full space-y-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="p-2.5 rounded-xl inline-block bg-indigo/10 text-indigo">
                    <Gamepad2 className="size-5" />
                  </span>
                  <Badge tone="success">
                    Active Module
                  </Badge>
                </div>

                <h3 className="font-bold text-base text-foreground mt-3">
                  {game.title}
                </h3>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                  {game.description}
                </p>

                <div className="flex flex-wrap gap-1 mt-3">
                  <Badge tone="neutral">
                    {game.category}
                  </Badge>
                  {(game.skillsTrained || []).slice(0, 2).map((s) => (
                    <span
                      key={s}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground"
                    >
                      {s}
                    </span>
                  ))}
                </div>

                <div className="mt-4 pt-3 border-t border-border grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="p-2 rounded-lg bg-muted/50">
                    <p className="font-bold text-foreground">
                      {game.collegePlays}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Campus Plays</p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/50">
                    <p className="font-bold text-foreground">
                      {game.collegeAvgScore ? `${num(game.collegeAvgScore, 1)}%` : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Avg Score</p>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-between">
                <span className="text-[11px] font-mono text-muted-foreground">{game.code}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setInspectingGame(game)}
                  className="text-xs flex items-center gap-1.5"
                >
                  <History className="size-3.5" />
                  View Attempts
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <GameAttemptsDialog
        game={inspectingGame}
        open={Boolean(inspectingGame)}
        onOpenChange={(open) => !open && setInspectingGame(null)}
      />
    </GlobalPageBackground>
  );
}
