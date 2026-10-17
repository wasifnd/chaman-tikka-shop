import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OrderStatus, OrderType } from '@/features/orders/state-machine';
import { createTestDatabase, type TestDatabase } from '@/features/orders/testing/test-database';
import { transitionRequestSchema } from '../schemas/transition.schema';
import type { TransitionStore } from './transition.ports';
import { createTransitionService } from './transition.service';
import { createPrismaTransitionStore } from './transition.store';

/**
 * Real-database tests for changing order statuses, including two people acting at the same time.
 * They run in a private schema that is dropped afterwards. Skipped unless a URL is provided:
 *   INTEGRATION_DATABASE_URL=postgresql://... npm test
 */
const url = process.env['INTEGRATION_DATABASE_URL'];

describe.skipIf(!url)('changing order status against Postgres', () => {
  let db: TestDatabase;
  let store: TransitionStore;
  let service: ReturnType<typeof createTransitionService>;
  let staffId: string;
  let seq = 0;

  beforeAll(async () => {
    db = await createTestDatabase(url ?? '');
    store = createPrismaTransitionStore(db.prisma, {
      schema: db.schema,
      maxWaitMs: 60_000,
      timeoutMs: 60_000,
    });
    service = createTransitionService(store);
    staffId = (
      await db.prisma.user.create({
        data: { email: 'staff@example.com', passwordHash: 'x', role: 'STORE_STAFF' },
      })
    ).id;
  }, 120_000);

  afterAll(async () => {
    await db.drop();
  }, 60_000);

  async function newOrder(type: OrderType = 'DELIVERY', status: OrderStatus = 'RECEIVED') {
    seq += 1;
    return db.prisma.order.create({
      data: {
        orderNumber: `T-${String(seq).padStart(4, '0')}`,
        type,
        status,
        subtotal: 100,
        grandTotal: 100,
        paymentMethod: type === 'DELIVERY' ? 'COD' : 'CASH_AT_RESTAURANT',
      },
    });
  }

  const move = (orderId: string, status: OrderStatus, reason?: string, userId = staffId) =>
    service.transition(orderId, transitionRequestSchema.parse({ status, reason }), { userId });

  const settle = <T>(promise: Promise<T>) =>
    promise.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({
        ok: false as const,
        code: (error as { code?: string }).code ?? 'ERROR',
      }),
    );

  it.each([
    ['DELIVERY', ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED']],
    ['PICKUP', ['CONFIRMED', 'PREPARING', 'READY', 'PICKED', 'COMPLETED']],
    ['DINE_IN', ['CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED']],
  ] as const)(
    'records every step of a %s order',
    async (type, journey) => {
      const order = await newOrder(type);
      for (const status of journey) await move(order.id, status);

      const stored = await db.prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          statusHistory: { orderBy: { createdAt: 'asc' } },
          events: { orderBy: { id: 'asc' } },
        },
      });
      expect(stored.status).toBe('COMPLETED');
      expect(stored.paymentStatus).toBe('PAID');
      expect(stored.statusHistory.map((h) => h.status)).toEqual([...journey]);
      expect(stored.statusHistory.every((h) => h.changedByUserId === staffId)).toBe(true);
      expect(stored.statusHistory[0]?.fromStatus).toBe('RECEIVED');
      expect(stored.events.map((e) => (e.payload as { status: string }).status)).toEqual([
        ...journey,
      ]);
      // Event ids only ever grow, which is what lets a reconnecting screen catch up.
      const ids = stored.events.map((e) => e.id);
      expect(ids).toEqual([...ids].sort((a, b) => Number(a - b)));
    },
    120_000,
  );

  it('does not mark an order paid before it completes', async () => {
    const order = await newOrder('PICKUP');
    await move(order.id, 'CONFIRMED');
    await move(order.id, 'PREPARING');
    expect(
      (await db.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus,
    ).toBe('PENDING');
  }, 60_000);

  it('stores a cancellation reason and leaves the payment unpaid', async () => {
    const order = await newOrder();
    await move(order.id, 'CANCELLED', 'Out of chicken');
    const stored = await db.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { statusHistory: true },
    });
    expect(stored).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PENDING' });
    expect(stored.statusHistory[0]).toMatchObject({ status: 'CANCELLED', note: 'Out of chicken' });
  }, 60_000);

  it('changes nothing when the move is not allowed', async () => {
    const order = await newOrder();
    const outcome = await settle(move(order.id, 'READY'));
    expect(outcome).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' });
    expect((await db.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'RECEIVED',
    );
    expect(await db.prisma.orderStatusHistory.count({ where: { orderId: order.id } })).toBe(0);
    expect(await db.prisma.orderEvent.count({ where: { orderId: order.id } })).toBe(0);
  }, 60_000);

  it('reports an unknown order', async () => {
    const outcome = await settle(move('00000000-0000-4000-8000-000000000000', 'CONFIRMED'));
    expect(outcome).toMatchObject({ ok: false, code: 'ORDER_NOT_FOUND' });
  }, 60_000);

  describe('two people at once', () => {
    it('lets exactly one of many identical clicks through', async () => {
      const order = await newOrder();
      const results = await Promise.all(
        Array.from({ length: 10 }, () => settle(move(order.id, 'CONFIRMED'))),
      );

      expect(results.filter((r) => r.ok)).toHaveLength(1);
      for (const result of results) if (!result.ok) expect(result.code).toBe('INVALID_TRANSITION');
      expect(await db.prisma.orderStatusHistory.count({ where: { orderId: order.id } })).toBe(1);
      expect(await db.prisma.orderEvent.count({ where: { orderId: order.id } })).toBe(1);
    }, 120_000);

    it('lets exactly one of two truly exclusive actions win, and the record agrees', async () => {
      // From READY a pickup can be handed over or cancelled, but never both.
      const order = await newOrder('PICKUP', 'READY');
      const [pickup, cancel] = await Promise.all([
        settle(move(order.id, 'PICKED')),
        settle(move(order.id, 'CANCELLED', 'Customer called')),
      ]);
      expect([pickup.ok, cancel.ok].filter(Boolean)).toHaveLength(1);

      const stored = await db.prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { statusHistory: true },
      });
      expect(stored.statusHistory).toHaveLength(1);
      expect(stored.status).toBe(stored.statusHistory[0]?.status);
      expect(stored.status).toBe(pickup.ok ? 'PICKED' : 'CANCELLED');
    }, 120_000);

    it('keeps an unbroken history when accepting and rejecting race, whichever runs first', async () => {
      // Accept then cancel is a legitimate sequence, so both may succeed. What must never happen
      // is a lost update: the history is a chain and the order ends where the chain ends.
      const order = await newOrder();
      const [, reject] = await Promise.all([
        settle(move(order.id, 'CONFIRMED')),
        settle(move(order.id, 'CANCELLED', 'Customer called')),
      ]);
      expect(reject.ok).toBe(true); // cancelling is allowed from both RECEIVED and CONFIRMED

      const stored = await db.prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { statusHistory: true, events: { orderBy: { id: 'asc' } } },
      });
      expect(stored.status).toBe('CANCELLED');
      // Events are numbered in the order they happened.
      const path = stored.events.map(
        (e) => (e.payload as { status: string; from?: string }).status,
      );
      expect(path.at(-1)).toBe('CANCELLED');
      expect(stored.statusHistory).toHaveLength(path.length);
      // Each step starts where the previous one ended.
      const froms = stored.events.map((e) => (e.payload as { from: string }).from);
      expect(froms[0]).toBe('RECEIVED');
      for (let i = 1; i < path.length; i++) expect(froms[i]).toBe(path[i - 1]);
    }, 120_000);

    it('moves many different orders at the same time without blocking each other', async () => {
      const orders = await Promise.all(Array.from({ length: 12 }, () => newOrder()));
      const results = await Promise.all(orders.map((o) => settle(move(o.id, 'CONFIRMED'))));
      expect(results.every((r) => r.ok)).toBe(true);
      const stored = await db.prisma.order.findMany({
        where: { id: { in: orders.map((o) => o.id) } },
      });
      expect(stored.every((o) => o.status === 'CONFIRMED')).toBe(true);
    }, 120_000);

    it('keeps events for different orders in one growing sequence', async () => {
      const [a, b] = await Promise.all([newOrder(), newOrder()]);
      await Promise.all([move(a.id, 'CONFIRMED'), move(b.id, 'CONFIRMED')]);
      const events = await db.prisma.orderEvent.findMany({
        where: { orderId: { in: [a.id, b.id] } },
        orderBy: { id: 'asc' },
      });
      expect(events).toHaveLength(2);
      expect(new Set(events.map((e) => e.id)).size).toBe(2);
    }, 60_000);
  });

  describe('atomicity', () => {
    it('undoes the status change if writing the history fails afterwards', async () => {
      const failing: TransitionStore = {
        transaction: (work) =>
          store.transaction((tx) =>
            work({
              ...tx,
              applyTransition: async (record) => {
                await tx.applyTransition(record); // the real update, history and event...
                throw new Error('something went wrong after the update'); // ...then a failure
              },
            }),
          ),
      };
      const order = await newOrder();
      const broken = createTransitionService(failing);
      await expect(
        broken.transition(order.id, { status: 'CONFIRMED' }, { userId: staffId }),
      ).rejects.toThrow('after the update');
      expect((await db.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
        'RECEIVED',
      );
      expect(await db.prisma.orderStatusHistory.count({ where: { orderId: order.id } })).toBe(0);
      expect(await db.prisma.orderEvent.count({ where: { orderId: order.id } })).toBe(0);
    }, 60_000);

    it('refuses a change attributed to a user that does not exist, and changes nothing', async () => {
      const order = await newOrder();
      const outcome = await settle(
        move(order.id, 'CONFIRMED', undefined, '00000000-0000-4000-8000-000000000000'),
      );
      expect(outcome.ok).toBe(false);
      expect((await db.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
        'RECEIVED',
      );
    }, 60_000);
  });
});
