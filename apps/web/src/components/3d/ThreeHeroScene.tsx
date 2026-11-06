'use client';

import * as React from 'react';
import * as THREE from 'three';
import { useTheme } from '@/lib/theme/ThemeContext';
import { usePrefersReducedMotion, useIsPointerFine } from '@/lib/motion-config';

interface ThreeHeroSceneProps {
  className?: string;
}

export function ThreeHeroScene({ className }: ThreeHeroSceneProps) {
  const mountRef = React.useRef<HTMLDivElement>(null);
  const { isDark } = useTheme();
  const prefersReducedMotion = usePrefersReducedMotion();
  const isPointerFine = useIsPointerFine();
  const [webGLSupported, setWebGLSupported] = React.useState(true);

  React.useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Test WebGL support
    try {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
      if (!gl) {
        setWebGLSupported(false);
        return;
      }
    } catch {
      setWebGLSupported(false);
      return;
    }

    let isMounted = true;
    let isVisible = true;
    let animationFrameId: number;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    const isMobile = width < 768;

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, isMobile ? 14 : 11);

    // Renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebGLSupported(false);
      return;
    }

    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, isMobile ? 1.0 : 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Color definitions based on theme
    const colors = {
      coreLight: isDark ? 0x6366f1 : 0x4f46e5,       // Indigo
      wireLight: isDark ? 0xf97316 : 0xea580c,       // Amber / Gold
      accentTeal: isDark ? 0x14b8a6 : 0x0d9488,      // Teal
      ambient: isDark ? 0x1e293b : 0xe2e8f0,         // Ambient
      particles: isDark ? 0xffffff : 0x64748b,       // Particles
    };

    // Lights
    const ambientLight = new THREE.AmbientLight(colors.ambient, isDark ? 1.2 : 1.6);
    scene.add(ambientLight);

    const pointLightPrimary = new THREE.PointLight(colors.wireLight, isDark ? 3.5 : 2.5, 25);
    pointLightPrimary.position.set(6, 5, 6);
    scene.add(pointLightPrimary);

    const pointLightSecondary = new THREE.PointLight(colors.coreLight, isDark ? 3.0 : 2.2, 25);
    pointLightSecondary.position.set(-6, -4, 5);
    scene.add(pointLightSecondary);

    const pointLightTeal = new THREE.PointLight(colors.accentTeal, isDark ? 2.5 : 1.8, 20);
    pointLightTeal.position.set(0, -6, 4);
    scene.add(pointLightTeal);

    // -------------------------------------------------------------
    // 3D KNOWLEDGE CORE (Central Faceted Icosahedron + Wire Shell)
    // On desktop, shifted to x = 2.2 to frame right-hand side and keep text clear
    // -------------------------------------------------------------
    const coreGroup = new THREE.Group();
    const coreX = isMobile ? 0 : 2.2;
    const coreY = isMobile ? -2.2 : 0.2;
    const coreScale = isMobile ? 0.6 : 1.0;
    coreGroup.position.set(coreX, coreY, 0);
    coreGroup.scale.set(coreScale, coreScale, coreScale);
    scene.add(coreGroup);

    // Inner crystal
    const innerGeo = new THREE.IcosahedronGeometry(2.0, 0);
    const innerMat = new THREE.MeshStandardMaterial({
      color: colors.coreLight,
      roughness: 0.15,
      metalness: 0.8,
      emissive: colors.coreLight,
      emissiveIntensity: isDark ? 0.25 : 0.1,
      flatShading: true,
      transparent: isMobile,
      opacity: isMobile ? 0.4 : 1.0,
    });
    const innerCore = new THREE.Mesh(innerGeo, innerMat);
    coreGroup.add(innerCore);

    // Outer wireframe cage
    const outerGeo = new THREE.IcosahedronGeometry(2.5, 1);
    const wireMat = new THREE.MeshBasicMaterial({
      color: colors.wireLight,
      wireframe: true,
      transparent: true,
      opacity: isDark ? (isMobile ? 0.25 : 0.45) : (isMobile ? 0.2 : 0.35),
    });
    const outerCage = new THREE.Mesh(outerGeo, wireMat);
    coreGroup.add(outerCage);

    // -------------------------------------------------------------
    // DUAL ORBITAL TORUS RINGS (Connected Knowledge Pathways)
    // -------------------------------------------------------------
    const ring1Geo = new THREE.TorusGeometry(3.6, 0.035, 16, 120);
    const ring1Mat = new THREE.MeshStandardMaterial({
      color: colors.wireLight,
      roughness: 0.2,
      metalness: 0.9,
      emissive: colors.wireLight,
      emissiveIntensity: isDark ? 0.3 : 0.15,
      transparent: isMobile,
      opacity: isMobile ? 0.3 : 1.0,
    });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1.position.set(coreX, coreY, 0);
    ring1.scale.set(coreScale, coreScale, coreScale);
    ring1.rotation.x = Math.PI / 3;
    ring1.rotation.y = Math.PI / 6;
    scene.add(ring1);

    const ring2Geo = new THREE.TorusGeometry(4.4, 0.025, 16, 120);
    const ring2Mat = new THREE.MeshStandardMaterial({
      color: colors.accentTeal,
      roughness: 0.2,
      metalness: 0.8,
      emissive: colors.accentTeal,
      emissiveIntensity: isDark ? 0.25 : 0.1,
      transparent: isMobile,
      opacity: isMobile ? 0.3 : 1.0,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.position.set(coreX, coreY, 0);
    ring2.scale.set(coreScale, coreScale, coreScale);
    ring2.rotation.x = -Math.PI / 4;
    ring2.rotation.y = -Math.PI / 5;
    scene.add(ring2);

    // -------------------------------------------------------------
    // FLOATING LEARNING NODES (Geometric Interactive Polyhedra)
    // -------------------------------------------------------------
    interface LearningNode {
      mesh: THREE.Mesh;
      basePos: THREE.Vector3;
      speed: number;
      rotSpeed: THREE.Vector3;
      phase: number;
    }

    const learningNodes: LearningNode[] = [];

    const nodeConfigs = isMobile
      ? []
      : [
          {
            geo: new THREE.OctahedronGeometry(0.65, 0),
            color: colors.wireLight,
            pos: new THREE.Vector3(-2.8, 2.8, -0.5),
            speed: 1.1,
            rotSpeed: new THREE.Vector3(0.01, 0.015, 0.005),
          },
          {
            geo: new THREE.DodecahedronGeometry(0.6, 0),
            color: colors.coreLight,
            pos: new THREE.Vector3(5.6, 2.6, -1.0),
            speed: 0.9,
            rotSpeed: new THREE.Vector3(-0.01, 0.012, 0.008),
          },
          {
            geo: new THREE.TetrahedronGeometry(0.7, 0),
            color: colors.accentTeal,
            pos: new THREE.Vector3(5.0, -2.4, -0.6),
            speed: 1.3,
            rotSpeed: new THREE.Vector3(0.015, -0.01, 0.01),
          },
          {
            geo: new THREE.BoxGeometry(0.7, 0.7, 0.7),
            color: colors.wireLight,
            pos: new THREE.Vector3(0.5, -2.9, -0.8),
            speed: 0.85,
            rotSpeed: new THREE.Vector3(0.008, 0.01, -0.012),
          },
        ];

    nodeConfigs.forEach((cfg, idx) => {
      const mat = new THREE.MeshStandardMaterial({
        color: cfg.color,
        roughness: 0.25,
        metalness: 0.85,
        flatShading: true,
        emissive: cfg.color,
        emissiveIntensity: isDark ? 0.2 : 0.08,
      });
      const mesh = new THREE.Mesh(cfg.geo, mat);
      mesh.position.copy(cfg.pos);
      scene.add(mesh);
      learningNodes.push({
        mesh,
        basePos: cfg.pos.clone(),
        speed: cfg.speed,
        rotSpeed: cfg.rotSpeed,
        phase: idx * 1.5,
      });
    });

    // -------------------------------------------------------------
    // PARTICLES FIELD (Ambient Neural Stars)
    // -------------------------------------------------------------
    const particleCount = isMobile ? 40 : 180;
    const particlePositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 22;
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 16;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: colors.particles,
      size: 0.08,
      transparent: true,
      opacity: isDark ? 0.5 : 0.25,
      blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // -------------------------------------------------------------
    // POINTER TRACKING & PARALLAX
    // -------------------------------------------------------------
    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };

    const handlePointerMove = (e: MouseEvent) => {
      if (!isPointerFine || prefersReducedMotion) return;
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      mouse.targetX = Math.max(-1, Math.min(1, x));
      mouse.targetY = Math.max(-1, Math.min(1, y));
    };

    window.addEventListener('mousemove', handlePointerMove, { passive: true });

    // -------------------------------------------------------------
    // INTERSECTION OBSERVER
    // -------------------------------------------------------------
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isVisible = entry.isIntersecting;
        });
      },
      { threshold: 0.05 }
    );
    observer.observe(container);

    // -------------------------------------------------------------
    // RESIZE LISTENER
    // -------------------------------------------------------------
    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    // -------------------------------------------------------------
    // ANIMATION LOOP
    // -------------------------------------------------------------
    let clock = new THREE.Clock();

    const animate = () => {
      if (!isMounted) return;
      animationFrameId = requestAnimationFrame(animate);

      if (!isVisible) return;

      const elapsedTime = clock.getElapsedTime();

      // Smooth pointer lerp
      mouse.x += (mouse.targetX - mouse.x) * 0.05;
      mouse.y += (mouse.targetY - mouse.y) * 0.05;

      // Parallax camera displacement
      if (!prefersReducedMotion && !isMobile) {
        camera.position.x = mouse.x * 1.2;
        camera.position.y = mouse.y * 0.8;
        camera.lookAt(coreX * 0.5, 0, 0);
      }

      // Knowledge Core Rotation
      const rotMultiplier = prefersReducedMotion ? 0.2 : 1.0;
      coreGroup.rotation.y = elapsedTime * 0.25 * rotMultiplier + mouse.x * 0.3;
      coreGroup.rotation.x = Math.sin(elapsedTime * 0.2) * 0.15 + mouse.y * 0.2;
      outerCage.rotation.y = -elapsedTime * 0.18 * rotMultiplier;

      // Orbital Rings Rotation
      ring1.rotation.z = elapsedTime * 0.15 * rotMultiplier;
      ring1.rotation.x = Math.PI / 3 + Math.sin(elapsedTime * 0.3) * 0.1;

      ring2.rotation.z = -elapsedTime * 0.12 * rotMultiplier;
      ring2.rotation.y = -Math.PI / 5 + Math.cos(elapsedTime * 0.25) * 0.1;

      // Floating Learning Nodes
      learningNodes.forEach((node) => {
        const osc = Math.sin(elapsedTime * node.speed + node.phase) * 0.25;
        node.mesh.position.y = node.basePos.y + (prefersReducedMotion ? 0 : osc);
        node.mesh.position.x = node.basePos.x + (prefersReducedMotion ? 0 : Math.cos(elapsedTime * 0.7 + node.phase) * 0.08);
        node.mesh.rotation.x += node.rotSpeed.x * rotMultiplier;
        node.mesh.rotation.y += node.rotSpeed.y * rotMultiplier;
        node.mesh.rotation.z += node.rotSpeed.z * rotMultiplier;
      });

      // Ambient particles slow drift
      if (!prefersReducedMotion) {
        particles.rotation.y = elapsedTime * 0.02;
        particles.rotation.x = Math.sin(elapsedTime * 0.02) * 0.04;
      }

      renderer.render(scene, camera);
    };

    animate();

    // -------------------------------------------------------------
    // CLEANUP ON UNMOUNT
    // -------------------------------------------------------------
    return () => {
      isMounted = false;
      cancelAnimationFrame(animationFrameId);
      observer.disconnect();
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('resize', handleResize);

      innerGeo.dispose();
      innerMat.dispose();
      outerGeo.dispose();
      wireMat.dispose();
      ring1Geo.dispose();
      ring1Mat.dispose();
      ring2Geo.dispose();
      ring2Mat.dispose();
      particleGeo.dispose();
      particleMat.dispose();

      learningNodes.forEach((n) => {
        n.mesh.geometry.dispose();
        if (Array.isArray(n.mesh.material)) {
          n.mesh.material.forEach((m) => m.dispose());
        } else {
          n.mesh.material.dispose();
        }
      });

      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [isDark, prefersReducedMotion, isPointerFine]);

  if (!webGLSupported) {
    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden pointer-events-none select-none ${className}`}
        aria-hidden="true"
      >
        <div className="relative size-80 sm:size-96 rounded-full border border-accent/30 bg-radial from-accent/20 via-primary/10 to-transparent animate-pulse-glow" />
        <div className="absolute size-64 rounded-full border border-primary/40 animate-float-bob" />
        <div className="absolute size-48 rounded-full border border-secondary/40 animate-float-bob" style={{ animationDelay: '-2s' }} />
      </div>
    );
  }

  return (
    <div
      ref={mountRef}
      className={`relative w-full h-full min-h-[420px] lg:min-h-[560px] pointer-events-none select-none ${className}`}
      aria-hidden="true"
    />
  );
}
