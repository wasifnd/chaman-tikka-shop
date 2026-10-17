import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string): Promise<RateLimitResult>;
}

/**
 * Fixed-window limiter held in process memory. Fine for local development and as a fallback,
 * but each serverless instance has its own counters, so production should use Upstash.
 */
export function createMemoryLimiter(
  max: number,
  windowSeconds: number,
  now: () => number = Date.now,
): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    check(key) {
      const time = now();
      let entry = windows.get(key);
      if (!entry || entry.resetAt <= time) {
        entry = { count: 0, resetAt: time + windowSeconds * 1000 };
        windows.set(key, entry);
      }
      entry.count += 1;
      const allowed = entry.count <= max;
      const retryAfterSeconds = allowed ? 0 : Math.ceil((entry.resetAt - time) / 1000);
      return Promise.resolve({ allowed, retryAfterSeconds });
    },
  };
}

export function createUpstashLimiter(
  redis: Redis,
  name: string,
  max: number,
  windowSeconds: number,
  now: () => number = Date.now,
): RateLimiter {
  const limiter = new Ratelimit({
    redis,
    prefix: `rl:${name}`,
    limiter: Ratelimit.slidingWindow(max, `${windowSeconds} s`),
  });
  return {
    async check(key) {
      const { success, reset } = await limiter.limit(key);
      return {
        allowed: success,
        retryAfterSeconds: success ? 0 : Math.max(1, Math.ceil((reset - now()) / 1000)),
      };
    },
  };
}

const cache = new Map<string, RateLimiter>();

/** Upstash when configured, otherwise the in-memory fallback. One instance per name. */
export function getRateLimiter(
  name: string,
  max: number,
  windowSeconds: number,
  source: Record<string, string | undefined> = process.env,
): RateLimiter {
  const cached = cache.get(name);
  if (cached) return cached;
  const url = source['UPSTASH_REDIS_REST_URL'];
  const token = source['UPSTASH_REDIS_REST_TOKEN'];
  const limiter =
    url && token
      ? createUpstashLimiter(new Redis({ url, token }), name, max, windowSeconds)
      : createMemoryLimiter(max, windowSeconds);
  cache.set(name, limiter);
  return limiter;
}

/** Best-effort client IP from proxy headers. */
export function clientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? headers.get('x-real-ip') ?? 'unknown'
  );
}
