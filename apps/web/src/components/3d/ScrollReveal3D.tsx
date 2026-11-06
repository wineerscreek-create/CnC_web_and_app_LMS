'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '@/lib/motion-config';

interface ScrollReveal3DProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  delayMs?: number;
  className?: string;
  threshold?: number;
}

export function ScrollReveal3D({
  children,
  delayMs = 0,
  className,
  threshold = 0.1,
  style,
  ...props
}: ScrollReveal3DProps) {
  const domRef = React.useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = React.useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  React.useEffect(() => {
    if (prefersReducedMotion) {
      setIsVisible(true);
      return;
    }

    const currentDom = domRef.current;
    if (!currentDom) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(currentDom);
        }
      },
      { threshold }
    );

    observer.observe(currentDom);

    return () => {
      observer.disconnect();
    };
  }, [threshold, prefersReducedMotion]);

  if (prefersReducedMotion) {
    return (
      <div className={className} style={style} {...props}>
        {children}
      </div>
    );
  }

  return (
    <div
      ref={domRef}
      className={cn(
        'transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]',
        isVisible
          ? 'opacity-100 transform-none'
          : 'opacity-0 [transform:perspective(1000px)_translateY(28px)_rotateX(6deg)_scale(0.98)]',
        className
      )}
      style={{
        transitionDelay: `${delayMs}ms`,
        willChange: isVisible ? 'auto' : 'transform, opacity',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
