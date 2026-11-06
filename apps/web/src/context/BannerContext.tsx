'use client';

import * as React from 'react';
import { useAppSelector } from '@/store';
import { api } from '@/lib/api';

export interface BannerData {
  hasCustomBanner: boolean;
  bannerUrl: string | null;
  posX: number;
  posY: number;
  scale: number;
  textColor: string;
  overlayType: 'dark' | 'light';
  overlayOpacity: number;
  glassmorphism: boolean;
}

export const DEFAULT_BANNER: BannerData = {
  hasCustomBanner: false,
  bannerUrl: null,
  posX: 50,
  posY: 50,
  scale: 1.0,
  textColor: '#FFFFFF',
  overlayType: 'dark',
  overlayOpacity: 40,
  glassmorphism: true,
};

interface BannerContextValue {
  banner: BannerData;
  isLoading: boolean;
  setBanner: (banner: BannerData) => void;
  updateBanner: (patch: Partial<BannerData>) => void;
  refreshBanner: () => Promise<void>;
}

const BannerContext = React.createContext<BannerContextValue | undefined>(undefined);

const BANNER_STORAGE_PREFIX = 'skillsharp_user_banner_';

function sanitizeBanner(raw: any): BannerData {
  if (!raw || typeof raw !== 'object') return DEFAULT_BANNER;
  return {
    hasCustomBanner: Boolean(raw.hasCustomBanner && raw.bannerUrl),
    bannerUrl: raw.bannerUrl || null,
    posX: typeof raw.posX === 'number' ? Math.min(100, Math.max(0, raw.posX)) : 50,
    posY: typeof raw.posY === 'number' ? Math.min(100, Math.max(0, raw.posY)) : 50,
    scale: typeof raw.scale === 'number' ? Math.min(3.0, Math.max(0.5, raw.scale)) : 1.0,
    textColor: raw.textColor || '#FFFFFF',
    overlayType: raw.overlayType === 'light' ? 'light' : 'dark',
    overlayOpacity: typeof raw.overlayOpacity === 'number' ? Math.min(90, Math.max(0, raw.overlayOpacity)) : 40,
    glassmorphism: raw.glassmorphism !== false,
  };
}

export function BannerProvider({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((state) => state.auth.user);
  const userId = user?.id;

  const storageKey = userId ? `${BANNER_STORAGE_PREFIX}${userId}` : null;

  const [banner, setBannerState] = React.useState<BannerData>(() => {
    if (typeof window === 'undefined' || !storageKey) return DEFAULT_BANNER;
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        return sanitizeBanner(JSON.parse(cached));
      }
    } catch {
      // ignore storage access errors
    }
    return DEFAULT_BANNER;
  });

  const [isLoading, setIsLoading] = React.useState<boolean>(false);

  // Sync with storage on user change
  React.useEffect(() => {
    if (!storageKey) {
      setBannerState(DEFAULT_BANNER);
      return;
    }

    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        setBannerState(sanitizeBanner(JSON.parse(cached)));
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  const refreshBanner = React.useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await api.get<any>('/user/banner');
      let payload: any = res;
      if (res && typeof res === 'object') {
        if (res.data && typeof res.data === 'object') {
          payload = res.data;
        }
      }
      const sanitized = sanitizeBanner(payload);
      setBannerState(sanitized);
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(sanitized));
        } catch {
          // localStorage full or disabled
        }
      }
    } catch (err) {
      console.warn('Could not sync user banner from server:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, storageKey]);

  // Initial fetch when authenticated
  React.useEffect(() => {
    if (userId) {
      refreshBanner();
    }
  }, [userId, refreshBanner]);

  const setBanner = React.useCallback(
    (newBanner: BannerData) => {
      const sanitized = sanitizeBanner(newBanner);
      setBannerState(sanitized);
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(sanitized));
        } catch {
          // ignore
        }
      }
    },
    [storageKey]
  );

  const updateBanner = React.useCallback(
    (patch: Partial<BannerData>) => {
      setBannerState((prev) => {
        const next = sanitizeBanner({ ...prev, ...patch });
        if (storageKey) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(next));
          } catch {
            // ignore
          }
        }
        return next;
      });
    },
    [storageKey]
  );

  const value = React.useMemo(
    () => ({
      banner,
      isLoading,
      setBanner,
      updateBanner,
      refreshBanner,
    }),
    [banner, isLoading, setBanner, updateBanner, refreshBanner]
  );

  return <BannerContext.Provider value={value}>{children}</BannerContext.Provider>;
}

export function useBanner(): BannerContextValue {
  const context = React.useContext(BannerContext);
  if (!context) {
    throw new Error('useBanner must be used within a BannerProvider');
  }
  return context;
}
