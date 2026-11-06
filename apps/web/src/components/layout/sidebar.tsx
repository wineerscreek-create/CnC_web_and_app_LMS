'use client';

import { ChevronLeft, ChevronRight, Lock, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { Avatar } from '@/components/ui/misc';
import { CNCLogo } from '@/components/ui/CNCLogo';
import { cn } from '@/lib/cn';
import { NAVIGATION, PORTAL_SUBTITLE } from '@/lib/nav';
import { ROLE_LABEL, type Role } from '@/lib/roleRoutes';
import type { SessionUser } from '@/store/authSlice';

export function Sidebar({
  user,
  open,
  onClose,
}: {
  user: SessionUser;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const role = user.role as Role;
  const groups = NAVIGATION[role] ?? [];

  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('cnc_sidebar_collapsed') === 'true';
      } catch {
        return false;
      }
    }
    return false;
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('cnc_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  return (
    <>
      {/* Mobile drawer backdrop */}
      <div
        onClick={onClose}
        aria-hidden
        className={cn(
          'fixed inset-0 z-30 bg-foreground/40 lg:hidden backdrop-blur-xs transition-opacity',
          open ? 'block opacity-100' : 'hidden opacity-0',
        )}
      />
      <aside
        role="navigation"
        aria-label="Portal navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col py-5 transition-all duration-300 ease-out lg:static lg:h-full lg:z-auto',
          collapsed ? 'w-[240px] lg:w-[76px] px-2' : 'w-[240px] px-3.5',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          'bg-card text-foreground border-r border-border shadow-xs',
        )}
      >
        {/* Brand header */}
        <div className="flex flex-col gap-2.5 px-2 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <Link
              href={user.home || '/'}
              className="flex items-center overflow-hidden"
              aria-label="SkillSharp home"
            >
              {collapsed ? (
                <CNCLogo variant="compact" priority />
              ) : (
                <CNCLogo variant="sidebar" priority />
              )}
            </Link>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="hidden lg:flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close navigation"
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted lg:hidden"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>

          {!collapsed && (
            <div className="flex flex-col animate-in fade-in duration-200">
              <span className="inline-flex w-fit items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground border border-border">
                {PORTAL_SUBTITLE[role] || 'Portal'}
              </span>
              {role === 'HOD' && user.departmentName && (
                <span className="mt-1 text-[11px] text-muted-foreground">
                  Data isolation active: {user.departmentName}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Scrollable nav groups */}
        <div className="flex-1 overflow-y-auto pr-1 py-4 scroll-thin">
          {groups.map((group, groupIdx) => (
            <div key={group.label ?? groupIdx} className={groupIdx > 0 ? 'mt-4' : ''}>
              {group.label && !collapsed && (
                <div className="px-2.5 pb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  {group.label}
                </div>
              )}
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const active =
                    item.href === user.home
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={`${group.label || 'nav'}-${item.label}-${item.href}`}>
                      {item.locked ? (
                        <div
                          title={collapsed ? item.label : undefined}
                          className="group relative flex flex-col gap-0.5 rounded-xl px-3 py-2 text-sm font-medium opacity-50 cursor-not-allowed text-muted-foreground"
                        >
                          <div className={cn('flex items-center gap-2.5', collapsed && 'justify-center')}>
                            <Icon className="size-4 shrink-0" aria-hidden />
                            {!collapsed && <span className="truncate">{item.label}</span>}
                            {!collapsed && <Lock className="ml-auto size-3" aria-hidden />}
                          </div>
                        </div>
                      ) : (
                        <Link
                          href={item.href}
                          onClick={onClose}
                          title={collapsed ? item.label : undefined}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'group relative flex items-center gap-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                            collapsed ? 'px-2 py-2 justify-center' : 'px-2.5 py-2',
                            active
                              ? 'bg-primary/10 text-primary font-semibold'
                              : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                          )}
                        >
                          <Icon
                            className={cn(
                              'size-4 shrink-0 transition-colors',
                              active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                            )}
                            aria-hidden
                          />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                          {active && (
                            <span
                              className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-1 rounded-r-full bg-primary"
                              aria-hidden="true"
                            />
                          )}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* User bar at bottom */}
        <div className="border-t border-border pt-3 mt-auto">
          <div
            className={cn(
              'flex items-center gap-2.5 rounded-xl border border-border bg-card p-2.5 transition-all duration-200 hover:border-accent/40',
              collapsed && 'justify-center p-2',
            )}
          >
            <Avatar name={user.name} size={collapsed ? 28 : 32} />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-foreground">
                  {user.name}
                </span>
                <span className="block truncate text-[10px] font-medium text-muted-foreground">
                  {ROLE_LABEL[role] ?? role}
                </span>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
