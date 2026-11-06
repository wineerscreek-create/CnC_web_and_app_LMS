'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { useIsPointerFine, usePrefersReducedMotion } from '@/lib/motion-config';

export interface TiltCard3DProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  perspective?: number;
  maxAngle?: number;
  scale?: number;
  glare?: boolean;
  depthEffect?: boolean;
}

export function TiltCard3D({
  children,
  className,
  perspective = 1000,
  maxAngle = 7,
  scale = 1.02,
  glare = true,
  depthEffect = true,
  style,
  ...props
}: TiltCard3DProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const isPointerFine = useIsPointerFine();

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || !isPointerFine || !cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const xRatio = Math.max(0, Math.min(1, x / rect.width));
    const yRatio = Math.max(0, Math.min(1, y / rect.height));

    const rotateX = ((0.5 - yRatio) * 2 * maxAngle).toFixed(2);
    const rotateY = ((xRatio - 0.5) * 2 * maxAngle).toFixed(2);

    cardRef.current.style.transform = `perspective(${perspective}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${scale}, ${scale}, 1)`;
    cardRef.current.style.setProperty('--mouse-x', `${(xRatio * 100).toFixed(1)}%`);
    cardRef.current.style.setProperty('--mouse-y', `${(yRatio * 100).toFixed(1)}%`);
    cardRef.current.style.setProperty('--glare-opacity', '0.18');
  };

  const handlePointerEnter = () => {
    if (prefersReducedMotion || !isPointerFine || !cardRef.current) return;
    cardRef.current.style.transition = 'transform 120ms ease-out';
  };

  const handlePointerLeave = () => {
    if (!cardRef.current) return;
    cardRef.current.style.transition = 'transform 450ms cubic-bezier(0.16, 1, 0.3, 1)';
    cardRef.current.style.transform = `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
    cardRef.current.style.setProperty('--glare-opacity', '0');
  };

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className={cn(
        'relative rounded-3xl border border-border bg-card shadow-xs transition-colors duration-200',
        isPointerFine && !prefersReducedMotion && 'preserve-3d will-change-transform',
        className
      )}
      style={style}
      {...props}
    >
      {glare && isPointerFine && !prefersReducedMotion && (
        <div aria-hidden className="specular-glare" />
      )}
      <div
        className={cn(
          'relative z-[1] h-full w-full',
          depthEffect && isPointerFine && !prefersReducedMotion && 'preserve-3d'
        )}
      >
        {children}
      </div>
    </div>
  );
}

