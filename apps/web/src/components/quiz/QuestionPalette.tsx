'use client';

import React from 'react';
import { cn } from '@/lib/cn';
import { Lock } from 'lucide-react';

export interface PaletteItem {
  id: string;
  index: number;
  status: 'answered' | 'marked_for_review' | 'not_visited';
}

interface QuestionPaletteProps {
  palette: PaletteItem[];
  currentIndex: number;
  onJump: (index: number) => void;
  disabled?: boolean;
  allowPrevious?: boolean;
}

export function QuestionPalette({
  palette,
  currentIndex,
  onJump,
  disabled = false,
  allowPrevious = true,
}: QuestionPaletteProps) {
  const answeredCount = palette.filter((p) => p.status === 'answered').length;
  const reviewCount = palette.filter((p) => p.status === 'marked_for_review').length;
  const unvisitedCount = palette.filter((p) => p.status === 'not_visited').length;

  return (
    <div className="rounded-lg border border-line bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-1">Question Palette</h3>
        {!allowPrevious && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-amber-500">
            <Lock className="size-3" /> Past Locked
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-ink-3">
        {allowPrevious ? 'Jump directly to any question' : 'Questions progress sequentially'}
      </p>

      {/* Status Legend */}
      <div className="mt-3 flex flex-wrap gap-2.5 text-xs text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-blue-600" />
          Answered ({answeredCount})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-amber-500" />
          Review ({reviewCount})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-line bg-app" />
          Pending ({unvisitedCount})
        </span>
      </div>

      {/* Question Grid */}
      <div className="mt-4 grid grid-cols-5 gap-2 max-h-60 overflow-y-auto pr-1">
        {palette.map((item) => {
          const isCurrent = item.index === currentIndex;
          const isPastLocked = !allowPrevious && item.index < currentIndex;
          const isFutureLocked = !allowPrevious && item.index > currentIndex;
          const isItemDisabled = disabled || isPastLocked || isFutureLocked;

          let colorClass = 'border-line bg-app text-ink-2 hover:bg-card-hover';

          if (item.status === 'answered') {
            colorClass = 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700';
          } else if (item.status === 'marked_for_review') {
            colorClass = 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600';
          }

          if (isPastLocked) {
            colorClass = 'bg-ink-4/30 border-line text-ink-3';
          }

          return (
            <button
              key={item.id || item.index}
              type="button"
              disabled={isItemDisabled}
              onClick={() => onJump(item.index)}
              className={cn(
                'flex h-9 w-full items-center justify-center rounded-md border text-xs font-semibold transition-all',
                colorClass,
                isCurrent && 'ring-2 ring-primary ring-offset-1 ring-offset-card font-bold scale-105 shadow-sm',
                isItemDisabled && 'cursor-not-allowed opacity-60'
              )}
              title={
                isPastLocked
                  ? `Question ${item.index + 1} (Locked)`
                  : `Question ${item.index + 1} (${item.status.replace('_', ' ')})`
              }
            >
              {isPastLocked ? <Lock className="size-3" /> : item.index + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
