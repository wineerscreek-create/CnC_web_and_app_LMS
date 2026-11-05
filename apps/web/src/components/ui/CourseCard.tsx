'use client';

import { Clock, Layers, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { InteractiveArrowButton } from '@/components/ui/InteractiveArrowButton';
import { cn } from '@/lib/cn';
import { iconFor } from '@/lib/icons';

export interface CourseCardProps {
  id: string;
  slug: string;
  title: string;
  description?: string;
  category?: string;
  courseMode?: 'ONLINE' | 'OFFLINE' | string;
  difficulty?: string;
  durationHours?: number;
  stage?: string;
  icon?: string;
  image?: string;
  enrolledCount?: number;
  progressPct?: number;
  className?: string;
}

/**
 * CourseCard — Bento visual card for courses in the Ivory / Sage / Gold palette.
 */
export function CourseCard({
  id,
  slug,
  title,
  description,
  category,
  courseMode,
  difficulty = 'Beginner',
  durationHours,
  stage,
  icon,
  image = '/images/backgrounds/courses.webp',
  enrolledCount,
  progressPct,
  className,
}: CourseCardProps) {
  const Icon = iconFor(icon);
  const isOffline = courseMode === 'OFFLINE';

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all duration-300 hover:shadow-card-hover hover:-translate-y-0.5 hover:border-accent/40',
        className,
      )}
    >
      {/* 1. Card Thumbnail Header */}
      <div className="relative h-40 w-full overflow-hidden bg-foreground">
        <Image
          src={image}
          alt={title}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105 opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground via-foreground/40 to-transparent" />

        {/* Top Badges */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
          {category && (
            <span className="rounded-md bg-foreground/80 backdrop-blur-xs px-2.5 py-0.5 text-[11px] font-semibold text-background border border-border/20">
              {category}
            </span>
          )}
          <Badge
            tone={isOffline ? 'mustard' : 'neutral'}
            className="text-[10px] py-0.5 px-2 font-semibold shadow-xs"
          >
            {isOffline ? 'Campus Cohort' : 'Online Platform'}
          </Badge>
        </div>

        {/* Bottom Floating Info */}
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-xs">
            <Icon className="size-4" aria-hidden />
          </span>
          <span className="text-[11px] font-medium text-background/90 capitalize">
            {difficulty}
          </span>
        </div>
      </div>

      {/* 2. Content Body */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-bold text-base font-heading text-heading line-clamp-1 transition-colors">
          {title}
        </h3>

        {description && (
          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {description}
          </p>
        )}

        {/* Progress bar if student enrolled */}
        {typeof progressPct === 'number' && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs mb-1 font-medium text-foreground">
              <span>Progress</span>
              <span className="font-mono font-bold text-gold-text">{progressPct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Metadata Footer */}
        <div className="mt-auto pt-4 border-t border-border flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            {durationHours && (
              <span className="flex items-center gap-1">
                <Clock className="size-3.5 text-primary" aria-hidden />
                {durationHours}h
              </span>
            )}
            {stage && (
              <span className="flex items-center gap-1">
                <Layers className="size-3.5" aria-hidden />
                {stage}
              </span>
            )}
            {typeof enrolledCount === 'number' && enrolledCount > 0 && (
              <span className="flex items-center gap-1">
                <Users className="size-3.5" aria-hidden />
                {enrolledCount}
              </span>
            )}
          </div>

          <InteractiveArrowButton
            href={`/courses/${slug}`}
            variant="ghost"
            size="sm"
            className="text-foreground font-semibold hover:text-accent"
          >
            Explore
          </InteractiveArrowButton>
        </div>
      </div>
    </div>
  );
}
