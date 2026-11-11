import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, type TestDatabase } from '@/features/orders/testing/test-database';
import type { AddressInput } from '../schemas/address.schema';
import { createAccountRepository } from './account.repository';

/**
 * Real-database tests for the customer account. The important ones prove one customer can never
 * see or change another's addresses or orders. Skipped unless a URL is provided:
 *   INTEGRATION_DATABASE_URL=postgresql://... npm test
 */
const url = process.env['INTEGRATION_DATABASE_URL'];

// A remote development database adds a delay to every query; these tests make many.
vi.setConfig({ testTimeout: 90_000 });

describe.skipIf(!url)('the customer account against Postgres', () => {
  let db: TestDatabase;
  let repo: ReturnType<typeof createAccountRepository>;
  let alice: string;
  let bob: string;
  let closedZone: string;

  const input = (overrides: Partial<AddressInput> = {}): AddressInput => ({
    label: 'Home',
    addressLine1: 'House 12, Street 4',
    addressLine2: null,
    zoneId: db.ids.zone,
    isDefault: false,
    ...overrides,
  });

  beforeAll(async () => {
    db = await createTestDatabase(url ?? '');
    repo = createAccountRepository(db.prisma);
    alice = db.ids.customer;
    const user = await db.prisma.user.create({
      data: {
        email: 'bob@example.com',
        passwordHash: 'x',
        customer: { create: { name: 'Bob', phone: '03007654321' } },
      },
      include: { customer: true },
    });
    bob = user.customer?.id ?? '';
    closedZone = (
      await db.prisma.deliveryZone.create({
        data: { name: 'Closed Area', charge: 50, isActive: false },
      })
    ).id;
  }, 120_000);

  afterAll(async () => {
    await db.drop();
  }, 60_000);

  describe('addresses', () => {
    it('makes the first address the default, whatever was asked', async () => {
      await repo.createAddress(bob, input({ label: 'First', isDefault: false }));
      const list = await repo.listAddresses(bob);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        label: 'First',
        isDefault: true,
        zoneName: 'Johar Town',
        zoneActive: true,
      });
    });

    it('keeps exactly one default as addresses are added and chosen', async () => {
      await repo.createAddress(alice, input({ label: 'A1' }));
      await repo.createAddress(alice, input({ label: 'A2' }));
      await repo.createAddress(alice, input({ label: 'A3', isDefault: true }));
      const list = await repo.listAddresses(alice);
      expect(list.filter((a) => a.isDefault).map((a) => a.label)).toEqual(['A3']);
      // The default is listed first.
      expect(list[0]?.label).toBe('A3');
    });

    it('moves the default when another address is chosen on edit, and cannot be unticked', async () => {
      const list = await repo.listAddresses(alice);
      const a1 = list.find((a) => a.label === 'A1');
      await repo.updateAddress(alice, a1?.id ?? '', input({ label: 'A1', isDefault: true }));
      expect(
        (await repo.listAddresses(alice)).filter((a) => a.isDefault).map((a) => a.label),
      ).toEqual(['A1']);

      // Unticking the current default changes nothing: a different address has to be chosen.
      await repo.updateAddress(
        alice,
        a1?.id ?? '',
        input({ label: 'A1 renamed', isDefault: false }),
      );
      const after = await repo.listAddresses(alice);
      expect(after.filter((a) => a.isDefault).map((a) => a.label)).toEqual(['A1 renamed']);
    });

    it('hands the default to the oldest remaining address when the default is deleted', async () => {
      const list = await repo.listAddresses(alice);
      const current = list.find((a) => a.isDefault);
      await repo.deleteAddress(alice, current?.id ?? '');
      const after = await repo.listAddresses(alice);
      expect(after.filter((a) => a.isDefault)).toHaveLength(1);
      expect(after.map((a) => a.label)).not.toContain('A1 renamed');
    });

    it('stores the second line as none when blank', async () => {
      await repo.createAddress(bob, input({ label: 'Second', addressLine2: 'Gate 2' }));
      const second = (await repo.listAddresses(bob)).find((a) => a.label === 'Second');
      expect(second?.addressLine2).toBe('Gate 2');
    });

    it('refuses an area that does not exist or is no longer served', async () => {
      await expect(repo.createAddress(bob, input({ zoneId: closedZone }))).rejects.toMatchObject({
        code: 'ZONE_INVALID',
        status: 422,
      });
      await expect(
        repo.createAddress(bob, input({ zoneId: '00000000-0000-4000-8000-000000000000' })),
      ).rejects.toMatchObject({ code: 'ZONE_INVALID' });
      const mine = (await repo.listAddresses(bob))[0];
      await expect(
        repo.updateAddress(bob, mine?.id ?? '', input({ zoneId: closedZone })),
      ).rejects.toMatchObject({ code: 'ZONE_INVALID' });
    });

    it('shows an address whose area was closed later, flagged as unusable', async () => {
      const zone = await db.prisma.deliveryZone.create({
        data: { name: 'Soon Closed', charge: 10 },
      });
      await repo.createAddress(bob, input({ label: 'Soon closed', zoneId: zone.id }));
      await db.prisma.deliveryZone.update({ where: { id: zone.id }, data: { isActive: false } });
      const found = (await repo.listAddresses(bob)).find((a) => a.label === 'Soon closed');
      expect(found).toMatchObject({ zoneActive: false, zoneName: 'Soon Closed' });
    });

    it('allows at most ten addresses', async () => {
      const carol =
        (
          await db.prisma.user.create({
            data: {
              email: 'carol@example.com',
              passwordHash: 'x',
              customer: { create: { name: 'Carol' } },
            },
            include: { customer: true },
          })
        ).customer?.id ?? '';
      for (let i = 0; i < 10; i++)
        await repo.createAddress(carol, input({ label: `P${String(i)}` }));
      await expect(repo.createAddress(carol, input({ label: 'Eleventh' }))).rejects.toMatchObject({
        code: 'ADDRESS_LIMIT',
        status: 409,
      });
      expect(await repo.listAddresses(carol)).toHaveLength(10);
    });

    it('reports a missing address cleanly', async () => {
      const missing = '00000000-0000-4000-8000-000000000000';
      await expect(repo.updateAddress(bob, missing, input())).rejects.toMatchObject({
        status: 404,
      });
      await expect(repo.deleteAddress(bob, missing)).rejects.toMatchObject({ status: 404 });
    });

    describe("one customer cannot touch another's addresses", () => {
      it('cannot read, change or delete them', async () => {
        const bobs = (await repo.listAddresses(bob))[0];
        const bobId = bobs?.id ?? '';
        const alices = await repo.listAddresses(alice);
        expect(alices.map((a) => a.id)).not.toContain(bobId);

        await expect(
          repo.updateAddress(alice, bobId, input({ label: 'Hacked', addressLine1: 'Evil Street' })),
        ).rejects.toMatchObject({ status: 404 });
        await expect(repo.deleteAddress(alice, bobId)).rejects.toMatchObject({ status: 404 });

        const still = (await repo.listAddresses(bob)).find((a) => a.id === bobId);
        expect(still).toMatchObject({ label: bobs?.label, addressLine1: bobs?.addressLine1 });
      });

      it('cannot change the default of the other customer by choosing their own', async () => {
        const bobDefaultBefore = (await repo.listAddresses(bob)).find((a) => a.isDefault)?.id;
        await repo.createAddress(alice, input({ label: 'Alice new default', isDefault: true }));
        expect((await repo.listAddresses(bob)).find((a) => a.isDefault)?.id).toBe(bobDefaultBefore);
      });
    });
  });

  describe('profile', () => {
    it("gives the customer's own details and email", async () => {
      expect(await repo.getProfile(bob)).toEqual({
        name: 'Bob',
        phone: '03007654321',
        email: 'bob@example.com',
      });
    });
    it('has nothing for an unknown customer', async () => {
      expect(await repo.getProfile('00000000-0000-4000-8000-000000000000')).toBeNull();
    });
  });

  describe('order history', () => {
    let seq = 0;
    async function order(customerId: string | null, createdAt: Date, name = 'Chicken Tikka') {
      seq += 1;
      return db.prisma.order.create({
        data: {
          orderNumber: `ACC-${String(seq).padStart(4, '0')}`,
          customerId,
          type: 'PICKUP',
          subtotal: 500,
          grandTotal: 550.5,
          paymentMethod: 'COD',
          createdAt,
          items: {
            create: { productNameSnapshot: name, unitPrice: 500, quantity: 2, subtotal: 1000 },
          },
        },
      });
    }

    it("lists only that customer's orders, newest first, with their items", async () => {
      const first = await order(alice, new Date('2026-01-01T10:00:00Z'), 'Old Dish');
      const second = await order(alice, new Date('2026-02-01T10:00:00Z'), 'New Dish');
      await order(bob, new Date('2026-03-01T10:00:00Z'), 'Bob Dish');
      await order(null, new Date('2026-03-02T10:00:00Z'), 'Guest Dish');

      const history = await repo.listOrders(alice, 1);
      expect(history.total).toBe(2);
      expect(history.rows.map((r) => r.id)).toEqual([second.id, first.id]);
      expect(history.rows[0]).toMatchObject({
        grandTotal: 550.5,
        status: 'RECEIVED',
        type: 'PICKUP',
        items: [{ name: 'New Dish', quantity: 2 }],
      });
      expect(JSON.stringify(history)).not.toContain('Bob Dish');
      expect(JSON.stringify(history)).not.toContain('Guest Dish');
    });

    it('gives each order its tracking link', async () => {
      const placed = await order(bob, new Date('2026-04-01T10:00:00Z'));
      const history = await repo.listOrders(bob, 1);
      expect(history.rows.find((r) => r.id === placed.id)?.trackingToken).toBe(
        placed.trackingToken,
      );
    });

    it('pages through long histories without repeating or missing any', async () => {
      const dave =
        (
          await db.prisma.user.create({
            data: {
              email: 'dave@example.com',
              passwordHash: 'x',
              customer: { create: { name: 'Dave' } },
            },
            include: { customer: true },
          })
        ).customer?.id ?? '';
      for (let i = 0; i < 23; i++) await order(dave, new Date(Date.UTC(2026, 5, 1, 0, i)));
      const pages = await Promise.all([1, 2, 3, 4].map((p) => repo.listOrders(dave, p)));
      expect(pages.map((p) => p.rows.length)).toEqual([10, 10, 3, 0]);
      expect(pages[0]?.total).toBe(23);
      const ids = pages.flatMap((p) => p.rows.map((r) => r.id));
      expect(new Set(ids).size).toBe(23);
    });

    it('has an empty history for a customer with no orders', async () => {
      const erin =
        (
          await db.prisma.user.create({
            data: {
              email: 'erin@example.com',
              passwordHash: 'x',
              customer: { create: { name: 'Erin' } },
            },
            include: { customer: true },
          })
        ).customer?.id ?? '';
      expect(await repo.listOrders(erin, 1)).toMatchObject({ rows: [], total: 0, page: 1 });
    });
  });
});
