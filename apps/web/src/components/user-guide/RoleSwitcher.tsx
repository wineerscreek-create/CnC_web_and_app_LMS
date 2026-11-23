'use client';

import * as React from 'react';
import { Eye, Shield } from 'lucide-react';
import type { Role } from '@/lib/roleRoutes';
import { cn } from '@/lib/cn';

interface RoleSwitcherProps {
  currentRole: Role;
  selectedRole: Role;
  onRoleChange: (role: Role) => void;
}

const ROLES: { id: Role; label: string }[] = [
  { id: 'STUDENT', label: 'Student' },
  { id: 'TRAINER', label: 'Trainer' },
  { id: 'HOD', label: 'HOD' },
  { id: 'ADMIN', label: 'Admin' },
  { id: 'SUPER_ADMIN', label: 'Super Admin' },
];

export function RoleSwitcher({ currentRole, selectedRole, onRoleChange }: RoleSwitcherProps) {
  // Allow switching if user is ADMIN or SUPER_ADMIN
  const canSwitch = currentRole === 'ADMIN' || currentRole === 'SUPER_ADMIN';

  if (!canSwitch) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-1.5 shadow-2xs">
      <div className="flex items-center gap-1 px-2 text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
        <Eye className="size-3 text-primary" />
        <span>Preview Role:</span>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto scroll-none">
        {ROLES.map((r) => {
          const isSelected = selectedRole === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onRoleChange(r.id)}
              className={cn(
                'rounded-lg px-2.5 py-1 text-2xs font-bold transition-all active:scale-95 whitespace-nowrap',
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
