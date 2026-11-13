import { AppError } from '@/lib/errors';
import { clientIp, type RateLimiter } from '@/lib/rate-limit';

const firstValue = (header: string | null) => header?.split(',')[0]?.trim() || null;

/**
 * The addresses this request could legitimately come from. The server's own idea of its URL is
 * not enough: `next start` and apps behind a proxy see "localhost" while the browser used the
 * real address, which arrives in Host (or X-Forwarded-Host from the proxy). A page on another
 * site cannot set these to our name, so trusting them does not weaken the check.
 */
function ownOrigins(request: Request): Set<string> {
  const url = new URL(request.url);
  const origins = new Set([url.origin]);
  const proto = firstValue(request.headers.get('x-forwarded-proto')) ?? url.protocol.slice(0, -1);
  for (const host of [
    firstValue(request.headers.get('x-forwarded-host')),
    firstValue(request.headers.get('host')),
  ]) {
    if (host) origins.add(`${proto}://${host}`);
  }
  return origins;
}

/**
 * CSRF defence in depth on top of SameSite=Lax cookies: browsers send Origin on
 * cross-site POSTs, so reject any that don't match this site.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (origin && !ownOrigins(request).has(origin)) {
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
