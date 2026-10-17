import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from './access-token';
import { ACCESS_COOKIE } from './cookies';
import { getSession, requireSession } from './session';

const secret = 's'.repeat(32);
let cookieValue: string | undefined;

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === ACCESS_COOKIE && cookieValue ? { name, value: cookieValue } : undefined,
    }),
}));

beforeEach(() => {
  cookieValue = undefined;
  vi.stubEnv('DATABASE_URL', 'postgresql://x');
  vi.stubEnv('JWT_ACCESS_SECRET', secret);
  vi.stubEnv('JWT_REFRESH_SECRET', 'r'.repeat(32));
});

const user = { userId: 'u1', email: 'a@b.pk', role: 'STORE_STAFF' as const };

describe('session helpers', () => {
  it('returns null without a cookie or with an invalid one', async () => {
    expect(await getSession()).toBeNull();
    cookieValue = 'garbage';
    expect(await getSession()).toBeNull();
  });

  it('returns the session for a valid cookie', async () => {
    cookieValue = await signAccessToken(user, secret, 60);
    expect(await getSession()).toEqual(user);
  });

  it('requireSession throws 401 when signed out', async () => {
    await expect(requireSession()).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
  });

  it('requireSession enforces roles with 403', async () => {
    cookieValue = await signAccessToken(user, secret, 60);
    await expect(requireSession(['ADMIN'])).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
    await expect(requireSession(['STORE_STAFF', 'ADMIN'])).resolves.toEqual(user);
    await expect(requireSession()).resolves.toEqual(user);
  });
});
