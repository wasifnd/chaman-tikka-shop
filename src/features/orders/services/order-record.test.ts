import { describe, expect, it } from 'vitest';
import { buildQuote } from '@/features/checkout/services/quote-engine';
import { OPEN_NOW, coupon, ids, quoteData } from '@/features/checkout/testing/fixtures';
import type { QuoteData } from '@/features/checkout/types/quote.types';
import { placeOrderSchema } from '../schemas/place-order.schema';
import {
  READY_BUFFER_MINUTES,
  buildOrderRecord,
  estimateReadyAt,
  paymentMethodFor,
} from './order-record';

const raw = (overrides: Record<string, unknown> = {}) => ({
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
  expectedTotal: 0,
  orderType: 'PICKUP',
  lines: [
    {
      kind: 'product',
      productId: ids.tikka,
      quantity: 2,
      variantIds: [ids.half],
      addonIds: [ids.raita],
      note: 'no onions',
    },
    { kind: 'deal', dealId: ids.deal, quantity: 1 },
  ],
  contact: { name: 'Ali Khan', phone: '0300-123 4567', email: 'Ali@Example.com' },
  instructions: 'ring twice',
  ...overrides,
});

function record(overrides: Record<string, unknown> = {}, data: QuoteData = quoteData()) {
  const request = placeOrderSchema.parse(raw(overrides));
  const quote = buildQuote(request, data, OPEN_NOW);
  return {
    quote,
    order: buildOrderRecord({
      quote,
      request,
      data,
      customerId: null,
      orderNumber: 'BBQ-2026-0001',
      now: OPEN_NOW,
    }),
  };
}

describe('paymentMethodFor', () => {
  it('collects cash on delivery for delivery and at the counter otherwise', () => {
    expect(paymentMethodFor('DELIVERY')).toBe('COD');
    expect(paymentMethodFor('PICKUP')).toBe('CASH_AT_RESTAURANT');
    expect(paymentMethodFor('DINE_IN')).toBe('CASH_AT_RESTAURANT');
  });
});

describe('estimateReadyAt', () => {
  const line = (preparationTime: number) => ({ preparationTime }) as never;

  it('is the slowest line plus the buffer', () => {
    const ready = estimateReadyAt(OPEN_NOW, [line(10), line(25), line(5)]);
    expect(ready.getTime() - OPEN_NOW.getTime()).toBe((25 + READY_BUFFER_MINUTES) * 60_000);
  });

  it('falls back to just the buffer with no lines', () => {
    expect(estimateReadyAt(OPEN_NOW, []).getTime() - OPEN_NOW.getTime()).toBe(
      READY_BUFFER_MINUTES * 60_000,
    );
  });
});

describe('buildOrderRecord', () => {
  it('copies every amount from the server quote', () => {
    const { quote, order } = record();
    expect(order).toMatchObject({
      subtotal: quote.subtotal,
      couponDiscount: quote.couponDiscount,
      deliveryCharge: quote.deliveryCharge,
      taxAmount: quote.taxAmount,
      grandTotal: quote.grandTotal,
      orderNumber: 'BBQ-2026-0001',
      status: 'RECEIVED',
    });
    // (350 + 330 + 50) * 2 + 1350
    expect(order.grandTotal).toBe(2810);
  });

  it('ignores whatever total the client claimed', () => {
    const { order } = record({ expectedTotal: 1 });
    expect(order.grandTotal).toBe(2810);
  });

  it('normalises contact details and keeps instructions', () => {
    const { order } = record();
    expect(order.contact).toEqual({
      name: 'Ali Khan',
      phone: '03001234567',
      email: 'ali@example.com',
    });
    expect(order.specialInstructions).toBe('ring twice');
  });

  it('stores null for missing optional details', () => {
    const { order } = record({
      contact: { name: 'Ali Khan', phone: '03001234567' },
      instructions: undefined,
    });
    expect(order.contact.email).toBeNull();
    expect(order.specialInstructions).toBeNull();
  });

  it('snapshots product lines with their variants, add-ons and note', () => {
    const [tikka] = record().order.items;
    expect(tikka).toMatchObject({
      productId: ids.tikka,
      dealId: null,
      name: 'Chicken Tikka',
      unitPrice: 730,
      quantity: 2,
      subtotal: 1460,
      note: 'no onions',
      variantSnapshot: [{ id: ids.half, name: 'Half', priceModifier: 330 }],
      addonSnapshot: [{ id: ids.raita, name: 'Raita', price: 50 }],
    });
  });

  it('snapshots deal lines with what is inside the deal', () => {
    const deal = record().order.items[1];
    expect(deal).toMatchObject({
      productId: null,
      dealId: ids.deal,
      name: 'Family Platter',
      unitPrice: 1350,
      subtotal: 1350,
      addonSnapshot: null,
      note: null,
      variantSnapshot: [
        { productName: 'Chicken Tikka', variantName: null, quantity: 2 },
        { productName: 'Naan', variantName: null, quantity: 4 },
      ],
    });
  });

  it('pays at the counter for pickup and has no address', () => {
    const { order } = record();
    expect(order.paymentMethod).toBe('CASH_AT_RESTAURANT');
    expect(order.deliveryAddress).toBeNull();
  });

  it('records a delivery address with the area name and cash on delivery', () => {
    const { order } = record({
      orderType: 'DELIVERY',
      zoneId: ids.zone,
      address: { line1: 'House 12, Street 4', line2: 'Near the park' },
    });
    expect(order.paymentMethod).toBe('COD');
    expect(order.deliveryAddress).toEqual({
      line1: 'House 12, Street 4',
      line2: 'Near the park',
      area: 'Johar Town',
      city: 'Lahore',
      zoneId: ids.zone,
    });
    // The food comes to Rs. 2,810, above the Rs. 2,000 free-delivery threshold for this area.
    expect(order.deliveryCharge).toBe(0);
  });

  it('uses null for a missing second address line', () => {
    const { order } = record({
      orderType: 'DELIVERY',
      zoneId: ids.zone,
      address: { line1: 'House 12, Street 4' },
    });
    expect(order.deliveryAddress?.line2).toBeNull();
  });

  it('refuses to build a delivery order without an address or area', () => {
    const request = placeOrderSchema.parse(
      raw({ orderType: 'DELIVERY', zoneId: ids.zone, address: { line1: 'House 12, Street 4' } }),
    );
    const data = quoteData();
    const quote = buildQuote(request, data, OPEN_NOW);
    const { address: _address, ...withoutAddress } = request;
    expect(() =>
      buildOrderRecord({
        quote,
        request: withoutAddress,
        data,
        customerId: null,
        orderNumber: 'X',
        now: OPEN_NOW,
      }),
    ).toThrow('needs an address');
    expect(() =>
      buildOrderRecord({
        quote,
        request,
        data: { ...data, zone: null },
        customerId: null,
        orderNumber: 'X',
        now: OPEN_NOW,
      }),
    ).toThrow('needs an address');
  });

  it('links an applied coupon and ignores a rejected one', () => {
    const applied = record({ couponCode: 'save100' }, quoteData({ coupon: coupon() }));
    expect(applied.order.couponId).toBe('coupon-1');
    expect(applied.order.couponDiscount).toBe(100);

    const rejected = record(
      { couponCode: 'save100' },
      quoteData({ coupon: coupon({ isActive: false }) }),
    );
    expect(rejected.order.couponId).toBeNull();
    expect(rejected.order.couponDiscount).toBe(0);
  });

  it('carries the customer link and the ready estimate', () => {
    const request = placeOrderSchema.parse(raw());
    const data = quoteData();
    const quote = buildQuote(request, data, OPEN_NOW);
    const order = buildOrderRecord({
      quote,
      request,
      data,
      customerId: ids.customer,
      orderNumber: 'BBQ-2026-0007',
      now: OPEN_NOW,
    });
    expect(order.customerId).toBe(ids.customer);
    // the deal (25 min) is the slowest line
    expect(order.estimatedReadyAt.getTime() - OPEN_NOW.getTime()).toBe(30 * 60_000);
  });
});
