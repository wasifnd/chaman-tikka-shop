import { cookies } from 'next/headers';
import { AppError } from '@/lib/errors';
import { env } from '@/lib/env';
import { verifyAccessToken, type SessionUser } from './access-token';
import { ACCESS_COOKIE } from './cookies';
import type { Role } from './roles';

/** The signed-in user for this request, or null. Safe to call from server components. */
export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  return verifyAccessToken(token, env().JWT_ACCESS_SECRET);
}

/** Authorization for route handlers: 401 when signed out, 403 when the role isn't allowed. */
export async function requireSession(roles?: readonly Role[]): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AppError('UNAUTHENTICATED', 'Please sign in to continue.', 401);
  if (roles && !roles.includes(session.role)) {
    throw new AppError('FORBIDDEN', 'You do not have access to this resource.', 403);
  }
  return session;
}
