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
          <header className="shrink-0 z-20 flex items-center gap-3 border-b border-border bg-card/90 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-3.5">
            <button
              type="button"
              onClick={() => dispatch(toggleSidebar(true))}
              aria-label="Open navigation"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground transition-all hover:bg-muted active:scale-95 lg:hidden"
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
              className="relative hidden min-w-0 flex-1 sm:block sm:max-w-[400px]"
              onSubmit={(event) => event.preventDefault()}
            >
              <label htmlFor="global-search" className="sr-only">
                {searchPlaceholder}
              </label>
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="global-search"
                type="search"
                placeholder={searchPlaceholder}
                className="rounded-xl bg-card border-border text-foreground placeholder:text-muted-foreground pl-10 h-9.5 text-xs transition-all duration-200 focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </form>

            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
              {headerSlot}
              <ThemeToggle />
              <NotificationMenu />
              <Link
                href="/contact"
                aria-label="Help & Support"
                className="hidden size-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-95 sm:flex"
              >
                <HelpCircle className="size-4" aria-hidden />
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
