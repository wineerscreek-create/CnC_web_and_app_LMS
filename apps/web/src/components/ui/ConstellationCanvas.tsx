'use client';

import * as React from 'react';
import { useTheme } from '@/lib/theme/ThemeContext';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  glowColor: string;
  alpha: number;
}

export function ConstellationCanvas({ className }: { className?: string }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const { isDark } = useTheme();

  React.useEffect(() => {
    // In headless/test environments (jsdom without native canvas), bypass canvas rendering
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d', { alpha: true });
    } catch {
      return;
    }
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Palette with Orange (#F97316), Teal (#0D9488), and Indigo (#4F46E5) accents
    const palette = isDark
      ? [
          { fill: 'rgba(249, 115, 22, 0.45)', glow: 'rgba(249, 115, 22, 0.25)' }, // Orange
          { fill: 'rgba(20, 184, 166, 0.45)', glow: 'rgba(20, 184, 166, 0.25)' }, // Teal
          { fill: 'rgba(99, 102, 241, 0.50)', glow: 'rgba(99, 102, 241, 0.30)' }, // Indigo
        ]
      : [
          { fill: 'rgba(249, 115, 22, 0.35)', glow: 'rgba(249, 115, 22, 0.15)' }, // Orange
          { fill: 'rgba(13, 148, 136, 0.35)', glow: 'rgba(13, 148, 136, 0.15)' }, // Teal
          { fill: 'rgba(79, 70, 229, 0.35)', glow: 'rgba(79, 70, 229, 0.15)' }, // Indigo
        ];

    const isMobile = width < 768;
    const particleCount = isMobile ? 22 : 48;
    const maxDistance = isMobile ? 85 : 120;
    const mouseRadius = 140;

    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      const colorScheme = palette[i % palette.length];
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * (prefersReducedMotion ? 0 : 0.45),
        vy: (Math.random() - 0.5) * (prefersReducedMotion ? 0 : 0.45),
        radius: Math.random() * 1.5 + 1.0,
        color: colorScheme.fill,
        glowColor: colorScheme.glow,
        alpha: Math.random() * 0.4 + 0.3,
      });
    }

    const mouse = { x: -1000, y: -1000 };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        mouse.x = e.touches[0].clientX;
        mouse.y = e.touches[0].clientY;
      }
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('mouseleave', handleMouseLeave, { passive: true });
    window.addEventListener('resize', handleResize);

    let isVisible = document.visibilityState === 'visible';
    const handleVisibilityChange = () => {
      isVisible = document.visibilityState === 'visible';
      if (isVisible && !prefersReducedMotion) {
        lastTime = performance.now();
        animationFrameId = requestAnimationFrame(animate);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let lastTime = performance.now();

    function animate(currentTime: number) {
      if (!ctx || !isVisible) return;

      const delta = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      ctx.clearRect(0, 0, width, height);

      // Draw connection lines between particles
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];

        // Move particles
        if (!prefersReducedMotion) {
          p1.x += p1.vx * (delta * 60);
          p1.y += p1.vy * (delta * 60);

          if (p1.x < 0) p1.x = width;
          else if (p1.x > width) p1.x = 0;

          if (p1.y < 0) p1.y = height;
          else if (p1.y > height) p1.y = 0;

          // Mouse gentle attraction / repulsion
          const dxMouse = mouse.x - p1.x;
          const dyMouse = mouse.y - p1.y;
          const distMouse = Math.hypot(dxMouse, dyMouse);
          if (distMouse < mouseRadius && distMouse > 0) {
            const force = (1 - distMouse / mouseRadius) * 0.4;
            p1.x += (dxMouse / distMouse) * force;
            p1.y += (dyMouse / distMouse) * force;
          }
        }

        // Particle to particle connections
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.hypot(dx, dy);

          if (dist < maxDistance) {
            const alpha = (1 - dist / maxDistance) * (isDark ? 0.14 : 0.08);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = isDark ? `rgba(148, 163, 184, ${alpha})` : `rgba(79, 70, 229, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }

        // Cursor to particle connection
        const dxM = mouse.x - p1.x;
        const dyM = mouse.y - p1.y;
        const distM = Math.hypot(dxM, dyM);
        if (distM < mouseRadius) {
          const alpha = (1 - distM / mouseRadius) * (isDark ? 0.22 : 0.14);
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.strokeStyle = `rgba(249, 115, 22, ${alpha})`; // Orange glow to cursor
          ctx.lineWidth = 1.0;
          ctx.stroke();
        }

        // Draw particle dot with soft glow
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, p1.radius, 0, Math.PI * 2);
        ctx.fillStyle = p1.color;
        ctx.shadowColor = p1.glowColor;
        ctx.shadowBlur = 4;
        ctx.fill();
        ctx.shadowBlur = 0; // Reset shadow for line performance
      }

      if (!prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(animate);
      }
    }

    if (prefersReducedMotion) {
      animate(performance.now());
    } else {
      animationFrameId = requestAnimationFrame(animate);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isDark]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className ?? 'pointer-events-none fixed inset-0 z-0 h-full w-full select-none'}
    />
  );
}
