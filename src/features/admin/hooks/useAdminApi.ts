'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { fetchWithRefresh } from '@/shared/utils/authed-fetch';
import { requestJson, type ApiResult } from '@/shared/utils/api';

type Method = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

// A long admin session outlives the 15-minute login, so renew it quietly instead of failing a save.
const authedFetch: typeof fetch = (input, init) =>
  fetchWithRefresh(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    init,
  );

/**
 * Sends a change to the admin API. On success the page's server data is refreshed so every
 * list shows the new state without a manual reload.
 */
export function useAdminApi() {
  const router = useRouter();
  return useCallback(
    async (method: Method, url: string, body?: unknown): Promise<ApiResult> => {
      const result = await requestJson(method, url, body, authedFetch);
      if (result.ok) router.refresh();
      return result;
    },
    [router],
  );
}
