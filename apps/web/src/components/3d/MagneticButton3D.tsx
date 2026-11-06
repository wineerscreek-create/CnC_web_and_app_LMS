'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { useIsPointerFine, usePrefersReducedMotion } from '@/lib/motion-config';

export interface MagneticButton3DProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
  pullDistance?: number;
  variant?: 'primary' | 'secondary' | 'accent' | 'glass';
  size?: 'sm' | 'md' | 'lg';
}

export function MagneticButton3D({
  children,
  className,
  pullDistance = 6,
  variant = 'primary',
  size = 'md',
  style,
  ...props
}: MagneticButton3DProps) {
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const isPointerFine = useIsPointerFine();

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (prefersReducedMotion || !isPointerFine || !btnRef.current) return;

    const rect = btnRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = (e.clientX - centerX) / (rect.width / 2);
    const deltaY = (e.clientY - centerY) / (rect.height / 2);

    const pullX = (deltaX * pullDistance).toFixed(1);
    const pullY = (deltaY * pullDistance).toFixed(1);

    btnRef.current.style.transform = `translate3d(${pullX}px, ${pullY}px, 0) scale(1.02)`;
  };

  const handlePointerLeave = () => {
    if (!btnRef.current) return;
    btnRef.current.style.transition = 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1)';
    btnRef.current.style.transform = 'translate3d(0, 0, 0) scale(1)';
  };

  const handlePointerEnter = () => {
    if (!btnRef.current || prefersReducedMotion || !isPointerFine) return;
    btnRef.current.style.transition = 'transform 100ms ease-out';
  };

  const variantStyles = {
    primary:
      'bg-primary text-primary-foreground hover:bg-primary/95 shadow-md border border-primary/40 hover:shadow-lg',
    accent:
      'bg-accent text-accent-foreground hover:bg-accent/90 shadow-md border border-accent/40 hover:shadow-lg',
    secondary:
      'bg-card text-foreground hover:bg-muted border border-border shadow-xs hover:border-accent/40',
    glass:
      'glass-panel-3d text-foreground hover:bg-muted/30 shadow-md',
  };

  const sizeStyles = {
    sm: 'px-3.5 py-1.5 text-xs rounded-xl font-semibold',
    md: 'px-5 py-2.5 text-sm rounded-2xl font-bold',
    lg: 'px-8 py-3.5 text-base rounded-2xl font-bold',
  };

  return (
    <button
      ref={btnRef}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className={cn(
        'inline-flex items-center justify-center transition-all duration-150 cursor-pointer active:scale-95 select-none',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      style={style}
      {...props}
    >
      {children}
    </button>
  );
}

