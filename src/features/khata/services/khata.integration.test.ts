import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createQuoteLoader } from '@/features/checkout/services/quote.repository';
import { createQuoteService } from '@/features/checkout/services/quote.service';
import { CLOSED_NOW, OPEN_NOW } from '@/features/checkout/testing/fixtures';
import { createReceiptRepository } from '@/features/orders/receipt/receipt.repository';
import {
  counterOrderSchema,
  type CounterOrderRequest,
} from '@/features/orders/schemas/counter-order.schema';
import { createOrderService } from '@/features/orders/services/order.service';
import { createPrismaOrderStore } from '@/features/orders/services/order.store';
import { createTestDatabase, type TestDatabase } from '@/features/orders/testing/test-database';
import { createPrismaTransitionStore } from '@/features/store-panel/services/transition.store';
import { createTransitionService } from '@/features/store-panel/services/transition.service';
import { createKhataRepository, searchFilter } from './khata.repository';
import { createKhataService } from './khata.service';
import { createPrismaKhataStore } from './khata.store';

/**
 * The khata against real Postgres: counter orders opening and adding to khatas, the limit, and
 * money never going missing or doubling when several tills act at once. Runs in a private schema
 * built from the real migrations. Skipped unless INTEGRATION_DATABASE_URL is set.
 */
const url = process.env['INTEGRATION_DATABASE_URL'];
const TIMING = { maxWaitMs: 60_000, timeoutMs: 60_000 };

type Rejection = { code: string; status: number };
const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error as Rejection,
  );

describe.skipIf(!url)('khata against Postgres', { timeout: 60_000 }, () => {
  let db: TestDatabase;
  let orders: ReturnType<typeof createOrderService>;
  let khata: ReturnType<typeof createKhataService>;
  let repo: ReturnType<typeof createKhataRepository>;
  let quote: ReturnType<typeof createQuoteService>;
  let staffId: string;
  let adminId: string;

  beforeAll(async () => {
    db = await createTestDatabase(url ?? '');
    orders = createOrderService(
      createPrismaOrderStore(db.prisma, { schema: db.schema, ...TIMING }),
      () => OPEN_NOW,
    );
    khata = createKhataService(createPrismaKhataStore(db.prisma, { schema: db.schema, ...TIMING }));
    repo = createKhataRepository(db.prisma);
    quote = createQuoteService(createQuoteLoader(db.prisma), () => OPEN_NOW);
    const staff = await db.prisma.user.create({
      data: {
        phone: '03000000002',
        passwordHash: 'x',
        role: 'STORE_STAFF',
        customer: { create: { name: 'Ahmed (till)' } },
      },
    });
    const admin = await db.prisma.user.create({
      data: { phone: '03000000001', passwordHash: 'x', role: 'ADMIN' },
    });
    staffId = staff.id;
    adminId = admin.id;
  }, 120_000);

  afterAll(async () => {
    await db.drop();
  }, 60_000);

  /** Naan at the counter; the expected total is what the server computes. */
  async function counter(
    phone: string | undefined,
    amountPaid: number | 'all',
    quantity = 2,
  ): Promise<CounterOrderRequest> {
    const lines = [
      { kind: 'product', productId: db.ids.naan, quantity, variantIds: [], addonIds: [] },
    ];
    const total = (
      await quote.quote({ lines: lines as never, orderType: 'PICKUP', customerId: null })
    ).grandTotal;
    return counterOrderSchema.parse({
      idempotencyKey: randomUUID(),
      lines,
      orderType: 'PICKUP',
      expectedTotal: total,
      amountPaid: amountPaid === 'all' ? total : amountPaid,
      customer: phone ? { name: 'Bilal Khan', phone } : {},
    });
  }

  const balanceOf = async (phone: string) =>
    Number((await db.prisma.khata.findUnique({ where: { phone } }))?.balance.toString() ?? 'NaN');

  /** The stored balance always equals the sum of the entries. */
  async function expectLedgerConsistent(phone: string) {
    const row = await db.prisma.khata.findUniqueOrThrow({
      where: { phone },
      include: { entries: { orderBy: { createdAt: 'asc' } } },
    });
    const sum = row.entries.reduce((total, entry) => total + Number(entry.amount.toString()), 0);
    expect(Number(row.balance.toString())).toBeCloseTo(sum, 2);
    expect(Number(row.balance.toString())).toBeGreaterThanOrEqual(0);
  }

  it('a paid walk-in opens no khata; an unpaid one opens and fills it', async () => {
    const paid = await orders.placeAtCounter(await counter(undefined, 'all'), {
      staffUserId: staffId,
    });
    expect(paid).toMatchObject({ remaining: 0, khata: null, status: 'CONFIRMED' });
    const stored = await db.prisma.order.findUniqueOrThrow({
      where: { id: paid.id },
      include: { statusHistory: { orderBy: { createdAt: 'asc' } } },
    });
    expect(stored).toMatchObject({
      source: 'COUNTER',
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      guestName: 'Walk-in customer',
      guestPhone: null,
      placedByUserId: staffId,
    });
    expect(stored.statusHistory.map((h) => [h.status, h.changedByUserId])).toEqual([
      ['RECEIVED', staffId],
      ['CONFIRMED', staffId],
    ]);

    const unpaid = await orders.placeAtCounter(await counter('03331230001', 0), {
      staffUserId: staffId,
    });
    expect(unpaid).toMatchObject({ amountPaid: 0, remaining: 60, khata: { balance: 60 } });
    const order = await db.prisma.order.findUniqueOrThrow({ where: { id: unpaid.id } });
    expect(order.paymentStatus).toBe('ON_KHATA');
    expect(Number(order.amountPaid?.toString())).toBe(0);
    await expectLedgerConsistent('03331230001');
  });

  it('part paid adds only the rest, and refuses going over the limit without a trace', async () => {
    const phone = '03331230002';
    await orders.placeAtCounter(await counter(phone, 20), { staffUserId: staffId });
    expect(await balanceOf(phone)).toBe(40);

    await db.prisma.khata.update({ where: { phone }, data: { creditLimit: 70 } });
    const before = await db.prisma.order.count();
    const error = await rejection(
      orders.placeAtCounter(await counter(phone, 0), { staffUserId: staffId }),
    );
    expect(error).toMatchObject({ code: 'KHATA_LIMIT_REACHED', status: 409 });
    expect(await db.prisma.order.count()).toBe(before);
    expect(await balanceOf(phone)).toBe(40);

    // Inside the limit is fine.
    await orders.placeAtCounter(await counter(phone, 0, 1), { staffUserId: staffId });
    expect(await balanceOf(phone)).toBe(70);
    await expectLedgerConsistent(phone);
  });

  it('the shop default limit comes from Settings', async () => {
    await db.prisma.setting.update({
      where: { key: 'restaurant' },
      data: { value: { taxRatePercent: 0, orderingEnabled: true, khataLimit: 50 } },
    });
    try {
      const error = await rejection(
        orders.placeAtCounter(await counter('03331230003', 0), { staffUserId: staffId }),
      );
      expect(error.code).toBe('KHATA_LIMIT_REACHED');
      expect(await repo.defaultLimit()).toBe(50);
    } finally {
      await db.prisma.setting.update({
        where: { key: 'restaurant' },
        data: { value: { taxRatePercent: 0, orderingEnabled: true } },
      });
    }
    expect(await repo.defaultLimit()).toBe(10_000);
  });

  it('two tills opening the same new khata at once end up with one khata and both amounts', async () => {
    const phone = '03331230004';
    const requests = await Promise.all([counter(phone, 0), counter(phone, 0), counter(phone, 0)]);
    await Promise.all(
      requests.map((request) => orders.placeAtCounter(request, { staffUserId: staffId })),
    );
    expect(await db.prisma.khata.count({ where: { phone } })).toBe(1);
    expect(await balanceOf(phone)).toBe(180);
    await expectLedgerConsistent(phone);
  }, 60_000);

  it('payments at the same time never take more than is owed', async () => {
    const phone = '03331230005';
    await orders.placeAtCounter(await counter(phone, 0, 10), { staffUserId: staffId }); // Rs. 300
    const { id } = await db.prisma.khata.findUniqueOrThrow({ where: { phone } });

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        khata.recordPayment(id, { amount: 100, requestKey: randomUUID() }, staffId),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(2);
    expect(await balanceOf(phone)).toBe(0);
    await expectLedgerConsistent(phone);
  }, 60_000);

  it('the same payment sent five times at once is recorded once', async () => {
    const phone = '03331230008';
    await orders.placeAtCounter(await counter(phone, 0, 10), { staffUserId: staffId }); // Rs. 300
    const { id } = await db.prisma.khata.findUniqueOrThrow({ where: { phone } });
    const requestKey = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        khata.recordPayment(id, { amount: 100, requestKey }, staffId),
      ),
    );
    expect(new Set(results.map((r) => r.entryId)).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(await balanceOf(phone)).toBe(200);
    await expectLedgerConsistent(phone);
  }, 60_000);

  it('cancelling a counter order on a khata takes its charge back off', async () => {
    const phone = '03331230009';
    const placed = await orders.placeAtCounter(await counter(phone, 0), { staffUserId: staffId });
    const transitions = createTransitionService(
      createPrismaTransitionStore(db.prisma, { schema: db.schema, ...TIMING }),
      () => OPEN_NOW,
    );
    const result = await transitions.transition(
      placed.id,
      { status: 'CANCELLED', reason: 'Customer left' },
      { userId: staffId },
    );
    expect(result.khataReversed).toBe(60);
    expect(await balanceOf(phone)).toBe(0);
    const reversal = await db.prisma.khataEntry.findFirstOrThrow({
      where: { orderId: placed.id, kind: 'REDUCTION' },
    });
    expect(reversal.note).toBe(`Order ${placed.orderNumber} cancelled`);
    await expectLedgerConsistent(phone);
  });

  it('admin corrections are entries with the reason and who made them', async () => {
    const phone = '03331230006';
    await orders.placeAtCounter(await counter(phone, 0), { staffUserId: staffId });
    const { id } = await db.prisma.khata.findUniqueOrThrow({ where: { phone } });
    const adjust = (change: { kind: 'CHARGE' | 'REDUCTION' | 'WRITE_OFF'; amount?: number }) =>
      khata.adjust(
        id,
        { ...change, reason: reasons[change.kind], requestKey: randomUUID(), expectedBalance: 500 },
        adminId,
      );
    const reasons = { CHARGE: 'Catering tray', REDUCTION: 'Wrong naan', WRITE_OFF: 'Goodwill' };
    await adjust({ kind: 'CHARGE', amount: 500 });
    await adjust({ kind: 'REDUCTION', amount: 60 });
    await adjust({ kind: 'WRITE_OFF' });
    expect(await balanceOf(phone)).toBe(0);

    const detail = await repo.findById(id);
    expect(detail?.entries.map((e) => [e.kind, e.amount, e.balanceAfter, e.by, e.note])).toEqual([
      ['WRITE_OFF', -500, 0, '03000000001', 'Goodwill'],
      ['REDUCTION', -60, 500, '03000000001', 'Wrong naan'],
      ['CHARGE', 500, 560, '03000000001', 'Catering tray'],
      ['ORDER', 60, 60, 'Ahmed (till)', expect.stringMatching(/^Order /) as unknown],
    ]);
    expect(detail?.entries.at(-1)?.order?.orderNumber).toMatch(/^BBQ-/);
    await expectLedgerConsistent(phone);
  });

  it('lists who owes the most first, and finds khatas by number or name', async () => {
    const page = await repo.list({});
    const balances = page.items.map((k) => k.balance);
    expect(balances).toEqual([...balances].sort((a, b) => b - a));
    expect(balances.every((b) => b > 0)).toBe(true);
    expect(page.totalOwed).toBe(balances.reduce((a, b) => a + b, 0));

    const all = await repo.list({ owingOnly: false });
    expect(all.total).toBeGreaterThan(page.total); // includes the paid-up ones

    expect((await repo.list({ search: '+92 333 1230002' })).items.map((k) => k.phone)).toEqual([
      '03331230002',
    ]);
    expect((await repo.list({ search: '1230002' })).items.map((k) => k.phone)).toEqual([
      '03331230002',
    ]);
    expect((await repo.list({ search: 'bilal', owingOnly: false })).total).toBe(all.total);
    expect((await repo.list({ search: 'nobody' })).total).toBe(0);
  });

  it('search treats number-like text as a number and the rest as a name', () => {
    expect(searchFilter('')).toEqual({});
    expect(searchFilter('0333 1234500')).toEqual({ phone: '03331234500' });
    expect(searchFilter('92333')).toEqual({ phone: { contains: '0333' } });
    expect(searchFilter('Bilal')).toEqual({ name: { contains: 'Bilal', mode: 'insensitive' } });
  });

  it('a customer sees their own khata once their number is proven, without staff names', async () => {
    const phone = '03331230002';
    const user = await db.prisma.user.create({
      data: { phone, passwordHash: 'x', customer: { create: { name: 'Bilal' } } },
    });
    expect(await repo.findForUser(user.id)).toBeNull(); // not proven yet

    await db.prisma.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } });
    const mine = await repo.findForUser(user.id);
    expect(mine?.balance).toBe(70);
    expect(mine?.entries.every((e) => e.by === null)).toBe(true);
    expect(await repo.verifiedPhone(user.id)).toBe(phone);

    // The order receipt knows which khata the order is on.
    // The unpaid one-naan order (the test clock is fixed, so pick it by amount, not by time).
    const orderId = mine?.entries.find((e) => e.amount === 30)?.order?.id ?? '';
    const receipt = await createReceiptRepository(db.prisma).find({ id: orderId });
    expect(receipt?.khataPhone).toBe(phone);
    expect(receipt?.receipt.amountPaid).toBe(0);
  });

  it('admin can give a customer their own limit, and take it away', async () => {
    const { id } = await db.prisma.khata.findUniqueOrThrow({ where: { phone: '03331230001' } });
    expect(await repo.setLimit(id, 2_500)).toBe(true);
    expect((await repo.findByPhone('03331230001'))?.limit).toBe(2_500);
    expect(await repo.setLimit(id, null)).toBe(true);
    expect((await repo.findByPhone('03331230001'))?.limit).toBe(10_000);
    expect(await repo.setLimit(randomUUID(), 5)).toBe(false);
    expect(await repo.findByPhone('03009999999')).toBeNull();
  });

  it('finds one payment for its receipt', async () => {
    const { id } = await db.prisma.khata.findUniqueOrThrow({ where: { phone: '03331230005' } });
    const entry = await db.prisma.khataEntry.findFirstOrThrow({
      where: { khataId: id, kind: 'PAYMENT' },
    });
    const found = await repo.findEntry(entry.id);
    expect(found).toMatchObject({
      entry: { kind: 'PAYMENT', amount: -100, by: 'Ahmed (till)' },
      khata: { phone: '03331230005' },
    });
    expect(await repo.findEntry(randomUUID())).toBeNull();
  });

  it('completing an order left on a khata keeps it "on khata", not "paid"', async () => {
    const placed = await orders.placeAtCounter(await counter('03331230007', 0), {
      staffUserId: staffId,
    });
    const transitions = createTransitionService(
      createPrismaTransitionStore(db.prisma, { schema: db.schema, ...TIMING }),
      () => OPEN_NOW,
    );
    for (const to of ['PREPARING', 'READY', 'PICKED', 'COMPLETED'] as const) {
      await transitions.transition(placed.id, { status: to }, { userId: staffId });
    }
    const order = await db.prisma.order.findUniqueOrThrow({ where: { id: placed.id } });
    expect(order).toMatchObject({ status: 'COMPLETED', paymentStatus: 'ON_KHATA' });
  });

  it('works even when the website is closed for orders', async () => {
    const closedOrders = createOrderService(
      createPrismaOrderStore(db.prisma, { schema: db.schema, ...TIMING }),
      () => CLOSED_NOW,
    );
    const placed = await closedOrders.placeAtCounter(await counter(undefined, 'all'), {
      staffUserId: staffId,
    });
    expect(placed.status).toBe('CONFIRMED');
  });
});
