'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

interface ContinuouslyMovingCarouselProps {
  children: React.ReactNode;
  speedSeconds?: number;
  reverse?: boolean;
  className?: string;
  itemClassName?: string;
  ariaLabel?: string;
}

export function ContinuouslyMovingCarousel({
  children,
  speedSeconds = 35,
  reverse = false,
  className,
  itemClassName,
  ariaLabel = 'Continuously moving showcase',
}: ContinuouslyMovingCarouselProps) {
  const [isPaused, setIsPaused] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  // Touch drag state
  const isDragging = React.useRef(false);
  const startX = React.useRef(0);
  const scrollLeft = React.useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    isDragging.current = true;
    startX.current = e.pageX - containerRef.current.offsetLeft;
    scrollLeft.current = containerRef.current.scrollLeft;
    setIsPaused(true);
  };

  const handleMouseLeave = () => {
    isDragging.current = false;
    setIsPaused(false);
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    setIsPaused(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    e.preventDefault();
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    containerRef.current.scrollLeft = scrollLeft.current - walk;
  };

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className={cn('relative w-full overflow-hidden select-none py-4', className)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={handleMouseLeave}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      ref={containerRef}
    >
      {/* Edge gradient masks for seamless visual fade */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-16 sm:w-28 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-16 sm:w-28 bg-gradient-to-l from-background to-transparent" />

      {/* Infinite scrolling track */}
      <div
        className={cn(
          'flex w-max items-center gap-6 will-change-transform',
          reverse ? 'animate-marquee-reverse' : 'animate-marquee'
        )}
        style={{
          animationDuration: `${speedSeconds}s`,
          animationPlayState: isPaused ? 'paused' : 'running',
        }}
      >
        {/* Set 1 */}
        <div className={cn('flex shrink-0 items-center gap-6', itemClassName)}>
          {children}
        </div>
        {/* Set 2 (Duplicate for seamless loop) */}
        <div className={cn('flex shrink-0 items-center gap-6', itemClassName)} aria-hidden="true">
          {children}
        </div>
        {/* Set 3 (Duplicate for ultra-wide screens) */}
        <div className={cn('flex shrink-0 items-center gap-6', itemClassName)} aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}
