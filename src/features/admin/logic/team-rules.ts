import type { Role } from '@/lib/auth/roles';

export interface Person {
  id: string;
  role: Role;
}

export type ManageDecision = 'ok' | 'self' | 'forbidden';

/**
 * Who may change whom. Admins manage store staff; only a super admin manages admins; nobody can
 * change a super admin or themselves here (so the team can never be locked out by a misclick).
 */
export function canManageMember(actor: Person, target: Person): ManageDecision {
  if (actor.id === target.id) return 'self';
  if (target.role === 'CUSTOMER' || target.role === 'SUPER_ADMIN') return 'forbidden';
  if (target.role === 'ADMIN') return actor.role === 'SUPER_ADMIN' ? 'ok' : 'forbidden';
  return actor.role === 'ADMIN' || actor.role === 'SUPER_ADMIN' ? 'ok' : 'forbidden';
}

/** Giving someone the admin role is itself an admin-level act, so only a super admin may. */
export function canAssignRole(actor: Person, role: 'STORE_STAFF' | 'ADMIN'): boolean {
  return role === 'STORE_STAFF' || actor.role === 'SUPER_ADMIN';
}
