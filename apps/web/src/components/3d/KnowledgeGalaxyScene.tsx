'use client';

import * as React from 'react';
import * as THREE from 'three';

export function KnowledgeGalaxyScene() {
  const mountRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 450;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 5, 12);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const coreLight = new THREE.PointLight(0xf59e0b, 2.5, 25);
    scene.add(coreLight);

    const blueLight = new THREE.PointLight(0x0ea5e9, 2.0, 25);
    blueLight.position.set(5, 3, 5);
    scene.add(blueLight);

    // Galaxy Particle Spiral
    const particleCount = 1800;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const color1 = new THREE.Color('#f59e0b');
    const color2 = new THREE.Color('#38bdf8');
    const color3 = new THREE.Color('#a855f7');

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const radius = Math.random() * 5.5 + 0.3;
      const spinAngle = radius * 2.2;
      const branchAngle = ((i % 3) * Math.PI * 2) / 3;

      const randomX = (Math.random() - 0.5) * 0.45 * radius;
      const randomY = (Math.random() - 0.5) * 0.35 * (6 - radius);
      const randomZ = (Math.random() - 0.5) * 0.45 * radius;

      positions[i3] = Math.cos(branchAngle + spinAngle) * radius + randomX;
      positions[i3 + 1] = randomY;
      positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + randomZ;

      // Color gradient from center to rim
      const mixedColor = color1.clone();
      if (radius > 3) {
        mixedColor.lerp(color2, (radius - 3) / 2.5);
      } else {
        mixedColor.lerp(color3, radius / 3);
      }

      colors[i3] = mixedColor.r;
      colors[i3 + 1] = mixedColor.g;
      colors[i3 + 2] = mixedColor.b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.065,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
    });

    const galaxy = new THREE.Points(geo, mat);
    scene.add(galaxy);

    // Glowing Galactic Center
    const centerGeo = new THREE.SphereGeometry(0.8, 32, 32);
    const centerMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.9,
      roughness: 0.1,
      metalness: 0.9,
    });
    const centerMesh = new THREE.Mesh(centerGeo, centerMat);
    scene.add(centerMesh);

    // Floating knowledge nodes
    const nodeGeo = new THREE.OctahedronGeometry(0.25, 0);
    const nodes: THREE.Mesh[] = [];
    for (let k = 0; k < 8; k++) {
      const nMat = new THREE.MeshStandardMaterial({
        color: k % 2 === 0 ? 0x38bdf8 : 0xf59e0b,
        roughness: 0.2,
        metalness: 0.8,
        wireframe: true,
      });
      const node = new THREE.Mesh(nodeGeo, nMat);
      const r = 2.2 + k * 0.35;
      const th = (k / 8) * Math.PI * 2;
      node.position.set(Math.cos(th) * r, (Math.random() - 0.5) * 1.5, Math.sin(th) * r);
      scene.add(node);
      nodes.push(node);
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

      galaxy.rotation.y = elapsedTime * 0.08;
      centerMesh.rotation.y = -elapsedTime * 0.2;

      nodes.forEach((n, idx) => {
        n.rotation.x += 0.02;
        n.rotation.y += 0.03;
        n.position.y += Math.sin(elapsedTime * 2 + idx) * 0.005;
      });

      camera.position.x += (mouseX * 3 - camera.position.x) * 0.05;
      camera.position.y += (5 + mouseY * 1.5 - camera.position.y) * 0.05;
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
      aria-label="Interactive 3D Knowledge Galaxy Scene"
    />
  );
}
