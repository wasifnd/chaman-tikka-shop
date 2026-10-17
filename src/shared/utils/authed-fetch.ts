let refreshing: Promise<boolean> | null = null;

/**
 * Asks the server for a fresh login using the long-lived refresh cookie. Returns whether it worked.
 * If several requests fail at once they share one refresh, which matters because each refresh
 * replaces the refresh token: a second, simultaneous one would be treated as a stolen token.
 */
export function refreshSession(fetcher: typeof fetch = fetch): Promise<boolean> {
  refreshing ??= fetcher('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * fetch for signed-in screens. The login token lasts only 15 minutes, but a kitchen display may stay
 * open all night, so on a 401 this renews the session and tries once more before giving up.
 */
export async function fetchWithRefresh(
  input: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const options: RequestInit = { credentials: 'same-origin', ...init };
  const first = await fetcher(input, options);
  if (first.status !== 401) return first;
  if (!(await refreshSession(fetcher))) return first;
  return fetcher(input, options);
}
