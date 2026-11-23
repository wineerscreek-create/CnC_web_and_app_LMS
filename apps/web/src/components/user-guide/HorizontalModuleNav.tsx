'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import type { GuideModule } from '@/data/userGuide/types';
import { GuideIcon } from './GuideIcon';
import { cn } from '@/lib/cn';

interface HorizontalModuleNavProps {
  modules: GuideModule[];
  activeModuleId: string;
  readModuleIds: Set<string>;
  onSelectModule: (moduleId: string) => void;
}

export function HorizontalModuleNav({
  modules,
  activeModuleId,
  readModuleIds,
  onSelectModule,
}: HorizontalModuleNavProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const checkScroll = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  React.useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [checkScroll, modules]);

  // Handle horizontal mouse wheel scrolling
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (containerRef.current) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        return; // Native trackpad horizontal scroll
      }
      containerRef.current.scrollLeft += e.deltaY;
      checkScroll();
    }
  };

  const scrollBy = (offset: number) => {
    if (containerRef.current) {
      containerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
      setTimeout(checkScroll, 300);
    }
  };

  // Auto-scroll active item into view
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const activeBtn = el.querySelector<HTMLButtonElement>(`[data-module-id="${activeModuleId}"]`);
    if (activeBtn) {
      const containerRect = el.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      if (btnRect.left < containerRect.left || btnRect.right > containerRect.right) {
        activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [activeModuleId]);

  return (
    <div className="relative w-full rounded-2xl border border-border/80 bg-card p-2 shadow-xs sm:p-2.5">
      {/* Scroll controls */}
      <div className="flex items-center justify-between pb-2 px-1 text-xs text-muted-foreground border-b border-border/60">
        <div className="flex items-center gap-1.5 font-medium">
          <span className="inline-block size-2 rounded-full bg-primary animate-pulse" />
          <span>Dashboard Modules ({modules.length})</span>
          <span className="hidden sm:inline text-2xs text-muted-foreground/80">
            • Scroll or use arrows to navigate
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => scrollBy(-260)}
            disabled={!canScrollLeft}
            aria-label="Scroll left"
            className={cn(
              'flex size-7 items-center justify-center rounded-lg border border-border bg-background transition-colors',
              canScrollLeft
                ? 'text-foreground hover:bg-muted active:scale-95'
                : 'text-muted-foreground/40 border-border/40 cursor-not-allowed opacity-50'
            )}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(260)}
            disabled={!canScrollRight}
            aria-label="Scroll right"
            className={cn(
              'flex size-7 items-center justify-center rounded-lg border border-border bg-background transition-colors',
              canScrollRight
                ? 'text-foreground hover:bg-muted active:scale-95'
                : 'text-muted-foreground/40 border-border/40 cursor-not-allowed opacity-50'
            )}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* Horizontal scrolling strip */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onScroll={checkScroll}
        className="scroll-thin mt-2 flex w-full items-stretch gap-2.5 overflow-x-auto pb-1 pt-0.5"
        style={{ scrollbarWidth: 'thin' }}
      >
        {modules.map((mod, index) => {
          const isActive = mod.id === activeModuleId;
          const isRead = readModuleIds.has(mod.id);
          const indexFormatted = String(index + 1).padStart(2, '0');

          return (
            <button
              key={mod.id}
              data-module-id={mod.id}
              type="button"
              onClick={() => onSelectModule(mod.id)}
              className={cn(
                'group relative flex min-w-[200px] max-w-[240px] shrink-0 flex-col justify-between rounded-xl border p-3 text-left transition-all duration-200 select-none',
                isActive
                  ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-sm'
                  : 'border-border/70 bg-card hover:border-border hover:bg-muted/60'
              )}
            >
              {/* Header row: Index & Status */}
              <div className="flex items-center justify-between w-full">
                <span
                  className={cn(
                    'text-2xs font-mono font-bold tracking-wider px-1.5 py-0.5 rounded-md',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {indexFormatted}
                </span>

                {isRead ? (
                  <span
                    className="flex items-center gap-1 text-2xs font-semibold text-emerald-600 dark:text-emerald-400"
                    title="Completed"
                  >
                    <CheckCircle2 className="size-3.5" />
                    <span>Completed</span>
                  </span>
                ) : (
                  <span className="text-2xs text-muted-foreground/70">
                    {mod.faqs.length} steps
                  </span>
                )}
              </div>

              {/* Title & Icon */}
              <div className="mt-2.5 flex items-start gap-2.5">
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'bg-muted text-foreground group-hover:bg-primary/20 group-hover:text-primary'
                  )}
                >
                  <GuideIcon name={mod.iconName} className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-sm font-bold',
                      isActive ? 'text-primary' : 'text-foreground'
                    )}
                  >
                    {mod.title}
                  </span>
                  <span className="block truncate font-mono text-2xs text-muted-foreground">
                    {mod.pageRoute}
                  </span>
                </div>
              </div>

              {/* Bottom active indicator bar */}
              <div
                className={cn(
                  'mt-2.5 h-1 w-full rounded-full transition-all duration-200',
                  isActive
                    ? 'bg-primary'
                    : isRead
                    ? 'bg-emerald-500/40'
                    : 'bg-transparent group-hover:bg-muted'
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
