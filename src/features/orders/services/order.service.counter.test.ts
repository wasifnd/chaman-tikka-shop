import { describe, expect, it } from 'vitest';
import { buildQuote } from '@/features/checkout/services/quote-engine';
import { CLOSED_NOW, OPEN_NOW, ids, quoteData } from '@/features/checkout/testing/fixtures';
import { counterOrderSchema, type CounterOrderRequest } from '../schemas/counter-order.schema';
import { createFakeOrderStore } from '../testing/fake-order-store';
import { createOrderService } from './order.service';

const key = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const STAFF = 'staff-1';
const PHONE = '03331234500';

/** Two naan (Rs. 60 with the fixture menu), taken at the counter. */
function counterRequest(overrides: Record<string, unknown> = {}): CounterOrderRequest {
  const parsed = counterOrderSchema.parse({
    idempotencyKey: key(1),
    lines: [{ kind: 'product', productId: ids.naan, quantity: 2, variantIds: [], addonIds: [] }],
    orderType: 'PICKUP',
    expectedTotal: 0,
    amountPaid: 0,
    customer: { name: 'Bilal', phone: PHONE },
    ...overrides,
  });
  if (!('expectedTotal' in overrides)) {
    parsed.expectedTotal = buildQuote(parsed, quoteData(), OPEN_NOW).grandTotal;
  }
  if (!('amountPaid' in overrides)) parsed.amountPaid = parsed.expectedTotal;
  return parsed;
}

function setup(options: { khataLimit?: number; at?: Date } = {}) {
  const fake = createFakeOrderStore({
    data: () => quoteData(),
    ...(options.khataLimit === undefined ? {} : { khataLimit: options.khataLimit }),
  });
  const service = createOrderService(fake.store, () => options.at ?? OPEN_NOW);
  return { fake, service };
}

async function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error('expected the promise to reject');
    },
    (error: unknown) => error as { code: string; status: number; details?: Record<string, string> },
  );
}

describe('orders taken at the counter', () => {
  it('paid in full: a paid, accepted order and no khata', async () => {
    const { service, fake } = setup();
    const placed = await service.placeAtCounter(counterRequest({ customer: {} }), {
      staffUserId: STAFF,
    });
    expect(placed).toMatchObject({
      status: 'CONFIRMED',
      grandTotal: 60,
      amountPaid: 60,
      remaining: 0,
      khata: null,
      replayed: false,
    });
    const order = fake.state.orders[0];
    expect(order).toMatchObject({
      source: 'COUNTER',
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      amountPaid: 60,
      placedByUserId: STAFF,
      paymentMethod: 'CASH_AT_RESTAURANT',
      contact: { name: 'Walk-in customer', phone: null, email: null },
      customerId: null,
      phoneVerifiedAt: null,
    });
    // Accepted by the cashier who took it, so the kitchen sees it straight away.
    expect(fake.state.history.map((h) => h.status)).toEqual(['RECEIVED', 'CONFIRMED']);
    expect(fake.state.khatas.size).toBe(0);
  });

  it('part paid: the rest goes on a new khata for that number', async () => {
    const { service, fake } = setup();
    const placed = await service.placeAtCounter(counterRequest({ amountPaid: 20 }), {
      staffUserId: STAFF,
    });
    expect(placed).toMatchObject({
      amountPaid: 20,
      remaining: 40,
      khata: { id: `khata-${PHONE}`, balance: 40 },
    });
    expect(fake.state.orders[0]?.paymentStatus).toBe('ON_KHATA');
    expect(fake.state.entries).toEqual([
      expect.objectContaining({
        kind: 'ORDER',
        amount: 40,
        balanceAfter: 40,
        orderId: placed.id,
        userId: STAFF,
        note: `Order ${placed.orderNumber}`,
      }),
    ]);
  });

  it('unpaid: adds the whole total to an existing khata', async () => {
    const { service, fake } = setup();
    fake.seedKhata(PHONE, 500);
    const placed = await service.placeAtCounter(counterRequest({ amountPaid: 0 }), {
      staffUserId: STAFF,
    });
    expect(placed.khata).toEqual({ id: `khata-${PHONE}`, balance: 560 });
  });

  it('refuses going over the shop default limit, and keeps nothing', async () => {
    const { service, fake } = setup({ khataLimit: 520 });
    fake.seedKhata(PHONE, 500);
    const error = await rejection(
      service.placeAtCounter(counterRequest({ amountPaid: 0 }), { staffUserId: STAFF }),
    );
    expect(error).toMatchObject({ code: 'KHATA_LIMIT_REACHED', status: 409 });
    expect(fake.state.orders).toHaveLength(0);
    expect(fake.state.entries).toHaveLength(0);
    expect(fake.state.khatas.get(PHONE)?.balance).toBe(500);
    expect(fake.state.counters.size).toBe(0); // the order number is given back too
  });

  it("uses the customer's own limit over the default", async () => {
    const { service, fake } = setup({ khataLimit: 100 });
    fake.seedKhata(PHONE, 500, 1_000);
    const placed = await service.placeAtCounter(counterRequest({ amountPaid: 0 }), {
      staffUserId: STAFF,
    });
    expect(placed.khata?.balance).toBe(560);
  });

  it('needs a number and name to leave anything unpaid', async () => {
    const { service } = setup();
    const request = counterRequest();
    // The browser checked against what it thought the total was; the server checks for real.
    const error = await rejection(
      service.placeAtCounter(
        { ...request, amountPaid: 10, customer: { name: undefined, phone: undefined } },
        { staffUserId: STAFF },
      ),
    );
    expect(error).toMatchObject({ code: 'KHATA_DETAILS_REQUIRED', status: 422 });
  });

  it('refuses paying more than the total', async () => {
    const { service } = setup();
    const error = await rejection(
      service.placeAtCounter(counterRequest({ amountPaid: 61 }), { staffUserId: STAFF }),
    );
    expect(error.code).toBe('PAYMENT_TOO_LARGE');
  });

  it('works when the website is closed: the cashier decides', async () => {
    const { service } = setup({ at: CLOSED_NOW });
    const placed = await service.placeAtCounter(counterRequest(), { staffUserId: STAFF });
    expect(placed.status).toBe('CONFIRMED');
  });

  it('still refuses a total that moved', async () => {
    const { service } = setup();
    const error = await rejection(
      service.placeAtCounter(counterRequest({ expectedTotal: 59, amountPaid: 59 }), {
        staffUserId: STAFF,
      }),
    );
    expect(error.code).toBe('PRICE_CHANGED');
  });

  it('a repeated request returns the same order and where its money went, once', async () => {
    const { service, fake } = setup();
    const request = counterRequest({ amountPaid: 20 });
    const first = await service.placeAtCounter(request, { staffUserId: STAFF });
    const again = await service.placeAtCounter(request, { staffUserId: STAFF });
    expect(again).toMatchObject({
      id: first.id,
      amountPaid: 20,
      remaining: 40,
      khata: { id: first.khata?.id, balance: 40 },
      replayed: true,
    });
    expect(fake.state.entries).toHaveLength(1);
  });
});
