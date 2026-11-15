'use client';

import { AlertTriangle, Download, RefreshCw, WifiOff } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { SkillSharpLogo } from '@/components/ui/SkillSharpLogo';

/**
 * Route Error Boundary.
 * Distinguishes offline network disconnects from actual runtime errors.
 * Never displays "Something went wrong" for network connectivity failures.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isOffline, setIsOffline] = React.useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateOnline = () => setIsOffline(!navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  const msg = error?.message?.toLowerCase() || '';
  const isNetworkFailure =
    isOffline ||
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('offline') ||
    msg.includes('load failed') ||
    msg.includes('rsc');

  if (isNetworkFailure) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5 bg-background">
        <div className="w-full max-w-[460px] rounded-2xl border border-amber-500/30 bg-card p-8 text-center shadow-card">
          <div className="mb-5 flex justify-center">
            <SkillSharpLogo variant="full" />
          </div>
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <WifiOff className="size-6" aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-bold font-heading text-heading">
            You are currently offline
          </h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            This route hasn&apos;t been cached for offline use yet. Reconnect to the internet to load
            this page, or access your downloaded courses and materials.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button variant="primary" onClick={reset}>
              <RefreshCw className="size-3.5 mr-1.5" aria-hidden />
              Try again
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/student/offline">
                <Download className="size-3.5 mr-1.5" aria-hidden />
                Downloaded Content
              </Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/">Back to Dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5 bg-background">
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-7 text-center shadow-card">
        <div className="mb-5 flex justify-center">
          <SkillSharpLogo variant="full" />
        </div>
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-5" aria-hidden />
        </span>
        <h1 className="mt-4 text-[17px] font-semibold text-heading">Something went wrong</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          The page could not be displayed. You can try again — if it keeps happening, please
          contact your institution&apos;s administrator.
        </p>
        <div className="mt-5 flex justify-center gap-2.5">
          <Button variant="primary" onClick={reset}>
            <RefreshCw className="size-3.5 mr-1.5" aria-hidden />
            Try again
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
