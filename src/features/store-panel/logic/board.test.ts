import { describe, expect, it } from 'vitest';
import {
  ORDER_STATUSES,
  ORDER_TYPES,
  allowedTransitions,
  type OrderStatus,
  type OrderType,
} from '@/features/orders/state-machine';
import type { StaffOrder } from '../types/staff-order.types';
import {
  COLUMNS,
  actionsFor,
  ageMinutes,
  formatAge,
  groupOrders,
  kitchenTickets,
  newOrderCount,
  urgencyFor,
  withStatus,
} from './board';

const T0 = Date.UTC(2026, 9, 16, 14, 0);
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

const order = (overrides: Partial<StaffOrder> = {}): StaffOrder => ({
  id: 'o1',
  orderNumber: 'BBQ-2026-0001',
  status: 'RECEIVED',
  type: 'DELIVERY',
  createdAt: at(0),
  estimatedReadyAt: at(30),
  customerName: 'Ali',
  phone: '0300',
  address: null,
  instructions: null,
  items: [],
  subtotal: 0,
  couponDiscount: 0,
  deliveryCharge: 0,
  taxAmount: 0,
  grandTotal: 0,
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  cancelReason: null,
  ...overrides,
});

describe('groupOrders', () => {
  it('puts every active status in exactly one column', () => {
    const covered = COLUMNS.flatMap((c) => c.statuses);
    const active = ORDER_STATUSES.filter((s) => s !== 'COMPLETED' && s !== 'CANCELLED');
    expect([...covered].sort()).toEqual([...active].sort());
    expect(new Set(covered).size).toBe(covered.length);
  });

  it('groups by status and sorts oldest first', () => {
    const grouped = groupOrders([
      order({ id: 'late', status: 'RECEIVED', createdAt: at(5) }),
      order({ id: 'early', status: 'RECEIVED', createdAt: at(1) }),
      order({ id: 'cooking', status: 'PREPARING' }),
      order({ id: 'accepted', status: 'CONFIRMED', createdAt: at(-3) }),
      order({ id: 'done-cooking', status: 'READY' }),
      order({ id: 'out', status: 'OUT_FOR_DELIVERY' }),
      order({ id: 'collected', status: 'PICKED', type: 'PICKUP' }),
    ]);
    expect(grouped.new.map((o) => o.id)).toEqual(['early', 'late']);
    expect(grouped.kitchen.map((o) => o.id)).toEqual(['accepted', 'cooking']);
    expect(grouped.ready.map((o) => o.id)).toEqual(['done-cooking']);
    expect(grouped.handover.map((o) => o.id).sort()).toEqual(['collected', 'out']);
  });

  it('ignores finished orders and works with none', () => {
    expect(groupOrders([order({ status: 'COMPLETED' }), order({ status: 'CANCELLED' })])).toEqual({
      new: [],
      kitchen: [],
      ready: [],
      handover: [],
    });
    expect(groupOrders([]).new).toEqual([]);
  });

  it('does not change the list it was given', () => {
    const list = [order({ id: 'b', createdAt: at(2) }), order({ id: 'a', createdAt: at(1) })];
    groupOrders(list);
    expect(list.map((o) => o.id)).toEqual(['b', 'a']);
  });
});

describe('kitchenTickets', () => {
  it('lists accepted orders that are not ready, oldest first', () => {
    const tickets = kitchenTickets([
      order({ id: 'new', status: 'RECEIVED' }),
      order({ id: 'b', status: 'PREPARING', createdAt: at(4) }),
      order({ id: 'a', status: 'CONFIRMED', createdAt: at(2) }),
      order({ id: 'ready', status: 'READY' }),
      order({ id: 'out', status: 'OUT_FOR_DELIVERY' }),
    ]);
    expect(tickets.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('actionsFor', () => {
  it('offers accept or reject for a new order', () => {
    expect(actionsFor(order({ status: 'RECEIVED' }))).toEqual([
      { to: 'CONFIRMED', label: 'CONFIRMED', tone: 'primary', needsReason: false },
      { to: 'CANCELLED', label: 'reject', tone: 'danger', needsReason: true },
    ]);
  });

  it('calls cancelling "cancel" once the order has been accepted', () => {
    const cancel = actionsFor(order({ status: 'PREPARING' })).find((a) => a.to === 'CANCELLED');
    expect(cancel).toMatchObject({ label: 'cancel', needsReason: true });
  });

  it('lists the forward step before cancelling', () => {
    const actions = actionsFor(order({ status: 'READY' }));
    expect(actions.at(-1)?.tone).toBe('danger');
    expect(actions[0]?.tone).toBe('primary');
  });

  it.each([
    ['DELIVERY', 'OUT_FOR_DELIVERY'],
    ['PICKUP', 'PICKED'],
    ['DINE_IN', 'SERVED'],
  ] as const)('sends a ready %s order to %s', (type, next) => {
    expect(actionsFor(order({ type, status: 'READY' })).map((a) => a.to)).toContain(next);
  });

  it('only offers completing once the order is handed over, with no cancelling', () => {
    expect(actionsFor(order({ status: 'DELIVERED' })).map((a) => a.to)).toEqual(['COMPLETED']);
    expect(actionsFor(order({ status: 'OUT_FOR_DELIVERY' })).map((a) => a.to)).toEqual([
      'DELIVERED',
    ]);
  });

  it('offers nothing for finished orders', () => {
    expect(actionsFor(order({ status: 'COMPLETED' }))).toEqual([]);
    expect(actionsFor(order({ status: 'CANCELLED' }))).toEqual([]);
  });

  it('never offers a move the state machine would refuse', () => {
    for (const type of ORDER_TYPES as readonly OrderType[]) {
      for (const status of ORDER_STATUSES as readonly OrderStatus[]) {
        const offered = actionsFor(order({ type, status })).map((a) => a.to);
        expect([...offered].sort()).toEqual([...allowedTransitions(type, status)].sort());
      }
    }
  });
});

describe('ageMinutes and formatAge', () => {
  it('counts whole minutes since the order was placed', () => {
    expect(ageMinutes(order({ createdAt: at(0) }), T0 + 7 * 60_000 + 59_000)).toBe(7);
  });

  it('is never negative if clocks disagree slightly', () => {
    expect(ageMinutes(order({ createdAt: at(5) }), T0)).toBe(0);
  });

  it.each([
    [0, 'just now'],
    [1, '1 min'],
    [59, '59 min'],
    [60, '1 h 00 min'],
    [65, '1 h 05 min'],
    [135, '2 h 15 min'],
  ])('formats %i minutes as "%s"', (minutes, expected) => {
    expect(formatAge(minutes)).toBe(expected);
  });
});

describe('urgencyFor', () => {
  const urgency = (o: Partial<StaffOrder>, minutesLater: number) =>
    urgencyFor(order(o), T0 + minutesLater * 60_000);

  it('escalates a new order nobody has accepted', () => {
    expect(urgency({ status: 'RECEIVED' }, 1)).toBe('ok');
    expect(urgency({ status: 'RECEIVED' }, 2)).toBe('warn');
    expect(urgency({ status: 'RECEIVED' }, 4)).toBe('warn');
    expect(urgency({ status: 'RECEIVED' }, 5)).toBe('late');
  });

  it('judges accepted orders against the promised ready time', () => {
    // promised at +30
    expect(urgency({ status: 'PREPARING' }, 10)).toBe('ok');
    expect(urgency({ status: 'PREPARING' }, 25)).toBe('warn');
    expect(urgency({ status: 'PREPARING' }, 30)).toBe('warn');
    expect(urgency({ status: 'PREPARING' }, 31)).toBe('late');
    expect(urgency({ status: 'CONFIRMED' }, 10)).toBe('ok');
    expect(urgency({ status: 'READY' }, 40)).toBe('late');
  });

  it('falls back to age when there is no estimate', () => {
    expect(urgency({ status: 'PREPARING', estimatedReadyAt: null }, 19)).toBe('ok');
    expect(urgency({ status: 'PREPARING', estimatedReadyAt: null }, 20)).toBe('warn');
    expect(urgency({ status: 'PREPARING', estimatedReadyAt: null }, 30)).toBe('late');
  });

  it('never alarms for orders already on their way or finished', () => {
    for (const status of [
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'PICKED',
      'SERVED',
      'COMPLETED',
      'CANCELLED',
    ] as const) {
      expect(urgency({ status }, 500)).toBe('ok');
    }
  });
});

describe('withStatus', () => {
  const list = [order({ id: 'a', status: 'RECEIVED' }), order({ id: 'b', status: 'PREPARING' })];

  it('changes only the chosen order', () => {
    const next = withStatus(list, 'a', 'CONFIRMED');
    expect(next.map((o) => [o.id, o.status])).toEqual([
      ['a', 'CONFIRMED'],
      ['b', 'PREPARING'],
    ]);
  });

  it('removes an order from the active list once it is finished', () => {
    expect(withStatus(list, 'b', 'COMPLETED').map((o) => o.id)).toEqual(['a']);
    expect(withStatus(list, 'a', 'CANCELLED').map((o) => o.id)).toEqual(['b']);
  });

  it('ignores an unknown order and leaves the original untouched', () => {
    expect(withStatus(list, 'zzz', 'READY')).toEqual(list);
    expect(list[0]?.status).toBe('RECEIVED');
  });
});

describe('newOrderCount', () => {
  it('counts only orders waiting to be accepted', () => {
    expect(
      newOrderCount([
        order({ status: 'RECEIVED' }),
        order({ status: 'RECEIVED' }),
        order({ status: 'PREPARING' }),
      ]),
    ).toBe(2);
    expect(newOrderCount([])).toBe(0);
  });
});
