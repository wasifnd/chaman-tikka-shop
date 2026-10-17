import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '@/lib/auth/access-token';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { proxy } from './proxy';

const secret = 's'.repeat(32);

function request(path: string, token?: string) {
  return new NextRequest(`https://bbqstore.pk${path}`, {
    ...(token ? { headers: { cookie: `${ACCESS_COOKIE}=${token}` } } : {}),
  });
}

beforeEach(() => {
  vi.stubEnv('JWT_ACCESS_SECRET', secret);
});

describe('proxy', () => {
  it('lets matching users through', async () => {
    const token = await signAccessToken(
      { userId: 'u', email: 'a@b.pk', role: 'ADMIN' },
      secret,
      60,
    );
    const res = await proxy(request('/admin/orders', token));
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('redirects signed-out visitors to the refresh flow with a return path', async () => {
    const res = await proxy(request('/account/orders?tab=1'));
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/api/auth/refresh');
    expect(location.searchParams.get('next')).toBe('/account/orders?tab=1');
  });

  it('treats an invalid token like no token', async () => {
    const res = await proxy(request('/store/kitchen', 'garbage'));
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/api/auth/refresh');
  });

  it('sends users with the wrong role home', async () => {
    const token = await signAccessToken(
      { userId: 'u', email: 'a@b.pk', role: 'CUSTOMER' },
      secret,
      60,
    );
    const res = await proxy(request('/admin', token));
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/');
  });

  it('never trusts a token when the secret is not configured', async () => {
    vi.stubEnv('JWT_ACCESS_SECRET', '');
    const token = await signAccessToken(
      { userId: 'u', email: 'a@b.pk', role: 'ADMIN' },
      secret,
      60,
    );
    const res = await proxy(request('/admin', token));
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/api/auth/refresh');
  });
});
