'use client';

import * as React from 'react';

export type Theme = 'light' | 'dark';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  setTheme: (theme: Theme) => void;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  isDark: boolean;
  isLight: boolean;
}

const STORAGE_KEY = 'wc_theme';
const MODE_STORAGE_KEY = 'wc_theme_mode';
const FALLBACK_KEY = 'winnerscreek-theme';

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyThemeToDOM(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
    root.setAttribute('data-theme', 'dark');
    root.style.colorScheme = 'dark';
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', '#0B0F19');
  } else {
    root.classList.remove('dark');
    root.classList.add('light');
    root.setAttribute('data-theme', 'light');
    root.style.colorScheme = 'light';
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', '#F8F9FA');
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      try {
        const storedMode = localStorage.getItem(MODE_STORAGE_KEY);
        if (storedMode === 'light' || storedMode === 'dark' || storedMode === 'system') {
          return storedMode;
        }
        const legacyStored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(FALLBACK_KEY);
        if (legacyStored === 'light' || legacyStored === 'dark') {
          return legacyStored;
        }
      } catch {
        // storage access restricted
      }
    }
    return 'light'; // Default clean Light mode as specified in Master Prompt §3.2
  });

  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (mode === 'system') return getSystemTheme();
    return mode;
  });

  // Apply to DOM & sync state
  const setMode = React.useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
    const resolvedTheme: Theme = nextMode === 'system' ? getSystemTheme() : nextMode;
    setThemeState(resolvedTheme);
    applyThemeToDOM(resolvedTheme);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, nextMode);
      localStorage.setItem(STORAGE_KEY, resolvedTheme);
      localStorage.setItem(FALLBACK_KEY, resolvedTheme);
    } catch {
      // storage disabled
    }
  }, []);

  const setTheme = React.useCallback((nextTheme: Theme) => {
    setMode(nextTheme);
  }, [setMode]);

  const toggleTheme = React.useCallback(() => {
    setMode(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setMode]);

  // Listen to system changes when in system mode
  React.useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const nextTheme: Theme = e.matches ? 'dark' : 'light';
      setThemeState(nextTheme);
      applyThemeToDOM(nextTheme);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [mode]);

  // Sync with DOM on mount
  React.useEffect(() => {
    const resolvedTheme: Theme = mode === 'system' ? getSystemTheme() : mode;
    setThemeState(resolvedTheme);
    applyThemeToDOM(resolvedTheme);
  }, [mode]);

  // Handle storage changes across tabs
  React.useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === MODE_STORAGE_KEY && (e.newValue === 'light' || e.newValue === 'dark' || e.newValue === 'system')) {
        setModeState(e.newValue);
        const resolved = e.newValue === 'system' ? getSystemTheme() : e.newValue;
        setThemeState(resolved);
        applyThemeToDOM(resolved);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      mode,
      setTheme,
      setMode,
      toggleTheme,
      isDark: theme === 'dark',
      isLight: theme === 'light',
    }),
    [theme, mode, setTheme, setMode, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}

