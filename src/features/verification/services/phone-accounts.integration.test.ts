import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPrismaAuthRepository } from '@/features/auth/services/auth.repository';
import { createAuthService } from '@/features/auth/services/auth.service';
import { createOrderPhoneRepository } from '@/features/orders/services/order-phone';
import { createTestDatabase, type TestDatabase } from '@/features/orders/testing/test-database';
import { createVerificationRepository } from './verification.repository';
import { CODE_TTL_MS, createVerificationService } from './verification.service';

/**
 * Real-database tests for phone accounts: the WhatsApp check, one account per number, and guest
 * orders finding their account. Skipped unless a URL is provided:
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

describe.skipIf(!url)('phone accounts against Postgres', () => {
  let db: TestDatabase;
  let current = new Date();
  const now = () => current;

  beforeAll(async () => {
    db = await createTestDatabase(url ?? '');
  }, 120_000);

  afterAll(async () => {
    await db.drop();
  }, 60_000);

  let orderSeq = 0;
  const guestOrder = (phone: string, proven: boolean, customerId: string | null = null) => {
    orderSeq += 1;
    return db.prisma.order.create({
      data: {
        orderNumber: `BBQ-2026-${String(7000 + orderSeq)}`,
        type: 'PICKUP',
        guestName: 'Guest',
        guestPhone: phone,
        phoneVerifiedAt: proven ? new Date() : null,
        customerId,
        subtotal: 500,
        grandTotal: 500,
        paymentMethod: 'COD',
      },
    });
  };

  describe('the WhatsApp check', () => {
    it('is proven only by the code arriving from the same number, in time', async () => {
      current = new Date();
      const checks = createVerificationService(createVerificationRepository(db.prisma), now);
      const request = await checks.start('03111111111');
      expect(await checks.status(request.id)).toBe('pending');

      // The right code from someone else's phone proves nothing.
      expect(await checks.confirm('03222222222', `BBQ Store code: ${request.code}`)).toBe(false);
      expect(await checks.confirm('03111111111', 'BBQ Store code: 000000x')).toBe(false);
      expect(await checks.status(request.id)).toBe('pending');

      expect(await checks.confirm('03111111111', `BBQ Store code: ${request.code}`)).toBe(true);
      expect(await checks.status(request.id)).toBe('verified');
      expect(await checks.provenAt(request.id, '03111111111')).toEqual(current);
      expect(await checks.provenAt(request.id, '03222222222')).toBeNull();
    });

    it('ignores a code that arrives too late', async () => {
      current = new Date();
      const checks = createVerificationService(createVerificationRepository(db.prisma), now);
      const request = await checks.start('03111111112');
      current = new Date(current.getTime() + CODE_TTL_MS + 1000);
      expect(await checks.confirm('03111111112', request.code)).toBe(false);
      expect(await checks.status(request.id)).toBe('expired');
    });

    it('treats an id that is not ours as unknown', async () => {
      const repo = createVerificationRepository(db.prisma);
      expect(await repo.findById('not-a-uuid')).toBeNull();
      expect(await repo.markVerifiedById('not-a-uuid', new Date())).toBe(false);
      expect(await repo.findById('00000000-0000-4000-8000-000000000000')).toBeNull();
    });
  });

  describe('signing up', () => {
    const auth = () => createAuthService(createPrismaAuthRepository(db.prisma), config);

    it('gives the new account the earlier guest orders proven with its number, and no others', async () => {
      const phone = '03331234567';
      const proven = await guestOrder(phone, true);
      const unproven = await guestOrder(phone, false);
      const otherNumber = await guestOrder('03339999999', true);
      const someoneElses = await guestOrder(phone, true, db.ids.customer);

      const session = await auth().signup(
        { name: 'Sana', phone, password: 'longenough1' },
        new Date(),
      );
      const owner = session.user.customerId;
      const ownerOf = async (id: string) =>
        (await db.prisma.order.findUnique({ where: { id } }))?.customerId ?? null;

      expect(await ownerOf(proven.id)).toBe(owner);
      expect(await ownerOf(unproven.id)).toBeNull();
      expect(await ownerOf(otherNumber.id)).toBeNull();
      expect(await ownerOf(someoneElses.id)).toBe(db.ids.customer);
      const account = await db.prisma.user.findUnique({
        where: { phone },
        select: { email: true, phoneVerifiedAt: true },
      });
      expect(account?.email).toBeNull();
      expect(account?.phoneVerifiedAt).toBeInstanceOf(Date);
    });

    it('allows one account per number, even when two sign-ups race', async () => {
      const repo = createPrismaAuthRepository(db.prisma);
      const input = {
        phone: '03334444444',
        phoneVerifiedAt: new Date(),
        passwordHash: 'x',
        name: 'A',
      };
      const results = await Promise.allSettled([
        repo.createCustomerUser(input),
        repo.createCustomerUser({ ...input, name: 'B' }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((r) => r.status === 'rejected')).toMatchObject({
        reason: { code: 'PHONE_TAKEN', status: 409 },
      });
      await expect(
        auth().signup({ name: 'C', phone: '03334444444', password: 'longenough1' }, new Date()),
      ).rejects.toMatchObject({ code: 'PHONE_TAKEN' });
    });

    it('still keeps emails unique when given, and lets many accounts have none', async () => {
      await auth().signup(
        { name: 'D', phone: '03335555555', email: 'd@example.com', password: 'longenough1' },
        new Date(),
      );
      await expect(
        auth().signup(
          { name: 'E', phone: '03336666666', email: 'd@example.com', password: 'longenough1' },
          new Date(),
        ),
      ).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
      const repo = createPrismaAuthRepository(db.prisma);
      await expect(
        repo.createCustomerUser({
          phone: '03336666667',
          phoneVerifiedAt: new Date(),
          email: 'd@example.com',
          passwordHash: 'x',
          name: 'F',
        }),
      ).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
      // Accounts without an email don't clash with each other.
      expect(await db.prisma.user.count({ where: { email: null } })).toBeGreaterThanOrEqual(2);
    });

    it('logs in by phone number', async () => {
      await auth().signup({ name: 'G', phone: '03337777777', password: 'longenough1' }, new Date());
      const session = await auth().login({ phone: '03337777777', password: 'longenough1' });
      expect(session.user).toMatchObject({ phone: '03337777777', role: 'CUSTOMER' });
      await expect(
        auth().login({ phone: '03337777778', password: 'longenough1' }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });
  });

  describe('finding the account an order belongs to', () => {
    it("finds a customer's account by number, but never a staff account", async () => {
      const repo = createOrderPhoneRepository(db.prisma);
      const customer = await db.prisma.user.create({
        data: {
          phone: '03338888888',
          phoneVerifiedAt: new Date(),
          passwordHash: 'x',
          customer: { create: { name: 'H' } },
        },
        include: { customer: true },
      });
      await db.prisma.user.create({
        data: { phone: '03338888889', passwordHash: 'x', role: 'STORE_STAFF' },
      });

      expect(await repo.customerFor('03338888888')).toBe(customer.customer?.id);
      expect(await repo.customerFor('03338888889')).toBeNull();
      expect(await repo.customerFor('03338888880')).toBeNull();
      const own = await repo.accountPhone(customer.customer?.id ?? '');
      expect(own.phone).toBe('03338888888');
      expect(own.verifiedAt).toBeInstanceOf(Date);
      expect(await repo.accountPhone('00000000-0000-4000-8000-000000000000')).toEqual({
        phone: null,
        verifiedAt: null,
      });
    });
  });
});
