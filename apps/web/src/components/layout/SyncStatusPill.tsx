'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { useOffline } from '@/context/OfflineContext';
import { cn } from '@/lib/cn';
import { formatDistanceToNow } from 'date-fns';

export function SyncStatusPill() {
  const {
    isOnline,
    pendingCount,
    lastSyncTime,
    isSyncing,
    storageUsage,
    triggerManualSync,
  } = useOffline();

  const [open, setOpen] = React.useState(false);
  const pillRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pillRef.current && !pillRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const formattedStorage = React.useMemo(() => {
    const bytes = storageUsage.totalBytes;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, [storageUsage.totalBytes]);

  const lastSyncLabel = React.useMemo(() => {
    if (!lastSyncTime) return 'Never';
    try {
      return formatDistanceToNow(new Date(lastSyncTime), { addSuffix: true });
    } catch {
      return 'Recently';
    }
  }, [lastSyncTime]);

  return (
    <div className="relative" ref={pillRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-200',
          isOnline
            ? 'bg-primary/5 hover:bg-primary/10 border-primary/20 text-foreground'
            : 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-700 dark:text-amber-400'
        )}
        aria-expanded={open}
        aria-label="Offline and Synchronization Status"
      >
        {isSyncing ? (
          <RefreshCw className="size-3 text-primary animate-spin" />
        ) : isOnline ? (
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
        ) : (
          <WifiOff className="size-3 text-amber-600 dark:text-amber-400" />
        )}

        <span className="hidden sm:inline font-mono text-[11px]">
          {isOnline ? 'Online' : 'Offline'}
        </span>

        {pendingCount > 0 && (
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white leading-none">
            {pendingCount}
          </span>
        )}
      </button>

      {/* Status Details Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-card border border-border shadow-xl p-4 text-xs z-50 text-foreground animate-enter">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'size-6 rounded-lg flex items-center justify-center',
                  isOnline
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                )}
              >
                {isOnline ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
              </div>
              <span className="font-heading font-semibold text-heading">
                {isOnline ? 'Connected to Server' : 'Working Offline'}
              </span>
            </div>
          </div>

          <div className="py-3 space-y-2.5 text-muted-foreground text-[11px]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock className="size-3 text-muted-foreground" />
                Last Synced
              </span>
              <span className="font-medium text-foreground">{lastSyncLabel}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <AlertCircle className="size-3 text-muted-foreground" />
                Pending Outbox
              </span>
              <span
                className={cn(
                  'font-medium font-mono',
                  pendingCount > 0 ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-foreground'
                )}
              >
                {pendingCount} operation(s)
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <HardDrive className="size-3 text-muted-foreground" />
                Local Storage Used
              </span>
              <span className="font-medium text-foreground">{formattedStorage}</span>
            </div>
          </div>

          <div className="pt-3 border-t border-border flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void triggerManualSync()}
              disabled={isSyncing || !isOnline}
              className={cn(
                'w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-medium transition-colors',
                isOnline
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              )}
            >
              <RefreshCw className={cn('size-3.5', isSyncing && 'animate-spin')} />
              {isSyncing ? 'Synchronizing…' : 'Sync Now'}
            </button>

            <Link
              href="/student/offline"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-2 py-1.5 rounded-lg text-primary hover:bg-primary/5 transition-colors font-medium text-[11px]"
            >
              <span>Manage Downloaded Content</span>
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
