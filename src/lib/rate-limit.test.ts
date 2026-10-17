import { describe, expect, it, vi } from 'vitest';
import { clientIp, createMemoryLimiter, getRateLimiter } from './rate-limit';

vi.mock('@upstash/redis', () => ({ Redis: vi.fn() }));
vi.mock('@upstash/ratelimit', () => {
  const Ratelimit = vi.fn(function () {
    return { limit: () => Promise.resolve({ success: false, reset: Date.now() + 5000 }) };
  });
  (Ratelimit as unknown as { slidingWindow: () => string }).slidingWindow = () => 'window';
  return { Ratelimit };
});

describe('memory limiter', () => {
  it('allows up to max requests then blocks with a retry hint', async () => {
    let time = 1_000;
    const limiter = createMemoryLimiter(2, 60, () => time);
    expect((await limiter.check('ip')).allowed).toBe(true);
    expect((await limiter.check('ip')).allowed).toBe(true);
    const blocked = await limiter.check('ip');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);

    time += 59_000;
    expect((await limiter.check('ip')).retryAfterSeconds).toBe(1);
  });

  it('tracks keys separately and resets after the window', async () => {
    let time = 0;
    const limiter = createMemoryLimiter(1, 10, () => time);
    expect((await limiter.check('a')).allowed).toBe(true);
    expect((await limiter.check('b')).allowed).toBe(true);
    expect((await limiter.check('a')).allowed).toBe(false);
    time = 10_000;
    expect((await limiter.check('a')).allowed).toBe(true);
  });
});

describe('getRateLimiter', () => {
  it('falls back to memory without Upstash credentials and caches per name', async () => {
    const a = getRateLimiter('login-mem', 1, 60, {});
    expect(getRateLimiter('login-mem', 1, 60, {})).toBe(a);
    expect((await a.check('x')).allowed).toBe(true);
    expect((await a.check('x')).allowed).toBe(false);
  });

  it('uses Upstash when credentials are present', async () => {
    const limiter = getRateLimiter('login-redis', 5, 60, {
      UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'token',
    });
    const result = await limiter.check('x');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});

describe('clientIp', () => {
  it('prefers the first x-forwarded-for entry, then x-real-ip, then unknown', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('1.1.1.1');
    expect(clientIp(new Headers({ 'x-real-ip': '3.3.3.3' }))).toBe('3.3.3.3');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});
