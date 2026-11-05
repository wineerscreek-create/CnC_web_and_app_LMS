'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

export interface BackgroundConfig {
  image?: string;
  imageAlt?: string;
  variant?: 'dark' | 'light';
  blur?: number;
  overlayOpacity?: number;
  withGrid?: boolean;
  withOrbs?: boolean;
  orbTone?: 'mustard' | 'charcoal' | 'indigo' | 'cyan' | 'purple' | 'amber';
}

interface BackgroundContextType {
  config: BackgroundConfig;
  setBackground: (config: BackgroundConfig) => void;
  resetBackground: () => void;
}

const BackgroundContext = React.createContext<BackgroundContextType | undefined>(undefined);

const DEFAULT_CONFIG: BackgroundConfig = {
  variant: 'light',
  withGrid: false,
  withOrbs: false,
};

export function GlobalBackgroundProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = React.useState<BackgroundConfig>(DEFAULT_CONFIG);

  const setBackground = React.useCallback((next: BackgroundConfig) => {
    setConfig(next);
  }, []);

  const resetBackground = React.useCallback(() => {
    setConfig(DEFAULT_CONFIG);
  }, []);

  const value = React.useMemo(
    () => ({ config, setBackground, resetBackground }),
    [config, setBackground, resetBackground]
  );

  return (
    <BackgroundContext.Provider value={value}>
      <GlobalBackgroundLayer config={config} />
      {children}
    </BackgroundContext.Provider>
  );
}

export function useBackground() {
  const ctx = React.useContext(BackgroundContext);
  if (!ctx) {
    throw new Error('useBackground must be used within GlobalBackgroundProvider');
  }
  return ctx;
}

export const useGlobalBackground = useBackground;

/**
 * SkillSharp Architectural Canvas Layer
 * Implements the Warm Ivory (#F8F7F4) surrounding canvas with subtle, clean editorial elegance.
 * Strictly adheres to the 4-color system: Warm Ivory, Pure White, Charcoal, Warm Mustard.
 */
export function GlobalBackgroundLayer({ config }: { config: BackgroundConfig }) {
  const { withGrid = false } = config;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-screen w-screen overflow-hidden select-none bg-background transition-colors duration-300"
    >
      {/* Subtle editorial texture / fine micro-dot grid if enabled */}
      {withGrid && (
        <div
          className="absolute inset-0 text-foreground opacity-[0.025] dark:opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      )}
    </div>
  );
}
