'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, api } from '@/lib/api';
import { getCachedQuery, setCachedQuery } from '@/lib/offline/db';

export interface QueryResult<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** True only on the very first load, so refetches don't flash a skeleton. */
  initialLoading: boolean;
  refetch: () => void;
  /** True if data was served from the local offline-first cache */
  isFromCache: boolean;
  /** ISO timestamp of when the served data was cached */
  lastSyncedAt: string | null;
  /** True if the device is currently detected as offline */
  isOffline: boolean;
}

function isNetworkOrOfflineError(error: any): boolean {
  if (!error) return false;
  if (error instanceof ApiError && (error.status === 0 || error.code === 'NETWORK_ERROR')) {
    return true;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return true;
  }
  return false;
}

/**
 * Data fetching with offline-first persistence and stale data resilience.
 *
 * 1. Online: executes live query, returns server response, and caches result in IndexedDB.
 * 2. Offline / Disconnected: transparently falls back to user-isolated cached query data,
 *    attaching `isFromCache: true` and `lastSyncedAt`.
 * 3. Never masks genuine server-side errors (401/403/404/500).
 * 4. Automatically re-validates stale cached views when internet connection is restored.
 */
export function useApi<T = any>(
  path: string | null,
  params?: Record<string, string | number | boolean | undefined | null>,
  options?: { enabled?: boolean; select?: (raw: any) => T; disableOfflineCache?: boolean },
): QueryResult<T> {
  const enabled = options?.enabled !== false && Boolean(path);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [loaded, setLoaded] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [isFromCache, setIsFromCache] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  const prevPathRef = useRef(path);
  const selectRef = useRef(options?.select);
  selectRef.current = options?.select;
  const serialised = JSON.stringify(params ?? {});
  const disableOfflineCache = Boolean(options?.disableOfflineCache);

  // Revalidate stale data automatically when connectivity is restored
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => {
      setIsOffline(false);
      setNonce((v) => v + 1);
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !path) {
      setLoading(false);
      return;
    }
    if (prevPathRef.current !== path) {
      prevPathRef.current = path;
      setData(null);
      setLoaded(false);
      setIsFromCache(false);
      setLastSyncedAt(null);
    }
    let active = true;
    setLoading(true);
    setError(null);

    const parsedParams = JSON.parse(serialised);

    // If device is already known to be offline, try cached query first
    const deviceOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (deviceOffline && !disableOfflineCache) {
      getCachedQuery(null, path, parsedParams).then((cached) => {
        if (!active) return;
        if (cached) {
          const select = selectRef.current;
          setData(select ? select(cached.data) : ((cached.data?.data ?? cached.data) as T));
          setError(null);
          setIsFromCache(true);
          setLastSyncedAt(cached.cachedAt);
          setLoaded(true);
          setLoading(false);
        } else {
          setError(
            new ApiError(0, {
              code: 'NETWORK_ERROR',
              message: "You're currently offline. This page hasn't been cached for offline use yet.",
            }),
          );
          setLoaded(true);
          setLoading(false);
        }
      });
      return () => {
        active = false;
      };
    }

    api
      .get(path, parsedParams)
      .then((response) => {
        if (!active) return;
        const select = selectRef.current;
        setData(select ? select(response) : ((response?.data ?? response) as T));
        setIsFromCache(false);
        setLastSyncedAt(new Date().toISOString());
        setLoaded(true);

        // Persist successful response to local user-scoped cache
        if (!disableOfflineCache) {
          setCachedQuery(null, path, parsedParams, response);
        }
      })
      .catch(async (caught) => {
        if (!active) return;

        // On network disconnect/offline, fallback to cached data if available
        if (isNetworkOrOfflineError(caught) && !disableOfflineCache) {
          const cached = await getCachedQuery(null, path, parsedParams);
          if (!active) return;
          if (cached) {
            const select = selectRef.current;
            setData(select ? select(cached.data) : ((cached.data?.data ?? cached.data) as T));
            setError(null);
            setIsFromCache(true);
            setLastSyncedAt(cached.cachedAt);
            setLoaded(true);
            setLoading(false);
            return;
          }
        }

        setError(caught as ApiError);
        setIsFromCache(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [path, serialised, enabled, nonce, disableOfflineCache]);

  const refetch = useCallback(() => setNonce((value) => value + 1), []);
  return {
    data,
    error,
    loading,
    initialLoading: loading && !loaded,
    refetch,
    isFromCache,
    lastSyncedAt,
    isOffline,
  };
}

/** A mutation with pending/error state and an optional success callback. */
export function useMutation<TBody = any, TResult = any>(
  run: (body: TBody) => Promise<TResult>,
): {
  mutate: (body: TBody) => Promise<TResult | null>;
  pending: boolean;
  error: ApiError | null;
  reset: () => void;
} {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const runRef = useRef(run);
  runRef.current = run;

  const mutate = useCallback(async (body: TBody) => {
    setPending(true);
    setError(null);
    try {
      return await runRef.current(body);
    } catch (caught) {
      setError(caught as ApiError);
      return null;
    } finally {
      setPending(false);
    }
  }, []);

  return { mutate, pending, error, reset: () => setError(null) };
}
