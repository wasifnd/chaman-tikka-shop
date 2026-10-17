'use client';

import { useQuery } from '@tanstack/react-query';
import type { SessionUser } from '@/lib/auth/access-token';

export const SESSION_QUERY_KEY = ['session'] as const;

async function readUser(response: Response): Promise<SessionUser> {
  const body = (await response.json()) as { data: { user: SessionUser } };
  return body.data.user;
}

/**
 * Who is signed in? A 401 usually just means the 15-minute access token expired, so we
 * try one silent refresh (the refresh cookie lasts days) before deciding they're signed out.
 */
export async function fetchSession(fetcher: typeof fetch = fetch): Promise<SessionUser | null> {
  const init = { credentials: 'same-origin' } as const;
  const me = await fetcher('/api/auth/me', init);
  if (me.ok) return readUser(me);
  if (me.status !== 401) throw new Error('Could not check session');

  const refreshed = await fetcher('/api/auth/refresh', { ...init, method: 'POST' });
  if (refreshed.ok) return readUser(refreshed);
  if (refreshed.status === 401) return null;
  throw new Error('Could not refresh session');
}

export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => fetchSession(),
    staleTime: 60_000,
    retry: false,
  });
}
