'use client';

import { HelpCircle, Menu, Search } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/misc';
import { CNCLogo } from '@/components/ui/CNCLogo';
import { cn } from '@/lib/cn';
import { useAppDispatch, useAppSelector } from '@/store';
import { toggleSidebar } from '@/store/uiSlice';

import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { NotificationMenu, ProfileMenu } from './menus';
import { Sidebar } from './sidebar';

/**
 * SkillSharp Portal Shell — Ivory / Sage / Gold Theme
 */
export function PortalShell({
  children,
  searchPlaceholder = 'Search courses, skills, resources…',
  headerSlot,
}: {
  children: React.ReactNode;
  searchPlaceholder?: string;
  headerSlot?: React.ReactNode;
}) {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const sidebarOpen = useAppSelector((state) => state.ui.sidebarOpen);

  if (!user) return null;

  return (
    <TooltipProvider>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <div className="flex h-screen max-h-screen w-full overflow-hidden bg-background">
        <Sidebar user={user} open={sidebarOpen} onClose={() => dispatch(toggleSidebar(false))} />

        <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
          <header className="shrink-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur-md sm:px-6">
            <button
              type="button"
              onClick={() => dispatch(toggleSidebar(true))}
              aria-label="Open navigation"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted lg:hidden"
            >
              <Menu className="size-4" aria-hidden />
            </button>

            {/* Mobile branding */}
            <div className="flex items-center lg:hidden">
              <Link href={user.home || '/'} className="flex items-center" aria-label="SkillSharp home">
                <CNCLogo variant="compact" />
              </Link>
            </div>

            <form
              role="search"
              className="relative hidden min-w-0 flex-1 sm:block sm:max-w-[360px]"
              onSubmit={(event) => event.preventDefault()}
            >
              <label htmlFor="global-search" className="sr-only">
                {searchPlaceholder}
              </label>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="global-search"
                type="search"
                placeholder={searchPlaceholder}
                className="rounded-lg bg-muted/40 border-border/80 text-foreground placeholder:text-muted-foreground/70 pl-9 pr-12 h-8.5 text-xs transition-colors focus:bg-card focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
                <kbd className="hidden sm:inline-flex select-none items-center rounded border border-border bg-muted/80 px-1.5 py-0.5 font-mono text-[9px] font-medium text-muted-foreground">
                  ⌘K
                </kbd>
              </div>
            </form>

            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
              {headerSlot}
              <ThemeToggle />
              <NotificationMenu />
              <Link
                href="/contact"
                aria-label="Help & Support"
                className="hidden size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
              >
                <HelpCircle className="size-3.5" aria-hidden />
              </Link>
              <ProfileMenu user={user} />
            </div>
          </header>

          <main
            id="main"
            className={cn(
              'flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 scroll-thin animate-enter',
            )}
          >
            <div className="mx-auto max-w-[1400px]">
              {children}
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
