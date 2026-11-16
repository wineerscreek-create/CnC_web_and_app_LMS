'use client';

import * as React from 'react';
import Link from 'next/link';
import { WifiOff, RefreshCw, BookOpen, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CNCLogo } from '@/components/ui/CNCLogo';

export default function OfflineFallbackPage() {
  const [retrying, setRetrying] = React.useState(false);

  function handleRetry() {
    setRetrying(true);
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground selection:bg-primary/20">
      <div className="w-full max-w-md bg-card border border-border rounded-3xl p-8 shadow-xl text-center space-y-6">
        <div className="flex justify-center">
          <CNCLogo />
        </div>

        <div className="mx-auto size-16 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
          <WifiOff className="size-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold font-heading text-heading">
            You Are Offline
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Internet connectivity is currently unavailable. You can continue reading your downloaded courses, eBooks, and offline question sets.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="secondary"
            onClick={handleRetry}
            disabled={retrying}
            className="w-full sm:w-auto"
          >
            <RefreshCw className={`size-4 mr-2 ${retrying ? 'animate-spin' : ''}`} />
            {retrying ? 'Retrying…' : 'Try Reconnecting'}
          </Button>

          <Button asChild className="w-full sm:w-auto">
            <Link href="/student/offline">
              <BookOpen className="size-4 mr-2" />
              Offline Content
              <ArrowRight className="size-4 ml-1.5" />
            </Link>
          </Button>
        </div>

        <div className="border-t border-border pt-4 text-xs text-muted-foreground">
          Pending assessment attempts and learning progress will automatically synchronize when you reconnect.
        </div>
      </div>
    </div>
  );
}
