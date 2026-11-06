'use client';

import * as React from 'react';
import * as THREE from 'three';

const STAGES = [
  { id: 1, title: 'Discover & Assess', desc: 'Comprehensive readiness baseline across core dimensions', color: '#f59e0b' },
  { id: 2, title: 'Plan & Personalize', desc: 'Custom curriculum schemes, milestones, and trajectory', color: '#38bdf8' },
  { id: 3, title: 'Learn & Explore', desc: 'Interactive classes, case studies, and multimedia modules', color: '#a855f7' },
  { id: 4, title: 'Practice & Apply', desc: 'Real-world challenges, cognitive games, and live workshops', color: '#10b981' },
  { id: 5, title: 'Evaluate & Improve', desc: 'Rigorous rubric scoring, peer insight, and faculty reviews', color: '#f97316' },
  { id: 6, title: 'Track & Grow', desc: 'Dynamic portfolio progress and verified milestone mastery', color: '#ec4899' },
];

export function LearningJourneyGalaxyScene() {
  const mountRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 450;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 4, 11);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const pLight1 = new THREE.PointLight(0xf59e0b, 2.2, 20);
    pLight1.position.set(-4, 3, 2);
    scene.add(pLight1);

    const pLight2 = new THREE.PointLight(0x38bdf8, 2.0, 20);
    pLight2.position.set(4, 2, 2);
    scene.add(pLight2);

    // Curve representing the 6-stage journey
    const points: THREE.Vector3[] = [];
    const count = STAGES.length;
    for (let i = 0; i < count; i++) {
      const angle = (i / (count - 1)) * Math.PI * 1.5 - Math.PI * 0.75;
      const x = Math.sin(angle) * 4.6;
      const y = Math.cos(angle * 1.8) * 1.4;
      const z = -Math.cos(angle) * 2.8;
      points.push(new THREE.Vector3(x, y, z));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = new THREE.TubeGeometry(curve, 80, 0.08, 12, false);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.8,
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    scene.add(tubeMesh);

    // Waypoint nodes
    const nodeMeshes: { mesh: THREE.Mesh; ring: THREE.Mesh; basePos: THREE.Vector3 }[] = [];
    points.forEach((pt, idx) => {
      const stage = STAGES[idx];
      const sphereGeo = new THREE.SphereGeometry(0.32, 24, 24);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(stage.color),
        emissive: new THREE.Color(stage.color),
        emissiveIntensity: 0.5,
        roughness: 0.2,
        metalness: 0.8,
      });
      const sMesh = new THREE.Mesh(sphereGeo, sphereMat);
      sMesh.position.copy(pt);
      scene.add(sMesh);

      // Surrounding ring
      const ringGeo = new THREE.RingGeometry(0.44, 0.52, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(stage.color),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.copy(pt);
      ringMesh.rotation.x = Math.PI / 4;
      scene.add(ringMesh);

      nodeMeshes.push({ mesh: sMesh, ring: ringMesh, basePos: pt });
    });

    // Traveling Energy Pulse
    const pulseGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });
    const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
    scene.add(pulseMesh);

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

      // Move pulse along curve
      const t = (elapsedTime * 0.2) % 1;
      const pos = curve.getPointAt(t);
      pulseMesh.position.copy(pos);

      // Animate node rings
      nodeMeshes.forEach((n, idx) => {
        n.ring.rotation.z += 0.03;
        n.ring.rotation.y = Math.sin(elapsedTime * 2 + idx) * 0.4;
        n.mesh.position.y = n.basePos.y + Math.sin(elapsedTime * 2 + idx) * 0.08;
      });

      // Camera parallax
      camera.position.x += (mouseX * 3 - camera.position.x) * 0.05;
      camera.position.y += (4 + mouseY * 1.5 - camera.position.y) * 0.05;
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
      aria-label="Interactive 3D Learning Journey Galaxy Scene"
    />
  );
}

