import { describe, expect, it, vi } from 'vitest';
import { postJson } from './api';

const respond = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

describe('postJson', () => {
  it('sends JSON and unwraps the data envelope', async () => {
    const fetcher = respond({ success: true, data: { id: 1 } });
    const result = await postJson('/api/x', { a: 1 }, fetcher);
    expect(result).toEqual({ ok: true, data: { id: 1 } });
    const [, init] = fetcher.mock.calls[0] ?? [];
    expect(init).toMatchObject({ method: 'POST', body: '{"a":1}', credentials: 'same-origin' });
  });

  it('omits the body when none is given', async () => {
    const fetcher = respond({ success: true, data: null });
    await postJson('/api/x', undefined, fetcher);
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });

  it('returns the server error with field details', async () => {
    const fetcher = respond(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'bad', details: { email: 'x' } },
      },
      422,
    );
    expect(await postJson('/api/x', {}, fetcher)).toEqual({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'bad', details: { email: 'x' } },
    });
  });

  it('reports network failures and non-JSON responses', async () => {
    const down = vi.fn<typeof fetch>(() => Promise.reject(new Error('offline')));
    expect(await postJson('/api/x', {}, down)).toMatchObject({
      ok: false,
      error: { code: 'NETWORK_ERROR' },
    });
    const html = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('<html>', { status: 502 })),
    );
    expect(await postJson('/api/x', {}, html)).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR' },
    });
  });

  it('treats an error status without an error body as unknown', async () => {
    expect(await postJson('/api/x', {}, respond({ success: false }, 500))).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR' },
    });
  });
});
