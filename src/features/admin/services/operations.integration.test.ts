import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  toWeekHours,
  parseRestaurantSettings,
} from '@/features/checkout/services/quote-data.mappers';
import { isOpenAt } from '@/features/hours/business-hours';
import { createTestDatabase, type TestDatabase } from '@/features/orders/testing/test-database';
import { verifyPassword } from '@/lib/auth/password';
import { ordersQuerySchema } from '../schemas/operations.schema';
import type { CouponInput, ZoneInput } from '../schemas/operations.schema';
import { createOperationsRepository } from './operations.repository';
import { createAdminOrdersRepository } from './orders.repository';

/**
 * Real-database tests for settings, delivery areas, coupons, team accounts and the admin order
 * search. Private schema, dropped afterwards. Skipped unless a URL is provided:
 *   INTEGRATION_DATABASE_URL=postgresql://... npm test
 */
const url = process.env['INTEGRATION_DATABASE_URL'];

// A remote development database adds a delay to every query; these tests make many.
vi.setConfig({ testTimeout: 90_000 });

const MISSING = '00000000-0000-4000-8000-000000000000';

const zone = (overrides: Partial<ZoneInput> = {}): ZoneInput => ({
  name: 'Gulberg',
  charge: 120,
  freeDeliveryAbove: 2500,
  minOrderAmount: 500,
  isActive: true,
  sortOrder: 4,
  ...overrides,
});

const coupon = (overrides: Partial<CouponInput> = {}): CouponInput => ({
  code: 'WELCOME10',
  type: 'PERCENTAGE',
  amount: 10,
  minimumOrderAmount: 500,
  usageLimit: 50,
  expiresAt: null,
  isActive: true,
  ...overrides,
});

describe.skipIf(!url)('running the restaurant against Postgres', () => {
  let db: TestDatabase;
  let ops: ReturnType<typeof createOperationsRepository>;
  let orders: ReturnType<typeof createAdminOrdersRepository>;

  const admin = { id: 'admin-actor', role: 'ADMIN' as const };
  let adminId: string;
  let superId: string;

  beforeAll(async () => {
    db = await createTestDatabase(url ?? '');
    ops = createOperationsRepository(db.prisma);
    orders = createAdminOrdersRepository(db.prisma);
    adminId = (
      await db.prisma.user.create({
        data: { email: 'admin@example.com', passwordHash: 'x', role: 'ADMIN' },
      })
    ).id;
    superId = (
      await db.prisma.user.create({
        data: { email: 'root@example.com', passwordHash: 'x', role: 'SUPER_ADMIN' },
      })
    ).id;
  }, 120_000);

  afterAll(async () => {
    await db.drop();
  }, 60_000);

  describe('settings and opening hours', () => {
    const week = (override: (day: number) => object = () => ({})) =>
      Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek,
        isClosed: false,
        openTime: '18:00',
        closeTime: '02:00',
        ...override(dayOfWeek),
      }));

    it('reads the seeded settings and fills in all seven days', async () => {
      const settings = await ops.getSettings();
      expect(settings.restaurant).toMatchObject({ taxRatePercent: 0, orderingEnabled: true });
      expect(settings.hours).toHaveLength(7);
      expect(settings.hours[0]).toMatchObject({ openTime: '18:00', closeTime: '02:00' });
    });

    it('saves settings and the customer-facing pricing sees them', async () => {
      await ops.saveSettings({
        restaurant: {
          name: 'BBQ Store',
          address: 'Township',
          taxRatePercent: 16,
          orderingEnabled: false,
        },
        hours: week(),
      });
      const saved = await ops.getSettings();
      expect(saved.restaurant).toEqual({
        name: 'BBQ Store',
        address: 'Township',
        taxRatePercent: 16,
        orderingEnabled: false,
      });

      // What the checkout reads is exactly what the owner saved.
      const raw = await db.prisma.setting.findUnique({ where: { key: 'restaurant' } });
      expect(parseRestaurantSettings(raw?.value)).toEqual({
        taxRatePercent: 16,
        orderingEnabled: false,
      });

      await ops.saveSettings({
        restaurant: { name: 'BBQ Store', address: null, taxRatePercent: 0, orderingEnabled: true },
        hours: week(),
      });
    });

    it('keeps settings this screen does not manage', async () => {
      await db.prisma.setting.update({
        where: { key: 'restaurant' },
        data: {
          value: { name: 'X', timezone: 'Asia/Karachi', taxRatePercent: 0, orderingEnabled: true },
        },
      });
      await ops.saveSettings({
        restaurant: { name: 'Y', address: null, taxRatePercent: 5, orderingEnabled: true },
        hours: week(),
      });
      const raw = await db.prisma.setting.findUnique({ where: { key: 'restaurant' } });
      expect(raw?.value).toMatchObject({ timezone: 'Asia/Karachi', name: 'Y', taxRatePercent: 5 });
    });

    it('closing a day changes whether the restaurant is open that evening', async () => {
      // 17 Oct 2026 is a Saturday; 9 PM Karachi.
      const saturdayNight = new Date('2026-10-17T16:00:00Z');
      const sundayEarly = new Date('2026-10-17T20:00:00Z'); // 1 AM Sunday, still Saturday's shift
      const load = async () => toWeekHours(await db.prisma.businessHour.findMany());

      await ops.saveSettings({
        restaurant: { name: 'BBQ Store', address: null, taxRatePercent: 0, orderingEnabled: true },
        hours: week(),
      });
      expect(isOpenAt(await load(), saturdayNight)).toBe(true);
      expect(isOpenAt(await load(), sundayEarly)).toBe(true);

      await ops.saveSettings({
        restaurant: { name: 'BBQ Store', address: null, taxRatePercent: 0, orderingEnabled: true },
        hours: week((day) =>
          day === 6 ? { isClosed: true, openTime: '18:00', closeTime: '02:00' } : {},
        ),
      });
      expect(isOpenAt(await load(), saturdayNight)).toBe(false);
      // The closed day's times are cleared, not left behind to confuse later.
      const saturday = (await ops.getSettings()).hours[6];
      expect(saturday).toMatchObject({ isClosed: true, openTime: null, closeTime: null });
      expect(isOpenAt(await load(), sundayEarly)).toBe(false);

      await ops.saveSettings({
        restaurant: { name: 'BBQ Store', address: null, taxRatePercent: 0, orderingEnabled: true },
        hours: week(),
      });
    });

    it('supports a daytime schedule as well as a late-night one', async () => {
      await ops.saveSettings({
        restaurant: { name: 'BBQ Store', address: null, taxRatePercent: 0, orderingEnabled: true },
        hours: week(() => ({ openTime: '11:00', closeTime: '23:00' })),
      });
      const hours = toWeekHours(await db.prisma.businessHour.findMany());
      expect(isOpenAt(hours, new Date('2026-10-17T09:00:00Z'))).toBe(true); // 2 PM
      expect(isOpenAt(hours, new Date('2026-10-17T20:00:00Z'))).toBe(false); // 1 AM
      await ops.saveSettings({
        restaurant: { name: 'BBQ Store', address: null, taxRatePercent: 0, orderingEnabled: true },
        hours: week(),
      });
    });
  });

  describe('delivery areas', () => {
    it('creates, edits and lists areas in order', async () => {
      const id = await ops.createZone(zone());
      await ops.updateZone(id, zone({ charge: 150, name: 'Gulberg III' }));
      const listed = (await ops.listZones()).find((z) => z.id === id);
      expect(listed).toMatchObject({ name: 'Gulberg III', charge: 150, freeDeliveryAbove: 2500 });

      const orderedSortOrders = (await ops.listZones()).map((z) => z.sortOrder);
      expect(orderedSortOrders).toEqual([...orderedSortOrders].sort((a, b) => a - b));
    });

    it('stores "no free-delivery threshold" as null', async () => {
      const id = await ops.createZone(zone({ name: 'Always charged', freeDeliveryAbove: null }));
      expect((await ops.listZones()).find((z) => z.id === id)?.freeDeliveryAbove).toBeNull();
    });

    it('deletes an unused area but switches off one with saved addresses', async () => {
      const unused = await ops.createZone(zone({ name: 'Unused' }));
      expect(await ops.removeZone(unused)).toBe('deleted');

      const used = await ops.createZone(zone({ name: 'Used' }));
      await db.prisma.address.create({
        data: { customerId: db.ids.customer, addressLine1: 'House 1', zoneId: used },
      });
      expect(await ops.removeZone(used)).toBe('archived');
      expect((await ops.listZones()).find((z) => z.id === used)?.isActive).toBe(false);
    });

    it('reports a missing area cleanly', async () => {
      await expect(ops.updateZone(MISSING, zone())).rejects.toMatchObject({ status: 404 });
      await expect(ops.removeZone(MISSING)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('coupons', () => {
    it('creates and edits a coupon', async () => {
      const id = await ops.createCoupon(coupon());
      await ops.updateCoupon(id, coupon({ amount: 15, usageLimit: null }));
      const listed = (await ops.listCoupons()).find((c) => c.id === id);
      expect(listed).toMatchObject({
        code: 'WELCOME10',
        amount: 15,
        usageLimit: null,
        usedCount: 0,
        type: 'PERCENTAGE',
      });
    });

    it('stores an expiry time', async () => {
      const expiresAt = '2027-01-01T18:59:00.000Z';
      const id = await ops.createCoupon(coupon({ code: 'EXPIRES', expiresAt }));
      expect((await ops.listCoupons()).find((c) => c.id === id)?.expiresAt).toBe(expiresAt);
    });

    it('refuses a duplicate code, on create and on edit', async () => {
      await expect(ops.createCoupon(coupon())).rejects.toMatchObject({
        code: 'COUPON_CODE_TAKEN',
        status: 409,
      });
      const other = await ops.createCoupon(coupon({ code: 'OTHERCODE' }));
      await expect(ops.updateCoupon(other, coupon({ code: 'WELCOME10' }))).rejects.toMatchObject({
        code: 'COUPON_CODE_TAKEN',
      });
    });

    it('deletes an unused coupon and switches off a used one', async () => {
      const unused = await ops.createCoupon(coupon({ code: 'UNUSEDONE' }));
      expect(await ops.removeCoupon(unused)).toBe('deleted');

      const used = await ops.createCoupon(coupon({ code: 'USEDONE' }));
      await db.prisma.coupon.update({ where: { id: used }, data: { usedCount: 2 } });
      expect(await ops.removeCoupon(used)).toBe('archived');
      expect((await ops.listCoupons()).find((c) => c.id === used)?.isActive).toBe(false);
    });

    it('reports a missing coupon cleanly', async () => {
      await expect(ops.updateCoupon(MISSING, coupon())).rejects.toMatchObject({ status: 404 });
      await expect(ops.removeCoupon(MISSING)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('team accounts', () => {
    it('lists only staff and admins, never customers', async () => {
      const team = await ops.listTeam();
      expect(team.some((m) => m.email === 'customer@example.com')).toBe(false);
      expect(team.map((m) => m.email)).toEqual(
        expect.arrayContaining(['admin@example.com', 'root@example.com']),
      );
    });

    it('creates store staff with a hashed password they can use', async () => {
      const id = await ops.createMember(admin, {
        email: 'cook@example.com',
        role: 'STORE_STAFF',
        password: 'kitchen-pass-1',
      });
      const user = await db.prisma.user.findUnique({ where: { id } });
      expect(user).toMatchObject({ role: 'STORE_STAFF', isActive: true });
      expect(user?.passwordHash).not.toContain('kitchen-pass-1');
      expect(await verifyPassword('kitchen-pass-1', user?.passwordHash ?? '')).toBe(true);
    });

    it('refuses a second account with the same email', async () => {
      await expect(
        ops.createMember(admin, {
          email: 'cook@example.com',
          role: 'STORE_STAFF',
          password: 'another-pass-1',
        }),
      ).rejects.toMatchObject({ code: 'EMAIL_TAKEN', status: 409 });
    });

    it('lets only a super admin create another admin', async () => {
      await expect(
        ops.createMember(
          { id: adminId, role: 'ADMIN' },
          { email: 'sneaky@example.com', role: 'ADMIN', password: 'sneaky-pass-1' },
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(
        await db.prisma.user.findUnique({ where: { email: 'sneaky@example.com' } }),
      ).toBeNull();

      const id = await ops.createMember(
        { id: superId, role: 'SUPER_ADMIN' },
        { email: 'boss2@example.com', role: 'ADMIN', password: 'boss-pass-123' },
      );
      expect((await db.prisma.user.findUnique({ where: { id } }))?.role).toBe('ADMIN');
    });

    async function newStaff(email: string) {
      const id = await ops.createMember(admin, {
        email,
        role: 'STORE_STAFF',
        password: 'initial-pass-1',
      });
      const token = await db.prisma.refreshToken.create({
        data: {
          userId: id,
          tokenHash: `hash-${email}`,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      return { id, token };
    }

    it('switching someone off also ends their open sessions', async () => {
      const { id, token } = await newStaff('leaver@example.com');
      await ops.updateMember({ id: adminId, role: 'ADMIN' }, id, { isActive: false });

      expect((await db.prisma.user.findUnique({ where: { id } }))?.isActive).toBe(false);
      expect(
        (await db.prisma.refreshToken.findUnique({ where: { id: token.id } }))?.revokedAt,
      ).not.toBeNull();

      await ops.updateMember({ id: adminId, role: 'ADMIN' }, id, { isActive: true });
      expect((await db.prisma.user.findUnique({ where: { id } }))?.isActive).toBe(true);
    });

    it('resetting a password changes it and ends open sessions', async () => {
      const { id, token } = await newStaff('forgetful@example.com');
      await ops.updateMember({ id: adminId, role: 'ADMIN' }, id, { password: 'brand-new-pass-9' });

      const user = await db.prisma.user.findUnique({ where: { id } });
      expect(await verifyPassword('brand-new-pass-9', user?.passwordHash ?? '')).toBe(true);
      expect(await verifyPassword('initial-pass-1', user?.passwordHash ?? '')).toBe(false);
      expect(
        (await db.prisma.refreshToken.findUnique({ where: { id: token.id } }))?.revokedAt,
      ).not.toBeNull();
    });

    it('a role change alone leaves sessions alone', async () => {
      const { id, token } = await newStaff('stays@example.com');
      await ops.updateMember({ id: superId, role: 'SUPER_ADMIN' }, id, { role: 'ADMIN' });
      expect((await db.prisma.user.findUnique({ where: { id } }))?.role).toBe('ADMIN');
      expect(
        (await db.prisma.refreshToken.findUnique({ where: { id: token.id } }))?.revokedAt,
      ).toBeNull();
    });

    it('stops people changing themselves, other admins, super admins and customers', async () => {
      await expect(
        ops.updateMember({ id: adminId, role: 'ADMIN' }, adminId, { isActive: false }),
      ).rejects.toMatchObject({ code: 'TEAM_SELF', status: 403 });

      // One admin cannot touch another admin.
      const otherAdmin = await ops.createMember(
        { id: superId, role: 'SUPER_ADMIN' },
        { email: 'peer@example.com', role: 'ADMIN', password: 'peer-pass-1234' },
      );
      await expect(
        ops.updateMember({ id: adminId, role: 'ADMIN' }, otherAdmin, { isActive: false }),
      ).rejects.toMatchObject({ status: 403 });
      expect((await db.prisma.user.findUnique({ where: { id: otherAdmin } }))?.isActive).toBe(true);

      // Nobody can touch a super admin through this screen.
      await expect(
        ops.updateMember({ id: adminId, role: 'ADMIN' }, superId, { isActive: false }),
      ).rejects.toMatchObject({ status: 403 });

      // Customers do not exist as far as this screen is concerned.
      const customer = await db.prisma.user.findUnique({
        where: { email: 'customer@example.com' },
      });
      await expect(
        ops.updateMember({ id: adminId, role: 'ADMIN' }, customer?.id ?? '', { isActive: false }),
      ).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND', status: 404 });
      expect((await db.prisma.user.findUnique({ where: { id: customer?.id } }))?.isActive).toBe(
        true,
      );
    });

    it('refuses to make someone an admin unless the caller is a super admin', async () => {
      const { id } = await newStaff('promote-me@example.com');
      await expect(
        ops.updateMember({ id: adminId, role: 'ADMIN' }, id, { role: 'ADMIN' }),
      ).rejects.toMatchObject({ status: 403 });
      expect((await db.prisma.user.findUnique({ where: { id } }))?.role).toBe('STORE_STAFF');
    });

    it('reports a missing account cleanly', async () => {
      await expect(
        ops.updateMember({ id: adminId, role: 'ADMIN' }, MISSING, { isActive: false }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('orders: search, detail and dashboard', () => {
    let seq = 0;
    async function order(
      overrides: {
        status?: 'RECEIVED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
        type?: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
        name?: string;
        phone?: string;
        total?: number;
        createdAt?: Date;
      } = {},
    ) {
      seq += 1;
      return db.prisma.order.create({
        data: {
          orderNumber: `BBQ-2026-${String(9000 + seq)}`,
          type: overrides.type ?? 'PICKUP',
          status: overrides.status ?? 'RECEIVED',
          guestName: overrides.name ?? 'Walk In',
          guestPhone: overrides.phone ?? '03000000000',
          subtotal: overrides.total ?? 500,
          grandTotal: overrides.total ?? 500,
          paymentMethod: 'COD',
          createdAt: overrides.createdAt ?? new Date(),
        },
      });
    }
    const search = (input: Record<string, string> = {}) =>
      orders.search(ordersQuerySchema.parse(input));

    it('finds orders by number, name and phone (digits only), ignoring case', async () => {
      const a = await order({ name: 'Zubair Khan', phone: '03217654321' });
      await order({ name: 'Someone Else', phone: '03001111111' });

      expect((await search({ q: a.orderNumber.toLowerCase() })).rows.map((r) => r.id)).toEqual([
        a.id,
      ]);
      expect((await search({ q: 'zUBAIR' })).rows.map((r) => r.id)).toEqual([a.id]);
      expect((await search({ q: '0321-765' })).rows.map((r) => r.id)).toEqual([a.id]);
      expect((await search({ q: 'nobody-here' })).rows).toEqual([]);
    });

    it('treats search text as text, not as a query', async () => {
      await order({ name: "Robert'); DROP TABLE orders;--" });
      const result = await search({ q: "'); DROP TABLE orders;--" });
      expect(result.rows).toHaveLength(1);
      expect(await db.prisma.order.count()).toBeGreaterThan(0);
    });

    it('filters by status, type and date, and pages through results', async () => {
      const day = new Date('2026-03-10T15:00:00Z');
      await order({ status: 'COMPLETED', type: 'DELIVERY', createdAt: day });
      await order({ status: 'CANCELLED', type: 'DINE_IN', createdAt: day });

      const completed = await search({ status: 'COMPLETED', from: '2026-03-10', to: '2026-03-10' });
      expect(completed.rows).toHaveLength(1);
      expect(completed.rows[0]).toMatchObject({ status: 'COMPLETED', type: 'DELIVERY' });
      expect((await search({ type: 'DINE_IN', from: '2026-03-10', to: '2026-03-10' })).total).toBe(
        1,
      );
      expect(
        (await search({ from: '2026-03-11' })).rows.some((r) =>
          r.createdAt.startsWith('2026-03-10'),
        ),
      ).toBe(false);

      for (let i = 0; i < 27; i++) await order({ createdAt: new Date('2026-04-01T15:00:00Z') });
      const first = await search({ from: '2026-04-01', to: '2026-04-01' });
      const second = await search({ from: '2026-04-01', to: '2026-04-01', page: '2' });
      expect(first.total).toBe(27);
      expect(first.rows).toHaveLength(25);
      expect(second.rows).toHaveLength(2);
      const ids = new Set([...first.rows, ...second.rows].map((r) => r.id));
      expect(ids.size).toBe(27);
    });

    it('lists newest orders first', async () => {
      const result = await search();
      const times = result.rows.map((r) => r.createdAt);
      expect(times).toEqual([...times].sort().reverse());
    });

    it('shows an order with its items, address and who changed its status', async () => {
      const placed = await db.prisma.order.create({
        data: {
          orderNumber: 'BBQ-2026-DETAIL',
          type: 'DELIVERY',
          guestName: 'Detail Customer',
          guestPhone: '03001234567',
          guestEmail: 'detail@example.com',
          deliveryAddressSnapshot: { line1: 'House 5', line2: 'Near park', area: 'Johar Town' },
          specialInstructions: 'Ring twice',
          subtotal: 1100,
          deliveryCharge: 100,
          grandTotal: 1200,
          paymentMethod: 'COD',
          items: {
            create: {
              productId: db.ids.tikka,
              productNameSnapshot: 'Chicken Tikka',
              variantSnapshot: [{ group: 'Portion', name: 'Half' }],
              unitPrice: 550,
              quantity: 2,
              subtotal: 1100,
              note: 'less spicy',
            },
          },
          statusHistory: {
            create: [{ status: 'RECEIVED' }],
          },
        },
      });
      await db.prisma.orderStatusHistory.create({
        data: {
          orderId: placed.id,
          fromStatus: 'RECEIVED',
          status: 'CONFIRMED',
          changedByUserId: adminId,
          note: 'ok',
        },
      });

      const detail = await orders.get(placed.id);
      expect(detail).toMatchObject({
        orderNumber: 'BBQ-2026-DETAIL',
        customerName: 'Detail Customer',
        email: 'detail@example.com',
        instructions: 'Ring twice',
        grandTotal: 1200,
        deliveryCharge: 100,
        address: { line1: 'House 5', line2: 'Near park', area: 'Johar Town' },
      });
      expect(detail?.items[0]).toMatchObject({
        name: 'Chicken Tikka',
        quantity: 2,
        unitPrice: 550,
        note: 'less spicy',
      });
      expect(detail?.items[0]?.options).toEqual(['Half']);
      expect(detail?.history.map((h) => [h.status, h.by])).toEqual([
        ['RECEIVED', null],
        ['CONFIRMED', 'admin@example.com'],
      ]);
    });

    it('returns null for an unknown order', async () => {
      expect(await orders.get(MISSING)).toBeNull();
    });

    it('counts today by the noon-to-noon business day and leaves cancelled orders out of revenue', async () => {
      // 1 AM Karachi on 21 Oct: the business day began at noon on 20 Oct.
      const now = new Date('2026-10-20T20:00:00Z');
      const before = await orders.dashboard(now);

      await order({ total: 1000, createdAt: new Date('2026-10-20T14:00:00Z') }); // 7 PM on the 20th
      await order({ total: 500, status: 'COMPLETED', createdAt: new Date('2026-10-20T19:30:00Z') }); // 12:30 AM
      await order({ total: 300, status: 'CANCELLED', createdAt: new Date('2026-10-20T15:00:00Z') });
      await order({ total: 9999, createdAt: new Date('2026-10-20T06:00:00Z') }); // 11 AM: yesterday's day

      const after = await orders.dashboard(now);
      expect(after.ordersToday - before.ordersToday).toBe(3);
      expect(after.cancelledToday - before.cancelledToday).toBe(1);
      expect(after.revenueToday - before.revenueToday).toBe(1500);
      // Orders still in progress are counted whatever day they came in; finished ones are not.
      expect(after.activeOrders - before.activeOrders).toBe(2);
      expect(after.since).toBe('2026-10-20T07:00:00.000Z');
    });

    it('flags products that are hidden from customers because they are sold out', async () => {
      const before = (await orders.dashboard(new Date())).unavailableProducts;
      await db.prisma.product.update({ where: { id: db.ids.naan }, data: { isAvailable: false } });
      expect((await orders.dashboard(new Date())).unavailableProducts).toBe(before + 1);
      await db.prisma.product.update({ where: { id: db.ids.naan }, data: { isAvailable: true } });
    });
  });
});
