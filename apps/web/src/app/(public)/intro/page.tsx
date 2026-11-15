'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { SkillSharpBrandIntro, replaySkillSharpIntro } from '@/components/intro/SkillSharpBrandIntro';

export default function IntroPage() {
  return (
    <div className="relative min-h-screen w-full bg-[#020510] text-[#eef4ff] overflow-hidden">
      <SkillSharpBrandIntro forceShow />

      {/* Floating navigation controls for direct URL access */}
      <div className="fixed top-4 left-4 z-[10000] flex items-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0a1428]/80 backdrop-blur-md border border-[#2a3d60] text-[#a4b8dc] hover:text-white hover:bg-[#122240] transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          <span>Home</span>
        </Link>
        <button
          type="button"
          onClick={() => replaySkillSharpIntro()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0a1428]/80 backdrop-blur-md border border-[#2a3d60] text-[#a4b8dc] hover:text-white hover:bg-[#122240] transition-colors cursor-pointer"
        >
          <RotateCcw className="size-3.5" />
          <span>Replay</span>
        </button>
      </div>
    </div>
  );
}
