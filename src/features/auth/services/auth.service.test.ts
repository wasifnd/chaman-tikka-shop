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
    findUserByEmail: (email) =>
      Promise.resolve([...users.values()].find((u) => u.email === email) ?? null),
    findUserById: (id) => Promise.resolve(users.get(id) ?? null),
    createCustomerUser: async ({ email, passwordHash }) => {
      const record: AuthUserRecord = {
        id: `u${String(++seq)}`,
        email,
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
      tokens.set(tokenHash, { id, userId, expiresAt, revokedAt: null, hash: tokenHash });
      return Promise.resolve();
    },
    findRefreshToken: (hash) => Promise.resolve(tokens.get(hash) ?? null),
    revokeRefreshToken: (id) => {
      const token = [...tokens.values()].find((t) => t.id === id);
      if (!token || token.revokedAt) return Promise.resolve(false);
      token.revokedAt = new Date();
      return Promise.resolve(true);
    },
    revokeAllRefreshTokens: (userId) => {
      for (const t of tokens.values()) if (t.userId === userId) t.revokedAt ??= new Date();
      return Promise.resolve();
    },
  };
  return { repo, users, tokens };
}

const signupInput = { name: 'Ali', email: 'ali@example.com', password: 'longenough1' };

async function expectAppError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
  await expect(promise).rejects.toBeInstanceOf(AppError);
}

describe('auth service', () => {
  it('signs up a customer and issues a verifiable session', async () => {
    const { repo } = createFakeRepo();
    const session = await createAuthService(repo, config).signup(signupInput);
    expect(session.user).toMatchObject({ email: 'ali@example.com', role: 'CUSTOMER' });
    expect(session.user.customerId).toBeDefined();
    expect(await verifyAccessToken(session.accessToken, config.accessSecret)).toEqual(session.user);
  });

  it('rejects duplicate emails', async () => {
    const { repo } = createFakeRepo();
    const auth = createAuthService(repo, config);
    await auth.signup(signupInput);
    await expectAppError(auth.signup(signupInput), 'EMAIL_TAKEN');
  });

  it('logs in with the right password only', async () => {
    const { repo } = createFakeRepo();
    const auth = createAuthService(repo, config);
    await auth.signup(signupInput);
    const session = await auth.login({ email: 'ali@example.com', password: 'longenough1' });
    expect(session.user.email).toBe('ali@example.com');
    await expectAppError(
      auth.login({ email: 'ali@example.com', password: 'wrong-password' }),
      'INVALID_CREDENTIALS',
    );
  });

  it('gives the same error for unknown emails', async () => {
    const { repo } = createFakeRepo();
    await expectAppError(
      createAuthService(repo, config).login({ email: 'nobody@example.com', password: 'x' }),
      'INVALID_CREDENTIALS',
    );
  });

  it('blocks disabled accounts, but only after the password is correct', async () => {
    const { repo, users } = createFakeRepo();
    const auth = createAuthService(repo, config);
    await auth.signup(signupInput);
    const [user] = [...users.values()];
    if (user) user.isActive = false;
    await expectAppError(
      auth.login({ email: 'ali@example.com', password: 'longenough1' }),
      'ACCOUNT_DISABLED',
    );
    await expectAppError(
      auth.login({ email: 'ali@example.com', password: 'wrong-password' }),
      'INVALID_CREDENTIALS',
    );
  });

  it('logs in staff accounts without a customerId', async () => {
    const { repo, users } = createFakeRepo();
    users.set('s1', {
      id: 's1',
      email: 'staff@example.com',
      passwordHash: await hashPassword('staffpass1', 4),
      role: 'STORE_STAFF',
      isActive: true,
      customerId: null,
    });
    const session = await createAuthService(repo, config).login({
      email: 'staff@example.com',
      password: 'staffpass1',
    });
    expect(session.user).toEqual({ userId: 's1', email: 'staff@example.com', role: 'STORE_STAFF' });
  });

  describe('refresh', () => {
    it('rotates tokens and rejects reuse of the old one, revoking the family', async () => {
      const { repo } = createFakeRepo();
      const auth = createAuthService(repo, config);
      const first = await auth.signup(signupInput);
      const second = await auth.refresh(first.refreshToken);
      expect(second.refreshToken).not.toBe(first.refreshToken);

      await expectAppError(auth.refresh(first.refreshToken), 'INVALID_REFRESH_TOKEN');
      // The replay revoked the whole family, so the newest token is dead too.
      await expectAppError(auth.refresh(second.refreshToken), 'INVALID_REFRESH_TOKEN');
    });

    it('rejects unknown and expired tokens', async () => {
      const { repo } = createFakeRepo();
      let current = new Date('2026-01-01T00:00:00Z');
      const auth = createAuthService(repo, config, () => current);
      await expectAppError(auth.refresh('unknown'), 'INVALID_REFRESH_TOKEN');

      const session = await auth.signup(signupInput);
      current = new Date('2026-01-09T00:00:00Z'); // 8 days later, TTL is 7
      await expectAppError(auth.refresh(session.refreshToken), 'INVALID_REFRESH_TOKEN');
    });

    it('rejects a refresh for a disabled user', async () => {
      const { repo, users } = createFakeRepo();
      const auth = createAuthService(repo, config);
      const session = await auth.signup(signupInput);
      const [user] = [...users.values()];
      if (user) user.isActive = false;
      await expectAppError(auth.refresh(session.refreshToken), 'INVALID_REFRESH_TOKEN');
    });

    it('treats a lost revoke race as a replay', async () => {
      const { repo } = createFakeRepo();
      const auth = createAuthService(
        { ...repo, revokeRefreshToken: () => Promise.resolve(false) },
        config,
      );
      const session = await auth.signup(signupInput);
      await expectAppError(auth.refresh(session.refreshToken), 'INVALID_REFRESH_TOKEN');
    });
  });

  describe('logout', () => {
    it('revokes the refresh token so it cannot be used again', async () => {
      const { repo } = createFakeRepo();
      const auth = createAuthService(repo, config);
      const session = await auth.signup(signupInput);
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
