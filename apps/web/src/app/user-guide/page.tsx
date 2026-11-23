'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  HelpCircle,
  Home,
  Info,
  Lightbulb,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

import { PortalPage } from '@/components/auth/route-guard';
import { useAppSelector } from '@/store';
import { ROLE_HOME, type Role } from '@/lib/roleRoutes';
import { getUserGuide } from '@/data/userGuide';
import { GuideIcon } from '@/components/user-guide/GuideIcon';
import { HorizontalModuleNav } from '@/components/user-guide/HorizontalModuleNav';
import { GuideAccordion } from '@/components/user-guide/GuideAccordion';
import { ManualSearchBar } from '@/components/user-guide/ManualSearchBar';
import { ManualProgress } from '@/components/user-guide/ManualProgress';
import { RoleSwitcher } from '@/components/user-guide/RoleSwitcher';

const ALLOWED_ROLES: Role[] = ['STUDENT', 'TRAINER', 'HOD', 'ADMIN', 'SUPER_ADMIN'];

function UserGuideContent() {
  const user = useAppSelector((state) => state.auth.user);
  const actualRole = (user?.role as Role) || 'STUDENT';

  // Selected role for previewing (defaults to logged-in user's role)
  const [selectedRole, setSelectedRole] = React.useState<Role>(actualRole);

  // Sync if actual role loads asynchronously
  React.useEffect(() => {
    if (user?.role && ALLOWED_ROLES.includes(user.role as Role)) {
      setSelectedRole(user.role as Role);
    }
  }, [user?.role]);

  // Load manual data for current selected role
  const manual = React.useMemo(() => getUserGuide(selectedRole), [selectedRole]);
  const modules = manual.modules;

  // Active module ID
  const [activeModuleId, setActiveModuleId] = React.useState<string>(() => modules[0]?.id ?? '');

  // Reset active module when role changes
  React.useEffect(() => {
    if (modules.length > 0 && !modules.some((m) => m.id === activeModuleId)) {
      setActiveModuleId(modules[0].id);
    }
  }, [modules, activeModuleId]);

  // Read / completed modules tracking with localStorage persistence
  const storageKey = `skillsharp_guide_read_${selectedRole}`;
  const [readModuleIds, setReadModuleIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setReadModuleIds(new Set(JSON.parse(stored)));
      } else {
        setReadModuleIds(new Set());
      }
    } catch {
      setReadModuleIds(new Set());
    }
  }, [storageKey]);

  const saveReadModuleIds = (newSet: Set<string>) => {
    setReadModuleIds(newSet);
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(newSet)));
    } catch {
      // Ignore localStorage write errors
    }
  };

  const toggleCurrentModuleRead = () => {
    if (!activeModuleId) return;
    const next = new Set(readModuleIds);
    if (next.has(activeModuleId)) {
      next.delete(activeModuleId);
    } else {
      next.add(activeModuleId);
    }
    saveReadModuleIds(next);
  };

  const resetProgress = () => {
    saveReadModuleIds(new Set());
  };

  // Find active module object
  const activeModule = modules.find((m) => m.id === activeModuleId) ?? modules[0];
  const activeModuleIndex = modules.findIndex((m) => m.id === activeModuleId);

  // Prev / Next module navigation
  const prevModule = activeModuleIndex > 0 ? modules[activeModuleIndex - 1] : null;
  const nextModule = activeModuleIndex < modules.length - 1 ? modules[activeModuleIndex + 1] : null;

  // Jump from search result or related feature click
  const handleSelectSearchResult = (moduleId: string, faqId?: string) => {
    setActiveModuleId(moduleId);
  };

  const handleNavigateToFeature = (featureTitle: string) => {
    const target = modules.find(
      (m) =>
        m.title.toLowerCase().includes(featureTitle.toLowerCase()) ||
        featureTitle.toLowerCase().includes(m.title.toLowerCase())
    );
    if (target) {
      setActiveModuleId(target.id);
    }
  };

  const homeRoute = ROLE_HOME[actualRole] ?? '/student/dashboard';

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-16">
      {/* Top Banner & Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-linear-to-r from-card via-card to-primary/5 p-5 shadow-xs sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Link
                href={homeRoute}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="size-3.5" />
                <span>Back to Dashboard</span>
              </Link>
              <span className="text-muted-foreground/40">•</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-2xs font-bold text-primary uppercase tracking-wider">
                <BookOpen className="size-3" />
                {manual.roleLabel} Manual
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
              {manual.portalTitle}
            </h1>
            <p className="max-w-2xl text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {manual.description}
            </p>
          </div>

          {/* Search bar & Role Preview Switcher */}
          <div className="flex flex-col items-start md:items-end gap-2.5 w-full md:w-auto">
            <RoleSwitcher
              currentRole={actualRole}
              selectedRole={selectedRole}
              onRoleChange={(r) => setSelectedRole(r)}
            />
            <ManualSearchBar
              modules={modules}
              onSelectResult={handleSelectSearchResult}
            />
          </div>
        </div>

        {/* Reading Progress */}
        <div className="mt-5 pt-4 border-t border-border/60">
          <ManualProgress
            totalModules={modules.length}
            completedCount={readModuleIds.size}
            isCurrentModuleRead={readModuleIds.has(activeModuleId)}
            onToggleCurrentModuleRead={toggleCurrentModuleRead}
            onResetProgress={resetProgress}
          />
        </div>
      </div>

      {/* Horizontal Module Navigation (Strict 1:1 Page Mapping) */}
      <section aria-label="Page Modules Navigation">
        <HorizontalModuleNav
          modules={modules}
          activeModuleId={activeModuleId}
          readModuleIds={readModuleIds}
          onSelectModule={(id) => setActiveModuleId(id)}
        />
      </section>

      {/* Active Module Detailed Workspace */}
      {activeModule && (
        <div className="space-y-6">
          {/* Module Banner */}
          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs">
                  <GuideIcon name={activeModule.iconName} className="size-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-2xs font-mono font-bold bg-muted px-2 py-0.5 rounded text-muted-foreground">
                      Module {String(activeModuleIndex + 1).padStart(2, '0')} of{' '}
                      {String(modules.length).padStart(2, '0')}
                    </span>
                    <h2 className="text-lg sm:text-xl font-bold text-foreground">
                      {activeModule.title}
                    </h2>
                  </div>
                  <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-3xl">
                    {activeModule.description}
                  </p>
                </div>
              </div>

              {/* Direct Jump to Actual LMS Page */}
              <Link
                href={activeModule.pageRoute}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted hover:border-primary/40 shadow-xs transition-all active:scale-95 shrink-0"
              >
                <span>Open {activeModule.title} Page</span>
                <ExternalLink className="size-3.5 text-muted-foreground" />
              </Link>
            </div>

            {/* Quick Tips Box */}
            {activeModule.quickTips && activeModule.quickTips.length > 0 && (
              <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary mb-2">
                  <Lightbulb className="size-3.5" />
                  <span>Instructor Tips &amp; Best Practices</span>
                </div>
                <ul className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {activeModule.quickTips.map((tip, tIdx) => (
                    <li
                      key={tIdx}
                      className="flex items-start gap-2 text-2xs text-foreground/90 leading-relaxed bg-background/60 rounded-lg p-2 border border-border/40"
                    >
                      <span className="text-primary font-bold">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Submodules / Feature Accordions */}
          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs sm:p-6">
            <GuideAccordion
              faqs={activeModule.faqs}
              onNavigateToModule={handleNavigateToFeature}
            />
          </div>

          {/* Bottom Module Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            {prevModule ? (
              <button
                type="button"
                onClick={() => setActiveModuleId(prevModule.id)}
                className="flex w-full sm:w-auto items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-muted transition-all active:scale-95 shadow-xs text-left"
              >
                <ChevronLeft className="size-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <span className="block text-2xs text-muted-foreground">Previous Module</span>
                  <span className="block truncate font-bold text-foreground">
                    {prevModule.title}
                  </span>
                </div>
              </button>
            ) : (
              <div />
            )}

            <Link
              href={homeRoute}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-muted/40 px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Home className="size-3.5" />
              <span>Return to Dashboard</span>
            </Link>

            {nextModule ? (
              <button
                type="button"
                onClick={() => setActiveModuleId(nextModule.id)}
                className="flex w-full sm:w-auto items-center justify-end gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-all active:scale-95 shadow-xs text-right"
              >
                <div className="min-w-0">
                  <span className="block text-2xs text-muted-foreground">Next Module</span>
                  <span className="block truncate font-bold text-primary">
                    {nextModule.title}
                  </span>
                </div>
                <ChevronRight className="size-4 text-primary shrink-0" />
              </button>
            ) : (
              <div />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function UserGuidePage() {
  return (
    <PortalPage allow={ALLOWED_ROLES} searchPlaceholder="Search LMS manual...">
      <UserGuideContent />
    </PortalPage>
  );
}
