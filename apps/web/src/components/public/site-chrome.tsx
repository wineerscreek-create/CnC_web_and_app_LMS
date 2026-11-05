'use client';

import { Menu, X } from 'lucide-react';
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
  const { status, user } = useAppSelector((state) => state.auth);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1240px] items-center gap-6 px-6 py-4">
        <Link href="/" aria-label="SkillSharp Home">
          <CNCLogo variant="header" priority />
        </Link>

        <nav aria-label="Main" className="ml-4 hidden items-center gap-1.5 lg:flex">
          {LINKS.map((link) => {
            const active =
              link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-150',
                  active
                    ? 'bg-accent text-accent-foreground font-semibold shadow-xs'
                    : 'text-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          {status === 'authenticated' && user ? (
            <Button asChild variant="primary" size="sm">
              <Link href={user.home || '/'}>Go to my portal</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex text-foreground hover:bg-muted">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild variant="primary" size="sm" className="shadow-xs">
                <Link href="/signup">Get Started</Link>
              </Button>
            </>
          )}
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

      {open && (
        <nav
          aria-label="Mobile Navigation"
          className="border-t border-border bg-card/95 px-6 py-4 space-y-1 backdrop-blur-xl lg:hidden animate-enter"
        >
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3.5 py-2.5 text-sm font-medium text-foreground hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-3 mt-3 border-t border-border flex flex-col gap-2">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3.5 py-2 text-center text-sm font-semibold border border-border text-foreground bg-card hover:bg-muted"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3.5 py-2 text-center text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Get Started
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border bg-card text-muted-foreground">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <CNCLogo variant="footer" />
          <p className="mt-4 max-w-[260px] text-xs leading-relaxed text-muted-foreground">
            SkillSharp helps students transition from academic study to corporate excellence through measured soft-skills training and intelligent career readiness.
          </p>
        </div>
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-heading">Platform</h2>
          <ul className="mt-4 space-y-2.5 text-xs text-muted-foreground">
            <li><Link href="/courses" className="hover:text-foreground transition-colors">Programs &amp; Curriculum</Link></li>
            <li><Link href="/trainers" className="hover:text-foreground transition-colors">Certified Trainers</Link></li>
            <li><Link href="/announcements" className="hover:text-foreground transition-colors">Announcements</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-heading">Access</h2>
          <ul className="mt-4 space-y-2.5 text-xs text-muted-foreground">
            <li><Link href="/login" className="hover:text-foreground transition-colors">Sign in</Link></li>
            <li><Link href="/signup" className="hover:text-foreground transition-colors">Create account</Link></li>
            <li><Link href="/forgot-password" className="hover:text-foreground transition-colors">Reset password</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-heading">About SkillSharp</h2>
          <ul className="mt-4 space-y-2.5 text-xs text-muted-foreground">
            <li><Link href="/about" className="hover:text-foreground transition-colors">About SkillSharp</Link></li>
            <li><Link href="/contact" className="hover:text-foreground transition-colors">Contact &amp; Support</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border px-6 py-6">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} SkillSharp. All rights reserved.</p>
          <p>Learn · Practise · Improve · Become Employable</p>
        </div>
      </div>
    </footer>
  );
}

export function PublicPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#main" className="skip-link">Skip to main content</a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  );
}
