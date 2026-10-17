export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string>;
}

export type ApiResult = { ok: true; data: unknown } | { ok: false; error: ApiError };

const NETWORK_ERROR: ApiError = {
  code: 'NETWORK_ERROR',
  message: 'Could not reach the server. Check your connection and try again.',
};
const UNKNOWN_ERROR: ApiError = {
  code: 'INTERNAL_ERROR',
  message: 'Something went wrong. Please try again.',
};

/** Sends JSON to our own API and unwraps the { success, data | error } envelope. */
export async function requestJson(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
  fetcher: typeof fetch = fetch,
): Promise<ApiResult> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }

  let payload: { success?: boolean; data?: unknown; error?: ApiError };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    return { ok: false, error: UNKNOWN_ERROR };
  }
  if (response.ok && payload.success) return { ok: true, data: payload.data };
  return { ok: false, error: payload.error ?? UNKNOWN_ERROR };
}

/** POSTs JSON to our own API and unwraps the response envelope. */
export function postJson(
  url: string,
  body?: unknown,
  fetcher: typeof fetch = fetch,
): Promise<ApiResult> {
  return requestJson('POST', url, body, fetcher);
}
