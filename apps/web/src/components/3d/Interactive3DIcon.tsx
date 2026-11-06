'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { useIsPointerFine, usePrefersReducedMotion } from '@/lib/motion-config';

interface Interactive3DIconProps {
  icon: any;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'secondary' | 'accent' | 'muted';
}

export function Interactive3DIcon({
  icon: Icon,
  className,
  size = 'md',
  color = 'primary',
}: Interactive3DIconProps) {
  const iconRef = React.useRef<HTMLDivElement>(null);
  const isPointerFine = useIsPointerFine();
  const prefersReducedMotion = usePrefersReducedMotion();

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerFine || prefersReducedMotion || !iconRef.current) return;
    const rect = iconRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    iconRef.current.style.transform = `perspective(300px) rotateX(${(-y * 24).toFixed(1)}deg) rotateY(${(x * 24).toFixed(1)}deg) translateZ(8px)`;
  };

  const handlePointerLeave = () => {
    if (!iconRef.current) return;
    iconRef.current.style.transition = 'transform 300ms ease-out';
    iconRef.current.style.transform = 'perspective(300px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
  };

  const handlePointerEnter = () => {
    if (!iconRef.current || !isPointerFine || prefersReducedMotion) return;
    iconRef.current.style.transition = 'transform 100ms ease-out';
  };

  const sizeClasses = {
    sm: 'size-9 rounded-xl',
    md: 'size-12 rounded-2xl',
    lg: 'size-16 rounded-3xl',
  };

  const iconSizes = {
    sm: 'size-4',
    md: 'size-6',
    lg: 'size-8',
  };

  const colorClasses = {
    primary: 'bg-primary/10 text-primary border-primary/30',
    secondary: 'bg-secondary/10 text-secondary border-secondary/30',
    accent: 'bg-accent/10 text-accent border-accent/30',
    muted: 'bg-muted text-foreground border-border',
  };

  return (
    <div
      ref={iconRef}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className={cn(
        'flex items-center justify-center border shadow-xs transition-colors duration-200 select-none preserve-3d will-change-transform',
        sizeClasses[size],
        colorClasses[color],
        className
      )}
    >
      <Icon className={cn(iconSizes[size], 'transition-transform duration-200 group-hover:scale-110')} />
    </div>
  );
}
