'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { PortalShell } from '@/components/layout/portal-shell';
import { ForcePasswordChangeModal } from '@/components/auth/force-password-change-modal';
import { SkillSharpLogo } from '@/components/ui/SkillSharpLogo';
import { ROLE_HOME, type Role } from '@/lib/roleRoutes';
import { useAppSelector } from '@/store';

/**
 * Frontend route protection is a convenience, never a security control: every API call is
 * independently authenticated, role-checked and scope-checked by the backend. This guard only
 * keeps a signed-out or wrong-role visitor from staring at an empty shell.
 */
export function RouteGuard({
  allow,
  children,
}: {
  allow: Role | Role[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { status, user } = useAppSelector((state) => state.auth);
  const allowed = React.useMemo(() => (Array.isArray(allow) ? allow : [allow]), [allow]);

  React.useEffect(() => {
    if (status === 'anonymous') {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      router.replace(`/login?next=${next}`);
      return;
    }
    if (status === 'authenticated' && user && !allowed.includes(user.role as Role)) {
      // Send them to their own portal rather than a dead end.
      router.replace(ROLE_HOME[user.role as Role] ?? '/unauthorized');
    }
  }, [status, user, allowed, router]);

  if ((status === 'authenticated' || status === 'activation_required') && user && allowed.includes(user.role as Role)) {
    if (user.mustChangePassword || status === 'activation_required') {
      return <ForcePasswordChangeModal />;
    }
    return <>{children}</>;
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4"
      role="status"
      aria-label="Loading Winners Creek session"
    >
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <SkillSharpLogo variant="loading" priority />
      </div>
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
        <span>Loading Winners Creek…</span>
      </div>
    </div>
  );
}

/** Wraps a whole portal segment: guard + shell in one. */
export function PortalPage({
  allow,
  children,
  searchPlaceholder,
  headerSlot,
}: {
  allow: Role | Role[];
  children: React.ReactNode;
  searchPlaceholder?: string;
  headerSlot?: React.ReactNode;
}) {
  return (
    <RouteGuard allow={allow}>
      <PortalShell searchPlaceholder={searchPlaceholder} headerSlot={headerSlot}>
        {children}
      </PortalShell>
    </RouteGuard>
  );
}
