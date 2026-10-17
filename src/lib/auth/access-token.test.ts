import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { signAccessToken, verifyAccessToken, type SessionUser } from './access-token';

const secret = 's'.repeat(32);
const key = new TextEncoder().encode(secret);
const user: SessionUser = { userId: 'u1', email: 'a@b.pk', role: 'CUSTOMER', customerId: 'c1' };

describe('access tokens', () => {
  it('round-trips a session', async () => {
    const token = await signAccessToken(user, secret, 60);
    expect(await verifyAccessToken(token, secret)).toEqual(user);
  });

  it('omits customerId for staff', async () => {
    const staff: SessionUser = { userId: 'u2', email: 's@b.pk', role: 'STORE_STAFF' };
    const token = await signAccessToken(staff, secret, 60);
    expect(await verifyAccessToken(token, secret)).toEqual(staff);
  });

  it('rejects a token signed with another secret', async () => {
    const token = await signAccessToken(user, 'x'.repeat(32), 60);
    expect(await verifyAccessToken(token, secret)).toBeNull();
  });

  it('rejects expired tokens', async () => {
    const token = await new SignJWT({ email: 'a@b.pk', role: 'CUSTOMER' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u1')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(key);
    expect(await verifyAccessToken(token, secret)).toBeNull();
  });

  it('rejects garbage and tokens with an unknown role or no subject', async () => {
    expect(await verifyAccessToken('not-a-jwt', secret)).toBeNull();
    const badRole = await new SignJWT({ email: 'a@b.pk', role: 'ROOT' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u1')
      .sign(key);
    const noSub = await new SignJWT({ email: 'a@b.pk', role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(key);
    expect(await verifyAccessToken(badRole, secret)).toBeNull();
    expect(await verifyAccessToken(noSub, secret)).toBeNull();
  });
});
