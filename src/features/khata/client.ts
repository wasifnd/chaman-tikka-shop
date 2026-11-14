import { fetchWithRefresh } from '@/shared/utils/authed-fetch';
import type { ApiError, ApiResult } from '@/shared/utils/api';

const NETWORK_ERROR: ApiError = {
  code: 'NETWORK_ERROR',
  message: 'Could not reach the server. Check your connection and try again.',
};

/**
 * Calls a staff API and unwraps the { success, data | error } envelope. A till stays open all
 * shift, so an expired login is renewed once before giving up.
 */
export async function staffApi(
  url: string,
  init: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown } = {},
  fetcher: typeof fetch = fetch,
): Promise<ApiResult> {
  let response: Response;
  try {
    response = await fetchWithRefresh(
      url,
      {
        method: init.method ?? 'GET',
        cache: 'no-store',
        ...(init.body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) }),
      },
      fetcher,
    );
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
  let payload: { success?: boolean; data?: unknown; error?: ApiError };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    };
  }
  if (response.ok && payload.success) return { ok: true, data: payload.data };
  return {
    ok: false,
    error: payload.error ?? { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
  };
}
