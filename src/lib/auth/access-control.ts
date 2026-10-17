import type { SessionUser } from './access-token';
import { requiredRoles } from './roles';

export type AccessDecision =
  | { action: 'allow' }
  | { action: 'refresh' } // no valid access token: try the refresh flow, then login
  | { action: 'forbidden' }; // signed in, but the role isn't allowed here

/** Pure routing decision used by proxy.ts, kept separate so it is unit-testable. */
export function decideAccess(pathname: string, session: SessionUser | null): AccessDecision {
  const roles = requiredRoles(pathname);
  if (!roles) return { action: 'allow' };
  if (!session) return { action: 'refresh' };
  return roles.includes(session.role) ? { action: 'allow' } : { action: 'forbidden' };
}
