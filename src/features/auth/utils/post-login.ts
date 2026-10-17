import { isStaffRole, isRole } from '@/lib/auth/roles';

/**
 * Where to go after logging in. If the visitor was heading somewhere specific, go there. Otherwise
 * staff land on the order board and customers on the home page.
 */
export function postLoginPath(role: unknown, requested: string): string {
  if (requested !== '/') return requested;
  return isRole(role) && isStaffRole(role) ? '/store/orders' : '/';
}

/** The role from a successful login response, or undefined if it isn't there. */
export function readRole(data: unknown): string | undefined {
  const role = (data as { user?: { role?: unknown } } | null)?.user?.role;
  return typeof role === 'string' ? role : undefined;
}
