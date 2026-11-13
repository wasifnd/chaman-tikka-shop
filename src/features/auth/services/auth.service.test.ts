import { describe, expect, it } from 'vitest';
import { verifyAccessToken } from '@/lib/auth/access-token';
import { hashPassword } from '@/lib/auth/password';
import { AppError } from '@/lib/errors';
import {
  createAuthService,
  type AuthRepository,
  type AuthUserRecord,
  type RefreshTokenRecord,
} from './auth.service';

const config = {
  accessSecret: 's'.repeat(32),
  accessTtlSeconds: 900,
  refreshTtlDays: 7,
  bcryptCost: 4,
};

function createFakeRepo() {
  const users = new Map<string, AuthUserRecord>();
  const tokens = new Map<string, RefreshTokenRecord & { hash: string }>();
  let seq = 0;

  const repo: AuthRepository = {
    findUserByPhone: (phone) =>
      Promise.resolve([...users.values()].find((u) => u.phone === phone) ?? null),
    findUserByEmail: (email) =>
      Promise.resolve([...users.values()].find((u) => u.email === email) ?? null),
    findUserById: (id) => Promise.resolve(users.get(id) ?? null),
    createCustomerUser: async ({ phone, email, passwordHash }) => {
      const record: AuthUserRecord = {
        id: `u${String(++seq)}`,
        phone,
        email: email ?? null,
        passwordHash,
        role: 'CUSTOMER',
        isActive: true,
        customerId: `c${String(seq)}`,
      };
      users.set(record.id, record);
      return Promise.resolve(record);
    },
    touchLastLogin: () => Promise.resolve(),
    saveRefreshToken: ({ userId, tokenHash, expiresAt }) => {
      const id = `t${String(++seq)}`;
      tokens.set(tokenHash, {
        id,
        userId,
        expiresAt,
        revokedAt: null,
        rotatedAt: null,
        hash: tokenHash,
      });
      return Promise.resolve();
    },
    findRefreshToken: (hash) => Promise.resolve(tokens.get(hash) ?? null),
    revokeRefreshToken: (id) => {
      const token = [...tokens.values()].find((t) => t.id === id);
      if (!token || token.revokedAt) return Promise.resolve(false);
      token.revokedAt = new Date();
      return Promise.resolve(true);
    },
    rotateRefreshToken: (id, at) => {
      const token = [...tokens.values()].find((t) => t.id === id);
      if (!token || token.revokedAt) return Promise.resolve(false);
      token.revokedAt = at;
      token.rotatedAt = at;
      return Promise.resolve(true);
    },
    revokeAllRefreshTokens: (userId) => {
      for (const t of tokens.values()) {
        if (t.userId !== userId) continue;
        t.revokedAt ??= new Date();
        t.rotatedAt = null;
      }
      return Promise.resolve();
    },
  };
  return { repo, users, tokens };
}

const signupInput = {
  name: 'Ali',
  phone: '03001234567',
  email: 'ali@example.com',
  password: 'longenough1',
};
const provenAt = new Date('2026-01-01T00:00:00Z');

async function expectAppError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
  await expect(promise).rejects.toBeInstanceOf(AppError);
}

describe('auth service', () => {
  it('signs up a customer and issues a verifiable session', async () => {
    const { repo } = createFakeRepo();
    const session = await createAuthService(repo, config).signup(signupInput, provenAt);
    expect(session.user).toMatchObject({
      phone: '03001234567',
      email: 'ali@example.com',
      role: 'CUSTOMER',
    });
    expect(session.user.customerId).toBeDefined();
    expect(await verifyAccessToken(session.accessToken, config.accessSecret)).toEqual(session.user);
  });

  it('rejects a phone number that already has an account', async () => {
    const { repo } = createFakeRepo();
    const auth = createAuthService(repo, config);
    await auth.signup(signupInput, provenAt);
    await expectAppError(
      auth.signup({ ...signupInput, email: undefined }, provenAt),
      'PHONE_TAKEN',
    );
  });

  it('rejects an email already used by another account', async () => {
    const { repo } = createFakeRepo();
    const auth = createAuthService(repo, config);
    await auth.signup(signupInput, provenAt);
    await expectAppError(
      auth.signup({ ...signupInput, phone: '03451234567' }, provenAt),
      'EMAIL_TAKEN',
    );
  });

  it('signs up without an email', async () => {
    const { repo } = createFakeRepo();
    const session = await createAuthService(repo, config).signup(
      { ...signupInput, email: undefined },
      provenAt,
    );
    expect(session.user).toMatchObject({ phone: '03001234567', role: 'CUSTOMER' });
    expect(session.user.email).toBeUndefined();
  });

  it('logs in with the right password only', async () => {
    const { repo } = createFakeRepo();
    const auth = createAuthService(repo, config);
    await auth.signup(signupInput, provenAt);
    const session = await auth.login({ phone: '03001234567', password: 'longenough1' });
    expect(session.user.phone).toBe('03001234567');
    await expectAppError(
      auth.login({ phone: '03001234567', password: 'wrong-password' }),
      'INVALID_CREDENTIALS',
    );
  });

  it('gives the same error for unknown numbers', async () => {
    const { repo } = createFakeRepo();
    await expectAppError(
      createAuthService(repo, config).login({ phone: '03009999999', password: 'x' }),
      'INVALID_CREDENTIALS',
    );
  });

  it('blocks disabled accounts, but only after the password is correct', async () => {
    const { repo, users } = createFakeRepo();
    const auth = createAuthService(repo, config);
    await auth.signup(signupInput, provenAt);
    const [user] = [...users.values()];
    if (user) user.isActive = false;
    await expectAppError(
      auth.login({ phone: '03001234567', password: 'longenough1' }),
      'ACCOUNT_DISABLED',
    );
    await expectAppError(
      auth.login({ phone: '03001234567', password: 'wrong-password' }),
      'INVALID_CREDENTIALS',
    );
  });

  it('logs in staff accounts without a customerId', async () => {
    const { repo, users } = createFakeRepo();
    users.set('s1', {
      id: 's1',
      phone: '03111111111',
      email: null,
      passwordHash: await hashPassword('staffpass1', 4),
      role: 'STORE_STAFF',
      isActive: true,
      customerId: null,
    });
    const session = await createAuthService(repo, config).login({
      phone: '03111111111',
      password: 'staffpass1',
    });
    expect(session.user).toEqual({ userId: 's1', phone: '03111111111', role: 'STORE_STAFF' });
  });

  describe('refresh', () => {
    it('rotates tokens and rejects reuse of the old one, revoking the family', async () => {
      const { repo } = createFakeRepo();
      let current = new Date('2026-01-01T00:00:00Z');
      const auth = createAuthService(repo, config, () => current);
      const first = await auth.signup(signupInput, provenAt);
      const second = await auth.refresh(first.refreshToken);
      expect(second.refreshToken).not.toBe(first.refreshToken);

      // Well after the grace period, the old token turning up again means it was copied.
      current = new Date('2026-01-01T00:01:00Z');

      await expectAppError(auth.refresh(first.refreshToken), 'INVALID_REFRESH_TOKEN');
      // The replay revoked the whole family, so the newest token is dead too.
      await expectAppError(auth.refresh(second.refreshToken), 'INVALID_REFRESH_TOKEN');
    });

    it('rejects unknown and expired tokens', async () => {
      const { repo } = createFakeRepo();
      let current = new Date('2026-01-01T00:00:00Z');
      const auth = createAuthService(repo, config, () => current);
      await expectAppError(auth.refresh('unknown'), 'INVALID_REFRESH_TOKEN');

      const session = await auth.signup(signupInput, provenAt);
      current = new Date('2026-01-09T00:00:00Z'); // 8 days later, TTL is 7
      await expectAppError(auth.refresh(session.refreshToken), 'INVALID_REFRESH_TOKEN');
    });

    it('rejects a refresh for a disabled user', async () => {
      const { repo, users } = createFakeRepo();
      const auth = createAuthService(repo, config);
      const session = await auth.signup(signupInput, provenAt);
      const [user] = [...users.values()];
      if (user) user.isActive = false;
      await expectAppError(auth.refresh(session.refreshToken), 'INVALID_REFRESH_TOKEN');
    });

    it('treats a lost rotation race as a replay when nobody just rotated the token', async () => {
      const { repo } = createFakeRepo();
      const auth = createAuthService(
        { ...repo, rotateRefreshToken: () => Promise.resolve(false) },
        config,
      );
      const session = await auth.signup(signupInput, provenAt);
      await expectAppError(auth.refresh(session.refreshToken), 'INVALID_REFRESH_TOKEN');
    });

    describe('a token replaced moments ago (the browser lost the answer)', () => {
      const start = new Date('2026-01-01T00:00:00Z');
      const later = (seconds: number) => new Date(start.getTime() + seconds * 1000);

      it('still works within 30 seconds, without signing anyone out', async () => {
        const { repo } = createFakeRepo();
        let current = start;
        const auth = createAuthService(repo, config, () => current);
        const first = await auth.signup(signupInput, provenAt);
        const second = await auth.refresh(first.refreshToken);

        current = later(20);
        const again = await auth.refresh(first.refreshToken);
        expect(again.refreshToken).not.toBe(second.refreshToken);
        // Both newer tokens keep working: the family was not revoked.
        await expect(auth.refresh(second.refreshToken)).resolves.toBeDefined();
        await expect(auth.refresh(again.refreshToken)).resolves.toBeDefined();
      });

      it('signs everyone out when it turns up after 30 seconds', async () => {
        const { repo } = createFakeRepo();
        let current = start;
        const auth = createAuthService(repo, config, () => current);
        const first = await auth.signup(signupInput, provenAt);
        const second = await auth.refresh(first.refreshToken);

        current = later(31);
        await expectAppError(auth.refresh(first.refreshToken), 'INVALID_REFRESH_TOKEN');
        await expectAppError(auth.refresh(second.refreshToken), 'INVALID_REFRESH_TOKEN');
      });

      it('lets the grace period be configured', async () => {
        const { repo } = createFakeRepo();
        let current = start;
        const auth = createAuthService(repo, { ...config, reuseGraceSeconds: 5 }, () => current);
        const first = await auth.signup(signupInput, provenAt);
        await auth.refresh(first.refreshToken);
        current = later(6);
        await expectAppError(auth.refresh(first.refreshToken), 'INVALID_REFRESH_TOKEN');
      });

      it('gives no grace to a token ended by logging out', async () => {
        const { repo } = createFakeRepo();
        const auth = createAuthService(repo, config, () => start);
        const session = await auth.signup(signupInput, provenAt);
        await auth.logout(session.refreshToken);
        await expectAppError(auth.refresh(session.refreshToken), 'INVALID_REFRESH_TOKEN');
      });

      it('gives no grace once the family has been signed out', async () => {
        const { repo } = createFakeRepo();
        let current = start;
        const auth = createAuthService(repo, config, () => current);
        const first = await auth.signup(signupInput, provenAt);
        const second = await auth.refresh(first.refreshToken);
        // The second token is replaced at 80 s, so at 91 s it would still be inside its grace period.
        current = later(80);
        const third = await auth.refresh(second.refreshToken);

        // A genuine replay of an old token signs everyone out...
        current = later(90);
        await expectAppError(auth.refresh(first.refreshToken), 'INVALID_REFRESH_TOKEN');
        // ...after which even a token replaced moments ago gets no second chance.
        current = later(91);
        await expectAppError(auth.refresh(second.refreshToken), 'INVALID_REFRESH_TOKEN');
        await expectAppError(auth.refresh(third.refreshToken), 'INVALID_REFRESH_TOKEN');
      });

      it('wins a race with a request that rotated the same token at the same moment', async () => {
        const { repo, tokens } = createFakeRepo();
        const auth = createAuthService(
          {
            ...repo,
            // Another request got there first, between our read and our rotation.
            rotateRefreshToken: (id) => {
              const token = [...tokens.values()].find((t) => t.id === id);
              if (token) {
                token.revokedAt = start;
                token.rotatedAt = start;
              }
              return Promise.resolve(false);
            },
          },
          config,
          () => later(1),
        );
        const session = await auth.signup(signupInput, provenAt);
        await expect(auth.refresh(session.refreshToken)).resolves.toMatchObject({
          user: { email: 'ali@example.com' },
        });
      });

      it('does not revive a switched-off account', async () => {
        const { repo, users } = createFakeRepo();
        let current = start;
        const auth = createAuthService(repo, config, () => current);
        const first = await auth.signup(signupInput, provenAt);
        await auth.refresh(first.refreshToken);
        const [user] = [...users.values()];
        if (user) user.isActive = false;
        current = later(5);
        await expectAppError(auth.refresh(first.refreshToken), 'INVALID_REFRESH_TOKEN');
      });
    });
  });

  describe('logout', () => {
    it('revokes the refresh token so it cannot be used again', async () => {
      const { repo } = createFakeRepo();
      const auth = createAuthService(repo, config);
      const session = await auth.signup(signupInput, provenAt);
      await auth.logout(session.refreshToken);
      await expectAppError(auth.refresh(session.refreshToken), 'INVALID_REFRESH_TOKEN');
    });

    it('is a no-op without a token or for an unknown one', async () => {
      const { repo } = createFakeRepo();
      const auth = createAuthService(repo, config);
      await expect(auth.logout(undefined)).resolves.toBeUndefined();
      await expect(auth.logout('unknown')).resolves.toBeUndefined();
    });
  });
});
