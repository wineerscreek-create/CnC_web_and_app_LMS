'use client';

import { Lock, X } from 'lucide-react';
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
          'fixed inset-y-0 left-0 z-40 flex w-[240px] shrink-0 flex-col px-3.5 py-5',
          'transition-transform duration-300 ease-out lg:static lg:translate-x-0 lg:h-full lg:z-auto',
          open ? 'translate-x-0' : '-translate-x-full',
          'bg-card text-foreground border-r border-border shadow-xs',
        )}
      >
        {/* Brand header */}
        <div className="flex flex-col gap-2.5 px-2 pb-5 border-b border-border">
          <div className="flex items-center justify-between">
            <Link href={user.home || '/'} className="flex items-center" aria-label="SkillSharp home">
              <CNCLogo variant="sidebar" priority />
            </Link>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted lg:hidden"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="flex flex-col">
            <span className="inline-flex w-fit items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground border border-border">
              {PORTAL_SUBTITLE[role] || 'Portal'}
            </span>
            {role === 'HOD' && user.departmentName && (
              <span className="mt-1 text-[11px] text-muted-foreground">
                {user.departmentName}
              </span>
            )}
          </div>
        </div>

        {/* Scrollable nav groups */}
        <div className="flex-1 overflow-y-auto pr-1 py-4 scroll-thin">
          {groups.map((group, groupIdx) => (
            <div key={group.label ?? groupIdx} className={groupIdx > 0 ? 'mt-5' : ''}>
              {group.label && (
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
                        <div className="group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium opacity-50 cursor-not-allowed text-muted-foreground">
                          <Icon className="size-4 shrink-0" aria-hidden />
                          <span className="truncate">{item.label}</span>
                          <Lock className="ml-auto size-3" aria-hidden />
                        </div>
                      ) : (
                        <Link
                          href={item.href}
                          onClick={onClose}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                            active
                              ? 'bg-accent text-accent-foreground font-semibold shadow-xs'
                              : 'text-foreground hover:bg-muted hover:text-foreground',
                          )}
                        >
                          <Icon
                            className={cn(
                              'size-4 shrink-0 transition-transform duration-200 group-hover:scale-105',
                              active
                                ? 'text-accent-foreground'
                                : 'text-muted-foreground group-hover:text-foreground',
                            )}
                            aria-hidden
                          />
                          <span className="truncate">{item.label}</span>
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
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-2.5 transition-all duration-200 hover:border-accent/40">
            <Avatar name={user.name} size={32} />
            <div className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-foreground">
                {user.name}
              </span>
              <span className="block truncate text-[10px] font-medium text-muted-foreground">
                {ROLE_LABEL[role] ?? role}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
