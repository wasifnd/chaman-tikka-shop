import { describe, expect, it } from 'vitest';
import {
  mapStaffOrder,
  readAddress,
  toStaffEvent,
  type EventRow,
  type StaffOrderRow,
} from './staff-order.mapper';

const decimal = (value: string) => ({ toString: () => value });

const row: StaffOrderRow = {
  id: 'o1',
  orderNumber: 'BBQ-2026-0042',
  status: 'PREPARING',
  type: 'DELIVERY',
  createdAt: new Date('2026-10-16T14:00:00Z'),
  estimatedReadyAt: new Date('2026-10-16T14:30:00Z'),
  guestName: 'Ali Khan',
  guestPhone: '03001234567',
  deliveryAddressSnapshot: {
    line1: 'House 12, Street 4',
    line2: 'Near the park',
    area: 'Johar Town',
    city: 'Lahore',
  },
  specialInstructions: 'ring twice',
  subtotal: decimal('1460.00'),
  couponDiscount: decimal('0.00'),
  deliveryCharge: decimal('100.00'),
  taxAmount: decimal('0.00'),
  grandTotal: decimal('1560.00'),
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  items: [
    {
      productNameSnapshot: 'Chicken Tikka',
      variantSnapshot: [{ name: 'Half' }],
      addonSnapshot: [{ name: 'Raita' }],
      quantity: 2,
      note: 'no onions',
      dealId: null,
    },
    {
      productNameSnapshot: 'Family Platter',
      variantSnapshot: [{ productName: 'Naan', variantName: null, quantity: 4 }],
      addonSnapshot: null,
      quantity: 1,
      note: null,
      dealId: 'd1',
    },
  ],
  statusHistory: [],
};

describe('mapStaffOrder', () => {
  it('includes everything staff need to prepare, hand over and collect payment', () => {
    const order = mapStaffOrder(row);
    expect(order).toMatchObject({
      id: 'o1',
      orderNumber: 'BBQ-2026-0042',
      customerName: 'Ali Khan',
      phone: '03001234567',
      address: { line1: 'House 12, Street 4', line2: 'Near the park', area: 'Johar Town' },
      instructions: 'ring twice',
      grandTotal: 1560,
      deliveryCharge: 100,
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      estimatedReadyAt: '2026-10-16T14:30:00.000Z',
    });
  });

  it('describes items with options, notes and deal contents', () => {
    const { items } = mapStaffOrder(row);
    expect(items[0]).toEqual({
      name: 'Chicken Tikka',
      options: ['Half', 'Raita'],
      quantity: 2,
      note: 'no onions',
    });
    expect(items[1]?.options).toEqual(['4 × Naan']);
    expect(items[1]?.note).toBeNull();
  });

  it('has no address for pickup and copes with missing contact details', () => {
    const order = mapStaffOrder({
      ...row,
      type: 'PICKUP',
      deliveryAddressSnapshot: null,
      guestName: null,
      guestPhone: null,
      estimatedReadyAt: null,
    });
    expect(order.address).toBeNull();
    expect(order.customerName).toBe('Customer');
    expect(order.phone).toBe('');
    expect(order.estimatedReadyAt).toBeNull();
  });

  it('has no cancel reason unless the order was cancelled', () => {
    expect(mapStaffOrder(row).cancelReason).toBeNull();
  });

  it('shows the latest cancellation reason', () => {
    const order = mapStaffOrder({
      ...row,
      status: 'CANCELLED',
      statusHistory: [
        { status: 'RECEIVED', note: 'Order placed', createdAt: new Date('2026-10-16T14:00:00Z') },
        { status: 'CANCELLED', note: 'older', createdAt: new Date('2026-10-16T14:05:00Z') },
        {
          status: 'CANCELLED',
          note: 'Out of chicken',
          createdAt: new Date('2026-10-16T14:09:00Z'),
        },
      ],
    });
    expect(order.cancelReason).toBe('Out of chicken');
  });
});

describe('readAddress', () => {
  it('reads a complete address', () => {
    expect(readAddress({ line1: 'A', line2: null, area: 'Z' })).toEqual({
      line1: 'A',
      line2: null,
      area: 'Z',
    });
  });

  it.each([null, undefined, 'x', 3, {}, { line1: 'A' }, { area: 'Z' }, { line1: '', area: 'Z' }])(
    'returns null for %j',
    (value) => {
      expect(readAddress(value)).toBeNull();
    },
  );
});

describe('toStaffEvent', () => {
  const event = (overrides: Partial<EventRow> = {}): EventRow => ({
    id: 7n,
    type: 'order.status_changed',
    orderId: 'o1',
    payload: { status: 'CONFIRMED', at: '2026-10-16T14:00:00.000Z', from: 'RECEIVED' },
    order: { orderNumber: 'BBQ-2026-0042' },
    ...overrides,
  });

  it('adds the order id and number to the stored payload', () => {
    expect(toStaffEvent(event())).toEqual({
      id: 7,
      type: 'order.status_changed',
      payload: {
        type: 'order.status_changed',
        orderId: 'o1',
        orderNumber: 'BBQ-2026-0042',
        status: 'CONFIRMED',
        at: '2026-10-16T14:00:00.000Z',
      },
    });
  });

  it('handles new-order events', () => {
    expect(
      toStaffEvent(event({ type: 'order.created', payload: { status: 'RECEIVED', at: 'x' } }))
        ?.type,
    ).toBe('order.created');
  });

  it.each([
    ['unknown event type', event({ type: 'order.exploded' })],
    ['no status', event({ payload: { at: 'x' } })],
    ['unknown status', event({ payload: { status: 'TELEPORTED', at: 'x' } })],
    ['no time', event({ payload: { status: 'READY' } })],
    ['null payload', event({ payload: null })],
    ['string payload', event({ payload: 'oops' })],
  ])('skips a row with %s instead of breaking the stream', (_name, bad) => {
    expect(toStaffEvent(bad)).toBeNull();
  });
});
