'use client';

import * as React from 'react';
import * as THREE from 'three';

export function UniverseClusterScene() {
  const mountRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 450;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 4, 12);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const l1 = new THREE.PointLight(0xf59e0b, 2.5, 25);
    l1.position.set(0, 0, 0);
    scene.add(l1);

    const l2 = new THREE.PointLight(0x0ea5e9, 2.0, 25);
    l2.position.set(5, 5, 5);
    scene.add(l2);

    // Three Interlinked Cluster Spheres
    const clusterGroup = new THREE.Group();
    scene.add(clusterGroup);

    const clusters = [
      { name: 'Master Trainers', color: 0xf59e0b, pos: new THREE.Vector3(-2.4, 0, 0), size: 1.0 },
      { name: 'Curriculum Schemes', color: 0x38bdf8, pos: new THREE.Vector3(2.4, 0, 0), size: 1.0 },
      { name: 'Partner Institutions', color: 0xa855f7, pos: new THREE.Vector3(0, 2.2, -1), size: 0.9 },
    ];

    const clusterMeshes: THREE.Mesh[] = [];
    clusters.forEach((c) => {
      const g = new THREE.SphereGeometry(c.size, 24, 24);
      const m = new THREE.MeshStandardMaterial({
        color: c.color,
        emissive: c.color,
        emissiveIntensity: 0.45,
        wireframe: true,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.copy(c.pos);
      clusterGroup.add(mesh);
      clusterMeshes.push(mesh);
    });

    // Connecting Energy Lines
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      clusters[0].pos,
      clusters[1].pos,
      clusters[2].pos,
      clusters[0].pos,
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.5 });
    const lines = new THREE.Line(lineGeo, lineMat);
    clusterGroup.add(lines);

    // Surrounding Star Swarm
    const pCount = 500;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount * 3; i += 3) {
      pPos[i] = THREE.MathUtils.randFloatSpread(12);
      pPos[i + 1] = THREE.MathUtils.randFloatSpread(8);
      pPos[i + 2] = THREE.MathUtils.randFloatSpread(8);
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({ color: 0x38bdf8, size: 0.05, transparent: true, opacity: 0.75 });
    const pPoints = new THREE.Points(pGeo, pMat);
    scene.add(pPoints);

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

      clusterGroup.rotation.y = elapsedTime * 0.2;
      clusterMeshes.forEach((m, i) => {
        m.rotation.x += 0.01;
        m.rotation.y += 0.02;
        m.position.y += Math.sin(elapsedTime * 2 + i) * 0.005;
      });

      pPoints.rotation.y = -elapsedTime * 0.03;

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
      aria-label="Interactive 3D Trainer & Course Universe Cluster Scene"
    />
  );
}
