import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, type TestDatabase } from '@/features/orders/testing/test-database';
import { createPrismaAuthRepository } from './auth.repository';
import { createAuthService } from './auth.service';

/**
 * Real-database tests for session renewal: the grace period for a browser that lost a renewal's
 * answer, and that a real replay still signs everyone out. Skipped unless a URL is provided:
 *   INTEGRATION_DATABASE_URL=postgresql://... npm test
 */
const url = process.env['INTEGRATION_DATABASE_URL'];

vi.setConfig({ testTimeout: 90_000 });

const config = {
  accessSecret: 's'.repeat(32),
  accessTtlSeconds: 900,
  refreshTtlDays: 7,
  bcryptCost: 4,
};

describe.skipIf(!url)('session renewal against Postgres', () => {
  let db: TestDatabase;
  let current = new Date();
  let auth: ReturnType<typeof createAuthService>;
  let n = 0;

  beforeAll(async () => {
    db = await createTestDatabase(url ?? '');
    auth = createAuthService(createPrismaAuthRepository(db.prisma), config, () => current);
  }, 120_000);

  afterAll(async () => {
    await db.drop();
  }, 60_000);

  const signup = () => {
    n += 1;
    current = new Date();
    return auth.signup({
      name: 'Renewal Test',
      email: `renew${String(n)}@example.com`,
      password: 'longenough1',
    });
  };
  const after = (seconds: number) => {
    current = new Date(current.getTime() + seconds * 1000);
  };

  it('a renewal replaces the token and records when', async () => {
    const first = await signup();
    await auth.refresh(first.refreshToken);
    const rows = await db.prisma.refreshToken.findMany({
      where: { user: { email: `renew${String(n)}@example.com` } },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.revokedAt).not.toBeNull();
    expect(rows[0]?.rotatedAt).not.toBeNull();
    expect(rows[1]?.revokedAt).toBeNull();
  });

  it('the old token works again within the grace period, leaving the newer one alive', async () => {
    const first = await signup();
    const second = await auth.refresh(first.refreshToken);
    after(10);
    await expect(auth.refresh(first.refreshToken)).resolves.toBeDefined();
    await expect(auth.refresh(second.refreshToken)).resolves.toBeDefined();
  });

  it('after the grace period the old token signs everyone out', async () => {
    const first = await signup();
    const second = await auth.refresh(first.refreshToken);
    after(45);
    await expect(auth.refresh(first.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
    await expect(auth.refresh(second.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('signing out everywhere takes away the grace period too', async () => {
    const first = await signup();
    const second = await auth.refresh(first.refreshToken);
    after(40);
    await auth.refresh(second.refreshToken); // second is replaced now: inside its grace
    after(1);
    // A copy of the first token turns up: everyone is signed out...
    await expect(auth.refresh(first.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
    // ...and the just-replaced second token no longer gets its grace.
    await expect(auth.refresh(second.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
    const user = await db.prisma.user.findUnique({
      where: { email: `renew${String(n)}@example.com` },
      select: { id: true },
    });
    expect(
      await db.prisma.refreshToken.count({ where: { userId: user?.id, rotatedAt: { not: null } } }),
    ).toBe(0);
  });

  it('two renewals with the same token at the same moment both succeed', async () => {
    const first = await signup();
    const results = await Promise.allSettled([
      auth.refresh(first.refreshToken),
      auth.refresh(first.refreshToken),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
  });

  it('a token ended by logging out gets no grace', async () => {
    const first = await signup();
    await auth.logout(first.refreshToken);
    await expect(auth.refresh(first.refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });
});
