import { describe, expect, it, vi } from 'vitest';
import { fetchWithRefresh, refreshSession } from './authed-fetch';

const status = (code: number) => new Response('{}', { status: code });

function fetcherFor(responses: Record<string, Response[]>) {
  return vi.fn<typeof fetch>((input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const queue = responses[url];
    return Promise.resolve(queue?.shift() ?? status(500));
  });
}

describe('fetchWithRefresh', () => {
  it('returns the response untouched when the request succeeds', async () => {
    const fetcher = fetcherFor({ '/api/x': [status(200)] });
    expect((await fetchWithRefresh('/api/x', {}, fetcher)).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('sends cookies', async () => {
    const fetcher = fetcherFor({ '/api/x': [status(200)] });
    await fetchWithRefresh('/api/x', { method: 'PATCH' }, fetcher);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'same-origin',
      method: 'PATCH',
    });
  });

  it('does not refresh for errors other than 401', async () => {
    const fetcher = fetcherFor({ '/api/x': [status(403)] });
    expect((await fetchWithRefresh('/api/x', {}, fetcher)).status).toBe(403);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('renews the session on a 401 and retries once', async () => {
    const fetcher = fetcherFor({
      '/api/x': [status(401), status(200)],
      '/api/auth/refresh': [status(200)],
    });
    const response = await fetchWithRefresh('/api/x', {}, fetcher);
    expect(response.status).toBe(200);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/x',
      '/api/auth/refresh',
      '/api/x',
    ]);
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('gives back the 401 if the session cannot be renewed, without retrying', async () => {
    const fetcher = fetcherFor({ '/api/x': [status(401)], '/api/auth/refresh': [status(401)] });
    expect((await fetchWithRefresh('/api/x', {}, fetcher)).status).toBe(401);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('retries only once, even if the retry is also refused', async () => {
    const fetcher = fetcherFor({
      '/api/x': [status(401), status(401)],
      '/api/auth/refresh': [status(200)],
    });
    expect((await fetchWithRefresh('/api/x', {}, fetcher)).status).toBe(401);
    expect(fetcher.mock.calls.filter(([url]) => url === '/api/x')).toHaveLength(2);
  });
});

describe('refreshSession', () => {
  it('shares one refresh between simultaneous callers', async () => {
    let resolve: (response: Response) => void = () => undefined;
    const fetcher = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    const calls = [refreshSession(fetcher), refreshSession(fetcher), refreshSession(fetcher)];
    resolve(status(200));
    expect(await Promise.all(calls)).toEqual([true, true, true]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('can run again after the previous one finished', async () => {
    const fetcher = fetcherFor({ '/api/auth/refresh': [status(200), status(401)] });
    expect(await refreshSession(fetcher)).toBe(true);
    expect(await refreshSession(fetcher)).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('treats a network failure as not renewed', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.reject(new Error('offline')));
    expect(await refreshSession(fetcher)).toBe(false);
    // and is usable again afterwards
    expect(await refreshSession(fetcherFor({ '/api/auth/refresh': [status(200)] }))).toBe(true);
  });
});
