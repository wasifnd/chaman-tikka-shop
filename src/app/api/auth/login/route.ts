import { cookies } from 'next/headers';
import { loginSchema } from '@/features/auth/schemas/auth.schema';
import { getAuthService, getCookieConfig } from '@/features/auth/server';
import { setAuthCookies } from '@/lib/auth/cookies';
import { assertSameOrigin, clientIp, enforceRateLimit } from '@/lib/http/guards';
import { ok, parseBody, route } from '@/lib/http/response';
import { getRateLimiter } from '@/lib/rate-limit';

export const POST = route(async (request: Request) => {
  assertSameOrigin(request);
  await enforceRateLimit(getRateLimiter('login-ip', 30, 900), clientIp(request.headers));

  const input = await parseBody(request, loginSchema);
  // Per-account limit stops password guessing that is spread across many IPs.
  await enforceRateLimit(getRateLimiter('login-email', 8, 900), input.email);

  const session = await getAuthService().login(input);
  setAuthCookies(await cookies(), session, getCookieConfig());
  return ok({ user: session.user });
});
