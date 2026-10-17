import { describe, expect, it, vi } from 'vitest';
import { fetchSession } from './useSession';

const user = { userId: 'u1', email: 'a@b.pk', role: 'CUSTOMER' };
const json = (body: unknown, status = 200) => Response.json(body, { status });

function fetcherFor(...responses: Response[]) {
  const queue = [...responses];
  return vi.fn<typeof fetch>(() => Promise.resolve(queue.shift() ?? json({}, 500)));
}

describe('fetchSession', () => {
  it('returns the user when /me succeeds', async () => {
    const fetcher = fetcherFor(json({ success: true, data: { user } }));
    expect(await fetchSession(fetcher)).toEqual(user);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('silently refreshes after a 401 and returns the user', async () => {
    const fetcher = fetcherFor(json({}, 401), json({ success: true, data: { user } }));
    expect(await fetchSession(fetcher)).toEqual(user);
    expect(fetcher.mock.calls[1]?.[0]).toBe('/api/auth/refresh');
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('is signed out when the refresh is also rejected', async () => {
    expect(await fetchSession(fetcherFor(json({}, 401), json({}, 401)))).toBeNull();
  });

  it('surfaces unexpected server errors instead of pretending to be signed out', async () => {
    await expect(fetchSession(fetcherFor(json({}, 500)))).rejects.toThrow('check session');
    await expect(fetchSession(fetcherFor(json({}, 401), json({}, 500)))).rejects.toThrow(
      'refresh session',
    );
  });
});
