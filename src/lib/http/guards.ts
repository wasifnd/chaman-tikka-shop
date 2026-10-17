import { AppError } from '@/lib/errors';
import { clientIp, type RateLimiter } from '@/lib/rate-limit';

/**
 * CSRF defence in depth on top of SameSite=Lax cookies: browsers send Origin on
 * cross-site POSTs, so reject any that don't match this site.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw new AppError('BAD_ORIGIN', 'Cross-site requests are not allowed.', 403);
  }
}

export async function enforceRateLimit(limiter: RateLimiter, key: string): Promise<void> {
  const { allowed, retryAfterSeconds } = await limiter.check(key);
  if (!allowed) {
    throw new AppError(
      'RATE_LIMITED',
      'Too many attempts. Please try again later.',
      429,
      undefined,
      {
        'Retry-After': String(retryAfterSeconds),
      },
    );
  }
}

export { clientIp };
