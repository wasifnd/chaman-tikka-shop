import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, type TestDatabase } from '@/features/orders/testing/test-database';
import { resolveRange } from '../logic/analytics-range';
import { createAnalyticsRepository } from './analytics.repository';

/**
 * Real-database tests for the sales figures: orders are written the way checkout writes them and
 * read back through the dashboard's own query. Skipped unless a URL is provided:
 *   INTEGRATION_DATABASE_URL=postgresql://... npm test
 */
const url = process.env['INTEGRATION_DATABASE_URL'];

// A remote development database adds a delay to every query; these tests make many.
vi.setConfig({ testTimeout: 90_000 });

// 9 PM in Karachi on Saturday 17 October 2026.
const NOW = new Date('2026-10-17T16:00:00Z');

describe.skipIf(!url)('sales figures against Postgres', () => {
  let db: TestDatabase;
  let repo: ReturnType<typeof createAnalyticsRepository>;
  let seq = 0;

  async function order(
    at: string,
    overrides: {
      status?: 'RECEIVED' | 'COMPLETED' | 'CANCELLED';
      type?: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
      total?: number;
      discount?: number;
      delivery?: number;
      customer?: boolean;
      name?: string;
      items?: { name: string; quantity: number; subtotal: number }[];
      coupon?: string;
    } = {},
  ) {
    seq += 1;
    const total = overrides.total ?? 500;
    const couponId = overrides.coupon
      ? (
          await db.prisma.coupon.create({
            data: { code: overrides.coupon, amount: 10, type: 'FIXED' },
          })
        ).id
      : undefined;
    return db.prisma.order.create({
      data: {
        orderNumber: `AN-${String(seq).padStart(4, '0')}`,
        createdAt: new Date(at),
        status: overrides.status ?? 'COMPLETED',
        type: overrides.type ?? 'PICKUP',
        guestName: overrides.name ?? 'Walk In',
        guestPhone: '03001234567',
        subtotal: total,
        couponDiscount: overrides.discount ?? 0,
        deliveryCharge: overrides.delivery ?? 0,
        grandTotal: total,
        paymentMethod: 'COD',
        ...(overrides.customer ? { customerId: db.ids.customer } : {}),
        ...(couponId ? { couponId } : {}),
        items: {
          create: (
            overrides.items ?? [{ name: 'Chicken Tikka', quantity: 1, subtotal: total }]
          ).map((item) => ({
            productNameSnapshot: item.name,
            quantity: item.quantity,
            unitPrice: item.subtotal / item.quantity,
            subtotal: item.subtotal,
          })),
        },
      },
    });
  }

  beforeAll(async () => {
    db = await createTestDatabase(url ?? '');
    repo = createAnalyticsRepository(db.prisma);

    // This week (7 days to 17 Oct).
    await order('2026-10-17T16:00:00Z', {
      total: 1000,
      discount: 100,
      delivery: 100,
      type: 'DELIVERY',
      customer: true,
      coupon: 'SAVE',
      items: [
        { name: 'Chicken Tikka', quantity: 2, subtotal: 700 },
        { name: 'Naan', quantity: 10, subtotal: 300 },
      ],
    });
    await order('2026-10-17T20:00:00Z', { total: 500, name: '=EVIL()' }); // 1 AM on the 18th: still the 17th
    await order('2026-10-16T15:00:00Z', {
      total: 250.5,
      type: 'DINE_IN',
      items: [{ name: 'Naan', quantity: 5, subtotal: 250.5 }],
    });
    await order('2026-10-16T16:00:00Z', { total: 9999, status: 'CANCELLED' });
    await order('2026-10-12T17:00:00Z', { total: 300, status: 'RECEIVED' });
    // The week before (4 to 10 Oct).
    await order('2026-10-06T16:00:00Z', { total: 400 });
    // Outside both.
    await order('2026-09-01T16:00:00Z', { total: 77777 });
  }, 120_000);

  afterAll(async () => {
    await db.drop();
  }, 60_000);

  const week = resolveRange({ preset: '7d' }, NOW);

  it('adds up the week and the week before', async () => {
    const { current, previous } = await repo.report(week);
    expect(current.summary).toMatchObject({
      orders: 4,
      revenue: 2050.5,
      cancelled: 1,
      discounts: 100,
      deliveryFees: 100,
      registeredOrders: 1,
      guestOrders: 3,
      itemsSold: 2 + 10 + 1 + 5 + 1,
    });
    expect(current.summary.averageOrder).toBe(512.63); // 2050.5 / 4, rounded to the paisa
    expect(previous.summary).toMatchObject({ orders: 1, revenue: 400 });
  });

  it('files each order under its business day, with the after-midnight one on the evening before', async () => {
    const { current } = await repo.report(week);
    const byDay = Object.fromEntries(current.daily.map((d) => [d.day, [d.orders, d.revenue]]));
    expect(byDay['2026-10-17']).toEqual([2, 1500]);
    expect(byDay['2026-10-16']).toEqual([1, 250.5]);
    expect(byDay['2026-10-12']).toEqual([1, 300]);
    expect(byDay['2026-10-15']).toEqual([0, 0]);
    expect(current.daily).toHaveLength(7);
  });

  it('counts when people ordered, by Karachi hour', async () => {
    const { current } = await repo.report(week);
    expect(current.hours.find((h) => h.hour === 21)?.orders).toBe(1);
    expect(current.hours.find((h) => h.hour === 1)?.orders).toBe(1);
    expect(current.hours.reduce((sum, h) => sum + h.orders, 0)).toBe(4);
  });

  it('splits by type and ranks best sellers', async () => {
    const { current } = await repo.report(week);
    expect(current.byType).toEqual([
      { type: 'DELIVERY', orders: 1, revenue: 1000 },
      { type: 'PICKUP', orders: 2, revenue: 800 },
      { type: 'DINE_IN', orders: 1, revenue: 250.5 },
    ]);
    expect(current.topProducts[0]).toEqual({ name: 'Naan', quantity: 15, revenue: 550.5 });
    expect(current.topProducts[1]).toMatchObject({ name: 'Chicken Tikka', quantity: 4 });
  });

  it('a single day and a custom range work too', async () => {
    const today = await repo.report(resolveRange({ preset: 'today' }, NOW));
    expect(today.current.summary).toMatchObject({ orders: 2, revenue: 1500 });
    const custom = await repo.report(
      resolveRange({ preset: 'custom', from: '2026-10-05', to: '2026-10-07' }, NOW),
    );
    expect(custom.current.summary).toMatchObject({ orders: 1, revenue: 400 });
  });

  it('has quiet, all-zero figures for dates with no orders', async () => {
    const { current } = await repo.report(
      resolveRange({ preset: 'custom', from: '2026-08-01', to: '2026-08-03' }, NOW),
    );
    expect(current.summary.orders).toBe(0);
    expect(current.daily).toHaveLength(3);
  });

  it('lists every item for the items export, not just ten', async () => {
    const many = await order('2026-10-14T16:00:00Z', {
      total: 100,
      items: Array.from({ length: 12 }, (_, i) => ({
        name: `Extra ${String(i).padStart(2, '0')}`,
        quantity: 1,
        subtotal: 10,
      })),
    });
    expect(many.id).toBeTruthy();
    expect((await repo.report(week)).current.topProducts).toHaveLength(10);
    expect((await repo.allProducts(week)).length).toBeGreaterThan(10);
  });

  it('gives the daily series on its own', async () => {
    const days = await repo.dailySeries(week);
    expect(days).toHaveLength(7);
    expect(days.find((d) => d.day === '2026-10-17')?.orders).toBe(2);
  });

  it('exports every order in the range, oldest first, including cancelled ones and the coupon used', async () => {
    const rows = await repo.exportOrders(week);
    const times = rows.map((r) => r.createdAt);
    expect(times).toEqual([...times].sort());
    expect(rows.some((r) => r.status === 'CANCELLED' && r.grandTotal === 9999)).toBe(true);
    expect(rows.some((r) => r.grandTotal === 77777)).toBe(false); // outside the dates
    const coupon = rows.find((r) => r.couponCode === 'SAVE');
    expect(coupon).toMatchObject({
      registered: true,
      type: 'DELIVERY',
      couponDiscount: 100,
      deliveryCharge: 100,
      paymentMethod: 'COD',
    });
    expect(rows.find((r) => r.customerName === '=EVIL()')).toBeDefined();
  });
});
