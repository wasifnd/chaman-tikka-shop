'use client';

import { useEffect, useReducer, useRef } from 'react';
import type { OrderEventPayload, OrderSnapshot } from '../types/snapshot.types';
import {
  initialTracking,
  isFinished,
  trackingReducer,
  type TrackingAction,
  type TrackingState,
} from './order-progress';

export const POLL_INTERVAL_MS = 10_000;
/** The server ends each stream after ~25s and the browser reconnects: one error per cycle is normal. */
const NORMAL_ERRORS_PER_CYCLE = 1;
const GIVE_UP_AFTER_ERRORS = 3;

async function fetchSnapshot(token: string): Promise<OrderSnapshot | null> {
  try {
    const response = await fetch(`/api/v1/orders/${token}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: { order?: OrderSnapshot } };
    return body.data?.order ?? null;
  } catch {
    return null;
  }
}

/** Refreshes the order on a timer. Used when live updates can't connect. */
function startPolling(token: string, dispatch: (action: TrackingAction) => void): () => void {
  const timer = setInterval(() => {
    void fetchSnapshot(token).then((snapshot) => {
      if (snapshot) dispatch({ type: 'snapshot', snapshot });
    });
  }, POLL_INTERVAL_MS);
  return () => {
    clearInterval(timer);
  };
}

/**
 * Keeps an order up to date. Normally a live Server-Sent Events connection pushes changes the
 * moment they happen; if that keeps failing, it falls back to refreshing every few seconds.
 * Stops entirely once the order is finished.
 */
export function useOrderTracking(token: string, snapshot: OrderSnapshot): TrackingState {
  const [state, dispatch] = useReducer(trackingReducer, snapshot, initialTracking);
  const finished = isFinished(state.status);

  // The newest position, so a reconnect continues from there rather than from the first render.
  const position = useRef(state.lastEventId);
  useEffect(() => {
    position.current = state.lastEventId;
  }, [state.lastEventId]);

  useEffect(() => {
    if (finished) return;

    if (typeof EventSource === 'undefined') {
      dispatch({ type: 'connection', connection: 'offline' });
      return startPolling(token, dispatch);
    }

    let errors = 0;
    let stopPolling: (() => void) | undefined;
    const source = new EventSource(
      `/api/v1/orders/${token}/events?after=${String(position.current)}`,
    );

    source.onopen = () => {
      errors = 0;
      stopPolling?.();
      stopPolling = undefined;
      dispatch({ type: 'connection', connection: 'live' });
    };

    const onEvent = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as OrderEventPayload;
        dispatch({ type: 'event', id: Number(event.lastEventId), payload });
      } catch {
        // Ignore a malformed message rather than breaking the page.
      }
    };
    source.addEventListener('order.created', onEvent);
    source.addEventListener('order.status_changed', onEvent);

    source.onerror = () => {
      errors += 1;
      if (errors <= NORMAL_ERRORS_PER_CYCLE) return;
      if (errors < GIVE_UP_AFTER_ERRORS) {
        dispatch({ type: 'connection', connection: 'reconnecting' });
        return;
      }
      dispatch({ type: 'connection', connection: 'offline' });
      stopPolling ??= startPolling(token, dispatch);
    };

    return () => {
      source.close();
      stopPolling?.();
    };
  }, [token, finished]);

  return state;
}
