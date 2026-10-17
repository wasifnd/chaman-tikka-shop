import { describe, expect, it } from 'vitest';
import { buildQuote } from '@/features/checkout/services/quote-engine';
import { CLOSED_NOW, OPEN_NOW, coupon, ids, quoteData } from '@/features/checkout/testing/fixtures';
import type { QuoteData } from '@/features/checkout/types/quote.types';
import { createFakeOrderStore } from '../testing/fake-order-store';
import { placeOrderSchema, type PlaceOrderRequest } from '../schemas/place-order.schema';
import { createOrderService } from './order.service';
import { hashRequest } from './request-hash';

const key = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A valid request whose expectedTotal matches what the server will compute. */
function request(
  overrides: Record<string, unknown> = {},
  data: QuoteData = quoteData(),
  at: Date = OPEN_NOW,
): PlaceOrderRequest {
  const raw = {
    idempotencyKey: key(1),
    expectedTotal: 0,
    orderType: 'PICKUP',
    lines: [{ kind: 'product', productId: ids.naan, quantity: 2, variantIds: [], addonIds: [] }],
    contact: { name: 'Ali Khan', phone: '03001234567' },
    ...overrides,
  };
  const parsed = placeOrderSchema.parse(raw);
  if (!('expectedTotal' in overrides)) {
    parsed.expectedTotal = buildQuote(parsed, data, at).grandTotal;
  }
  return parsed;
}

function setup(
  options: {
    data?: QuoteData;
    at?: Date;
    couponRemaining?: Record<string, number>;
    failAt?: 'createOrder' | 'recordOrderCreated' | 'completeIdempotencyKey';
  } = {},
) {
  const data = options.data ?? quoteData();
  const fake = createFakeOrderStore({
    data: () => data,
    ...(options.couponRemaining ? { couponRemaining: options.couponRemaining } : {}),
    ...(options.failAt ? { failAt: options.failAt } : {}),
  });
  let clock = options.at ?? OPEN_NOW;
  const service = createOrderService(fake.store, () => clock);
  return {
    fake,
    service,
    data,
    setClock: (next: Date) => {
      clock = next;
    },
  };
}

const none = { customerId: null };

async function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error('expected the promise to reject');
    },
    (error: unknown) => error as { code: string; status: number; details?: Record<string, string> },
  );
}

describe('placing an order', () => {
  it('writes the order, its history, its event and completes the key', async () => {
    const { service, fake } = setup();
    const placed = await service.place(request(), none);

    expect(placed).toMatchObject({
      orderNumber: 'BBQ-2026-0001',
      status: 'RECEIVED',
      type: 'PICKUP',
      grandTotal: 60,
      replayed: false,
    });
    expect(placed.trackingToken).toBeTruthy();

    expect(fake.state.orders).toHaveLength(1);
    expect(fake.state.orders[0]).toMatchObject({
      grandTotal: 60,
      paymentMethod: 'CASH_AT_RESTAURANT',
    });
    expect(fake.state.history).toEqual([{ orderId: placed.id, status: 'RECEIVED', at: OPEN_NOW }]);
    expect(fake.state.events).toEqual([
      { orderId: placed.id, type: 'order.created', at: OPEN_NOW },
    ]);
    expect(fake.state.keys.get(key(1))?.orderId).toBe(placed.id);
  });

  it('numbers orders one after another', async () => {
    const { service } = setup();
    const first = await service.place(request({ idempotencyKey: key(1) }), none);
    const second = await service.place(request({ idempotencyKey: key(2) }), none);
    expect([first.orderNumber, second.orderNumber]).toEqual(['BBQ-2026-0001', 'BBQ-2026-0002']);
  });

  it('starts a new sequence in a new year, using Lahore time', async () => {
    const { service, setClock } = setup();
    await service.place(request({ idempotencyKey: key(1) }), none);
    // 20:00 UTC on 31 Dec is already 1 Jan in Lahore.
    const newYear = new Date('2026-12-31T20:00:00Z');
    setClock(newYear);
    const placed = await service.place(
      request({ idempotencyKey: key(2) }, quoteData(), newYear),
      none,
    );
    expect(placed.orderNumber).toBe('BBQ-2027-0001');
  });

  it('prices on the server and stores a delivery order with its address', async () => {
    const { service, fake } = setup();
    const placed = await service.place(
      request({
        orderType: 'DELIVERY',
        zoneId: ids.zone,
        address: { line1: 'House 12, Street 4' },
        lines: [
          { kind: 'product', productId: ids.naan, quantity: 2, variantIds: [], addonIds: [] },
        ],
      }),
      none,
    );
    expect(placed.grandTotal).toBe(160); // 60 + Rs. 100 delivery
    expect(fake.state.orders[0]).toMatchObject({
      paymentMethod: 'COD',
      deliveryCharge: 100,
      deliveryAddress: { line1: 'House 12, Street 4', area: 'Johar Town' },
    });
  });

  it('links the order to the signed-in customer', async () => {
    const { service, fake } = setup();
    await service.place(request(), { customerId: ids.customer });
    expect(fake.state.orders[0]?.customerId).toBe(ids.customer);
  });

  it('runs its steps in a safe order, taking the order number late', async () => {
    const { service, fake } = setup();
    await service.place(request(), none);
    expect(fake.calls).toEqual(['claim', 'load', 'sequence', 'create', 'record', 'complete']);
  });
});

describe('retries and duplicate submits', () => {
  it('returns the same order for the same key and request, creating nothing new', async () => {
    const { service, fake } = setup();
    const first = await service.place(request(), none);
    const again = await service.place(request(), none);

    expect(again).toMatchObject({ id: first.id, orderNumber: first.orderNumber, replayed: true });
    expect(fake.state.orders).toHaveLength(1);
    expect(fake.state.history).toHaveLength(1);
    expect(fake.state.counters.get(2026)).toBe(1);
  });

  it('does not redeem the coupon a second time on a replay', async () => {
    const { service, fake } = setup({ data: quoteData({ coupon: coupon() }) });
    const withCoupon = request({ couponCode: 'save100' }, quoteData({ coupon: coupon() }));
    await service.place(withCoupon, none);
    await service.place(withCoupon, none);
    expect(fake.state.redemptions.get('coupon-1')).toBe(1);
  });

  it('refuses the same key used for a different order', async () => {
    const { service, fake } = setup();
    await service.place(request(), none);
    const different = request({
      lines: [{ kind: 'product', productId: ids.naan, quantity: 5, variantIds: [], addonIds: [] }],
    });
    const error = await rejection(service.place(different, none));
    expect(error).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', status: 409 });
    expect(fake.state.orders).toHaveLength(1);
  });

  it("does not reveal another customer's order to a request that merely reuses its key", async () => {
    const { service } = setup();
    await service.place(request(), none);
    const stranger = request({ contact: { name: 'Mallory', phone: '03111234567' } });
    const error = await rejection(service.place(stranger, none));
    expect(error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('asks the caller to wait while the first attempt is still running', async () => {
    const { service, fake } = setup();
    const { idempotencyKey: _key, ...rest } = request();
    fake.claimInFlight(key(1), hashRequest(rest));
    const error = await rejection(service.place(request(), none));
    expect(error).toMatchObject({ code: 'ORDER_IN_PROGRESS', status: 409 });
    expect(fake.state.orders).toHaveLength(0);
  });
});

describe('refusing bad orders', () => {
  it('rejects a cart that cannot be sold and leaves nothing behind', async () => {
    const { service, fake } = setup({ at: CLOSED_NOW });
    const error = await rejection(service.place(request(), none));
    expect(error).toMatchObject({ code: 'CART_INVALID', status: 409 });
    expect(error.details).toHaveProperty('RESTAURANT_CLOSED');
    expect(fake.state.orders).toHaveLength(0);
    expect(fake.state.keys.size).toBe(0);
    expect(fake.state.counters.size).toBe(0);
  });

  it('lets the same key be used again once the problem is fixed', async () => {
    const { service, setClock, fake } = setup({ at: CLOSED_NOW });
    await rejection(service.place(request(), none));
    setClock(OPEN_NOW);
    const placed = await service.place(request(), none);
    expect(placed.replayed).toBe(false);
    expect(fake.state.orders).toHaveLength(1);
  });

  it('reports every blocking problem once', async () => {
    const { service } = setup({ at: CLOSED_NOW });
    const error = await rejection(
      service.place(
        request({
          orderType: 'DELIVERY',
          zoneId: ids.zone,
          address: { line1: 'House 12, Street 4' },
          lines: [
            { kind: 'product', productId: ids.tikka, quantity: 1, variantIds: [], addonIds: [] },
          ],
        }),
        none,
      ),
    );
    expect(Object.keys(error.details ?? {}).sort()).toEqual([
      'MISSING_REQUIRED_OPTION',
      'RESTAURANT_CLOSED',
    ]);
  });

  it('refuses when the price changed since the customer saw it, and says the new total', async () => {
    const { service, fake } = setup();
    const error = await rejection(service.place(request({ expectedTotal: 50 }), none));
    expect(error).toMatchObject({ code: 'PRICE_CHANGED', status: 409, details: { total: '60' } });
    expect(fake.state.orders).toHaveLength(0);
    expect(fake.state.counters.size).toBe(0);
  });

  it('compares totals exactly, to the paisa', async () => {
    const { service } = setup();
    expect((await rejection(service.place(request({ expectedTotal: 60.01 }), none))).code).toBe(
      'PRICE_CHANGED',
    );
    expect((await rejection(service.place(request({ expectedTotal: 59.99 }), none))).code).toBe(
      'PRICE_CHANGED',
    );
    await expect(service.place(request({ expectedTotal: 60 }), none)).resolves.toMatchObject({
      grandTotal: 60,
    });
  });

  it("refuses a customer-only coupon that isn't theirs", async () => {
    const data = quoteData({ coupon: coupon({ customerId: ids.customer }) });
    const { service, fake } = setup({ data });
    // They saw no discount (coupon not theirs), so the totals agree and the order goes through
    // without the coupon rather than being discounted.
    const placed = await service.place(request({ couponCode: 'save100' }, data), {
      customerId: ids.otherCustomer,
    });
    expect(placed.grandTotal).toBe(60);
    expect(fake.state.orders[0]?.couponId).toBeNull();
    expect(fake.state.redemptions.size).toBe(0);
  });
});

describe('coupons', () => {
  const data = quoteData({ coupon: coupon() });

  it('redeems an applied coupon and records its discount', async () => {
    const { service, fake } = setup({ data });
    const placed = await service.place(
      request(
        {
          couponCode: 'save100',
          lines: [
            {
              kind: 'product',
              productId: ids.tikka,
              quantity: 1,
              variantIds: [ids.quarter],
              addonIds: [],
            },
          ],
        },
        data,
      ),
      none,
    );
    expect(placed.grandTotal).toBe(250); // 350 - 100
    expect(fake.state.orders[0]).toMatchObject({ couponId: 'coupon-1', couponDiscount: 100 });
    expect(fake.state.redemptions.get('coupon-1')).toBe(1);
  });

  it('does not redeem a rejected coupon', async () => {
    const rejected = quoteData({ coupon: coupon({ isActive: false }) });
    const { service, fake } = setup({ data: rejected });
    await service.place(request({ couponCode: 'save100' }, rejected), none);
    expect(fake.calls).not.toContain('redeem');
    expect(fake.state.orders[0]?.couponId).toBeNull();
  });

  it('fails the whole order if the last redemption was taken meanwhile, and undoes everything', async () => {
    const { service, fake } = setup({ data, couponRemaining: { 'coupon-1': 0 } });
    const error = await rejection(service.place(request({ couponCode: 'save100' }, data), none));
    expect(error).toMatchObject({ code: 'COUPON_EXHAUSTED', status: 409 });
    expect(fake.state.orders).toHaveLength(0);
    expect(fake.state.keys.size).toBe(0);
    expect(fake.state.counters.size).toBe(0);
  });

  it('lets only as many orders use a coupon as it has redemptions left', async () => {
    const { service, fake } = setup({ data, couponRemaining: { 'coupon-1': 2 } });
    const results = [] as string[];
    for (let i = 1; i <= 4; i++) {
      const outcome = await service
        .place(request({ idempotencyKey: key(i), couponCode: 'save100' }, data), none)
        .then(
          () => 'ok',
          (error: unknown) => (error as { code: string }).code,
        );
      results.push(outcome);
    }
    expect(results).toEqual(['ok', 'ok', 'COUPON_EXHAUSTED', 'COUPON_EXHAUSTED']);
    expect(fake.state.orders).toHaveLength(2);
    // Failed attempts did not use up order numbers.
    expect(fake.state.counters.get(2026)).toBe(2);
  });
});

describe('atomicity', () => {
  it.each(['createOrder', 'recordOrderCreated', 'completeIdempotencyKey'] as const)(
    'undoes everything when %s fails part-way',
    async (failAt) => {
      const { service, fake } = setup({ failAt });
      await expect(service.place(request(), none)).rejects.toThrow();
      expect(fake.state.orders).toHaveLength(0);
      expect(fake.state.history).toHaveLength(0);
      expect(fake.state.events).toHaveLength(0);
      expect(fake.state.keys.size).toBe(0);
      // The order number taken before the failure is given back too.
      expect(fake.state.counters.size).toBe(0);
    },
  );
});
