'use client';

import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/cn';

interface ImageHeroProps {
  image?: string;
  imageAlt?: string;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  variant?: 'banner' | 'split' | 'card';
  className?: string;
  imageClassName?: string;
  overlayOpacity?: 'light' | 'medium' | 'dark';
}

export function ImageHero({
  image,
  imageAlt = 'SkillSharp visual',
  title,
  subtitle,
  eyebrow,
  badge,
  actions,
  className,
}: ImageHeroProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-xs',
        className,
      )}
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-3 max-w-2xl">
          <div className="flex items-center gap-2">
            {badge || (eyebrow && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase bg-accent/20 text-foreground border border-accent/40">
                {eyebrow}
              </span>
            ))}
          </div>
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-heading">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-3 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
