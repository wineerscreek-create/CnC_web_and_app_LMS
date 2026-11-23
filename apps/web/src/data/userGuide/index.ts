import type { Role } from '@/lib/roleRoutes';
import type { RoleManual } from './types';
import { studentGuide } from './studentGuide';
import { trainerGuide } from './trainerGuide';
import { hodGuide } from './hodGuide';
import { adminGuide } from './adminGuide';
import { superAdminGuide } from './superAdminGuide';

export * from './types';
export { studentGuide, trainerGuide, hodGuide, adminGuide, superAdminGuide };

export const ALL_ROLE_GUIDES: Partial<Record<Role, RoleManual>> = {
  STUDENT: studentGuide,
  TRAINER: trainerGuide,
  HOD: hodGuide,
  ADMIN: adminGuide,
  SUPER_ADMIN: superAdminGuide,
};

export function getUserGuide(role?: Role | string | null): RoleManual {
  if (!role) return studentGuide;
  const guide = ALL_ROLE_GUIDES[role as Role];
  if (!guide) {
    return studentGuide;
  }
  return guide;
}
