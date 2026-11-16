'use client';

import { AlertTriangle, CloudOff, Download, Inbox, RefreshCw, WifiOff } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

/** Every screen needs these three states plus retry (§24) — never a blank white screen. */

export function LoadingSkeleton({
  variant = 'cards',
  rows = 5,
  className,
}: {
  variant?: 'cards' | 'table' | 'chart' | 'kpis' | 'text' | 'detail';
  rows?: number;
  className?: string;
}) {
  if (variant === 'kpis') {
    return (
      <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)} role="status" aria-label="Loading">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-20" />
            <Skeleton className="mt-3 h-3 w-28" />
          </Card>
        ))}
      </div>
    );
  }
  if (variant === 'table') {
    return (
      <Card className={cn('p-5', className)} role="status" aria-label="Loading">
        <Skeleton className="h-4 w-40" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      </Card>
    );
  }
  if (variant === 'chart') {
    return (
      <Card className={cn('p-5', className)} role="status" aria-label="Loading">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-4 h-[170px] w-full" />
      </Card>
    );
  }
  if (variant === 'text') {
    return (
      <div className={cn('space-y-2', className)} role="status" aria-label="Loading">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className={cn('h-3', index === rows - 1 ? 'w-2/3' : 'w-full')} />
        ))}
      </div>
    );
  }
  if (variant === 'detail') {
    return (
      <div className={cn('space-y-4', className)} role="status" aria-label="Loading">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-72" />
            </div>
          </div>
        </Card>
        <LoadingSkeleton variant="kpis" />
        <LoadingSkeleton variant="table" />
      </div>
    );
  }
  return (
    <div className={cn('grid gap-4 md:grid-cols-2 xl:grid-cols-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <Card key={index} className="p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-4/5" />
          <Skeleton className="mt-4 h-8 w-28" />
        </Card>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  icon,
  action,
  className,
}: {
  title: string;
  body?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <div className="mb-3.5 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <Inbox className="size-5" aria-hidden />}
      </div>
      <p className="text-md font-bold text-heading">{title}</p>
      {body && <p className="mt-1.5 max-w-md text-base text-muted-foreground">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function formatSyncTime(isoString?: string | null): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error?: ApiError | Error | null;
  onRetry?: () => void;
  className?: string;
}) {
  const apiError = error as ApiError | undefined;
  const isScope = apiError?.code === 'SCOPE_FORBIDDEN' || apiError?.code === 'ROLE_FORBIDDEN';
  const isOffline =
    apiError?.status === 0 ||
    apiError?.code === 'NETWORK_ERROR' ||
    (typeof navigator !== 'undefined' && !navigator.onLine);

  if (isOffline) {
    return (
      <div
        role="alert"
        className={cn(
          'flex flex-col items-center rounded-2xl border border-amber-500/30 bg-amber-500/10 px-6 py-12 text-center',
          className,
        )}
      >
        <div className="mb-3.5 flex size-11 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
          <WifiOff className="size-5" aria-hidden />
        </div>
        <p className="text-md font-bold text-heading">You are currently offline</p>
        <p className="mt-1.5 max-w-md text-base text-muted-foreground">
          {error?.message &&
          !error.message.includes('reach the server') &&
          !error.message.includes('Failed to fetch') &&
          !error.message.includes('Something went wrong')
            ? error.message
            : "This page hasn't been cached for offline use yet. Reconnect to the internet to load this content, or access your downloaded materials."}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              <RefreshCw className="mr-1.5 size-3.5" aria-hidden />
              Try again
            </Button>
          )}
          <Link href="/student/offline">
            <Button variant="secondary" size="sm">
              <Download className="mr-1.5 size-3.5" aria-hidden />
              Downloaded Content
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="mb-3.5 flex size-11 items-center justify-center rounded-full bg-destructive/20 text-destructive">
        <AlertTriangle className="size-5" aria-hidden />
      </div>
      <p className="text-md font-bold text-heading">
        {isScope ? "You don't have access to this" : "That didn't load"}
      </p>
      <p className="mt-1.5 max-w-md text-base text-muted-foreground">
        {error?.message ?? 'Something went wrong while loading this view.'}
      </p>
      {apiError?.requestId && (
        <p className="mt-2 text-xs text-muted-foreground">Reference: {apiError.requestId}</p>
      )}
      {onRetry && !isScope && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw aria-hidden />
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * One wrapper for the loading → error → empty → content decision, so no screen can forget a
 * state. Displays offline cached banner when data is rendered from the local offline-first cache.
 */
export function AsyncSection<T>({
  query,
  skeleton = 'cards',
  isEmpty,
  empty,
  children,
}: {
  query: {
    data: T | null;
    error: ApiError | null;
    initialLoading: boolean;
    refetch: () => void;
    isFromCache?: boolean;
    lastSyncedAt?: string | null;
  };
  skeleton?: React.ComponentProps<typeof LoadingSkeleton>['variant'];
  isEmpty?: (data: T) => boolean;
  empty?: React.ReactNode;
  children: (data: T) => React.ReactNode;
}) {
  if (query.initialLoading) return <LoadingSkeleton variant={skeleton} />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;
  if (!query.data) return <>{empty ?? <EmptyState title="Nothing to show yet" />}</>;
  if (isEmpty?.(query.data)) return <>{empty ?? <EmptyState title="Nothing to show yet" />}</>;

  return (
    <>
      {query.isFromCache && (
        <div
          role="status"
          className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200"
        >
          <div className="flex items-center gap-2">
            <CloudOff className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <span>
              Viewing offline data
              {query.lastSyncedAt ? ` (synced ${formatSyncTime(query.lastSyncedAt)})` : ''}.
              Reconnect to refresh.
            </span>
          </div>
          {query.refetch && (
            <button
              type="button"
              onClick={() => query.refetch()}
              className="font-medium underline hover:text-amber-700 dark:hover:text-amber-300"
            >
              Refresh
            </button>
          )}
        </div>
      )}
      {children(query.data)}
    </>
  );
}
