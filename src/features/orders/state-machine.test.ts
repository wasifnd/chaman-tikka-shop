import { describe, expect, it } from 'vitest';
import {
  ORDER_STATUSES,
  ORDER_TYPES,
  TERMINAL_STATUSES,
  InvalidTransitionError,
  allowedTransitions,
  assertTransition,
  canTransition,
} from './state-machine';

describe('order state machine', () => {
  it('walks a delivery order through its full happy path', () => {
    const path = [
      'RECEIVED',
      'CONFIRMED',
      'PREPARING',
      'READY',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'COMPLETED',
    ] as const;
    path.slice(0, -1).forEach((from, i) => {
      expect(canTransition('DELIVERY', from, path[i + 1] ?? from)).toBe(true);
    });
  });

  it('routes pickup and dine-in after READY correctly', () => {
    expect(allowedTransitions('PICKUP', 'READY')).toEqual(['PICKED', 'CANCELLED']);
    expect(allowedTransitions('DINE_IN', 'READY')).toEqual(['SERVED', 'CANCELLED']);
    expect(canTransition('PICKUP', 'PICKED', 'COMPLETED')).toBe(true);
    expect(canTransition('DINE_IN', 'SERVED', 'COMPLETED')).toBe(true);
  });

  it('rejects the wrong fulfilment branch', () => {
    expect(canTransition('PICKUP', 'READY', 'OUT_FOR_DELIVERY')).toBe(false);
    expect(canTransition('DELIVERY', 'READY', 'SERVED')).toBe(false);
  });

  it('rejects skipping steps and moving backwards', () => {
    expect(canTransition('DELIVERY', 'RECEIVED', 'PREPARING')).toBe(false);
    expect(canTransition('DELIVERY', 'PREPARING', 'CONFIRMED')).toBe(false);
  });

  it('allows cancelling only before the food leaves the kitchen', () => {
    for (const from of ['RECEIVED', 'CONFIRMED', 'PREPARING', 'READY'] as const) {
      expect(canTransition('DELIVERY', from, 'CANCELLED')).toBe(true);
    }
    expect(canTransition('DELIVERY', 'OUT_FOR_DELIVERY', 'CANCELLED')).toBe(false);
  });

  it('treats COMPLETED and CANCELLED as terminal for every order type', () => {
    for (const type of ORDER_TYPES) {
      for (const terminal of TERMINAL_STATUSES) {
        for (const to of ORDER_STATUSES) {
          expect(canTransition(type, terminal, to)).toBe(false);
        }
      }
    }
  });

  it('assertTransition throws a typed error for invalid moves', () => {
    expect(() => {
      assertTransition('DELIVERY', 'RECEIVED', 'DELIVERED');
    }).toThrow(InvalidTransitionError);
    expect(() => {
      assertTransition('DELIVERY', 'RECEIVED', 'CONFIRMED');
    }).not.toThrow();
  });
});
