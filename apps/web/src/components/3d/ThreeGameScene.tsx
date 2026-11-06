'use client';

import * as React from 'react';
import * as THREE from 'three';
import { useTheme } from '@/lib/theme/ThemeContext';
import { usePrefersReducedMotion } from '@/lib/motion-config';

interface ThreeGameSceneProps {
  className?: string;
}

export function ThreeGameScene({ className }: ThreeGameSceneProps) {
  const mountRef = React.useRef<HTMLDivElement>(null);
  const { isDark } = useTheme();
  const prefersReducedMotion = usePrefersReducedMotion();

  React.useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let isMounted = true;
    let isVisible = true;
    let animationFrameId: number;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 400;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 50);
    camera.position.set(0, 0, 7.5);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'low-power',
      });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 1.5));
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const colors = {
      accent1: isDark ? 0xf97316 : 0xea580c, // Orange
      accent2: isDark ? 0x14b8a6 : 0x0d9488, // Teal
      accent3: isDark ? 0x818cf8 : 0x4f46e5, // Indigo
      wire: isDark ? 0x334155 : 0xcbd5e1,
    };

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, isDark ? 1.0 : 1.4);
    scene.add(ambientLight);

    const light1 = new THREE.PointLight(colors.accent1, isDark ? 3.0 : 2.0, 15);
    light1.position.set(4, 3, 4);
    scene.add(light1);

    const light2 = new THREE.PointLight(colors.accent2, isDark ? 2.5 : 1.8, 15);
    light2.position.set(-4, -3, 3);
    scene.add(light2);

    // Group containing arcade/simulation 3D shapes
    const gameGroup = new THREE.Group();
    scene.add(gameGroup);

    // Dynamic floating dice / multifaceted gem
    const gemGeo = new THREE.DodecahedronGeometry(1.5, 0);
    const gemMat = new THREE.MeshStandardMaterial({
      color: colors.accent1,
      roughness: 0.1,
      metalness: 0.85,
      flatShading: true,
    });
    const gemMesh = new THREE.Mesh(gemGeo, gemMat);
    gameGroup.add(gemMesh);

    // Surrounding cyber rings
    const ringGeo = new THREE.TorusGeometry(2.3, 0.03, 16, 80);
    const ringMat = new THREE.MeshBasicMaterial({
      color: colors.accent2,
      wireframe: true,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 4;
    gameGroup.add(ringMesh);

    const ring2Geo = new THREE.TorusGeometry(2.8, 0.02, 16, 80);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: colors.accent3,
      wireframe: true,
    });
    const ring2Mesh = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2Mesh.rotation.y = Math.PI / 3;
    gameGroup.add(ring2Mesh);

    // Pause offscreen
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        isVisible = e.isIntersecting;
      });
    }, { threshold: 0.05 });
    observer.observe(container);

    const clock = new THREE.Clock();

    const animate = () => {
      if (!isMounted) return;
      animationFrameId = requestAnimationFrame(animate);
      if (!isVisible) return;

      const time = clock.getElapsedTime();
      const mult = prefersReducedMotion ? 0.2 : 1.0;

      gemMesh.rotation.x = time * 0.4 * mult;
      gemMesh.rotation.y = time * 0.5 * mult;

      ringMesh.rotation.z = -time * 0.3 * mult;
      ring2Mesh.rotation.x = time * 0.25 * mult;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      isMounted = false;
      cancelAnimationFrame(animationFrameId);
      observer.disconnect();

      gemGeo.dispose();
      gemMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      ring2Geo.dispose();
      ring2Mat.dispose();
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [isDark, prefersReducedMotion]);

  return (
    <div
      ref={mountRef}
      className={`w-full h-full min-h-[300px] pointer-events-none select-none ${className}`}
      aria-hidden="true"
    />
  );
}
