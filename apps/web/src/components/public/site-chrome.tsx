'use client';

import { Menu, X, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { CNCLogo } from '@/components/ui/CNCLogo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { cn } from '@/lib/cn';
import { useAppSelector } from '@/store';

const LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Programs', href: '/courses' },
  { label: 'Trainers', href: '/trainers' },
  { label: 'Announcements', href: '/announcements' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const { status, user } = useAppSelector((state) => state.auth);

  React.useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 24);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile drawer on Escape
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [open]);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-all duration-300',
        scrolled
          ? 'py-2 px-4 sm:px-6'
          : 'py-3 sm:py-4 px-6 border-b border-border/60 bg-card/80 backdrop-blur-md'
      )}
    >
      <div
        className={cn(
          'mx-auto flex items-center justify-between transition-all duration-300',
          scrolled
            ? 'max-w-[1240px] rounded-2xl border border-border/80 bg-card/92 px-5 py-2.5 shadow-card-hover backdrop-blur-xl'
            : 'max-w-[1240px]'
        )}
      >
        <Link href="/" aria-label="Winners Creek / SkillSharp Home" className="shrink-0">
          <CNCLogo variant="header" priority />
        </Link>

        {/* Desktop 3D Navigation Links */}
        <nav aria-label="Main Navigation" className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => {
            const active =
              link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative rounded-xl px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-all duration-200 select-none',
                  active
                    ? 'bg-accent text-accent-foreground shadow-xs border border-accent/40 font-bold scale-[1.02]'
                    : 'text-foreground/80 hover:bg-muted hover:text-foreground hover:scale-[1.02]'
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right CTA Actions */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <ThemeToggle />

          {status === 'authenticated' && user ? (
            <Button
              asChild
              variant="primary"
              size="sm"
              className="rounded-xl shadow-xs font-bold text-xs"
            >
              <Link href={user.home || '/'}>
                Go to Portal
                <ArrowRight className="size-3.5 ml-1" />
              </Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex text-xs font-semibold text-foreground hover:bg-muted rounded-xl"
              >
                <Link href="/login">Sign In</Link>
              </Button>
              <Button
                asChild
                variant="primary"
                size="sm"
                className="rounded-xl shadow-xs text-xs font-bold"
              >
                <Link href="/signup">Get Started</Link>
              </Button>
            </>
          )}

          {/* Mobile Menu Button */}
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="flex size-9 items-center justify-center rounded-xl border border-border bg-card text-foreground transition-all hover:bg-muted active:scale-95 lg:hidden"
          >
            {open ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
          </button>
        </div>
      </div>

      {/* Mobile Glass Navigation Drawer */}
      {open && (
        <div className="fixed inset-x-0 top-[65px] z-50 p-4 lg:hidden">
          <nav
            aria-label="Mobile Navigation"
            className="mx-auto max-w-md rounded-3xl border border-border bg-card/95 p-5 shadow-2xl backdrop-blur-2xl animate-enter space-y-1.5"
          >
            {LINKS.map((link) => {
              const active =
                link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'block rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground font-bold'
                      : 'text-foreground hover:bg-muted'
                  )}
                >
                  {link.label}
                </Link>
              );
            })}

            <div className="pt-3 mt-3 border-t border-border flex flex-col gap-2">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="block rounded-xl px-4 py-2.5 text-center text-sm font-semibold border border-border text-foreground bg-card hover:bg-muted"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                onClick={() => setOpen(false)}
                className="block rounded-xl px-4 py-2.5 text-center text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              >
                Get Started
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

export { SiteFooter } from './SiteFooter';
import { SiteFooter } from './SiteFooter';
import { PublicSiteBackground } from '@/components/3d';

export function PublicPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background text-foreground flex flex-col selection:bg-accent/20 selection:text-foreground overflow-x-hidden">
      <PublicSiteBackground />
      <a href="#main" className="skip-link sr-only focus:not-sr-only focus:p-4 focus:bg-card focus:fixed focus:z-50">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main" className="relative z-10 flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
