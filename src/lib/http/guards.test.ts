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

  /**
   * The server may see its own address as "localhost" (next start, or behind a proxy) while the
   * browser used the real one, so the address the browser asked for (Host) must count too.
   */
  const asServerSeesIt = (headers: Record<string, string>) =>
    new Request('http://localhost:3000/api/v1/orders', { method: 'POST', headers });

  it('accepts the address the browser actually used, from the Host header', () => {
    expect(() => {
      assertSameOrigin(
        asServerSeesIt({ origin: 'http://192.168.1.20:3000', host: '192.168.1.20:3000' }),
      );
    }).not.toThrow();
    expect(() => {
      assertSameOrigin(asServerSeesIt({ origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' }));
    }).not.toThrow();
  });

  it('accepts the public address a proxy forwards', () => {
    expect(() => {
      assertSameOrigin(
        asServerSeesIt({
          origin: 'https://bbqstore.pk',
          host: 'localhost:3000',
          'x-forwarded-host': 'bbqstore.pk',
          'x-forwarded-proto': 'https',
        }),
      );
    }).not.toThrow();
    // Proxies may list several hops; the first is the one the browser used.
    expect(() => {
      assertSameOrigin(
        asServerSeesIt({
          origin: 'https://bbqstore.pk',
          'x-forwarded-host': 'bbqstore.pk, internal.lan',
          'x-forwarded-proto': 'https, http',
        }),
      );
    }).not.toThrow();
  });

  it('still rejects another site, whatever the Host says', () => {
    for (const origin of [
      'https://evil.example',
      'http://bbqstore.pk',
      'https://bbqstore.pk.evil.example',
    ]) {
      expect(() => {
        assertSameOrigin(
          asServerSeesIt({ origin, host: 'bbqstore.pk', 'x-forwarded-proto': 'https' }),
        );
      }, origin).toThrow(AppError);
    }
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
