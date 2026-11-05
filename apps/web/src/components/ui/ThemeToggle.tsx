'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { cn } from '@/lib/cn';

export interface ThemeToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'icon' | 'pill' | 'menu-item';
}

export function ThemeToggle({ variant = 'icon', className, ...props }: ThemeToggleProps) {
  const { theme, toggleTheme, isDark } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (variant === 'pill') {
    return (
      <div
        className={cn(
          'inline-flex items-center rounded-full p-1 border transition-colors border-border bg-muted text-foreground',
          className,
        )}
      >
        <button
          type="button"
          onClick={() => toggleTheme()}
          aria-pressed={!isDark}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all',
            !isDark
              ? 'bg-card text-foreground shadow-xs border border-border'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Sun className="size-3.5 text-accent" aria-hidden />
          <span>Light</span>
        </button>
        <button
          type="button"
          onClick={() => toggleTheme()}
          aria-pressed={isDark}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all',
            isDark
              ? 'bg-card text-foreground shadow-xs border border-border'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Moon className="size-3.5 text-accent" aria-hidden />
          <span>Dark</span>
        </button>
      </div>
    );
  }

  if (variant === 'menu-item') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={cn(
          'flex w-full items-center justify-between px-3 py-2 text-sm rounded-md transition-colors',
          'text-foreground hover:bg-muted',
          className,
        )}
        {...props}
      >
        <span className="flex items-center gap-2">
          {mounted && !isDark ? (
            <Sun className="size-4 text-accent" aria-hidden />
          ) : (
            <Moon className="size-4 text-accent" aria-hidden />
          )}
          <span>Appearance</span>
        </span>
        <span className="text-2xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
          {mounted ? (isDark ? 'Dark' : 'Light') : 'Theme'}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={mounted ? (isDark ? 'Switch to Light theme' : 'Switch to Dark theme') : 'Toggle theme'}
      title={mounted ? (isDark ? 'Switch to Light theme' : 'Switch to Dark theme') : 'Toggle theme'}
      className={cn(
        'group relative flex size-[36px] shrink-0 items-center justify-center rounded-xl border transition-all duration-200 active:scale-95',
        'border-border bg-card text-foreground hover:bg-muted',
        className,
      )}
      {...props}
    >
      <span className="relative flex size-4 items-center justify-center">
        {/* Sun Icon for Light */}
        <Sun
          className={cn(
            'absolute size-4 text-accent transition-all duration-300',
            mounted && !isDark
              ? 'scale-100 rotate-0 opacity-100'
              : 'scale-0 rotate-90 opacity-0 pointer-events-none',
          )}
          aria-hidden
        />
        {/* Moon Icon for Dark */}
        <Moon
          className={cn(
            'absolute size-4 text-accent transition-all duration-300',
            !mounted || isDark
              ? 'scale-100 rotate-0 opacity-100'
              : 'scale-0 -rotate-90 opacity-0 pointer-events-none',
          )}
          aria-hidden
        />
      </span>
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}
