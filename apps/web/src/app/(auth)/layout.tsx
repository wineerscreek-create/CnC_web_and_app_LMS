import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { GradientOrb } from '@/components/ui/motion-elements';
import { WinnersCreekLogo } from '@/components/ui/WinnersCreekLogo';

/**
 * Unified auth layout: floating frosted-glass surfaces over the continuous tech-orbit background.
 * One consistent layout for login, signup, verification and reset flow.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh box-border grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:h-dvh lg:overflow-hidden">
      <div className="flex flex-col justify-between box-border px-6 py-4 sm:px-10 lg:px-12 lg:py-5 h-full overflow-y-auto">
        <div className="shrink-0 mb-2 sm:mb-3">
          <Link
            href="/"
            className="inline-flex items-center transition-transform hover:opacity-90 active:scale-95"
            aria-label="Winners Creek home"
          >
            <WinnersCreekLogo variant="auth" priority />
          </Link>
        </div>

        <main id="main" className="flex flex-1 items-center justify-center py-2 sm:py-4">
          <div className="w-full max-w-[440px] rounded-2xl border border-line bg-card p-6 sm:p-7 shadow-card animate-enter my-auto">
            {children}
          </div>
        </main>

        <p className="text-xs text-ink-3 shrink-0 pt-2">
          By continuing you agree that your institution administers this account.
        </p>
      </div>

      <aside className="relative hidden lg:flex lg:flex-col lg:justify-center border-l border-slate-200 text-slate-900 dark:border-white/10 dark:text-white px-10 xl:px-14 py-12 lg:sticky lg:top-0 lg:h-dvh lg:overflow-hidden shrink-0">
        <GradientOrb color="indigo" size={450} className="-left-20 top-10 opacity-30" />
        <GradientOrb color="amber" size={320} className="-bottom-16 right-0 opacity-20" />
        <div className="relative z-10 max-w-[420px]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">
            Practise · Assess · Improve
          </p>
          <h2 className="mt-4 font-serif heading-section font-semibold leading-tight text-slate-900 dark:text-white">
            Learn, Practise and Build the Skills Required for Your Career.
          </h2>
          <ul className="mt-8 space-y-3.5 text-sm sm:text-base text-slate-700 dark:text-slate-100">
            {[
              'Mock interviews and GDs with evidence-backed AI feedback',
              '95+ trainer-rated parameters across seven pillars',
              'A readiness score that shows what to fix next',
              'Your data stays inside your college and department',
            ].map((line) => (
              <li key={line} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
