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

/**
 * Requests Next.js makes in the background: link preloads, and the page data it fetches during
 * in-app navigation. When the 15-minute login has expired these must not each start a session
 * renewal: several renewals racing with the same token look exactly like a stolen token being
 * replayed, which signs the person out everywhere. They get a plain 401 instead; preloads are
 * optional, and for in-app navigation Next.js falls back to a normal page load, which renews the
 * session once.
 */
export function isBackgroundFetch(headers: Headers): boolean {
  return headers.get('rsc') === '1' || headers.has('next-router-prefetch');
}
