'use client';

import * as React from 'react';
import Link from 'next/link';
import { WifiOff, RefreshCw, BookOpen } from 'lucide-react';
import { useOffline } from '@/context/OfflineContext';
import { Button } from '@/components/ui/button';

interface OnlineOnlyNoticeProps {
  featureName: string;
  description?: string;
  children?: React.ReactNode;
}

export function OnlineOnlyNotice({
  featureName,
  description,
  children,
}: OnlineOnlyNoticeProps) {
  const { isOnline, triggerManualSync } = useOffline();

  if (isOnline) {
    return <>{children}</>;
  }

  return (
    <div className="w-full rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 text-foreground my-4 backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="size-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
          <WifiOff className="size-6" />
        </div>

        <div className="space-y-1 flex-1">
          <h3 className="font-heading font-semibold text-base text-heading">
            {featureName ? `${featureName} — Offline Mode` : 'Offline Mode'}
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {description ||
              "You're currently offline. This feature requires an active internet connection. Please reconnect and try again."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => triggerManualSync()}
            className="text-xs"
          >
            <RefreshCw className="size-3.5 mr-1.5" />
            Check Connection
          </Button>

          <Button size="sm" asChild className="text-xs">
            <Link href="/student/offline">
              <BookOpen className="size-3.5 mr-1.5" />
              Offline Library
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
