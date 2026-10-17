import { cookies } from 'next/headers';
import { signupSchema } from '@/features/auth/schemas/auth.schema';
import { getAuthService, getCookieConfig } from '@/features/auth/server';
import { setAuthCookies } from '@/lib/auth/cookies';
import { assertSameOrigin, clientIp, enforceRateLimit } from '@/lib/http/guards';
import { ok, parseBody, route } from '@/lib/http/response';
import { getRateLimiter } from '@/lib/rate-limit';

export const POST = route(async (request: Request) => {
  assertSameOrigin(request);
  await enforceRateLimit(getRateLimiter('signup', 10, 3600), clientIp(request.headers));

  const input = await parseBody(request, signupSchema);
  const session = await getAuthService().signup(input);
  setAuthCookies(await cookies(), session, getCookieConfig());
  return ok({ user: session.user }, { status: 201 });
});
