import { describe, expect, it } from 'vitest';
import type { OrderSnapshot, TimelineEntry } from '../types/snapshot.types';
import {
  buildProgress,
  initialTracking,
  isFinished,
  stepsFor,
  trackingReducer,
  type TrackingState,
} from './order-progress';

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 16, 14, minutes)).toISOString();
const timeline = (...statuses: string[]): TimelineEntry[] =>
  statuses.map((status, i) => ({ status, at: at(i) }) as TimelineEntry);

describe('stepsFor', () => {
  it('ends each journey the right way for the order type', () => {
    expect(stepsFor('DELIVERY')).toEqual([
      'RECEIVED',
      'CONFIRMED',
      'PREPARING',
      'READY',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ]);
    expect(stepsFor('PICKUP').at(-1)).toBe('PICKED');
    expect(stepsFor('DINE_IN').at(-1)).toBe('SERVED');
  });
});

describe('buildProgress', () => {
  const states = (
    type: Parameters<typeof buildProgress>[0],
    status: Parameters<typeof buildProgress>[1],
    tl: TimelineEntry[] = [],
  ) => buildProgress(type, status, tl).map((s) => s.state);

  it('marks earlier steps done, the current one current and the rest upcoming', () => {
    expect(states('DELIVERY', 'PREPARING')).toEqual([
      'done',
      'done',
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
  });

  it('starts at the first step', () => {
    expect(states('PICKUP', 'RECEIVED')).toEqual([
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
  });

  it('shows the last step as current until the order is completed', () => {
    expect(states('PICKUP', 'PICKED').at(-1)).toBe('current');
  });

  it('marks everything done once completed', () => {
    expect(states('DELIVERY', 'COMPLETED').every((s) => s === 'done')).toBe(true);
  });

  it('shows only the steps reached as done when cancelled, with nothing current', () => {
    const result = states('DELIVERY', 'CANCELLED', timeline('RECEIVED', 'CONFIRMED', 'CANCELLED'));
    expect(result).toEqual(['done', 'done', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    expect(result).not.toContain('current');
  });

  it('attaches the time each step was reached', () => {
    const progress = buildProgress('PICKUP', 'CONFIRMED', timeline('RECEIVED', 'CONFIRMED'));
    expect(progress[0]).toMatchObject({ status: 'RECEIVED', at: at(0) });
    expect(progress[1]).toMatchObject({ status: 'CONFIRMED', at: at(1) });
    expect(progress[2]?.at).toBeNull();
  });

  it('uses the first time a status was reached if it appears twice', () => {
    const progress = buildProgress('PICKUP', 'CONFIRMED', [
      { status: 'CONFIRMED', at: at(5) },
      { status: 'CONFIRMED', at: at(9) },
    ]);
    expect(progress[1]?.at).toBe(at(5));
  });
});

describe('isFinished', () => {
  it('is true only for completed and cancelled orders', () => {
    expect(isFinished('COMPLETED')).toBe(true);
    expect(isFinished('CANCELLED')).toBe(true);
    expect(isFinished('READY')).toBe(false);
    expect(isFinished('RECEIVED')).toBe(false);
  });
});

describe('trackingReducer', () => {
  const snapshot: OrderSnapshot = {
    orderNumber: 'BBQ-2026-0001',
    status: 'RECEIVED',
    type: 'PICKUP',
    createdAt: at(0),
    estimatedReadyAt: at(30),
    areaName: null,
    items: [],
    subtotal: 0,
    couponDiscount: 0,
    deliveryCharge: 0,
    taxAmount: 0,
    grandTotal: 0,
    timeline: [{ status: 'RECEIVED', at: at(0) }],
    lastEventId: 3,
    serverTime: at(0),
  };
  const start = (): TrackingState => initialTracking(snapshot);
  const event = (id: number, status: TrackingState['status'], minutes = id) =>
    ({
      type: 'event',
      id,
      payload: { type: 'order.status_changed', status, at: at(minutes) },
    }) as const;

  it('starts from the snapshot and waits to connect', () => {
    expect(start()).toMatchObject({ status: 'RECEIVED', lastEventId: 3, connection: 'connecting' });
  });

  it('applies a newer event: new status, new timeline entry, new position', () => {
    const next = trackingReducer(start(), event(4, 'CONFIRMED'));
    expect(next.status).toBe('CONFIRMED');
    expect(next.timeline.map((t) => t.status)).toEqual(['RECEIVED', 'CONFIRMED']);
    expect(next.lastEventId).toBe(4);
  });

  it('ignores an event it has already seen, so replays after a reconnect change nothing', () => {
    const once = trackingReducer(start(), event(4, 'CONFIRMED'));
    expect(trackingReducer(once, event(4, 'CONFIRMED'))).toBe(once);
    expect(trackingReducer(once, event(2, 'RECEIVED'))).toBe(once);
  });

  it('does not duplicate a timeline entry when the same status arrives again', () => {
    const once = trackingReducer(start(), event(4, 'CONFIRMED'));
    const twice = trackingReducer(once, event(5, 'CONFIRMED'));
    expect(twice.timeline).toHaveLength(2);
    expect(twice.lastEventId).toBe(5);
  });

  it('follows a sequence of events through to the end', () => {
    let state = start();
    for (const [i, status] of (
      ['CONFIRMED', 'PREPARING', 'READY', 'PICKED', 'COMPLETED'] as const
    ).entries()) {
      state = trackingReducer(state, event(4 + i, status));
    }
    expect(state.status).toBe('COMPLETED');
    expect(state.timeline).toHaveLength(6);
  });

  it('takes a fresher snapshot, including a changed estimate', () => {
    const next = trackingReducer(start(), {
      type: 'snapshot',
      snapshot: { ...snapshot, status: 'PREPARING', lastEventId: 6, estimatedReadyAt: at(45) },
    });
    expect(next).toMatchObject({ status: 'PREPARING', lastEventId: 6, estimatedReadyAt: at(45) });
  });

  it('refuses a stale snapshot that would roll the order back', () => {
    const ahead = trackingReducer(start(), event(8, 'READY'));
    const next = trackingReducer(ahead, {
      type: 'snapshot',
      snapshot: { ...snapshot, lastEventId: 5 },
    });
    expect(next).toBe(ahead);
  });

  it('accepts a snapshot at the same position', () => {
    const next = trackingReducer(start(), {
      type: 'snapshot',
      snapshot: { ...snapshot, status: 'CONFIRMED' },
    });
    expect(next.status).toBe('CONFIRMED');
  });

  it('tracks the connection and avoids needless updates', () => {
    const live = trackingReducer(start(), { type: 'connection', connection: 'live' });
    expect(live.connection).toBe('live');
    expect(trackingReducer(live, { type: 'connection', connection: 'live' })).toBe(live);
  });
});
