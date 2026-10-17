import { cookies } from 'next/headers';
import { getAuthService, getCookieConfig } from '@/features/auth/server';
import { REFRESH_COOKIE, clearAuthCookies } from '@/lib/auth/cookies';
import { assertSameOrigin } from '@/lib/http/guards';
import { ok, route } from '@/lib/http/response';

export const POST = route(async (request: Request) => {
  assertSameOrigin(request);
  const store = await cookies();
  await getAuthService().logout(store.get(REFRESH_COOKIE)?.value);
  clearAuthCookies(store, getCookieConfig());
  return ok(null);
});
