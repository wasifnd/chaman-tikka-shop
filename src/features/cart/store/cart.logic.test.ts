import { describe, expect, it } from 'vitest';
import { MAX_CART_LINES, MAX_LINE_QUANTITY } from '@/features/checkout/schemas/quote.schema';
import {
  addItem,
  clearItems,
  emptyCart,
  itemCount,
  lineKey,
  parsePersistedCart,
  removeItem,
  setCoupon,
  setOrderType,
  setQuantity,
  setZone,
  toQuoteRequest,
  type CartState,
  type NewCartItem,
} from './cart.logic';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const product = (
  overrides: Partial<Extract<NewCartItem, { kind: 'product' }>> = {},
): NewCartItem => ({
  kind: 'product',
  productId: uuid(1),
  name: 'Chicken Tikka',
  unitPrice: 350,
  quantity: 1,
  variantIds: [],
  addonIds: [],
  optionLabels: [],
  ...overrides,
});
const deal = (quantity = 1): NewCartItem => ({
  kind: 'deal',
  dealId: uuid(9),
  name: 'Family Platter',
  unitPrice: 1350,
  quantity,
});

describe('lineKey', () => {
  it('is the same for the same dish regardless of the order options were picked', () => {
    const a = lineKey(product({ variantIds: [uuid(2), uuid(3)], addonIds: [uuid(5), uuid(4)] }));
    const b = lineKey(product({ variantIds: [uuid(3), uuid(2)], addonIds: [uuid(4), uuid(5)] }));
    expect(a).toBe(b);
  });

  it('differs for different products, options, add-ons or notes', () => {
    const base = lineKey(product());
    expect(lineKey(product({ productId: uuid(7) }))).not.toBe(base);
    expect(lineKey(product({ variantIds: [uuid(2)] }))).not.toBe(base);
    expect(lineKey(product({ addonIds: [uuid(2)] }))).not.toBe(base);
    expect(lineKey(product({ note: 'no onions' }))).not.toBe(base);
  });

  it('ignores case and surrounding spaces in notes', () => {
    expect(lineKey(product({ note: ' No Onions ' }))).toBe(lineKey(product({ note: 'no onions' })));
  });

  it('keys deals by id only', () => {
    expect(lineKey(deal(1))).toBe(lineKey(deal(5)));
  });
});

describe('addItem', () => {
  it('adds a new line with a derived key', () => {
    const state = addItem(emptyCart, product({ quantity: 2 }));
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ quantity: 2, key: lineKey(product()) });
  });

  it('merges an identical dish into one line', () => {
    let state = addItem(emptyCart, product({ quantity: 2 }));
    state = addItem(state, product({ quantity: 3 }));
    expect(state.items).toHaveLength(1);
    expect(state.items[0]?.quantity).toBe(5);
  });

  it('keeps different options as separate lines', () => {
    let state = addItem(emptyCart, product({ variantIds: [uuid(2)] }));
    state = addItem(state, product({ variantIds: [uuid(3)] }));
    expect(state.items).toHaveLength(2);
  });

  it('caps a line at the maximum quantity, both when adding and when merging', () => {
    const big = addItem(emptyCart, product({ quantity: 999 }));
    expect(big.items[0]?.quantity).toBe(MAX_LINE_QUANTITY);
    const merged = addItem(
      addItem(emptyCart, product({ quantity: 15 })),
      product({ quantity: 15 }),
    );
    expect(merged.items[0]?.quantity).toBe(MAX_LINE_QUANTITY);
  });

  it('refuses a new line beyond the line limit but still merges into existing ones', () => {
    let state: CartState = emptyCart;
    for (let i = 0; i < MAX_CART_LINES; i++)
      state = addItem(state, product({ productId: uuid(100 + i) }));
    expect(state.items).toHaveLength(MAX_CART_LINES);

    const over = addItem(state, product({ productId: uuid(999) }));
    expect(over).toBe(state);

    const merged = addItem(state, product({ productId: uuid(100), quantity: 2 }));
    expect(merged.items).toHaveLength(MAX_CART_LINES);
    expect(merged.items[0]?.quantity).toBe(3);
  });

  it('does not mutate the previous state', () => {
    const before = addItem(emptyCart, product());
    const snapshot = JSON.stringify(before);
    addItem(before, product({ quantity: 4 }));
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('adds deals', () => {
    expect(addItem(emptyCart, deal(2)).items[0]).toMatchObject({ kind: 'deal', quantity: 2 });
  });
});

describe('setQuantity / removeItem', () => {
  const state = addItem(addItem(emptyCart, product()), deal());
  const [first, second] = state.items;

  it('changes one line only', () => {
    const next = setQuantity(state, first?.key ?? '', 4);
    expect(next.items[0]?.quantity).toBe(4);
    expect(next.items[1]?.quantity).toBe(1);
  });

  it('clamps to the maximum and floors fractions', () => {
    expect(setQuantity(state, first?.key ?? '', 500).items[0]?.quantity).toBe(MAX_LINE_QUANTITY);
    expect(setQuantity(state, first?.key ?? '', 2.9).items[0]?.quantity).toBe(2);
  });

  it('removes the line for zero, negative or invalid quantities', () => {
    for (const bad of [0, -3, 0.5, Number.NaN, Number.POSITIVE_INFINITY * -1]) {
      expect(setQuantity(state, first?.key ?? '', bad).items.map((i) => i.key)).toEqual([
        second?.key,
      ]);
    }
  });

  it('ignores unknown keys', () => {
    expect(setQuantity(state, 'nope', 3).items).toEqual(state.items);
    expect(removeItem(state, 'nope').items).toEqual(state.items);
  });

  it('removes a line', () => {
    expect(removeItem(state, first?.key ?? '').items.map((i) => i.key)).toEqual([second?.key]);
  });
});

describe('order settings', () => {
  it('sets order type, zone and coupon', () => {
    let state = setOrderType(emptyCart, 'PICKUP');
    state = setZone(state, uuid(5));
    state = setCoupon(state, '  save100  ');
    expect(state).toMatchObject({ orderType: 'PICKUP', zoneId: uuid(5), couponCode: 'save100' });
  });

  it('treats a blank coupon as none and caps its length', () => {
    expect(setCoupon(emptyCart, '   ').couponCode).toBeNull();
    expect(setCoupon(emptyCart, null).couponCode).toBeNull();
    expect(setCoupon(emptyCart, 'x'.repeat(100)).couponCode).toHaveLength(40);
  });

  it('clearItems empties the basket and coupon but keeps order type and zone', () => {
    let state = addItem(emptyCart, product());
    state = setOrderType(setZone(setCoupon(state, 'SAVE'), uuid(5)), 'DELIVERY');
    expect(clearItems(state)).toEqual({
      items: [],
      orderType: 'DELIVERY',
      zoneId: uuid(5),
      couponCode: null,
    });
  });
});

describe('itemCount', () => {
  it('sums quantities across lines', () => {
    const state = addItem(addItem(emptyCart, product({ quantity: 2 })), deal(3));
    expect(itemCount(state)).toBe(5);
    expect(itemCount(emptyCart)).toBe(0);
  });
});

describe('toQuoteRequest', () => {
  it('sends what is in the cart and never any price or name', () => {
    let state = addItem(
      emptyCart,
      product({ quantity: 2, variantIds: [uuid(2)], addonIds: [uuid(3)], note: 'no onions' }),
    );
    state = addItem(state, deal(1));
    state = setZone(setCoupon(state, 'SAVE100'), uuid(5));
    const request = toQuoteRequest(state);

    expect(request).toEqual({
      lines: [
        {
          kind: 'product',
          productId: uuid(1),
          quantity: 2,
          variantIds: [uuid(2)],
          addonIds: [uuid(3)],
          note: 'no onions',
        },
        { kind: 'deal', dealId: uuid(9), quantity: 1 },
      ],
      orderType: 'DELIVERY',
      zoneId: uuid(5),
      couponCode: 'SAVE100',
    });
    const json = JSON.stringify(request);
    expect(json).not.toContain('unitPrice');
    expect(json).not.toContain('Chicken Tikka');
  });

  it('drops the zone for pickup and dine-in', () => {
    const state = setOrderType(setZone(addItem(emptyCart, product()), uuid(5)), 'PICKUP');
    expect(toQuoteRequest(state).zoneId).toBeNull();
  });

  it('omits an empty note', () => {
    expect(toQuoteRequest(addItem(emptyCart, product())).lines[0]).not.toHaveProperty('note');
  });
});

describe('parsePersistedCart', () => {
  const stored = (items: unknown[], extra: Record<string, unknown> = {}) => ({
    items,
    orderType: 'PICKUP',
    zoneId: uuid(5),
    couponCode: 'SAVE100',
    ...extra,
  });
  const validItem = () => addItem(emptyCart, product({ quantity: 2 })).items[0];

  it('restores a healthy cart', () => {
    const parsed = parsePersistedCart(stored([validItem()]));
    expect(parsed.items).toHaveLength(1);
    expect(parsed).toMatchObject({ orderType: 'PICKUP', zoneId: uuid(5), couponCode: 'SAVE100' });
  });

  it.each([null, undefined, 'text', 42, [], true])('falls back to an empty cart for %j', (raw) => {
    expect(parsePersistedCart(raw)).toEqual(emptyCart);
  });

  it('drops invalid lines but keeps the valid ones', () => {
    const parsed = parsePersistedCart(
      stored([
        validItem(),
        { kind: 'product', productId: 'not-a-uuid', name: 'x', quantity: 1 },
        { kind: 'gift' },
        null,
        'junk',
        { ...validItem(), quantity: 0 },
        { ...validItem(), quantity: 9999 },
        { ...validItem(), unitPrice: -5 },
      ]),
    );
    expect(parsed.items).toHaveLength(1);
  });

  it('re-derives keys instead of trusting stored ones, and merges duplicates', () => {
    const item = validItem();
    const parsed = parsePersistedCart(
      stored([
        { ...item, key: 'forged' },
        { ...item, key: 'other' },
      ]),
    );
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.key).toBe(lineKey(product()));
  });

  it('respects the line limit', () => {
    const many = Array.from({ length: MAX_CART_LINES + 10 }, (_, i) => ({
      ...validItem(),
      productId: uuid(1000 + i),
    }));
    expect(parsePersistedCart(stored(many)).items).toHaveLength(MAX_CART_LINES);
  });

  it('ignores a malformed items field', () => {
    expect(parsePersistedCart(stored([], { items: 'nope' })).items).toEqual([]);
    expect(parsePersistedCart({ orderType: 'PICKUP' }).items).toEqual([]);
  });

  it('falls back for a bad order type, zone or coupon', () => {
    const parsed = parsePersistedCart(
      stored([], { orderType: 'TELEPORT', zoneId: 'downtown', couponCode: 'x'.repeat(200) }),
    );
    expect(parsed).toEqual({ ...emptyCart });
  });

  it('treats a blank stored coupon as none and keeps no zone when absent', () => {
    expect(
      parsePersistedCart(stored([], { couponCode: '   ', zoneId: null })).couponCode,
    ).toBeNull();
    expect(parsePersistedCart(stored([], { zoneId: undefined })).zoneId).toBeNull();
  });
});
