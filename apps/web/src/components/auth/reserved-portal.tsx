'use client';

import { ArrowRight, Construction, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { RouteGuard } from '@/components/auth/route-guard';
import { PortalShell } from '@/components/layout/portal-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import type { Role } from '@/lib/roleRoutes';
import { useAppSelector } from '@/store';

/**
 * Reserved-role portals (§3).
 *
 * These roles exist in the auth model now — the route is protected, the backend enforces the
 * role, and the session is scoped — but their feature set lands in a later phase. The page is
 * deliberately explicit about that rather than showing a fake dashboard.
 */
export function ReservedPortal({
  role,
  title,
  purpose,
  planned,
  dataAccess,
}: {
  role: Role;
  title: string;
  purpose: string;
  planned: string[];
  dataAccess: string[];
}) {
  const user = useAppSelector((state) => state.auth.user);

  return (
    <RouteGuard allow={role}>
      <PortalShell>
        <div className="mx-auto max-w-[760px] animate-enter space-y-6">
          <header className="pb-2 border-b border-border">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="mustard" className="font-semibold text-xs py-0.5 px-2.5">
                <Construction className="size-3 mr-1" aria-hidden />
                Phase 2 Portal
              </Badge>
              <Badge tone="charcoal" className="font-semibold text-xs py-0.5 px-2.5">
                <ShieldCheck className="size-3 mr-1" aria-hidden />
                Role Protected &amp; Scoped
              </Badge>
            </div>
            <h1 className="mt-3 text-2xl font-black font-heading tracking-tight text-heading">
              {title}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Authenticated as <span className="font-bold text-foreground">{user?.name}</span> ({user?.roleLabel}).
            </p>
          </header>

          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="pb-3 border-b border-border">
              <div>
                <CardTitle className="text-base font-bold font-heading text-heading">Portal Architectural Scope</CardTitle>
                <CardSubtitle className="text-xs text-muted-foreground">Formal capability placement within the SkillSharp ecosystem</CardSubtitle>
              </div>
            </CardHeader>
            <CardBody className="pt-4 space-y-5">
              <p className="text-sm leading-relaxed text-muted-foreground">{purpose}</p>

              <div>
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Planned Platform Modules
                </h2>
                <ul className="mt-2.5 space-y-1.5">
                  {planned.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 rounded-xl p-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Scoped Data Visibility
                </h2>
                <ul className="mt-2.5 space-y-1.5">
                  {dataAccess.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 rounded-xl p-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl bg-muted border border-border p-4 text-xs leading-relaxed text-muted-foreground">
                Data access strictly mirrors server authorization boundaries. Scoping parameters, session state, and audit trails remain actively enforced by the backend API.
              </div>

              <div className="pt-2">
                <Button asChild variant="secondary" size="sm" className="text-xs">
                  <Link href="/contact">Inquire About Extended Role Access</Link>
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </PortalShell>
    </RouteGuard>
  );
}
