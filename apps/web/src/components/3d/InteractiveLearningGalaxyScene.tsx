'use client';

import * as React from 'react';
import * as THREE from 'three';

export function InteractiveLearningGalaxyScene() {
  const mountRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 450;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 3, 10);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const pLight1 = new THREE.PointLight(0xf59e0b, 2.5, 20);
    pLight1.position.set(-3, 4, 3);
    scene.add(pLight1);

    const pLight2 = new THREE.PointLight(0x0ea5e9, 2.0, 20);
    pLight2.position.set(3, -2, 3);
    scene.add(pLight2);

    // Central Multi-Faceted Gem
    const gemGeo = new THREE.DodecahedronGeometry(1.4, 0);
    const gemMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.8,
      flatShading: true,
    });
    const gemMesh = new THREE.Mesh(gemGeo, gemMat);
    scene.add(gemMesh);

    // Wireframe surrounding ring
    const ringGeo = new THREE.TorusGeometry(2.4, 0.04, 16, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.65,
    });
    const ringMesh1 = new THREE.Mesh(ringGeo, ringMat);
    ringMesh1.rotation.x = Math.PI / 3;
    scene.add(ringMesh1);

    const ringMesh2 = new THREE.Mesh(ringGeo, ringMat.clone());
    ringMesh2.rotation.x = -Math.PI / 4;
    ringMesh2.rotation.y = Math.PI / 6;
    scene.add(ringMesh2);

    // Floating Game & Simulation Cubes
    const cubes: THREE.Mesh[] = [];
    const cubeGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    for (let i = 0; i < 6; i++) {
      const cMat = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? 0x0ea5e9 : 0xf59e0b,
        roughness: 0.2,
        metalness: 0.8,
      });
      const cMesh = new THREE.Mesh(cubeGeo, cMat);
      const angle = (i / 6) * Math.PI * 2;
      cMesh.position.set(Math.cos(angle) * 3.4, Math.sin(angle * 2) * 0.8, Math.sin(angle) * 3.4);
      scene.add(cMesh);
      cubes.push(cMesh);
    }

    // Parallax
    let mouseX = 0;
    let mouseY = 0;
    const handlePointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      mouseX = x * 0.35;
      mouseY = y * 0.25;
    };
    container.addEventListener('mousemove', handlePointerMove);

    let reqId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      const elapsedTime = clock.getElapsedTime();

      gemMesh.rotation.x = elapsedTime * 0.4;
      gemMesh.rotation.y = elapsedTime * 0.6;

      ringMesh1.rotation.z += 0.01;
      ringMesh2.rotation.z -= 0.015;

      cubes.forEach((c, idx) => {
        const angle = (idx / 6) * Math.PI * 2 + elapsedTime * 0.3;
        c.position.x = Math.cos(angle) * 3.4;
        c.position.z = Math.sin(angle) * 3.4;
        c.position.y = Math.sin(angle * 2) * 0.8;
        c.rotation.x += 0.02;
        c.rotation.y += 0.03;
      });

      camera.position.x += (mouseX * 3 - camera.position.x) * 0.05;
      camera.position.y += (3 + mouseY * 1.5 - camera.position.y) * 0.05;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      reqId = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 500;
      const h = container.clientHeight || 450;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(reqId);
      container.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="relative w-full h-[400px] sm:h-[460px] rounded-3xl overflow-hidden cursor-grab active:cursor-grabbing"
      aria-label="Interactive 3D Simulation & Gaming Galaxy Scene"
    />
  );
}

