import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { fail, ok, parseBody, route, toErrorResponse } from './response';

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

describe('response helpers', () => {
  it('wraps success data in the envelope', async () => {
    expect(await json(ok({ a: 1 }))).toEqual({ success: true, data: { a: 1 } });
  });

  it('builds error envelopes with optional details and headers', async () => {
    const res = fail('X', 'bad', 429, { f: 'm' }, { 'Retry-After': '5' });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('5');
    expect(await json(res)).toEqual({
      success: false,
      error: { code: 'X', message: 'bad', details: { f: 'm' } },
    });
  });

  it('maps AppError to its status', async () => {
    const res = toErrorResponse(new AppError('NOPE', 'no', 403));
    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ error: { code: 'NOPE' } });
  });

  it('maps ZodError to 422 with the first message per field', async () => {
    const result = z
      .object({ email: z.email(), age: z.number() })
      .safeParse({ email: 'x', age: 'y' });
    const res = toErrorResponse(result.error);
    expect(res.status).toBe(422);
    const body = (await json(res)) as { error: { details: Record<string, string> } };
    expect(Object.keys(body.error.details).sort()).toEqual(['age', 'email']);
  });

  it('hides unexpected errors behind a generic 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = toErrorResponse(new Error('db password leaked'));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await json(res))).not.toContain('leaked');
    spy.mockRestore();
  });

  it('route() passes results through and converts thrown errors', async () => {
    const good = route(() => Promise.resolve(ok(1)));
    const bad = route(() => Promise.reject(new AppError('E', 'e', 409)));
    expect((await good()).status).toBe(200);
    expect((await bad()).status).toBe(409);
  });

  it('parseBody validates JSON and rejects malformed bodies', async () => {
    const schema = z.object({ n: z.number() });
    const post = (body: string) => new Request('http://x.test', { method: 'POST', body });
    expect(await parseBody(post('{"n":1}'), schema)).toEqual({ n: 1 });
    await expect(parseBody(post('not json'), schema)).rejects.toMatchObject({
      code: 'INVALID_JSON',
    });
    await expect(parseBody(post('{"n":"x"}'), schema)).rejects.toBeInstanceOf(z.ZodError);
  });
});
