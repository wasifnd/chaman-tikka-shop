import { describe, expect, it } from 'vitest';
import {
  areaFromAddress,
  describeOptions,
  mapOrderSnapshot,
  type OrderRow,
} from './order-snapshot';

const decimal = (value: string) => ({ toString: () => value });

const row: OrderRow = {
  orderNumber: 'BBQ-2026-0042',
  status: 'PREPARING',
  type: 'DELIVERY',
  createdAt: new Date('2026-10-16T14:00:00Z'),
  estimatedReadyAt: new Date('2026-10-16T14:30:00Z'),
  deliveryAddressSnapshot: {
    line1: 'House 12, Street 4',
    line2: null,
    area: 'Johar Town',
    city: 'Lahore',
    zoneId: 'z1',
  },
  subtotal: decimal('1460.00'),
  couponDiscount: decimal('0.00'),
  deliveryCharge: decimal('100.00'),
  taxAmount: decimal('0.00'),
  grandTotal: decimal('1560.00'),
  items: [
    {
      productNameSnapshot: 'Chicken Tikka',
      variantSnapshot: [{ id: 'v1', name: 'Half', priceModifier: 330 }],
      addonSnapshot: [{ id: 'a1', name: 'Raita', price: 50 }],
      quantity: 2,
      subtotal: decimal('1460.00'),
      dealId: null,
    },
  ],
  statusHistory: [
    { status: 'CONFIRMED', createdAt: new Date('2026-10-16T14:02:00Z') },
    { status: 'RECEIVED', createdAt: new Date('2026-10-16T14:00:00Z') },
    { status: 'PREPARING', createdAt: new Date('2026-10-16T14:05:00Z') },
  ],
};

describe('describeOptions', () => {
  it('lists chosen variants then add-ons for products', () => {
    expect(
      describeOptions([{ name: 'Half' }], [{ name: 'Raita' }, { name: 'Chutney' }], false),
    ).toEqual(['Half', 'Raita', 'Chutney']);
  });

  it('describes deal contents with quantity and variant', () => {
    expect(
      describeOptions(
        [
          { productName: 'Chicken Tikka', variantName: 'Full', quantity: 2 },
          { productName: 'Naan', variantName: null, quantity: 4 },
        ],
        null,
        true,
      ),
    ).toEqual(['2 × Chicken Tikka (Full)', '4 × Naan']);
  });

  it('is empty when nothing was chosen', () => {
    expect(describeOptions(null, null, false)).toEqual([]);
    expect(describeOptions([], [], true)).toEqual([]);
  });

  it('skips malformed entries instead of failing', () => {
    expect(
      describeOptions(['x', null, { name: '' }, { name: 'Half' }, 42], [{ nope: 1 }, 'y'], false),
    ).toEqual(['Half']);
    expect(describeOptions([{ productName: '' }, 'z'], undefined, true)).toEqual([]);
  });

  it('treats a deal entry without a quantity as one', () => {
    expect(describeOptions([{ productName: 'Naan' }], null, true)).toEqual(['1 × Naan']);
  });
});

describe('areaFromAddress', () => {
  it('returns only the area name', () => {
    expect(areaFromAddress(row.deliveryAddressSnapshot)).toBe('Johar Town');
  });

  it('is null for pickup orders or odd data', () => {
    expect(areaFromAddress(null)).toBeNull();
    expect(areaFromAddress('text')).toBeNull();
    expect(areaFromAddress({ area: '' })).toBeNull();
    expect(areaFromAddress({})).toBeNull();
  });
});

describe('mapOrderSnapshot', () => {
  it('maps amounts, items and the live-stream position', () => {
    const snapshot = mapOrderSnapshot(row, 7);
    expect(snapshot).toMatchObject({
      orderNumber: 'BBQ-2026-0042',
      status: 'PREPARING',
      type: 'DELIVERY',
      areaName: 'Johar Town',
      subtotal: 1460,
      deliveryCharge: 100,
      grandTotal: 1560,
      lastEventId: 7,
      createdAt: '2026-10-16T14:00:00.000Z',
      estimatedReadyAt: '2026-10-16T14:30:00.000Z',
    });
    expect(snapshot.items).toEqual([
      { name: 'Chicken Tikka', options: ['Half', 'Raita'], quantity: 2, lineTotal: 1460 },
    ]);
  });

  it('orders the timeline by time, whatever order the rows came in', () => {
    expect(mapOrderSnapshot(row, 0).timeline.map((t) => t.status)).toEqual([
      'RECEIVED',
      'CONFIRMED',
      'PREPARING',
    ]);
  });

  it('never exposes the street address, phone or email', () => {
    const json = JSON.stringify(mapOrderSnapshot(row, 0));
    expect(json).not.toContain('House 12');
    expect(json).not.toContain('phone');
    expect(json).not.toContain('email');
  });

  it('handles pickup orders with no estimate', () => {
    const snapshot = mapOrderSnapshot(
      { ...row, type: 'PICKUP', deliveryAddressSnapshot: null, estimatedReadyAt: null },
      0,
    );
    expect(snapshot.areaName).toBeNull();
    expect(snapshot.estimatedReadyAt).toBeNull();
  });

  it('marks deal lines using their contents', () => {
    const snapshot = mapOrderSnapshot(
      {
        ...row,
        items: [
          {
            productNameSnapshot: 'Family Platter',
            variantSnapshot: [{ productName: 'Naan', variantName: null, quantity: 4 }],
            addonSnapshot: null,
            quantity: 1,
            subtotal: decimal('1350'),
            dealId: 'd1',
          },
        ],
      },
      0,
    );
    expect(snapshot.items[0]?.options).toEqual(['4 × Naan']);
  });
});
