import { describe, expect, it } from 'vitest';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  clearAuthCookies,
  setAuthCookies,
  type CookieOptions,
  type CookieStore,
} from './cookies';

function fakeStore() {
  const calls: { name: string; value: string; options: CookieOptions }[] = [];
  const store: CookieStore = {
    set: (nameOrOptions: unknown, value?: string, options?: CookieOptions) => {
      calls.push({
        name: nameOrOptions as string,
        value: value ?? '',
        options: options as CookieOptions,
      });
    },
  };
  return { store, calls };
}

const session = {
  user: { userId: 'u', email: 'a@b.pk', role: 'CUSTOMER' as const },
  accessToken: 'access',
  refreshToken: 'refresh',
};

describe('auth cookies', () => {
  it('sets httpOnly, SameSite=Lax cookies with the right scope and lifetime', () => {
    const { store, calls } = fakeStore();
    setAuthCookies(store, session, { accessTtlSeconds: 900, refreshTtlDays: 7, secure: true });

    const access = calls.find((c) => c.name === ACCESS_COOKIE);
    const refresh = calls.find((c) => c.name === REFRESH_COOKIE);
    expect(access).toMatchObject({
      value: 'access',
      options: { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 900 },
    });
    expect(refresh).toMatchObject({
      value: 'refresh',
      options: { httpOnly: true, path: REFRESH_COOKIE_PATH, maxAge: 7 * 86_400 },
    });
  });

  it('clears both cookies on the same paths they were set on', () => {
    const { store, calls } = fakeStore();
    clearAuthCookies(store, { secure: false });
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.value === '' && c.options.maxAge === 0)).toBe(true);
    expect(calls.map((c) => c.options.path).sort()).toEqual(['/', REFRESH_COOKIE_PATH].sort());
  });
});
