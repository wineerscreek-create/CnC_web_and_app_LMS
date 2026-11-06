'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '@/lib/motion-config';

interface StaggerContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  staggerMs?: number;
  initialDelayMs?: number;
  className?: string;
}

const StaggerContext = React.createContext<{
  staggerMs: number;
  initialDelayMs: number;
  registerItem: () => number;
}>({
  staggerMs: 100,
  initialDelayMs: 0,
  registerItem: () => 0,
});

/**
 * StaggerContainer coordinates sequential card entrances across its children.
 */
export function StaggerContainer({
  children,
  staggerMs = 100,
  initialDelayMs = 0,
  className,
  ...props
}: StaggerContainerProps) {
  const countRef = React.useRef(0);
  countRef.current = 0;

  const registerItem = React.useCallback(() => {
    const idx = countRef.current;
    countRef.current += 1;
    return idx;
  }, []);

  return (
    <StaggerContext.Provider value={{ staggerMs, initialDelayMs, registerItem }}>
      <div className={cn('w-full', className)} {...props}>
        {children}
      </div>
    </StaggerContext.Provider>
  );
}

interface StaggerItemProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  index?: number;
  className?: string;
}

/**
 * StaggerItem reveals with a magical 3D elevation + slight rotation entrance.
 * Automatically respects prefers-reduced-motion.
 */
export function StaggerItem({
  children,
  index,
  className,
  style,
  ...props
}: StaggerItemProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const context = React.useContext(StaggerContext);

  const [autoIndex] = React.useState(() => {
    return typeof index === 'number' ? index : context.registerItem();
  });

  const effectiveIndex = typeof index === 'number' ? index : autoIndex;
  const delayMs = context.initialDelayMs + effectiveIndex * context.staggerMs;

  if (prefersReducedMotion) {
    return (
      <div className={className} style={style} {...props}>
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn('animate-entrance-3d', className)}
      style={{
        animationDelay: `${delayMs}ms`,
        animationFillMode: 'both',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

