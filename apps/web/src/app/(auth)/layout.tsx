import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { CNCLogo } from '@/components/ui/CNCLogo';

/**
 * Unified auth layout — Ivory / Sage / Gold Theme
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] bg-background">
      <div className="flex flex-col justify-between px-6 py-8 sm:px-12 lg:px-16">
        <div>
          <Link
            href="/"
            className="inline-flex items-center transition-transform hover:opacity-90 active:scale-95"
            aria-label="SkillSharp home"
          >
            <CNCLogo priority />
          </Link>
        </div>

        <main id="main" className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[440px] rounded-3xl border border-border bg-card p-7 sm:p-9 shadow-card animate-enter">
            {children}
          </div>
        </main>

        <p className="text-xs text-muted-foreground text-center sm:text-left">
          By signing in you agree that your institutional records are managed in accordance with institutional policy.
        </p>
      </div>

      <aside className="relative hidden border-l border-border bg-foreground text-background lg:flex lg:flex-col lg:justify-center px-12 py-16">
        <div className="relative z-10 max-w-[420px]">
          <span className="inline-block rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent-foreground">
            Campus to Corporate
          </span>
          <h2 className="mt-5 font-heading text-3xl font-black leading-tight text-background">
            Build skills. Practice with confidence. Become career-ready.
          </h2>
          <p className="mt-3 text-sm text-background/70 leading-relaxed">
            The integrated employability platform bridging academic foundations and corporate expectations.
          </p>
          <ul className="mt-8 space-y-4 text-sm text-background/90">
            {[
              'Mock interviews and presentations with objective AI diagnostics',
              '7-Pillar Employability Index (EEDI) tracking your progress',
              'Deterministic curriculum recommendations targeted to close gaps',
              'Enterprise-grade multi-tenant data segregation per college',
            ].map((line) => (
              <li key={line} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
