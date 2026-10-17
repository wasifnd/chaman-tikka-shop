import { TERMINAL_STATUSES, type OrderStatus, type OrderType } from '../state-machine';
import type { OrderEventPayload, OrderSnapshot, TimelineEntry } from '../types/snapshot.types';

/** The steps a customer sees, in order. What happens after READY depends on how they get the food. */
export function stepsFor(type: OrderType): OrderStatus[] {
  const afterReady: Record<OrderType, OrderStatus[]> = {
    DELIVERY: ['OUT_FOR_DELIVERY', 'DELIVERED'],
    PICKUP: ['PICKED'],
    DINE_IN: ['SERVED'],
  };
  return ['RECEIVED', 'CONFIRMED', 'PREPARING', 'READY', ...afterReady[type]];
}

export type StepState = 'done' | 'current' | 'upcoming';

export interface ProgressStep {
  status: OrderStatus;
  state: StepState;
  /** When the order reached this step, if it has. */
  at: string | null;
}

/**
 * Where an order is on its journey. COMPLETED means every step is done. A cancelled order shows
 * the steps it did reach as done and nothing as current.
 */
export function buildProgress(
  type: OrderType,
  status: OrderStatus,
  timeline: readonly TimelineEntry[],
): ProgressStep[] {
  const steps = stepsFor(type);
  const reachedAt = new Map<OrderStatus, string>();
  for (const entry of timeline)
    if (!reachedAt.has(entry.status)) reachedAt.set(entry.status, entry.at);

  const currentIndex =
    status === 'COMPLETED'
      ? steps.length // everything done
      : status === 'CANCELLED'
        ? -1
        : steps.indexOf(status);

  return steps.map((step, index) => {
    const reached = reachedAt.get(step) ?? null;
    let state: StepState = 'upcoming';
    if (status === 'CANCELLED') state = reached ? 'done' : 'upcoming';
    else if (index < currentIndex) state = 'done';
    else if (index === currentIndex) state = 'current';
    return { status: step, state, at: reached };
  });
}

export const isFinished = (status: OrderStatus): boolean => TERMINAL_STATUSES.includes(status);

export type Connection = 'connecting' | 'live' | 'reconnecting' | 'offline';

export interface TrackingState {
  status: OrderStatus;
  timeline: TimelineEntry[];
  estimatedReadyAt: string | null;
  lastEventId: number;
  connection: Connection;
}

export function initialTracking(snapshot: OrderSnapshot): TrackingState {
  return {
    status: snapshot.status,
    timeline: snapshot.timeline,
    estimatedReadyAt: snapshot.estimatedReadyAt,
    lastEventId: snapshot.lastEventId,
    connection: 'connecting',
  };
}

export type TrackingAction =
  | { type: 'event'; id: number; payload: OrderEventPayload }
  | { type: 'snapshot'; snapshot: OrderSnapshot }
  | { type: 'connection'; connection: Connection };

export function trackingReducer(state: TrackingState, action: TrackingAction): TrackingState {
  switch (action.type) {
    case 'connection':
      return state.connection === action.connection
        ? state
        : { ...state, connection: action.connection };

    case 'event': {
      // Reconnects can replay an event; applying it twice must change nothing.
      if (action.id <= state.lastEventId) return state;
      const { status, at } = action.payload;
      const last = state.timeline.at(-1);
      const timeline =
        last?.status === status ? state.timeline : [...state.timeline, { status, at }];
      return { ...state, status, timeline, lastEventId: action.id };
    }

    case 'snapshot': {
      // An older snapshot (e.g. a slow poll that lost a race with the stream) must not roll back.
      if (action.snapshot.lastEventId < state.lastEventId) return state;
      return {
        ...state,
        status: action.snapshot.status,
        timeline: action.snapshot.timeline,
        estimatedReadyAt: action.snapshot.estimatedReadyAt,
        lastEventId: action.snapshot.lastEventId,
      };
    }
  }
}
