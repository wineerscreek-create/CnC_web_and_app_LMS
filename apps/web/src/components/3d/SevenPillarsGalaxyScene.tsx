'use client';

import * as React from 'react';
import * as THREE from 'three';

const PILLARS = [
  { name: 'Communication', label: 'Communication & Articulation', color: '#f59e0b', radius: 3.4, speed: 0.35, size: 0.38 },
  { name: 'Problem Solving', label: 'Critical Problem Solving', color: '#0ea5e9', radius: 4.3, speed: 0.28, size: 0.42 },
  { name: 'Technical Agility', label: 'Technical Depth & Agility', color: '#8b5cf6', radius: 5.2, speed: 0.22, size: 0.44 },
  { name: 'Collaboration', label: 'Collaborative Team Dynamics', color: '#10b981', radius: 6.1, speed: 0.18, size: 0.40 },
  { name: 'Leadership', label: 'Adaptive Leadership & Initiative', color: '#f97316', radius: 7.0, speed: 0.15, size: 0.42 },
  { name: 'Professional Ethics', label: 'Professional Ethics & Integrity', color: '#ec4899', radius: 7.9, speed: 0.12, size: 0.38 },
  { name: 'Continuous Growth', label: 'Continuous Learning & Evolution', color: '#06b6d4', radius: 8.8, speed: 0.10, size: 0.40 },
];

export function SevenPillarsGalaxyScene() {
  const mountRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 450;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 7.5, 13);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Ambient & Point Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const centerLight = new THREE.PointLight(0xf59e0b, 2.5, 25);
    centerLight.position.set(0, 0, 0);
    scene.add(centerLight);

    const blueLight = new THREE.PointLight(0x0ea5e9, 1.8, 30);
    blueLight.position.set(6, 4, 6);
    scene.add(blueLight);

    // Galactic Core Sphere
    const coreGeo = new THREE.SphereGeometry(1.2, 32, 32);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.8,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    scene.add(coreMesh);

    // Wireframe Glow Cage
    const cageGeo = new THREE.IcosahedronGeometry(1.6, 2);
    const cageMat = new THREE.MeshBasicMaterial({
      color: 0xfde68a,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const cageMesh = new THREE.Mesh(cageGeo, cageMat);
    scene.add(cageMesh);

    // Orbital Nodes and Rings
    const planetMeshes: { mesh: THREE.Mesh; orbitGroup: THREE.Group; speed: number; radius: number; baseAngle: number }[] = [];

    PILLARS.forEach((p, index) => {
      // Orbital Ring Path
      const ringGeo = new THREE.RingGeometry(p.radius - 0.015, p.radius + 0.015, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(p.color),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.22,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      scene.add(ringMesh);

      // Planet Sphere
      const pGeo = new THREE.SphereGeometry(p.size, 24, 24);
      const pMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(p.color),
        emissive: new THREE.Color(p.color),
        emissiveIntensity: 0.45,
        roughness: 0.3,
        metalness: 0.7,
      });
      const pMesh = new THREE.Mesh(pGeo, pMat);

      // Atmospheric Halo
      const haloGeo = new THREE.SphereGeometry(p.size * 1.35, 16, 16);
      const haloMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(p.color),
        wireframe: true,
        transparent: true,
        opacity: 0.25,
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      pMesh.add(haloMesh);

      const orbitGroup = new THREE.Group();
      scene.add(orbitGroup);
      orbitGroup.add(pMesh);

      const baseAngle = (index * (Math.PI * 2)) / PILLARS.length;
      pMesh.position.set(Math.cos(baseAngle) * p.radius, 0, Math.sin(baseAngle) * p.radius);

      planetMeshes.push({
        mesh: pMesh,
        orbitGroup,
        speed: p.speed,
        radius: p.radius,
        baseAngle,
      });
    });

    // Particle Dust Field
    const dustCount = 120;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount * 3; i += 3) {
      const r = THREE.MathUtils.randFloat(2.5, 9.5);
      const theta = Math.random() * Math.PI * 2;
      const y = THREE.MathUtils.randFloatSpread(2.5);
      dustPos[i] = Math.cos(theta) * r;
      dustPos[i + 1] = y;
      dustPos[i + 2] = Math.sin(theta) * r;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xf59e0b,
      size: 0.08,
      transparent: true,
      opacity: 0.6,
    });
    const dustPoints = new THREE.Points(dustGeo, dustMat);
    scene.add(dustPoints);

    // Mouse Parallax Interaction
    let mouseX = 0;
    let mouseY = 0;
    const handlePointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      mouseX = x * 0.4;
      mouseY = y * 0.3;
    };

    container.addEventListener('mousemove', handlePointerMove);

    let reqId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      const elapsedTime = clock.getElapsedTime();

      // Rotate core
      coreMesh.rotation.y = elapsedTime * 0.4;
      cageMesh.rotation.y = -elapsedTime * 0.25;
      cageMesh.rotation.x = Math.sin(elapsedTime * 0.3) * 0.2;
      dustPoints.rotation.y = elapsedTime * 0.05;

      // Orbit planets
      planetMeshes.forEach((item) => {
        const angle = item.baseAngle + elapsedTime * item.speed;
        item.mesh.position.x = Math.cos(angle) * item.radius;
        item.mesh.position.z = Math.sin(angle) * item.radius;
        item.mesh.position.y = Math.sin(angle * 2) * 0.35;
        item.mesh.rotation.y += 0.02;
      });

      // Smooth camera parallax
      camera.position.x += (mouseX * 4 - camera.position.x) * 0.05;
      camera.position.y += (7.5 + mouseY * 2 - camera.position.y) * 0.05;
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
      className="relative w-full h-[420px] sm:h-[480px] rounded-3xl overflow-hidden cursor-grab active:cursor-grabbing"
      aria-label="Interactive 3D Seven Pillars Galaxy Scene"
    />
  );
}
