import { cookies } from 'next/headers';
import { signupSchema } from '@/features/auth/schemas/auth.schema';
import { getAuthService, getCookieConfig } from '@/features/auth/server';
import { verification } from '@/features/verification/server';
import { phoneNotVerified } from '@/features/verification/services/verification.service';
import { setAuthCookies } from '@/lib/auth/cookies';
import { assertSameOrigin, clientIp, enforceRateLimit } from '@/lib/http/guards';
import { ok, parseBody, route } from '@/lib/http/response';
import { getRateLimiter } from '@/lib/rate-limit';

export const POST = route(async (request: Request) => {
  assertSameOrigin(request);
  await enforceRateLimit(getRateLimiter('signup', 10, 3600), clientIp(request.headers));

  const input = await parseBody(request, signupSchema);
  // The number is the account, so it must be proven to belong to the person signing up.
  const provenAt = await verification.provenAt(input.verificationId, input.phone);
  if (!provenAt) throw phoneNotVerified('phone');

  const session = await getAuthService().signup(input, provenAt);
  setAuthCookies(await cookies(), session, getCookieConfig());
  return ok({ user: session.user }, { status: 201 });
});
