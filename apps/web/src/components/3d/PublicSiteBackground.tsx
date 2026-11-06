'use client';

import * as React from 'react';

/**
 * PublicSiteBackground
 * Persistent 3D galaxy atmosphere rendered across all public pages of Winners Creek LMS.
 * Features:
 * - Dynamic stardust particles with gentle cosmic drift
 * - Deep multi-layered nebula glow with ambient breathing
 * - Subtle pointer-reactive parallax
 * - Graceful adaptation to light/dark themes
 * - Zero impact on keyboard navigation and accessibility (pointer-events-none)
 */
export function PublicSiteBackground() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Particle count scaled to screen size
    const particleCount = Math.min(180, Math.floor((width * height) / 9000));
    
    interface Star {
      x: number;
      y: number;
      z: number;
      size: number;
      baseAlpha: number;
      alpha: number;
      twinkleSpeed: number;
      color: string;
      vx: number;
      vy: number;
    }

    const starColorsDark = [
      'rgba(245, 158, 11, ',   // Warm amber / mustard accent
      'rgba(56, 189, 248, ',   // Cyan / celestial blue
      'rgba(168, 85, 247, ',   // Deep purple nebula
      'rgba(255, 255, 255, ',  // Pure white starlight
    ];

    const starColorsLight = [
      'rgba(217, 119, 6, ',    // Warm amber
      'rgba(2, 132, 199, ',    // Deep sky blue
      'rgba(126, 34, 206, ',   // Purple
      'rgba(100, 116, 139, ',  // Slate dust
    ];

    const isDarkMode = () => document.documentElement.classList.contains('dark');

    const stars: Star[] = [];
    for (let i = 0; i < particleCount; i++) {
      const isDark = isDarkMode();
      const palette = isDark ? starColorsDark : starColorsLight;
      const colorPrefix = palette[Math.floor(Math.random() * palette.length)];
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        z: Math.random() * 2 + 0.5,
        size: Math.random() * 2.2 + 0.4,
        baseAlpha: Math.random() * 0.6 + 0.2,
        alpha: Math.random() * 0.6 + 0.2,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        color: colorPrefix,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
      });
    }

    let mouseX = width / 2;
    let mouseY = height / 2;
    let targetMouseX = mouseX;
    let targetMouseY = mouseY;

    const handlePointerMove = (e: MouseEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('mousemove', handlePointerMove, { passive: true });
    window.addEventListener('resize', handleResize);

    let time = 0;

    const render = () => {
      time += 0.01;
      // Smooth pointer interpolation
      mouseX += (targetMouseX - mouseX) * 0.03;
      mouseY += (targetMouseY - mouseY) * 0.03;

      const dark = isDarkMode();
      ctx.clearRect(0, 0, width, height);

      // Render cosmic nebula glows
      const nebulaX1 = width * 0.25 + Math.sin(time * 0.4) * 80;
      const nebulaY1 = height * 0.3 + Math.cos(time * 0.3) * 60;
      const grad1 = ctx.createRadialGradient(nebulaX1, nebulaY1, 10, nebulaX1, nebulaY1, width * 0.45);
      if (dark) {
        grad1.addColorStop(0, 'rgba(217, 119, 6, 0.045)');
        grad1.addColorStop(0.5, 'rgba(88, 28, 135, 0.03)');
        grad1.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        grad1.addColorStop(0, 'rgba(245, 158, 11, 0.04)');
        grad1.addColorStop(0.5, 'rgba(2, 132, 199, 0.025)');
        grad1.addColorStop(1, 'rgba(255, 255, 255, 0)');
      }
      ctx.fillStyle = grad1;
      ctx.fillRect(0, 0, width, height);

      const nebulaX2 = width * 0.75 + Math.cos(time * 0.5) * 90;
      const nebulaY2 = height * 0.7 + Math.sin(time * 0.4) * 70;
      const grad2 = ctx.createRadialGradient(nebulaX2, nebulaY2, 10, nebulaX2, nebulaY2, width * 0.5);
      if (dark) {
        grad2.addColorStop(0, 'rgba(14, 165, 233, 0.04)');
        grad2.addColorStop(0.6, 'rgba(126, 34, 206, 0.025)');
        grad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        grad2.addColorStop(0, 'rgba(14, 165, 233, 0.035)');
        grad2.addColorStop(0.6, 'rgba(245, 158, 11, 0.02)');
        grad2.addColorStop(1, 'rgba(255, 255, 255, 0)');
      }
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, width, height);

      // Render stars with depth & gentle parallax
      const offsetX = (mouseX - width / 2) * 0.015;
      const offsetY = (mouseY - height / 2) * 0.015;

      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];

        star.x += star.vx;
        star.y += star.vy;

        // Wrap around bounds
        if (star.x < 0) star.x = width;
        if (star.x > width) star.x = 0;
        if (star.y < 0) star.y = height;
        if (star.y > height) star.y = 0;

        // Twinkle
        star.alpha = star.baseAlpha + Math.sin(time * 3 + i) * 0.15;
        const currentAlpha = Math.max(0.05, Math.min(0.9, star.alpha));

        const drawX = star.x + offsetX * star.z;
        const drawY = star.y + offsetY * star.z;

        ctx.beginPath();
        ctx.arc(drawX, drawY, star.size * star.z * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = `${star.color}${currentAlpha})`;
        ctx.fill();

        // Extra outer glow on larger stars
        if (star.size > 1.8) {
          ctx.beginPath();
          ctx.arc(drawX, drawY, star.size * star.z * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = `${star.color}${currentAlpha * 0.25})`;
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
      style={{ isolation: 'isolate' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full opacity-90 transition-opacity duration-1000"
      />
      {/* Subtle depth vignette overlay */}
      <div className="absolute inset-0 bg-radial-gradient from-transparent via-transparent to-background/50 pointer-events-none" />
    </div>
  );
}
