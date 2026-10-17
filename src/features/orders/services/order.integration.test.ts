import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createQuoteLoader } from '@/features/checkout/services/quote.repository';
import { createQuoteService } from '@/features/checkout/services/quote.service';
import { CLOSED_NOW, OPEN_NOW } from '@/features/checkout/testing/fixtures';
import { placeOrderSchema, type PlaceOrderRequest } from '../schemas/place-order.schema';
import { createTestDatabase, type TestDatabase } from '../testing/test-database';
import type { OrderStore } from './order.ports';
import { createOrderService } from './order.service';
import { createPrismaOrderStore } from './order.store';

/**
 * Real-database tests for placing orders: concurrency, idempotency and atomicity.
 *
 * They run in a private schema that is created from the real migrations and dropped afterwards,
 * so they never touch existing data. Skipped unless a database URL is provided:
 *   INTEGRATION_DATABASE_URL=postgresql://... npm test
 */
const url = process.env['INTEGRATION_DATABASE_URL'];

type Rejection = { code: string; status: number };

describe.skipIf(!url)('placing orders against Postgres', () => {
  let db: TestDatabase;
  let store: OrderStore;
  let service: ReturnType<typeof createOrderService>;
  let quoteService: ReturnType<typeof createQuoteService>;

  beforeAll(async () => {
    db = await createTestDatabase(url ?? '');
    store = createPrismaOrderStore(db.prisma, {
      schema: db.schema,
      maxWaitMs: 60_000,
      timeoutMs: 60_000,
    });
    service = createOrderService(store, () => OPEN_NOW);
    quoteService = createQuoteService(createQuoteLoader(db.prisma), () => OPEN_NOW);
  }, 120_000);

  afterAll(async () => {
    await db.drop();
  }, 60_000);

  /** A valid request whose expectedTotal is what the server computes right now. */
  async function build(overrides: Record<string, unknown> = {}): Promise<PlaceOrderRequest> {
    const raw = {
      idempotencyKey: randomUUID(),
      expectedTotal: 0,
      orderType: 'PICKUP',
      lines: [
        { kind: 'product', productId: db.ids.naan, quantity: 2, variantIds: [], addonIds: [] },
      ],
      contact: { name: 'Ali Khan', phone: '03001234567' },
      ...overrides,
    };
    const parsed = placeOrderSchema.parse(raw);
    if (!('expectedTotal' in overrides)) {
      const quote = await quoteService.quote({ ...parsed, customerId: null });
      parsed.expectedTotal = quote.grandTotal;
    }
    return parsed;
  }

  const none = { customerId: null };
  const counter = async () =>
    (await db.prisma.orderCounter.findUnique({ where: { year: 2026 } }))?.value ?? 0;
  const orderCount = () => db.prisma.order.count();

  const settle = <T>(promise: Promise<T>) =>
    promise.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error: error as Rejection }),
    );

  it('writes the order, its items, history, event and counter', async () => {
    const before = await counter();
    const request = await build();
    const placed = await service.place(request, none);

    expect(placed).toMatchObject({
      status: 'RECEIVED',
      type: 'PICKUP',
      grandTotal: 60,
      replayed: false,
    });
    expect(placed.orderNumber).toBe(`BBQ-2026-${String(before + 1).padStart(4, '0')}`);
    expect(placed.trackingToken).toMatch(/^[0-9a-f-]{36}$/);

    const order = await db.prisma.order.findUniqueOrThrow({
      where: { id: placed.id },
      include: { items: true, statusHistory: true, events: true },
    });
    expect(order).toMatchObject({
      status: 'RECEIVED',
      paymentMethod: 'CASH_AT_RESTAURANT',
      paymentStatus: 'PENDING',
      guestName: 'Ali Khan',
      guestPhone: '03001234567',
      customerId: null,
    });
    expect(Number(order.grandTotal)).toBe(60);
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({ productNameSnapshot: 'Naan', quantity: 2 });
    expect(order.statusHistory).toHaveLength(1);
    expect(order.statusHistory[0]).toMatchObject({ status: 'RECEIVED', fromStatus: null });
    expect(order.events).toHaveLength(1);
    expect(order.events[0]).toMatchObject({ type: 'order.created' });
    expect(order.estimatedReadyAt?.getTime()).toBe(OPEN_NOW.getTime() + 13 * 60_000); // 8 + 5

    const key = await db.prisma.idempotencyKey.findUniqueOrThrow({
      where: { key: request.idempotencyKey },
    });
    expect(key.orderId).toBe(placed.id);
    expect(await counter()).toBe(before + 1);
  }, 60_000);

  it('snapshots variants, add-ons and deal contents as they were priced', async () => {
    const request = await build({
      lines: [
        {
          kind: 'product',
          productId: db.ids.tikka,
          quantity: 2,
          variantIds: [db.ids.half],
          addonIds: [db.ids.raita],
          note: 'no onions',
        },
        { kind: 'deal', dealId: db.ids.deal, quantity: 1 },
      ],
    });
    const placed = await service.place(request, none);
    expect(placed.grandTotal).toBe(2810); // (350 + 330 + 50) * 2 + 1350

    const items = await db.prisma.orderItem.findMany({
      where: { orderId: placed.id },
      orderBy: { productNameSnapshot: 'desc' },
    });
    const tikka = items.find((i) => i.productId === db.ids.tikka);
    const deal = items.find((i) => i.dealId === db.ids.deal);
    expect(tikka).toMatchObject({ note: 'no onions', quantity: 2 });
    expect(Number(tikka?.unitPrice)).toBe(730);
    expect(tikka?.variantSnapshot).toEqual([{ id: db.ids.half, name: 'Half', priceModifier: 330 }]);
    expect(tikka?.addonSnapshot).toEqual([{ id: db.ids.raita, name: 'Raita', price: 50 }]);
    expect(deal?.productId).toBeNull();
    expect(deal?.variantSnapshot).toEqual([
      { productName: 'Chicken Tikka', variantName: null, quantity: 2 },
      { productName: 'Naan', variantName: null, quantity: 4 },
    ]);
    expect(deal?.addonSnapshot).toBeNull();
  }, 60_000);

  it('stores the delivery address and charges cash on delivery', async () => {
    const request = await build({
      orderType: 'DELIVERY',
      zoneId: db.ids.zone,
      address: { line1: 'House 12, Street 4', line2: 'Near the park' },
      instructions: 'ring twice',
    });
    const placed = await service.place(request, none);
    expect(placed.grandTotal).toBe(160);

    const order = await db.prisma.order.findUniqueOrThrow({ where: { id: placed.id } });
    expect(order).toMatchObject({ paymentMethod: 'COD', specialInstructions: 'ring twice' });
    expect(Number(order.deliveryCharge)).toBe(100);
    expect(order.deliveryAddressSnapshot).toEqual({
      line1: 'House 12, Street 4',
      line2: 'Near the park',
      area: 'Johar Town',
      city: 'Lahore',
      zoneId: db.ids.zone,
    });
  }, 60_000);

  it('links the order to a signed-in customer', async () => {
    const placed = await service.place(await build(), { customerId: db.ids.customer });
    const order = await db.prisma.order.findUniqueOrThrow({ where: { id: placed.id } });
    expect(order.customerId).toBe(db.ids.customer);
  }, 60_000);

  describe('idempotency', () => {
    it('returns the same order when the identical request is sent again', async () => {
      const request = await build();
      const before = await orderCount();
      const first = await service.place(request, none);
      const second = await service.place(request, none);

      expect(second).toMatchObject({
        id: first.id,
        orderNumber: first.orderNumber,
        trackingToken: first.trackingToken,
        replayed: true,
      });
      expect(await orderCount()).toBe(before + 1);
    }, 60_000);

    it('refuses the same key for a different cart', async () => {
      const request = await build();
      await service.place(request, none);
      const changed = await build({
        idempotencyKey: request.idempotencyKey,
        lines: [
          { kind: 'product', productId: db.ids.naan, quantity: 5, variantIds: [], addonIds: [] },
        ],
      });
      const outcome = await settle(service.place(changed, none));
      expect(outcome).toMatchObject({ ok: false, error: { code: 'IDEMPOTENCY_CONFLICT' } });
    }, 60_000);

    it('creates exactly one order when the same request arrives many times at once', async () => {
      const request = await build();
      const before = await orderCount();
      const results = await Promise.all(
        Array.from({ length: 10 }, () => settle(service.place(request, none))),
      );

      const succeeded = results.flatMap((r) => (r.ok ? [r.value] : []));
      const failed = results.flatMap((r) => (r.ok ? [] : [r.error.code]));
      // Whatever the interleaving: one order, and nobody got a different one.
      expect(await orderCount()).toBe(before + 1);
      expect(new Set(succeeded.map((order) => order.id)).size).toBe(1);
      expect(succeeded.length).toBeGreaterThanOrEqual(1);
      for (const code of failed) expect(code).toBe('ORDER_IN_PROGRESS');
    }, 120_000);
  });

  describe('concurrency', () => {
    it('gives every simultaneous order its own order number, with no gaps', async () => {
      const startCount = await counter();
      const ordersBefore = await orderCount();
      const requests = await Promise.all(Array.from({ length: 15 }, () => build()));

      const results = await Promise.all(requests.map((r) => settle(service.place(r, none))));

      const placed = results.flatMap((r) => (r.ok ? [r.value] : []));
      expect(placed).toHaveLength(15);
      const numbers = placed.map((o) => o.orderNumber).sort();
      expect(new Set(numbers).size).toBe(15);
      const expected = Array.from(
        { length: 15 },
        (_, i) => `BBQ-2026-${String(startCount + i + 1).padStart(4, '0')}`,
      ).sort();
      expect(numbers).toEqual(expected);
      expect(await counter()).toBe(startCount + 15);
      expect(await orderCount()).toBe(ordersBefore + 15);
    }, 180_000);

    it('never lets a coupon be used more often than its limit', async () => {
      const code = `LIMIT3${randomUUID().slice(0, 6).toUpperCase()}`;
      const coupon = await db.prisma.coupon.create({
        data: { code, type: 'FIXED', amount: 10, usageLimit: 3 },
      });
      const requests = await Promise.all(
        Array.from({ length: 10 }, () =>
          build({
            couponCode: code,
            lines: [
              {
                kind: 'product',
                productId: db.ids.naan,
                quantity: 2,
                variantIds: [],
                addonIds: [],
              },
            ],
          }),
        ),
      );
      const startCount = await counter();

      const results = await Promise.all(requests.map((r) => settle(service.place(r, none))));

      const succeeded = results.filter((r) => r.ok);
      const failures = results.flatMap((r) => (r.ok ? [] : [r.error.code]));
      expect(succeeded).toHaveLength(3);
      // Late arrivals see either a used-up coupon or a changed price; both refuse the order
      // instead of silently dropping a discount the customer was promised.
      for (const code of failures) expect(['COUPON_EXHAUSTED', 'PRICE_CHANGED']).toContain(code);
      expect(failures).toHaveLength(7);

      const stored = await db.prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
      expect(stored.usedCount).toBe(3);
      expect(await db.prisma.order.count({ where: { couponId: coupon.id } })).toBe(3);
      // Refused orders did not use up order numbers.
      expect(await counter()).toBe(startCount + 3);
    }, 180_000);
  });

  describe('atomicity', () => {
    it('leaves no trace when the cart is refused', async () => {
      const closed = createOrderService(store, () => CLOSED_NOW);
      const request = await build();
      const before = { orders: await orderCount(), counter: await counter() };

      const outcome = await settle(closed.place(request, none));
      expect(outcome).toMatchObject({ ok: false, error: { code: 'CART_INVALID' } });

      expect(await orderCount()).toBe(before.orders);
      expect(await counter()).toBe(before.counter);
      expect(
        await db.prisma.idempotencyKey.findUnique({ where: { key: request.idempotencyKey } }),
      ).toBeNull();

      // The same key works once the shop is open.
      await expect(service.place(request, none)).resolves.toMatchObject({ replayed: false });
    }, 60_000);

    it('undoes the order number, order, history and key if a later step fails', async () => {
      const failing: OrderStore = {
        transaction: (work) =>
          store.transaction((tx) =>
            work({
              ...tx,
              recordOrderCreated: () => Promise.reject(new Error('event write failed')),
            }),
          ),
      };
      const broken = createOrderService(failing, () => OPEN_NOW);
      const request = await build();
      const before = {
        orders: await orderCount(),
        history: await db.prisma.orderStatusHistory.count(),
        events: await db.prisma.orderEvent.count(),
        items: await db.prisma.orderItem.count(),
        counter: await counter(),
      };

      await expect(broken.place(request, none)).rejects.toThrow('event write failed');

      expect(await orderCount()).toBe(before.orders);
      expect(await db.prisma.orderStatusHistory.count()).toBe(before.history);
      expect(await db.prisma.orderEvent.count()).toBe(before.events);
      expect(await db.prisma.orderItem.count()).toBe(before.items);
      expect(await counter()).toBe(before.counter);
      expect(
        await db.prisma.idempotencyKey.findUnique({ where: { key: request.idempotencyKey } }),
      ).toBeNull();
    }, 60_000);

    it('gives a used coupon redemption back when a later step fails', async () => {
      const code = `UNDO${randomUUID().slice(0, 6).toUpperCase()}`;
      const coupon = await db.prisma.coupon.create({
        data: { code, type: 'FIXED', amount: 10, usageLimit: 1 },
      });
      const failing: OrderStore = {
        transaction: (work) =>
          store.transaction((tx) =>
            work({ ...tx, createOrder: () => Promise.reject(new Error('insert failed')) }),
          ),
      };
      const broken = createOrderService(failing, () => OPEN_NOW);
      await expect(broken.place(await build({ couponCode: code }), none)).rejects.toThrow(
        'insert failed',
      );

      expect(
        (await db.prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount,
      ).toBe(0);
      // The coupon is still usable.
      const placed = await service.place(await build({ couponCode: code }), none);
      expect(placed.grandTotal).toBe(50);
    }, 60_000);
  });

  it('refuses a duplicate order number at the database level', async () => {
    const placed = await service.place(await build(), none);
    const original = await db.prisma.order.findUniqueOrThrow({ where: { id: placed.id } });
    await expect(
      db.prisma.order.create({
        data: {
          orderNumber: original.orderNumber,
          type: 'PICKUP',
          subtotal: 1,
          grandTotal: 1,
          paymentMethod: 'CASH_AT_RESTAURANT',
        },
      }),
    ).rejects.toThrow();
  }, 60_000);
});
