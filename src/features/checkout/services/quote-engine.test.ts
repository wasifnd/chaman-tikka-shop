import { describe, expect, it } from 'vitest';
import type { CartLineInput, IssueCode, QuoteInput } from '../types/quote.types';
import {
  CLOSED_NOW,
  EVERY_EVENING,
  OPEN_NOW,
  coupon,
  deal,
  ids,
  product,
  quoteData,
  tikka,
  withProducts,
  zone,
} from '../testing/fixtures';
import { buildQuote, isProductOrderable } from './quote-engine';

const tikkaLine = (
  overrides: Partial<Extract<CartLineInput, { kind: 'product' }>> = {},
): CartLineInput => ({
  kind: 'product',
  productId: ids.tikka,
  quantity: 1,
  variantIds: [ids.quarter],
  addonIds: [],
  ...overrides,
});
const naanLine = (quantity = 1): CartLineInput => ({
  kind: 'product',
  productId: ids.naan,
  quantity,
  variantIds: [],
  addonIds: [],
});
const dealLine = (quantity = 1): CartLineInput => ({ kind: 'deal', dealId: ids.deal, quantity });

const pickup = (lines: CartLineInput[], extra: Partial<QuoteInput> = {}): QuoteInput => ({
  lines,
  orderType: 'PICKUP',
  ...extra,
});
const delivery = (lines: CartLineInput[], extra: Partial<QuoteInput> = {}): QuoteInput => ({
  lines,
  orderType: 'DELIVERY',
  zoneId: ids.zone,
  ...extra,
});

const codes = (issues: { code: IssueCode }[]) => issues.map((i) => i.code);

describe('line pricing', () => {
  it('prices a simple product by quantity', () => {
    const quote = buildQuote(pickup([naanLine(4)]), quoteData(), OPEN_NOW);
    expect(quote.lines).toHaveLength(1);
    expect(quote.lines[0]).toMatchObject({
      name: 'Naan',
      quantity: 4,
      unitPrice: 30,
      lineTotal: 120,
    });
    expect(quote.subtotal).toBe(120);
    expect(quote.grandTotal).toBe(120);
    expect(quote.canCheckout).toBe(true);
  });

  it('adds the chosen variant and add-ons to the unit price', () => {
    const quote = buildQuote(
      pickup([
        tikkaLine({ variantIds: [ids.half], addonIds: [ids.raita, ids.chutney], quantity: 3 }),
      ]),
      quoteData(),
      OPEN_NOW,
    );
    // (350 + 330 + 50 + 30) * 3
    expect(quote.lines[0]).toMatchObject({ unitPrice: 760, lineTotal: 2280 });
    expect(quote.lines[0]?.options).toEqual(['Half', 'Raita', 'Mint chutney']);
    expect(quote.subtotal).toBe(2280);
  });

  it('sums several lines', () => {
    const quote = buildQuote(pickup([tikkaLine(), naanLine(2)]), quoteData(), OPEN_NOW);
    expect(quote.subtotal).toBe(350 + 60);
  });

  it('keeps a customer note on the line', () => {
    const quote = buildQuote(pickup([tikkaLine({ note: 'no onions' })]), quoteData(), OPEN_NOW);
    expect(quote.lines[0]?.note).toBe('no onions');
  });

  it('uses a lower discount price and ignores one that is not lower', () => {
    const discounted = quoteData({
      products: withProducts(tikka({ discountPrice: 300 })),
    });
    expect(buildQuote(pickup([tikkaLine()]), discounted, OPEN_NOW).subtotal).toBe(300);

    const notLower = quoteData({ products: withProducts(tikka({ discountPrice: 400 })) });
    expect(buildQuote(pickup([tikkaLine()]), notLower, OPEN_NOW).subtotal).toBe(350);
  });

  it('is exact with fractional prices that break floating point', () => {
    const data = quoteData({
      products: withProducts(product({ id: ids.naan, basePrice: 19.99 })),
    });
    const quote = buildQuote(pickup([naanLine(3)]), data, OPEN_NOW);
    expect(quote.subtotal).toBe(59.97);
    expect(quote.grandTotal).toBe(59.97);
  });

  it('prices a deal at its own price, not the sum of its items', () => {
    const quote = buildQuote(pickup([dealLine(2)]), quoteData(), OPEN_NOW);
    expect(quote.lines[0]).toMatchObject({ kind: 'deal', unitPrice: 1350, lineTotal: 2700 });
    expect(quote.subtotal).toBe(2700);
  });
});

describe('order snapshots', () => {
  it('records exactly which variants and add-ons were priced, with their prices', () => {
    const quote = buildQuote(
      pickup([tikkaLine({ variantIds: [ids.half], addonIds: [ids.raita, ids.chutney] })]),
      quoteData(),
      OPEN_NOW,
    );
    expect(quote.lines[0]?.variants).toEqual([{ id: ids.half, name: 'Half', priceModifier: 330 }]);
    expect(quote.lines[0]?.addons).toEqual([
      { id: ids.raita, name: 'Raita', price: 50 },
      { id: ids.chutney, name: 'Mint chutney', price: 30 },
    ]);
    expect(quote.lines[0]?.dealItems).toEqual([]);
  });

  it('carries the preparation time of products and deals', () => {
    const quote = buildQuote(pickup([naanLine(), dealLine()]), quoteData(), OPEN_NOW);
    expect(quote.lines[0]?.preparationTime).toBe(15);
    expect(quote.lines[1]?.preparationTime).toBe(25);
  });

  it('copies what a deal contains so the kitchen knows what to make', () => {
    const quote = buildQuote(pickup([dealLine()]), quoteData(), OPEN_NOW);
    expect(quote.lines[0]?.dealItems).toEqual([
      { productName: 'Chicken Tikka', variantName: null, quantity: 2 },
      { productName: 'Naan', variantName: null, quantity: 4 },
    ]);
    expect(quote.lines[0]?.variants).toEqual([]);
  });

  it('gives plain products empty option snapshots', () => {
    const quote = buildQuote(pickup([naanLine()]), quoteData(), OPEN_NOW);
    expect(quote.lines[0]).toMatchObject({ variants: [], addons: [], dealItems: [] });
  });
});

describe('option validation', () => {
  const rejected = (line: CartLineInput, code: IssueCode, data = quoteData()) => {
    const quote = buildQuote(pickup([line]), data, OPEN_NOW);
    expect(codes(quote.issues)).toContain(code);
    expect(quote.canCheckout).toBe(false);
    expect(quote.lines).toHaveLength(0);
    expect(quote.subtotal).toBe(0);
    expect(quote.issues[0]?.lineIndex).toBe(0);
  };

  it('requires a choice for required groups', () => {
    rejected(tikkaLine({ variantIds: [] }), 'MISSING_REQUIRED_OPTION');
  });

  it('rejects unknown, unavailable and foreign variants', () => {
    rejected(tikkaLine({ variantIds: ['99999999-9999-4999-8999-999999999999'] }), 'INVALID_OPTION');
    rejected(tikkaLine({ variantIds: [ids.soldOutSize] }), 'INVALID_OPTION');
  });

  it('rejects two choices from the same group', () => {
    rejected(tikkaLine({ variantIds: [ids.quarter, ids.full] }), 'INVALID_OPTION');
  });

  it('rejects add-ons that are unknown, unavailable or repeated', () => {
    rejected(tikkaLine({ addonIds: ['99999999-9999-4999-8999-999999999999'] }), 'INVALID_OPTION');
    rejected(tikkaLine({ addonIds: [ids.offMenuAddon] }), 'INVALID_OPTION');
    rejected(tikkaLine({ addonIds: [ids.raita, ids.raita] }), 'INVALID_OPTION');
  });

  it('rejects options that belong to another product', () => {
    const line: CartLineInput = {
      kind: 'product',
      productId: ids.naan,
      quantity: 1,
      variantIds: [ids.half],
      addonIds: [ids.raita],
    };
    rejected(line, 'INVALID_OPTION');
  });

  it('treats a required group with nothing available as an unavailable product', () => {
    const allGone = tikka({
      variantGroups: [
        {
          id: ids.portion,
          name: 'Portion',
          isRequired: true,
          variants: [{ id: ids.quarter, name: 'Quarter', priceModifier: 0, isAvailable: false }],
        },
      ],
    });
    rejected(tikkaLine(), 'PRODUCT_UNAVAILABLE', quoteData({ products: withProducts(allGone) }));
  });

  it('rejects a negative final price', () => {
    const broken = tikka({
      variantGroups: [
        {
          id: ids.portion,
          name: 'Portion',
          isRequired: true,
          variants: [{ id: ids.quarter, name: 'Quarter', priceModifier: -500, isAvailable: true }],
        },
      ],
    });
    rejected(tikkaLine(), 'INVALID_OPTION', quoteData({ products: withProducts(broken) }));
  });

  it('allows a modifier that lowers the price but stays positive', () => {
    const cheaper = tikka({
      variantGroups: [
        {
          id: ids.portion,
          name: 'Portion',
          isRequired: true,
          variants: [{ id: ids.quarter, name: 'Mini', priceModifier: -50, isAvailable: true }],
        },
      ],
    });
    const quote = buildQuote(
      pickup([tikkaLine()]),
      quoteData({ products: withProducts(cheaper) }),
      OPEN_NOW,
    );
    expect(quote.subtotal).toBe(300);
  });
});

describe('availability', () => {
  const hiddenCases: [string, Partial<ReturnType<typeof tikka>>][] = [
    ['inactive', { isActive: false }],
    ['category hidden', { categoryActive: false }],
    ['switched off', { isAvailable: false }],
    ['out of stock', { stockStatus: 'OUT_OF_STOCK' }],
  ];

  it.each(hiddenCases)('rejects a product that is %s', (_name, overrides) => {
    const data = quoteData({ products: withProducts(tikka(overrides)) });
    const quote = buildQuote(pickup([tikkaLine()]), data, OPEN_NOW);
    expect(codes(quote.issues)).toEqual(['PRODUCT_UNAVAILABLE']);
    expect(quote.canCheckout).toBe(false);
  });

  it('still sells LIMITED stock', () => {
    const data = quoteData({ products: withProducts(tikka({ stockStatus: 'LIMITED' })) });
    expect(buildQuote(pickup([tikkaLine()]), data, OPEN_NOW).canCheckout).toBe(true);
  });

  it('rejects a product id that no longer exists', () => {
    const quote = buildQuote(
      pickup([
        { kind: 'product', productId: ids.drink, quantity: 1, variantIds: [], addonIds: [] },
      ]),
      quoteData({ products: withProducts(tikka()) }),
      OPEN_NOW,
    );
    expect(codes(quote.issues)).toEqual(['PRODUCT_NOT_FOUND']);
  });

  it('exposes isProductOrderable for reuse', () => {
    expect(isProductOrderable(tikka())).toBe(true);
    expect(isProductOrderable(tikka({ stockStatus: 'OUT_OF_STOCK' }))).toBe(false);
  });

  const dealCases: [string, Parameters<typeof deal>[0]][] = [
    ['inactive', { isActive: false }],
    ['switched off', { isAvailable: false }],
    ['not started', { startDate: new Date('2026-11-01T00:00:00Z') }],
    ['ended', { endDate: new Date('2026-10-01T00:00:00Z') }],
    ['missing an item', { itemsOrderable: false }],
  ];

  it.each(dealCases)('rejects a deal that is %s', (_name, overrides) => {
    const data = quoteData({ deals: new Map([[ids.deal, deal(overrides)]]) });
    expect(codes(buildQuote(pickup([dealLine()]), data, OPEN_NOW).issues)).toEqual([
      'DEAL_UNAVAILABLE',
    ]);
  });

  it('accepts a deal inside its window and rejects an unknown deal', () => {
    const live = quoteData({
      deals: new Map([
        [
          ids.deal,
          deal({
            startDate: new Date('2026-10-01T00:00:00Z'),
            endDate: new Date('2026-11-01T00:00:00Z'),
          }),
        ],
      ]),
    });
    expect(buildQuote(pickup([dealLine()]), live, OPEN_NOW).canCheckout).toBe(true);
    expect(
      codes(buildQuote(pickup([dealLine()]), quoteData({ deals: new Map() }), OPEN_NOW).issues),
    ).toEqual(['DEAL_NOT_FOUND']);
  });

  it('prices the good lines and flags only the bad one', () => {
    const data = quoteData({
      products: withProducts(tikka(), product({ id: ids.naan, isActive: false })),
    });
    const quote = buildQuote(pickup([tikkaLine(), naanLine()]), data, OPEN_NOW);
    expect(quote.subtotal).toBe(350);
    expect(quote.lines).toHaveLength(1);
    expect(quote.issues).toHaveLength(1);
    expect(quote.issues[0]).toMatchObject({ code: 'PRODUCT_UNAVAILABLE', lineIndex: 1 });
    expect(quote.canCheckout).toBe(false);
  });
});

describe('empty cart', () => {
  it('is flagged and costs nothing, even for delivery', () => {
    const quote = buildQuote(delivery([]), quoteData(), OPEN_NOW);
    expect(codes(quote.issues)).toEqual(['EMPTY_CART']);
    expect(quote.deliveryCharge).toBe(0);
    expect(quote.grandTotal).toBe(0);
    expect(quote.canCheckout).toBe(false);
  });
});

describe('coupons', () => {
  const withCoupon = (
    c: ReturnType<typeof coupon> | null,
    extra: Partial<QuoteInput> = {},
    lines = [tikkaLine({ quantity: 2 })],
  ) =>
    buildQuote(
      pickup(lines, { couponCode: 'save100', ...extra }),
      quoteData({ coupon: c }),
      OPEN_NOW,
    );

  it('does nothing when no code is entered', () => {
    const quote = buildQuote(pickup([tikkaLine()]), quoteData({ coupon: coupon() }), OPEN_NOW);
    expect(quote.coupon).toBeNull();
    expect(quote.couponDiscount).toBe(0);
  });

  it('applies a fixed amount and normalises the code', () => {
    const quote = withCoupon(coupon());
    expect(quote.coupon).toEqual({ code: 'SAVE100', applied: true, discount: 100 });
    expect(quote.subtotal).toBe(700);
    expect(quote.grandTotal).toBe(600);
  });

  it('never discounts more than the food costs', () => {
    const quote = withCoupon(coupon({ amount: 5000 }), {}, [naanLine()]);
    expect(quote.couponDiscount).toBe(30);
    expect(quote.grandTotal).toBe(0);
  });

  it('applies percentage coupons with exact rounding', () => {
    // 10% of 700
    expect(withCoupon(coupon({ type: 'PERCENTAGE', amount: 10 })).couponDiscount).toBe(70);
    // 15% of 30 = 4.5
    expect(
      withCoupon(coupon({ type: 'PERCENTAGE', amount: 15 }), {}, [naanLine()]).couponDiscount,
    ).toBe(4.5);
  });

  it('caps a percentage over 100 and ignores a negative amount', () => {
    expect(withCoupon(coupon({ type: 'PERCENTAGE', amount: 250 })).couponDiscount).toBe(700);
    expect(withCoupon(coupon({ type: 'FIXED', amount: -50 })).couponDiscount).toBe(0);
  });

  const rejections: [string, ReturnType<typeof coupon> | null, string][] = [
    ['unknown', null, 'NOT_FOUND'],
    ['inactive', coupon({ isActive: false }), 'INACTIVE'],
    ['expired', coupon({ expiresAt: new Date('2026-10-01T00:00:00Z') }), 'EXPIRED'],
    ['expiring right now', coupon({ expiresAt: OPEN_NOW }), 'EXPIRED'],
    ['used up', coupon({ usageLimit: 5, usedCount: 5 }), 'USAGE_LIMIT'],
    ['over-used', coupon({ usageLimit: 5, usedCount: 9 }), 'USAGE_LIMIT'],
    ['below its minimum', coupon({ minimumOrderAmount: 1000 }), 'MIN_ORDER'],
  ];

  it.each(rejections)(
    'rejects a coupon that is %s without blocking checkout',
    (_name, data, reason) => {
      const quote = withCoupon(data);
      expect(quote.coupon).toMatchObject({ applied: false, reason, discount: 0 });
      expect(quote.couponDiscount).toBe(0);
      expect(quote.grandTotal).toBe(700);
      expect(quote.canCheckout).toBe(true);
    },
  );

  it('accepts a coupon exactly at its limit and minimum', () => {
    expect(withCoupon(coupon({ usageLimit: 5, usedCount: 4 })).coupon?.applied).toBe(true);
    expect(withCoupon(coupon({ minimumOrderAmount: 700 })).coupon?.applied).toBe(true);
  });

  it('keeps customer-only coupons private', () => {
    const mine = coupon({ customerId: ids.customer });
    expect(withCoupon(mine).coupon).toMatchObject({ applied: false, reason: 'LOGIN_REQUIRED' });
    expect(withCoupon(mine, { customerId: ids.otherCustomer }).coupon).toMatchObject({
      applied: false,
      reason: 'NOT_FOUND',
    });
    expect(withCoupon(mine, { customerId: ids.customer }).coupon?.applied).toBe(true);
  });

  it('does not apply to an empty cart', () => {
    const quote = withCoupon(coupon(), {}, []);
    expect(quote.coupon).toMatchObject({ applied: false, reason: 'MIN_ORDER' });
  });

  it('only discounts food, never the delivery charge', () => {
    const quote = buildQuote(
      delivery([tikkaLine({ quantity: 2 })], { couponCode: 'SAVE100' }),
      quoteData({ coupon: coupon() }),
      OPEN_NOW,
    );
    expect(quote.deliveryCharge).toBe(100);
    expect(quote.grandTotal).toBe(700 - 100 + 100);
  });
});

describe('delivery', () => {
  it('charges nothing for pickup and dine-in, even if a zone is sent', () => {
    for (const orderType of ['PICKUP', 'DINE_IN'] as const) {
      const quote = buildQuote(
        { lines: [tikkaLine()], orderType, zoneId: ids.zone },
        quoteData(),
        OPEN_NOW,
      );
      expect(quote.deliveryCharge).toBe(0);
      expect(quote.freeDeliveryRemaining).toBeNull();
      expect(quote.canCheckout).toBe(true);
    }
  });

  it('requires an area for delivery', () => {
    const quote = buildQuote(
      { lines: [tikkaLine()], orderType: 'DELIVERY' },
      quoteData(),
      OPEN_NOW,
    );
    expect(codes(quote.issues)).toEqual(['ZONE_REQUIRED']);
    expect(quote.canCheckout).toBe(false);
  });

  it('rejects an area that is unknown, mismatched or inactive', () => {
    for (const data of [
      quoteData({ zone: null }),
      quoteData({ zone: zone({ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }) }),
      quoteData({ zone: zone({ isActive: false }) }),
    ]) {
      expect(codes(buildQuote(delivery([tikkaLine()]), data, OPEN_NOW).issues)).toEqual([
        'ZONE_INVALID',
      ]);
    }
  });

  it('adds the zone charge', () => {
    const quote = buildQuote(delivery([tikkaLine()]), quoteData(), OPEN_NOW);
    expect(quote.deliveryCharge).toBe(100);
    expect(quote.grandTotal).toBe(450);
  });

  it('shows how much more unlocks free delivery', () => {
    const quote = buildQuote(delivery([tikkaLine()]), quoteData(), OPEN_NOW);
    expect(quote.freeDeliveryRemaining).toBe(2000 - 350);
  });

  it('is free at exactly the threshold and above it', () => {
    const atThreshold = quoteData({ zone: zone({ freeDeliveryAbove: 350 }) });
    expect(buildQuote(delivery([tikkaLine()]), atThreshold, OPEN_NOW).deliveryCharge).toBe(0);
    const above = quoteData({ zone: zone({ freeDeliveryAbove: 300 }) });
    const quote = buildQuote(delivery([tikkaLine()]), above, OPEN_NOW);
    expect(quote.deliveryCharge).toBe(0);
    expect(quote.freeDeliveryRemaining).toBeNull();
  });

  it('judges free delivery before the coupon, so a coupon cannot make delivery cost money', () => {
    const data = quoteData({ zone: zone({ freeDeliveryAbove: 700 }), coupon: coupon() });
    const quote = buildQuote(
      delivery([tikkaLine({ quantity: 2 })], { couponCode: 'SAVE100' }),
      data,
      OPEN_NOW,
    );
    expect(quote.deliveryCharge).toBe(0);
    expect(quote.grandTotal).toBe(600);
  });

  it('never offers free delivery when the zone has no threshold', () => {
    const quote = buildQuote(
      delivery([tikkaLine()]),
      quoteData({ zone: zone({ freeDeliveryAbove: null }) }),
      OPEN_NOW,
    );
    expect(quote.deliveryCharge).toBe(100);
    expect(quote.freeDeliveryRemaining).toBeNull();
  });

  it('enforces the zone minimum order, exactly at the boundary', () => {
    const data = quoteData({ zone: zone({ minOrderAmount: 500 }) });
    const below = buildQuote(delivery([tikkaLine()]), data, OPEN_NOW);
    expect(codes(below.issues)).toEqual(['BELOW_MINIMUM']);
    expect(below.issues[0]?.message).toContain('Rs. 500');

    const exact = buildQuote(delivery([tikkaLine(), naanLine(5)]), data, OPEN_NOW);
    expect(exact.subtotal).toBe(500);
    expect(exact.canCheckout).toBe(true);
  });

  it('does not apply the delivery minimum to pickup', () => {
    const data = quoteData({ zone: zone({ minOrderAmount: 5000 }) });
    expect(
      buildQuote(pickup([tikkaLine()], { zoneId: ids.zone }), data, OPEN_NOW).canCheckout,
    ).toBe(true);
  });
});

describe('tax', () => {
  it('is zero at 0%', () => {
    expect(buildQuote(pickup([tikkaLine()]), quoteData(), OPEN_NOW).taxAmount).toBe(0);
  });

  it('is charged on food after the coupon, not on delivery', () => {
    const data = quoteData({
      settings: { taxRatePercent: 16, orderingEnabled: true },
      coupon: coupon(),
    });
    const quote = buildQuote(
      delivery([tikkaLine({ quantity: 2 })], { couponCode: 'SAVE100' }),
      data,
      OPEN_NOW,
    );
    // food 700 - 100 = 600; tax 16% = 96; delivery 100 untaxed
    expect(quote.taxAmount).toBe(96);
    expect(quote.grandTotal).toBe(600 + 96 + 100);
  });

  it('rounds to the nearest paisa', () => {
    const data = quoteData({
      settings: { taxRatePercent: 16, orderingEnabled: true },
      products: withProducts(product({ id: ids.naan, basePrice: 19.99 })),
    });
    // 16% of 19.99 = 3.1984 -> 3.20
    expect(buildQuote(pickup([naanLine()]), data, OPEN_NOW).taxAmount).toBe(3.2);
  });
});

describe('opening hours and ordering switch', () => {
  it('blocks checkout outside opening hours but still prices the cart', () => {
    const quote = buildQuote(pickup([tikkaLine()]), quoteData(), CLOSED_NOW);
    expect(codes(quote.issues)).toEqual(['RESTAURANT_CLOSED']);
    expect(quote.grandTotal).toBe(350);
    expect(quote.canCheckout).toBe(false);
  });

  it('stays open after midnight and closes at 02:00 sharp', () => {
    const lastMinute = new Date('2026-10-16T20:59:00Z'); // Saturday 01:59 in Lahore
    const closing = new Date('2026-10-16T21:00:00Z'); // Saturday 02:00 in Lahore
    expect(buildQuote(pickup([tikkaLine()]), quoteData(), lastMinute).canCheckout).toBe(true);
    expect(codes(buildQuote(pickup([tikkaLine()]), quoteData(), closing).issues)).toEqual([
      'RESTAURANT_CLOSED',
    ]);
  });

  it('is closed on a day marked closed', () => {
    const hours = { ...EVERY_EVENING, 5: { isClosed: true, openTime: null, closeTime: null } };
    expect(codes(buildQuote(pickup([tikkaLine()]), quoteData({ hours }), OPEN_NOW).issues)).toEqual(
      ['RESTAURANT_CLOSED'],
    );
  });

  it('reports a paused shop instead of the opening hours', () => {
    const data = quoteData({ settings: { taxRatePercent: 0, orderingEnabled: false } });
    const quote = buildQuote(pickup([tikkaLine()]), data, CLOSED_NOW);
    expect(codes(quote.issues)).toEqual(['ORDERING_DISABLED']);
    expect(quote.canCheckout).toBe(false);
  });
});

describe('purity', () => {
  it('does not change its inputs and gives the same answer twice', () => {
    const input = delivery([tikkaLine({ addonIds: [ids.raita] }), naanLine(2)], {
      couponCode: 'save100',
    });
    const data = quoteData({ coupon: coupon() });
    const snapshot = JSON.stringify(input);
    const first = buildQuote(input, data, OPEN_NOW);
    const second = buildQuote(input, data, OPEN_NOW);
    expect(second).toEqual(first);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('invariants over many random carts', () => {
  // Small deterministic PRNG so failures are reproducible.
  function rng(seed: number) {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }
  const pick = <T>(random: () => number, items: readonly T[]): T =>
    items[Math.floor(random() * items.length)] as T;
  const decimals = (n: number) => Math.round(n * 100) / 100 === n;

  it('always adds up exactly, never goes negative, and never exceeds two decimals', () => {
    const random = rng(42);
    const prices = [0.5, 9.99, 19.99, 30, 33.33, 350, 1234.56];
    const taxRates = [0, 5, 13, 16, 17.5];

    for (let run = 0; run < 400; run++) {
      const items = prices
        .slice(0, 1 + Math.floor(random() * prices.length))
        .map((price, i) =>
          product({ id: `00000000-0000-4000-8000-00000000000${String(i)}`, basePrice: price }),
        );
      const lines: CartLineInput[] = items
        .filter(() => random() > 0.3)
        .map((p) => ({
          kind: 'product' as const,
          productId: p.id,
          quantity: 1 + Math.floor(random() * 20),
          variantIds: [],
          addonIds: [],
        }));
      const data = quoteData({
        products: withProducts(...items),
        zone: zone({
          charge: pick(random, [0, 49.5, 100, 150]),
          freeDeliveryAbove: pick(random, [null, 500, 2000]),
        }),
        coupon: coupon({
          type: pick(random, ['FIXED', 'PERCENTAGE'] as const),
          amount: pick(random, [10, 33.33, 100, 15, 500]),
        }),
        settings: { taxRatePercent: pick(random, taxRates), orderingEnabled: true },
      });
      const quote = buildQuote(
        {
          lines,
          orderType: pick(random, ['DELIVERY', 'PICKUP', 'DINE_IN'] as const),
          zoneId: ids.zone,
          couponCode: random() > 0.5 ? 'SAVE100' : null,
        },
        data,
        OPEN_NOW,
      );

      const lineSum = quote.lines.reduce((sum, l) => sum + Math.round(l.lineTotal * 100), 0);
      expect(lineSum).toBe(Math.round(quote.subtotal * 100));
      expect(quote.couponDiscount).toBeLessThanOrEqual(quote.subtotal);
      const expectedGrand =
        Math.round(quote.subtotal * 100) -
        Math.round(quote.couponDiscount * 100) +
        Math.round(quote.deliveryCharge * 100) +
        Math.round(quote.taxAmount * 100);
      expect(Math.round(quote.grandTotal * 100)).toBe(expectedGrand);
      for (const amount of [
        quote.subtotal,
        quote.couponDiscount,
        quote.deliveryCharge,
        quote.taxAmount,
        quote.grandTotal,
      ]) {
        expect(amount).toBeGreaterThanOrEqual(0);
        expect(decimals(amount)).toBe(true);
      }
    }
  });
});
