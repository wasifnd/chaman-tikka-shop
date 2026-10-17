import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { toErrorResponse } from './response';
import { assertSameOrigin, enforceRateLimit } from './guards';

const request = (origin?: string) =>
  new Request('https://bbqstore.pk/api/auth/login', {
    method: 'POST',
    ...(origin ? { headers: { origin } } : {}),
  });

describe('assertSameOrigin', () => {
  it('allows same-origin and origin-less requests', () => {
    expect(() => {
      assertSameOrigin(request('https://bbqstore.pk'));
    }).not.toThrow();
    expect(() => {
      assertSameOrigin(request());
    }).not.toThrow();
  });

  it('rejects other origins', () => {
    expect(() => {
      assertSameOrigin(request('https://evil.example'));
    }).toThrow(AppError);
  });
});

describe('enforceRateLimit', () => {
  it('passes when allowed', async () => {
    await expect(
      enforceRateLimit(
        { check: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }) },
        'k',
      ),
    ).resolves.toBeUndefined();
  });

  it('throws a 429 carrying Retry-After when blocked', async () => {
    const promise = enforceRateLimit(
      { check: () => Promise.resolve({ allowed: false, retryAfterSeconds: 42 }) },
      'k',
    );
    await expect(promise).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
    const error = await promise.catch((e: unknown) => e);
    const response = toErrorResponse(error);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
  });
});
