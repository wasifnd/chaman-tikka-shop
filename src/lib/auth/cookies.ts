import type { AuthSession } from '@/features/auth/services/auth.service';

export const ACCESS_COOKIE = 'bbq_at';
export const REFRESH_COOKIE = 'bbq_rt';
/** The refresh cookie is only sent to auth endpoints, never to pages or other APIs. */
export const REFRESH_COOKIE_PATH = '/api/auth';

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict';
  path: string;
  maxAge: number;
}

/** The slice of Next's cookie store we use, so it can be faked in tests. */
export interface CookieStore {
  set(name: string, value: string, options: CookieOptions): unknown;
  set(options: { name: string; value: string } & CookieOptions): unknown;
}

export interface CookieConfig {
  accessTtlSeconds: number;
  refreshTtlDays: number;
  secure: boolean;
}

export function setAuthCookies(store: CookieStore, session: AuthSession, config: CookieConfig) {
  const base = { httpOnly: true, secure: config.secure, sameSite: 'lax' } as const;
  store.set(ACCESS_COOKIE, session.accessToken, {
    ...base,
    path: '/',
    maxAge: config.accessTtlSeconds,
  });
  store.set(REFRESH_COOKIE, session.refreshToken, {
    ...base,
    path: REFRESH_COOKIE_PATH,
    maxAge: config.refreshTtlDays * 86_400,
  });
}

export function clearAuthCookies(store: CookieStore, config: Pick<CookieConfig, 'secure'>) {
  const base = { httpOnly: true, secure: config.secure, sameSite: 'lax', maxAge: 0 } as const;
  store.set(ACCESS_COOKIE, '', { ...base, path: '/' });
  store.set(REFRESH_COOKIE, '', { ...base, path: REFRESH_COOKIE_PATH });
}
