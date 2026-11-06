'use client';

import * as React from 'react';

/**
 * PublicSiteBackground
 * Interactive floating bubble/particle background rendered across public pages of Winners Creek LMS.
 * 
 * Features:
 * - Ambient floating translucent bubbles with subtle variations in size, opacity, and drift speed.
 * - Interactive click/touch repulsion: clicking or tapping near any bubble pushes it smoothly away.
 * - Smooth easing and return to normal gentle upward floating movement.
 * - Canvas has `pointer-events: none` to never block buttons, links, or text selection.
 * - Global window listener captures clicks and touches transparently.
 * - Respects prefers-reduced-motion and throttles when tab is inactive.
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

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Responsive bubble count: 28 to 48 bubbles for clean, elegant, non-cluttered visuals
    const bubbleCount = Math.max(24, Math.min(48, Math.floor((width * height) / 28000)));

    interface Bubble {
      x: number;
      y: number;
      radius: number;
      baseSpeedX: number;
      baseSpeedY: number;
      impulseX: number;
      impulseY: number;
      alpha: number;
      baseAlpha: number;
      seed: number;
      wobbleSpeed: number;
      color: {
        r: number;
        g: number;
        b: number;
      };
      borderWidth: number;
    }

    // Brand color palette (Warm Amber/Orange, Royal Purple, Soft Indigo, Subtle Sky/Teal)
    const colorPalette = [
      { r: 245, g: 158, b: 11 }, // Amber / Warm Orange
      { r: 168, g: 85, b: 247 }, // Soft Purple
      { r: 99, g: 102, b: 241 },  // Indigo
      { r: 14, g: 165, b: 233 },  // Sky Blue / Cyan
      { r: 16, g: 185, b: 129 },  // Soft Emerald
    ];

    const bubbles: Bubble[] = [];
    for (let i = 0; i < bubbleCount; i++) {
      const color = colorPalette[i % colorPalette.length];
      const radius = 8 + Math.random() * 26; // Varied sizes from 8px to 34px
      const baseAlpha = 0.08 + Math.random() * 0.22; // Delicate transparency (not opaque or distracting)
      bubbles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius,
        baseSpeedX: (Math.random() - 0.5) * 0.25,
        baseSpeedY: -(0.25 + Math.random() * 0.45), // Continuous gentle upward float
        impulseX: 0,
        impulseY: 0,
        alpha: baseAlpha,
        baseAlpha,
        seed: Math.random() * 100,
        wobbleSpeed: 0.01 + Math.random() * 0.015,
        color,
        borderWidth: 1 + Math.random() * 0.8,
      });
    }

    // Pointer position for subtle hover nudge
    let mouseX = -1000;
    let mouseY = -1000;

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if ('touches' in e && e.touches.length > 0) {
        mouseX = e.touches[0].clientX;
        mouseY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        mouseX = e.clientX;
        mouseY = e.clientY;
      }
    };

    // On click or tap anywhere: calculate distance and push bubbles away smoothly
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      let clickX = 0;
      let clickY = 0;

      if ('touches' in e && e.touches.length > 0) {
        clickX = e.touches[0].clientX;
        clickY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clickX = e.clientX;
        clickY = e.clientY;
      }

      const repulsionRadius = 180; // Distance of influence around cursor
      const maxForce = 7.5; // Smooth impulse strength

      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        const dx = b.x - clickX;
        const dy = b.y - clickY;
        const dist = Math.hypot(dx, dy);

        if (dist < repulsionRadius && dist > 1) {
          const forceFactor = (1 - dist / repulsionRadius);
          const angle = Math.atan2(dy, dx);
          b.impulseX += Math.cos(angle) * maxForce * forceFactor;
          b.impulseY += Math.sin(angle) * maxForce * forceFactor;
        }
      }
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('mousemove', handlePointerMove, { passive: true });
    window.addEventListener('touchmove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('resize', handleResize);

    let time = 0;

    const render = () => {
      time += 0.02;
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];

        if (!prefersReducedMotion) {
          // Natural sine wobble
          const wobbleX = Math.sin(time * b.wobbleSpeed * 60 + b.seed) * 0.35;

          // Gentle hover nudge if mouse is very close
          const mouseDist = Math.hypot(b.x - mouseX, b.y - mouseY);
          let hoverPushX = 0;
          let hoverPushY = 0;
          if (mouseDist < 80 && mouseDist > 1) {
            const hFactor = (1 - mouseDist / 80) * 0.4;
            const hAngle = Math.atan2(b.y - mouseY, b.x - mouseX);
            hoverPushX = Math.cos(hAngle) * hFactor;
            hoverPushY = Math.sin(hAngle) * hFactor;
          }

          // Apply velocities + impulse
          b.x += b.baseSpeedX + b.impulseX + wobbleX + hoverPushX;
          b.y += b.baseSpeedY + b.impulseY + hoverPushY;

          // Smooth friction damping to return impulse gradually to zero
          b.impulseX *= 0.94;
          b.impulseY *= 0.94;

          // Seamless viewport wrap-around
          if (b.y + b.radius < -20) {
            b.y = height + b.radius + Math.random() * 20;
            b.x = Math.random() * width;
          }
          if (b.x - b.radius > width + 20) b.x = -b.radius;
          if (b.x + b.radius < -20) b.x = width + b.radius;
        }

        const { r, g, b: blue } = b.color;
        const currentAlpha = b.baseAlpha;

        ctx.save();
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);

        // Soft translucent radial fill with gentle internal glow
        const grad = ctx.createRadialGradient(
          b.x - b.radius * 0.3,
          b.y - b.radius * 0.3,
          b.radius * 0.1,
          b.x,
          b.y,
          b.radius
        );
        grad.addColorStop(0, `rgba(${r}, ${g}, ${blue}, ${currentAlpha * 0.8})`);
        grad.addColorStop(0.7, `rgba(${r}, ${g}, ${blue}, ${currentAlpha * 0.3})`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${blue}, ${currentAlpha * 0.05})`);

        ctx.fillStyle = grad;
        ctx.fill();

        // Delicate outer perimeter ring
        ctx.strokeStyle = `rgba(${r}, ${g}, ${blue}, ${currentAlpha * 1.2})`;
        ctx.lineWidth = b.borderWidth;
        ctx.stroke();

        // Subtle specular highlight arc on upper-left rim
        ctx.beginPath();
        ctx.arc(
          b.x - b.radius * 0.25,
          b.y - b.radius * 0.25,
          b.radius * 0.45,
          Math.PI * 1.05,
          Math.PI * 1.65
        );
        ctx.strokeStyle = `rgba(255, 255, 255, ${currentAlpha * 1.8})`;
        ctx.lineWidth = Math.max(1, b.borderWidth * 0.8);
        ctx.stroke();

        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
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
        className="absolute inset-0 h-full w-full pointer-events-none opacity-85 transition-opacity duration-700"
      />
    </div>
  );
}
