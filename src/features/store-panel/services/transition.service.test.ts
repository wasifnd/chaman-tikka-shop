import { describe, expect, it } from 'vitest';
import {
  ORDER_STATUSES,
  ORDER_TYPES,
  allowedTransitions,
  type OrderStatus,
  type OrderType,
} from '@/features/orders/state-machine';
import { transitionRequestSchema } from '../schemas/transition.schema';
import { createFakeTransitionStore } from '../testing/fake-transition-store';
import { createTransitionService } from './transition.service';

const NOW = new Date('2026-10-16T14:00:00Z');
const staff = { userId: 'staff-1' };

function setup(
  type: OrderType = 'DELIVERY',
  status: OrderStatus = 'RECEIVED',
  failOnApply = false,
) {
  const fake = createFakeTransitionStore([{ id: 'o1', type, status }], { failOnApply });
  const service = createTransitionService(fake.store, () => NOW);
  const move = (to: OrderStatus, reason?: string) =>
    service.transition('o1', transitionRequestSchema.parse({ status: to, reason }), staff);
  return { fake, service, move };
}

async function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error('expected the promise to reject');
    },
    (error: unknown) =>
      error as { code: string; status: number; details?: Record<string, string>; message: string },
  );
}

describe('moving an order forward', () => {
  it('records the change, who made it and when', async () => {
    const { move, fake } = setup();
    const result = await move('CONFIRMED');

    expect(result).toEqual({
      id: 'o1',
      orderNumber: 'BBQ-o1',
      from: 'RECEIVED',
      to: 'CONFIRMED',
      at: NOW,
    });
    expect(fake.statusOf('o1')).toBe('CONFIRMED');
    expect(fake.state.history).toEqual([
      {
        orderId: 'o1',
        from: 'RECEIVED',
        to: 'CONFIRMED',
        userId: 'staff-1',
        note: null,
        at: NOW,
        markPaid: false,
      },
    ]);
  });

  it.each([
    ['DELIVERY', ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED']],
    ['PICKUP', ['CONFIRMED', 'PREPARING', 'READY', 'PICKED', 'COMPLETED']],
    ['DINE_IN', ['CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED']],
  ] as const)('walks a %s order from start to finish', async (type, journey) => {
    const { move, fake } = setup(type);
    for (const status of journey) await move(status);
    expect(fake.statusOf('o1')).toBe('COMPLETED');
    expect(fake.state.history).toHaveLength(journey.length);
    expect(fake.state.history.map((h) => h.to)).toEqual([...journey]);
  });

  it('marks the order paid only when it completes, since cash is collected then', async () => {
    const { move, fake } = setup('PICKUP', 'PICKED');
    expect(fake.state.orders.get('o1')?.paid).toBe(false);
    await move('COMPLETED');
    expect(fake.state.orders.get('o1')?.paid).toBe(true);
    expect(fake.state.history[0]?.markPaid).toBe(true);
  });

  it('does not mark an order paid on earlier steps', async () => {
    const { move, fake } = setup();
    await move('CONFIRMED');
    await move('PREPARING');
    expect(fake.state.orders.get('o1')?.paid).toBe(false);
  });
});

describe('refusing invalid moves', () => {
  it('rejects skipping steps, with the current status so the screen can refresh', async () => {
    const { move, fake } = setup();
    const error = await rejection(move('READY'));
    expect(error).toMatchObject({
      code: 'INVALID_TRANSITION',
      status: 409,
      details: { status: 'RECEIVED' },
    });
    expect(error.message).toContain('received');
    expect(fake.state.history).toHaveLength(0);
  });

  it('rejects moving backwards', async () => {
    const { move } = setup('DELIVERY', 'PREPARING');
    expect((await rejection(move('CONFIRMED'))).code).toBe('INVALID_TRANSITION');
  });

  it("rejects the wrong fulfilment path: a pickup can't go out for delivery", async () => {
    const { move } = setup('PICKUP', 'READY');
    expect((await rejection(move('OUT_FOR_DELIVERY'))).code).toBe('INVALID_TRANSITION');
  });

  it('rejects repeating the status the order is already in', async () => {
    const { move } = setup('DELIVERY', 'CONFIRMED');
    expect((await rejection(move('CONFIRMED'))).code).toBe('INVALID_TRANSITION');
  });

  it.each(['COMPLETED', 'CANCELLED'] as const)('treats %s as final', async (final) => {
    const { move } = setup('DELIVERY', final);
    for (const to of ORDER_STATUSES) {
      const error = await rejection(move(to, 'x'));
      expect(error.code).toBe('INVALID_TRANSITION');
    }
  });

  it('allows exactly the transitions the state machine allows, for every type and status', async () => {
    for (const type of ORDER_TYPES) {
      for (const from of ORDER_STATUSES) {
        const allowed = allowedTransitions(type, from);
        for (const to of ORDER_STATUSES) {
          const { move } = setup(type, from);
          const outcome = await move(to, 'reason').then(
            () => 'ok',
            (error: unknown) => (error as { code: string }).code,
          );
          expect(outcome).toBe(allowed.includes(to) ? 'ok' : 'INVALID_TRANSITION');
        }
      }
    }
  });

  it('says so when the order does not exist', async () => {
    const { service } = setup();
    const error = await rejection(service.transition('missing', { status: 'CONFIRMED' }, staff));
    expect(error).toMatchObject({ code: 'ORDER_NOT_FOUND', status: 404 });
  });

  it('refuses the second of two identical clicks, because the order already moved', async () => {
    const { move, fake } = setup();
    await move('CONFIRMED');
    const error = await rejection(move('CONFIRMED'));
    expect(error.code).toBe('INVALID_TRANSITION');
    expect(fake.state.history).toHaveLength(1);
  });
});

describe('cancelling', () => {
  it('needs a reason', async () => {
    const { move, fake } = setup();
    expect(await rejection(move('CANCELLED'))).toMatchObject({
      code: 'REASON_REQUIRED',
      status: 400,
    });
    expect(await rejection(move('CANCELLED', '   '))).toMatchObject({ code: 'REASON_REQUIRED' });
    expect(fake.statusOf('o1')).toBe('RECEIVED');
  });

  it('stores the reason with the change', async () => {
    const { move, fake } = setup();
    await move('CANCELLED', '  Out of chicken  ');
    expect(fake.state.history[0]).toMatchObject({ to: 'CANCELLED', note: 'Out of chicken' });
    expect(fake.state.orders.get('o1')?.paid).toBe(false);
  });

  it.each(['RECEIVED', 'CONFIRMED', 'PREPARING', 'READY'] as const)(
    'is allowed from %s',
    async (from) => {
      const { move, fake } = setup('DELIVERY', from);
      await move('CANCELLED', 'customer called');
      expect(fake.statusOf('o1')).toBe('CANCELLED');
    },
  );

  it('is not allowed once the food has left the kitchen', async () => {
    const { move } = setup('DELIVERY', 'OUT_FOR_DELIVERY');
    expect((await rejection(move('CANCELLED', 'too late'))).code).toBe('INVALID_TRANSITION');
  });

  it('ignores a reason on non-cancel moves rather than storing it', async () => {
    const { move, fake } = setup();
    await move('CONFIRMED', 'some note');
    expect(fake.state.history[0]?.note).toBeNull();
  });
});

describe('atomicity', () => {
  it('leaves the order unchanged if recording the change fails', async () => {
    const { move, fake } = setup('DELIVERY', 'RECEIVED', true);
    await expect(move('CONFIRMED')).rejects.toThrow('disk full');
    expect(fake.statusOf('o1')).toBe('RECEIVED');
    expect(fake.state.history).toHaveLength(0);
  });
});

describe('transitionRequestSchema', () => {
  it('accepts a status and an optional reason', () => {
    expect(transitionRequestSchema.parse({ status: 'CONFIRMED' })).toEqual({
      status: 'CONFIRMED',
      reason: undefined,
    });
    expect(
      transitionRequestSchema.parse({ status: 'CANCELLED', reason: '  no stock ' }).reason,
    ).toBe('no stock');
  });

  it('treats a blank reason as none', () => {
    expect(
      transitionRequestSchema.parse({ status: 'CANCELLED', reason: '   ' }).reason,
    ).toBeUndefined();
  });

  it.each([
    ['unknown status', { status: 'TELEPORTED' }],
    ['no status', {}],
    ['long reason', { status: 'CANCELLED', reason: 'x'.repeat(201) }],
    ['numeric status', { status: 3 }],
  ])('rejects %s', (_name, body) => {
    expect(transitionRequestSchema.safeParse(body).success).toBe(false);
  });
});
