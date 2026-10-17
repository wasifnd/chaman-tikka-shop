export const ROLES = ['CUSTOMER', 'STORE_STAFF', 'ADMIN', 'SUPER_ADMIN'] as const;
export type Role = (typeof ROLES)[number];

/** Who may change the menu, settings and team in the admin panel (and call its APIs). */
export const ADMIN_ROLES: readonly Role[] = ['ADMIN', 'SUPER_ADMIN'];
const STORE_ROLES: readonly Role[] = ['STORE_STAFF', ...ADMIN_ROLES];

/** Who may see and change orders in the store panel (and call its APIs). */
export const STAFF_ROLES: readonly Role[] = STORE_ROLES;

export const isStaffRole = (role: Role): boolean => STAFF_ROLES.includes(role);

/**
 * Roles allowed on a page path, or null when the path is public.
 * Only a coarse, optimistic check: real authorization is re-checked in handlers.
 */
export function requiredRoles(pathname: string): readonly Role[] | null {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return ADMIN_ROLES;
  if (pathname === '/store' || pathname.startsWith('/store/')) return STORE_ROLES;
  if (pathname === '/account' || pathname.startsWith('/account/')) return ROLES;
  return null;
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Only allow same-site relative redirects (blocks open redirects such as //evil.com). */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next?.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
