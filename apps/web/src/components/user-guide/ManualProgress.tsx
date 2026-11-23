'use client';

import * as React from 'react';
import { CheckCircle2, RotateCcw, Trophy } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ManualProgressProps {
  totalModules: number;
  completedCount: number;
  isCurrentModuleRead: boolean;
  onToggleCurrentModuleRead: () => void;
  onResetProgress: () => void;
}

export function ManualProgress({
  totalModules,
  completedCount,
  isCurrentModuleRead,
  onToggleCurrentModuleRead,
  onResetProgress,
}: ManualProgressProps) {
  const percentage = totalModules > 0 ? Math.round((completedCount / totalModules) * 100) : 0;
  const isAllComplete = completedCount === totalModules && totalModules > 0;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/60 p-3 shadow-2xs">
      {/* Progress Stats */}
      <div className="flex items-center gap-3 w-full sm:w-auto">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors',
            isAllComplete
              ? 'bg-amber-500/10 text-amber-500'
              : 'bg-primary/10 text-primary'
          )}
        >
          {isAllComplete ? <Trophy className="size-5" /> : <CheckCircle2 className="size-5" />}
        </span>

        <div className="min-w-0 flex-1 sm:w-48">
          <div className="flex items-center justify-between text-xs font-semibold mb-1">
            <span className="text-foreground">Guide Progress</span>
            <span className="font-mono text-primary font-bold">{percentage}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full transition-all duration-300 rounded-full',
                isAllComplete ? 'bg-emerald-500' : 'bg-primary'
              )}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="block text-2xs text-muted-foreground mt-0.5">
            {completedCount} of {totalModules} modules mastered
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 self-end sm:self-auto w-full sm:w-auto justify-end">
        <button
          type="button"
          onClick={onToggleCurrentModuleRead}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all active:scale-95',
            isCurrentModuleRead
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'border border-border bg-background text-foreground hover:bg-muted'
          )}
        >
          <CheckCircle2 className="size-3.5" />
          <span>{isCurrentModuleRead ? 'Module Completed' : 'Mark Module Completed'}</span>
        </button>

        {completedCount > 0 && (
          <button
            type="button"
            onClick={onResetProgress}
            title="Reset reading progress"
            className="flex size-7 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <RotateCcw className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
