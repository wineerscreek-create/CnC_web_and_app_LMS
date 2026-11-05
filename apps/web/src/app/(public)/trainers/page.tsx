'use client';

import * as React from 'react';
import { SearchInput } from '@/components/shared/filter-bar';
import { AsyncSection, EmptyState } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Avatar } from '@/components/ui/misc';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';

export default function PublicTrainersPage() {
  const query = useApi<any[]>('/home/trainers', { limit: 50 });
  const [search, setSearch] = React.useState('');
  const [selectedDept, setSelectedDept] = React.useState('all');

  return (
    <div className="animate-enter pb-16">
      {/* ------------------------------------------------------------------ hero */}
      <section className="relative py-12 sm:py-16">
        <div className="relative mx-auto max-w-[1180px] px-5">
          <Badge tone="mustard" className="font-semibold text-xs py-1 px-3">
            Institutional Faculty
          </Badge>
          <h1 className="mt-4 font-heading font-black text-4xl sm:text-5xl text-heading tracking-tight max-w-[700px]">
            Expert Mentors &amp; Certified Trainers
          </h1>
          <p className="mt-4 max-w-[640px] text-base leading-relaxed text-muted-foreground">
            Dedicated academic trainers evaluate performance across objective rubrics and evidence-backed assessments, providing targeted mentorship to build career readiness.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ trainers grid */}
      <div className="mx-auto max-w-[1180px] px-5">
        <AsyncSection query={query} skeleton="cards" isEmpty={(rows) => rows.length === 0}>
          {(allTrainers) => {
            const departments = Array.from(
              new Set(allTrainers.map((t) => t.department).filter(Boolean)),
            ) as string[];

            const filtered = allTrainers.filter((trainer) => {
              const matchesDept =
                selectedDept === 'all' || trainer.department === selectedDept;
              const term = search.toLowerCase().trim();
              const matchesSearch =
                !term ||
                trainer.name?.toLowerCase().includes(term) ||
                trainer.department?.toLowerCase().includes(term) ||
                trainer.designation?.toLowerCase().includes(term) ||
                trainer.expertise?.some((e: string) => e.toLowerCase().includes(term));
              return matchesDept && matchesSearch;
            });

            return (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-border">
                  <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Search faculty by name or domain…"
                    className="w-full sm:w-[320px] bg-card border-border rounded-xl"
                  />
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by department">
                    <button
                      type="button"
                      onClick={() => setSelectedDept('all')}
                      className={cn(
                        'rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition-all duration-150',
                        selectedDept === 'all'
                          ? 'border-accent bg-accent text-accent-foreground shadow-xs'
                          : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      All Departments ({allTrainers.length})
                    </button>
                    {departments.map((dept) => (
                      <button
                        key={dept}
                        type="button"
                        onClick={() => setSelectedDept(dept)}
                        className={cn(
                          'rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition-all duration-150',
                          selectedDept === dept
                            ? 'border-accent bg-accent text-accent-foreground shadow-xs'
                            : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        {dept}
                      </button>
                    ))}
                  </div>
                </div>

                {filtered.length === 0 ? (
                  <div className="pt-10">
                    <EmptyState
                      title="No trainers match that filter"
                      body="Try searching with different terms or select 'All Departments'."
                      action={
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSearch('');
                            setSelectedDept('all');
                          }}
                        >
                          Clear Filters
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {filtered.map((trainer) => (
                      <Card
                        key={trainer.id}
                        className="group flex flex-col justify-between border border-border bg-card shadow-soft transition-all duration-300 hover:shadow-card hover:border-accent hover:-translate-y-0.5"
                      >
                        <CardBody className="p-5 flex flex-col h-full">
                          <div className="flex items-center gap-3">
                            <Avatar name={trainer.name} color={trainer.avatarColor} size={48} className="shadow-xs" />
                            <div className="min-w-0 flex-1">
                              <h2 className="text-sm font-bold font-heading text-heading truncate">
                                {trainer.name}
                              </h2>
                              <p className="text-xs text-muted-foreground truncate">{trainer.department}</p>
                              {trainer.institution && (
                                <p className="text-[11px] text-muted-foreground truncate mt-0.5">{trainer.institution}</p>
                              )}
                            </div>
                          </div>
                          <p className="mt-3 text-[11px] font-bold text-foreground uppercase tracking-wide">
                            {trainer.designation}
                          </p>
                          {trainer.bio && (
                            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                              {trainer.bio}
                            </p>
                          )}
                          {trainer.expertise?.length > 0 && (
                            <div className="mt-auto pt-4 flex flex-wrap gap-1.5 border-t border-border">
                              {trainer.expertise.map((item: string) => (
                                <Badge key={item} tone="neutral" className="text-[10px] py-0 px-1.5 font-medium">
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </CardBody>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          }}
        </AsyncSection>
      </div>
    </div>
  );
}
