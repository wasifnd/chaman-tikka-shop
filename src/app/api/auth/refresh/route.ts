import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { getAuthService, getCookieConfig } from '@/features/auth/server';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from '@/lib/auth/cookies';
import { AppError } from '@/lib/errors';
import { assertSameOrigin } from '@/lib/http/guards';
import { ok, redirectToPath, route } from '@/lib/http/response';
import { safeNextPath } from '@/lib/auth/roles';

/** API clients: rotate the refresh token and return the user as JSON. */
export const POST = route(async (request: Request) => {
  assertSameOrigin(request);
  const store = await cookies();
  const token = store.get(REFRESH_COOKIE)?.value;
  if (!token) throw new AppError('INVALID_REFRESH_TOKEN', 'Please sign in again.', 401);

  try {
    const session = await getAuthService().refresh(token);
    setAuthCookies(store, session, getCookieConfig());
    return ok({ user: session.user });
  } catch (error) {
    clearAuthCookies(store, getCookieConfig());
    throw error;
  }
});

/**
 * Browser navigations: proxy.ts sends users here when their access token has expired.
 * Rotates the session and bounces back to the page, or to login if it can't.
 */
export async function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get('next'));
  const store = await cookies();
  const token = store.get(REFRESH_COOKIE)?.value;

  // Relative redirects keep the browser on the address it used (see redirectToPath).
  if (token) {
    try {
      const session = await getAuthService().refresh(token);
      setAuthCookies(store, session, getCookieConfig());
      return redirectToPath(next);
    } catch {
      clearAuthCookies(store, getCookieConfig());
    }
  }
  return redirectToPath(`/auth/login?${new URLSearchParams({ next }).toString()}`);
}
